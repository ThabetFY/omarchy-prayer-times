#!/bin/bash
set -uo pipefail
umask 077

# Messages are fixed plugin strings, never user or API input.
fail() { printf '{"error":"%s"}\n' "$1"; exit 1; }

for dependency in curl jq date head mktemp; do
  command -v "$dependency" >/dev/null 2>&1 || fail "Missing dependency: $dependency"
done
plugin_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
plugin_id=$(jq -er '.id' "$plugin_dir/manifest.json") || exit 1
config_file="${XDG_CONFIG_HOME:-$HOME/.config}/omarchy/shell.json"

# Bound even chunked responses; never follow redirects or accept non-HTTPS URLs.
curl_json() {
  local body LC_ALL=C
  body=$(curl -q -fsS --proto '=https' --connect-timeout 3 --max-time 8 \
    --max-filesize 65536 "$@" 2>/dev/null | head -c 65537) || return 1
  (( ${#body} <= 65536 )) || return 1
  printf '%s' "$body"
}

if [[ ${1:-} == --search ]]; then
  query=${2:-}
  language=${3:-ar}
  [[ $language =~ ^[a-z]{2,3}$ ]] || fail 'Invalid search language'
  [[ ${#query} -ge 2 && ${#query} -le 120 ]] || fail 'اكتب اسم مدينة (حرفان على الأقل)'
  # GeoNames misses common spellings and maps unvowelled Arabic to a Syrian
  # village. Resolve these names to Buraydah, Al-Qassim, Saudi Arabia explicitly.
  search_key=$(jq -Rr 'ascii_downcase | gsub("[\u064b-\u065f\u0640]"; "")' <<<"$query")
  country_filter=""
  case "$search_key" in
    buriadah|buraidah|buraydah|bureidah|buraida|burayda|"buraidah qassim"|"buraydah qassim"|"بريدة"|"بريده"|"بريدة القصيم")
      query="Buraydah"; country_filter="SA" ;;
  esac
  response=$(curl_json -G --data-urlencode "name=$query" --data "count=8&language=$language&format=json" \
    'https://geocoding-api.open-meteo.com/v1/search') || fail 'تعذر البحث عن المدن'
  jq -ce --arg country "$country_filter" '{cities: [(.results // [])[:8][] | select(
    ($country == "" or .country_code == $country) and
    (.name | type == "string" and length > 0 and length <= 120) and
    (.latitude | type == "number" and . >= -90 and . <= 90) and
    (.longitude | type == "number" and . >= -180 and . <= 180) and
    (.timezone | type == "string" and length <= 80 and test("^[A-Za-z0-9_+/-]+$") and (contains("..") | not))) |
    {name, latitude, longitude, timezone, country: ((.country // "")[:80]), region: ((.admin1 // "")[:80])}]}' <<<"$response" 2>/dev/null || {
      fail 'تعذر قراءة نتائج البحث'
  }
  exit 0
fi

state_dir="${XDG_STATE_HOME:-$HOME/.local/state}/omarchy/plugins/$plugin_id"
cache_file="$state_dir/timetable.json"
method="${1:-}"
if [[ -z $method && -f $config_file ]]; then
  method=$(jq -r --arg id "$plugin_id" '[.bar.layout | .[][] | select(.id == $id) | .calculationMethod // empty][0] // empty' "$config_file" 2>/dev/null)
fi
method="${method:-${PRAYER_METHOD:-3}}"
case "$method" in
  0|1|2|3|4|5|7|8|9|10|11|12|13|14|15|16|17|18|19|20|21|22|23) ;;
  *) fail 'طريقة حساب غير صالحة' ;;
esac
school=${3:-}
if [[ -z $school && -f $config_file ]]; then
  school=$(jq -r --arg id "$plugin_id" '[.bar.layout | .[][] | select(.id == $id) | .asrSchool // empty][0] // empty' "$config_file" 2>/dev/null)
fi
school=${school:-0}
[[ $school == 0 || $school == 1 ]] || fail 'Invalid Asr school'
city=${2:-}
if [[ -z $city && -f $config_file ]]; then
  city=$(jq -c --arg id "$plugin_id" '[.bar.layout | .[][] | select(.id == $id) | .city // empty][0] // null' "$config_file" 2>/dev/null)
fi
if [[ ${#city} -gt 2048 ]] || ! jq -e '
  type == "object" and (.name | type == "string" and length > 0 and length <= 120) and
  (.latitude | type == "number" and . >= -90 and . <= 90) and
  (.longitude | type == "number" and . >= -180 and . <= 180) and
  (.timezone | type == "string" and length > 0 and length <= 80 and test("^[A-Za-z0-9_+/-]+$") and (contains("..") | not))
' <<<"$city" >/dev/null 2>&1; then fail 'اختر مدينة لحساب مواقيت الصلاة'; fi
lat=$(jq -r .latitude <<<"$city")
lon=$(jq -r .longitude <<<"$city")
zone=$(jq -r .timezone <<<"$city")
[[ $zone != /* && -f /usr/share/zoneinfo/$zone ]] || fail 'منطقة زمنية غير صالحة'
city=$(jq -c '{name,latitude,longitude,timezone,
  country: (.country // "" | if type == "string" then .[:80] else "" end),
  region: (.region // "" | if type == "string" then .[:80] else "" end)}' <<<"$city")
day=$(TZ="$zone" date +%Y-%m-%d)
api_day=$(TZ="$zone" date +%d-%m-%Y)
fetch_timings() {
  local response
  response=$(curl_json -G --data-urlencode "latitude=$lat" --data-urlencode "longitude=$lon" \
    --data-urlencode "timezonestring=$zone" --data "method=$method" --data "school=$school" "https://api.aladhan.com/v1/timings/$1") || return 1
  jq -ce 'select(.code == 200) | .data.timings | {Fajr, Sunrise, Dhuhr, Asr, Maghrib, Isha} |
    select(all(.[]; type == "string" and length <= 64)) |
    with_entries(.value |= split(" ")[0]) |
    select(all(.[]; test("^([01][0-9]|2[0-3]):[0-5][0-9]$")))' <<<"$response" 2>/dev/null
}
timings=$(fetch_timings "$api_day") || fail 'تعذر جلب المواقيت'
# Interpret every wall-clock time in the selected city's timezone, including DST.
timestamps='{}'
for key in Fajr Sunrise Dhuhr Asr Maghrib Isha; do
  hhmm=$(jq -r --arg key "$key" '.[$key]' <<<"$timings")
  epoch=$(TZ="$zone" date -d "$day $hhmm" +%s) || fail 'تعذر جلب المواقيت'
  timestamps=$(jq -c --arg key "$key" --argjson epoch "$epoch" '. + {($key): ($epoch * 1000)}' <<<"$timestamps")
done
tomorrow=$(TZ="$zone" date -d "$day +1 day" +%Y-%m-%d)
expires=$(TZ="$zone" date -d "$tomorrow 00:00" +%s) || fail 'تعذر جلب المواقيت'
tomorrow_api=$(TZ="$zone" date -d "$tomorrow" +%d-%m-%Y)
tomorrow_timings=$(fetch_timings "$tomorrow_api") || fail 'تعذر جلب موعد فجر الغد'
fajr=$(jq -r '.Fajr' <<<"$tomorrow_timings")
next_fajr=$(TZ="$zone" date -d "$tomorrow $fajr" +%s) || fail 'تعذر جلب موعد فجر الغد'
updated=$(date +%s)
parsed=$(jq -cen --argjson city "$city" --argjson method "$method" --argjson school "$school" --argjson updated "$updated" --argjson timings "$timings" \
  --argjson times "$timestamps" --argjson expires "$expires" --argjson next "$next_fajr" --arg fajr "$fajr" \
  '{city: $city, method: $method, school: $school, updatedAt: ($updated * 1000), timings: $timings, timestamps: $times,
    expiresAt: ($expires * 1000), nextFajr: ($next * 1000), nextFajrTime: $fajr} |
    select([.timestamps | .Fajr, .Sunrise, .Dhuhr, .Asr, .Maghrib, .Isha] as $times |
      all(range(1;6); $times[.] > $times[. - 1]))') || fail 'تعذر جلب المواقيت'
mkdir -p "$state_dir" || fail 'تعذر حفظ المواقيت'
# Each monitor can fetch concurrently; do not share one temporary cache file.
cache_tmp=$(mktemp "$cache_file.XXXXXX") || fail 'تعذر حفظ المواقيت'
trap 'rm -f -- "$cache_tmp"' EXIT
if ! { printf '%s\n' "$parsed" >"$cache_tmp" && mv "$cache_tmp" "$cache_file"; }; then
  fail 'تعذر حفظ المواقيت'
fi
printf '%s\n' "$parsed"
