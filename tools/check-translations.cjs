#!/usr/bin/env node
const assert = require("node:assert/strict")
const fs = require("node:fs")
const path = require("node:path")
const vm = require("node:vm")
const root = path.join(__dirname, "..")
const language = vm.createContext({})
vm.runInContext(fs.readFileSync(path.join(root, "Language.js"), "utf8"), language)
const dir = path.join(root, "i18n")
const raw = fs.readFileSync(path.join(dir, "languages.json"), "utf8")
const registry = JSON.parse(raw)
assert.ok(Array.isArray(registry) && registry.length > 0, "Register at least English")
assert.equal(language.parseRegistry(raw).length, registry.length, "Invalid or duplicate registry entries")
assert.ok(registry.some(entry => entry.code === "en"), "English fallback is required")
const english = JSON.parse(fs.readFileSync(path.join(dir, "en.json"), "utf8"))
const model = vm.createContext({})
vm.runInContext(fs.readFileSync(path.join(root, "Model.js"), "utf8"), model)
for (const key of [...model.PRAYER_ORDER, ...model.CALCULATION_METHODS.map(id => `method.${id}`)])
  assert.ok(Object.hasOwn(english, key), `Missing English key: ${key}`)
const placeholders = text => (text.match(/%\d+/g) || []).sort()
for (const entry of registry) {
  const source = fs.readFileSync(path.join(dir, entry.code + ".json"), "utf8")
  assert.ok(source.length <= 65536, `${entry.code}: catalog exceeds 64 KiB`)
  const catalog = JSON.parse(source)
  assert.ok(catalog && typeof catalog === "object" && !Array.isArray(catalog), entry.code)
  for (const [key, text] of Object.entries(catalog)) {
    assert.ok(Object.hasOwn(english, key), `${entry.code}: unknown key ${key}`)
    assert.ok(typeof text === "string" && text.trim(), `${entry.code}: empty/non-string translation ${key}`)
    assert.deepEqual(placeholders(text), placeholders(english[key]), `${entry.code}: placeholders differ in ${key}`)
  }
  console.log(`${entry.code}: ${Object.keys(catalog).length}/${Object.keys(english).length} keys (missing keys fall back)`)
}
for (const file of fs.readdirSync(dir)) {
  if (file.endsWith(".json") && file !== "languages.json")
    assert.ok(registry.some(entry => file === entry.code + ".json"), `Register ${file} in languages.json`)
}
