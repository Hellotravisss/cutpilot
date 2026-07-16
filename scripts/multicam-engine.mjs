import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { activeTimeline, validateProject } from "./project-store.mjs";

const run = (command, args) => {
  const result = spawnSync(command, args, { encoding: null, maxBuffer: 256 * 1024 * 1024 });
  if (result.status !== 0) throw new Error(Buffer.from(result.stderr || "").toString("utf8") || `${command} failed`);
  return result.stdout;
};

const assetById = (project, id) => {
  const asset = project.assets.find((entry) => entry.id === id);
  if (!asset) throw new Error(`Asset not found: ${id}`);
  if (!asset.path || !["audio", "video"].includes(asset.type)) throw new Error(`Asset ${id} has no synchronizable audio source`);
  return asset;
};

function envelope(path, { sampleRate = 1000, envelopeRate = 50, analysisSeconds = 180 } = {}) {
  const bytes = run("ffmpeg", ["-hide_banner", "-loglevel", "error", "-t", String(analysisSeconds), "-i", path, "-vn", "-ac", "1", "-ar", String(sampleRate), "-f", "f32le", "-"]);
  const samples = new Float32Array(bytes.buffer, bytes.byteOffset, Math.floor(bytes.byteLength / 4));
  const window = Math.max(1, Math.round(sampleRate / envelopeRate)), values = [];
  for (let offset = 0; offset + window <= samples.length; offset += window) {
    let energy = 0;
    for (let index = offset; index < offset + window; index++) energy += samples[index] * samples[index];
    values.push(Math.sqrt(energy / window));
  }
  const mean = values.reduce((sum, value) => sum + value, 0) / Math.max(1, values.length);
  return Float64Array.from(values, (value) => value - mean);
}

function correlation(reference, candidate, lag) {
  const refStart = Math.max(0, -lag), candidateStart = Math.max(0, lag);
  const length = Math.min(reference.length - refStart, candidate.length - candidateStart);
  if (length < 20) return -1;
  let dot = 0, refEnergy = 0, candidateEnergy = 0;
  for (let index = 0; index < length; index++) {
    const a = reference[refStart + index], b = candidate[candidateStart + index];
    dot += a * b; refEnergy += a * a; candidateEnergy += b * b;
  }
  return dot / Math.sqrt(Math.max(1e-20, refEnergy * candidateEnergy));
}

export function analyzeMulticamSync(project, { assetIds, referenceAssetId, maxOffsetSeconds = 30, analysisSeconds = 180, envelopeRate = 50 } = {}) {
  const ids = [...new Set(assetIds || [])];
  if (ids.length < 2) throw new Error("Multicam sync requires at least two assets");
  const referenceId = referenceAssetId || ids[0];
  if (!ids.includes(referenceId)) throw new Error("referenceAssetId must be included in assetIds");
  if (!(maxOffsetSeconds > 0 && maxOffsetSeconds <= 600)) throw new Error("maxOffsetSeconds must be 0-600");
  const assets = ids.map((id) => assetById(project, id));
  const envelopes = new Map(assets.map((asset) => [asset.id, envelope(asset.path, { analysisSeconds, envelopeRate })]));
  const reference = envelopes.get(referenceId), maxLag = Math.round(maxOffsetSeconds * envelopeRate);
  const offsets = assets.map((asset) => {
    if (asset.id === referenceId) return { assetId: asset.id, name: asset.name, offsetSeconds: 0, confidence: 1 };
    let bestLag = 0, best = -1, second = -1;
    for (let lag = -maxLag; lag <= maxLag; lag++) {
      const score = correlation(reference, envelopes.get(asset.id), lag);
      if (score > best) { second = best; best = score; bestLag = lag; } else if (score > second) second = score;
    }
    const confidence = Math.max(0, Math.min(1, best * Math.min(1, Math.max(.2, (best - second) * 100))));
    return { assetId: asset.id, name: asset.name, offsetSeconds: Number((bestLag / envelopeRate).toFixed(4)), correlation: Number(best.toFixed(5)), confidence: Number(confidence.toFixed(3)) };
  });
  const minimum = Math.min(...offsets.map((entry) => entry.offsetSeconds));
  for (const entry of offsets) entry.sourceStart = Number((entry.offsetSeconds - minimum).toFixed(4));
  const duration = Math.max(0, ...offsets.map((entry) => Number(assetById(project, entry.assetId).duration || 0) - entry.sourceStart));
  return { referenceAssetId: referenceId, offsets, duration: Number(duration.toFixed(4)), envelopeRate, analysisSeconds, method: "normalized-audio-envelope-correlation", warning: offsets.some((entry) => entry.confidence < .35) ? "One or more angles have weak audio correlation; review sync before cutting." : null };
}

