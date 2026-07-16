import assert from "node:assert/strict";
import { newProject } from "../scripts/project-store.mjs";
import { selectVideoType } from "../scripts/video-type-engine.mjs";
import { applyProductPromoDirector, planProductPromoDirector, renderProductPromoCards, reviewProductPromoCards } from "../scripts/product-promo-director-engine.mjs";

const project = newProject({ name: "Promo", width: 1080, height: 1920, fps: 30 });
selectVideoType(project, "product-promo", { format: "vertical", targetDuration: 20, objective: "Sell LowBattery power bank" });
project.assets.push(
  { id: "hero", name: "LowBattery hero", path: "/tmp/hero.mov", type: "video", duration: 8, annotation: { tags: ["LowBattery", "Hook", "便携", "CTA"], quality: .95 } },
  { id: "detail", name: "USB-C detail", path: "/tmp/detail.mov", type: "video", duration: 7, annotation: { tags: ["LowBattery", "快充", "USB-C", "卖点"], quality: .9 } },
  { id: "proof", name: "Phone charging proof", path: "/tmp/proof.mov", type: "video", duration: 7, annotation: { tags: ["LowBattery", "证明", "30分钟", "充电"], quality: .85 } },
  { id: "music", name: "Promo music", path: "/tmp/music.wav", type: "audio", duration: 30, beats: [0,3,6,10,14,17,20] }
);

assert.throws(() => planProductPromoDirector(project, { productName: "LowBattery", benefits: [], cta: "购买" }), /will not invent/);
const plan = planProductPromoDirector(project, { productName: "LowBattery", hook: "小巧但能打", problem: "出门手机没电", benefits: ["USB-C 快充", "轻巧便携"], proof: "30 分钟快速补电", cta: "立即购买", offer: "本周免邮", targetDuration: 20, musicAssetId: "music" });
assert.equal(plan.type, "product-promo-director-plan");
assert.equal(plan.beatAligned, true);
assert.ok(plan.sections.length >= 4);
assert.ok(plan.summary.heroShots >= 4);
assert.ok(plan.cards.every((card) => card.factStatus === "review-required"));
const applied = applyProductPromoDirector(project, plan);
assert.equal(applied.validation.valid, true);
assert.equal(applied.pendingBrandCards, plan.cards.length);
assert.equal(applied.musicItems, 1);
const review = reviewProductPromoCards(project, plan.cards.map((card) => ({ id: card.id, action: "approve", title: card.title, subtitle: card.subtitle, note: "claims checked" })));
assert.equal(review.pending, 0);
const rendered = renderProductPromoCards(project, "/tmp/cutpilot-v65/promo.mycut.json");
assert.equal(rendered.rendered.length, plan.cards.length);
assert.equal(project.timelines[0].tracks.find((track)=>track.name==="V3 · Text & CTA").items.length, plan.cards.length);
console.log(JSON.stringify({ ok: true, summary: plan.summary, beatAligned: plan.beatAligned, rendered: rendered.rendered.length }, null, 2));
