# CutPilot 10

[English](README.md) | [简体中文](README.zh-CN.md)

CutPilot is a local-first AI video editing engine with its own configurable AI mode, plus integrations for Codex, Claude, and any MCP-compatible host. The AI can inspect footage, propose reviewable edits, modify a real multitrack project, open an embedded timeline, and render locally while the user keeps control of source media and every edit decision.

Version 10 adds a persistent project-wide semantic asset index, a review-first cross-category Director Agent, and a durable background task center with cancellation, retry, and restart recovery. It matches narration beats to exact local source ranges, avoids repeated shots, and writes only approved plans to an editable timeline.

## Highlights

- 219 MCP tools, including four high-level workflow entries, and nine project starters.
- Independent AI planning through OpenAI, Anthropic, or a compatible endpoint; every timeline mutation still requires approval.
- Atomic project writes, cross-process locking, automatic backup recovery, schema migration, repair, Undo/Redo, and snapshots.
- Multitrack video/audio timelines, linked A/V, trimming, splitting, ripple operations, snapping, markers, keyframes, effects, transitions, captions, Undo/Redo, and background exports.
- Local transcription, transcript editing, silence detection, scene detection, beat analysis, duplicate-shot review, proxy media, and smart reframing.
- Automatic asset understanding using FFmpeg evidence and Apple Vision semantic labels on macOS. Person identity is never inferred.
- Review-first natural-language edits for speed, volume, captions, mute, deletion, fades, dissolves, scale, exposure, saturation, and track locking. Open-ended creative intent can be decomposed by CutPilot's configured AI or a connected host.
- Vlog, talking-head, podcast, wedding, product-promo, explainer, and motion-graphics director workflows.
- SVG and JSX/React motion graphics, WebGL shaders, concurrent shader batches, and real Remotion 4 project rendering.
- FCPXML, Premiere XML, EDL, SRT/VTT/ASS, and a safe CapCut/Jianying continuation bundle.
- Local procedural media and macOS voice generation plus configurable OpenAI, Seedance, Kling, Mureka, SFX, and generic HTTP bridges.

## What CutPilot is

CutPilot is an AI editing backend with an embedded manual review interface. It is not intended to replace a traditional desktop editor for every hand operation. Its built-in AI, Codex, or Claude can direct the edit, and the user can open CutPilot's local interface to adjust the timeline, captions, effects, audio, and motion graphics.

Original media stays local unless the user explicitly selects a remote generation or transcription provider.

## Requirements

- macOS
- Node.js 18 or newer
- FFmpeg and FFprobe
- Google Chrome
- ImageMagick for the local image generator
- Xcode command-line tools for Apple Vision classification

For Homebrew users:

```bash
brew install ffmpeg imagemagick
xcode-select --install
```

One-command product install from a checked-out repository:

```bash
./install-macos.sh --install-deps
```

Launch without Codex or Claude and optionally import a media folder:

```bash
~/.local/bin/cutpilot --project ~/Movies/my-video.cutpilot.json --media ~/Movies/clips
```

Open the **AI** tab to configure OpenAI, Anthropic, or a compatible endpoint. The API key is stored in `~/.cutpilot/settings.json` with user-only permissions and is never written to a project.

## Run from source

```bash
npm install
npm run validate
node scripts/server.mjs
```

Example MCP configuration:

```json
{
  "mcpServers": {
    "cutpilot": {
      "command": "node",
      "args": ["/absolute/path/to/cutpilot/scripts/server.mjs"]
    }
  }
}
```

Ready-made examples for Codex, Claude Code, and Claude Desktop are included in the repository.

## Safety model

- Natural-language mutations are planned first and require explicit approval.
- Destructive actions are marked in the plan.
- Dependency installation for external Remotion projects requires approval; lifecycle scripts are disabled by default.
- Apple Vision may classify scenes and count detected humans/faces, but CutPilot does not identify people.
- Modern Jianying/CapCut encrypted drafts have no public write protocol. CutPilot provides read-only detection and an editable media/subtitle/timecode handoff rather than claiming decryption.
- Paid generation models require the user's own account, endpoint, authorization, and billing.

Run the live readiness audit through the MCP tool `audit_runtime_readiness` to see what is actually available on the current machine.

## Validation

```bash
npm run test:core
npm run test:browser
```

The tests exercise real FFmpeg media, Apple Vision, natural-language plans, the embedded browser UI, Remotion rendering, generation jobs, CapCut handoff, WebGL batch rendering, and MCP startup.

## Current external boundaries

- Commercial generation providers are only live after credentials and endpoints are configured.
- Direct writing of modern proprietary encrypted Jianying drafts remains experimental.
- Open-ended creative instructions require either a configured CutPilot AI provider or an AI host such as Codex or Claude.

## License

No open-source license has been granted yet. The source is publicly visible, but reuse and redistribution remain reserved unless a license is added later.
