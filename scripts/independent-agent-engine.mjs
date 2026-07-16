import { callConfiguredAi } from "./ai-provider-engine.mjs";
import { planDirectorAgent } from "./director-agent-engine.mjs";
import { planNaturalLanguageEdit } from "./natural-language-edit-engine.mjs";

const SYSTEM = `You are CutPilot's planning agent. You never mutate a project. Convert the user's Chinese or English request into safe JSON. Choose one intent: director (whole-video creative edit), revise (exact timeline change), analyze, or finish. For director return brief, pace (calm|balanced|energetic), targetDuration, requirements. For revise return a concrete instruction limited to speed, volume, captions, mute, delete, fade, dissolve, scale, exposure, saturation, or track locking. Do not invent people, facts, footage, or claims.`;

const projectSummary = (project) => ({ name: project.name, videoType: project.videoType?.id || project.starter?.id || "unknown", assets: project.assets.map((asset) => ({ id: asset.id, name: asset.name, type: asset.type, duration: asset.duration, tags: asset.tags || [], transcript: (asset.transcript?.cues || []).slice(0, 20).map((cue) => cue.text) })), timeline: project.timelines.find((entry) => entry.id === project.activeTimelineId)?.name, duration: Math.max(0, ...project.timelines.flatMap((timeline) => timeline.tracks.flatMap((track) => track.items.map((item) => item.start + item.duration)))) });

export async function planIndependentAi(projectPath, project, { message, itemIds = [], trackIds = [], scope = "timeline" } = {}) {
  if (!String(message || "").trim()) throw new Error("Tell CutPilot what you want to make or change");
  const response = await callConfiguredAi({ system: SYSTEM, user: JSON.stringify({ request: message, project: projectSummary(project), selection: { itemIds, trackIds, scope } }) });
  const intent = ["director", "revise", "analyze", "finish"].includes(response.data.intent) ? response.data.intent : "director";
  let plan;
  if (intent === "director") plan = planDirectorAgent(projectPath, project, { brief: String(response.data.brief || message), pace: response.data.pace || "balanced", targetDuration: Number(response.data.targetDuration || undefined), requirements: Array.isArray(response.data.requirements) ? response.data.requirements : [] });
  else if (intent === "revise") plan = planNaturalLanguageEdit(project, { instruction: String(response.data.instruction || message), itemIds, trackIds, scope: scope === "selection" ? "selection" : "timeline" });
  else plan = { type: `cutpilot-${intent}-request`, requiresReview: true, request: message };
  return { type: "cutpilot-independent-ai-plan", version: 1, intent, message, provider: response.provider, model: response.model, rationale: String(response.data.rationale || ""), plan, requiresReview: true, createdAt: new Date().toISOString() };
}
