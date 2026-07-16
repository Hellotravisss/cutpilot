import assert from "node:assert/strict";
import { capabilitySummary, listCapabilityGaps } from "../scripts/capability-engine.mjs";

const matrix=capabilitySummary(),gaps=listCapabilityGaps();
assert.equal(matrix.type,"cutpilot-capability-matrix");
assert.ok(matrix.counts.complete >= 10);
assert.ok(matrix.entries.some((entry)=>entry.id==="project-types"&&entry.status==="complete"));
assert.ok(gaps.experimental.some((entry)=>entry.id==="jianying-direct-draft"));
assert.ok(gaps.externalConfiguration.some((entry)=>entry.id==="commercial-generation"));
assert.ok(matrix.entries.find((entry)=>entry.id==="remotion"&&entry.status==="complete"));
assert.ok(matrix.entries.find((entry)=>entry.id==="asset-intelligence"&&entry.status==="complete"));
assert.ok(matrix.entries.find((entry)=>entry.id==="natural-language-edit"&&entry.status==="complete"));
assert.ok(matrix.entries.find((entry)=>entry.id==="generation"&&entry.status==="complete"));
assert.ok(matrix.entries.find((entry)=>entry.id==="capcut-handoff"&&entry.status==="complete"));
assert.ok(matrix.entries.find((entry)=>entry.id==="gpu-shader-batch"&&entry.status==="complete"));
console.log(JSON.stringify({ok:true,counts:matrix.counts,gaps:gaps.gaps.map((entry)=>entry.id)},null,2));
