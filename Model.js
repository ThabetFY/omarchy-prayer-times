var PRAYER_ORDER = ["Fajr", "Sunrise", "Dhuhr", "Asr", "Maghrib", "Isha"]
var PRAYERS = ["Fajr", "Dhuhr", "Asr", "Maghrib", "Isha"]
// Labels live only in i18n/*.json. Custom method 99 needs extra API parameters.
var CALCULATION_METHODS = [3, 4, 1, 2, 5, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 7, 0]
var MAX_CITIES = 8
var TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/
var ALERT_PHASES = ["before", "at", "iqama"]
var PRAYER_ALERT_MINUTES = {
  Fajr: { before: 15, iqama: 20 },
  Dhuhr: { before: 10, iqama: 10 },
  Asr: { before: 10, iqama: 10 },
  Maghrib: { before: 5, iqama: 5 },
  Isha: { before: 10, iqama: 15 }
}

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

function notificationMinutes(value, fallback) {
  var minutes = Number(value)
  return String(value) === String(minutes) && isFinite(minutes) &&
    Math.floor(minutes) === minutes && minutes >= 1 && minutes <= 60 ? minutes : fallback
}

function notificationConfig(settings) {
  settings = settings || {}
  var defaults = {
    before: { enabled: false, minutes: 10 },
    at: { enabled: true, minutes: 0 },
    iqama: { enabled: false, minutes: 15 }
  }
  var shared = notificationOverrides(settings.notificationAlerts)
  var alerts = mergeNotificationAlerts(defaults, shared)
  var raw = settings.prayerNotifications
  var prayers = {}
  for (var i = 0; i < PRAYERS.length; i++) {
    var key = PRAYERS[i]
    var entry = raw && typeof raw === "object" && !Array.isArray(raw) ? raw[key] : null
    prayers[key] = notificationOverrides(entry)
  }
  return {
    scope: settings.notificationEnabled === true &&
      (settings.notificationScope === "all" || settings.notificationScope === "each") ? settings.notificationScope : "off",
    alerts: alerts,
    shared: shared,
    prayers: prayers
  }
}

function notificationOverrides(value) {
  var result = {}
  if (!value || typeof value !== "object" || Array.isArray(value)) return result
  for (var i = 0; i < ALERT_PHASES.length; i++) {
    var phase = ALERT_PHASES[i]
    var entry = value[phase]
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) continue
    var rule = {}
    if (typeof entry.enabled === "boolean") rule.enabled = entry.enabled
    var minutes = notificationMinutes(entry.minutes, null)
    if (phase !== "at" && minutes !== null) rule.minutes = minutes
    if (Object.keys(rule).length) result[phase] = rule
  }
  return result
}

function mergeNotificationAlerts(defaults, overrides) {
  var result = {}
  for (var i = 0; i < ALERT_PHASES.length; i++) {
    var phase = ALERT_PHASES[i]
    result[phase] = Object.assign({}, defaults[phase], overrides[phase] || {})
  }
  return result
}

function prayerNotificationDefaults(config, key) {
  var minutes = PRAYER_ALERT_MINUTES[key]
  if (!minutes) return config.alerts
  var defaults = mergeNotificationAlerts(config.alerts, {
    before: { minutes: minutes.before }, iqama: { minutes: minutes.iqama }
  })
  return mergeNotificationAlerts(defaults, config.shared)
}

function notificationRule(config, key) {
  var defaults = config.scope === "each" ? prayerNotificationDefaults(config, key) : config.alerts
  var rules = mergeNotificationAlerts(defaults, config.scope === "each" ? config.prayers[key] || {} : {})
  if (config.scope === "off")
    for (var i = 0; i < ALERT_PHASES.length; i++) rules[ALERT_PHASES[i]].enabled = false
  return rules
}

function notificationsActive(config) {
  return PRAYERS.some(function(key) {
    var rules = notificationRule(config, key)
    return ALERT_PHASES.some(function(phase) { return rules[phase].enabled })
  })
}

