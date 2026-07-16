import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { onRequest } from "../functions/_middleware.js";
const html = readFileSync("site/index.html", "utf8");
assert.match(html, /CutPilot/); assert.match(html, /Low Battery Studio/); assert.match(html, /Hellotravisss\/cutpilot/); assert.match(html, /让 AI 剪/); assert.ok(existsSync("site/cutpilot-logo.svg"));

const legacyResponse = await onRequest({
  request: new Request("https://cutpilot.pages.dev/docs?from=legacy"),
  next: () => { throw new Error("Legacy host must redirect"); },
});
assert.equal(legacyResponse.status, 301);
assert.equal(legacyResponse.headers.get("location"), "https://cutpilot.lowbattery.studio/docs?from=legacy");

const primaryResponse = await onRequest({
  request: new Request("https://cutpilot.lowbattery.studio/"),
  next: () => new Response("primary"),
});
assert.equal(await primaryResponse.text(), "primary");
console.log(JSON.stringify({ ok: true, bytes: Buffer.byteLength(html) }));
