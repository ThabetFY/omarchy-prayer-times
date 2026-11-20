.pragma library

// One library instance per QML engine, shared by the widget on every monitor.
// Keep this ephemeral: a restarted widget starts checking from the current
// time and must not replay earlier alerts.
var recent = []

function claim(event, nowMs) {
  recent = recent.filter(function(item) { return item.prayerAt + 86400000 >= nowMs })
  if (recent.some(function(item) { return item.id === event.id })) return false
  recent.push({ id: event.id, prayerAt: event.prayerAt })
  if (recent.length > 64) recent.shift()
  return true
}
