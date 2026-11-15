const assert = require("node:assert/strict")
const test = require("node:test")
const { model, city, schedule } = require("./helpers.cjs")

test("calculation methods accept exact supported IDs, including zero", () => {
  for (const id of model.CALCULATION_METHODS) {
    assert.equal(model.normalizedMethod(id), id)
    assert.equal(model.normalizedMethod(String(id)), id)
  }
  for (const value of [undefined, null, "", "4junk", "0x4", false, -1, 6, 99])
    assert.equal(model.normalizedMethod(value), 3)
})

test("cities are validated, deduplicated, bounded, and selected safely", () => {
  for (const value of [{}, { ...city, latitude: NaN }, { ...city, latitude: 91 },
    { ...city, longitude: Infinity }, { ...city, timezone: "../etc/passwd" },
    { ...city, timezone: "/etc/passwd" }, { ...city, name: "x".repeat(121) }])
    assert.equal(model.normalizedCity(value), null)
  assert.equal(model.savedCities(undefined, city).length, 1) // Single-city migration.
  assert.equal(model.savedCities([city, city, {}], null).length, 1)
  const cities = Array.from({ length: 9 }, (_, latitude) => ({ ...city, latitude }))
  const saved = model.savedCities(cities, null)
  assert.equal(saved.length, 8)
  assert.equal(model.addCity(saved, cities[8]), null)
  assert.equal(model.addCity(saved, saved[0]).length, 8)
  assert.equal(model.activeCity(model.removeCity(saved, model.cityKey(saved[0])), saved[0]).latitude, 1)
  assert.equal(model.activeCity([], city), null)
})

test("search results reject malformed data but render city names as data", () => {
  const markup = '<img src="https://example.invalid/tracker">'
  const result = model.parseCities(JSON.stringify({ cities: [{ ...city, name: markup }] }))
  assert.equal(result.cities[0].name, markup)
  for (const raw of ["invalid", "null", "[]", JSON.stringify({ cities: Array(9).fill(city) }), " ".repeat(16385)])
    assert.equal(model.parseCities(raw).cities.length, 0)
  assert.equal(model.parseCities('{"error":"offline"}').error, "offline")
  assert.equal(model.cityLabel({ ...city, region: "Qassim", country: "SA" }), "Riyadh · Qassim · SA")
})

test("cache accepts only complete, bounded, chronologically ordered schedules", () => {
  const data = schedule()
  const parsed = model.parseCache(JSON.stringify({ ...data, location: "Legacy field", command: "ignored" }))
  assert.equal(parsed.command, undefined)
  assert.equal(parsed.location, undefined)
  const invalid = [null, [], {}, { ...data, city: null }, { ...data, method: "4" },
    { ...data, method: 99 }, { ...data, expiresAt: "invalid" }, { ...data, nextFajr: 0 },
    { ...data, nextFajrTime: "24:00" }, { ...data, timestamps: {} },
    ...["04:99", "<img src=x>", null].map(Fajr => ({ ...data, timings: { ...data.timings, Fajr } })),
    { ...data, timestamps: { ...data.timestamps, Asr: data.timestamps.Fajr } }]
  for (const value of invalid) assert.equal(model.parseCache(JSON.stringify(value)), null)
  assert.equal(model.parseCache(" ".repeat(16385)), null)
  assert.equal(model.parseCache(JSON.stringify({ error: "x".repeat(1000) })).error.length, 200)
})

test("next prayer uses city epochs, skips sunrise, and uses tomorrow's actual Fajr", () => {
  const data = schedule()
  for (const [at, expected, tomorrow] of [
    ["2026-11-06T00:00Z", "Fajr", false],
    ["2026-11-06T01:31Z", "Dhuhr", false],
    ["2026-11-06T17:00Z", "Fajr", true]
  ]) {
    const next = model.nextPrayer(data, new Date(at))
    assert.equal(next.key, expected)
    assert.equal(next.tomorrow, tomorrow)
    assert.equal(next.date.getTime(), tomorrow ? data.nextFajr : data.timestamps[expected])
    if (tomorrow) assert.equal(next.time, "04:44")
  }
  assert.equal(model.nextPrayer(data, new Date(data.expiresAt)), null)
  assert.equal(model.nextPrayer(null, new Date()), null)
  assert.equal(model.usableSchedule(data, city, 4, data.expiresAt - 1), true)
  assert.equal(model.usableSchedule(data, { ...city, latitude: 0 }, 4, 0), false)
  assert.equal(model.usableSchedule(data, city, 3, 0), false)
})

test("automatic retries are bounded and respect manual-only mode", () => {
  assert.equal(model.shouldRefresh(city, null, true, false, 1000, 301000), true)
  for (const args of [[city, null, true, false, 1000, 300999], [city, null, false, false, 0, 900000],
    [null, null, true, false, 0, 900000], [city, null, true, true, 0, 900000],
    [city, { expiresAt: 900001 }, true, false, 0, 900000]])
    assert.equal(model.shouldRefresh(...args), false)
  for (const [time, fraction] of [["00:00", 0], ["12:00", 0.5], ["18:00", 0.75], ["bad", 0]])
    assert.equal(model.dayFraction(time), fraction)
})

test("Asr school defaults safely and cannot reuse the other school's cache", () => {
  for (const value of [1, "1"]) assert.equal(model.normalizedSchool(value), 1)
  for (const value of [undefined, null, 0, "0", "01", 2]) assert.equal(model.normalizedSchool(value), 0)
  const data = schedule()
  const now = data.expiresAt - 1
  assert.equal(model.parseCache(JSON.stringify(data)).updatedAt, 0) // Do not invent legacy fetch times.
  assert.equal(model.usableSchedule(data, city, 4, now, 0), true) // Legacy cache is Standard.
  assert.equal(model.usableSchedule(data, city, 4, now, 1), false)
  data.school = 1
  assert.equal(model.usableSchedule(data, city, 4, now, 1), true)
  assert.equal(model.usableSchedule(data, city, 4, now, 0), false)
  for (const fields of [{ school: 2 }, { school: "1" }, { updatedAt: "invalid" }, { updatedAt: data.expiresAt + 1 }])
    assert.equal(model.parseCache(JSON.stringify({ ...data, ...fields })), null)
  const parsed = model.parseCache(JSON.stringify({ ...data, updatedAt: now }))
  assert.equal(parsed.school, 1)
  assert.equal(parsed.updatedAt, now)
})

test("status distinguishes fetching, failure, cached, empty, and manual-only", () => {
  for (const [data, running, failed, automatic, expected] of [
    [schedule(), true, true, true, "refresh.loading"],
    [schedule(), false, true, true, "status.failed"],
    [schedule(), false, false, false, "status.ready"],
    [null, false, false, true, "status.empty"],
    [null, false, false, false, "status.manual"]
  ]) assert.equal(model.scheduleStatus(data, running, failed, automatic), expected)
})
