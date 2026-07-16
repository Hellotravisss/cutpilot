import { spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { snapshotFolder } from "./version-engine.mjs";

const taskFolder = (projectPath) => join(snapshotFolder(resolve(projectPath)), "background-tasks");
const taskPath = (projectPath, id) => join(taskFolder(projectPath), `${id}.json`);
const atomicWrite = (path, value) => { mkdirSync(dirname(path), { recursive: true }); const temporary = `${path}.${process.pid}.tmp`; writeFileSync(temporary, JSON.stringify(value, null, 2)); renameSync(temporary, path); };
const terminal = new Set(["completed", "failed", "cancelled"]);
const isAlive = (pid) => { if (!pid) return false; try { process.kill(pid, 0); return true; } catch { return false; } };
const publicTask = (task) => task;

export const BACKGROUND_TASK_KINDS = ["semantic-index", "director-plan", "runtime-audit"];
export function readBackgroundTask(projectPath, id) { const path = taskPath(projectPath, id); if (!existsSync(path)) throw new Error(`Background task not found: ${id}`); return publicTask(JSON.parse(readFileSync(path, "utf8"))); }
export function listBackgroundTasks(projectPath) { const folder = taskFolder(projectPath); if (!existsSync(folder)) return []; return readdirSync(folder).filter((name) => name.endsWith(".json")).map((name) => JSON.parse(readFileSync(join(folder, name), "utf8"))).sort((a, b) => b.createdAt.localeCompare(a.createdAt)).map(publicTask); }

export function submitBackgroundTask(projectPath, { kind, options = {}, retryOf = null }) {
  if (!BACKGROUND_TASK_KINDS.includes(kind)) throw new Error(`Unsupported background task kind: ${kind}`);
  const id = randomUUID(), path = taskPath(projectPath, id), now = new Date().toISOString();
  const task = { type: "cutpilot-background-task", id, projectPath: resolve(projectPath), kind, options, retryOf, status: "queued", progress: 0, phase: "queued", createdAt: now, updatedAt: now, startedAt: null, completedAt: null, pid: null, result: null, error: null };
  atomicWrite(path, task);
  const child = spawn(process.execPath, [new URL("./task-worker.mjs", import.meta.url).pathname, path], { detached: true, stdio: "ignore", env: process.env }); child.unref();
  task.pid = child.pid; task.updatedAt = new Date().toISOString(); atomicWrite(path, task);
  return publicTask(task);
}

export function cancelBackgroundTask(projectPath, id) {
  const path = taskPath(projectPath, id), task = readBackgroundTask(projectPath, id); if (terminal.has(task.status)) return task;
  if (task.pid) try { process.kill(task.pid, "SIGTERM"); } catch {}
  Object.assign(task, { status: "cancelled", phase: "cancelled", progress: task.progress || 0, updatedAt: new Date().toISOString(), completedAt: new Date().toISOString(), pid: null }); atomicWrite(path, task); return task;
}

export function retryBackgroundTask(projectPath, id) { const task = readBackgroundTask(projectPath, id); if (!terminal.has(task.status)) throw new Error("Only completed, failed, or cancelled tasks can be retried"); return submitBackgroundTask(projectPath, { kind: task.kind, options: task.options, retryOf: task.id }); }

export function recoverBackgroundTasks(projectPath, { retry = false } = {}) {
  const recovered = [], retried = [];
  for (const task of listBackgroundTasks(projectPath)) if (["queued", "running"].includes(task.status) && !isAlive(task.pid)) {
    const path = taskPath(projectPath, task.id); Object.assign(task, { status: "failed", phase: "interrupted", error: "Worker process ended before completion", updatedAt: new Date().toISOString(), completedAt: new Date().toISOString(), pid: null }); atomicWrite(path, task); recovered.push(task.id);
    if (retry) retried.push(submitBackgroundTask(projectPath, { kind: task.kind, options: task.options, retryOf: task.id }).id);
  }
  return { recovered, retried };
}
