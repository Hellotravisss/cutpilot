import { randomUUID } from "node:crypto";
import { activeTimeline, projectDuration, validateProject } from "./project-store.mjs";
import { playbackSourceSpan, sliceSpeedCurve } from "./speed-curve-engine.mjs";

function locate(project, itemId) {
  const timeline = activeTimeline(project);
  for (const track of timeline.tracks) {
    const index = track.items.findIndex((item) => item.id === itemId);
    if (index >= 0) return { timeline, track, index, item: track.items[index] };
  }
  throw new Error(`Item not found: ${itemId}`);
}

function assertEditable(track) { if (track.locked) throw new Error(`Track ${track.name} is locked`); }
function verify(project) { const validation = validateProject(project); if (!validation.valid) throw new Error(validation.errors.join("\n")); return validation; }
function splitKeyframes(transform, offset, side) {
  if (!transform?.keyframes) return transform;
  const keyframes = transform.keyframes.filter((keyframe) => side === "left" ? keyframe.time <= offset : keyframe.time >= offset).map((keyframe) => side === "left" ? keyframe : { ...keyframe, time: keyframe.time - offset });
  return { ...transform, keyframes };
}
function sampleReframe(reframe, time) { const points = reframe?.keyframes || []; if (!points.length) return null; if (time <= points[0].time) return { ...points[0], time }; if (time >= points.at(-1).time) return { ...points.at(-1), time }; const rightIndex = points.findIndex((point) => point.time >= time), left = points[rightIndex - 1], right = points[rightIndex], progress = (time - left.time) / Math.max(.000001, right.time - left.time), eased = progress * progress * (3 - 2 * progress); return { time, focusX: left.focusX + (right.focusX - left.focusX) * eased, focusY: left.focusY + (right.focusY - left.focusY) * eased, confidence: Math.min(left.confidence ?? 1, right.confidence ?? 1) }; }
export function sliceReframe(reframe, start, end) { if (!reframe?.keyframes?.length) return reframe; const interior = reframe.keyframes.filter((point) => point.time > start + .0001 && point.time < end - .0001), points = [sampleReframe(reframe, start), ...interior, sampleReframe(reframe, end)].filter(Boolean).map((point) => ({ ...point, time: Number((point.time - start).toFixed(6)) })); return { ...reframe, keyframes: points }; }

function splitPlayback(item, offset) {
  const leftCurve = sliceSpeedCurve(item.speedCurve, item.duration, 0, offset, item.playbackRate), rightCurve = sliceSpeedCurve(item.speedCurve, item.duration, offset, item.duration, item.playbackRate);
  const leftProbe = { ...item, duration: offset, speedCurve: leftCurve }, rightProbe = { ...item, duration: item.duration - offset, speedCurve: rightCurve };
  const leftSpan = playbackSourceSpan(leftProbe), rightSpan = playbackSourceSpan(rightProbe);
  return item.reverse
    ? { left: { speedCurve: leftCurve, sourceStart: item.sourceStart + rightSpan }, right: { speedCurve: rightCurve, sourceStart: item.sourceStart }, leftSpan, rightSpan }
    : { left: { speedCurve: leftCurve, sourceStart: item.sourceStart }, right: { speedCurve: rightCurve, sourceStart: item.sourceStart + leftSpan }, leftSpan, rightSpan };
}

export function playbackSlice(item, start, end) {
  if (start <= 0 && end >= item.duration) return { sourceStart: item.sourceStart, speedCurve: item.speedCurve || [] };
  let candidate = item;
  if (end < candidate.duration) candidate = { ...candidate, ...splitPlayback(candidate, end).left, duration: end };
  if (start > 0) candidate = { ...candidate, ...splitPlayback(candidate, start).right, duration: end - start };
  return { sourceStart: candidate.sourceStart, speedCurve: candidate.speedCurve || [] };
}

export function sliceProjectRange(project, start, end) {
  const draft = structuredClone(project), timeline = activeTimeline(draft), duration = projectDuration(timeline);
  if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || end <= start || end > duration + 0.001) throw new Error(`Render range must satisfy 0 <= start < end <= ${duration.toFixed(3)}`);
  for (const track of timeline.tracks) track.items = track.items.flatMap((item) => { const itemEnd = item.start + item.duration, from = Math.max(start, item.start), to = Math.min(end, itemEnd); if (to <= from + 0.001) return []; const localStart = from - item.start, localEnd = to - item.start; return [{ ...item, ...playbackSlice(item, localStart, localEnd), start: from - start, duration: to - from, transform: splitKeyframes(item.transform, localStart, "right"), reframe: sliceReframe(item.reframe, localStart, localEnd) }]; });
  timeline.captions = { ...(timeline.captions || { enabled: false, style: {} }), cues: (timeline.captions?.cues || []).flatMap((cue) => { const cueStart = Math.max(start, cue.start), cueEnd = Math.min(end, cue.end); return cueEnd > cueStart ? [{ ...cue, start: cueStart - start, end: cueEnd - start, words: (cue.words || []).flatMap((word) => { const wordStart = Math.max(start, word.start), wordEnd = Math.min(end, word.end); return wordEnd > wordStart ? [{ ...word, start: wordStart - start, end: wordEnd - start }] : []; }) }] : []; }) };
  timeline.markers = (timeline.markers || []).filter((marker) => marker.time >= start && marker.time <= end).map((marker) => ({ ...marker, time: marker.time - start })); timeline.inOut = null;
  const validation = verify(draft); return { project: draft, start, end, duration: end - start, validation };
}

