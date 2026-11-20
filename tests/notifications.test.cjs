const assert = require("node:assert/strict")
const fs = require("node:fs")
const os = require("node:os")
const path = require("node:path")
const vm = require("node:vm")
const test = require("node:test")
const { spawnSync } = require("node:child_process")
const { root, model, city, schedule } = require("./helpers.cjs")

const settings = (extra = {}) => ({
  notificationEnabled: true, notificationScope: "all", ...extra,
  notificationAlerts: {
    before: { enabled: true, minutes: 10 }, at: { enabled: true }, ...extra.notificationAlerts
  }
})
const config = extra => model.notificationConfig(settings(extra))
const events = (data, options, previous, now) => Array.from(model.prayerAlerts(data, options, previous, now))

test("new per-prayer defaults select only at-time alerts and prefill distinct minute values", () => {
  const initial = model.notificationConfig({})
  assert.equal(initial.scope, "off")
  assert.equal(initial.alerts.at.enabled, true)
  assert.equal(initial.alerts.before.enabled, false)
  assert.equal(initial.alerts.iqama.enabled, false)
  assert.equal(model.notificationsActive(initial), false)
  const options = model.notificationConfig({ notificationEnabled: true, notificationScope: "each" })
  const data = schedule()
  for (const [key, before, iqama] of [
    ["Fajr", 15, 20], ["Dhuhr", 10, 10], ["Asr", 10, 10], ["Maghrib", 5, 5], ["Isha", 10, 15]
  ]) {
    const rule = model.notificationRule(options, key)
    assert.equal(rule.before.minutes, before, key)
    assert.equal(rule.iqama.minutes, iqama, key)
    assert.equal(rule.before.enabled, false, key)
    assert.equal(rule.at.enabled, true, key)
    assert.equal(rule.iqama.enabled, false, key)
    assert.equal(Object.keys(options.prayers[key]).length, 0)
    const at = data.timestamps[key]
    assert.equal(events(data, options, at - before * 60000 - 1, at - before * 60000).length, 0)
    assert.equal(events(data, options, at + iqama * 60000 - 1, at + iqama * 60000).length, 0)
    assert.equal(events(data, options, at - 1, at)[0].phase, "at")
  }
})

test("shared switches preserve per-prayer minute presets unless a shared minute is explicitly set", () => {
  const original = { notificationEnabled: true, notificationScope: "each" }
  const options = model.notificationConfig(original)
  const snapshot = JSON.stringify(options)
  const patch = model.notificationChange(options, "", "before", { enabled: true })
  assert.equal(JSON.stringify(options), snapshot)
  const updated = model.notificationConfig({ ...original, ...patch })
  assert.equal(model.notificationRule(updated, "Fajr").before.minutes, 15)
  assert.equal(model.notificationRule(updated, "Maghrib").before.minutes, 5)
  assert.equal(model.notificationRule(updated, "Maghrib").before.enabled, true)
  const sharedMinutes = model.notificationChange(updated, "", "before", { minutes: 8 })
  const shared = model.notificationConfig({ ...original, ...sharedMinutes })
  for (const key of model.PRAYERS) {
    assert.equal(model.notificationRule(shared, key).before.minutes, 8)
    assert.equal(model.notificationRule(shared, key).before.enabled, true)
  }
  const customized = model.notificationConfig({ ...original, ...sharedMinutes,
    prayerNotifications: { Fajr: { before: { minutes: 25 }, at: { enabled: false } } } })
  assert.equal(model.notificationRule(customized, "Fajr").before.minutes, 25)
  assert.equal(model.notificationRule(customized, "Fajr").at.enabled, false)
  assert.equal(model.notificationRule(customized, "Asr").at.enabled, true)
  const reset = model.resetPrayerNotifications(customized, "Fajr")
  const restored = model.notificationConfig({ ...original, ...sharedMinutes, ...reset })
  assert.equal(model.notificationRule(restored, "Fajr").before.minutes, 8)
  assert.equal(model.notificationRule(restored, "Fajr").iqama.minutes, 20)
  assert.equal(model.notificationRule(restored, "Fajr").at.enabled, true)
})

