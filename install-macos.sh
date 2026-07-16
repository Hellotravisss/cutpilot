#!/usr/bin/env bash
set -euo pipefail

APP_HOME="${CUTPILOT_HOME:-$HOME/.cutpilot/app}"
BIN_HOME="${CUTPILOT_BIN_HOME:-$HOME/.local/bin}"
REPO="https://github.com/Hellotravisss/cutpilot.git"

[[ -n "$APP_HOME" && "$APP_HOME" != "/" && "$APP_HOME" != "$HOME" ]] || { echo "Unsafe CUTPILOT_HOME" >&2; exit 1; }

[[ "$(uname -s)" == "Darwin" ]] || { echo "CutPilot currently requires macOS." >&2; exit 1; }
if ! command -v node >/dev/null || [[ "$(node -p 'Number(process.versions.node.split(`.`)[0])')" -lt 18 ]]; then echo "Node.js 18 or newer is required." >&2; exit 1; fi
if [[ "${1:-}" == "--install-deps" ]]; then command -v brew >/dev/null || { echo "Install Homebrew first: https://brew.sh" >&2; exit 1; }; brew install ffmpeg imagemagick; fi
for command in ffmpeg ffprobe; do command -v "$command" >/dev/null || { echo "Missing $command. Run: brew install ffmpeg" >&2; exit 1; }; done

mkdir -p "$(dirname "$APP_HOME")" "$BIN_HOME"
if [[ -d "$APP_HOME/.git" ]]; then git -C "$APP_HOME" pull --ff-only; else rm -rf "$APP_HOME"; git clone --depth 1 "$REPO" "$APP_HOME"; fi
(cd "$APP_HOME" && npm ci && npm run validate)
ln -sf "$APP_HOME/scripts/standalone.mjs" "$BIN_HOME/cutpilot"
ln -sf "$APP_HOME/scripts/server.mjs" "$BIN_HOME/cutpilot-server.mjs"
chmod +x "$APP_HOME"/*.sh "$APP_HOME"/claude/*.sh
echo "CutPilot installed at $APP_HOME"
echo "Standalone editor: $BIN_HOME/cutpilot --project ~/Movies/my-video.cutpilot.json --media ~/Movies/clips"
echo "MCP command: node $APP_HOME/scripts/server.mjs"
echo "Run $APP_HOME/doctor.sh to check this Mac. Claude installers are in $APP_HOME/claude/."
