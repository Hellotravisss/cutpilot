import { randomUUID } from "node:crypto";
import { activeTimeline, applyTimelineEdit, validateProject } from "./project-store.mjs";

const wordsFor = (transcript) => (transcript?.cues || []).flatMap((cue) => (cue.words || []).map((word) => ({ ...word, cue })));
const cleanSegments = (asset, segments) => {
  if (!Array.isArray(segments) || !segments.length) throw new Error("Transcript sequence requires at least one source segment");
  return segments.map((segment, index) => { const sourceStart = Number(segment.sourceStart), sourceEnd = Number(segment.sourceEnd); if (!Number.isFinite(sourceStart) || !Number.isFinite(sourceEnd) || sourceStart < 0 || sourceEnd <= sourceStart || (asset.duration && sourceEnd > asset.duration + 0.05)) throw new Error(`Invalid transcript segment ${index + 1}`); return { id: segment.id || randomUUID(), sourceStart, sourceEnd, label: String(segment.label || `Segment ${index + 1}`).slice(0, 200) }; });
};

export function transcriptSourceSegments(asset) {
  if (!asset?.transcript?.cues?.length) throw new Error(`Transcript not found for asset ${asset?.id || "unknown"}`);
  const segments = asset.transcript.cues.map((cue, index) => ({ id: randomUUID(), sourceStart: Number(cue.start), sourceEnd: Number(cue.end), label: String(cue.text || `Segment ${index + 1}`).trim() })).filter((segment) => segment.sourceEnd > segment.sourceStart);
  if (!segments.length) throw new Error("Transcript contains no timed segments"); return segments;
}

export function buildTranscriptSequence(asset, segments, { gapSeconds = 0 } = {}) {
  if (!asset?.transcript) throw new Error(`Transcript not found for asset ${asset?.id || "unknown"}`); if (!Number.isFinite(gapSeconds) || gapSeconds < 0 || gapSeconds > 10) throw new Error("Transcript gap must be 0-10 seconds");
  const ordered = cleanSegments(asset, segments), transcriptWords = wordsFor(asset.transcript); if (!transcriptWords.length) throw new Error("Word timestamps are required for transcript sequence editing");
  let cursor = 0; const items = [], captions = [], mappedSegments = [];
  for (const [index, segment] of ordered.entries()) {
    if (index) cursor += gapSeconds; const duration = segment.sourceEnd - segment.sourceStart, timelineStart = cursor;
    items.push({ assetId: asset.id, start: timelineStart, sourceStart: segment.sourceStart, duration, label: segment.label });
    const selectedWords = transcriptWords.filter((word) => word.end > segment.sourceStart + 0.001 && word.start < segment.sourceEnd - 0.001);
    const cueGroups = new Map(); for (const word of selectedWords) { const key = word.cue; if (!cueGroups.has(key)) cueGroups.set(key, []); cueGroups.get(key).push(word); }
    for (const [cue, words] of cueGroups) {
      const mappedWords = words.map((word) => ({ text: word.text, start: timelineStart + Math.max(segment.sourceStart, word.start) - segment.sourceStart, end: timelineStart + Math.min(segment.sourceEnd, word.end) - segment.sourceStart })).filter((word) => word.end > word.start);
      if (!mappedWords.length) continue; captions.push({ start: mappedWords[0].start, end: mappedWords.at(-1).end, text: mappedWords.map((word) => word.text).join("").trim() || cue.text, words: mappedWords, sourceCueStart: cue.start, transcriptSegmentId: segment.id });
    }
    mappedSegments.push({ ...segment, timelineStart, duration }); cursor += duration;
  }
  captions.sort((a, b) => a.start - b.start); return { segments: mappedSegments, items, captions, duration: cursor, gapSeconds };
}

export function applyTranscriptSequence(project, { assetId, segments, videoTrackName = "V1", audioTrackName = "A1", includeVideo = true, includeAudio = true, gapSeconds = 0, replaceTracks = true } = {}) {
  const asset = project.assets.find((entry) => entry.id === assetId); if (!asset) throw new Error(`Asset not found: ${assetId}`); if (includeVideo && asset.type === "audio") throw new Error("Audio-only assets cannot create a video transcript track"); if (includeAudio && asset.type !== "audio" && !asset.hasAudio) throw new Error("Asset has no audio stream"); if (!includeVideo && !includeAudio) throw new Error("Enable video or audio transcript output");
  const edit = buildTranscriptSequence(asset, segments, { gapSeconds }), timeline = activeTimeline(project);
  const replace = (trackName) => replaceTracks ? (timeline.tracks.find((track) => track.name === trackName)?.items || []).map((item) => item.id) : [];
  if (includeVideo) applyTimelineEdit(project, { trackName: videoTrackName, deletes: replace(videoTrackName), adds: edit.items });
  if (includeAudio) applyTimelineEdit(project, { trackName: audioTrackName, deletes: replace(audioTrackName), adds: edit.items.map((item) => ({ ...item })) });
  timeline.captions = { ...(timeline.captions || {}), enabled: true, cues: edit.captions, style: timeline.captions?.style || {} };
  timeline.transcriptEdit = { assetId, videoTrackName: includeVideo ? videoTrackName : null, audioTrackName: includeAudio ? audioTrackName : null, gapSeconds, segments: edit.segments };
  project.history.push({ at: new Date().toISOString(), action: "apply_transcript_sequence", assetId, segments: edit.segments.length, duration: edit.duration }); const validation = validateProject(project); if (!validation.valid) throw new Error(validation.errors.join("\n")); return { ...edit, transcriptEdit: timeline.transcriptEdit, validation };
}

export function readTranscriptEdit(project, assetId) { const timeline = activeTimeline(project), asset = project.assets.find((entry) => entry.id === (assetId || timeline.transcriptEdit?.assetId)) || project.assets.find((entry) => entry.transcript?.cues?.length); if (!asset) throw new Error("No transcribed asset found"); return { asset: { id: asset.id, name: asset.name, type: asset.type, duration: asset.duration }, transcript: asset.transcript, sequence: timeline.transcriptEdit?.assetId === asset.id ? timeline.transcriptEdit : { assetId: asset.id, videoTrackName: asset.type === "audio" ? null : "V1", audioTrackName: asset.type === "audio" || asset.hasAudio ? "A1" : null, gapSeconds: 0, segments: transcriptSourceSegments(asset) } }; }