test("editing a prayer keeps its effective defaults and reset restores its preset", () => {
  const original = { notificationEnabled: true, notificationScope: "each" }
  const options = model.notificationConfig(original)
  const patch = model.notificationChange(options, "Fajr", "iqama", { enabled: true })
  assert.deepEqual(JSON.parse(JSON.stringify(patch.prayerNotifications.Fajr)), { iqama: { enabled: true } })
  const updated = model.notificationConfig({ ...original, ...patch })
  assert.equal(model.notificationRule(updated, "Fajr").before.minutes, 15)
  assert.equal(model.notificationRule(updated, "Fajr").iqama.minutes, 20)
  assert.equal(model.notificationRule(updated, "Fajr").iqama.enabled, true)
  assert.equal(model.notificationRule(updated, "Dhuhr").iqama.minutes, 10)
  const disabled = model.notificationConfig({ ...original, ...patch, notificationEnabled: false })
  assert.equal(model.notificationsActive(disabled), false)
  assert.equal(disabled.prayers.Fajr.iqama.enabled, true)
  const reset = model.resetPrayerNotifications(updated, "Fajr")
  const restored = model.notificationConfig({ ...original, ...reset })
  assert.equal(model.notificationRule(restored, "Fajr").iqama.minutes, 20)
  assert.equal(model.notificationRule(restored, "Fajr").iqama.enabled, false)
})

test("a per-prayer edit inherits later shared changes to untouched fields", () => {
  const original = { notificationEnabled: true, notificationScope: "each" }
  const patch = model.notificationChange(model.notificationConfig(original), "Fajr", "iqama", { enabled: true })
  const shared = { before: { enabled: true, minutes: 7 }, at: { enabled: false }, iqama: { enabled: false, minutes: 30 } }
  const updated = model.notificationConfig({ ...original, ...patch, notificationAlerts: shared })
  const fajr = model.notificationRule(updated, "Fajr")
  assert.equal(fajr.before.enabled, true)
  assert.equal(fajr.before.minutes, 7)
  assert.equal(fajr.at.enabled, false)
  assert.equal(fajr.iqama.enabled, true)
  assert.equal(fajr.iqama.minutes, 30)
  assert.equal(model.notificationRule(updated, "Asr").iqama.enabled, false)
  const minuteEdit = model.notificationChange(updated, "Fajr", "iqama", { minutes: 25 })
  assert.deepEqual(JSON.parse(JSON.stringify(minuteEdit.prayerNotifications.Fajr)), { iqama: { enabled: true, minutes: 25 } })
  const changedAgain = model.notificationConfig({ ...original, ...minuteEdit,
    notificationAlerts: { ...shared, iqama: { enabled: false, minutes: 35 } } })
  assert.equal(model.notificationRule(changedAgain, "Fajr").iqama.minutes, 25)
  assert.equal(model.notificationRule(changedAgain, "Asr").iqama.minutes, 35)
})

test("notifications are opt-in, bounded, and configurable globally or per prayer", () => {
  assert.equal(model.notificationConfig({}).scope, "off")
  assert.equal(model.notificationConfig({ notificationScope: "all" }).scope, "off")
  for (const value of ["all", "each", "off"])
    assert.equal(config({ notificationScope: value }).scope, value)
  assert.equal(config({ notificationScope: true }).scope, "off")
  for (const value of [1, 7, 10, 60, "15"])
    assert.equal(config({ notificationAlerts: { before: { minutes: value } } }).alerts.before.minutes, Number(value))
  for (const value of [0, -1, 61, NaN, Infinity, 2.5, "05", "bad", null])
    assert.equal(config({ notificationAlerts: { before: { minutes: value } } }).alerts.before.minutes, 10)
  const options = config({ notificationScope: "each", prayerNotifications: {
    Fajr: { before: { enabled: true, minutes: 30 }, at: { enabled: false } },
    Dhuhr: { before: { enabled: false }, at: { enabled: false }, iqama: { enabled: false } },
    Asr: { before: { enabled: false }, at: { enabled: true } },
    Maghrib: { before: { enabled: true, minutes: 5 }, at: { enabled: true } }
  } })
  for (const [key, before, at, minutes] of [["Fajr", true, false, 30], ["Dhuhr", false, false, 10],
    ["Asr", false, true, 10], ["Maghrib", true, true, 5], ["Isha", true, true, 10]]) {
    const rule = model.notificationRule(options, key)
    assert.equal(rule.before.enabled, before)
    assert.equal(rule.at.enabled, at)
    assert.equal(rule.iqama.enabled, false)
    assert.equal(rule.before.minutes, minutes)
  }
  options.scope = "all"
  assert.equal(model.notificationRule(options, "Dhuhr").at.enabled, true)
  options.scope = "off"
  assert.equal(model.notificationRule(options, "Fajr").before.enabled, false)
})

