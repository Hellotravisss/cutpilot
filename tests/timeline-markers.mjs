import assert from "node:assert/strict";
import { addTimelineMarker, deleteTimelineMarker, updateTimelineMarker } from "../scripts/marker-engine.mjs";
import { applyTimelineEdit, newProject } from "../scripts/project-store.mjs";

const project = newProject({ name: "Marker test", width: 1920, height: 1080, fps: 30 });
project.assets.push({ id: "video", name: "video", type: "video", path: "/tmp/video.mp4", duration: 10 });
applyTimelineEdit(project, { trackName: "V1", adds: [{ assetId: "video", start: 0, sourceStart: 0, duration: 10 }] });
const added = addTimelineMarker(project, { time: 3.5, label: "婚礼镜头", color: "purple", note: "换成近景" });
assert.equal(added.marker.label, "婚礼镜头"); assert.equal(added.marker.color, "purple");
const updated = updateTimelineMarker(project, added.marker.id, { time: 4, label: "婚礼特写", color: "red" });
assert.deepEqual([updated.marker.time, updated.marker.label, updated.marker.color], [4, "婚礼特写", "red"]);
assert.throws(() => addTimelineMarker(project, { time: 11 }), /within/);
assert.equal(deleteTimelineMarker(project, added.marker.id).markers.length, 0);
console.log(JSON.stringify({ ok: true, history: project.history.length }));
