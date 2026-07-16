import { readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, extname } from "node:path";
import { renderProject, probeOutput } from "./media-engine.mjs";
import { activeTimeline, validateProject } from "./project-store.mjs";
import { sliceProjectRange } from "./timeline-operations-engine.mjs";
import { activateTimeline, projectForExportFormat } from "./timeline-management-engine.mjs";
import { exportInterchange } from "./interchange-engine.mjs";
import { exportJianyingDraft, validateJianyingDraft } from "./jianying-draft-engine.mjs";

const path = process.argv[2]; if (!path) throw new Error("Export worker requires a job path");
const read = () => JSON.parse(readFileSync(path, "utf8"));
const write = (patch) => { const current = read(); if (current.status === "cancelled") return current; const next = { ...current, ...patch, updatedAt: new Date().toISOString() }, temporary = `${path}.${process.pid}.tmp`; writeFileSync(temporary, JSON.stringify(next, null, 2)); renameSync(temporary, path); return next; };
const rangeProject = (project, options) => { const range = options.range || "full"; if (range === "full") return project; const timeline = activeTimeline(project), points = range === "zone" ? timeline.inOut : { in: options.rangeStart, out: options.rangeEnd }; if (!points || points.in === undefined || points.out === undefined) throw new Error(`${range} export requires a valid In/Out range`); return sliceProjectRange(project, points.in, points.out).project; };
try {
  let job = write({ status: "running", progress: 5, phase: "preparing", startedAt: new Date().toISOString(), pid: process.pid }), project = JSON.parse(readFileSync(job.projectSnapshotPath, "utf8")), result;
  if (job.options.timelineId) activateTimeline(project, job.options.timelineId);
  project = rangeProject(project, job.options); const validation = validateProject(project); if (!validation.valid) throw new Error(validation.errors.join("\n")); write({ progress: 15, phase: "rendering" });
  if (job.kind === "video") { const formatted = projectForExportFormat(project, { resolution: job.options.resolution || "original", frameRate: job.options.frameRate }); result = renderProject(formatted.project, job.outputPath, { codec: job.options.codec || "h264", crf: job.options.crf ?? 20, burnCaptions: Boolean(job.options.burnCaptions) }); write({ progress: 92, phase: "verifying" }); result = { ...result, probe: probeOutput(job.outputPath), exportFormat: formatted.format }; }
  else if (job.kind === "audio") { const format = job.options.format || extname(job.outputPath).slice(1) || "wav"; result = renderProject(project, job.outputPath, { audioOnly: true, audioCodec: format === "m4a" ? "aac" : format }); write({ progress: 92, phase: "verifying" }); result = { ...result, format, probe: probeOutput(job.outputPath) }; }
  else if (["fcpxml", "premiere-xml", "edl"].includes(job.kind)) result = { outputPath: exportInterchange(project, job.outputPath, job.kind), format: job.kind };
  else if (job.kind === "jianying") { result = exportJianyingDraft(project, job.outputPath, { copyMedia: job.options.copyMedia !== false }); const check = validateJianyingDraft(result.folder); if (!check.valid) throw new Error(check.errors.join("\n")); result = { ...result, validation: check }; }
  else throw new Error(`Unsupported export job kind: ${job.kind}`);
  write({ status: "completed", progress: 100, phase: "completed", completedAt: new Date().toISOString(), result, error: null });
} catch (error) { write({ status: "failed", phase: "failed", completedAt: new Date().toISOString(), error: error.stack || error.message }); process.exitCode = 1; }
