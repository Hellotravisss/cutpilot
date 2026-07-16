---
name: cutpilot-video-editing
description: Use when the user wants Codex to inspect local video footage, understand narration, create or revise an AI-authored cut plan, or render a local editable video project with CutPilot.
---

# CutPilot AI Video Editing

CutPilot is a local-first, Codex-first editing workflow with an embedded manual review timeline. Codex makes editorial decisions from the user's brief, narration, metadata, and contact sheets; CutPilot tools make those decisions reproducible and renderable, while the user can directly adjust supported timeline details.

## Workflow

1. Call `inspect_media_folder` on the user-provided folder. Do not upload originals.
2. Read the returned manifest and inspect the generated contact-sheet images when visual selection matters.
3. Identify the narration file from the user's naming or instruction. Ask only for creative choices that cannot be inferred.
4. Inspect contact sheets, then call `annotate_assets` with factual visual descriptions and tags. Do not guess unseen content.
5. Use `rank_assets_for_narration` for each narration beat. Pass already-used asset IDs in `avoidAssetIds` when the user wants less repetition.
6. Author a cut plan with frequent, semantically matched shots. Each visual clip needs a source path, timeline start, source start, and duration. Never repeat a shot unless the user asks or the repetition has a clear editorial purpose.
7. Summarize the proposed structure and obtain approval before expensive rendering unless the user explicitly asked to run end-to-end.
8. Call `render_project` after approval. Deliver the MP4 plus the JSON project.

## Editorial defaults

- Match visuals to spoken meaning: code when code is mentioned, wedding footage when wedding work is mentioned, factory details for factory narration.
- Prefer more purposeful cuts over holding one generic clip too long.
- Preserve narration as the primary audio and mute B-roll unless the user requests natural sound.
- Use 9:16, 1080x1920, 30fps for vertical social video unless the user specifies otherwise.
- Keep original files untouched.

## Project-first workflow

For a durable edit, prefer the v0.2 project tools:

