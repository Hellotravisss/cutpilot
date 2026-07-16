import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
const html = readFileSync("site/index.html", "utf8");
assert.match(html, /CutPilot/); assert.match(html, /Low Battery Studio/); assert.match(html, /Hellotravisss\/cutpilot/); assert.match(html, /让 AI 剪/); assert.ok(existsSync("site/cutpilot-logo.svg"));
console.log(JSON.stringify({ ok: true, bytes: Buffer.byteLength(html) }));