test("before, adhan and Iqama switches are independent and preserve per-prayer defaults", () => {
  const options = config({ notificationScope: "each", notificationAlerts: {
    before: { enabled: false, minutes: 7 }, at: { enabled: false }, iqama: { enabled: true, minutes: 20 }
  }, prayerNotifications: {
    Fajr: { before: { enabled: true, minutes: 25 }, iqama: { minutes: 30 } },
    Dhuhr: { before: { enabled: false }, at: { enabled: false }, iqama: { enabled: false } }
  } })
  const fajr = model.notificationRule(options, "Fajr")
  assert.equal(fajr.before.enabled, true)
  assert.equal(fajr.before.minutes, 25)
  assert.equal(fajr.at.enabled, false)
  assert.equal(fajr.iqama.enabled, true)
  assert.equal(fajr.iqama.minutes, 30)
  assert.equal(model.notificationRule(options, "Asr").iqama.minutes, 20)
  assert.equal(model.notificationRule(options, "Dhuhr").iqama.enabled, false)
  assert.equal(model.notificationsActive(options), true)
  const disabled = model.notificationConfig(settings({ notificationEnabled: false }))
  assert.equal(disabled.scope, "off")
  assert.equal(model.notificationsActive(disabled), false)
  assert.equal(model.notificationConfig(settings({ notificationEnabled: "true" })).scope, "off")
  assert.equal(model.notificationConfig(settings({ notificationEnabled: null })).scope, "off")
})

test("editing one switch or minute field leaves other prayers and settings unchanged", () => {
  const original = config({ notificationScope: "each" })
  const snapshot = JSON.stringify(original)
  const patch = model.notificationChange(original, "Fajr", "iqama", { enabled: true, minutes: 25 })
  const updated = config({ notificationScope: "each", ...patch })
  assert.equal(model.notificationRule(updated, "Fajr").iqama.enabled, true)
  assert.equal(model.notificationRule(updated, "Fajr").iqama.minutes, 25)
  assert.equal(model.notificationRule(updated, "Asr").iqama.enabled, false)
  assert.equal(JSON.stringify(original), snapshot)
  const reset = model.resetPrayerNotifications(updated, "Fajr")
  assert.equal(model.notificationRule(config({ notificationScope: "each", ...reset }), "Fajr").iqama.enabled, false)
  const global = model.notificationChange(original, "", "before", { enabled: false, minutes: 9 })
  assert.equal(global.notificationAlerts.before.minutes, 9)
  assert.equal(config(global).alerts.at.enabled, true)
  const minuteEdit = model.notificationChange(original, "Fajr", "before", { minutes: 25 })
  assert.deepEqual(JSON.parse(JSON.stringify(minuteEdit.prayerNotifications.Fajr)), { before: { minutes: 25 } })
  const newDefaults = config({ notificationScope: "each", ...minuteEdit,
    notificationAlerts: { at: { enabled: false } } })
  assert.equal(model.notificationRule(newDefaults, "Fajr").at.enabled, false)
  assert.equal(model.notificationRule(newDefaults, "Asr").at.enabled, false)
})

test("Iqama is a user-set delay after adhan, with its own deadline and deduplication key", () => {
  const data = schedule()
  const options = config({ notificationAlerts: { iqama: { enabled: true, minutes: 15 } } })
  const at = data.timestamps.Asr
  const before = events(data, options, at - 600001, at - 600000)[0]
  const adhan = events(data, options, at - 1, at)[0]
  const iqama = events(data, options, at + 900000 - 1, at + 900000)[0]
  assert.equal(iqama.phase, "iqama")
  assert.equal(iqama.minutes, 15)
  assert.equal(iqama.deadline, at + 900000)
  assert.notEqual(iqama.id, before.id)
  assert.notEqual(iqama.id, adhan.id)
  assert.equal(events(data, options, at + 900000 - 1, at + 961001).length, 0)
})

test("an armed Isha Iqama can cross midnight without reusing an expired timetable for other alerts", () => {
  const data = schedule()
  data.timestamps.Isha = data.expiresAt - 10 * 60000
  data.timings.Isha = "23:50"
  const options = config({ notificationAlerts: { iqama: { enabled: true, minutes: 20 } } })
  const at = data.expiresAt + 10 * 60000
  assert.equal(events(data, options, at - 1, at).length, 0)
  const carryover = Array.from(model.prayerAlerts(data, options, at - 1, at, true))
  assert.equal(carryover.length, 1)
  assert.equal(carryover[0].phase, "iqama")
  assert.equal(carryover[0].key, "Isha")
  assert.equal(model.pendingIqamaSchedule(data, data.expiresAt + 3660001), false)
})

