#!/usr/bin/env bash
set -euo pipefail
APP_HOME="${CUTPILOT_HOME:-$HOME/.cutpilot/app}"
[[ -n "$APP_HOME" && "$APP_HOME" != "/" && "$APP_HOME" != "$HOME" ]] || { echo "Unsafe CUTPILOT_HOME" >&2; exit 1; }
[[ -d "$APP_HOME/.git" ]] || { echo "CutPilot is not installed at $APP_HOME" >&2; exit 1; }
git -C "$APP_HOME" pull --ff-only
(cd "$APP_HOME" && npm ci && npm run validate)
echo "CutPilot is up to date. Restart the connected AI host to load the new version."
