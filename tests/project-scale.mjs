import assert from "node:assert/strict";
import { mkdirSync, rmSync } from "node:fs";
import { resolve } from "node:path";
import { performance } from "node:perf_hooks";
import { activeTimeline, loadProject, newProject, saveProject, validateProject } from "../scripts/project-store.mjs";

const root = resolve("/tmp/cutpilot-project-scale"), path = `${root}/four-hour.cutpilot.json`;
rmSync(root, { recursive: true, force: true }); mkdirSync(root, { recursive: true });
const project = newProject({ name: "Four-hour stress fixture", width: 3840, height: 2160, fps: 29.97 }), timeline = activeTimeline(project);
for (let index = 0; index < 600; index++) project.assets.push({ id: `asset-${index}`, name: `Camera ${index}.mov`, path: `/offline/camera-${index}.mov`, type: "video", duration: 30, width: 3840, height: 2160, fps: 29.97, hasAudio: true, tags: [index % 2 ? "wedding" : "speech"] });
for (let index = 0; index < 480; index++) timeline.tracks[0].items.push({ id: `clip-${index}`, assetId: `asset-${index % 600}`, label: `Shot ${index}`, start: index * 30, sourceStart: 0, duration: 30, opacity: 1, playbackRate: 1 });
const started = performance.now(); saveProject(path, project); const firstSaveMs = performance.now() - started;
for (let index = 0; index < 10; index++) { project.history.push({ at: new Date().toISOString(), action: "stress-edit", index }); saveProject(path, project); }
const loaded = loadProject(path).project, validation = validateProject(loaded), duration = Math.max(...activeTimeline(loaded).tracks[0].items.map((item) => item.start + item.duration));
assert.equal(validation.valid, true); assert.equal(loaded.assets.length, 600); assert.equal(activeTimeline(loaded).tracks[0].items.length, 480); assert.equal(duration, 14400); assert.ok(firstSaveMs < 5000);
console.log(JSON.stringify({ ok: true, assets: loaded.assets.length, clips: 480, durationHours: duration / 3600, firstSaveMs: Math.round(firstSaveMs) }, null, 2));