export function applyMulticamSync(project, analysis, { trackPrefix = "CAM", includeAudio = false, replace = false } = {}) {
  const timeline = activeTimeline(project), created = [];
  analysis.offsets.forEach((entry, index) => {
    const asset = assetById(project, entry.assetId), name = `${trackPrefix} ${index + 1} · ${asset.name}`;
    let track = timeline.tracks.find((candidate) => candidate.name === name);
    if (!track) { track = { id: randomUUID(), name, type: "video", locked: false, muted: false, opacity: 1, items: [] }; timeline.tracks.push(track); }
    if (replace) track.items = [];
    const duration = Number(asset.duration || 0) - entry.sourceStart;
    if (duration <= 0) throw new Error(`Asset ${asset.name} has no media after sync offset`);
    const linkGroupId = includeAudio && asset.type === "video" ? randomUUID() : undefined;
    track.items.push({ id: randomUUID(), assetId: asset.id, start: 0, sourceStart: entry.sourceStart, duration, volumeDb: 0, opacity: 1, label: asset.name, ...(linkGroupId ? { linkGroupId } : {}) });
    created.push({ trackId: track.id, trackName: track.name, assetId: asset.id, sourceStart: entry.sourceStart, duration });
    if (includeAudio && asset.type === "video") {
      const audioName = `A ${index + 1} · ${asset.name}`;
      let audio = timeline.tracks.find((candidate) => candidate.name === audioName);
      if (!audio) { audio = { id: randomUUID(), name: audioName, type: "audio", role: index === 0 ? "anchor" : "mix", locked: false, muted: index !== 0, volumeDb: 0, denoise: false, normalizeLufs: -16, items: [] }; timeline.tracks.push(audio); }
      if (replace) audio.items = [];
      audio.items.push({ id: randomUUID(), assetId: asset.id, start: 0, sourceStart: entry.sourceStart, duration, volumeDb: 0, opacity: 1, label: asset.name, linkGroupId });
    }
  });
  timeline.multicamSync = { appliedAt: new Date().toISOString(), referenceAssetId: analysis.referenceAssetId, method: analysis.method, offsets: analysis.offsets, duration: analysis.duration, envelopeRate: analysis.envelopeRate, analysisSeconds: analysis.analysisSeconds, warning: analysis.warning || null, angles: created.length };
  project.history.push({ at: new Date().toISOString(), action: "multicam_sync", angles: created.length });
  const validation = validateProject(project); if (!validation.valid) throw new Error(validation.errors.join("\n"));
  return { created, duration: analysis.duration, validation };
}

