import { randomUUID } from "node:crypto";
import { activeTimeline, projectDuration, validateProject } from "./project-store.mjs";

const now = () => new Date().toISOString();
const uniqueName = (project, requested) => {
  const base = String(requested || "Timeline").trim() || "Timeline"; let name = base, number = 2;
  while (project.timelines.some((timeline) => timeline.name === name)) name = `${base} ${number++}`;
  return name;
};
const freshTrack = (type, name) => type === "audio"
  ? { id: randomUUID(), name, type, role: name === "A1" ? "anchor" : "mix", locked: false, muted: false, volumeDb: 0, denoise: false, normalizeLufs: name === "A1" ? -16 : null, items: [] }
  : { id: randomUUID(), name, type, locked: false, muted: false, opacity: 1, items: [] };
const requireTimeline = (project, timelineId) => { const timeline = project.timelines.find((entry) => entry.id === (timelineId || project.activeTimelineId)); if (!timeline) throw new Error(`Timeline not found: ${timelineId}`); return timeline; };
const verify = (project) => { const validation = validateProject(project); if (!validation.valid) throw new Error(validation.errors.join("\n")); return validation; };
export const ASPECT_PRESETS = { "16:9": { width: 1920, height: 1080 }, "9:16": { width: 1080, height: 1920 }, "1:1": { width: 1080, height: 1080 }, "4:5": { width: 1080, height: 1350 }, "4:3": { width: 1440, height: 1080 }, "3:4": { width: 1080, height: 1440 } };
const even = (value) => Math.max(2, Math.round(Number(value) / 2) * 2);
const scalePresent = (object, key, ratio) => { if (Object.hasOwn(object, key) && Number.isFinite(object[key])) object[key] = object[key] * ratio; };
const scaleLayout = (timeline, oldWidth, oldHeight) => {
  const sx = timeline.width / oldWidth, sy = timeline.height / oldHeight, uniform = Math.min(sx, sy);
  for (const track of timeline.tracks) for (const item of track.items) {
    if (item.transform) { for (const key of ["x", "width"]) scalePresent(item.transform, key, sx); for (const key of ["y", "height"]) scalePresent(item.transform, key, sy); for (const keyframe of item.transform.keyframes || []) { scalePresent(keyframe, "x", sx); scalePresent(keyframe, "y", sy); } }
    for (const effect of item.effects || []) if (effect.type === "mask") { for (const key of ["x", "width"]) scalePresent(effect, key, sx); for (const key of ["y", "height"]) scalePresent(effect, key, sy); scalePresent(effect, "feather", uniform); }
  }
  const style = timeline.captions?.style; if (style) { for (const key of ["fontSize", "secondaryFontSize", "bilingualGap", "maxWidth", "outlineWidth", "margin"]) scalePresent(style, key, uniform); }
  return { scaleX: sx, scaleY: sy, uniform };
};

export function setTimelineFormat(project, timelineId, { preset, width, height, fps, layoutMode = "scale" } = {}) {
  const timeline = requireTimeline(project, timelineId), selected = preset ? ASPECT_PRESETS[preset] : null; if (preset && !selected) throw new Error(`Unknown aspect preset: ${preset}`);
  const nextWidth = even(selected?.width || width || timeline.width), nextHeight = even(selected?.height || height || timeline.height), nextFps = Number(fps || timeline.fps); if (nextWidth > 8192 || nextHeight > 8192 || nextWidth < 16 || nextHeight < 16 || !Number.isFinite(nextFps) || nextFps < 1 || nextFps > 120) throw new Error("Timeline format must be 16-8192 pixels and 1-120 fps"); if (!['scale','preserve'].includes(layoutMode)) throw new Error("Layout mode must be scale or preserve");
  const oldWidth = timeline.width, oldHeight = timeline.height, oldFps = timeline.fps; timeline.width = nextWidth; timeline.height = nextHeight; timeline.fps = nextFps; const scaling = layoutMode === "scale" ? scaleLayout(timeline, oldWidth, oldHeight) : { scaleX: 1, scaleY: 1, uniform: 1 }; project.history.push({ at: now(), action: "set_timeline_format", timelineId: timeline.id, preset: preset || null, from: { width: oldWidth, height: oldHeight, fps: oldFps }, to: { width: nextWidth, height: nextHeight, fps: nextFps }, layoutMode }); return { timeline, scaling, validation: verify(project) };
}