1. `create_project`
2. `import_assets`
3. `inspect_media_folder`
4. `edit_timeline`
5. `validate_project`
6. `read_project`
7. `transcribe_asset` when transcript timing is needed. Use `download_transcription_model` once if no model is available.
8. `set_captions` and `export_subtitles` when captions are requested.
9. `render_project` after the user approves the cut.
10. Use `edit_item_effects` and `set_transition` for non-destructive clip styling.
11. Use `create_motion_graphic` / `update_motion_graphic` for editable titles, lower thirds, and information cards.
12. Use `generate_voiceover` for private macOS TTS, or `register_generated_asset` to preserve provenance for media created by external generators.
13. Call `create_project_snapshot` before a substantial autonomous revision. Use `list_project_snapshots` and `restore_project_snapshot` when the user wants to compare or undo a direction.
14. For Vlog projects, call `get_vlog_workflow_status` to find the first incomplete evidence-backed stage and its recommended next tool.
15. Use `submit_vlog_release_export` for the final MP4. It always reruns strict preflight and refuses to export while blockers remain.
14. After rendering, call `inspect_rendered_video` and visually inspect its contact sheet. Treat black/frozen segment warnings as leads, not automatic editorial failures.
15. Use `export_interchange` with `fcpxml` for Resolve/Final Cut or `edl` for a simple primary-video handoff.
16. Use `submit_generation` once per requested image/video/music/SFX. Use `track_generation` for status and materialization; do not place a generated result before the user has reviewed it when generation costs money.
17. Use `edit_item_transform` for explicit position, size, rotation, fit, and entrance/exit/float animation. Inspect multiple frames so transient motion is not mistaken for broken layout.
18. Use `create_motion_graphic_from_svg` for direct-authored property-driven graphics. Declare every `{{property}}`, keep external resources out of SVG, and use `update_svg_motion_graphic` for later text/color/source changes.
19. Use ordered transform keyframes for intentional x/y/rotation choreography. Use `cross-dissolve` only at a contiguous adjacent-clip boundary and inspect frames from before, during, and after the transition.
20. When the user wants to inspect or manually adjust the AI edit, call `open_review_session` with the real project and latest preview, then open its localhost URL in Codex. Close it with `close_review_session` when the live page is no longer needed.
21. Review UI writes are real project edits. They create snapshots automatically and reject invalid timing, opacity, overlap, expired tokens, and malformed media ranges.
22. Use `split_item` or `razor_all_tracks` for source-continuous cuts. Use `trim_item` for boundary changes, `ripple_delete_item` to remove time, and `insert_timeline_gap` to open time while preserving crossing media through automatic splits.
23. In the review UI, users can drag clip bodies, drag trim handles, split at the playhead, apply Ripple delete, insert global gaps, set outgoing transitions, and inspect real generated waveforms.
24. Transition choices include fade, dip-black, cross-dissolve, four directional wipes, radial reveal, and four directional slides. Use advanced transitions only at contiguous adjacent clip boundaries and verify a midpoint frame.
25. Named generation bridges use `MYCUT_SEEDANCE_ENDPOINT`, `MYCUT_KLING_ENDPOINT`, `MYCUT_MUREKA_ENDPOINT`, or `MYCUT_SFX_ENDPOINT`, with matching optional `_TOKEN` variables. They preserve submit/status/materialize semantics; do not claim a paid vendor was live-tested unless that endpoint was actually configured and called.
26. Use `edit_item_keyframes` for x/y/scale/rotation/opacity animation. Easing is stored on the left keyframe and may be linear, ease-in, ease-out, ease-in-out, hold, or custom Bezier Y controls. Verify multiple rendered times.
27. Use `list_glsl_presets` and `apply_glsl_preset` for built-in WebGL effects, or `edit_item_effects` with type `glsl` for direct-authored fragment source. Keep `u_texture`, `u_time`, `u_progress`, and `u_resolution` declarations compatible with WebGL1 and verify the compiled render.
28. Use `create_jsx_motion_graphic` for frame-driven React components and `update_jsx_motion_graphic` for later source/Props changes. Define `MotionGraphic`; React and frame/fps/progress/dimensions are supplied. Verify transparency and multiple frames.
29. Use `export_interchange` with `premiere-xml` for Premiere Pro, `fcpxml` for Final Cut/Resolve, or `edl` for a simple cut list. Use `import_fcpxml` or `import_premiere_xml` to create a new CutPilot project from local NLE XML, then validate and render-check the imported timeline.
30. Use `export_jianying_draft` only when the user accepts experimental legacy plaintext compatibility. Always report that modern Jianying drafts are encrypted/version-dependent and call `validate_jianying_draft`; never claim app-open compatibility without launching the target app successfully.
31. Use `list_caption_templates` and `update_caption_style` for rich captions. Enable `karaoke` only when word timestamps exist, then verify several word intervals in the burned render.
32. Use `edit_item_playback` for 0.1x-16x constant speed, editable speed curves, reverse, or video freeze frames. Curve points use clip-local timeline time plus rate and easing; timeline duration stays fixed while the integrated curve determines source span. Audio follows the same curve with pitch-preserving segmented time stretch.
33. Use `edit_item_effects` for ordered non-destructive visual stacks. `chroma-key` removes a selected RGB color with similarity/blend controls; `mask` supports rectangle/ellipse geometry, feather, and inversion; `color-grade`, `curves`, and `vignette` provide local finishing. Verify transparency against a lower video track and inspect center/edge/corner pixels.
34. Use `edit_item_audio_effects` for ordered per-clip audio processing. Voice cleanup typically starts with high-pass, gate, EQ, compression, and de-essing; stereo and pitch are creative tools. Pitch preserves timeline duration. Measure the actual render's spectrum, RMS/peak dynamics, and left/right energy before reporting success.
35. Use `render_audio` when the user wants a processed narration, music mix, podcast, or audio handoff without video. Choose 24-bit WAV or FLAC for lossless continuation, MP3 for broad delivery, and M4A for compact AAC delivery; verify the exported file contains no video stream.
36. Use `list_timelines`, `create_timeline`, `duplicate_timeline`, `activate_timeline`, `rename_timeline`, and `delete_timeline` for separate long, short, vertical, or square sequences that share one asset library. Never delete the last timeline.
37. Use `set_timeline_in_out` and `range: zone` on `render_project` or `render_audio` for an exact selected export range. Range slicing preserves source mapping, speed curves, captions, markers, and audio timing without modifying the source sequence.
38. Use `export_motion_graphic` to hand off an SVG or JSX/React Motion Graphic as a standalone transparent ProRes 4444 MOV. Verify both the 4444 profile and a `yuva` alpha pixel format.
39. Use `read_transcript_edit` to inspect timed transcript segments, then `apply_transcript_sequence` to reorder or omit source segments. This rebuilds linked talking-head video/audio and word captions from exact source ranges; do not invent approximate segment times.
40. Use `create_asset_bin`, `move_asset_bin`, `assign_assets_to_bin`, and `list_asset_library` to organize and search local media without moving source files. Use `scan_missing_assets` before rendering imported or moved projects.
41. Use `relink_asset` for an explicit replacement or `relink_missing_from_folder` for exact-filename bulk recovery. Never guess among ambiguous matches; preserve asset IDs so every timeline reference, transcript, annotation, tag, bin, and generation record remains intact.
42. Normal project saves automatically enter a persistent 100-step editor journal. Use `editor_history_status`, `undo_project`, and `redo_project` for immediate editing reversals; a fresh edit after Undo intentionally clears the Redo branch. Keep named snapshots for durable milestones.
43. Use `set_timeline_format` with 16:9, 9:16, 1:1, 4:3, or 3:4 to change the editable canvas. Prefer `layoutMode: scale` when existing pixel-positioned transforms, keyframes, masks, and captions should adapt to the new canvas.
44. `render_project` accepts non-destructive `resolution` (`original`, `1080p`, `720p`, `480p`) and `frameRate` (24-60). Verify the actual FFprobe dimensions and rate; these output overrides must not mutate the editable source sequence.
45. Use `create_track`, `rename_track`, `reorder_track`, `edit_track`, and `delete_track` for explicit track lifecycle. Track order determines video compositing order; muted video is hidden, muted audio is silent, and locked tracks reject edits.
46. Configure `set_timeline_snapping` in frames. Use `snap_timeline_time` to preview a guide or `move_item`/snapped `trim_item` to align with clip edges, markers, In/Out, playhead, or timeline start. Never force a snap beyond tolerance or into an overlap.
47. Use `set_edit_context` for exact ChatCut-style references to assets, timeline items, timeline times, canvas regions, or transcript source ranges. Call `resolve_edit_context` before acting so AI decisions bind to real IDs and timed objects. Selection changes persist locally but intentionally do not enter Undo/Redo.
48. Start new work with `list_project_starters` and `create_project_from_starter` when a known scenario fits. Starters create real named tracks, routing roles, bins, captions, snapping, a saved creative brief, and a recommended workflow. Use `configure_project_starter` only while every timeline is empty; never overwrite an edited sequence with a starter.
49. Use `place_asset_on_timeline` for source-monitor assembly. Set exact source In/Out and a compatible target track. `append` uses the target track end; `insert` opens time across every unlocked track and shifts captions/markers; `overwrite` changes only the target range while preserving source-continuous left/right remainders.
50. Use `place_linked_av` when a camera/video asset's original audio should remain synchronized. Linked members share `linkGroupId`; use `move_linked_group` and `trim_linked_group` for atomic sync-safe edits, or `unlink_timeline_items` before an intentional independent adjustment. Reject collisions and locked members rather than desynchronizing them.
51. Prefer `submit_export_job` for long or user-visible exports so Codex remains responsive. Poll `read_export_job` or `list_export_jobs`; report the exact phase and output path, and use `cancel_export_job` only when requested. Jobs render from an immutable project snapshot, so later timeline edits cannot silently change an in-flight export.
52. Use `analyze_asset_silence` before proposing pause removal. Show the detected silence ranges, threshold, minimum duration, breathing-edge padding, and total removed time. Call `apply_silence_cut` only after the ranges are accepted; it rebuilds source-continuous linked AV and remaps transcript captions. Never treat every quiet passage as editorially disposable.
53. Use `analyze_asset_scenes` on long B-roll or camera files when shot boundaries matter. Review its cut times and contact sheet before `save_scene_subclips`; then annotate/tag subclips or search them with `list_asset_subclips`. Use `place_asset_subclip` to preserve exact detected source In/Out instead of approximating a shot range.
54. Use `analyze_asset_beats` to inspect local music before cut-on-beat editing. Review BPM, beat positions, sensitivity, and minimum interval before `save_beat_markers`. Build a non-mutating proposal with `plan_beat_montage`, then call `apply_beat_montage` only after the source pool, cut frequency, target range, and target video track are accepted.
55. Use `import_subtitles` for local SRT, WebVTT, or ASS interchange and verify cue count plus first/last timing before editing. Use `set_caption_translations` only with one reviewed translation per cue, preferably matching stable cue IDs. Export original, translated, or bilingual SRT/VTT/ASS with `export_subtitles`, and render-check both language lines before delivery.
56. Use `generate_video_proxy` for high-resolution or high-bitrate local video that is slow to review. Call `scan_proxy_status` after source moves or changes; stale and missing proxies must fall back to originals. Proxies are preview-only and final renders must continue resolving `asset.path`. Use `detach_video_proxy` with file deletion only for project-owned proxy files.
57. Use `analyze_item_reframe` when a source aspect differs from the delivery canvas and a moving salient subject should remain visible. Describe this backend accurately as local saliency/motion tracking, not face recognition. Review confidence and every normalized focus point before `apply_item_reframe`; manually correct ambiguous/static shots in the embedded Reframe panel. Render-check early, middle, and late frames.

