import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import puppeteer from "puppeteer-core";

const root = mkdtempSync(join(tmpdir(), "mycut-beat-mcp-")), projectPath = join(root, "beats.mycut.json"), audio = join(root, "120bpm.wav"), red = join(root, "red.png"), blue = join(root, "blue.png");
for (const [path, args] of [[audio, ["-f", "lavfi", "-i", "aevalsrc=if(lt(mod(t\\,0.5)\\,0.025)\\,0.95*sin(2*PI*900*t)\\,0):s=48000:d=4"]], [red, ["-f", "lavfi", "-i", "color=c=red:s=320x180", "-frames:v", "1"]], [blue, ["-f", "lavfi", "-i", "color=c=blue:s=320x180", "-frames:v", "1"]]]) { const result = spawnSync("ffmpeg", ["-y", "-hide_banner", "-loglevel", "error", ...args, path], { encoding: "utf8" }); assert.equal(result.status, 0, result.stderr); }
const client = new Client({ name: "beat-mcp-test", version: "1" }), transport = new StdioClientTransport({ command: process.execPath, args: [resolve("scripts/server.mjs")], cwd: resolve(".") }); await client.connect(transport);
const call = async (name, args) => { const response = await client.callTool({ name, arguments: args }); if (response.isError) throw new Error(response.content[0].text); return JSON.parse(response.content[0].text); };
await call("create_project", { projectPath, name: "Beat MCP", width: 320, height: 180, fps: 30 }); const imported = await call("import_assets", { projectPath, paths: [audio, red, blue] }), [music, redAsset, blueAsset] = imported.imported;
const analysis = await call("analyze_asset_beats", { projectPath, assetId: music.id, sensitivity: .7, minInterval: .3 }); assert.ok(Math.abs(analysis.bpm - 120) < 2); assert.ok(analysis.beats.length >= 7);
const saved = await call("save_beat_markers", { projectPath, assetId: music.id, analysis, replace: true, accentsOnly: false, label: "节拍" }); assert.equal(saved.markers.length, analysis.beats.length);
const plan = await call("plan_beat_montage", { projectPath, beatTimes: analysis.beats.map((beat) => beat.time), assetIds: [redAsset.id, blueAsset.id], cutEvery: 1, minClip: .12 }); assert.equal(plan.nonMutating, true); assert.ok(plan.clips.length >= 5);
const applied = await call("apply_beat_montage", { projectPath, trackIdOrName: "V1", plan, replaceRange: true }); assert.equal(applied.items.length, plan.clips.length); assert.equal(applied.validation.valid, true);
const review = await call("open_review_session", { projectPath }); const browser = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: true, args: ["--no-sandbox"] }), page = await browser.newPage(), errors = []; page.on("pageerror", error => errors.push(error.message)); await page.goto(review.url, { waitUntil: "networkidle0" }); await page.click('[data-tab="beat"]'); await page.waitForSelector("#analyzeBeats"); assert.match(await page.$eval("#panel", element => element.textContent), /本地节拍与卡点/); assert.equal(errors.length, 0); await browser.close(); await call("close_review_session", { token: review.token }); await client.close();
console.log(JSON.stringify({ ok: true, bpm: analysis.bpm, beats: analysis.beats.length, markers: saved.markers.length, montage: applied.items.length, browserErrors: errors }, null, 2));