export function applyMulticamCut(project, analysis, { switches, trackName = "V1 · Multicam Program", replace = false } = {}) {
  if (!Array.isArray(switches) || !switches.length) throw new Error("switches must contain at least one camera segment");
  const timeline = activeTimeline(project), offsetMap = new Map(analysis.offsets.map((entry) => [entry.assetId, entry]));
  let track = timeline.tracks.find((candidate) => candidate.name === trackName);
  if (!track) { track = { id: randomUUID(), name: trackName, type: "video", locked: false, muted: false, opacity: 1, items: [] }; timeline.tracks.push(track); }
  if (track.locked) throw new Error(`Track ${trackName} is locked`); if (replace) track.items = [];
  const ordered = [...switches].sort((a, b) => a.start - b.start), items = [];
  for (const segment of ordered) {
    const start = Number(segment.start), end = Number(segment.end), sync = offsetMap.get(segment.assetId), asset = assetById(project, segment.assetId);
    if (!sync) throw new Error(`Asset ${segment.assetId} is not part of the sync analysis`);
    if (!(start >= 0 && end > start)) throw new Error("Every switch requires end > start >= 0");
    const sourceStart = sync.sourceStart + start, duration = end - start;
    if (asset.duration && sourceStart + duration > asset.duration + .05) throw new Error(`Switch exceeds ${asset.name} duration`);
    items.push({ id: randomUUID(), assetId: asset.id, start, sourceStart, duration, volumeDb: 0, opacity: 1, label: segment.label || asset.name });
  }
  track.items.push(...items); track.items.sort((a, b) => a.start - b.start);
  project.history.push({ at: new Date().toISOString(), action: "multicam_cut", segments: items.length, trackName });
  const validation = validateProject(project); if (!validation.valid) throw new Error(validation.errors.join("\n"));
  return { trackId: track.id, trackName, segments: items, validation };
}