Use `save_edit_plan` only for the legacy v0.1 single-track plan format.

## Speech editing

Use `find_transcript_phrase` to prove the exact source range before phrase-specific removal. Use `apply_script_edit` to remove spoken phrases and rebuild a ripple-closed speech track and captions. Do not cut speech from approximate timestamps when word timestamps exist.

## Audio roles

- Narration/dialogue: `edit_track` role `anchor`, usually with denoise and -16 LUFS normalization.
- Background music: role `follower`; CutPilot automatically ducks it under anchor audio.
- Independent effects/ambience: role `mix` unless the user wants them ducked.

## Automatic understanding and natural-language edits

- Run `analyze_asset_intelligence` or `analyze_project_assets` before semantic selection. Treat its technical, visual, audio, scene, filename, transcript, and manual-tag results as reviewable local evidence; never describe them as face recognition or verified object identity.
- Apply results only with `apply_asset_intelligence` or `apply_project_intelligence` after review. This persists searchable tags, evidence, and exact scene subclips without changing source media.
- Use `plan_natural_language_edit` before every natural-language write. Show the exact actions and destructive flag, then call `apply_natural_language_edit` only with explicit approval. If the local parser returns unsupported intent, have Codex decompose it into existing exact tools instead of guessing.
- For external Remotion projects, inspect first with `inspect_remotion_project`. Dependency installation requires explicit approval and disables lifecycle scripts by default. List real compositions and props before `render_remotion_composition`; render output is ordinary local media and the external Remotion source project remains untouched.