export function splitTimelineItem(project, itemId, splitTime) {
  const { track, index, item } = locate(project, itemId); assertEditable(track);
  const end = item.start + item.duration;
  if (!Number.isFinite(splitTime) || splitTime <= item.start + 0.01 || splitTime >= end - 0.01) throw new Error(`Split time must be inside item ${item.start.toFixed(3)}-${end.toFixed(3)}`);
  const leftDuration = splitTime - item.start;
  const rightDuration = end - splitTime;
  const originalOut = item.transitionOut;
  const originalAudioOut = item.audioFadeOut;
  const originalFadeOut = item.fadeOut;
  const playback = splitPlayback(item, leftDuration);
  const left = { ...item, ...playback.left, duration: leftDuration, transform: splitKeyframes(item.transform, leftDuration, "left"), reframe: sliceReframe(item.reframe, 0, leftDuration), transitionOut: undefined, fadeOut: 0, audioFadeOut: 0 };
  const right = { ...item, ...playback.right, id: randomUUID(), start: splitTime, duration: rightDuration, transform: splitKeyframes(item.transform, leftDuration, "right"), reframe: sliceReframe(item.reframe, leftDuration, item.duration), transitionIn: undefined, fadeIn: 0, audioFadeIn: 0, transitionOut: originalOut, fadeOut: originalFadeOut, audioFadeOut: originalAudioOut, label: item.label ? `${item.label} B` : item.label };
  track.items.splice(index, 1, left, right);
  track.items.sort((a, b) => a.start - b.start);
  project.history.push({ at: new Date().toISOString(), action: "split_item", itemId, rightItemId: right.id, splitTime });
  return { left, right, validation: verify(project) };
}

export function trimTimelineItem(project, itemId, { newStart, newEnd, ripple = false } = {}) {
  const { track, item } = locate(project, itemId); assertEditable(track);
  const oldStart = item.start, oldEnd = item.start + item.duration;
  let rippleDelta = 0;
  if (newStart !== undefined) {
    if (!Number.isFinite(newStart) || newStart < oldStart || newStart >= oldEnd - 0.01) throw new Error("Trim-in must stay within the item");
    const delta = newStart - oldStart, previousDuration = item.duration, playback = splitPlayback(item, delta); item.start = newStart; item.sourceStart = playback.right.sourceStart; item.speedCurve = playback.right.speedCurve; item.duration -= delta; item.transform = splitKeyframes(item.transform, delta, "right"); item.reframe = sliceReframe(item.reframe, delta, previousDuration);
  }
  if (newEnd !== undefined) {
    const currentEnd = item.start + item.duration;
    if (!Number.isFinite(newEnd) || newEnd <= item.start + 0.01 || newEnd > currentEnd) throw new Error("Trim-out must stay within the item");
    rippleDelta = currentEnd - newEnd; const keepDuration = newEnd - item.start, playback = splitPlayback(item, keepDuration); item.sourceStart = playback.left.sourceStart; item.speedCurve = playback.left.speedCurve; item.reframe = sliceReframe(item.reframe, 0, keepDuration); item.duration = keepDuration;
    if (item.transform?.keyframes) item.transform.keyframes = item.transform.keyframes.filter((keyframe) => keyframe.time <= item.duration);
  }
  if (ripple && rippleDelta > 0) for (const later of track.items) if (later.id !== item.id && later.start >= oldEnd - 0.001) later.start -= rippleDelta;
  track.items.sort((a, b) => a.start - b.start);
  project.history.push({ at: new Date().toISOString(), action: "trim_item", itemId, newStart, newEnd, ripple });
  return { item, validation: verify(project) };
}

function rippleCues(cues, start, end, delta) {
  return cues.flatMap((cue) => {
    if (cue.end <= start) return [cue];
    if (cue.start >= end) return [{ ...cue, start: cue.start - delta, end: cue.end - delta }];
    const next = { ...cue, start: Math.min(cue.start, start), end: Math.max(start, cue.end - delta) };
    return next.end > next.start + 0.01 ? [next] : [];
  });
}

