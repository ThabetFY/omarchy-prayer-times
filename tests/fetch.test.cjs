const assert = require("node:assert/strict")
const { spawnSync } = require("node:child_process")
const fs = require("node:fs")
const os = require("node:os")
const path = require("node:path")
const test = require("node:test")
const { root, city, schedule, model } = require("./helpers.cjs")

function fixture(t, method, asrSchool) {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "prayer-times-test-"))
  t.after(() => fs.rmSync(home, { recursive: true, force: true }))
  const config = path.join(home, "config")
  const state = path.join(home, "state")
  const bin = path.join(home, "bin")
  const cache = path.join(state, "omarchy/plugins/thabetfy.prayer-times/timetable.json")
  fs.mkdirSync(path.join(config, "omarchy"), { recursive: true })
  fs.mkdirSync(path.dirname(cache), { recursive: true })
  fs.mkdirSync(bin)
  fs.writeFileSync(path.join(config, "omarchy/shell.json"), JSON.stringify({
    bar: { layout: { centerEnd: [{ id: "thabetfy.prayer-times", city, calculationMethod: method, asrSchool }] } }
  }))
  const response = JSON.stringify({ code: 200, data: { timings: schedule().timings } })
  fs.writeFileSync(path.join(bin, "curl"), `#!/bin/bash
printf '%s\\n' "$@" >> "$HOME/requests"
if [[ "$*" == *geocoding-api* ]]; then
  if [[ "$*" == *name=Buraydah* ]]; then
    echo '{"results":[{"name":"Buraydah","latitude":26.32599,"longitude":43.97497,"timezone":"Asia/Riyadh","country_code":"SA"},{"name":"Namesake","latitude":35.9,"longitude":37.1,"timezone":"Asia/Damascus","country_code":"SY"}]}'
  else
    echo '${JSON.stringify({ results: [city] })}'
  fi
  exit
fi
case "$MOCK" in
  offline) exit 7 ;;
  oversize) head -c 70000 /dev/zero | tr '\\0' 'x'; exit ;;
  badtime) echo '${response}' | jq '.data.timings.Fajr = "<img src=x>"'; exit ;;
  badorder) echo '${response}' | jq '.data.timings.Asr = "01:00"'; exit ;;
esac
if [[ -f "$HOME/fetched" ]]; then
  [[ "$MOCK" == tomorrow-fail ]] && exit 7
  echo '${response}' | jq '.data.timings.Fajr = "04:44"'
else
  : > "$HOME/fetched"
  echo '${response}'
fi
`, { mode: 0o755 })
  const env = { ...process.env, HOME: home, XDG_CONFIG_HOME: config, XDG_STATE_HOME: state,
    PATH: `${bin}:${process.env.PATH}`, PRAYER_METHOD: "", MOCK: "" }
  return {
    home, cache, config,
    requests: () => fs.existsSync(path.join(home, "requests")) ? fs.readFileSync(path.join(home, "requests"), "utf8") : "",
    run: (args = [], overrides = {}) => spawnSync("bash", [path.join(root, "prayer-fetch.sh"), ...args], {
      env: { ...env, ...overrides }, encoding: "utf8", timeout: 5000
    })
  }
}

test("method precedence: explicit, saved, environment, default; zero remains valid", t => {
  for (const [saved, args, environment, expected] of [
    [5, ["4"], "1", 4], [4, [], "1", 4], [undefined, [], "2", 2],
    [undefined, [], "", 3], [0, [], "", 0]
  ]) {
    const f = fixture(t, saved)
    const result = f.run(args, { PRAYER_METHOD: environment })
    assert.equal(result.status, 0, result.stderr)
    assert.equal(JSON.parse(result.stdout).method, expected)
  }
})

test("invalid method, city, or timezone makes no network request", t => {
  const f = fixture(t)
  for (const method of ["4junk", "99", "6", "-1"]) assert.equal(f.run([method]).status, 1)
  for (const value of [{ ...city, latitude: 999 }, ...["../etc/passwd", "/etc/passwd", "Asia/Riyadh;echo bad", "Not/AZone"].map(timezone => ({ ...city, timezone }))])
    assert.equal(f.run(["4", JSON.stringify(value)]).status, 1)
  fs.writeFileSync(path.join(f.config, "omarchy/shell.json"), "{}")
  assert.equal(f.run(["4"]).status, 1)
  assert.equal(f.requests(), "")
})