## Completion workflows

- Call `inspect_generation_providers` before choosing a paid or remote generator. Local procedural media and macOS voice remain available without credentials; configured providers must report ready before use. Preserve job and model provenance when materializing results.
- Use `export_capcut_editable_handoff` for the dependable CutPilot-to-CapCut/Jianying route: source media, editable UTF-8 SRT captions, EDL timing, FCPXML, Premiere XML, and a full JSON track manifest. `inspect_capcut_draft` is read-only. Never claim that a non-JSON modern private draft was decrypted or made directly writable.
- Use `render_glsl_batch` for independent concurrent WebGL renders. Keep concurrency within local memory/GPU limits, inspect every per-job result, and do not equate local parallel workers with a remote GPU cluster.

## Current v9.1 capabilities

- Seven director workflows share one evidence-based acceptance audit for online media, review gates, editable timelines, variants, export settings, and strict release readiness.
- Multi-platform delivery packs derive independent editable 16:9, 9:16, 1:1, and 4:5 timelines and submit background exports that are pinned to each exact sequence.

- Pure motion-graphics projects can turn user-authored title/data/list/CTA scenes into reviewed two-layer SVG scenes with beat alignment, editable keyframes, validated GLSL effects, transitions, music, and SFX cues without inventing copy or values.

- Podcast projects can turn reviewed multicamera sync plus a speaker-labeled transcript into active-speaker cuts, overlap-wide shots, independent speaker cleanup, captions, chapters, reviewed guest lower-thirds, and separate In/Out-based short-clip timelines.

