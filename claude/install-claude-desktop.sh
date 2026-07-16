#!/bin/sh
set -eu

ROOT=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
NODE=$(command -v node)
CONFIG_DIR="$HOME/Library/Application Support/Claude"
CONFIG="$CONFIG_DIR/claude_desktop_config.json"

mkdir -p "$CONFIG_DIR"

if [ -f "$CONFIG" ]; then
  cp "$CONFIG" "$CONFIG.backup-$(date +%Y%m%d-%H%M%S)"
fi

NODE_BIN="$NODE" CUTPILOT_ROOT="$ROOT" CLAUDE_CONFIG="$CONFIG" "$NODE" <<'NODE'
import { existsSync, readFileSync, writeFileSync } from "node:fs";

const path = process.env.CLAUDE_CONFIG;
let config = {};
if (existsSync(path)) {
  try { config = JSON.parse(readFileSync(path, "utf8")); }
  catch { throw new Error(`Claude config is not valid JSON: ${path}`); }
}
config.mcpServers ||= {};
config.mcpServers.cutpilot = {
  command: process.env.NODE_BIN,
  args: [`${process.env.CUTPILOT_ROOT}/scripts/server.mjs`],
  env: { CUTPILOT_CLIENT: "claude-desktop" }
};
writeFileSync(path, `${JSON.stringify(config, null, 2)}\n`);
NODE

printf '%s\n' "CutPilot was added to Claude Desktop. Restart Claude Desktop to load it."
