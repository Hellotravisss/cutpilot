import assert from "node:assert/strict";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { loadProject, newProject, saveProject } from "../scripts/project-store.mjs";
import { CURRENT_PROJECT_SCHEMA, repairProject } from "../scripts/project-integrity-engine.mjs";

const root = resolve("/tmp/cutpilot-project-integrity"), path = `${root}/project.cutpilot.json`;
rmSync(root, { recursive: true, force: true }); mkdirSync(root, { recursive: true });
const project = newProject({ name: "Safe", width: 320, height: 180, fps: 24 });
saveProject(path, project); const stale = structuredClone(project); project.name = "Safe 2"; saveProject(path, project); assert.throws(() => saveProject(path, stale), /changed in another process/);
assert.equal(existsSync(`${path}.bak`), true);
writeFileSync(path, "{broken");
const recovered = loadProject(path);
assert.equal(recovered.recovered, true); assert.equal(recovered.project.name, "Safe"); assert.doesNotThrow(() => JSON.parse(readFileSync(path, "utf8")));
const legacy = { name: "Legacy", assets: [], timeline: { name: "Main", width: 1, height: 1, fps: 1, tracks: [] } };
const repaired = repairProject(legacy);
assert.equal(repaired.project.schemaVersion, CURRENT_PROJECT_SCHEMA); assert.ok(repaired.project.timelines[0].tracks.some((track) => track.type === "video")); assert.ok(repaired.project.timelines[0].tracks.some((track) => track.type === "audio"));
console.log(JSON.stringify({ ok: true, recovered: recovered.recovered, repairChanges: repaired.changes }, null, 2));
