var PRAYER_ORDER = ["Fajr", "Sunrise", "Dhuhr", "Asr", "Maghrib", "Isha"]
var PRAYERS = ["Fajr", "Dhuhr", "Asr", "Maghrib", "Isha"]
// Labels live only in i18n/*.json. Custom method 99 needs extra API parameters.
var CALCULATION_METHODS = [3, 4, 1, 2, 5, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 7, 0]
var MAX_CITIES = 8
var TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/

function normalizedMethod(value) {
  var method = Number(value)
  return String(value) === String(method) && CALCULATION_METHODS.indexOf(method) >= 0 ? method : 3
}

function normalizedSchool(value) {
  return value === 1 || value === "1" ? 1 : 0
}

function normalizedCity(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null
  if (typeof value.name !== "string" || !value.name.trim() || value.name.length > 120) return null
  if (typeof value.latitude !== "number" || !isFinite(value.latitude) || Math.abs(value.latitude) > 90) return null
  if (typeof value.longitude !== "number" || !isFinite(value.longitude) || Math.abs(value.longitude) > 180) return null
  if (typeof value.timezone !== "string" || value.timezone.length > 80 ||
      !/^[A-Za-z0-9_+-][A-Za-z0-9_+/-]*$/.test(value.timezone) || value.timezone.indexOf("..") >= 0) return null
  return { name: value.name, latitude: value.latitude, longitude: value.longitude,
    timezone: value.timezone, country: typeof value.country === "string" ? value.country.slice(0, 80) : "",
    region: typeof value.region === "string" ? value.region.slice(0, 80) : "" }
}

function cityDetails(city) {
  if (!city) return ""
  return [city.region, city.country].filter(function(part) { return typeof part === "string" && part.length > 0 }).join(" · ") || city.timezone
}

function cityLabel(city) {
  return city.name + " · " + cityDetails(city)
}

function cityKey(value) {
  var city = normalizedCity(value)
  return city ? [city.latitude, city.longitude, city.timezone].join("|") : ""
}

function savedCities(value, legacyCity) {
  var source = Array.isArray(value) ? value.slice(0, MAX_CITIES) : [legacyCity]
  var result = []
  for (var i = 0; i < source.length; i++) {
    var city = normalizedCity(source[i])
    if (city && !result.some(function(existing) { return cityKey(existing) === cityKey(city) })) result.push(city)
  }
  return result
}

function activeCity(cities, preferred) {
  var key = cityKey(preferred)
  for (var i = 0; i < cities.length; i++) if (cityKey(cities[i]) === key) return cities[i]
  return cities.length ? cities[0] : null
}

function addCity(cities, value) {
  var city = normalizedCity(value)
  if (!city) return null
  var result = savedCities(cities, null)
  if (result.some(function(existing) { return cityKey(existing) === cityKey(city) })) return result
  if (result.length >= MAX_CITIES) return null
  return result.concat([city])
}

function removeCity(cities, key) {
  return savedCities(cities, null).filter(function(city) { return cityKey(city) !== key })
}

function usableSchedule(data, city, method, nowMs, school) {
  return !!(data && data.timestamps && cityKey(data.city) === cityKey(city) &&
    data.method === method && (data.school || 0) === normalizedSchool(school) && data.expiresAt > nowMs)
}

function scheduleStatus(schedule, running, failed, automatic) {
  if (running) return "refresh.loading"
  if (failed) return "status.failed"
  return schedule ? "status.ready" : automatic ? "status.empty" : "status.manual"
}

// Bounded retries also recover an initial offline launch without a shell restart.
function shouldRefresh(city, schedule, automatic, running, lastAttempt, nowMs) {
  return !!city && automatic && !running && (!schedule || schedule.expiresAt <= nowMs) &&
    nowMs - lastAttempt >= 300000
}

function parseCities(raw) {
  try {
    if (typeof raw !== "string" || raw.length > 16384) return { error: "نتائج بحث غير صالحة", cities: [] }
    var data = JSON.parse(raw)
    if (data && typeof data.error === "string") return { error: data.error.slice(0, 200), cities: [] }
    if (!data || !Array.isArray(data.cities) || data.cities.length > 8) return { error: "نتائج بحث غير صالحة", cities: [] }
    return { error: "", cities: data.cities.map(normalizedCity).filter(function(city) { return city !== null }) }
  } catch (e) { return { error: "تعذر قراءة نتائج البحث", cities: [] } }
}

function parseCache(raw) {
  try {
    if (typeof raw !== "string" || raw.length > 16384) return null
    var data = JSON.parse(raw)
    if (!data || typeof data !== "object" || Array.isArray(data)) return null
    if (typeof data.error === "string") return { error: data.error.slice(0, 200) }
    if (CALCULATION_METHODS.indexOf(data.method) < 0) return null
    if (data.school !== undefined && data.school !== 0 && data.school !== 1) return null
    var city = normalizedCity(data.city)
    if (!city || !data.timings || !data.timestamps || Array.isArray(data.timestamps)) return null
    if (typeof data.expiresAt !== "number" || !isFinite(data.expiresAt) || data.expiresAt <= 0 ||
        typeof data.nextFajr !== "number" || !isFinite(data.nextFajr) || data.nextFajr < data.expiresAt || data.nextFajr > data.expiresAt + 86400000 ||
        typeof data.nextFajrTime !== "string" || !TIME_PATTERN.test(data.nextFajrTime)) return null
    var updatedAt = data.updatedAt === undefined ? 0 : data.updatedAt
    if (typeof updatedAt !== "number" || !isFinite(updatedAt) || updatedAt < 0 || updatedAt > data.expiresAt) return null
    var result = { city: city, method: data.method, school: data.school || 0, updatedAt: updatedAt, timings: {}, timestamps: {},
      expiresAt: data.expiresAt, nextFajr: data.nextFajr, nextFajrTime: data.nextFajrTime }
    for (var i = 0; i < PRAYER_ORDER.length; i++) {
      var key = PRAYER_ORDER[i]
      var time = data.timings[key]
      var epoch = data.timestamps[key]
      if (typeof time !== "string" || !TIME_PATTERN.test(time) ||
          typeof epoch !== "number" || !isFinite(epoch) || epoch <= data.expiresAt - 93600000 || epoch >= data.expiresAt ||
          (i > 0 && epoch <= result.timestamps[PRAYER_ORDER[i - 1]])) return null
      result.timings[key] = time
      result.timestamps[key] = epoch
    }
    return result
  } catch (e) {
    return null
  }
}

// Position a scheduled prayer on the same midnight-to-midnight rail as Elsewhen.
function dayFraction(hhmm) {
  if (typeof hhmm !== "string" || !TIME_PATTERN.test(hhmm)) return 0
  var parts = hhmm.split(":")
  return (Number(parts[0]) * 60 + Number(parts[1])) / 1440
}

function nextPrayer(schedule, now) {
  if (!schedule || schedule.expiresAt <= now.getTime()) return null
  for (var i = 0; i < PRAYERS.length; i++) {
    var key = PRAYERS[i]
    var epoch = schedule.timestamps[key]
    if (epoch > now.getTime()) return { key: key, time: schedule.timings[key], date: new Date(epoch), tomorrow: false }
  }
  return schedule.nextFajr > now.getTime()
    ? { key: "Fajr", time: schedule.nextFajrTime, date: new Date(schedule.nextFajr), tomorrow: true } : null
}
