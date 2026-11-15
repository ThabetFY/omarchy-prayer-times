const fs = require("node:fs")
const path = require("node:path")
const vm = require("node:vm")
const root = path.join(__dirname, "..")
function load(name) {
  const context = vm.createContext({})
  vm.runInContext(fs.readFileSync(path.join(root, name), "utf8"), context)
  return context
}
const model = load("Model.js")
const city = { name: "Riyadh", latitude: 24.7, longitude: 46.7, timezone: "Asia/Riyadh" }
function schedule() {
  const times = ["04:31", "05:46", "11:42", "15:06", "17:37", "18:48"]
  return {
    city, method: 4,
    timings: Object.fromEntries(model.PRAYER_ORDER.map((key, i) => [key, times[i]])),
    timestamps: Object.fromEntries(model.PRAYER_ORDER.map((key, i) => [key, Date.parse(`2026-11-06T${times[i]}:00+03:00`)])),
    expiresAt: Date.parse("2026-11-07T00:00:00+03:00"),
    nextFajr: Date.parse("2026-11-07T04:44:00+03:00"), nextFajrTime: "04:44"
  }
}
module.exports = { root, model, language: load("Language.js"), city, schedule }
