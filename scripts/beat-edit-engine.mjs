import { randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import { activeTimeline, validateProject } from "./project-store.mjs";

const finite = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const median = (values) => { const sorted = [...values].sort((a, b) => a - b); return sorted.length ? sorted[Math.floor(sorted.length / 2)] : 0; };
const quantile = (values, q) => { const sorted = [...values].sort((a, b) => a - b); return sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * q))] : 0; };

function decodeEnvelope(path, sampleRate = 1000, windowMs = 20) {
  const result = spawnSync("ffmpeg", ["-hide_banner", "-loglevel", "error", "-i", path, "-vn", "-ac", "1", "-ar", String(sampleRate), "-f", "s16le", "pipe:1"], { encoding: null, maxBuffer: 256 * 1024 * 1024 });
  if (result.status !== 0) throw new Error(result.stderr?.toString() || "Audio decode failed");
  const samplesPerWindow = Math.max(1, Math.round(sampleRate * windowMs / 1000)), envelope = [];
  for (let offset = 0; offset + 1 < result.stdout.length; offset += samplesPerWindow * 2) {
    let sum = 0, count = 0;
    for (let cursor = offset; cursor + 1 < Math.min(result.stdout.length, offset + samplesPerWindow * 2); cursor += 2) { const value = result.stdout.readInt16LE(cursor) / 32768; sum += value * value; count++; }
    envelope.push(Math.sqrt(sum / Math.max(1, count)));
  }
  return { envelope, step: samplesPerWindow / sampleRate };
}

export function detectBeatsFromEnvelope(envelope, step, { sensitivity = .6, minInterval = .22, maxBpm = 220 } = {}) {
  if (!Array.isArray(envelope) || envelope.length < 3 || !(step > 0)) throw new Error("Beat envelope is too short");
  const novelty = envelope.map((value, index) => index ? Math.max(0, value - envelope[index - 1]) : 0);
  const floor = median(novelty), high = quantile(novelty, Math.max(.55, .98 - finite(sensitivity, .6) * .18));
  const threshold = floor + (high - floor) * Math.max(.08, .62 - finite(sensitivity, .6) * .42);
  const candidates = [];
  for (let i = 1; i < novelty.length - 1; i++) if (novelty[i] >= threshold && novelty[i] >= novelty[i - 1] && novelty[i] >= novelty[i + 1]) candidates.push({ time: i * step, strength: novelty[i] });
  const separation = Math.max(60 / Math.max(60, finite(maxBpm, 220)), finite(minInterval, .22)), beats = [];
  for (const candidate of candidates) {
    const last = beats.at(-1);
    if (!last || candidate.time - last.time >= separation) beats.push(candidate);
    else if (candidate.strength > last.strength) beats[beats.length - 1] = candidate;
  }
  const strengthFloor = quantile(beats.map((beat) => beat.strength), .65);
  return beats.map((beat, index) => ({ index, time: Number(beat.time.toFixed(4)), strength: beat.strength, accent: beat.strength >= strengthFloor }));
}

function estimateTempo(beats) {
  const intervals = beats.slice(1).map((beat, index) => beat.time - beats[index].time).filter((value) => value >= .2 && value <= 2);
  if (!intervals.length) return null;
  let bpm = 60 / median(intervals); while (bpm < 70) bpm *= 2; while (bpm > 180) bpm /= 2;
  return Number(bpm.toFixed(2));
}

export function analyzeAssetBeats(asset, options = {}) {
  if (!asset?.path || !["audio", "video"].includes(asset.type)) throw new Error("Beat analysis requires a local audio or video asset");
  const { envelope, step } = decodeEnvelope(asset.path, options.sampleRate || 1000, options.windowMs || 20);
  const beats = detectBeatsFromEnvelope(envelope, step, options);
  if (beats.length < 2) throw new Error("Not enough rhythmic onsets were detected; increase sensitivity or choose clearer music");
  return { assetId: asset.id, assetName: asset.name, duration: asset.duration, bpm: estimateTempo(beats), beats, accents: beats.filter((beat) => beat.accent).length, settings: { sensitivity: finite(options.sensitivity, .6), minInterval: finite(options.minInterval, .22) }, nonMutating: true };
}