export function planMulticamCut(project, analysis, { start = 0, end, pace = "balanced", minShotSeconds, maxShotSeconds, preferredAssetIds = [], holds = [] } = {}) {
  const finish = Math.min(Number(end ?? analysis.duration), Number(analysis.duration));
  if (!(start >= 0 && finish > start)) throw new Error("Multicam plan requires end > start >= 0 within the synchronized duration");
  const profiles = { stable: [4, 8, .25], balanced: [2.5, 5, .5], dynamic: [1.2, 3, .8] };
  if (!profiles[pace]) throw new Error(`Unsupported multicam pace: ${pace}`);
  const [defaultMin, defaultMax, targetMotion] = profiles[pace], minimum = Number(minShotSeconds ?? defaultMin), maximum = Number(maxShotSeconds ?? defaultMax);
  if (!(minimum >= .25 && maximum >= minimum && maximum <= 30)) throw new Error("Shot duration range must satisfy 0.25 <= min <= max <= 30 seconds");
  const preferred = new Set(preferredAssetIds), offsetMap = new Map(analysis.offsets.map((entry) => [entry.assetId, entry]));
  for (const id of preferred) if (!offsetMap.has(id)) throw new Error(`Preferred asset is not synchronized: ${id}`);
  const normalizedHolds = (holds || []).map((hold) => {
    if (!offsetMap.has(hold.assetId)) throw new Error(`Hold asset is not synchronized: ${hold.assetId}`);
    if (!(hold.start >= start && hold.end > hold.start && hold.end <= finish)) throw new Error("Every hold must be inside the planned range");
    return { assetId: hold.assetId, start: Number(hold.start), end: Number(hold.end), reason: hold.reason || "directed hold" };
  }).sort((a, b) => a.start - b.start);
  for (let index = 1; index < normalizedHolds.length; index++) if (normalizedHolds[index].start < normalizedHolds[index - 1].end) throw new Error("Directed holds cannot overlap");
  const assets = analysis.offsets.map((sync, index) => {
    const asset = assetById(project, sync.assetId), annotation = asset.annotation || {};
    return { asset, sync, index, quality: Math.max(0, Math.min(1, Number(annotation.quality ?? .6))), motion: Math.max(0, Math.min(1, Number(annotation.motion ?? .5))) };
  });
  const fixedBoundaries = new Set([start, finish, ...normalizedHolds.flatMap((hold) => [hold.start, hold.end])]), boundaries = new Set(fixedBoundaries);
  let cursor = start, step = 0;
  while (cursor < finish - .001) {
    const span = minimum + (maximum - minimum) * (.35 + .3 * ((step * 7) % 5) / 4);
    cursor = Math.min(finish, cursor + span); boundaries.add(Number(cursor.toFixed(4))); step++;
  }
  const points = [...boundaries].filter((point) => fixedBoundaries.has(point) || [...fixedBoundaries].every((fixed) => Math.abs(point - fixed) >= minimum)).sort((a, b) => a - b), raw = [], usage = new Map(); let previous = null;
  for (let index = 0; index < points.length - 1; index++) {
    const segmentStart = points[index], segmentEnd = points[index + 1]; if (segmentEnd - segmentStart < .001) continue;
    const hold = normalizedHolds.find((entry) => segmentStart >= entry.start - .001 && segmentEnd <= entry.end + .001);
    let chosen, reason;
    if (hold) { chosen = assets.find((entry) => entry.asset.id === hold.assetId); reason = hold.reason; }
    else {
      const ranked = assets.filter((entry) => entry.sync.sourceStart + segmentEnd <= Number(entry.asset.duration || Infinity) + .05).map((entry) => {
        const used = usage.get(entry.asset.id) || 0, repeatPenalty = previous === entry.asset.id ? 1.4 : 0, preferredBoost = preferred.has(entry.asset.id) && index % 4 === 0 ? .45 : 0;
        const score = entry.quality * 1.7 + (1 - Math.abs(entry.motion - targetMotion)) * .65 + preferredBoost - repeatPenalty - used * .035;
        return { entry, score };
      }).sort((a, b) => b.score - a.score || a.entry.index - b.entry.index);
      if (!ranked.length) throw new Error(`No synchronized camera covers ${segmentStart.toFixed(2)}-${segmentEnd.toFixed(2)}s`);
      chosen = ranked[0].entry; reason = `${pace} pace · quality ${chosen.quality.toFixed(2)} · motion ${chosen.motion.toFixed(2)}`;
    }
    raw.push({ assetId: chosen.asset.id, start: segmentStart, end: segmentEnd, label: chosen.asset.name, reason });
    usage.set(chosen.asset.id, (usage.get(chosen.asset.id) || 0) + segmentEnd - segmentStart); previous = chosen.asset.id;
  }
  const switches = [];
  for (const segment of raw) { const last = switches.at(-1); if (last && last.assetId === segment.assetId && last.reason === segment.reason && Math.abs(last.end - segment.start) < .001) last.end = segment.end; else switches.push({ ...segment }); }
  const coverage = Object.fromEntries(analysis.offsets.map((entry) => [entry.assetId, Number((switches.filter((segment) => segment.assetId === entry.assetId).reduce((sum, segment) => sum + segment.end - segment.start, 0)).toFixed(3))]));
  return { start, end: finish, pace, minShotSeconds: minimum, maxShotSeconds: maximum, switches, coverage, averageShotSeconds: Number(((finish - start) / switches.length).toFixed(3)), nonMutating: true, reviewRequired: true };
}