// Return a settings patch without mutating other prayers or the active config.
function notificationChange(config, prayer, phase, values) {
  if (ALERT_PHASES.indexOf(phase) < 0 || (prayer && PRAYERS.indexOf(prayer) < 0)) return {}
  var target = JSON.parse(JSON.stringify(prayer ? config.prayers : config.shared))
  var rules = prayer ? target[prayer] : target
  var rule = Object.assign({}, rules[phase] || {})
  if (typeof values.enabled === "boolean") rule.enabled = values.enabled
  var minutes = notificationMinutes(values.minutes, null)
  if (phase !== "at" && minutes !== null) rule.minutes = minutes
  rules[phase] = rule
  return prayer ? { prayerNotifications: target } : { notificationAlerts: target }
}

function resetPrayerNotifications(config, prayer) {
  var prayers = JSON.parse(JSON.stringify(config.prayers))
  if (PRAYERS.indexOf(prayer) >= 0) prayers[prayer] = {}
  return { prayerNotifications: prayers }
}

function alertDeadline(prayerAt, phase, minutes) {
  return prayerAt + (phase === "before" ? -minutes * 60000 : phase === "iqama" ? minutes * 60000 : 0)
}

// An already active widget can keep yesterday's final Iqama reminder across
// midnight. This never makes an expired timetable current in the UI.
function pendingIqamaSchedule(schedule, nowMs) {
  return schedule && isFinite(nowMs) && schedule.expiresAt <= nowMs &&
    nowMs <= schedule.expiresAt + 3660000
}

// Cross deadlines rather than checking nextPrayer: at the exact prayer time,
// nextPrayer has already advanced. Skip old alarms after sleep or clock jumps.
function prayerAlerts(schedule, config, previousMs, nowMs, carryover) {
  if (!schedule || !isFinite(previousMs) || !isFinite(nowMs) ||
      nowMs <= previousMs || config.scope === "off") return []
  var expired = schedule.expiresAt <= nowMs
  if (expired && !(carryover === true && pendingIqamaSchedule(schedule, nowMs))) return []
  var result = []
  var prayers = PRAYERS.map(function(key) {
    return { key: key, prayerAt: schedule.timestamps[key], time: schedule.timings[key] }
  })
  if (!expired) prayers.push({ key: "Fajr", prayerAt: schedule.nextFajr, time: schedule.nextFajrTime })
  for (var i = 0; i < prayers.length; i++) {
    var prayer = prayers[i]
    var rules = notificationRule(config, prayer.key)
    for (var p = 0; p < ALERT_PHASES.length; p++) {
      var phase = ALERT_PHASES[p]
      var rule = rules[phase]
      if (!rule.enabled || (expired && phase !== "iqama")) continue
      var deadline = alertDeadline(prayer.prayerAt, phase, rule.minutes)
      if (previousMs < deadline && deadline <= nowMs && nowMs - deadline <= 60000 &&
          (phase !== "before" || nowMs < prayer.prayerAt)) {
        result.push({
          id: [cityKey(schedule.city), prayer.key, prayer.prayerAt, phase].join("|"),
          key: prayer.key, phase: phase, prayerAt: prayer.prayerAt,
          deadline: deadline, minutes: rule.minutes, time: prayer.time
        })
      }
    }
  }
  return result
}

// The sender parses options in both text positions; the desktop may render markup.
function notificationText(value) {
  return String(value || "").replace(/^-/, " -").slice(0, 500)
    .replace(/&/g, "＆").replace(/</g, "＜").replace(/>/g, "＞")
    .replace(/[\u0000-\u001f\u007f]/g, " ")
}

function notificationCommand(title, body) {
  return ["omarchy-notification-send", "--app-name", "Prayer Times", "-g", "",
    "-u", "normal", notificationText(title), notificationText(body)]
}

function localSoundPath(value, home) {
  if (typeof value !== "string" || value.length > 4096 || /[\u0000-\u001f\u007f]/.test(value)) return ""
  var path = value
  if (path.indexOf("file:///") === 0) {
    try { path = decodeURIComponent(path.slice(7)) } catch (e) { return "" }
  } else if (path.indexOf("~/") === 0 && typeof home === "string") {
    path = home + path.slice(1)
  }
  return path.charAt(0) === "/" && path.indexOf("//") !== 0 &&
    !/[\u0000-\u001f\u007f]/.test(path) && /\.(wav|ogg|oga|flac|mp3)$/i.test(path) ? path : ""
}

function soundCommand(path) {
  return ["pw-play", "--media-role", "Notification", "--", path]
}
