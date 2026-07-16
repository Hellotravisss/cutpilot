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

Open the supplied `cutpilot-v4.2.mcpb` file with Claude Desktop, review the local file/tool permissions, and install it. Current releases call this format MCPB; the supplied `.dxt` file contains the same compatible bundle for older Desktop versions.

After installation, ask Claude to list CutPilot project starters or create a blank CutPilot project. Use the returned localhost review URL in a browser for manual timeline editing.
