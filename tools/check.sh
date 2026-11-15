#!/bin/bash
# Run on Omarchy; the CI workflow runs the portable Node tests separately.
set -euo pipefail
cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.."
node --test tests/*.test.cjs
bash -n prayer-fetch.sh
omarchy plugin validate .
qmllint -I "${OMARCHY_PATH:-/usr/share/omarchy}/shell" \
  BarWidget.qml PluginTranslations.qml CardButton.qml CardDropdown.qml CardToggle.qml
