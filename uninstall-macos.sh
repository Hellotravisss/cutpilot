#!/usr/bin/env bash
set -euo pipefail
APP_HOME="${CUTPILOT_HOME:-$HOME/.cutpilot/app}"
BIN_HOME="${CUTPILOT_BIN_HOME:-$HOME/.local/bin}"
[[ -n "$APP_HOME" && "$APP_HOME" != "/" && "$APP_HOME" != "$HOME" ]] || { echo "Unsafe CUTPILOT_HOME" >&2; exit 1; }
rm -rf "$APP_HOME" "$BIN_HOME/cutpilot" "$BIN_HOME/cutpilot-server.mjs"
if [[ "${1:-}" == "--purge-settings" ]]; then rm -f "${CUTPILOT_CONFIG_PATH:-$HOME/.cutpilot/settings.json}"; fi
echo "CutPilot application files removed. Projects and media were not touched."
