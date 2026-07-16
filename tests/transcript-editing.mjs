import assert from "node:assert/strict";
import { mkdirSync, rmSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { activeTimeline, newProject, validateProject } from "../scripts/project-store.mjs";
import { applyTranscriptSequence, buildTranscriptSequence, readTranscriptEdit, transcriptSourceSegments } from "../scripts/transcript-edit-engine.mjs";
import { probeOutput, renderProject } from "../scripts/media-engine.mjs";

const root = resolve(process.argv[2] || "/tmp/mycut-transcript-editing"); rmSync(root, { recursive: true, force: true }); mkdirSync(root, { recursive: true });
const run = (command, args) => { const result = spawnSync(command, args, { encoding: "utf8" }); if (result.status !== 0) throw new Error(result.stderr); return result.stdout; };
const source = `${root}/source.mp4`;
run("ffmpeg", ["-y", "-hide_banner", "-loglevel", "error", "-f", "lavfi", "-i", "color=c=red:s=320x180:r=25:d=1", "-f", "lavfi", "-i", "sine=frequency=220:sample_rate=48000:duration=1", "-f", "lavfi", "-i", "color=c=green:s=320x180:r=25:d=1", "-f", "lavfi", "-i", "sine=frequency=440:sample_rate=48000:duration=1", "-f", "lavfi", "-i", "color=c=blue:s=320x180:r=25:d=1", "-f", "lavfi", "-i", "sine=frequency=880:sample_rate=48000:duration=1", "-filter_complex", "[0:v][1:a][2:v][3:a][4:v][5:a]concat=n=3:v=1:a=1[v][a]", "-map", "[v]", "-map", "[a]", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", source]);
const transcript = { language: "en", text: "First. Remove me. Last.", cues: [
  { start: 0, end: 1, text: "First.", words: [{ start: 0.1, end: 0.8, text: "First." }] },
  { start: 1, end: 2, text: "Remove me.", words: [{ start: 1.1, end: 1.45, text: "Remove " }, { start: 1.45, end: 1.85, text: "me." }] },
  { start: 2, end: 3, text: "Last.", words: [{ start: 2.1, end: 2.8, text: "Last." }] },
] };
const project = newProject({ name: "Transcript reorder", width: 320, height: 180, fps: 25 }), asset = { id: "talking-head", path: source, name: "Talking head", type: "video", duration: 3, hasAudio: true, transcript }; project.assets.push(asset);
const defaults = transcriptSourceSegments(asset); assert.equal(defaults.length, 3); const sequence = buildTranscriptSequence(asset, [defaults[2], defaults[0]]); assert.equal(sequence.duration, 2); assert.deepEqual(sequence.captions.map((cue) => cue.text), ["Last.", "First."]); assert.deepEqual(sequence.items.map((item) => item.sourceStart), [2, 0]);
const applied = applyTranscriptSequence(project, { assetId: asset.id, segments: [defaults[2], defaults[0]], includeVideo: true, includeAudio: true }); const timeline = activeTimeline(project), videoItems = timeline.tracks.find((track) => track.name === "V1").items, audioItems = timeline.tracks.find((track) => track.name === "A1").items;
assert.deepEqual(videoItems.map((item) => item.sourceStart), [2, 0]); assert.deepEqual(audioItems.map((item) => item.sourceStart), [2, 0]); assert.deepEqual(timeline.captions.cues.map((cue) => cue.text), ["Last.", "First."]); assert.equal(timeline.transcriptEdit.segments.length, 2); assert.equal(readTranscriptEdit(project).sequence.segments[0].label, "Last."); assert.equal(validateProject(project).valid, true);
const output = `${root}/reordered.mp4`; renderProject(project, output, { burnCaptions: false }); const probe = probeOutput(output); assert.ok(Math.abs(Number(probe.format.duration) - 2) < 0.06); assert.ok(probe.streams.some((stream) => stream.codec_type === "audio"));
const frames = [0.5, 1.5].map((time, index) => { const path = `${root}/frame-${index}.png`; run("ffmpeg", ["-y", "-hide_banner", "-loglevel", "error", "-ss", String(time), "-i", output, "-frames:v", "1", path]); return path; });
const means = frames.map((path) => run("magick", [path, "-format", "%[fx:mean.r],%[fx:mean.g],%[fx:mean.b]", "info:"]).trim().split(",").map(Number)); assert.ok(means[0][2] > means[0][0] * 2, `First reordered segment should be blue: ${means[0]}`); assert.ok(means[1][0] > means[1][2] * 2, `Second reordered segment should be red: ${means[1]}`);
assert.throws(() => buildTranscriptSequence(asset, [{ sourceStart: 0, sourceEnd: 4 }]), /Invalid transcript segment/); assert.throws(() => applyTranscriptSequence(project, { assetId: asset.id, segments: [] }), /at least one/);
console.log(JSON.stringify({ ok: true, duration: applied.duration, sourceOrder: videoItems.map((item) => item.sourceStart), captions: timeline.captions.cues.map((cue) => cue.text), output, means }, null, 2));
