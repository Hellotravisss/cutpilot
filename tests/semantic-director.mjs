import assert from "node:assert/strict";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { newProject, validateProject } from "../scripts/project-store.mjs";
import { buildSemanticIndex, searchSemanticIndex, semanticIndexStatus } from "../scripts/semantic-index-engine.mjs";
import { applyDirectorAgentPlan, planDirectorAgent } from "../scripts/director-agent-engine.mjs";

const root = resolve(process.argv[2] || "/tmp/cutpilot-semantic-director"); rmSync(root, { recursive: true, force: true }); mkdirSync(root, { recursive: true });
const projectPath = `${root}/project.cutpilot.json`, project = newProject({ name: "Semantic Director", width: 1080, height: 1920, fps: 30 });
project.assets.push(
  { id: "walk", name: "走路.mov", path: `${root}/walk.mov`, type: "video", duration: 8, annotation: { description: "工厂下班后走路", tags: ["walking"], quality: .8 }, subclips: [{ id: "walk-a", name: "一次走路", sourceStart: 1, duration: 4, tags: ["走路"] }] },
  { id: "code", name: "code-at-night.mov", path: `${root}/code.mov`, type: "video", duration: 10, annotation: { description: "晚上使用电脑写代码", tags: ["coding", "laptop"], quality: .9 }, subclips: [{ id: "code-a", name: "敲键盘", sourceStart: 2, duration: 5, tags: ["写代码"] }] },
  { id: "wedding", name: "wedding-ceremony.mov", path: `${root}/wedding.mov`, type: "video", duration: 12, annotation: { description: "拍摄婚礼新娘新郎", tags: ["wedding", "camera"], quality: .95 }, subclips: [{ id: "wedding-a", name: "交换戒指", sourceStart: 3, duration: 4, tags: ["婚礼"] }] },
);
const timeline = project.timelines[0]; timeline.captions = { enabled: true, style: {}, cues: [{ start: 0, end: 4, text: "下班走路" }, { start: 4, end: 9, text: "晚上回家写代码" }, { start: 9, end: 13, text: "周末接拍婚礼" }] };
writeFileSync(projectPath, JSON.stringify(project, null, 2));
const index = buildSemanticIndex(projectPath, project); assert.equal(index.records.length, 6); assert.equal(semanticIndexStatus(projectPath, project).stale, false);
const code = searchSemanticIndex(projectPath, project, { query: "写代码", assetTypes: ["video"] }); assert.equal(code.results[0].assetId, "code"); assert.equal(code.results.find((result) => result.kind === "subclip").sourceStart, 2);
const wedding = searchSemanticIndex(projectPath, project, { query: "拍婚礼", avoidAssetIds: ["code"] }); assert.equal(wedding.results[0].assetId, "wedding");
const plan = planDirectorAgent(projectPath, project, { pace: "energetic" }); assert.equal(plan.summary.recommended, 3); assert.equal(plan.beats[1].recommendation.assetId, "code"); assert.equal(plan.beats[2].recommendation.assetId, "wedding");
assert.throws(() => applyDirectorAgentPlan(project, plan), /approved/);
const applied = applyDirectorAgentPlan(project, plan, { approved: true, replaceTargetTrack: true }); assert.equal(applied.items, 3); assert.equal(applied.track.items.length, 3); assert.equal(timeline.markers.length, 3); assert.equal(validateProject(project).valid, true);
console.log(JSON.stringify({ ok: true, records: index.records.length, plan: plan.summary, applied: applied.items }, null, 2));
