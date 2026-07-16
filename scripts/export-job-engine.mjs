import { spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { snapshotFolder } from "./version-engine.mjs";
import { loadProject, validateProject } from "./project-store.mjs";

const jobsFolder = (projectPath) => join(snapshotFolder(projectPath), "export-jobs");
const jobPath = (projectPath, id) => join(jobsFolder(projectPath), `${id}.json`);
const atomicWrite = (path, value) => { mkdirSync(dirname(path), { recursive: true }); const temporary = `${path}.${process.pid}.tmp`; writeFileSync(temporary, JSON.stringify(value, null, 2)); renameSync(temporary, path); };
const publicJob = (job) => { const { projectSnapshotPath, ...value } = job; return value; };
export function readExportJob(projectPath, id) { const path = jobPath(projectPath, id); if (!existsSync(path)) throw new Error(`Export job not found: ${id}`); return publicJob(JSON.parse(readFileSync(path, "utf8"))); }
export function listExportJobs(projectPath) { const folder = jobsFolder(projectPath); if (!existsSync(folder)) return []; return readdirSync(folder).filter((name) => name.endsWith(".json") && !name.endsWith(".project.json")).map((name) => JSON.parse(readFileSync(join(folder, name), "utf8"))).sort((a, b) => b.createdAt.localeCompare(a.createdAt)).map(publicJob); }

export function submitExportJob(projectPath, { kind, outputPath, options = {} }) { const projectFile = resolve(projectPath), { project } = loadProject(projectFile), validation = validateProject(project); if (!validation.valid) throw new Error(validation.errors.join("\n")); const output = resolve(outputPath); if (output === projectFile) throw new Error("Export output cannot overwrite the CutPilot project"); const id = randomUUID(), folder = jobsFolder(projectFile), snapshot = join(folder, `${id}.project.json`), path = jobPath(projectFile, id), now = new Date().toISOString(); mkdirSync(folder, { recursive: true }); writeFileSync(snapshot, JSON.stringify(project, null, 2)); const job = { id, projectPath: projectFile, projectSnapshotPath: snapshot, kind, outputPath: output, options, status: "queued", progress: 0, phase: "queued", createdAt: now, updatedAt: now, startedAt: null, completedAt: null, pid: null, result: null, error: null }; atomicWrite(path, job); const logPath = join(folder, `${id}.log`), child = spawn(process.execPath, [new URL("./export-worker.mjs", import.meta.url).pathname, path], { detached: true, stdio: ["ignore", "ignore", "ignore"], env: { ...process.env, MYCUT_EXPORT_LOG: logPath } }); child.unref(); job.pid = child.pid; job.updatedAt = new Date().toISOString(); atomicWrite(path, job); return publicJob(job); }

export function cancelExportJob(projectPath, id) { const path = jobPath(projectPath, id); if (!existsSync(path)) throw new Error(`Export job not found: ${id}`); const job = JSON.parse(readFileSync(path, "utf8")); if (["completed", "failed", "cancelled"].includes(job.status)) return publicJob(job); if (job.pid) { try { process.kill(job.pid, "SIGTERM"); } catch {} } job.status = "cancelled"; job.phase = "cancelled"; job.updatedAt = new Date().toISOString(); job.completedAt = job.updatedAt; job.error = null; atomicWrite(path, job); return publicJob(job); }