export function projectForExportFormat(project, { resolution = "original", frameRate } = {}) {
  const draft = structuredClone(project), timeline = activeTimeline(draft); if (!['original','1080p','720p','480p'].includes(resolution)) throw new Error(`Unsupported export resolution: ${resolution}`); const target = resolution === "original" ? null : Number(resolution.replace("p", "")); let width = timeline.width, height = timeline.height; if (target) { const scale = target / Math.min(width, height); width = even(width * scale); height = even(height * scale); } const fps = frameRate === undefined ? timeline.fps : Number(frameRate); if (!Number.isFinite(fps) || fps < 24 || fps > 60) throw new Error("Export frame rate must be 24-60 fps"); const result = setTimelineFormat(draft, timeline.id, { width, height, fps, layoutMode: "scale" }); draft.history.pop(); return { project: draft, format: { resolution, width, height, fps }, scaling: result.scaling };
}

export function listTimelines(project) { return project.timelines.map((timeline) => ({ id: timeline.id, name: timeline.name, active: timeline.id === project.activeTimelineId, width: timeline.width, height: timeline.height, fps: timeline.fps, duration: projectDuration(timeline), tracks: timeline.tracks.length, items: timeline.tracks.reduce((sum, track) => sum + track.items.length, 0), inOut: timeline.inOut || null })); }

export function createTimeline(project, { name, width, height, fps, activate = true } = {}) {
  const source = activeTimeline(project), id = randomUUID(), timeline = { id, name: uniqueName(project, name || "Timeline"), width: Number(width || source.width), height: Number(height || source.height), fps: Number(fps || source.fps), tracks: [freshTrack("video", "V1"), freshTrack("audio", "A1")], captions: { enabled: false, cues: [], style: {} }, markers: [] };
  project.timelines.push(timeline); if (activate) project.activeTimelineId = id; project.history.push({ at: now(), action: "create_timeline", timelineId: id }); return { timeline, validation: verify(project) };
}

export function duplicateTimeline(project, timelineId, { name, activate = true } = {}) {
  const source = requireTimeline(project, timelineId), timeline = structuredClone(source); timeline.id = randomUUID(); timeline.name = uniqueName(project, name || `${source.name} Copy`);
  timeline.tracks.forEach((track) => { track.id = randomUUID(); track.items.forEach((item) => { item.id = randomUUID(); }); });
  timeline.markers = (timeline.markers || []).map((marker) => ({ ...marker, id: randomUUID() })); project.timelines.push(timeline); if (activate) project.activeTimelineId = timeline.id; project.history.push({ at: now(), action: "duplicate_timeline", sourceTimelineId: source.id, timelineId: timeline.id }); return { timeline, validation: verify(project) };
}

export function activateTimeline(project, timelineId) { const timeline = requireTimeline(project, timelineId); project.activeTimelineId = timeline.id; project.history.push({ at: now(), action: "activate_timeline", timelineId: timeline.id }); return { timeline, validation: verify(project) }; }

export function renameTimeline(project, timelineId, name) { const timeline = requireTimeline(project, timelineId), clean = String(name || "").trim(); if (!clean) throw new Error("Timeline name is required"); if (project.timelines.some((entry) => entry.id !== timeline.id && entry.name === clean)) throw new Error(`Timeline name already exists: ${clean}`); const previousName = timeline.name; timeline.name = clean; project.history.push({ at: now(), action: "rename_timeline", timelineId: timeline.id, previousName, name: clean }); return { timeline, validation: verify(project) }; }

export function deleteTimeline(project, timelineId) { if (project.timelines.length <= 1) throw new Error("A project must keep at least one timeline"); const timeline = requireTimeline(project, timelineId), index = project.timelines.indexOf(timeline); project.timelines.splice(index, 1); if (project.activeTimelineId === timeline.id) project.activeTimelineId = project.timelines[Math.min(index, project.timelines.length - 1)].id; project.history.push({ at: now(), action: "delete_timeline", timelineId: timeline.id }); return { deletedTimelineId: timeline.id, activeTimeline: activeTimeline(project), validation: verify(project) }; }

export function setTimelineInOut(project, timelineId, { inPoint, outPoint } = {}) { const timeline = requireTimeline(project, timelineId), duration = projectDuration(timeline); if (inPoint === null || outPoint === null) timeline.inOut = null; else { const start = Number(inPoint), end = Number(outPoint); if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || end <= start || end > duration + 0.001) throw new Error(`In/Out must satisfy 0 <= in < out <= ${duration.toFixed(3)}`); timeline.inOut = { in: start, out: end }; } project.history.push({ at: now(), action: "set_timeline_in_out", timelineId: timeline.id, inOut: timeline.inOut }); return { timeline, validation: verify(project) }; }
