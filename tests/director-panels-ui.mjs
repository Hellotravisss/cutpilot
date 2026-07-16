import assert from "node:assert/strict";
import { mkdirSync, rmSync } from "node:fs";
import { resolve } from "node:path";
import puppeteer from "puppeteer-core";
import { newProject, saveProject } from "../scripts/project-store.mjs";
import { selectVideoType } from "../scripts/video-type-engine.mjs";
import { closeReviewSession, openReviewSession } from "../scripts/review-server-engine.mjs";

const root = resolve(process.argv[2] || "/tmp/cutpilot-director-panels");
const proof = process.argv[3] && resolve(process.argv[3]);
const cases = [
  ["vlog", "Vlog 故事工作台"],
  ["talking-head", "口播一键导演"],
  ["podcast", "播客 / 访谈一键导演"],
  ["wedding", "婚礼一键导演"],
  ["product-promo", "产品广告一键导演"],
  ["explainer", "解说视频一键导演"],
  ["motion-graphics", "纯 MG 动画一键导演"],
];

rmSync(root, { recursive: true, force: true });
mkdirSync(root, { recursive: true });
const browser = await puppeteer.launch({
  executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  headless: true,
  args: ["--no-sandbox"],
});
const results = [];

try {
  for (const [type, heading] of cases) {
    process.stdout.write(`CHECK ${type}\n`);
    const project = newProject({ name: `UI ${type}`, width: 1920, height: 1080, fps: 30 });
    selectVideoType(project, type, {
      format: type === "vlog" ? "vertical" : "landscape",
      targetDuration: type === "wedding" || type === "podcast" ? 600 : 60,
      objective: `Test ${type}`,
    });
    const projectPath = `${root}/${type}.cutpilot.json`;
    saveProject(projectPath, project);
    const review = await openReviewSession({ projectPath });
    const page = await browser.newPage();
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    try {
      await page.setViewport({ width: 1440, height: 1000 });
      await page.goto(review.url, { waitUntil: "networkidle0", timeout: 15000 });
      await page.click('[data-tab="vlog"]');
      await page.waitForFunction(
        (text) => document.querySelector("#panel")?.textContent.includes(text),
        { timeout: 10000 },
        heading,
      );
      const panel = await page.$eval("#panel", (element) => element.textContent);
      assert.match(panel, /CutPilot 10 统一验收/);
      assert.equal(errors.length, 0, `${type}: ${errors.join("; ")}`);
      results.push({ type, heading, acceptance: true });
      if (proof && type === "motion-graphics") await page.screenshot({ path: proof, fullPage: true });
    } catch (error) {
      const panel = await page.$eval("#panel", (element) => element.textContent).catch(() => "<missing #panel>");
      throw new Error(`${type}: ${error.message}; pageErrors=${errors.join(" | ") || "none"}; panel=${panel.slice(0, 500)}`);
    } finally {
      await page.close();
      closeReviewSession(review.token);
    }
  }
} finally {
  await browser.close();
}

console.log(JSON.stringify({ ok: true, panels: results.length, results }, null, 2));
