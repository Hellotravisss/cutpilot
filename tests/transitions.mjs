import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { newProject, applyTimelineEdit, validateProject } from "../scripts/project-store.mjs";
import { probeOutput, renderProject } from "../scripts/media-engine.mjs";

const root = resolve(process.argv[2] || "/tmp/mycut-transitions"); mkdirSync(root, { recursive: true });
const run = (command, args) => { const result = spawnSync(command, args, { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 }); if (result.status !== 0) throw new Error(result.stderr); };
const red = `${root}/red.mp4`, blue = `${root}/blue.mp4`;
run("ffmpeg", ["-y", "-hide_banner", "-loglevel", "error", "-f", "lavfi", "-i", "color=c=red:s=160x90:r=30:d=1", "-c:v", "libx264", "-pix_fmt", "yuv420p", red]);
run("ffmpeg", ["-y", "-hide_banner", "-loglevel", "error", "-f", "lavfi", "-i", "color=c=blue:s=160x90:r=30:d=1", "-c:v", "libx264", "-pix_fmt", "yuv420p", blue]);
const types = ["cross-dissolve", "wipe-left", "wipe-right", "wipe-up", "wipe-down", "radial", "slide-left", "slide-right", "slide-up", "slide-down", "dip-black"];
const results = [];
for (const type of types) {
  const project = newProject({ name: type, width: 160, height: 90, fps: 30 });
  project.assets.push({ id: "red", path: red, name: "red", type: "video", duration: 1 }, { id: "blue", path: blue, name: "blue", type: "video", duration: 1 });
  applyTimelineEdit(project, { trackName: "V1", adds: [{ assetId: "red", start: 0, sourceStart: 0, duration: 1, label: "red", transitionOut: { type, duration: 0.4 } }, { assetId: "blue", start: 1, sourceStart: 0, duration: 1, label: "blue" }] });
  assert.ok(validateProject(project).valid);
  const output = `${root}/${type}.mp4`; renderProject(project, output, { crf: 28 });
  const frame = `${root}/${type}.png`; run("ffmpeg", ["-y", "-hide_banner", "-loglevel", "error", "-ss", type === "dip-black" ? "1.2" : "0.8", "-i", output, "-frames:v", "1", frame]);
  const hash = createHash("sha256").update(readFileSync(frame)).digest("hex");
  const probe = probeOutput(output); assert.equal(probe.streams[0].width, 160); assert.ok(Number(probe.format.duration) >= 1.95);
  results.push({ type, output, frame, hash });
}
assert.ok(new Set(results.map((entry) => entry.hash)).size >= 8, "transition midpoint frames should be visually distinct");
console.log(JSON.stringify({ types: results.map(({ type, hash }) => ({ type, hash: hash.slice(0, 12) })), uniqueFrames: new Set(results.map((entry) => entry.hash)).size, root }, null, 2));