export function saveBeatMarkers(project, assetId, analysis, { replace = true, accentsOnly = false, label = "Beat" } = {}) {
  const asset = project.assets.find((entry) => entry.id === assetId); if (!asset) throw new Error(`Asset not found: ${assetId}`);
  const timeline = activeTimeline(project), chosen = analysis.beats.filter((beat) => !accentsOnly || beat.accent);
  if (!chosen.length) throw new Error("No beats selected for markers");
  if (replace) timeline.markers = (timeline.markers || []).filter((marker) => marker.kind !== "beat" || marker.assetId !== assetId);
  const markers = chosen.map((beat, index) => ({ id: randomUUID(), time: beat.time, label: `${label} ${index + 1}`, kind: "beat", assetId, strength: beat.strength, accent: Boolean(beat.accent), bpm: analysis.bpm }));
  timeline.markers = [...(timeline.markers || []), ...markers].sort((a, b) => a.time - b.time);
  project.history.push({ at: new Date().toISOString(), action: "save_beat_markers", assetId, count: markers.length, accentsOnly });
  return { markers, bpm: analysis.bpm, validation: validateProject(project) };
}

function sourceRanges(project, assetIds) {
  const ranges = [];
  for (const id of assetIds) { const asset = project.assets.find((entry) => entry.id === id); if (!asset || !["video", "image", "motion-graphic"].includes(asset.type)) throw new Error(`Visual asset not found or incompatible: ${id}`); const clips = asset.subclips?.length ? asset.subclips : [{ id: null, name: asset.name, sourceStart: 0, sourceEnd: asset.duration || 5 }]; for (const clip of clips) ranges.push({ assetId: id, assetName: asset.name, subclipId: clip.id, label: clip.name || asset.name, sourceStart: finite(clip.sourceStart), sourceEnd: finite(clip.sourceEnd, asset.duration || 5) }); }
  if (!ranges.length) throw new Error("At least one visual source is required"); return ranges;
}

export function buildBeatMontagePlan(project, { beatTimes, assetIds, start, end, cutEvery = 1, minClip = .12 } = {}) {
  const times = [...new Set((beatTimes || []).map(Number).filter(Number.isFinite))].sort((a, b) => a - b), first = finite(start, times[0] || 0), last = end == null ? times.at(-1) : finite(end);
  const boundaries = [first, ...times.filter((time, index) => time > first && time < last && index % Math.max(1, Math.round(cutEvery)) === 0), last].filter((time, index, all) => index === 0 || time - all[index - 1] >= minClip - .0001);
  if (boundaries.length < 2 || !(last > first)) throw new Error("Beat range must contain at least one editable interval");
  const sources = sourceRanges(project, assetIds), clips = [];
  for (let index = 0; index < boundaries.length - 1; index++) { const duration = boundaries[index + 1] - boundaries[index], source = sources[index % sources.length], available = source.sourceEnd - source.sourceStart; if (available <= 0) throw new Error(`Invalid source range for ${source.label}`); clips.push({ index, start: boundaries[index], duration, assetId: source.assetId, subclipId: source.subclipId, label: source.label, sourceStart: source.sourceStart + (index * duration) % Math.max(.001, available - Math.min(duration, available)), sourceDuration: Math.min(duration, available), freezeFrame: available + .001 < duration }); }
  return { start: first, end: last, cutEvery: Math.max(1, Math.round(cutEvery)), clips, boundaries, nonMutating: true };
}

export function applyBeatMontage(project, { trackIdOrName = "V1", plan, replaceRange = true } = {}) {
  const timeline = activeTimeline(project), track = timeline.tracks.find((entry) => entry.id === trackIdOrName || entry.name === trackIdOrName); if (!track || track.type !== "video") throw new Error(`Video track not found: ${trackIdOrName}`); if (track.locked) throw new Error(`Track ${track.name} is locked`); if (!plan?.clips?.length) throw new Error("A reviewed beat montage plan is required");
  const start = plan.start, end = plan.end;
  if (replaceRange) track.items = track.items.filter((item) => item.start + item.duration <= start + .0001 || item.start >= end - .0001);
  const items = plan.clips.map((clip) => ({ id: randomUUID(), assetId: clip.assetId, start: clip.start, sourceStart: clip.sourceStart, duration: clip.duration, label: clip.label, volumeDb: 0, opacity: 1, fadeIn: 0, fadeOut: 0, audioFadeIn: 0, audioFadeOut: 0, ...(clip.freezeFrame ? { freezeFrame: true } : {}) }));
  track.items.push(...items); track.items.sort((a, b) => a.start - b.start); project.history.push({ at: new Date().toISOString(), action: "apply_beat_montage", trackId: track.id, count: items.length, start, end });
  const validation = validateProject(project); if (!validation.valid) throw new Error(validation.errors.join("\n")); return { items, track: { id: track.id, name: track.name }, validation };
}
