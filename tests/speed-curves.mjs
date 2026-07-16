import assert from "node:assert/strict";
import { mkdirSync, readFileSync, rmSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { applyTimelineEdit, newProject, validateProject } from "../scripts/project-store.mjs";
import { probeOutput, renderProject } from "../scripts/media-engine.mjs";
import { buildSpeedSegments, playbackSourceSpan, speedAtTime, validateSpeedCurve } from "../scripts/speed-curve-engine.mjs";
import { splitTimelineItem, trimTimelineItem } from "../scripts/timeline-operations-engine.mjs";

const root = resolve(process.argv[2] || "/tmp/mycut-speed-curves"); rmSync(root, { recursive: true, force: true }); mkdirSync(root, { recursive: true });
const run = (command, args) => { const result = spawnSync(command, args, { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 }); if (result.status) throw new Error(result.stderr); };
const video = `${root}/source.mp4`, audio = `${root}/source.wav`, output = `${root}/curve.mp4`;
run("ffmpeg", ["-y", "-hide_banner", "-loglevel", "error", "-f", "lavfi", "-i", "testsrc2=s=240x136:r=20:d=12", "-c:v", "libx264", "-g", "1", "-crf", "12", "-pix_fmt", "yuv420p", video]);
run("ffmpeg", ["-y", "-hide_banner", "-loglevel", "error", "-f", "lavfi", "-i", "aevalsrc=sin(2*PI*(180*t+45*t*t)):s=48000:d=12", "-c:a", "pcm_s16le", audio]);

const curve = [{ time: 0, rate: 0.5, easing: "ease-in-out" }, { time: 0.7, rate: 3, easing: "ease-out" }, { time: 1.4, rate: 0.75, easing: "ease-in" }, { time: 2, rate: 1.5, easing: "linear" }];
const normalized = validateSpeedCurve(curve, 2), segments = buildSpeedSegments(curve, 2, 1, 0.05), span = segments.at(-1).sourceEnd;
assert.equal(normalized.length, 4); assert.ok(span > 2 && span < 4); assert.ok(speedAtTime(normalized, 0.7) > 2.9); assert.throws(() => validateSpeedCurve([{ time: 0, rate: 1 }, { time: 0, rate: 2 }], 2), /unique/);

const project = newProject({ name: "Speed curves", width: 240, height: 136, fps: 20 });
project.assets.push({ id: "v", path: video, name: "source", type: "video", duration: 12, width: 240, height: 136 }, { id: "a", path: audio, name: "source audio", type: "audio", duration: 12 });
const items = [{ assetId: "v", start: 0, sourceStart: 1, duration: 2, label: "curve forward", playbackRate: 1, speedCurve: curve }, { assetId: "v", start: 2, sourceStart: 5, duration: 2, label: "curve reverse", playbackRate: 1, speedCurve: curve, reverse: true }];
applyTimelineEdit(project, { trackName: "V1", adds: items });
applyTimelineEdit(project, { trackName: "A1", adds: items.map((item) => ({ ...item, assetId: "a" })) });
assert.ok(validateProject(project).valid); assert.ok(Math.abs(playbackSourceSpan(project.timelines[0].tracks[0].items[0]) - span) < 0.02);
assert.ok(validateProject({ ...project, assets: project.assets.map((asset) => ({ ...asset, duration: asset.id === "v" ? 2 : asset.duration })) }).warnings.some((warning) => warning.includes("needs source")));
const splitProject = structuredClone(project), splitTrack = splitProject.timelines[0].tracks.find((track) => track.name === "V1"), originalForward = splitTrack.items[0], originalSpan = playbackSourceSpan(originalForward);
const splitForward = splitTimelineItem(splitProject, originalForward.id, 0.8); assert.ok(Math.abs(playbackSourceSpan(splitForward.left) + playbackSourceSpan(splitForward.right) - originalSpan) < 0.03); assert.ok(splitForward.right.sourceStart > splitForward.left.sourceStart);
const originalReverse = splitTrack.items.find((item) => item.reverse), reverseSpan = playbackSourceSpan(originalReverse), splitReverse = splitTimelineItem(splitProject, originalReverse.id, 2.8); assert.ok(Math.abs(playbackSourceSpan(splitReverse.left) + playbackSourceSpan(splitReverse.right) - reverseSpan) < 0.03); assert.ok(splitReverse.left.sourceStart > splitReverse.right.sourceStart);
const trimProject = structuredClone(project), trimItem = trimProject.timelines[0].tracks.find((track) => track.name === "V1").items[0], beforeTrimSource = trimItem.sourceStart; trimTimelineItem(trimProject, trimItem.id, { newStart: 0.5 }); assert.ok(trimItem.sourceStart > beforeTrimSource); assert.equal(trimItem.speedCurve[0].time, 0);

const result = renderProject(project, output, { crf: 15 }), probe = probeOutput(output);
assert.ok(Number(probe.format.duration) >= 3.95 && Number(probe.format.duration) <= 4.1); assert.ok(probe.streams.some((stream) => stream.codec_type === "audio"));
const frame = (input, at, name) => { const path = `${root}/${name}.rgb`; run("ffmpeg", ["-y", "-hide_banner", "-loglevel", "error", "-ss", String(at), "-i", input, "-frames:v", "1", "-pix_fmt", "rgb24", "-f", "rawvideo", path]); return readFileSync(path); };
const meanError = (a, b) => { let sum = 0; for (let index = 0; index < a.length; index++) sum += Math.abs(a[index] - b[index]); return sum / a.length; };
const forwardEarly = frame(output, 0.15, "forward-early"), forwardLate = frame(output, 1.85, "forward-late");
const reverseEarly = frame(output, 2.15, "reverse-early"), reverseLate = frame(output, 3.85, "reverse-late");
const isBlack = (pixels) => pixels.reduce((sum, value) => sum + value, 0) / pixels.length < 3; assert.equal(isBlack(forwardLate), false, "forward curve must cover its full timeline duration"); assert.equal(isBlack(reverseLate), false, "reverse curve must cover its full timeline duration");
assert.notDeepEqual(forwardEarly, forwardLate); assert.notDeepEqual(reverseEarly, reverseLate);
const consumedAt = (time) => segments.reduce((sum, segment) => sum + (time >= segment.end ? segment.sourceDuration : time <= segment.start ? 0 : (time - segment.start) * segment.rate), 0);
const reverseHighSource = frame(video, 5 + span - consumedAt(0.15), "reverse-high-source"), reverseLowSource = frame(video, 5 + span - consumedAt(1.85), "reverse-low-source");
assert.ok(meanError(reverseEarly, reverseHighSource) < meanError(reverseEarly, reverseLowSource), "reverse curve must begin near the high source boundary");
assert.ok(meanError(reverseLate, reverseLowSource) < meanError(reverseLate, reverseHighSource), "reverse curve must end near the low source boundary");
console.log(JSON.stringify({ result, probe, curve: normalized, sampledSegments: segments.length, sourceSpan: span, reverseDirectionErrors: { earlyHigh: meanError(reverseEarly, reverseHighSource), earlyLow: meanError(reverseEarly, reverseLowSource), lateLow: meanError(reverseLate, reverseLowSource), lateHigh: meanError(reverseLate, reverseHighSource) } }, null, 2));
