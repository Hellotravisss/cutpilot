import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, rmSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { applyTimelineEdit, newProject } from "../scripts/project-store.mjs";
import { probeOutput, renderProject } from "../scripts/media-engine.mjs";

const root = resolve(process.argv[2] || "/tmp/mycut-keyframe-curves");
rmSync(root, { recursive: true, force: true }); mkdirSync(root, { recursive: true });
const run = (command, args) => { const result = spawnSync(command, args, { encoding: "utf8", maxBuffer: 32 * 1024 * 1024 }); if (result.status) throw new Error(result.stderr); };
const background = `${root}/background.mp4`, badge = `${root}/badge.png`, output = `${root}/keyframes.mp4`;
run("ffmpeg", ["-y", "-hide_banner", "-loglevel", "error", "-f", "lavfi", "-i", "color=c=0x101827:s=320x180:r=30:d=2", "-c:v", "libx264", "-pix_fmt", "yuv420p", background]);
run("magick", ["-size", "80x50", "xc:none", "-fill", "#40e0d0", "-draw", "roundrectangle 2,2 78,48 10,10", "-fill", "#101827", "-draw", "rectangle 15,19 65,31", badge]);
const project = newProject({ name: "Keyframe curves", width: 320, height: 180, fps: 30 });
project.assets.push({ id: "bg", path: background, name: "background", type: "video", duration: 2 }, { id: "badge", path: badge, name: "badge", type: "image", duration: null });
applyTimelineEdit(project, { trackName: "V1", adds: [{ assetId: "bg", start: 0, sourceStart: 0, duration: 2 }] });
applyTimelineEdit(project, { trackName: "V2", adds: [{ assetId: "badge", start: 0, sourceStart: 0, duration: 2, transform: { width: 80, height: 50, fit: "contain", keyframes: [
  { time: 0, x: 10, y: 20, scale: 0.6, rotation: -8, opacity: 0.2, easing: "ease-in-out" },
  { time: 1, x: 120, y: 70, scale: 1.25, rotation: 4, opacity: 1, easing: "bezier", bezier: { y1: 0.1, y2: 0.9 } },
  { time: 2, x: 225, y: 25, scale: 0.8, rotation: 12, opacity: 0.4, easing: "linear" },
] } }] });
renderProject(project, output, { crf: 18 });
const probe = probeOutput(output); assert.ok(Number(probe.format.duration) >= 1.9);
const frames = [0.2, 1, 1.8].map((time, index) => { const path = `${root}/frame-${index}.png`; run("ffmpeg", ["-y", "-hide_banner", "-loglevel", "error", "-ss", String(time), "-i", output, "-frames:v", "1", path]); return path; });
const hashes = frames.map((path) => createHash("sha256").update(readFileSync(path)).digest("hex"));
assert.equal(new Set(hashes).size, 3, "keyframed frames must be visually distinct");
console.log(JSON.stringify({ output, frames, hashes, probe }, null, 2));