test("fetch uses city epochs, tomorrow's distinct Fajr, safe requests, and private XDG cache", t => {
  const f = fixture(t)
  const result = f.run(["4", JSON.stringify(city)])
  assert.equal(result.status, 0, result.stderr)
  const data = model.parseCache(result.stdout)
  assert.ok(data, "Script output must pass the widget's real cache parser")
  assert.equal(new Date(data.timestamps.Fajr).getUTCHours(), 1)
  assert.equal(new Date(data.timestamps.Fajr).getUTCMinutes(), 31)
  assert.equal(data.nextFajrTime, "04:44")
  assert.equal(data.school, 0)
  assert.ok(data.updatedAt > Date.now() - 10000 && data.updatedAt <= Date.now())
  assert.equal(fs.statSync(f.cache).mode & 0o777, 0o600)
  assert.deepEqual(JSON.parse(fs.readFileSync(f.cache)), JSON.parse(result.stdout))
  const requests = f.requests()
  assert.ok(requests.startsWith("-q\n"), "Disable curl's user config before any other option")
  for (const flag of ["--proto\n=https", "--connect-timeout\n3", "--max-time\n8", "--max-filesize\n65536", "timezonestring=Asia/Riyadh"])
    assert.ok(requests.includes(flag), flag)
  assert.doesNotMatch(requests, /geocoding-api|--location/)
})

test("failed, oversized, and invalid responses preserve the old cache", t => {
  for (const MOCK of ["offline", "oversize", "badtime", "badorder", "tomorrow-fail"]) {
    const f = fixture(t)
    fs.writeFileSync(f.cache, "previous-cache")
    const result = f.run(["4"], { MOCK })
    assert.equal(result.status, 1, MOCK)
    assert.equal(JSON.parse(result.stdout).error, MOCK === "tomorrow-fail" ? "تعذر جلب موعد فجر الغد" : "تعذر جلب المواقيت", MOCK)
    assert.equal(result.stderr, "", MOCK)
    assert.equal(fs.readFileSync(f.cache, "utf8"), "previous-cache", MOCK)
  }
})

test("search is explicit, localized, bounded, and resolves Saudi Buraydah", t => {
  const f = fixture(t)
  for (const query of ["Riyadh", "buriadah", "Buraidah", "بريدة", "بُرَيدَة"]) {
    const result = f.run(["--search", query, "en"])
    assert.equal(result.status, 0, result.stderr)
    const cities = model.parseCities(result.stdout).cities
    assert.equal(cities.length, 1)
    assert.equal(cities[0].timezone, "Asia/Riyadh")
    if (query !== "Riyadh") assert.equal(cities[0].latitude, 26.32599)
  }
  for (const args of [["--search", "x"], ["--search", "x".repeat(121)], ["--search", "Riyadh", "invalid"]])
    assert.equal(f.run(args).status, 1)
  assert.match(f.requests(), /language=en/)
  assert.doesNotMatch(f.requests(), /aladhan/)
})

test("cache write errors are reported", t => {
  const f = fixture(t)
  const blocked = path.join(f.home, "blocked-state")
  fs.writeFileSync(blocked, "not a directory")
  const result = f.run(["4"], { XDG_STATE_HOME: blocked })
  assert.equal(result.status, 1)
  assert.ok(JSON.parse(result.stdout).error)
})

test("saved or explicit Asr school is sent for both days; invalid choices stay offline", t => {
  for (const [saved, args, expected] of [[1, ["4"], 1], [1, ["4", JSON.stringify(city), "0"], 0]]) {
    const f = fixture(t, 4, saved)
    const result = f.run(args)
    assert.equal(result.status, 0, result.stderr)
    assert.equal(model.parseCache(result.stdout).school, expected)
    assert.equal(f.requests().split(`school=${expected}`).length - 1, 2)
  }
  const f = fixture(t)
  for (const school of ["2", "01", "bad"])
    assert.equal(f.run(["4", JSON.stringify(city), school]).status, 1)
  assert.equal(f.requests(), "")
})