test("alerts cross actual city timestamps, skip sunrise and keep before/at independent", () => {
  const data = schedule()
  const at = data.timestamps.Asr
  for (const [beforeEnabled, atEnabled] of [[true, false], [false, true], [true, true], [false, false]]) {
    const options = config({ notificationAlerts: {
      before: { enabled: beforeEnabled, minutes: 10 }, at: { enabled: atEnabled }
    } })
    const before = events(data, options, at - 600001, at - 600000)
    const started = events(data, options, at - 1, at + 500)
    assert.equal(before.length, beforeEnabled ? 1 : 0)
    assert.equal(started.length, atEnabled ? 1 : 0)
    if (before.length) {
      assert.equal(before[0].key, "Asr")
      assert.equal(before[0].phase, "before")
      assert.equal(before[0].time, data.timings.Asr)
    }
    if (started.length) assert.equal(started[0].phase, "at")
  }
  assert.equal(events(data, config(), data.timestamps.Sunrise - 1, data.timestamps.Sunrise).length, 0)
})

test("per-prayer timing, disabling and inheritance are used by the scheduler", () => {
  const data = schedule()
  const options = config({ notificationScope: "each", prayerNotifications: {
    Fajr: { before: { enabled: true, minutes: 30 }, at: { enabled: false } },
    Dhuhr: { before: { enabled: false }, at: { enabled: false }, iqama: { enabled: false } }
  } })
  assert.equal(events(data, options, data.timestamps.Fajr - 1800001, data.timestamps.Fajr - 1800000).length, 1)
  assert.equal(events(data, options, data.timestamps.Fajr - 600001, data.timestamps.Fajr - 600000).length, 0)
  assert.equal(events(data, options, data.timestamps.Dhuhr - 1, data.timestamps.Dhuhr).length, 0)
  assert.equal(events(data, options, data.timestamps.Isha - 1, data.timestamps.Isha).length, 1)
})

test("startup, stale caches, sleep, backwards clocks and overdue reminders do not replay alerts", () => {
  const data = schedule()
  const at = data.timestamps.Asr
  for (const [previous, now] of [[at, at + 1000], [at + 500, at + 1000], [at - 1, at + 60001],
    [at + 1, at], [NaN, at], [at - 1, Infinity]]) {
    assert.equal(events(data, config(), previous, now).length, 0)
  }
  assert.equal(events(null, config(), at - 1, at).length, 0)
  assert.equal(events(data, config(), data.expiresAt - 1, data.expiresAt).length, 0)
  assert.equal(events(data, config({ notificationAlerts: { before: { enabled: true, minutes: 1 } } }),
    at - 60001, at + 1).some(event => event.phase === "before"), false)
  assert.equal(events(data, model.notificationConfig({}), at - 1, at).length, 0)
  assert.equal(events(data, config(), at - 1, at + 60000).length, 1)
})

test("tomorrow's actual Fajr supports a reminder before city midnight", () => {
  const data = schedule()
  data.nextFajr = data.expiresAt + 5 * 60000
  data.nextFajrTime = "00:05"
  const before = data.nextFajr - 10 * 60000
  const alerts = events(data, config(), before - 1, before)
  assert.equal(alerts.length, 1)
  assert.equal(alerts[0].key, "Fajr")
  assert.equal(alerts[0].prayerAt, data.nextFajr)
  assert.equal(alerts[0].time, "00:05")
})

test("alert delivery is shared across screens and bounded without persisting user settings", () => {
  const context = vm.createContext({})
  vm.runInContext(fs.readFileSync(path.join(root, "AlertDelivery.js"), "utf8").replace(/^\.pragma library\s*/, ""), context)
  const data = schedule()
  const at = data.timestamps.Asr
  const event = events(data, config(), at - 1, at)[0]
  assert.equal(context.claim(event, at), true)
  assert.equal(context.claim(event, at + 1), false)
  const otherCity = events({ ...data, city: { ...city, latitude: 25 } }, config(), at - 1, at)[0]
  assert.equal(context.claim(otherCity, at), true)
  for (let i = 0; i < 200; i++) context.claim({ id: String(i), prayerAt: at }, at)
  assert.ok(context.recent.length <= 64)
})

