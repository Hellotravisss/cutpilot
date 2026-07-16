import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { createHash } from "node:crypto";
import { snapshotFolder } from "./version-engine.mjs";
import { terms } from "./semantic-engine.mjs";

const VERSION = 1;
const aliases = {
  "婚礼": ["wedding", "bride", "groom", "ceremony", "婚纱", "新娘", "新郎", "仪式"],
  "代码": ["code", "coding", "programming", "computer", "laptop", "编程", "电脑", "写代码"],
  "走路": ["walk", "walking", "street", "行走", "步行"],
  "洗手": ["wash", "washing", "hands", "sink", "水池", "清洗"],
  "建筑": ["architecture", "building", "interior", "建筑", "室内"],
  "拍摄": ["camera", "shoot", "filming", "photography", "摄影", "拍照"],
};

const indexPath = (projectPath) => join(snapshotFolder(resolve(projectPath)), "semantic-index.json");
const normalizeText = (value) => String(value || "").normalize("NFKC").trim();
const fingerprint = (project) => createHash("sha256").update(JSON.stringify((project.assets || []).map((asset) => ({ id: asset.id, name: asset.name, type: asset.type, duration: asset.duration, annotation: asset.annotation, transcript: asset.transcript, subclips: asset.subclips })))).digest("hex");
const atomicWrite = (path, value) => { mkdirSync(dirname(path), { recursive: true }); const temporary = `${path}.${process.pid}.tmp`; writeFileSync(temporary, JSON.stringify(value, null, 2)); renameSync(temporary, path); };
const addAliases = (values) => { const set = new Set(values); for (const value of values) for (const [key, related] of Object.entries(aliases)) { const valueTerms = terms(value); if (valueTerms.has(key) || related.some((item) => [...terms(item)].some((term) => valueTerms.has(term)))) { set.add(key); related.forEach((item) => set.add(item)); } } return [...set]; };

function assetEvidence(asset) {
  const annotation = asset.annotation || {};
  const vision = annotation.semantics || annotation.vision || annotation.intelligence?.semantics || {};
  return addAliases([asset.name, annotation.description, ...(annotation.tags || []), ...(annotation.people || []), ...(annotation.actions || []), ...(annotation.locations || []), ...(vision.labels || []).map((label) => typeof label === "string" ? label : label.name), asset.transcript?.text].filter(Boolean));
}

export function buildSemanticIndex(projectPath, project) {
  const records = [];
  for (const asset of project.assets || []) {
    const evidence = assetEvidence(asset);
    records.push({ id: `asset:${asset.id}`, kind: "asset", assetId: asset.id, assetType: asset.type, name: asset.name, sourceStart: 0, sourceEnd: Number(asset.duration || 0), text: evidence.join(" "), evidence, quality: Number(asset.annotation?.quality || .5), motion: Number(asset.annotation?.motion || .5) });
    for (const subclip of asset.subclips || []) { const sourceStart = Number(subclip.sourceStart ?? subclip.start ?? 0); records.push({ id: `subclip:${asset.id}:${subclip.id}`, kind: "subclip", assetId: asset.id, subclipId: subclip.id, assetType: asset.type, name: subclip.name || asset.name, sourceStart, sourceEnd: Number(subclip.sourceEnd ?? subclip.end ?? (sourceStart + Number(subclip.duration || 0)) ?? asset.duration ?? 0), text: addAliases([...evidence, subclip.name, subclip.description, ...(subclip.tags || [])].filter(Boolean)).join(" "), quality: Number(subclip.quality || asset.annotation?.quality || .5), motion: Number(subclip.motion || asset.annotation?.motion || .5) }); }
    for (const [cueIndex, cue] of (asset.transcript?.cues || []).entries()) records.push({ id: `transcript:${asset.id}:${cueIndex}`, kind: "transcript", assetId: asset.id, assetType: asset.type, name: asset.name, sourceStart: Number(cue.start || 0), sourceEnd: Number(cue.end || 0), text: addAliases([...evidence, cue.text, ...(cue.words || []).map((word) => word.text)].filter(Boolean)).join(" "), quality: Number(asset.annotation?.quality || .5), motion: Number(asset.annotation?.motion || .5) });
  }
  const index = { type: "cutpilot-semantic-index", version: VERSION, projectId: project.id, projectName: project.name, projectFile: basename(resolve(projectPath)), fingerprint: fingerprint(project), builtAt: new Date().toISOString(), records };
  atomicWrite(indexPath(projectPath), index);
  return { ...index, path: indexPath(projectPath) };
}

export function semanticIndexStatus(projectPath, project) {
  const path = indexPath(projectPath);
  if (!existsSync(path)) return { exists: false, stale: true, path, records: 0 };
  const index = JSON.parse(readFileSync(path, "utf8"));
  return { exists: true, stale: index.fingerprint !== fingerprint(project), path, records: index.records.length, builtAt: index.builtAt, version: index.version };
}

export function readSemanticIndex(projectPath, project, { rebuildIfStale = true } = {}) {
  const status = semanticIndexStatus(projectPath, project);
  if (!status.exists || (status.stale && rebuildIfStale)) return buildSemanticIndex(projectPath, project);
  return { ...JSON.parse(readFileSync(status.path, "utf8")), path: status.path };
}

export function searchSemanticIndex(projectPath, project, { query, limit = 10, assetTypes = [], kinds = [], avoidAssetIds = [], minScore = 0 } = {}) {
  if (!normalizeText(query)) throw new Error("Semantic search query is required");
  const index = readSemanticIndex(projectPath, project);
  const expanded = addAliases([query]);
  const queryTerms = new Set(expanded.flatMap((value) => [...terms(value)]));
  const avoid = new Set(avoidAssetIds);
  const results = index.records.filter((record) => (!assetTypes.length || assetTypes.includes(record.assetType)) && (!kinds.length || kinds.includes(record.kind))).map((record) => {
    const recordTerms = terms(record.text); const matches = [...queryTerms].filter((term) => recordTerms.has(term));
    const exact = expanded.some((value) => record.text.toLowerCase().includes(String(value).toLowerCase()));
    const rangeBoost = record.kind === "subclip" ? 1.2 : record.kind === "transcript" ? .8 : 0;
    const score = matches.length * 1.8 + (exact ? 3 : 0) + Number(record.quality || .5) + Number(record.motion || .5) * .15 + rangeBoost - (avoid.has(record.assetId) ? 6 : 0);
    return { ...record, score: Number(score.toFixed(3)), matches, avoided: avoid.has(record.assetId) };
  }).filter((record) => record.score >= minScore && record.matches.length).sort((a, b) => b.score - a.score || (a.sourceEnd - a.sourceStart) - (b.sourceEnd - b.sourceStart)).slice(0, limit);
  return { type: "cutpilot-semantic-search", query, expandedQuery: expanded, indexBuiltAt: index.builtAt, results };
}
