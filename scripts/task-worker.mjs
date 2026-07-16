import { readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { loadProject } from "./project-store.mjs";
import { buildSemanticIndex } from "./semantic-index-engine.mjs";
import { planDirectorAgent } from "./director-agent-engine.mjs";
import { auditRuntimeReadiness } from "./runtime-readiness-engine.mjs";

const path = process.argv[2];
if (!path) throw new Error("Task file path is required");
const write = (task) => { const temporary = `${path}.${process.pid}.tmp`; task.updatedAt = new Date().toISOString(); writeFileSync(temporary, JSON.stringify(task, null, 2)); renameSync(temporary, path); };
let task = JSON.parse(readFileSync(path, "utf8"));
let stopping = false;
process.on("SIGTERM", () => { stopping = true; task = JSON.parse(readFileSync(path, "utf8")); if (!task.completedAt) { Object.assign(task, { status: "cancelled", phase: "cancelled", completedAt: new Date().toISOString(), pid: null }); write(task); } process.exit(0); });
try {
  Object.assign(task, { status: "running", phase: "loading-project", progress: .1, startedAt: new Date().toISOString(), pid: process.pid }); write(task);
  const { project } = loadProject(task.projectPath); if (stopping) process.exit(0);
  task.phase = task.kind; task.progress = .35; write(task);
  let result;
  if (task.kind === "semantic-index") result = buildSemanticIndex(task.projectPath, project);
  else if (task.kind === "director-plan") { buildSemanticIndex(task.projectPath, project); result = planDirectorAgent(task.projectPath, project, task.options); }
  else if (task.kind === "runtime-audit") result = auditRuntimeReadiness(task.projectPath, project, task.options);
  else throw new Error(`Unsupported background task kind: ${task.kind}`);
  if (stopping) process.exit(0);
  Object.assign(task, { status: "completed", phase: "completed", progress: 1, completedAt: new Date().toISOString(), pid: null, result, error: null }); write(task);
} catch (error) {
  task = JSON.parse(readFileSync(path, "utf8")); if (task.status !== "cancelled") { Object.assign(task, { status: "failed", phase: "failed", completedAt: new Date().toISOString(), pid: null, error: error?.stack || error?.message || String(error) }); write(task); }
}
