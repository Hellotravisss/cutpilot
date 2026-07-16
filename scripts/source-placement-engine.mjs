import { randomUUID } from "node:crypto";
import { activeTimeline, validateProject } from "./project-store.mjs";
import { insertTimelineGap, playbackSlice, sliceReframe } from "./timeline-operations-engine.mjs";

const endOf = (item) => item.start + item.duration;
const resetLeftBoundary = (item) => ({ ...item, transitionOut: undefined, fadeOut: 0, audioFadeOut: 0 });
const resetRightBoundary = (item) => ({ ...item, transitionIn: undefined, fadeIn: 0, audioFadeIn: 0 });
const sliceTransform = (transform, start, end) => !transform?.keyframes ? transform : { ...transform, keyframes: transform.keyframes.filter((keyframe) => keyframe.time >= start && keyframe.time <= end).map((keyframe) => ({ ...keyframe, time: keyframe.time - start })) };
const locateTrack = (timeline, trackIdOrName) => timeline.tracks.find((track) => track.id === trackIdOrName || track.name === trackIdOrName);
const compatible = (asset, track) => track.type === "video" ? ["video", "image", "motion-graphic"].includes(asset.type) : asset.type === "audio" || (asset.type === "video" && asset.hasAudio);

export function overwriteTrackRange(project, trackIdOrName, start, end) {
  const timeline = activeTimeline(project), track = locateTrack(timeline, trackIdOrName); if (!track) throw new Error(`Track not found: ${trackIdOrName}`); if (track.locked) throw new Error(`Track ${track.name} is locked`); if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || end <= start) throw new Error("Overwrite range requires 0 <= start < end");
  const rewritten = [];
  for (const item of track.items) {
    const itemEnd = endOf(item); if (itemEnd <= start + 0.001 || item.start >= end - 0.001) { rewritten.push(item); continue; }
    if (item.start < start - 0.001) { const duration = start - item.start; rewritten.push(resetLeftBoundary({ ...item, ...playbackSlice(item, 0, duration), duration, transform: sliceTransform(item.transform, 0, duration), reframe: sliceReframe(item.reframe, 0, duration) })); }
    if (itemEnd > end + 0.001) { const localStart = end - item.start, duration = itemEnd - end; rewritten.push(resetRightBoundary({ ...item, ...playbackSlice(item, localStart, item.duration), id: randomUUID(), start: end, duration, transform: sliceTransform(item.transform, localStart, item.duration), reframe: sliceReframe(item.reframe, localStart, item.duration), label: item.label ? `${item.label} remainder` : item.label })); }
  }
  track.items = rewritten.sort((a, b) => a.start - b.start); return track;
}

export function placeAssetOnTimeline(project, { assetId, trackIdOrName, mode = "append", at, sourceStart = 0, sourceEnd, duration, label } = {}) {
  if (!["append", "insert", "overwrite"].includes(mode)) throw new Error("Placement mode must be append, insert, or overwrite"); const timeline = activeTimeline(project), track = locateTrack(timeline, trackIdOrName); if (!track) throw new Error(`Track not found: ${trackIdOrName}`); if (track.locked) throw new Error(`Track ${track.name} is locked`); const asset = project.assets.find((entry) => entry.id === assetId); if (!asset) throw new Error(`Asset not found: ${assetId}`); if (!compatible(asset, track)) throw new Error(`${asset.type} asset is incompatible with ${track.type} track ${track.name}`);
  sourceStart = Number(sourceStart); if (!Number.isFinite(sourceStart) || sourceStart < 0) throw new Error("Source In must be non-negative"); let clipDuration = sourceEnd !== undefined ? Number(sourceEnd) - sourceStart : duration !== undefined ? Number(duration) : asset.duration != null ? Number(asset.duration) - sourceStart : 5; if (!Number.isFinite(clipDuration) || clipDuration <= 0) throw new Error("Source range must have positive duration"); if (asset.duration != null && sourceStart + clipDuration > Number(asset.duration) + 0.001) throw new Error("Source Out exceeds asset duration");
  let start; if (mode === "append") start = Math.max(0, ...track.items.map(endOf)); else { start = Number(at); if (!Number.isFinite(start) || start < 0) throw new Error(`${mode} placement requires a non-negative timeline time`); }
  if (mode === "insert") insertTimelineGap(project, start, clipDuration, "all"); else if (mode === "overwrite") overwriteTrackRange(project, track.id, start, start + clipDuration);
  const item = { id: randomUUID(), assetId, start, sourceStart, duration: clipDuration, label: String(label || asset.name || "Clip").slice(0, 300), volumeDb: 0, opacity: 1, fadeIn: 0, fadeOut: 0, audioFadeIn: 0, audioFadeOut: 0 }; track.items.push(item); track.items.sort((a, b) => a.start - b.start); project.history.push({ at: new Date().toISOString(), action: "place_asset", mode, assetId, itemId: item.id, trackId: track.id, start, sourceStart, duration: clipDuration }); const validation = validateProject(project); if (!validation.valid) throw new Error(validation.errors.join("\n")); return { item, track: { id: track.id, name: track.name, type: track.type }, asset: { id: asset.id, name: asset.name, type: asset.type }, mode, validation };
}
