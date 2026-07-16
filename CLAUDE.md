# CutPilot for Claude

Use the `cutpilot` MCP tools for local video editing. CutPilot is plan-first and local-first: inspect media and propose edits before rendering or deleting timeline content.

## Working rules

1. Use absolute paths for projects and media. Prefer `.cutpilot.json` for new projects; legacy `.mycut.json` remains supported.
2. Start with `inspect_media` or `inspect_media_batch`, then import only the selected local assets.
3. For substantial edits, create a snapshot before mutation. Never claim an export succeeded until its job reports completion and the output exists.
4. Keep narration/dialogue on anchor audio tracks and background music on follower tracks so ducking remains predictable.
5. Present duplicate-shot, silence-cut, beat-montage, transcription, and smart-reframe analyses before applying them.
6. Use `open_review_session` when the user wants to adjust the timeline manually. The returned localhost URL opens the same project in the CutPilot browser editor.
7. Original local media remains local unless a specifically configured generation provider is invoked.

## Suggested workflow

Create or read project → inspect/import media → transcribe narration → propose dense edit → snapshot → apply timeline edits → captions/audio cleanup → duplicate and gap checks → open review session → render/export after approval.
