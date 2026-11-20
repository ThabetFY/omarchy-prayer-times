#!/bin/bash
# Run on Omarchy; the CI workflow runs the portable Node tests separately.
set -euo pipefail
cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.."
node --test tests/*.test.cjs
bash -n prayer-fetch.sh
omarchy plugin validate .
qml_runner=""
for candidate in /usr/lib/qt6/bin/qmltestrunner /usr/lib/qt6/qmltestrunner; do
  if [[ -x $candidate ]]; then qml_runner=$candidate; break; fi
done
[[ -n $qml_runner ]] || { printf 'Qt 6 qmltestrunner is required.\n' >&2; exit 1; }
QT_QPA_PLATFORM=offscreen QT_QUICK_BACKEND=software "$qml_runner" -input tests/qml -o -,txt
qml_lint=""
for candidate in /usr/lib/qt6/bin/qmllint /usr/lib/qt6/qmllint; do
  if [[ -x $candidate ]]; then qml_lint=$candidate; break; fi
done
[[ -n $qml_lint ]] || { printf 'Qt 6 qmllint is required.\n' >&2; exit 1; }
imports=$(mktemp -d "${TMPDIR:-/tmp/opencode}/prayer-times-qml.XXXXXX")
trap 'rm -- "$imports/qs"; rmdir -- "$imports"' EXIT
ln -s "${OMARCHY_PATH:-/usr/share/omarchy}/shell" "$imports/qs"
QT_FORCE_STDERR_LOGGING=1 "$qml_lint" --ignore-settings --max-warnings 0 -I "$imports" \
  BarWidget.qml PluginTranslations.qml AlertSettings.qml AlertToggleRow.qml CardButton.qml CardDropdown.qml CardToggle.qml
