# Adding a language

No QML, JavaScript, or shell-code edits are needed to add a translation.

1. Copy `en.json` to your language code, for example `fr.json`, and translate
   its values. Keep the JSON keys unchanged. Alternatively start with `{}`
   and translate a few keys at a time; missing keys fall back to English.
2. Add one entry to `languages.json`, using the language's own name:

   ```json
   { "code": "fr", "name": "Français", "rtl": false }
   ```

3. Run `node tools/check-translations.cjs` from the repository root, then
   `node --test tests/*.test.cjs`.
4. Open the widget's gear → **Language · اللغة**. Your language appears
   automatically. Test it with both an English and an Arabic system language.

## Conventions

- Use Omarchy/BCP-47 codes such as `ar`, `fr`, or `pt-BR`; the filename and
  registry code must match exactly. The label is an autonym, not a translation
  of the language name into English. `rtl` controls this widget's layout only.
- Regional catalogs fall back to their base (`pt-BR` → `pt`) and then English.
  Register a base catalog too if you ship one. Unknown keys fall back to the key.
- Keep `%1`, `%2`, etc. exactly once wherever they appear in the English value;
  move their order as needed. Translate whole sentences, not fragments.
- These catalogs contain flat strings. Durations use compact unit labels, not
  counted sentences. New counted sentences need plural-aware handling before
  introducing them; do not assume every language has English plural rules.
- Keep brand names (`Aladhan`, `Open-Meteo`) unchanged. Keep the Language label
  recognizable so users can recover from choosing the wrong language.
- The widget formats digits using the selected language's Qt locale and mirrors
  its own content without changing the desktop. Some city names may remain in
  the language in which they were saved; search again for newly localized names.
- City search sends the selected language's base code to Open-Meteo, whose
  supported languages and place-name translations may be more limited than ours.
- Catalogs and registry are local, watched files; no translation is downloaded.
  Invalid/missing catalogs fall back gracefully. Fix invalid JSON before release.

Default setting: `"language": "system"`. An explicit code such as `"ar"`
overrides the shell language for this widget only, and is saved on its bar entry.
