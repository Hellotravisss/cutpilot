import { randomUUID } from "node:crypto";
import { activeTimeline, projectDuration, validateProject } from "./project-store.mjs";

const COLORS = new Set(["red", "orange", "yellow", "green", "blue", "purple"]);
const clean = (value, fallback) => String(value ?? fallback).trim().slice(0, 120) || fallback;

export function addTimelineMarker(project, { time, label = "Marker", note = "", color = "red", kind = "comment" }) {
  const timeline = activeTimeline(project), duration = projectDuration(timeline), at = Number(time);
  if (!Number.isFinite(at) || at < 0 || at > duration + 0.001) throw new Error(`Marker time must be within 0-${duration.toFixed(3)}s`);
  if (!COLORS.has(color)) throw new Error(`Unsupported marker color: ${color}`);
  const marker = { id: randomUUID(), time: at, label: clean(label, "Marker"), note: clean(note, ""), color, kind: clean(kind, "comment") };
  timeline.markers = [...(timeline.markers || []), marker].sort((a, b) => a.time - b.time);
  project.history.push({ at: new Date().toISOString(), action: "add_timeline_marker", markerId: marker.id, time: marker.time });
  return { marker, markers: timeline.markers, validation: validateProject(project) };
}

export function updateTimelineMarker(project, markerId, changes = {}) {
  const timeline = activeTimeline(project), marker = (timeline.markers || []).find(entry => entry.id === markerId);
  if (!marker) throw new Error(`Marker not found: ${markerId}`);
  if (changes.time !== undefined) { const time = Number(changes.time), duration = projectDuration(timeline); if (!Number.isFinite(time) || time < 0 || time > duration + .001) throw new Error(`Marker time must be within 0-${duration.toFixed(3)}s`); marker.time = time; }
  if (changes.label !== undefined) marker.label = clean(changes.label, "Marker");
  if (changes.note !== undefined) marker.note = clean(changes.note, "");
  if (changes.color !== undefined) { if (!COLORS.has(changes.color)) throw new Error(`Unsupported marker color: ${changes.color}`); marker.color = changes.color; }
  timeline.markers.sort((a, b) => a.time - b.time); project.history.push({ at: new Date().toISOString(), action: "update_timeline_marker", markerId });
  return { marker, markers: timeline.markers, validation: validateProject(project) };
}

export function deleteTimelineMarker(project, markerId) {
  const timeline = activeTimeline(project), before = (timeline.markers || []).length; timeline.markers = (timeline.markers || []).filter(entry => entry.id !== markerId);
  if (timeline.markers.length === before) throw new Error(`Marker not found: ${markerId}`);
  project.history.push({ at: new Date().toISOString(), action: "delete_timeline_marker", markerId });
  return { markerId, markers: timeline.markers, validation: validateProject(project) };
}