- Wedding projects can build preparation/ceremony/portraits/speeches/reception structure from annotated footage, preserve transcribed vows as the anchor, add music ducking and reviewed titles, and create separate editable full-film and highlight timelines.

- Product-promo projects can build a reviewed Hook/problem/benefit/proof/CTA structure, semantically match Hero and detail footage, align sections to available music beats, expose gaps, and render only human-approved advertising claims as editable brand MG.

- Explainer information cards require explicit approve, edit, or reject decisions before safe SVG rendering; approved cards become editable Motion Graphic assets on V3, while unreviewed cards keep release locked.

- The project model supports reusable assets, multiple timelines, multiple video/audio tracks, captions, markers, history, and atomic item edits.
- Local whisper.cpp transcription supports segment and word timestamps; models live in the user's CutPilot cache.
- Captions can be stored, exported as SRT/TXT, and burned into rendered video without uploading media.
- Multitrack rendering composites stacked video tracks and mixes audio tracks with per-item dB, fades, and final limiting.
- Mechanical filler removal and long-gap compression operate on timestamped transcript cues. Semantic speech editing remains an AI decision.
- Codex-authored factual asset annotations feed deterministic narration-to-shot ranking with repetition penalties.
- Word-timestamp Script edits remove phrases and rebuild ripple-closed speech clips and captions.
- Track-level high-pass/FFT denoise, loudness normalization, anchor/follower routing, and sidechain ducking are supported.
- Editable effect stacks support color, grayscale, blur, zoom, and `.cube` LUTs.
- Fade/dip-to-black boundaries and per-item visual fades are rendered non-destructively.
- Motion Graphic assets retain their source text, kind, and colors so Codex can regenerate them after changes.
- Local macOS voice generation and provenance-aware registration cover generated voice, image, video, music, and SFX assets.
- Immutable local snapshots and safety-preserving rollback make autonomous revisions reversible.
- Render QA creates a contact sheet and reports sustained black/frozen segments.
- FCPXML exports multitrack clip timing and audio gain; CMX 3600 EDL exports the primary video track.
- Motion Graphic and visual items support editable natural-box placement, contain/cover fit, rotation, slide/fade entrances and exits, and subtle floating motion.
- Persistent generation jobs separate submission, status polling, and asset materialization.
- Offline procedural fixtures cover all media kinds; OpenAI image generation and configurable synchronous/asynchronous HTTP generator services are supported.
- Direct-authored SVG templates expose editable text, number, color, and boolean properties with local safe rasterization.
- Ordered x/y/scale/rotation/opacity keyframes render per frame with linear, ease-in, ease-out, ease-in-out, hold, and custom Bezier-Y interpolation.
- Contiguous adjacent clips support a real overlapping cross-dissolve without changing project timing.
- A token-protected localhost review UI runs inside the CutPilot MCP process and can be opened in Codex.
- Timeline markers can be added, renamed, recolored, retimed, jumped to, and deleted by either Codex tools or the embedded editor.
- Duplicate-shot review uses local representative-frame perceptual hashes; always present candidates and similarity before removing explicitly selected repeats.
- The review UI reads the real multitrack project, plays a rendered preview, supports timeline dragging and precise item edits, edits captions, and changes SVG MG properties.
- Every accepted UI write creates a project snapshot; invalid writes are rejected before persistence.
- Source-continuous split/razor operations redistribute source in-points, fades, transitions, and relative keyframes.
- Trim handles preserve source continuity; optional ripple out-trim closes time on the track.
- Ripple delete removes the selected range across tracks, splitting media that spans the removed interval and remapping captions/markers.
- Gap insertion splits crossing media and shifts the right side, captions, and markers.
- Real FFmpeg `showwavespic` waveforms are cached locally and displayed on audio clips.
- Eleven production transition types render locally: dissolve, dip, four wipes, radial reveal, four slides, and standard fade.
- Wipe/radial transitions use frame-evaluated alpha masks; slides use time-evaluated overlay positions with source pre-roll.
- Seedance, Kling, Mureka, and sound-effect bridge profiles have dedicated endpoint/token configuration, media-kind validation, provider identity, and async polling compatibility.
- Persistent edit context stores up to 50 deduplicated asset, item, time, canvas-region, and transcript-range references in a local sidecar. MCP resolution returns exact objects plus concise AI prompt context, while the embedded review UI can select assets, clips, and timeline times without polluting Undo/Redo.
- Nine versioned project starters cover blank editing, Vlog, talking head, vertical social short, video podcast, wedding, explainer, motion graphics, and product promo. Seven user-facing video types are selectable in onboarding; each materializes scenario-specific tracks, routing roles, bins, caption defaults, snapping, a bounded AI brief, and a recommended workflow.
- The embedded source panel previews local video, audio, and images, marks source In/Out, selects a compatible target track, and performs append, ripple insert, or target-only overwrite. Source slicing preserves playback mapping and keyframe timing on retained clip remainders.
- Persistent link groups keep camera video and original audio synchronized across append/insert/overwrite placement, group movement, and aligned trimming. The embedded source monitor can create linked AV, timeline selection highlights every linked member, linked drags/trims edit the group, and users can explicitly unlink before independent work.
- Detached local export jobs cover video, audio, FCPXML, Premiere XML, EDL, and experimental Jianying drafts. Each job renders from an immutable project snapshot, persists queued/running/completed/failed/cancelled state, exposes coarse honest phases and verification results, survives UI closure, and appears in a polling embedded export queue.
- Two-stage local pause removal uses FFmpeg silence detection to propose raw silence plus padded keep ranges without editing. Confirmation rebuilds source-continuous linked video/original-audio segments, remaps timed captions, creates a snapshot, and remains reversible. Threshold, minimum silence, breathing padding, and minimum retained segment are explicit.
- Local FFmpeg scene detection identifies visual hard cuts, merges implausibly short scenes, extracts midpoint JPEGs, builds a dependency-light contact sheet, and persists searchable source subclips with names, tags, annotations, exact ranges, and thumbnails. Subclips load into the source monitor or place directly through MCP.
- Local onset analysis estimates music tempo, distinguishes stronger accents, and persists editable beat markers. A two-stage cut-on-beat workflow builds a non-mutating montage proposal from assets or detected source subclips, then atomically applies reviewed cuts to a chosen video track; the embedded Beat panel exposes the same analyze, mark, plan, and confirm flow.
- Subtitle interchange locally imports and strictly validates SRT, WebVTT, and ASS, retaining stable cue IDs and optional offsets. Exact-count or cue-ID translation alignment adds a second language without replacing the source text; original, translated, or bilingual SRT/VTT/ASS exports round-trip timing, and the renderer burns independently styled primary and secondary lines. The embedded Caption panel exposes paths, formats, translation rows, bilingual styling, and export variants.
- Local H.264 proxy media supports 540p, 720p, and 1080p profiles with configurable quality, optional source audio, duration/dimension verification, and source size/mtime fingerprints. Ready proxies accelerate the embedded source monitor; missing or stale proxies safely fall back to originals, project-owned files can be detached securely, and timeline/final rendering deliberately retains original asset paths.
- Local smart reframe samples grayscale video through FFmpeg, combines visual saliency with motion energy, smooths a normalized focus trajectory, and proposes editable focus keyframes without modifying the project. Confirmed trajectories drive per-frame FFmpeg crop positions, survive split/trim/range/overwrite operations through boundary interpolation, and remain manually editable in the embedded Reframe panel. This is explicitly motion/saliency tracking rather than unverified face recognition.
- The Codex-embedded review surface includes a visual curve preview, editable keyframe rows, add-at-playhead, deletion, validation, snapshots, and project writeback.
- Real GLSL fragment effects compile and render locally through Chrome WebGL1, with source/uniform persistence, four presets, MCP authoring, and an embedded shader editor.
- JSX/React Motion Graphics retain editable component source and Props, receive frame/fps/progress, render transparently through Chrome, and composite as ordinary timeline assets.
- FCPXML imports local assets, gaps, connected clips, nested media sequences, titles/captions, markers, lanes, source ranges, audio gain, and CutPilot metadata. Premiere xmeml imports reusable file references, video/audio tracks, source ranges, clip gain, and sequence markers. Both formats also export, and EDL export remains available.
- Experimental JianyingPro v360000 plaintext draft export copies or references local media, maps video/audio timing and transforms, writes draft metadata, and validates every reference.
- Rich captions support four templates, safe-area placement, color/outline/background controls, and word-timestamp karaoke highlighting with embedded UI editing.
- Video/audio items support constant speed, eased editable speed curves, and reverse; video items also support deterministic freeze frames. Curves use integrated source mapping, shared audio/video timing, source-range validation, visual editing, and montage/hero presets.
- Ordered visual effect stacks support chroma key, rectangular/elliptical masks with feather/invert, exposure/contrast/saturation/temperature/tint and shadow/highlight color balance, ten curve presets, vignette, LUT, blur, zoom, color, grayscale, and GLSL. The embedded Picture panel includes safe JSON editing and practical presets.
- Ordered per-clip audio stacks support high/low-pass filters, up to twelve parametric EQ bands, compression, noise gating, de-essing, stereo balance/width/phase, duration-preserving pitch shifts, and limiting. The embedded Audio panel includes Voice Cleanup, Broadcast Voice, Music Wide, and Low Pitch presets.
- Processed audio-only export supports 24-bit WAV, FLAC, 256 kbps MP3, and 192 kbps M4A/AAC with duration based only on audible audio tracks.
- Projects expose first-class sequence creation, duplication, activation, rename, deletion, shared assets, isolated tracks/captions/markers, and per-sequence format. The embedded review UI can switch active sequences.
- Per-sequence In/Out zones drive exact video or audio zone exports; speed curves, reverse source ranges, captions, words, markers, and audio remain synchronized after slicing.
- Editable SVG and JSX/React Motion Graphics export independently as transparent ProRes 4444 MOV files with verified alpha pixel formats.
- Text-based editing supports ordered source transcript segments: Codex or the embedded Transcript panel can move or delete passages, then atomically rebuild linked video/audio clips and word-level captions with exact source continuity.
- The local asset library supports nested bins, assignment, searchable tags/names/annotations, type/generated/online filters, missing-media dependency reports, explicit relinking, and exact-filename recursive folder recovery. Relinking retains stable asset IDs and all editorial metadata.
- Every semantic `saveProject` change enters a persistent, bounded 100-step Undo/Redo journal. It survives process restarts, supports branch invalidation after Undo, coexists with named snapshots, and is available through MCP plus embedded Review buttons.
- Multicam sync locally cross-correlates scratch/reference audio envelopes, reports offsets and confidence before editing, then can build separate aligned angle/audio tracks or a source-continuous editable program cut from explicit camera switches.
- Automatic multicam planning remains non-mutating until approved: stable/balanced/dynamic pacing scores quality and motion annotations, discourages immediate angle repetition, supports preferred cameras plus explicit directed holds, reports per-angle coverage, and feeds the editable program-cut tool.
- Speaker-aware multicam planning consumes honestly speaker-labeled transcript cues, maps named speakers to synchronized cameras, selects an optional wide shot for overlapping speech, merges adjacent delivery, suppresses micro-shots, and reports missing mappings. It never claims diarization when labels are absent.
- Category-first onboarding asks what kind of video the user is making before exposing the editor. Vlog is the first dedicated workflow, with a structured brief, purpose-built tracks/bins, five-part story planning, pace control, non-mutating review, and exact source-range application.
- Before planning a Vlog, run `analyze_vlog_coverage` to score Hook, Setup, Journey, Payoff, and Outro coverage. Surface thin or missing sections and concrete pickup suggestions; the embedded Vlog workspace offers the same analyze, plan, review, and snapshot-backed apply flow.
- For narration-led Vlogs, use `plan_vlog_narration_broll` after captions or a timestamped transcript are available. Review semantic matches, repeated assets, and explicit unmatched-line gaps before using `apply_vlog_narration_broll` on `V2 · Cutaways`.
- After the story and cutaway tracks exist, run `analyze_vlog_rhythm`, then `plan_vlog_rhythm`. Apply only reviewed safe changes with `apply_vlog_rhythm`; long-take deletion and pickup decisions remain explicit manual-review items while visual prelaps, handoff transitions, audio fades, and anchor/follower ducking can be automated.
- Use `plan_vlog_sound` for an assembled Vlog to build music zones, cutaway natural-sound moments, and explicitly identified SFX placements. Review missing-source warnings, then use `apply_vlog_sound` to write editable A2/A3/A4 clips while preserving voice anchor and music follower ducking.
- Use `plan_vlog_finishing` before release to audit caption readability and build safe-area, title-card, chapter-marker, CTA, and export specifications. `apply_vlog_finishing` writes safe metadata and keeps title cards as explicit editable pending MG specs until their real render assets are created.
- After applying finishing specs, use `render_vlog_title_cards` to create safe local SVG sources, transparent PNG assets, and editable V3 title clips. Review any cards skipped by overlap protection; text and colors remain editable through the SVG Motion Graphic workflow.
- Before export, run `analyze_vlog_release`. Do not call a Vlog ready while blockers remain. `apply_vlog_release_fixes` may repair only mechanical settings such as audio roles, safe areas, caption enablement, and export presets; offline media, content gaps, and unrendered graphics require explicit resolution.
- Editable sequences can switch among five social/broadcast aspect presets or custom 16-8192 pixel formats. Scale-layout mode remaps transforms, transform keyframes, mask geometry/feather, and caption sizing; output-only resolution and 24-60 fps overrides render from a clone and never mutate the project.
- Video/audio tracks support explicit create, stable-ID rename, type-relative reorder, lock, mute/visibility, role/gain/processing, safe delete or non-overlapping item transfer. Frame-based snapping resolves deterministic guides for clip edges, markers, zones, playhead, and timeline start in MCP plus embedded drag/trim controls.
- Use `list_cutpilot_capabilities`, `read_cutpilot_gaps`, and `audit_runtime_readiness` together. Remotion project rendering and concurrent local GPU Shader batches are implemented and tested. Paid commercial endpoints remain unverified until configured, and modern encrypted Jianying compatibility remains experimental and version-dependent.
- For non-Vlog category projects, call `get_category_workflow_status` to read evidence-backed stages and the next recommended tool. Use `analyze_category_release` / `apply_category_release_fixes` for preflight and `submit_category_release_export` for the final gated MP4.
- For a transcribed talking-head camera asset, use `plan_talking_head_director` first. Review every removed standalone filler cue and semantic B-roll match, then use `apply_talking_head_director` to rebuild linked picture/dialogue, B-roll, voice cleanup, karaoke captions, music ducking, and export settings.
- For narration-led explainers, use `plan_explainer_director` to review primary visuals, secondary evidence, gaps, and fact-checkable information-card specs. Use `apply_explainer_director` only after review; pending information cards intentionally continue blocking release until rendered.