export function rippleDeleteItem(project, itemId, scope = "all") {
  const { timeline, track, item } = locate(project, itemId); assertEditable(track);
  const start = item.start, end = item.start + item.duration, delta = item.duration;
  track.items = track.items.filter((entry) => entry.id !== itemId);
  const tracks = scope === "all" ? timeline.tracks : [track];
  for (const target of tracks) {
    if (target.locked && target !== track) continue;
    const rewritten = [];
    for (const candidate of target.items) {
      const candidateEnd = candidate.start + candidate.duration;
      if (candidateEnd <= start + 0.001) rewritten.push(candidate);
      else if (candidate.start >= end - 0.001) rewritten.push({ ...candidate, start: candidate.start - delta });
      else if (candidate.start < start && candidateEnd > end) {
        const leftDuration = start - candidate.start;
        const right = { ...candidate, ...playbackSlice(candidate, end - candidate.start, candidate.duration), id: randomUUID(), start, duration: candidateEnd - end, transform: splitKeyframes(candidate.transform, end - candidate.start, "right"), reframe: sliceReframe(candidate.reframe, end - candidate.start, candidate.duration), transitionIn: undefined, fadeIn: 0, audioFadeIn: 0 };
        const left = { ...candidate, ...playbackSlice(candidate, 0, leftDuration), duration: leftDuration, transform: splitKeyframes(candidate.transform, leftDuration, "left"), reframe: sliceReframe(candidate.reframe, 0, leftDuration), transitionOut: undefined, fadeOut: 0, audioFadeOut: 0 };
        rewritten.push(left, right);
      } else if (candidate.start < start && candidateEnd > start) { const kept = start - candidate.start; rewritten.push({ ...candidate, ...playbackSlice(candidate, 0, kept), duration: kept, reframe: sliceReframe(candidate.reframe, 0, kept), transitionOut: undefined, fadeOut: 0, audioFadeOut: 0 }); }
      else if (candidate.start < end && candidateEnd > end) { const removed = end - candidate.start; rewritten.push({ ...candidate, ...playbackSlice(candidate, removed, candidate.duration), start, duration: candidateEnd - end, transform: splitKeyframes(candidate.transform, removed, "right"), reframe: sliceReframe(candidate.reframe, removed, candidate.duration), transitionIn: undefined, fadeIn: 0, audioFadeIn: 0 }); }
    }
    target.items = rewritten;
    target.items.sort((a, b) => a.start - b.start);
  }
  if (scope === "all") {
    timeline.captions.cues = rippleCues(timeline.captions?.cues || [], start, end, delta);
    timeline.markers = (timeline.markers || []).filter((marker) => marker.time < start || marker.time >= end).map((marker) => marker.time >= end ? { ...marker, time: marker.time - delta } : marker);
  }
  project.history.push({ at: new Date().toISOString(), action: "ripple_delete", itemId, scope, start, end });
  return { removedItem: item, delta, validation: verify(project) };
}

export function insertTimelineGap(project, at, duration, scope = "all", trackName = null) {
  const timeline = activeTimeline(project);
  if (!Number.isFinite(at) || at < 0 || !Number.isFinite(duration) || duration <= 0) throw new Error("Gap requires non-negative position and positive duration");
  const tracks = scope === "all" ? timeline.tracks : timeline.tracks.filter((track) => track.name === trackName);
  if (!tracks.length) throw new Error(`Track not found: ${trackName}`);
  for (const track of tracks) {
    assertEditable(track);
    const crossing = track.items.filter((item) => item.start < at - 0.01 && item.start + item.duration > at + 0.01).map((item) => item.id);
    for (const itemId of crossing) splitTimelineItem(project, itemId, at);
    for (const item of track.items) if (item.start >= at - 0.001) item.start += duration;
    track.items.sort((a, b) => a.start - b.start);
  }
  if (scope === "all") {
    timeline.captions.cues = (timeline.captions?.cues || []).map((cue) => cue.start >= at ? { ...cue, start: cue.start + duration, end: cue.end + duration } : cue.end > at ? { ...cue, end: cue.end + duration } : cue);
    timeline.markers = (timeline.markers || []).map((marker) => marker.time >= at ? { ...marker, time: marker.time + duration } : marker);
  }
  project.history.push({ at: new Date().toISOString(), action: "insert_gap", at, duration, scope, trackName });
  return { at, duration, scope, validation: verify(project) };
}

export function razorAllTracks(project, at) {
  const timeline = activeTimeline(project); const splits = [];
  for (const track of timeline.tracks) {
    if (track.locked) continue;
    const targets = track.items.filter((item) => at > item.start + 0.01 && at < item.start + item.duration - 0.01).map((item) => item.id);
    for (const itemId of targets) splits.push(splitTimelineItem(project, itemId, at));
  }
  project.history.push({ at: new Date().toISOString(), action: "razor_all", timelineTime: at, splits: splits.length });
  return { at, splits: splits.map(({ left, right }) => ({ leftId: left.id, rightId: right.id })), validation: verify(project) };
}
