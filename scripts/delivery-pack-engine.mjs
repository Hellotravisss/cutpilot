import { mkdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { loadProject, validateProject } from "./project-store.mjs";
import { duplicateTimeline, setTimelineFormat } from "./timeline-management-engine.mjs";
import { submitExportJob } from "./export-job-engine.mjs";

export const DELIVERY_VARIANTS = Object.freeze({
  youtube: { label: "YouTube 16:9", preset: "16:9", suffix: "youtube" },
  shorts: { label: "Shorts / Reels 9:16", preset: "9:16", suffix: "vertical" },
  square: { label: "Square 1:1", preset: "1:1", suffix: "square" },
  feed: { label: "Feed 4:5", preset: "4:5", suffix: "feed" },
});

const cleanKeys = (keys) => [...new Set(keys?.length ? keys : Object.keys(DELIVERY_VARIANTS))];

export function createDeliveryVariants(project, { sourceTimelineId, variants, layoutMode = "scale", replace = false } = {}) {
  const source = project.timelines.find((timeline) => timeline.id === (sourceTimelineId || project.activeTimelineId));
  if (!source) throw new Error(`Source timeline not found: ${sourceTimelineId}`);
  if (!['scale', 'preserve'].includes(layoutMode)) throw new Error("Layout mode must be scale or preserve");
  const keys = cleanKeys(variants), unknown = keys.filter((key) => !DELIVERY_VARIANTS[key]);
  if (unknown.length) throw new Error(`Unknown delivery variants: ${unknown.join(", ")}`);
  const originalActive = project.activeTimelineId, created = [], reused = [];
  for (const key of keys) {
    const spec = DELIVERY_VARIANTS[key];
    let timeline = project.timelines.find((entry) => entry.deliveryVariant?.sourceTimelineId === source.id && entry.deliveryVariant?.key === key);
    if (timeline && !replace) { reused.push({ key, timelineId: timeline.id, name: timeline.name, preset: spec.preset }); continue; }
    if (timeline) project.timelines.splice(project.timelines.indexOf(timeline), 1);
    timeline = duplicateTimeline(project, source.id, { name: `${source.name} · ${spec.label}`, activate: false }).timeline;
    setTimelineFormat(project, timeline.id, { preset: spec.preset, fps: source.fps, layoutMode });
    timeline.deliveryVariant = { key, label: spec.label, preset: spec.preset, suffix: spec.suffix, sourceTimelineId: source.id, createdAt: new Date().toISOString(), layoutMode };
    timeline.exportPreset = { ...(source.exportPreset || {}), platform: key, aspect: spec.preset, width: timeline.width, height: timeline.height, fps: timeline.fps, resolution: "original", codec: "h264", audioCodec: "aac", burnCaptions: true, range: "full" };
    timeline.settings ||= {};
    timeline.settings.safeArea = timeline.height > timeline.width ? { top:.08,right:.07,bottom:.16,left:.07 } : { top:.06,right:.05,bottom:.09,left:.05 };
    created.push({ key, timelineId: timeline.id, name: timeline.name, preset: spec.preset, width: timeline.width, height: timeline.height });
  }
  project.activeTimelineId = originalActive;
  project.deliveryPack = { sourceTimelineId: source.id, variants: keys, updatedAt: new Date().toISOString() };
  project.history.push({ at: new Date().toISOString(), action: "create_delivery_variants", sourceTimelineId: source.id, variants: keys, created: created.length, reused: reused.length });
  const validation = validateProject(project); if (!validation.valid) throw new Error(validation.errors.join("\n"));
  return { sourceTimelineId: source.id, created, reused, total: created.length + reused.length, validation };
}

export function submitDeliveryPack(projectPath, { outputFolder, timelineIds, resolution = "original", frameRate, burnCaptions = true, crf = 20 } = {}) {
  const projectFile = resolve(projectPath), { project } = loadProject(projectFile);
  const candidates = project.timelines.filter((timeline) => timeline.deliveryVariant && (!timelineIds?.length || timelineIds.includes(timeline.id)));
  if (!candidates.length) throw new Error("No delivery variant timelines found; create variants first");
  const folder = resolve(outputFolder || join(dirname(projectFile), "exports", "delivery-pack")); mkdirSync(folder, { recursive: true });
  const jobs = candidates.map((timeline) => {
    const suffix = timeline.deliveryVariant.suffix || timeline.deliveryVariant.key;
    const outputPath = join(folder, `${safeName(project.name)}-${suffix}.mp4`);
    return submitExportJob(projectFile, { kind: "video", outputPath, options: { timelineId: timeline.id, resolution, frameRate, burnCaptions, crf, range: "full" } });
  });
  return { outputFolder: folder, jobs, timelines: candidates.map((timeline) => ({ id: timeline.id, name: timeline.name, variant: timeline.deliveryVariant.key, width: timeline.width, height: timeline.height })) };
}

function safeName(value) { return String(value || "cutpilot").replace(/[^\w.\-\u4e00-\u9fff]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 100) || "cutpilot"; }