export function planSpeakerMulticamCut(project, analysis, { transcript, speakerCameraMap, overlapAssetId, start = 0, end, pace = "balanced", minShotSeconds, maxShotSeconds, preferredAssetIds = [], minSpeakerShot = .6, mergeGap = .35 } = {}) {
  const finish = Math.min(Number(end ?? analysis.duration), Number(analysis.duration));
  if (!transcript?.cues?.length) throw new Error("Speaker multicam planning requires transcript cues");
  if (!speakerCameraMap || typeof speakerCameraMap !== "object" || Array.isArray(speakerCameraMap) || !Object.keys(speakerCameraMap).length) throw new Error("speakerCameraMap is required");
  const synchronized = new Set(analysis.offsets.map((entry) => entry.assetId));
  for (const [speaker, assetId] of Object.entries(speakerCameraMap)) if (!synchronized.has(assetId)) throw new Error(`Camera for speaker ${speaker} is not synchronized: ${assetId}`);
  if (overlapAssetId && !synchronized.has(overlapAssetId)) throw new Error(`Overlap camera is not synchronized: ${overlapAssetId}`);
  if (!(minSpeakerShot >= .2 && minSpeakerShot <= 10 && mergeGap >= 0 && mergeGap <= 5)) throw new Error("Invalid speaker shot or merge-gap duration");
  const cues = transcript.cues.map((cue, index) => ({ index, start: Math.max(start, Number(cue.start)), end: Math.min(finish, Number(cue.end)), speaker: String(cue.speaker ?? cue.speakerId ?? "").trim(), text: String(cue.text || "").trim() })).filter((cue) => cue.end > cue.start && cue.speaker);
  if (!cues.length) throw new Error("Transcript has no speaker-labeled cues; run diarization or add speaker labels first");
  const speakers = [...new Set(cues.map((cue) => cue.speaker))], unmappedSpeakers = speakers.filter((speaker) => !speakerCameraMap[speaker]);
  const boundaries = [...new Set([start, finish, ...cues.flatMap((cue) => [cue.start, cue.end])])].filter((time) => time >= start && time <= finish).sort((a, b) => a - b), directed = [];
  for (let index = 0; index < boundaries.length - 1; index++) {
    const segmentStart = boundaries[index], segmentEnd = boundaries[index + 1], active = cues.filter((cue) => cue.start < segmentEnd - .001 && cue.end > segmentStart + .001 && speakerCameraMap[cue.speaker]);
    if (!active.length) continue;
    const distinct = [...new Set(active.map((cue) => speakerCameraMap[cue.speaker]))], assetId = distinct.length > 1 && overlapAssetId ? overlapAssetId : distinct[0];
    const speakerNames = [...new Set(active.map((cue) => cue.speaker))], reason = distinct.length > 1 ? `overlap · ${speakerNames.join(" + ")}` : `active speaker · ${speakerNames[0]}`;
    const previous = directed.at(-1);
    if (previous && previous.assetId === assetId && previous.reason === reason && segmentStart - previous.end <= mergeGap + .001) previous.end = segmentEnd;
    else directed.push({ assetId, start: segmentStart, end: segmentEnd, reason });
  }
  const holds = directed.filter((entry, index) => entry.end - entry.start >= minSpeakerShot || (directed[index - 1]?.assetId === entry.assetId) || (directed[index + 1]?.assetId === entry.assetId));
  const plan = planMulticamCut(project, analysis, { start, end: finish, pace, minShotSeconds, maxShotSeconds, preferredAssetIds, holds });
  const switches = [];
  for (const segment of plan.switches) { const previous = switches.at(-1); if (previous && previous.assetId === segment.assetId && Math.abs(previous.end - segment.start) < .001) { previous.end = segment.end; if (!previous.reason.includes(segment.reason)) previous.reason += ` → ${segment.reason}`; } else switches.push({ ...segment }); }
  const coverage = Object.fromEntries(analysis.offsets.map((entry) => [entry.assetId, Number((switches.filter((segment) => segment.assetId === entry.assetId).reduce((sum, segment) => sum + segment.end - segment.start, 0)).toFixed(3))]));
  return { ...plan, switches, coverage, averageShotSeconds: Number(((finish - start) / switches.length).toFixed(3)), mode: "speaker-aware", speakerCameraMap: { ...speakerCameraMap }, overlapAssetId: overlapAssetId || null, speakers, unmappedSpeakers, speakerCues: cues.length, directedHolds: holds, skippedShortSpeakerRanges: directed.length - holds.length, warning: unmappedSpeakers.length ? `No camera mapping for: ${unmappedSpeakers.join(", ")}` : null };
}
