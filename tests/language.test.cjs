const assert = require("node:assert/strict")
const path = require("node:path")
const test = require("node:test")
const { spawnSync } = require("node:child_process")
const { root, language } = require("./helpers.cjs")

test("language registry supports new languages and rejects unsafe/duplicate entries", () => {
  const fr = { code: "fr", name: "Français", rtl: false }
  const languages = language.parseRegistry(JSON.stringify([fr, fr, { ...fr, code: "../fr" },
    { ...fr, code: "fr/xx" }, { code: "de", name: "Deutsch" }, { ...fr, code: "pt-BR" }]))
  assert.equal(languages.length, 2)
  assert.equal(language.preference("fr", languages), "fr")
  assert.equal(language.preference("pt-BR", languages), "pt-BR")
  for (const value of ["system", "unknown", null, "../../etc/passwd"])
    assert.equal(language.preference(value, languages), "system")
  for (const raw of ["invalid", "[]", " ".repeat(32769)])
    assert.equal(language.parseRegistry(raw).length, 0)
})

test("translations fall back through regional, base, English, then the key", () => {
  for (const [selected, base, en, expected] of [
    [{ title: "Regional" }, { title: "Base" }, { title: "English" }, "Regional"],
    [{}, { title: "Base" }, { title: "English" }, "Base"],
    [{ title: "" }, {}, { title: "English" }, "English"], [{}, {}, {}, "title"]
  ]) assert.equal(language.lookup("title", selected, base, en), expected)
  assert.equal(language.lookup("toString", {}, {}, {}), "toString")
  for (const raw of ["invalid", "[]", "null", " ".repeat(65537)])
    assert.equal(Object.keys(language.parseCatalog(raw)).length, 0)
})

test("registered catalogs have valid keys, placeholders, and method labels", () => {
  const result = spawnSync(process.execPath, [path.join(root, "tools/check-translations.cjs")], { encoding: "utf8" })
  assert.equal(result.status, 0, result.stderr)
})

test("the actual UI time formatter handles midnight, noon, padding, and Arabic digits", () => {
  const english = { formatNumber: String, t: key => key.toUpperCase() }
  for (const [time, clock12, expected] of [["00:01", true, "12:01 AM"], ["12:00", true, "12:00 PM"],
    ["19:07", true, "7:07 PM"], ["04:09", false, "04:09"], ["24:00", true, ""], [null, true, ""]])
    assert.equal(language.formatTime(time, clock12, english), expected)
  const arabic = { formatNumber: value => String(value).replace(/\d/g, digit => "٠١٢٣٤٥٦٧٨٩"[digit]), t: key => key === "am" ? "ص" : "م" }
  assert.equal(language.formatTime("04:09", false, arabic), "٠٤:٠٩")
  assert.equal(language.formatTime("19:07", true, arabic), "٧:٠٧ م")
})
