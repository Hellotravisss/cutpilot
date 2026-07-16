# Contributing

CutPilot is currently an early public project. Before opening a pull request:

1. Keep source media local and never commit private footage, project files, credentials, generated outputs, or model caches.
2. Preserve review-before-apply behavior for destructive or semantic edits.
3. Do not describe heuristic or Apple Vision output as person identification.
4. Add a focused test for every engine or MCP tool change.
5. Run `npm run validate`, `npm run test:core`, and the relevant browser or render test.

Bug reports should include the CutPilot version, macOS version, Node version, FFmpeg version, failing tool name, sanitized error text, and a minimal reproducible project when possible.
