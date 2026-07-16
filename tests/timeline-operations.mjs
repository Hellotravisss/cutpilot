import assert from "node:assert/strict";
import { newProject, applyTimelineEdit, validateProject } from "../scripts/project-store.mjs";
import { insertTimelineGap, razorAllTracks, rippleDeleteItem, splitTimelineItem, trimTimelineItem } from "../scripts/timeline-operations-engine.mjs";

const project = newProject({ name: "Timeline operations", width: 360, height: 640, fps: 30 });
project.assets.push({ id: "video", path: "/tmp/video.mp4", name: "video", type: "video", duration: 10 }, { id: "audio", path: "/tmp/audio.wav", name: "audio", type: "audio", duration: 10 });
applyTimelineEdit(project, { trackName: "V1", adds: [{ assetId: "video", start: 0, sourceStart: 0, duration: 2, label: "A", transform: { keyframes: [{ time: 0, x: 0 }, { time: 2, x: 100 }] } }, { assetId: "video", start: 2, sourceStart: 2, duration: 2, label: "B" }] });
applyTimelineEdit(project, { trackName: "A1", adds: [{ assetId: "audio", start: 0, sourceStart: 0, duration: 4, label: "Audio" }] });
project.timelines[0].captions = { enabled: true, style: {}, cues: [{ start: 0, end: 2, text: "first" }, { start: 2, end: 4, text: "second" }] };

const firstId = project.timelines[0].tracks.find((track) => track.name === "V1").items[0].id;
const split = splitTimelineItem(project, firstId, 1);
assert.equal(split.left.duration, 1);
assert.equal(split.right.sourceStart, 1);
assert.equal(split.right.transform.keyframes[0].time, 1);
trimTimelineItem(project, split.right.id, { newStart: 1.2 });
assert.equal(Number(split.right.sourceStart.toFixed(2)), 1.2);
assert.equal(Number(split.right.duration.toFixed(2)), 0.8);

insertTimelineGap(project, 2, 1, "all");
const v1 = project.timelines[0].tracks.find((track) => track.name === "V1");
assert.equal(v1.items.find((item) => item.label === "B").start, 3);
const a1 = project.timelines[0].tracks.find((track) => track.name === "A1");
assert.equal(a1.items.length, 2, "audio crossing the gap is split");
assert.equal(a1.items[1].start, 3);
assert.equal(project.timelines[0].captions.cues[0].end, 2);
assert.equal(project.timelines[0].captions.cues[1].start, 3);

const razor = razorAllTracks(project, 0.5);
assert.ok(razor.splits.length >= 2);
const deleteId = v1.items.find((item) => item.start === 0.5).id;
const deletion = rippleDeleteItem(project, deleteId, "all");
assert.equal(deletion.delta, 0.5);
assert.ok(validateProject(project).valid);
assert.ok(a1.items.every((item, index, items) => index === 0 || item.start >= items[index - 1].start + items[index - 1].duration - 0.0001));

console.log(JSON.stringify({ split: { left: split.left.id, right: split.right.id }, gap: { videoBStart: v1.items.find((item) => item.label === "B")?.start, audioItems: a1.items.length }, razorSplits: razor.splits.length, rippleDelta: deletion.delta, validation: validateProject(project) }, null, 2));
