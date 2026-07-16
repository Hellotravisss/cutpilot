import assert from "node:assert/strict";
import { existsSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { createServer } from "node:http";
import { newProject, saveProject, loadProject, applyTimelineEdit, validateProject } from "../scripts/project-store.mjs";
import { cuesToSrt, probeOutput, renderProject } from "../scripts/media-engine.mjs";
import { parseWhisperJson, transcribeLocal } from "../scripts/transcription-engine.mjs";
import { buildSpeechEdit, findPhraseRanges, rankAssets } from "../scripts/semantic-engine.mjs";
import { renderMotionGraphic } from "../scripts/motion-graphics-engine.mjs";
import { generateLocalVoice } from "../scripts/generated-media-engine.mjs";
import { createSnapshot, listSnapshots, restoreSnapshot } from "../scripts/version-engine.mjs";
import { exportInterchange, importFcpxml } from "../scripts/interchange-engine.mjs";
import { inspectRenderedVideo } from "../scripts/visual-qa-engine.mjs";
import { markJobMaterialized, readGenerationJob, refreshGenerationJob, submitGeneration } from "../scripts/generation-job-engine.mjs";
import { renderSvgMotionGraphic, validateSvgSource } from "../scripts/svg-motion-graphics-engine.mjs";

const root = resolve(process.argv[2] || "/tmp/mycut-e2e");
mkdirSync(root, { recursive: true });
const run = (command, args) => {
  const result = spawnSync(command, args, { encoding: "utf8" });
  if (result.status !== 0) throw new Error(result.stderr);
};

const red = `${root}/red.mp4`;
const blue = `${root}/blue.mp4`;
const voiceAiff = `${root}/voice.aiff`;
const voice = `${root}/voice.wav`;
const music = `${root}/music.wav`;
const generatedVoice = `${root}/generated-voice.wav`;
const lowerThird = `${root}/lower-third.png`;
const svgSourcePath = `${root}/stat-badge.svg`;
const svgBadge = `${root}/stat-badge.png`;
run("ffmpeg", ["-y", "-hide_banner", "-loglevel", "error", "-f", "lavfi", "-i", "color=c=red:s=360x640:r=30:d=2", "-c:v", "libx264", "-pix_fmt", "yuv420p", red]);
run("ffmpeg", ["-y", "-hide_banner", "-loglevel", "error", "-f", "lavfi", "-i", "color=c=blue:s=360x640:r=30:d=2", "-c:v", "libx264", "-pix_fmt", "yuv420p", blue]);
run("say", ["-o", voiceAiff, "Hello world. This is a local MYCUT transcription and rendering test."]);
run("ffmpeg", ["-y", "-hide_banner", "-loglevel", "error", "-i", voiceAiff, "-ar", "48000", "-ac", "1", voice]);
run("ffmpeg", ["-y", "-hide_banner", "-loglevel", "error", "-f", "lavfi", "-i", "sine=frequency=220:sample_rate=48000:duration=4", "-c:a", "pcm_s16le", music]);
generateLocalVoice({ text: "MYCUT generated voice test", outputPath: generatedVoice, rate: 190 });
renderMotionGraphic({ kind: "lower-third", title: "MYCUT", subtitle: "Editable Motion Graphic", width: 320, height: 120, accentColor: "#ff6b35" }, lowerThird);
const svgSource = `<svg xmlns="http://www.w3.org/2000/svg" width="240" height="120" viewBox="0 0 240 120"><rect x="4" y="4" width="232" height="112" rx="18" fill="{{background}}" stroke="{{accent}}" stroke-width="4"/><text x="22" y="50" fill="white" font-family="Arial" font-size="24">{{label}}</text><text x="22" y="92" fill="{{accent}}" font-family="Arial" font-size="38" font-weight="bold">{{value}}</text></svg>`;
const svgProperties = [{ key: "background", label: "Background", type: "color", defaultValue: "#101827" }, { key: "accent", label: "Accent", type: "color", defaultValue: "#22d3ee" }, { key: "label", label: "Label", type: "text", defaultValue: "AI HOURS" }, { key: "value", label: "Value", type: "text", defaultValue: "1,000+" }];
renderSvgMotionGraphic({ source: svgSource, properties: svgProperties, values: { value: "1,000+" }, width: 240, height: 120, sourcePath: svgSourcePath, outputPath: svgBadge });
assert.equal(validateSvgSource(`<svg><script>alert(1)</script></svg>`).valid, false);

const modelPath = resolve(process.env.MYCUT_WHISPER_MODEL || "../work/models/ggml-tiny.bin");
const transcript = transcribeLocal({ inputPath: voice, modelPath, language: "en", outputFolder: `${root}/transcript` });
assert.ok(transcript.cues.length > 0);
assert.match(transcript.text.toLowerCase(), /local|test/);
assert.ok(transcript.cues.some((cue) => cue.words.length > 0));
const phraseMatches = findPhraseRanges(transcript, ["local"]);
assert.ok(phraseMatches.length > 0);
const speechEdit = buildSpeechEdit({ duration: 4 }, transcript, ["local"]);
assert.ok(speechEdit.duration < 4);
assert.ok(speechEdit.removed.length > 0);

const project = newProject({ name: "E2E", width: 360, height: 640, fps: 30 });
const [redId, blueId, voiceId, musicId, lowerThirdId, svgBadgeId] = ["red", "blue", "voice", "music", "lower-third", "svg-badge"];
project.assets.push(
  { id: redId, path: red, name: "red.mp4", type: "video", duration: 2, annotation: { description: "walking through a brick factory", tags: ["factory", "walking"], quality: 0.8, motion: 0.7 } },
  { id: blueId, path: blue, name: "blue.mp4", type: "video", duration: 2, annotation: { description: "wedding couple dancing", tags: ["wedding", "dance"], quality: 0.9, motion: 0.8 } },
  { id: voiceId, path: voice, name: "voice.wav", type: "audio", duration: 4, transcript },
  { id: musicId, path: music, name: "music.wav", type: "audio", duration: 4 },
  { id: lowerThirdId, path: lowerThird, name: "lower-third.png", type: "motion-graphic", duration: null, width: 320, height: 120 },
  { id: svgBadgeId, path: svgBadge, sourcePath: svgSourcePath, name: "stat-badge.png", type: "motion-graphic", duration: null, width: 240, height: 120, motionGraphic: { engine: "svg", source: svgSource, properties: svgProperties, values: { value: "1,000+" } } },
);
const ranked = rankAssets(project.assets, "wedding 婚礼 dance", { avoidAssetIds: [redId] });
assert.equal(ranked[0].assetId, blueId);
const primary = applyTimelineEdit(project, { trackName: "V1", adds: [
  { assetId: redId, start: 0, duration: 2, sourceStart: 0, label: "red", effects: [{ type: "color", brightness: 0.05, contrast: 1.1, saturation: 0.8 }], transitionIn: { type: "fade", duration: 0.25 }, transitionOut: { type: "cross-dissolve", duration: 0.35 } },
  { assetId: blueId, start: 2, duration: 2, sourceStart: 0, label: "blue", effects: [{ type: "zoom", factor: 1.08 }], transitionOut: { type: "dip-black", duration: 0.3 } },
] });
assert.equal(primary.track.items[0].effects[0].type, "color");
applyTimelineEdit(project, { trackName: "V2", adds: [
  { assetId: blueId, start: 1, duration: 1, sourceStart: 0.5, label: "overlay", opacity: 0.7, effects: [{ type: "blur", radius: 1 }] },
] });
applyTimelineEdit(project, { trackName: "V3", adds: [
  { assetId: lowerThirdId, start: 0.4, duration: 2.2, sourceStart: 0, label: "lower third", opacity: 1, transform: { x: 20, y: 405, width: 320, height: 120, fit: "contain", rotation: -1.5, animation: { enter: "slide-left", exit: "slide-right", enterDuration: 0.35, exitDuration: 0.3, distance: 180, float: true, floatAmplitude: 3, floatFrequency: 0.8 } } },
] });
applyTimelineEdit(project, { trackName: "V4", adds: [
  { assetId: svgBadgeId, start: 2.65, duration: 1.2, sourceStart: 0, label: "SVG stat badge", opacity: 1, transform: { x: 100, y: 80, width: 240, height: 120, fit: "contain", rotation: 0, keyframes: [{ time: 0, x: 370, y: 80, rotation: 8 }, { time: 0.35, x: 100, y: 80, rotation: -2 }, { time: 1.2, x: 70, y: 110, rotation: 3 }] } },
] });
applyTimelineEdit(project, { trackName: "A1", adds: [
  { assetId: voiceId, start: 0, duration: 4, sourceStart: 0, label: "narration", volumeDb: -2, audioFadeIn: 0.1, audioFadeOut: 0.2 },
] });
applyTimelineEdit(project, { trackName: "A2", adds: [
  { assetId: musicId, start: 0, duration: 4, sourceStart: 0, label: "music", volumeDb: -8, audioFadeIn: 0.1, audioFadeOut: 0.2 },
] });
project.timelines[0].tracks.find((track) => track.name === "A2").role = "follower";
project.timelines[0].captions = { enabled: true, cues: transcript.cues, style: {} };
const validation = validateProject(project);
assert.equal(validation.valid, true, validation.errors.join("\n"));
const projectPath = saveProject(`${root}/fixture.mycut.json`, project);
const snapshot = createSnapshot(projectPath, "before-name-change");
project.name = "Changed after snapshot";
saveProject(projectPath, project);
assert.ok(listSnapshots(projectPath).some((entry) => entry.id === snapshot.id));
const restored = restoreSnapshot(projectPath, snapshot.id);
assert.equal(restored.restored.id, snapshot.id);
const restoredProject = loadProject(projectPath).project;
assert.equal(restoredProject.name, "E2E");
assert.ok(listSnapshots(projectPath).some((entry) => entry.id === restored.safetySnapshot.id));
const generationJobs = [];
for (const spec of [
  { kind: "image", prompt: "MYCUT generated image", name: "Generated image", parameters: { ratio: "9:16" } },
  { kind: "video", prompt: "MYCUT generated video", name: "Generated video", parameters: { ratio: "9:16", durationSeconds: 1 } },
  { kind: "music", prompt: "MYCUT generated music", name: "Generated music", parameters: { durationSeconds: 1 } },
  { kind: "sound-effect", prompt: "MYCUT generated sound", name: "Generated sound", parameters: { durationSeconds: 0.5 } },
]) {
  const job = await submitGeneration(projectPath, { ...spec, provider: "local-procedural", model: "offline-fixture" });
  assert.equal(job.status, "completed");
  assert.ok(existsSync(job.result.outputPath));
  generationJobs.push(job);
}
markJobMaterialized(projectPath, generationJobs[0].id, "fixture-generated-asset");
assert.equal(readGenerationJob(projectPath, generationJobs[0].id).materializedAssetId, "fixture-generated-asset");
const receivedGenerationRequests = [];
const mockGenerator = createServer((request, response) => {
  let body = "";
  request.on("data", (chunk) => { body += chunk; });
  request.on("end", () => {
    const submitted = JSON.parse(body);
    receivedGenerationRequests.push({ submitted, authorization: request.headers.authorization || null });
    const sourceJob = generationJobs.find((entry) => entry.kind === submitted.kind) || generationJobs[0];
    response.writeHead(200, { "content-type": "application/json" });
    response.end(JSON.stringify({ id: "remote-fixture", status: "completed", outputPath: sourceJob.result.outputPath, receivedKind: submitted.kind }));
  });
});
await new Promise((resolveListen) => mockGenerator.listen(0, "127.0.0.1", resolveListen));
const address = mockGenerator.address();
const httpJob = await submitGeneration(projectPath, { kind: "image", provider: "http", model: "mock-provider", prompt: "HTTP adapter fixture", name: "HTTP image", parameters: { endpoint: `http://127.0.0.1:${address.port}/generate` } });
assert.equal(httpJob.status, "completed");
assert.ok(existsSync(httpJob.result.outputPath));
const namedSpecs = [{ provider: "seedance", kind: "video", model: "seedance2" }, { provider: "kling", kind: "video", model: "kling-v2" }, { provider: "mureka", kind: "music", model: "mureka" }, { provider: "sound-effect", kind: "sound-effect", model: "sfx" }];
for (const spec of namedSpecs) {
  const prefix = spec.provider === "sound-effect" ? "SFX" : spec.provider.toUpperCase();
  process.env[`MYCUT_${prefix}_ENDPOINT`] = `http://127.0.0.1:${address.port}/generate`;
  process.env[`MYCUT_${prefix}_TOKEN`] = "fixture-token";
  const namedJob = await submitGeneration(projectPath, { ...spec, prompt: `${spec.provider} fixture`, name: `${spec.provider} output`, parameters: { durationSeconds: 1 } });
  assert.equal(namedJob.status, "completed");
  assert.ok(existsSync(namedJob.result.outputPath));
}
mockGenerator.close();
assert.deepEqual(receivedGenerationRequests.slice(-4).map((entry) => entry.submitted.provider), namedSpecs.map((entry) => entry.provider));
assert.ok(receivedGenerationRequests.slice(-4).every((entry) => entry.authorization === "Bearer fixture-token"));
let asyncPort;
const asyncGenerator = createServer((request, response) => {
  response.writeHead(200, { "content-type": "application/json" });
  if (request.method === "POST") response.end(JSON.stringify({ jobId: "async-fixture", status: "submitted", statusUrl: `http://127.0.0.1:${asyncPort}/status/async-fixture` }));
  else response.end(JSON.stringify({ jobId: "async-fixture", status: "completed", outputPath: generationJobs[0].result.outputPath }));
});
await new Promise((resolveListen) => asyncGenerator.listen(0, "127.0.0.1", resolveListen));
asyncPort = asyncGenerator.address().port;
const pendingHttpJob = await submitGeneration(projectPath, { kind: "image", provider: "http", model: "mock-async", prompt: "Async HTTP adapter fixture", name: "Async HTTP image", parameters: { endpoint: `http://127.0.0.1:${asyncPort}/generate` } });
assert.equal(pendingHttpJob.status, "submitted");
const completedHttpJob = await refreshGenerationJob(projectPath, pendingHttpJob.id);
asyncGenerator.close();
assert.equal(completedHttpJob.status, "completed");
assert.ok(existsSync(completedHttpJob.result.outputPath));
const fcpxml = exportInterchange(restoredProject, `${root}/fixture.fcpxml`, "fcpxml");
const premiereXml = exportInterchange(restoredProject, `${root}/fixture-premiere.xml`, "premiere-xml");
const edl = exportInterchange(restoredProject, `${root}/fixture.edl`, "edl");
run("xmllint", ["--noout", fcpxml]);
run("xmllint", ["--noout", premiereXml]);
run("grep", ["FROM CLIP NAME", edl]);
const roundtrip = importFcpxml(fcpxml, `${root}/roundtrip.mycut.json`);
const originalTimeline = restoredProject.timelines.find((entry) => entry.id === restoredProject.activeTimelineId), importedTimeline = roundtrip.project.timelines[0];
assert.equal(importedTimeline.width, originalTimeline.width); assert.equal(importedTimeline.height, originalTimeline.height); assert.equal(importedTimeline.fps, originalTimeline.fps);
assert.equal(importedTimeline.tracks.flatMap((track) => track.items).length, originalTimeline.tracks.filter((track) => !track.muted).flatMap((track) => track.items).length);
for (const imported of importedTimeline.tracks.flatMap((track) => track.items)) { const original = originalTimeline.tracks.flatMap((track) => track.items).find((item) => (item.label || "clip") === imported.label); assert.ok(original); assert.ok(Math.abs(original.start - imported.start) < 1 / originalTimeline.fps); assert.ok(Math.abs(original.sourceStart - imported.sourceStart) < 1 / originalTimeline.fps); assert.ok(Math.abs(original.duration - imported.duration) < 1 / originalTimeline.fps); }
assert.deepEqual(importedTimeline.tracks.flatMap((track) => track.items).find((item) => item.label === "red").effects, originalTimeline.tracks.flatMap((track) => track.items).find((item) => item.label === "red").effects);
assert.deepEqual(importedTimeline.tracks.flatMap((track) => track.items).find((item) => item.label === "lower third").transform, originalTimeline.tracks.flatMap((track) => track.items).find((item) => item.label === "lower third").transform);
const output = `${root}/fixture.mp4`;
const render = renderProject(restoredProject, output, { burnCaptions: true, crf: 28 });
const probe = probeOutput(output);
const visualQa = inspectRenderedVideo(output, `${root}/visual-qa.jpg`, { samples: 8, blackMinimum: 0.8, freezeMinimum: 5 });
assert.equal(visualQa.samples, 8);
assert.equal(visualQa.blackSegments.length, 0);
const videoStream = probe.streams.find((stream) => stream.codec_type === "video");
const audioStream = probe.streams.find((stream) => stream.codec_type === "audio");
assert.equal(videoStream.width, 360);
assert.equal(videoStream.height, 640);
assert.ok(audioStream);
assert.ok(probeOutput(generatedVoice).streams.some((stream) => stream.codec_type === "audio"));
assert.ok(Number(probe.format.duration) >= 3.9 && Number(probe.format.duration) <= 4.1);
assert.match(cuesToSrt(transcript.cues), /-->/);
assert.equal(render.duckingApplied, true);
assert.equal(render.videoItems, 5);
console.log(JSON.stringify({ projectPath, output, snapshot: { created: snapshot.id, safety: restored.safetySnapshot.id }, generationJobs: generationJobs.map((job) => ({ id: job.id, kind: job.kind, status: job.status, outputPath: job.result.outputPath })), interchange: { fcpxml, edl }, visualQa: { contactSheetPath: visualQa.contactSheetPath, blackSegments: visualQa.blackSegments, frozenSegments: visualQa.frozenSegments }, render, ranked, phraseMatches, speechEdit: { removed: speechEdit.removed, duration: speechEdit.duration }, transcript: { language: transcript.language, cues: transcript.cues.length, text: transcript.text }, probe }, null, 2));
