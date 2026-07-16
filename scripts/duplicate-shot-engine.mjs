import { spawnSync } from "node:child_process";
import { activeTimeline, validateProject } from "./project-store.mjs";
import { rippleDeleteItem } from "./timeline-operations-engine.mjs";

const bitCount = value => { let count = 0; for (const byte of value) { let v = byte; while (v) { count += v & 1; v >>= 1; } } return count; };

export function averageHash(pixels) {
  if (!Buffer.isBuffer(pixels) || pixels.length !== 64) throw new Error("Average hash requires one 8x8 grayscale frame");
  const average = pixels.reduce((sum, value) => sum + value, 0) / 64, hash = Buffer.alloc(8);
  for (let index = 0; index < 64; index++) if (pixels[index] >= average) hash[Math.floor(index / 8)] |= 1 << (index % 8);
  return hash.toString("hex");
}

export function hashSimilarity(left, right) {
  const a = Buffer.from(left, "hex"), b = Buffer.from(right, "hex"); if (a.length !== 8 || b.length !== 8) throw new Error("Invalid average hash");
  const xor = Buffer.alloc(8); for (let index = 0; index < 8; index++) xor[index] = a[index] ^ b[index]; return Number((1 - bitCount(xor) / 64).toFixed(4));
}

function frameHash(asset, sourceTime) {
  const input = asset.type === "image" ? ["-i", asset.path] : ["-ss", String(Math.max(0, sourceTime)), "-i", asset.path];
  const result = spawnSync("ffmpeg", ["-hide_banner", "-loglevel", "error", ...input, "-frames:v", "1", "-vf", "scale=8:8:force_original_aspect_ratio=disable,format=gray", "-f", "rawvideo", "-pix_fmt", "gray", "pipe:1"], { encoding: null, maxBuffer: 4 * 1024 * 1024 });
  if (result.status !== 0 || result.stdout.length < 64) throw new Error(result.stderr?.toString() || `Could not sample ${asset.name}`); return averageHash(result.stdout.subarray(0, 64));
}

export function findDuplicateShots(project, { threshold = .92, minDuration = .2, trackIdOrName } = {}) {
  if (!(threshold >= .5 && threshold <= 1)) throw new Error("Duplicate threshold must be 0.5-1");
  const timeline = activeTimeline(project), tracks = timeline.tracks.filter(track => track.type === "video" && (!trackIdOrName || track.id === trackIdOrName || track.name === trackIdOrName));
  const samples = tracks.flatMap(track => track.items.filter(item => item.duration >= minDuration).map(item => { const asset = project.assets.find(entry => entry.id === item.assetId); return asset && ["video", "image"].includes(asset.type) ? { trackId: track.id, trackName: track.name, itemId: item.id, label: item.label || asset.name, assetId: asset.id, timelineStart: item.start, duration: item.duration, sourceTime: item.sourceStart + item.duration / 2, hash: frameHash(asset, item.sourceStart + item.duration / 2) } : null; }).filter(Boolean));
  const pairs = []; for (let left = 0; left < samples.length; left++) for (let right = left + 1; right < samples.length; right++) { const similarity = hashSimilarity(samples[left].hash, samples[right].hash); if (similarity >= threshold) pairs.push({ id: `${samples[left].itemId}:${samples[right].itemId}`, similarity, keepItemId: samples[left].timelineStart <= samples[right].timelineStart ? samples[left].itemId : samples[right].itemId, duplicateItemId: samples[left].timelineStart <= samples[right].timelineStart ? samples[right].itemId : samples[left].itemId, first: samples[left], second: samples[right] }); }
  pairs.sort((a, b) => b.similarity - a.similarity || a.second.timelineStart - b.second.timelineStart); return { detector: "local-average-hash-v1", threshold, samples: samples.length, pairs, nonMutating: true };
}

export function removeDuplicateShots(project, duplicateItemIds, { ripple = true } = {}) {
  const ids = [...new Set(duplicateItemIds)], timeline = activeTimeline(project), located = ids.map(id => { const item = timeline.tracks.flatMap(track => track.items).find(entry => entry.id === id); if (!item) throw new Error(`Timeline item not found: ${id}`); return item; }).sort((a, b) => b.start - a.start), removed = [];
  for (const item of located) { const result = rippleDeleteItem(project, item.id, ripple ? "all" : "track"); removed.push({ itemId: item.id, label: item.label, duration: result.delta }); }
  project.history.push({ at: new Date().toISOString(), action: "remove_duplicate_shots", count: removed.length, ripple }); return { removed, validation: validateProject(project) };
}
