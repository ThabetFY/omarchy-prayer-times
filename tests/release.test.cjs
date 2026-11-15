const assert = require("node:assert/strict")
const fs = require("node:fs")
const path = require("node:path")
const test = require("node:test")
const { root } = require("./helpers.cjs")

test("release keeps upstream attribution and contains no symlinks", () => {
  assert.match(fs.readFileSync(path.join(root, "LICENSE"), "utf8"), /Copyright \(c\) 2026 Husam Emad/)
  assert.match(fs.readFileSync(path.join(root, "README.md"), "utf8"), /https:\/\/github.com\/husamemadH\/omarchy-quattro-prayer-times/)
  function inspect(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === ".git") continue
      assert.equal(entry.isSymbolicLink(), false, entry.name)
      if (entry.isDirectory()) inspect(path.join(dir, entry.name))
    }
  }
  inspect(root)
})

// These source guards cover security sinks, not layout or visual correctness.
test("text sinks explicitly use PlainText and shared tooltips exclude network data", () => {
  for (const file of ["BarWidget.qml", "CardButton.qml", "CardDropdown.qml", "CardToggle.qml"]) {
    const source = fs.readFileSync(path.join(root, file), "utf8")
    for (const block of source.split(/\bText\s*\{/).slice(1))
      assert.match(block.split("}")[0], /textFormat:\s*Text\.PlainText/, file)
    assert.doesNotMatch(source, /tooltipText:.*(?:city\.name|error|cityResults)/, file)
  }
  const bar = fs.readFileSync(path.join(root, "BarWidget.qml"), "utf8")
  const tooltip = bar.match(/readonly property string tooltipLabel: (.*)/)
  assert.ok(tooltip, "Review shared tooltip sinks when changing the tooltip binding")
  assert.doesNotMatch(tooltip[1], /city|location|error|cityResults/)
})