test("notification text is bounded and neutralizes markup and encoded markup without shell parsing", () => {
  const title = "Time for Asr"
  const payload = '<a href="https://example.invalid">$(touch /tmp/not-a-command)</a> &lt;img src=x&gt;\u0000'
  const command = Array.from(model.notificationCommand(title, payload))
  assert.equal(command[0], "omarchy-notification-send")
  assert.equal(command.at(-2), title)
  assert.doesNotMatch(command.at(-1), /[<>&\u0000]/)
  assert.ok(command.at(-1).includes("$(touch /tmp/not-a-command)"))
  assert.ok(model.notificationCommand(title, "x".repeat(10000)).at(-1).length <= 500)
  assert.doesNotMatch(command.join("\n"), /bash|sh -c|--exec/)
})

test("option-looking notification titles and bodies remain bounded text", () => {
  for (const text of ["--exec", "--action", "--image=https://example.invalid/pixel# · 04:31",
    "--app-name=other", "--urgency=critical", "-p", "-" + "x".repeat(1000)]) {
    const command = Array.from(model.notificationCommand(text, text))
    for (const argument of command.slice(-2)) {
      assert.ok(argument.startsWith(" "), text)
      assert.equal(argument.trimStart(), text.slice(0, 499))
      assert.ok(argument.length <= 500)
    }
  }
})

const notificationSender = path.join(process.env.OMARCHY_PATH || "/usr/share/omarchy", "bin/omarchy-notification-send")
test("the installed notification wrapper receives text, not injected options or hints", {
  skip: !fs.existsSync(notificationSender) && "Requires an Omarchy installation"
}, t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "prayer-notification-test-"))
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }))
  const capture = path.join(dir, "argv")
  fs.writeFileSync(path.join(dir, "busctl"),
    '#!/bin/bash\nprintf "%s\\0" "$@" > "$NOTIFICATION_TEST_CAPTURE"\n', { mode: 0o700 })
  // Stub the D-Bus boundary: no desktop notification, process action or network request.
  for (const [title, body] of [
    ["Time for Fajr", "--image=https://example.invalid/pixel# · 04:31"],
    ["--app-name=other", "--image=/not-a-file"],
    ["--exec", "--exec"], ["-p", "--action"], ["--transient", "--urgency=critical"]
  ]) {
    const command = Array.from(model.notificationCommand(title, body))
    const result = spawnSync(notificationSender, command.slice(1), {
      env: { ...process.env, PATH: `${dir}:${process.env.PATH}`, NOTIFICATION_TEST_CAPTURE: capture },
      encoding: "utf8", timeout: 5000
    })
    assert.equal(result.status, 0, result.stderr)
    const sent = fs.readFileSync(capture, "utf8").split("\0").slice(0, -1)
    const signature = sent.indexOf("susssasa{sv}i")
    assert.ok(signature >= 0)
    assert.equal(sent[signature + 1], "Prayer Times")
    assert.equal(sent[signature + 4], command.at(-2))
    assert.equal(sent[signature + 5], command.at(-1))
    assert.deepEqual(sent.slice(signature + 6),
      ["0", "2", "urgency", "y", "1", "omarchy-glyph", "s", "", "-1"])
  }
})

test("custom audio accepts only bounded local audio paths and uses a fixed argv command", () => {
  for (const [value, expected] of [
    ["/home/test/alert.wav", "/home/test/alert.wav"],
    ["~/Sounds/my alert.ogg", "/home/test/Sounds/my alert.ogg"],
    ["file:///home/test/my%20alert.flac", "/home/test/my alert.flac"],
    ["/home/test/$(touch nope).mp3", "/home/test/$(touch nope).mp3"]
  ]) {
    assert.equal(model.localSoundPath(value, "/home/test"), expected)
    const command = Array.from(model.soundCommand(expected))
    assert.equal(command[0], "pw-play")
    assert.equal(command.at(-1), expected)
  }
  for (const value of ["https://example.invalid/audio.ogg", "file://host/audio.wav", "alert.wav", "-", "/a.sh",
    "/a.wav\n", "/x\0.wav", "file:///bad%zz.wav", "/a" + "x".repeat(4096) + ".wav", null])
    assert.equal(model.localSoundPath(value, "/home/test"), "")
})
