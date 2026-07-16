import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, rmSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { applyTimelineEdit, newProject, validateProject } from "../scripts/project-store.mjs";
import { probeOutput, renderProject } from "../scripts/media-engine.mjs";
import { compileVisualEffectFilters, validateEffectStack } from "../scripts/visual-effects-engine.mjs";

const root = resolve(process.argv[2] || "/tmp/mycut-visual-effects"); rmSync(root, { recursive: true, force: true }); mkdirSync(root, { recursive: true });
const run = (command, args) => { const result = spawnSync(command, args, { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 }); if (result.status) throw new Error(result.stderr); };
const base = `${root}/base.mp4`, green = `${root}/green.mp4`, yellow = `${root}/yellow.mp4`, grade = `${root}/grade.mp4`, output = `${root}/effects.mp4`;
run("ffmpeg", ["-y", "-hide_banner", "-loglevel", "error", "-f", "lavfi", "-i", "color=c=0x2050d0:s=320x180:r=20:d=4", "-c:v", "libx264", "-pix_fmt", "yuv420p", base]);
run("ffmpeg", ["-y", "-hide_banner", "-loglevel", "error", "-f", "lavfi", "-i", "color=c=0x00ff00:s=320x180:r=20:d=1", "-vf", "drawbox=x=110:y=45:w=100:h=90:color=0xff2020:t=fill", "-c:v", "libx264", "-pix_fmt", "yuv420p", green]);
run("ffmpeg", ["-y", "-hide_banner", "-loglevel", "error", "-f", "lavfi", "-i", "color=c=0xf4d020:s=320x180:r=20:d=1", "-c:v", "libx264", "-pix_fmt", "yuv420p", yellow]);
run("ffmpeg", ["-y", "-hide_banner", "-loglevel", "error", "-f", "lavfi", "-i", "testsrc2=s=320x180:r=20:d=1", "-c:v", "libx264", "-pix_fmt", "yuv420p", grade]);

const project = newProject({ name: "Visual effects", width: 320, height: 180, fps: 20 });
project.assets.push({ id: "base", path: base, name: "Blue base", type: "video", duration: 4, width: 320, height: 180 }, { id: "green", path: green, name: "Green screen", type: "video", duration: 1, width: 320, height: 180 }, { id: "yellow", path: yellow, name: "Mask source", type: "video", duration: 1, width: 320, height: 180 }, { id: "grade", path: grade, name: "Grade source", type: "video", duration: 1, width: 320, height: 180 });
applyTimelineEdit(project, { trackName: "V1", adds: [{ assetId: "base", start: 0, sourceStart: 0, duration: 4, label: "background" }] });
applyTimelineEdit(project, { trackName: "V2", adds: [
  { assetId: "green", start: 0, sourceStart: 0, duration: 1, label: "chroma", effects: [{ type: "chroma-key", color: "#00ff00", similarity: 0.16, blend: 0.04 }] },
  { assetId: "yellow", start: 1, sourceStart: 0, duration: 1, label: "mask", effects: [{ type: "mask", shape: "ellipse", x: 80, y: 20, width: 160, height: 140, feather: 18, invert: false }] },
  { assetId: "grade", start: 2, sourceStart: 0, duration: 1, label: "grade", effects: [{ type: "color-grade", exposure: 0.3, contrast: 1.18, saturation: 0.78, temperature: 0.35, tint: 0.08, redShadows: -0.08, blueShadows: 0.12, redHighlights: 0.15, blueHighlights: -0.08, preserveLightness: true }, { type: "curves", preset: "vintage" }, { type: "vignette", angle: 0.62, softness: 0.6 }] },
  { assetId: "yellow", start: 3, sourceStart: 0, duration: 1, label: "inverted mask", effects: [{ type: "mask", shape: "ellipse", x: 80, y: 20, width: 160, height: 140, feather: 10, invert: true }] },
] });
assert.equal(validateProject(project).valid, true); assert.throws(() => validateEffectStack([{ type: "chroma-key", color: "green" }]), /RRGGBB/); assert.throws(() => validateEffectStack([{ type: "mask", shape: "triangle", width: 1, height: 1 }]), /shape/);
const compiled = compileVisualEffectFilters(project.timelines[0].tracks.find((track) => track.name === "V2").items[1].effects, { canvasWidth: 320, canvasHeight: 180 }); assert.ok(compiled.filters.some((filter) => filter.startsWith("geq=")));
const result = renderProject(project, output, { crf: 12 }), probe = probeOutput(output); assert.equal(Number(probe.format.duration), 4);
const extract = (at, name, input = output) => { const path = `${root}/${name}.rgb`; run("ffmpeg", ["-y", "-hide_banner", "-loglevel", "error", "-ss", String(at), "-i", input, "-frames:v", "1", "-pix_fmt", "rgb24", "-f", "rawvideo", path]); return readFileSync(path); };
const pixel = (buffer, x, y) => [...buffer.subarray((y * 320 + x) * 3, (y * 320 + x) * 3 + 3)]; const distance = (a, b) => a.reduce((sum, value, index) => sum + Math.abs(value - b[index]), 0);
const chroma = extract(0.5, "chroma"), mask = extract(1.5, "mask"), graded = extract(2.5, "graded"), inverted = extract(3.5, "inverted"), rawGrade = extract(0.5, "raw-grade", grade);
const blueReference = [32, 80, 208]; assert.ok(distance(pixel(chroma, 20, 20), blueReference) < 80, `chroma corner ${pixel(chroma, 20, 20)}`); assert.ok(pixel(chroma, 160, 90)[0] > 180 && pixel(chroma, 160, 90)[1] < 90);
assert.ok(distance(pixel(mask, 10, 10), blueReference) < 80); assert.ok(pixel(mask, 160, 90)[0] > 180 && pixel(mask, 160, 90)[1] > 140); const featherPixel = pixel(mask, 80, 90); assert.ok(featherPixel[0] > 80 && featherPixel[0] < 220 && featherPixel[2] > 60 && featherPixel[2] < 190, `feather pixel ${featherPixel}`);
const gradedHash = createHash("sha256").update(graded).digest("hex"), rawHash = createHash("sha256").update(rawGrade).digest("hex"); assert.notEqual(gradedHash, rawHash); const luminance = (rgb) => rgb.reduce((sum, value) => sum + value, 0); assert.ok(luminance(pixel(graded, 160, 90)) > luminance(pixel(graded, 8, 8)));
assert.ok(distance(pixel(inverted, 160, 90), blueReference) < 80); assert.ok(pixel(inverted, 10, 10)[0] > 180 && pixel(inverted, 10, 10)[1] > 140);
console.log(JSON.stringify({ result, probe, frames: { chroma: `${root}/chroma.rgb`, mask: `${root}/mask.rgb`, graded: `${root}/graded.rgb`, inverted: `${root}/inverted.rgb` }, samples: { chromaCorner: pixel(chroma, 20, 20), chromaCenter: pixel(chroma, 160, 90), maskCorner: pixel(mask, 10, 10), maskCenter: pixel(mask, 160, 90), maskFeather: featherPixel, gradeCenter: pixel(graded, 160, 90), gradeCorner: pixel(graded, 8, 8), invertedCenter: pixel(inverted, 160, 90), invertedCorner: pixel(inverted, 10, 10) }, hashes: { gradedHash, rawHash } }, null, 2));
