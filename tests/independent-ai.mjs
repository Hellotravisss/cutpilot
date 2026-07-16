import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdirSync, rmSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve("/tmp/cutpilot-independent-ai"); rmSync(root, { recursive: true, force: true }); mkdirSync(root, { recursive: true }); process.env.CUTPILOT_CONFIG_PATH = `${root}/settings.json`;
const server = createServer(async (request, response) => { let raw = ""; for await (const chunk of request) raw += chunk; assert.match(request.headers.authorization, /test-key/); assert.ok(JSON.parse(raw).messages); response.writeHead(200, { "content-type": "application/json" }); response.end(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ intent: "director", brief: "Make a warm short vlog", pace: "energetic", targetDuration: 12, requirements: ["avoid repeated shots"], rationale: "Matched the request" }) } }], usage: { total_tokens: 10 } })); });
await new Promise((done) => server.listen(0, "127.0.0.1", done));
const { saveAiSettings, readAiSettings, testAiConnection } = await import("../scripts/ai-provider-engine.mjs");
const { planIndependentAi } = await import("../scripts/independent-agent-engine.mjs");
saveAiSettings({ provider: "compatible", endpoint: `http://127.0.0.1:${server.address().port}`, model: "test", apiKey: "test-key" }); assert.equal(readAiSettings().hasApiKey, true); assert.equal(readAiSettings().apiKey, undefined);
const project = { name: "Vlog", assets: [], timelines: [{ id: "t", name: "Main", tracks: [] }], activeTimelineId: "t" };
const result = await planIndependentAi(`${root}/project.json`, project, { message: "剪一条短片" }); assert.equal(result.intent, "director"); assert.equal(result.plan.type, "cutpilot-director-agent-plan"); assert.equal(result.plan.requiresReview, true);
server.close(); console.log(JSON.stringify({ ok: true, provider: result.provider, intent: result.intent }, null, 2));
