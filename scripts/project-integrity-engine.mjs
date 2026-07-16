import { randomUUID } from "node:crypto";

export const CURRENT_PROJECT_SCHEMA = 3;

const videoTrack = () => ({ id: randomUUID(), name: "V1", type: "video", locked: false, muted: false, opacity: 1, items: [] });
const audioTrack = () => ({ id: randomUUID(), name: "A1", type: "audio", role: "anchor", locked: false, muted: false, volumeDb: 0, denoise: false, normalizeLufs: -16, items: [] });

export function migrateProject(project) {
  if (!project || typeof project !== "object" || Array.isArray(project)) throw new Error("Project root must be an object");
  const migrated = structuredClone(project);
  const from = Number(migrated.schemaVersion || 1);
  const changes = [];
  if (!Array.isArray(migrated.timelines) && migrated.timeline) {
    migrated.timelines = [migrated.timeline];
    delete migrated.timeline;
    changes.push("moved legacy timeline into timelines");
  }
  migrated.timelines ||= [];
  for (const timeline of migrated.timelines) {
    timeline.id ||= randomUUID();
    timeline.name ||= "Main";
    timeline.tracks ||= [];
    timeline.captions ||= { enabled: false, cues: [], style: {} };
    timeline.markers ||= [];
    for (const track of timeline.tracks) {
      track.id ||= randomUUID();
      track.items ||= [];
      track.locked ??= false;
      track.muted ??= false;
      if (track.type === "audio") track.role ||= "mix";
    }
  }
  migrated.assets ||= [];
  migrated.bins ||= [];
  migrated.history ||= [];
  migrated.revision = Number.isInteger(migrated.revision) && migrated.revision >= 0 ? migrated.revision : 0;
  migrated.activeTimelineId ||= migrated.timelines[0]?.id || null;
  if (migrated.schemaVersion !== CURRENT_PROJECT_SCHEMA) changes.push(`schema ${from} -> ${CURRENT_PROJECT_SCHEMA}`);
  migrated.schemaVersion = CURRENT_PROJECT_SCHEMA;
  return { project: migrated, from, to: CURRENT_PROJECT_SCHEMA, migrated: changes.length > 0, changes };
}

export function repairProject(project) {
  const result = migrateProject(project);
  const repaired = result.project;
  const changes = [...result.changes];
  if (!repaired.timelines.length) {
    const id = randomUUID();
    repaired.timelines.push({ id, name: "Main", width: 1080, height: 1920, fps: 30, tracks: [videoTrack(), audioTrack()], captions: { enabled: false, cues: [], style: {} }, markers: [] });
    repaired.activeTimelineId = id;
    changes.push("created missing Main timeline");
  }
  if (!repaired.timelines.some((timeline) => timeline.id === repaired.activeTimelineId)) {
    repaired.activeTimelineId = repaired.timelines[0].id;
    changes.push("repaired active timeline reference");
  }
  const assetIds = new Set(repaired.assets.filter((asset) => asset?.id).map((asset) => asset.id));
  for (const timeline of repaired.timelines) {
    if (!timeline.tracks.some((track) => track.type === "video")) { timeline.tracks.unshift(videoTrack()); changes.push(`added video track to ${timeline.name}`); }
    if (!timeline.tracks.some((track) => track.type === "audio")) { timeline.tracks.push(audioTrack()); changes.push(`added audio track to ${timeline.name}`); }
    for (const track of timeline.tracks) {
      const before = track.items.length;
      track.items = track.items.filter((item) => item?.id && assetIds.has(item.assetId) && Number.isFinite(item.start) && item.start >= 0 && Number.isFinite(item.sourceStart) && item.sourceStart >= 0 && Number.isFinite(item.duration) && item.duration > 0);
      if (track.items.length !== before) changes.push(`removed ${before - track.items.length} invalid items from ${track.name}`);
      track.items.sort((a, b) => a.start - b.start);
    }
  }
  repaired.history.push({ at: new Date().toISOString(), action: "repair_project", changes: changes.length });
  return { project: repaired, repaired: changes.length > 0, changes };
}
