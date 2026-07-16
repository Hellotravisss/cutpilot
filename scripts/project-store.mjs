import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { playbackSourceSpan, validateSpeedCurve } from "./speed-curve-engine.mjs";
import { validateEffectStack } from "./visual-effects-engine.mjs";
import { validateAudioEffectStack } from "./audio-effects-engine.mjs";
import { validateAssetLibrary } from "./asset-library-engine.mjs";
import { recordProjectChange } from "./version-engine.mjs";

export function loadProject(projectPath) {
  const path = resolve(projectPath);
  if (!existsSync(path)) throw new Error(`Project not found: ${path}`);
  return { path, project: JSON.parse(readFileSync(path, "utf8")) };
}

export function saveProject(projectPath, project) {
  const path = resolve(projectPath);
  mkdirSync(dirname(path), { recursive: true });
  const previous = existsSync(path) ? JSON.parse(readFileSync(path, "utf8")) : null;
  project.updatedAt = new Date().toISOString();
  recordProjectChange(path, previous, project);
  writeFileSync(path, JSON.stringify(project, null, 2));
  return path;
}

export function newProject({ name, width, height, fps }) {
  const timelineId = randomUUID();
  const now = new Date().toISOString();
  return {
    schemaVersion: 2,
    id: randomUUID(),
    name,
    createdAt: now,
    updatedAt: now,
    assets: [],
    bins: [],
    activeTimelineId: timelineId,
    timelines: [{
      id: timelineId,
      name: "Main",
      width,
      height,
      fps,
      tracks: [
        { id: randomUUID(), name: "V1", type: "video", locked: false, muted: false, opacity: 1, items: [] },
        { id: randomUUID(), name: "A1", type: "audio", role: "anchor", locked: false, muted: false, volumeDb: 0, denoise: false, normalizeLufs: -16, items: [] },
      ],
      captions: { enabled: false, cues: [], style: {} },
      markers: [],
    }],
    history: [],
  };
}

export function activeTimeline(project) {
  const timeline = project.timelines.find((t) => t.id === project.activeTimelineId);
  if (!timeline) throw new Error("Active timeline is missing");
  return timeline;
}

export function projectDuration(timeline) {
  return Math.max(0, ...timeline.tracks.flatMap((t) => t.items.map((i) => i.start + i.duration)));
}

