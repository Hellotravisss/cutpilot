# Install CutPilot in Claude

## Claude Code

Run:

```sh
chmod +x claude/install-claude-code.sh
./claude/install-claude-code.sh
```

This registers the bundled MCP server at user scope. Claude Code will ask for tool approval when CutPilot is first used.

For a portable project configuration, set `CUTPILOT_ROOT` to this directory and copy `claude/claude-code.mcp.json` to the target project's `.mcp.json`.

## Claude Desktop

Run:

```sh
chmod +x claude/install-claude-desktop.sh
./claude/install-claude-desktop.sh
```

The installer backs up any existing Claude Desktop configuration, preserves its other MCP servers, and adds CutPilot using absolute local paths. Restart Claude Desktop after it finishes.

After installation, ask Claude to list CutPilot project starters or create a blank CutPilot project. Use the returned localhost review URL in a browser for manual timeline editing.
