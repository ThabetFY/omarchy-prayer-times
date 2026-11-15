# Contributing

Issues and pull requests are welcome. Include the Omarchy version, UI language,
calculation method, and reproduction steps. Avoid posting your private location
or complete shell configuration; a public test city is enough.

Run the commands in README.md before proposing changes. Keep tests offline,
bound and validate external input, render dynamic text with `Text.PlainText`,
and never interpolate user or downloaded data into shell commands.

Add matching keys and placeholders to `i18n/en.json` and `i18n/ar.json`.
For new languages, follow `i18n/README.md`: add a catalog and registry entry,
then run `node tools/check-translations.cjs`. Partial new translations are welcome.
Preserve the upstream MIT notice and attribution when redistributing this work.
