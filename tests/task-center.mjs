import assert from "node:assert/strict";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { newProject } from "../scripts/project-store.mjs";
import { listBackgroundTasks, readBackgroundTask, retryBackgroundTask, submitBackgroundTask } from "../scripts/task-center-engine.mjs";

const root = resolve(process.argv[2] || "/tmp/cutpilot-task-center"); rmSync(root, { recursive: true, force: true }); mkdirSync(root, { recursive: true }); const projectPath = `${root}/project.cutpilot.json`;
const project = newProject({ name: "Tasks", width: 320, height: 180, fps: 24 }); project.assets.push({ id: "clip", name: "code.mov", path: `${root}/code.mov`, type: "video", duration: 3, annotation: { tags: ["code"] } }); writeFileSync(projectPath, JSON.stringify(project, null, 2));
let task = submitBackgroundTask(projectPath, { kind: "semantic-index" });
for (let attempt = 0; attempt < 100 && !["completed", "failed"].includes(task.status); attempt++) { await new Promise((resolveWait) => setTimeout(resolveWait, 25)); task = readBackgroundTask(projectPath, task.id); }
assert.equal(task.status, "completed"); assert.equal(task.result.records.length, 1); assert.equal(listBackgroundTasks(projectPath).length, 1);
let retry = retryBackgroundTask(projectPath, task.id); assert.equal(retry.retryOf, task.id);
for (let attempt = 0; attempt < 100 && !["completed", "failed"].includes(retry.status); attempt++) { await new Promise((resolveWait) => setTimeout(resolveWait, 25)); retry = readBackgroundTask(projectPath, retry.id); }
assert.equal(retry.status, "completed"); assert.equal(listBackgroundTasks(projectPath).length, 2);
console.log(JSON.stringify({ ok: true, task: task.id, retry: retry.id }, null, 2));
