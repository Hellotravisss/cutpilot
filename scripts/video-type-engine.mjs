import { configureProjectFromStarter } from "./project-starter-engine.mjs";

export const VIDEO_TYPES = Object.freeze([
  { id: "vlog", label: "Vlog", description: "日常、旅行、探店、工作记录和个人故事", available: true, starterId: "vlog" },
  { id: "talking-head", label: "口播 / Talking Head", description: "知识分享、个人观点和镜头口播", available: true, starterId: "talking-head" },
  { id: "podcast", label: "访谈 / 播客", description: "多人对话、访谈和多机位节目", available: true, starterId: "podcast" },
  { id: "wedding", label: "婚礼", description: "婚礼预告、仪式、誓言和纪实长片", available: true, starterId: "wedding" },
  { id: "product-promo", label: "产品广告", description: "产品展示、品牌短片和转化广告", available: true, starterId: "product-promo" },
  { id: "explainer", label: "解说视频", description: "旁白、资料画面、字幕和信息动画", available: true, starterId: "explainer" },
  { id: "motion-graphics", label: "MG 动画", description: "动态图形、标题包装和数据动画", available: true, starterId: "motion-graphics" },
]);

export function listVideoTypes() { return VIDEO_TYPES.map((entry) => ({ ...entry })); }

export function selectVideoType(project, typeId, { format = "vertical", style = "daily", pace = "balanced", targetDuration = 60, objective = "", audience = "", platform = "", narration = "natural", musicMood = "warm", notes = "" } = {}) {
  const type = VIDEO_TYPES.find((entry) => entry.id === typeId); if (!type) throw new Error(`Unknown video type: ${typeId}`); if (!type.available) throw new Error(`${type.label} workflow is not available yet`);
  const formats = { vertical: { width: 1080, height: 1920, fps: 30 }, landscape: { width: 1920, height: 1080, fps: 30 }, square: { width: 1080, height: 1080, fps: 30 } };
  if (!formats[format]) throw new Error(`Unsupported video format: ${format}`); if (typeId === "vlog" && !['daily','travel','cinematic','food','work'].includes(style)) throw new Error(`Unsupported Vlog style: ${style}`); if (!['calm','balanced','energetic'].includes(pace)) throw new Error(`Unsupported video pace: ${pace}`);
  const duration = Number(targetDuration); if (!(duration >= 10 && duration <= 86_400)) throw new Error("Target duration must be 10-86400 seconds");
  const result = configureProjectFromStarter(project, type.starterId, { format: formats[format], brief: { objective, audience, platform, tone: `${style} / ${pace}`, targetDuration: duration, notes } });
  const details = { format, style:String(style).slice(0,100), pace, targetDuration: duration, narration: String(narration).slice(0, 100), musicMood: String(musicMood).slice(0, 100), objective: String(objective).slice(0, 2000), audience: String(audience).slice(0, 500), platform: String(platform).slice(0, 200), notes: String(notes).slice(0, 4000) };
  project.videoType = { id: type.id, label: type.label, version: 2, selectedAt: new Date().toISOString(), details, ...(typeId === "vlog" ? { vlog: details } : {}) };
  project.history.push({ at: new Date().toISOString(), action: "select_video_type", typeId }); return { videoType: project.videoType, ...result };
}
