import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, unlinkSync, writeFileSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { randomUUID } from "node:crypto";

const safeName = (value) => String(value || "snapshot").replace(/[^\w.\-\u4e00-\u9fff]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80) || "snapshot";

export function snapshotFolder(projectPath) {
  const path = resolve(projectPath);
  return join(dirname(path), ".mycut-history", basename(path));
}

const journalFolder = (projectPath) => join(snapshotFolder(projectPath), "editor-journal");
const stackFolder = (projectPath, stack) => join(journalFolder(projectPath), stack);
const semantic = (project) => { const copy = structuredClone(project); delete copy.updatedAt; return JSON.stringify(copy); };
const files = (projectPath, stack) => { const folder = stackFolder(projectPath, stack); if (!existsSync(folder)) return []; return readdirSync(folder).filter((name) => name.endsWith(".json")).sort(); };
let lastJournalTimestamp = 0;
const nextJournalTimestamp = (projectPath) => { const existing = ["undo", "redo"].flatMap((stack) => files(projectPath, stack)).map((name) => Number(name.slice(0, 13))).filter(Number.isFinite); const timestamp = Math.max(Date.now(), lastJournalTimestamp + 1, (existing.length ? Math.max(...existing) : 0) + 1); lastJournalTimestamp = timestamp; return timestamp; };
const writeEntry = (projectPath, stack, project, metadata = {}) => { const folder = stackFolder(projectPath, stack); mkdirSync(folder, { recursive: true }); const id = `${String(nextJournalTimestamp(projectPath)).padStart(13, "0")}-${randomUUID()}`, path = join(folder, `${id}.json`); writeFileSync(path, JSON.stringify({ metadata: { id, createdAt: new Date().toISOString(), ...metadata }, project }, null, 2)); const entries = files(projectPath, stack); for (const stale of entries.slice(0, Math.max(0, entries.length - 100))) unlinkSync(join(folder, stale)); return id; };
const clearStack = (projectPath, stack) => rmSync(stackFolder(projectPath, stack), { recursive: true, force: true });

export function recordProjectChange(projectPath, previousProject, nextProject) { if (!previousProject || semantic(previousProject) === semantic(nextProject)) return null; const nextAction = nextProject.history?.at(-1)?.action || "project_edit"; const id = writeEntry(projectPath, "undo", previousProject, { action: nextAction }); clearStack(projectPath, "redo"); return id; }

export function editorHistoryStatus(projectPath) { const describe = (stack) => files(projectPath, stack).map((name) => JSON.parse(readFileSync(join(stackFolder(projectPath, stack), name), "utf8")).metadata); const undo = describe("undo"), redo = describe("redo"); return { canUndo: undo.length > 0, canRedo: redo.length > 0, undoCount: undo.length, redoCount: redo.length, nextUndo: undo.at(-1) || null, nextRedo: redo.at(-1) || null, limit: 100 }; }

function travel(projectPath, from, to, action) { const path = resolve(projectPath); if (!existsSync(path)) throw new Error(`Project not found: ${path}`); const entries = files(path, from); if (!entries.length) throw new Error(`Nothing to ${action}`); const entryPath = join(stackFolder(path, from), entries.at(-1)), entry = JSON.parse(readFileSync(entryPath, "utf8")), current = JSON.parse(readFileSync(path, "utf8")); writeEntry(path, to, current, { action: current.history?.at(-1)?.action || "project_edit" }); unlinkSync(entryPath); entry.project.history ||= []; entry.project.history.push({ at: new Date().toISOString(), action, journalEntryId: entry.metadata.id }); entry.project.updatedAt = new Date().toISOString(); writeFileSync(path, JSON.stringify(entry.project, null, 2)); return { project: entry.project, restoredEntry: entry.metadata, status: editorHistoryStatus(path) }; }
export function undoProject(projectPath) { return travel(projectPath, "undo", "redo", "undo"); }
export function redoProject(projectPath) { return travel(projectPath, "redo", "undo", "redo"); }

export function createSnapshot(projectPath, label = "snapshot") {
  const source = resolve(projectPath);
  if (!existsSync(source)) throw new Error(`Project not found: ${source}`);
  const folder = snapshotFolder(source);
  mkdirSync(folder, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const id = `${stamp}--${safeName(label)}`;
  const snapshotPath = join(folder, `${id}.json`);
  const project = JSON.parse(readFileSync(source, "utf8"));
  const metadata = { id, label, createdAt: new Date().toISOString(), snapshotPath, projectId: project.id, projectUpdatedAt: project.updatedAt || null };
  writeFileSync(snapshotPath, JSON.stringify({ metadata, project }, null, 2));
  return metadata;
}

export function listSnapshots(projectPath) {
  const folder = snapshotFolder(projectPath);
  if (!existsSync(folder)) return [];
  return readdirSync(folder).filter((name) => name.endsWith(".json")).sort().reverse().map((name) => {
    const entry = JSON.parse(readFileSync(join(folder, name), "utf8"));
    return entry.metadata;
  });
}

export function restoreSnapshot(projectPath, snapshotId) {
  const target = resolve(projectPath);
  const snapshotPath = join(snapshotFolder(target), `${snapshotId}.json`);
  if (!existsSync(snapshotPath)) throw new Error(`Snapshot not found: ${snapshotId}`);
  const entry = JSON.parse(readFileSync(snapshotPath, "utf8"));
  const safety = createSnapshot(target, "before-restore");
  entry.project.history ||= [];
  entry.project.history.push({ at: new Date().toISOString(), action: "restore_snapshot", snapshotId, safetySnapshotId: safety.id });
  writeFileSync(target, JSON.stringify(entry.project, null, 2));
  return { restored: entry.metadata, safetySnapshot: safety };
}
