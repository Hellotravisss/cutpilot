import assert from "node:assert/strict";
import { newProject } from "../scripts/project-store.mjs";
import { selectVideoType } from "../scripts/video-type-engine.mjs";
import { applyExplainerDirector, planExplainerDirector, renderExplainerInfoCards, reviewExplainerInfoCards } from "../scripts/explainer-director-engine.mjs";

const project = newProject({ name: "Explainer", width: 1920, height: 1080, fps: 30 });
selectVideoType(project, "explainer", { format: "landscape", objective: "Explain workflow" });
project.assets.push(
  { id: "voice", name: "Narration", path: "/tmp/voice.wav", type: "audio", duration: 6, transcript: { cues: [
    { start: 0, end: 3, text: "第一步写代码", words: [{ start: 0, end: 1, text: "第一步" }, { start: 1, end: 3, text: "写代码" }] },
    { start: 3, end: 6, text: "第二步拍婚礼", words: [{ start: 3, end: 4, text: "第二步" }, { start: 4, end: 6, text: "拍婚礼" }] }
  ] } },
  { id: "code", name: "Code screen", path: "/tmp/code.mov", type: "video", duration: 4, annotation: { tags: ["第一步", "写代码"], quality: .9 } },
  { id: "wedding", name: "Wedding proof", path: "/tmp/wedding.mov", type: "video", duration: 4, annotation: { tags: ["第二步", "拍婚礼"], quality: .9 } },
  { id: "detail", name: "Workflow details", path: "/tmp/detail.mov", type: "video", duration: 4, annotation: { tags: ["步骤", "细节", "第一步", "第二步"], quality: .7 } }
);

const plan = planExplainerDirector(project);
assert.equal(plan.summary.narrationSegments, 2);
assert.equal(plan.summary.primaryShots, 2);
assert.equal(plan.summary.infoCards, 2);
assert.ok(plan.infoCards.every((card) => card.factStatus === "review-required"));
const result = applyExplainerDirector(project, plan);
assert.equal(result.validation.valid, true);
assert.equal(result.mainItems, 2);
assert.equal(result.pendingInfoCards, 2);
assert.equal(project.timelines[0].captions.style.template, "bold-box");
assert.throws(() => renderExplainerInfoCards(project, "/tmp/cutpilot-v64/explainer.mycut.json"), /fact review/);

const review = reviewExplainerInfoCards(project, plan.infoCards.map((card, index) => ({
  id: card.id,
  action: index === 0 ? "approve" : "reject",
  title: index === 0 ? "第一步：写代码" : card.title,
  note: "fixture review"
})));
assert.equal(review.approved, 1);
assert.equal(review.rejected, 1);
const mg = renderExplainerInfoCards(project, "/tmp/cutpilot-v64/explainer.mycut.json");
assert.equal(mg.rendered.length, 1);
assert.equal(mg.rejected, 1);
assert.equal(project.timelines[0].pendingTitleCards[0].status, "rendered");
assert.equal(project.timelines[0].pendingTitleCards[1].status, "rejected");
assert.equal(project.assets.find((asset) => asset.id === mg.rendered[0].assetId).type, "motion-graphic");
console.log(JSON.stringify({ ok: true, summary: plan.summary, review, rendered: mg.rendered.length }, null, 2));
