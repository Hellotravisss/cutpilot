import { randomUUID } from "node:crypto";
import { activeTimeline, applyTimelineEdit, validateProject } from "./project-store.mjs";
import { searchSemanticIndex } from "./semantic-index-engine.mjs";

const splitBrief = (brief) => String(brief || "").split(/(?<=[。！？.!?])\s*|\n+/).map((text) => text.trim()).filter(Boolean);

export function planDirectorAgent(projectPath, project, { brief = "", tone = "natural", pace = "balanced", targetDuration, requirements = [], maxShots = 20 } = {}) {
  const timeline = activeTimeline(project);
  const captionBeats = (timeline.captions?.cues || []).map((cue) => ({ text: cue.text, start: cue.start, end: cue.end }));
  const sourceBeats = captionBeats.length ? captionBeats : splitBrief(brief).map((text, index, values) => ({ text, start: index * (Number(targetDuration || 30) / values.length), end: (index + 1) * (Number(targetDuration || 30) / values.length) }));
  if (!sourceBeats.length) throw new Error("Director Agent needs a brief or timeline captions");
  const used = [], beats = [];
  for (const beat of sourceBeats.slice(0, maxShots)) {
    const search = searchSemanticIndex(projectPath, project, { query: beat.text, assetTypes: ["video", "image", "motion-graphic"], avoidAssetIds: used, limit: 5 });
    const recommendation = search.results.find((entry) => !used.includes(entry.assetId)) || search.results[0] || null;
    if (recommendation) used.push(recommendation.assetId);
    beats.push({ id: randomUUID(), ...beat, query: beat.text, recommendation, alternatives: search.results.slice(1, 4), confidence: recommendation ? Math.min(1, recommendation.score / 12) : 0 });
  }
  return { type: "cutpilot-director-agent-plan", version: 1, projectId: project.id, createdAt: new Date().toISOString(), requiresReview: true, destructive: false, brief, tone, pace, targetDuration: Number(targetDuration || Math.max(...beats.map((beat) => beat.end))), requirements, beats, gaps: beats.filter((beat) => !beat.recommendation).map((beat) => ({ beatId: beat.id, text: beat.text, reason: "No semantically matching local asset" })), summary: { beats: beats.length, recommended: beats.filter((beat) => beat.recommendation).length, uniqueAssets: new Set(used).size } };
}

export function applyDirectorAgentPlan(project, plan, { approved = false, targetTrackName = "V2 · AI Director", replaceTargetTrack = false } = {}) {
  if (!approved) throw new Error("Director Agent plan must be explicitly approved before applying");
  if (plan?.type !== "cutpilot-director-agent-plan") throw new Error("Invalid Director Agent plan");
  const timeline = activeTimeline(project);
  const existing = timeline.tracks.find((track) => track.name === targetTrackName);
  const deletes = replaceTargetTrack ? (existing?.items || []).map((item) => item.id) : [];
  const adds = [];
  for (const beat of plan.beats || []) {
    const match = beat.recommendation; if (!match) continue;
    const beatDuration = Math.max(.1, Number(beat.end) - Number(beat.start));
    const sourceAvailable = Math.max(.1, Number(match.sourceEnd || beatDuration) - Number(match.sourceStart || 0));
    const duration = Math.min(beatDuration, sourceAvailable);
    if (!replaceTargetTrack && existing?.items.some((item) => Number(beat.start) < item.start + item.duration && Number(beat.start) + duration > item.start)) continue;
    adds.push({ assetId: match.assetId, start: Number(beat.start), sourceStart: Number(match.sourceStart || 0), duration, label: `AI · ${beat.text}`, directorBeatId: beat.id });
  }
  const result = applyTimelineEdit(project, { timelineId: timeline.id, trackName: targetTrackName, adds, deletes });
  timeline.markers = [...(timeline.markers || []), ...(plan.beats || []).map((beat) => ({ id: randomUUID(), time: Number(beat.start), label: `AI Director · ${beat.text}`, color: "#ff6b35" }))].sort((a, b) => a.time - b.time);
  timeline.directorAgent = { appliedAt: new Date().toISOString(), planCreatedAt: plan.createdAt, tone: plan.tone, pace: plan.pace, targetTrackName, appliedItems: adds.length, gaps: plan.gaps };
  project.history.push({ at: new Date().toISOString(), action: "apply_director_agent", trackName: targetTrackName, items: adds.length });
  const validation = validateProject(project); if (!validation.valid) throw new Error(validation.errors.join("\n"));
  return { applied: true, items: adds.length, track: result.track, gaps: plan.gaps, validation };
}
