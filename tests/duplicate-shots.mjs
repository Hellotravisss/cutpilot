import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { averageHash, findDuplicateShots, hashSimilarity, removeDuplicateShots } from "../scripts/duplicate-shot-engine.mjs";
import { activeTimeline, applyTimelineEdit, newProject, projectDuration } from "../scripts/project-store.mjs";

const dark = Buffer.alloc(64); for (let i = 0; i < 32; i++) dark[i] = 255;
const same = Buffer.from(dark), different = Buffer.alloc(64); for (let i = 0; i < 64; i += 2) different[i] = 255;
assert.equal(hashSimilarity(averageHash(dark), averageHash(same)), 1);
assert.ok(hashSimilarity(averageHash(dark), averageHash(different)) < .8);

const root = mkdtempSync(join(tmpdir(), "cutpilot-duplicates-")), video = join(root, "pattern.mp4");
const made = spawnSync("ffmpeg", ["-y", "-hide_banner", "-loglevel", "error", "-f", "lavfi", "-i", "testsrc2=s=320x180:r=24:d=2", "-c:v", "libx264", "-pix_fmt", "yuv420p", video], { encoding: "utf8" }); assert.equal(made.status, 0, made.stderr);
const project = newProject({ name: "Duplicates", width: 320, height: 180, fps: 24 }); project.assets.push({ id: "walk", name: "walk.mp4", type: "video", path: video, duration: 2, width: 320, height: 180 });
applyTimelineEdit(project, { trackName: "V1", adds: [{ assetId: "walk", start: 0, sourceStart: 0, duration: 1, label: "走路首次" }, { assetId: "walk", start: 1, sourceStart: 0, duration: 1, label: "走路重复" }] });
const analysis = findDuplicateShots(project, { threshold: .95 }); assert.equal(analysis.pairs.length, 1); assert.equal(analysis.pairs[0].similarity, 1); assert.equal(analysis.pairs[0].second.label, "走路重复");
const result = removeDuplicateShots(project, [analysis.pairs[0].duplicateItemId], { ripple: true }); assert.equal(result.removed.length, 1); assert.equal(activeTimeline(project).tracks[0].items.length, 1); assert.equal(projectDuration(activeTimeline(project)), 1);
console.log(JSON.stringify({ ok: true, detector: analysis.detector, similarity: analysis.pairs[0].similarity, duration: projectDuration(activeTimeline(project)) }));