export function validateProject(project) {
  const errors = [];
  const warnings = [];
  if (!Array.isArray(project.timelines) || !project.timelines.length) errors.push("Project must contain at least one timeline");
  if (!project.timelines?.some((timeline) => timeline.id === project.activeTimelineId)) errors.push("Active timeline is missing");
  const timelineIds = new Set(), timelineNames = new Set();
  const assetIds = new Set(project.assets.map((a) => a.id));
  errors.push(...validateAssetLibrary(project).errors);
  for (const timeline of project.timelines) {
    if (timelineIds.has(timeline.id)) errors.push(`Duplicate timeline id: ${timeline.id}`); timelineIds.add(timeline.id);
    if (!String(timeline.name || "").trim()) errors.push(`Timeline ${timeline.id}: name is required`); else if (timelineNames.has(timeline.name)) errors.push(`Duplicate timeline name: ${timeline.name}`); timelineNames.add(timeline.name);
    if (!(timeline.width > 0 && timeline.height > 0 && timeline.fps > 0)) errors.push(`${timeline.name}: invalid composition`);
    const duration = projectDuration(timeline); if (timeline.inOut && (!Number.isFinite(timeline.inOut.in) || !Number.isFinite(timeline.inOut.out) || timeline.inOut.in < 0 || timeline.inOut.out <= timeline.inOut.in || timeline.inOut.out > duration + 0.001)) errors.push(`${timeline.name}: invalid In/Out zone`);
    const trackIds = new Set(), trackNames = new Set(); if (!timeline.tracks.some((track) => track.type === "video")) errors.push(`${timeline.name}: at least one video track is required`); if (!timeline.tracks.some((track) => track.type === "audio")) errors.push(`${timeline.name}: at least one audio track is required`); const snapping = timeline.settings?.snapping; if (snapping && (typeof snapping.enabled !== "boolean" || !Number.isFinite(snapping.toleranceFrames) || snapping.toleranceFrames < 0 || snapping.toleranceFrames > 30)) errors.push(`${timeline.name}: invalid snapping settings`);
    for (const track of timeline.tracks) {
      if (!track.id || trackIds.has(track.id)) errors.push(`${timeline.name}: duplicate or missing track id ${track.id}`); trackIds.add(track.id); if (!String(track.name || "").trim() || trackNames.has(track.name)) errors.push(`${timeline.name}: duplicate or missing track name ${track.name}`); trackNames.add(track.name); if (!['video','audio'].includes(track.type)) errors.push(`${timeline.name}: invalid track type ${track.type}`);
      const sorted = [...track.items].sort((a, b) => a.start - b.start);
      for (let i = 0; i < sorted.length; i++) {
        const item = sorted[i];
        if (item.linkGroupId !== undefined && !String(item.linkGroupId).trim()) errors.push(`${track.name}: item ${item.id} has invalid link group`);
        if (!assetIds.has(item.assetId)) errors.push(`${track.name}: item ${item.id} references missing asset ${item.assetId}`);
        if (!Number.isFinite(item.start) || !Number.isFinite(item.sourceStart) || !Number.isFinite(item.duration) || item.start < 0 || item.sourceStart < 0 || item.duration <= 0) errors.push(`${track.name}: invalid timing for ${item.id}`);
        if (!Number.isFinite(Number(item.playbackRate || 1)) || Number(item.playbackRate || 1) < 0.1 || Number(item.playbackRate || 1) > 16) errors.push(`${track.name}: invalid playback rate for ${item.id}`);
        try { validateSpeedCurve(item.speedCurve, item.duration); } catch (error) { errors.push(`${track.name}: ${item.id} ${error.message}`); }
        try { validateEffectStack(item.effects || []); } catch (error) { errors.push(`${track.name}: ${item.id} ${error.message}`); }
        try { validateAudioEffectStack(item.audioEffects || []); } catch (error) { errors.push(`${track.name}: ${item.id} ${error.message}`); }
        if (item.reframe) { if (!(item.reframe.targetWidth > 0 && item.reframe.targetHeight > 0) || !Array.isArray(item.reframe.keyframes) || !item.reframe.keyframes.length) errors.push(`${track.name}: ${item.id} invalid smart reframe`); let reframeTime = -1; for (const keyframe of item.reframe.keyframes || []) { if (!Number.isFinite(keyframe.time) || keyframe.time < reframeTime || keyframe.time < 0 || keyframe.time > item.duration + .001 || !Number.isFinite(keyframe.focusX) || keyframe.focusX < 0 || keyframe.focusX > 1 || !Number.isFinite(keyframe.focusY) || keyframe.focusY < 0 || keyframe.focusY > 1) errors.push(`${track.name}: ${item.id} invalid reframe keyframe`); reframeTime = keyframe.time; } }
        if (track.type !== "audio" && item.audioEffects?.length) errors.push(`${track.name}: video item ${item.id} cannot use audio effects`);
        if (track.type === "audio" && item.freezeFrame) errors.push(`${track.name}: audio item ${item.id} cannot be a freeze frame`);
        const asset = project.assets.find((entry) => entry.id === item.assetId), requiredSource = item.sourceStart + playbackSourceSpan(item);
        if (asset?.duration && requiredSource > asset.duration + 0.05) warnings.push(`${track.name}: ${item.id} needs source through ${requiredSource.toFixed(2)}s but asset ends at ${asset.duration.toFixed(2)}s`);
        if (i && item.start < sorted[i - 1].start + sorted[i - 1].duration - 0.0001) errors.push(`${track.name}: overlap ${sorted[i - 1].id} -> ${item.id}`);
      }
      if (sorted.length > 1) {
        for (let i = 1; i < sorted.length; i++) {
          const gap = sorted[i].start - (sorted[i - 1].start + sorted[i - 1].duration);
          if (track.type === "video" && gap > 0.04) warnings.push(`${track.name}: ${gap.toFixed(2)}s gap before ${sorted[i].id}`);
        }
      }
    }
    const linkCounts = new Map(); for (const item of timeline.tracks.flatMap((track) => track.items)) if (item.linkGroupId) linkCounts.set(item.linkGroupId, (linkCounts.get(item.linkGroupId) || 0) + 1); for (const [groupId, count] of linkCounts) if (count < 2) warnings.push(`${timeline.name}: link group ${groupId} has only one remaining item`);
  }
  return { valid: errors.length === 0, errors, warnings };
}

export function applyTimelineEdit(project, { timelineId, trackName, adds = [], updates = [], deletes = [] }) {
  const timeline = project.timelines.find((t) => t.id === (timelineId || project.activeTimelineId));
  if (!timeline) throw new Error("Timeline not found");
  let track = timeline.tracks.find((t) => t.name === trackName);
  if (!track) {
    const type = trackName.toUpperCase().startsWith("A") ? "audio" : "video";
    track = type === "audio" ? { id: randomUUID(), name: trackName, type, role: "mix", locked: false, muted: false, volumeDb: 0, denoise: false, normalizeLufs: null, items: [] } : { id: randomUUID(), name: trackName, type, locked: false, muted: false, opacity: 1, items: [] };
    timeline.tracks.push(track);
  }
  if (track.locked) throw new Error(`Track ${trackName} is locked`);
  const deleteIds = new Set(deletes);
  const updateMap = new Map(updates.map((u) => [u.id, u]));
  track.items = track.items.filter((i) => !deleteIds.has(i.id)).map((i) => updateMap.has(i.id) ? { ...i, ...updateMap.get(i.id), id: i.id } : i);
  for (const add of adds) track.items.push({ id: randomUUID(), sourceStart: 0, volumeDb: 0, opacity: 1, ...add });
  track.items.sort((a, b) => a.start - b.start);
  project.history.push({ at: new Date().toISOString(), action: "edit_timeline", timelineId: timeline.id, trackName, adds: adds.length, updates: updates.length, deletes: deletes.length });
  const validation = validateProject(project);
  if (!validation.valid) throw new Error(validation.errors.join("\n"));
  return { timeline, track, validation };
}
