#!/bin/sh
set -eu

ROOT=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
if ! command -v claude >/dev/null 2>&1; then
  echo "Claude Code is not installed or not on PATH." >&2
  exit 1
fi

claude mcp remove cutpilot --scope user >/dev/null 2>&1 || true
claude mcp add cutpilot --scope user -- node "$ROOT/scripts/server.mjs"
claude mcp get cutpilot
echo "CutPilot is now available to Claude Code for this user."
