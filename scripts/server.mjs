import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { spawnSync } from "node:child_process";
import { mkdirSync, readdirSync, statSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { basename, extname, join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { homedir } from "node:os";
import { randomUUID } from "node:crypto";
import { activeTimeline, applyTimelineEdit, loadProject, newProject, projectDuration, saveProject, validateProject } from "./project-store.mjs";
import { playbackSourceSpan, validateSpeedCurve } from "./speed-curve-engine.mjs";
import { CURVE_PRESETS, validateEffectStack } from "./visual-effects-engine.mjs";
import { validateAudioEffectStack } from "./audio-effects-engine.mjs";
import { cuesToSrt, cuesToTxt, exportMotionGraphicAsset, probeOutput, renderProject } from "./media-engine.mjs";
import { transcribeLocal, transcriptionBackendStatus } from "./transcription-engine.mjs";
import { buildSpeechEdit, findPhraseRanges, rankAssets } from "./semantic-engine.mjs";
import { renderMotionGraphic } from "./motion-graphics-engine.mjs";
import { generateLocalVoice } from "./generated-media-engine.mjs";
import { createSnapshot, editorHistoryStatus, listSnapshots, redoProject, restoreSnapshot, undoProject } from "./version-engine.mjs";
import { exportInterchange, importFcpxml, importPremiereXml } from "./interchange-engine.mjs";
import { inspectRenderedVideo } from "./visual-qa-engine.mjs";
import { inspectGenerationProviders, markJobMaterialized, readGenerationJob, refreshGenerationJob, submitGeneration } from "./generation-job-engine.mjs";
import { renderSvgMotionGraphic, validateSvgSource } from "./svg-motion-graphics-engine.mjs";
import { closeReviewSession, openReviewSession } from "./review-server-engine.mjs";
import { insertTimelineGap, razorAllTracks, rippleDeleteItem, sliceProjectRange, splitTimelineItem, trimTimelineItem } from "./timeline-operations-engine.mjs";
import { validateGlslSource } from "./glsl-shader-engine.mjs";
import { GLSL_PRESETS, listGlslPresets } from "./glsl-presets.mjs";
import { renderJsxMotionGraphic, validateJsxMotionSource } from "./jsx-motion-graphics-engine.mjs";
import { exportJianyingDraft, validateJianyingDraft } from "./jianying-draft-engine.mjs";
import { CAPTION_TEMPLATES } from "./caption-style-engine.mjs";
import { activateTimeline as activateProjectTimeline, ASPECT_PRESETS, createTimeline as createProjectTimeline, deleteTimeline as deleteProjectTimeline, duplicateTimeline as duplicateProjectTimeline, listTimelines, projectForExportFormat, renameTimeline as renameProjectTimeline, setTimelineFormat, setTimelineInOut } from "./timeline-management-engine.mjs";
import { applyTranscriptSequence, readTranscriptEdit } from "./transcript-edit-engine.mjs";
import { assignAssetsToBin, createBin, deleteBin, listAssetLibrary, moveBin, relinkAsset, relinkMissingFromFolder, renameBin, scanMissingAssets, updateAssetMetadata } from "./asset-library-engine.mjs";
import { createTrack, deleteTrack, moveItem, renameTrack, reorderTrack, setSnapping, snapTimelineTime, updateTrack } from "./track-engine.mjs";
import { clearEditContext, readEditContext, resolveEditContext, setEditContext } from "./edit-context-engine.mjs";
import { configureProjectFromStarter, createProjectFromStarter, listProjectStarters } from "./project-starter-engine.mjs";
import { placeAssetOnTimeline } from "./source-placement-engine.mjs";
import { linkTimelineItems, moveLinkedGroup, placeLinkedAv, trimLinkedGroup, unlinkTimelineItems } from "./linked-clips-engine.mjs";
import { cancelExportJob, listExportJobs, readExportJob, submitExportJob } from "./export-job-engine.mjs";
import { analyzeAssetSilence, applySilenceCut } from "./silence-edit-engine.mjs";
import { analyzeAssetScenes, listAssetSubclips, placeAssetSubclip, saveSceneSubclips } from "./scene-detection-engine.mjs";
import { analyzeAssetBeats, applyBeatMontage, buildBeatMontagePlan, saveBeatMarkers } from "./beat-edit-engine.mjs";
import { alignCaptionTranslations, exportSubtitleFile, importSubtitleFile } from "./subtitle-engine.mjs";
import { detachVideoProxy, generateVideoProxy, proxyStatus, scanProxyStatus } from "./proxy-media-engine.mjs";
import { analyzeSmartReframe, applySmartReframe, clearSmartReframe } from "./smart-reframe-engine.mjs";
import { addTimelineMarker, deleteTimelineMarker, updateTimelineMarker } from "./marker-engine.mjs";
import { findDuplicateShots, removeDuplicateShots } from "./duplicate-shot-engine.mjs";
import { analyzeMulticamSync, applyMulticamCut, applyMulticamSync, planMulticamCut, planSpeakerMulticamCut } from "./multicam-engine.mjs";
import { listVideoTypes, selectVideoType } from "./video-type-engine.mjs";
import { analyzeVlogCoverage, analyzeVlogRelease, analyzeVlogRhythm, analyzeVlogWorkflow, applyVlogBroll, applyVlogEdit, applyVlogFinishing, applyVlogReleaseFixes, applyVlogRhythm, applyVlogSound, planVlogBroll, planVlogEdit, planVlogFinishing, planVlogRhythm, planVlogSound, renderVlogTitleCards } from "./vlog-engine.mjs";
import { capabilitySummary, listCapabilityGaps } from "./capability-engine.mjs";
import { analyzeCategoryRelease, analyzeCategoryWorkflow, applyCategoryReleaseFixes } from "./category-workflow-engine.mjs";
import { applyTalkingHeadDirector, planTalkingHeadDirector } from "./talking-head-director-engine.mjs";
import { applyExplainerDirector, planExplainerDirector, renderExplainerInfoCards, reviewExplainerInfoCards } from "./explainer-director-engine.mjs";
import { applyProductPromoDirector, planProductPromoDirector, renderProductPromoCards, reviewProductPromoCards } from "./product-promo-director-engine.mjs";
import { applyWeddingDirector, planWeddingDirector, renderWeddingTitles, reviewWeddingTitles } from "./wedding-director-engine.mjs";
import { applyPodcastDirector, planPodcastDirector, renderPodcastTitles, reviewPodcastTitles } from "./podcast-director-engine.mjs";
import { applyMotionGraphicsDirector, planMotionGraphicsDirector, renderMotionGraphicsScenes, reviewMotionGraphicsScenes } from "./motion-graphics-director-engine.mjs";
import { auditCutPilotProject, listDirectorWorkflows } from "./director-acceptance-engine.mjs";
import { createDeliveryVariants, DELIVERY_VARIANTS, submitDeliveryPack } from "./delivery-pack-engine.mjs";
import { analyzeAssetIntelligence, analyzeProjectAssets, applyAssetIntelligence, applyProjectIntelligence } from "./asset-intelligence-engine.mjs";
import { applyNaturalLanguageEdit, planNaturalLanguageEdit } from "./natural-language-edit-engine.mjs";
import { inspectRemotionProject, installRemotionProject, listRemotionCompositions, renderRemotionComposition } from "./remotion-project-engine.mjs";
import { exportCapCutHandoff, inspectCapCutDraft } from "./capcut-handoff-engine.mjs";
import { renderGlslBatch } from "./glsl-batch-engine.mjs";
import { auditRuntimeReadiness } from "./runtime-readiness-engine.mjs";

const server = new McpServer({ name: "cutpilot", version: "9.1.0" });
const VIDEO_EXT = new Set([".mov", ".mp4", ".m4v", ".webm", ".mkv"]);
const AUDIO_EXT = new Set([".wav", ".mp3", ".m4a", ".aac", ".flac", ".ogg"]);
const IMAGE_EXT = new Set([".png", ".jpg", ".jpeg", ".webp", ".gif"]);

function run(command, args) {
  const result = spawnSync(command, args, { encoding: "utf8", maxBuffer: 20 * 1024 * 1024 });
  if (result.status !== 0) throw new Error(result.stderr || `${command} failed`);
  return result.stdout;
}

function ffprobe(path) {
  const raw = run("ffprobe", ["-v", "error", "-show_entries", "format=duration:stream=index,codec_type,width,height,r_frame_rate", "-of", "json", path]);
  const data = JSON.parse(raw);
  const video = data.streams?.find((s) => s.codec_type === "video");
  const audio = data.streams?.find((s) => s.codec_type === "audio");
  return { duration: Number(data.format?.duration || 0), width: video?.width || null, height: video?.height || null, fps: video?.r_frame_rate || null, hasAudio: Boolean(audio) };
}

function registerAsset(project, inputPath, overrides = {}) {
  const path = resolve(inputPath);
  if (!existsSync(path)) throw new Error(`Asset not found: ${path}`);
  const existing = project.assets.find((asset) => asset.path === path);
  if (existing) return existing;
  const ext = extname(path).toLowerCase();
  const type = overrides.type || (VIDEO_EXT.has(ext) ? "video" : AUDIO_EXT.has(ext) ? "audio" : IMAGE_EXT.has(ext) ? "image" : null);
  if (!type) throw new Error(`Unsupported media type: ${path}`);
  const meta = type === "image" || type === "motion-graphic" ? { duration: null, width: null, height: null, fps: null, hasAudio: false } : ffprobe(path);
  const asset = { id: randomUUID(), path, name: basename(path), type, ...meta, ...overrides };
  project.assets.push(asset);
  return asset;
}

function walk(folder) {
  return readdirSync(folder).flatMap((name) => {
    const path = join(folder, name);
    return statSync(path).isDirectory() ? walk(path) : [path];
  });
}

server.tool("create_project", "Create a local CutPilot project with a multitrack timeline.", {
  projectPath: z.string().describe("Absolute path for the .cutpilot.json project; legacy .mycut.json paths remain supported"),
  name: z.string(),
  width: z.number().int().positive().default(1080),
  height: z.number().int().positive().default(1920),
  fps: z.number().positive().default(30),
}, async ({ projectPath, name, width, height, fps }) => {
  const project = newProject({ name, width, height, fps });
  const path = saveProject(projectPath, project);
  return { content: [{ type: "text", text: JSON.stringify({ path, projectId: project.id, activeTimelineId: project.activeTimelineId }, null, 2) }] };
});

const starterBriefSchema = z.object({ objective: z.string().optional(), audience: z.string().optional(), platform: z.string().optional(), tone: z.string().optional(), language: z.string().optional(), targetDuration: z.number().positive().max(86400).optional(), notes: z.string().optional() }).default({});
const starterFormatSchema = z.object({ width: z.number().int().positive().optional(), height: z.number().int().positive().optional(), fps: z.number().positive().max(120).optional() }).default({});
server.tool("list_project_starters", "List versioned ChatCut-style creation starters with formats, tracks, bins, and recommended AI workflow stages.", {}, async () => ({ content: [{ type: "text", text: JSON.stringify(listProjectStarters(), null, 2) }] }));
server.tool("create_project_from_starter", "Create a ready-to-edit local CutPilot project from any supported starter, including wedding and explainer workflows.", { projectPath: z.string(), name: z.string(), starterId: z.enum(["blank", "vlog", "talking-head", "social-short", "podcast", "wedding", "explainer", "motion-graphics", "product-promo"]), brief: starterBriefSchema, format: starterFormatSchema }, async ({ projectPath, name, starterId, brief, format }) => { const project = createProjectFromStarter({ name, starterId, brief, format }); const path = saveProject(projectPath, project); return { content: [{ type: "text", text: JSON.stringify({ path, projectId: project.id, starter: project.starter, timeline: activeTimeline(project), bins: project.bins }, null, 2) }] }; });
server.tool("configure_project_starter", "Configure an existing empty CutPilot project with any supported starter's format, tracks, bins, captions, snapping, AI brief, and workflow.", { projectPath: z.string(), starterId: z.enum(["blank", "vlog", "talking-head", "social-short", "podcast", "wedding", "explainer", "motion-graphics", "product-promo"]), brief: starterBriefSchema, format: starterFormatSchema }, async ({ projectPath, starterId, brief, format }) => { const { project } = loadProject(projectPath), result = configureProjectFromStarter(project, starterId, { brief, format }); saveProject(projectPath, project); return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] }; });
const vlogSetupSchema = z.object({ format: z.enum(["vertical","landscape","square"]).default("vertical"), style: z.string().min(1).max(100).default("daily"), pace: z.enum(["calm","balanced","energetic"]).default("balanced"), targetDuration: z.number().min(10).max(86400).default(60), objective: z.string().default(""), audience: z.string().default(""), platform: z.string().default(""), narration: z.string().default("natural"), musicMood: z.string().default("warm"), notes: z.string().default("") }).default({});
server.tool("list_video_types", "List CutPilot's category-first video workflows and clearly report which types are available.", {}, async () => ({ content: [{ type: "text", text: JSON.stringify(listVideoTypes(), null, 2) }] }));
server.tool("list_cutpilot_capabilities", "Read the audited CutPilot capability matrix with complete, configured, experimental, and planned status instead of guessing feature support.", {}, async () => ({ content: [{ type: "text", text: JSON.stringify(capabilitySummary(), null, 2) }] }));
server.tool("read_cutpilot_gaps", "Read every capability that still needs external configuration, remains experimental, or is genuinely planned.", {}, async () => ({ content: [{ type: "text", text: JSON.stringify(listCapabilityGaps(), null, 2) }] }));
server.tool("audit_runtime_readiness", "Audit the installed machine instead of trusting the static capability matrix: required binaries, Chrome, Apple Vision, local voice, configured generation providers, and irreducible external boundaries.", {}, async()=>({content:[{type:"text",text:JSON.stringify(auditRuntimeReadiness(),null,2)}]}));
server.tool("list_director_workflows", "List the seven complete category directors and their planning, applying, review, and rendering tool routes.", {}, async()=>({content:[{type:"text",text:JSON.stringify(listDirectorWorkflows(),null,2)}]}));
server.tool("audit_cutpilot_project", "Run a unified evidence-based acceptance audit for project validity, online referenced media, review gates, editable timeline, export settings, variants, and strict release readiness.", {projectPath:z.string()}, async({projectPath})=>{const{project}=loadProject(projectPath);return{content:[{type:"text",text:JSON.stringify(auditCutPilotProject(project),null,2)}]}});
server.tool("analyze_asset_intelligence", "Analyze one local asset with traceable FFmpeg and optional Apple Vision evidence: technical metadata, brightness, saturation, loudness, scenes, semantic frame labels, non-identity face/person counts, filename/transcript tags, motion and quality. Never identifies a person.", {projectPath:z.string(),assetId:z.string(),detectScenes:z.boolean().default(true),sceneThreshold:z.number().min(.05).max(.9).default(.3),minScene:z.number().min(.1).max(30).default(.5),thumbnailWidth:z.number().int().min(120).max(1280).default(240),semanticVision:z.boolean().default(true),visionSamples:z.number().int().min(1).max(12).default(3)},async({projectPath,assetId,...options})=>{const{project}=loadProject(projectPath),asset=project.assets.find(x=>x.id===assetId);if(!asset)throw new Error(`Asset not found: ${assetId}`);return{content:[{type:"text",text:JSON.stringify(analyzeAssetIntelligence(projectPath,asset,options),null,2)}]}});
server.tool("apply_asset_intelligence", "Persist one explicitly reviewed asset-intelligence result as searchable annotation, tags, technical/audio evidence, and scene subclips.", {projectPath:z.string(),analysis:z.object({type:z.literal("cutpilot-asset-intelligence")}).passthrough(),replaceScenes:z.boolean().default(true)},async({projectPath,analysis,replaceScenes})=>{const{project}=loadProject(projectPath),result=applyAssetIntelligence(project,projectPath,analysis,{replaceScenes});saveProject(projectPath,project);return{content:[{type:"text",text:JSON.stringify(result,null,2)}]}});
server.tool("analyze_project_assets", "Batch-analyze online video, audio, and image assets locally with FFmpeg and optional Apple Vision semantics, returning a reviewable evidence bundle without mutating the project.", {projectPath:z.string(),assetIds:z.array(z.string()).optional(),detectScenes:z.boolean().default(true),sceneThreshold:z.number().min(.05).max(.9).default(.3),minScene:z.number().min(.1).max(30).default(.5),thumbnailWidth:z.number().int().min(120).max(1280).default(240),semanticVision:z.boolean().default(true),visionSamples:z.number().int().min(1).max(12).default(3)},async({projectPath,...options})=>{const{project}=loadProject(projectPath);return{content:[{type:"text",text:JSON.stringify(analyzeProjectAssets(projectPath,project,options),null,2)}]}});
server.tool("apply_project_intelligence", "Persist a reviewed batch asset-intelligence bundle so Codex directors and semantic search can use its tags, scores, scenes, technical evidence, and audio measurements.", {projectPath:z.string(),batch:z.object({type:z.literal("cutpilot-project-intelligence")}).passthrough(),replaceScenes:z.boolean().default(true)},async({projectPath,batch,replaceScenes})=>{const{project}=loadProject(projectPath),result=applyProjectIntelligence(project,projectPath,batch,{replaceScenes});saveProject(projectPath,project);return{content:[{type:"text",text:JSON.stringify(result,null,2)}]}});
server.tool("plan_natural_language_edit", "Turn a Chinese or English editing request into an exact reviewable local plan for selected clips/tracks or the full timeline. Unsupported intent is reported instead of guessed.", {projectPath:z.string(),instruction:z.string().min(1).max(4000),itemIds:z.array(z.string()).default([]),trackIds:z.array(z.string()).default([]),scope:z.enum(["selection","timeline"]).default("selection")},async({projectPath,...options})=>{const{project}=loadProject(projectPath);return{content:[{type:"text",text:JSON.stringify(planNaturalLanguageEdit(project,options),null,2)}]}});
server.tool("apply_natural_language_edit", "Apply an explicitly reviewed natural-language edit plan as one validated project change. Destructive actions remain visible in the plan and approval is mandatory.", {projectPath:z.string(),plan:z.object({type:z.literal("cutpilot-natural-edit-plan")}).passthrough(),approved:z.literal(true)},async({projectPath,plan,approved})=>{const{project}=loadProject(projectPath),result=applyNaturalLanguageEdit(project,plan,{approved});saveProject(projectPath,project);return{content:[{type:"text",text:JSON.stringify(result,null,2)}]}});
server.tool("inspect_remotion_project", "Inspect a real Remotion project, entry point, package dependencies, readiness, and lifecycle-script risks without installing or executing it.", {remotionProjectRoot:z.string(),entryPoint:z.string().optional()},async({remotionProjectRoot,...options})=>({content:[{type:"text",text:JSON.stringify(inspectRemotionProject(remotionProjectRoot,options),null,2)}]}));
server.tool("install_remotion_project", "Install a reviewed Remotion project's dependencies. Explicit approval is mandatory; lifecycle scripts are disabled unless separately enabled.", {remotionProjectRoot:z.string(),approved:z.literal(true),allowLifecycleScripts:z.boolean().default(false),packageManager:z.enum(["npm","pnpm"]).default("npm")},async({remotionProjectRoot,...options})=>({content:[{type:"text",text:JSON.stringify(installRemotionProject(remotionProjectRoot,options),null,2)}]}));
server.tool("list_remotion_compositions", "Bundle a ready Remotion project and list real compositions, dimensions, FPS, duration, and default props using the official Remotion renderer.", {remotionProjectRoot:z.string(),entryPoint:z.string().optional(),inputProps:z.record(z.any()).default({})},async({remotionProjectRoot,...options})=>({content:[{type:"text",text:JSON.stringify(await listRemotionCompositions(remotionProjectRoot,options),null,2)}]}));
server.tool("render_remotion_composition", "Render a real Remotion composition or still with input props, codec, CRF, concurrency, and optional frame range through the official Remotion bundler and renderer.", {remotionProjectRoot:z.string(),entryPoint:z.string().optional(),compositionId:z.string(),inputProps:z.record(z.any()).default({}),outputPath:z.string(),codec:z.enum(["h264","h265","vp8","vp9","prores"]).default("h264"),crf:z.number().int().min(1).max(51).default(18),concurrency:z.union([z.number().int().positive(),z.string()]).optional(),frameRange:z.union([z.number().int().nonnegative(),z.tuple([z.number().int().nonnegative(),z.number().int().nonnegative()])]).optional(),stillFrame:z.number().int().nonnegative().optional()},async({remotionProjectRoot,...options})=>({content:[{type:"text",text:JSON.stringify(await renderRemotionComposition(remotionProjectRoot,options),null,2)}]}));
server.tool("select_video_type", "Select and configure a category-first workflow for an existing empty project: Vlog, talking head, podcast, wedding, product promo, explainer, or motion graphics.", { projectPath: z.string(), typeId: z.enum(["vlog","talking-head","podcast","wedding","product-promo","explainer","motion-graphics"]), setup: vlogSetupSchema }, async ({ projectPath, typeId, setup }) => { const { project } = loadProject(projectPath), result = selectVideoType(project, typeId, setup); saveProject(projectPath, project); return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] }; });
server.tool("get_category_workflow_status", "Read the evidence-based workflow, progress, and next recommended AI action for talking-head, podcast, wedding, product-promo, explainer, or motion-graphics projects.", { projectPath:z.string() }, async ({projectPath})=>{const{project}=loadProject(projectPath);return{content:[{type:"text",text:JSON.stringify(analyzeCategoryWorkflow(project),null,2)}]}});
server.tool("analyze_category_release", "Run strict non-Vlog release preflight for offline media, missing primary picture, gaps, speech captions, pending titles, validation, audio roles, and export preset.", { projectPath:z.string(),maxPrimaryGap:z.number().min(0).max(5).default(.25) }, async ({projectPath,...options})=>{const{project}=loadProject(projectPath);return{content:[{type:"text",text:JSON.stringify(analyzeCategoryRelease(project,options),null,2)}]}});
server.tool("apply_category_release_fixes", "Apply only safe mechanical fixes from a reviewed non-Vlog release preflight, then rerun the strict gate.", {projectPath:z.string(),preflight:z.object({type:z.literal("category-release-preflight")}).passthrough()},async({projectPath,preflight})=>{const{project}=loadProject(projectPath),result=applyCategoryReleaseFixes(project,preflight);saveProject(projectPath,project);return{content:[{type:"text",text:JSON.stringify(result,null,2)}]}});
server.tool("plan_talking_head_director", "Create a non-mutating talking-head plan from a transcribed camera source: remove only standalone filler cues, preserve reviewable source segments, semantically match B-roll, and propose a voice chain.", {projectPath:z.string(),assetId:z.string().optional(),removeFillerOnly:z.boolean().default(true),maxBrollSeconds:z.number().min(.35).max(20).default(4),brollCoverage:z.number().min(0).max(1).default(.75)},async({projectPath,...options})=>{const{project}=loadProject(projectPath);return{content:[{type:"text",text:JSON.stringify(planTalkingHeadDirector(project,options),null,2)}]}});
server.tool("apply_talking_head_director", "Apply a reviewed talking-head director plan to linked speaker video/dialogue, semantic B-roll, voice cleanup, karaoke captions, music ducking, and export preset.", {projectPath:z.string(),plan:z.object({type:z.literal("talking-head-director-plan")}).passthrough(),videoTrackName:z.string().default("V1 · Speaker"),audioTrackName:z.string().default("A1 · Dialogue"),brollTrackName:z.string().default("V2 · B-roll")},async({projectPath,plan,...options})=>{const{project}=loadProject(projectPath),result=applyTalkingHeadDirector(project,plan,options);saveProject(projectPath,project);return{content:[{type:"text",text:JSON.stringify(result,null,2)}]}});
server.tool("plan_explainer_director", "Create a non-mutating narration-led explainer plan with semantic primary visuals, secondary evidence, explicit gaps, and pending fact-checkable information cards.", {projectPath:z.string(),narrationAssetId:z.string().optional(),maxShotSeconds:z.number().min(.35).max(20).default(5)},async({projectPath,...options})=>{const{project}=loadProject(projectPath);return{content:[{type:"text",text:JSON.stringify(planExplainerDirector(project,options),null,2)}]}});
server.tool("apply_explainer_director", "Apply a reviewed explainer plan to narration, main visuals, evidence B-roll, voice cleanup, captions, music ducking, export preset, and an unrendered information-card checklist.", {projectPath:z.string(),plan:z.object({type:z.literal("explainer-director-plan")}).passthrough()},async({projectPath,plan})=>{const{project}=loadProject(projectPath),result=applyExplainerDirector(project,plan);saveProject(projectPath,project);return{content:[{type:"text",text:JSON.stringify(result,null,2)}]}});
server.tool("review_explainer_info_cards", "Explicitly approve, edit, or reject explainer information cards after human fact review. Rendering remains blocked while any card is unreviewed.", {projectPath:z.string(),decisions:z.array(z.object({id:z.string(),action:z.enum(["approve","reject"]),title:z.string().optional(),subtitle:z.string().optional(),note:z.string().optional()})).min(1)},async({projectPath,decisions})=>{const{project}=loadProject(projectPath),result=reviewExplainerInfoCards(project,decisions);saveProject(projectPath,project);return{content:[{type:"text",text:JSON.stringify(result,null,2)}]}});
server.tool("render_explainer_info_cards", "Render only fact-reviewed and approved explainer cards through the safe editable SVG pipeline and place them on V3 Information Graphics.", {projectPath:z.string(),trackName:z.string().default("V3 · Information Graphics"),accent:z.string().regex(/^#[0-9a-f]{6}$/i).default("#e5484d"),background:z.string().regex(/^#[0-9a-f]{6}$/i).default("#17150f"),textColor:z.string().regex(/^#[0-9a-f]{6}$/i).default("#ffffff"),secondaryColor:z.string().regex(/^#[0-9a-f]{6}$/i).default("#e4dac7"),replace:z.boolean().default(true)},async({projectPath,...options})=>{const{project}=loadProject(projectPath),result=renderExplainerInfoCards(project,projectPath,options);saveProject(projectPath,project);return{content:[{type:"text",text:JSON.stringify(result,null,2)}]}});
server.tool("plan_product_promo_director", "Create a non-mutating Hook/problem/benefit/proof/CTA product-ad plan using only user-supplied claims, semantic local footage matching, explicit gaps, and optional music-beat alignment.", {projectPath:z.string(),productName:z.string(),hook:z.string().default(""),problem:z.string().default(""),benefits:z.array(z.string()).min(1).max(5),proof:z.string().default(""),cta:z.string(),offer:z.string().default(""),targetDuration:z.number().min(10).max(120).optional(),musicAssetId:z.string().optional()},async({projectPath,...brief})=>{const{project}=loadProject(projectPath);return{content:[{type:"text",text:JSON.stringify(planProductPromoDirector(project,brief),null,2)}]}});
server.tool("apply_product_promo_director", "Apply a reviewed product-ad plan to editable Hero, Details, markers, audio roles, export settings, and a release-blocking brand-claim card checklist.", {projectPath:z.string(),plan:z.object({type:z.literal("product-promo-director-plan")}).passthrough()},async({projectPath,plan})=>{const{project}=loadProject(projectPath),result=applyProductPromoDirector(project,plan);saveProject(projectPath,project);return{content:[{type:"text",text:JSON.stringify(result,null,2)}]}});
server.tool("review_product_promo_cards", "Approve, edit, or reject product claims and CTA cards after human advertising-claim review.", {projectPath:z.string(),decisions:z.array(z.object({id:z.string(),action:z.enum(["approve","reject"]),title:z.string().optional(),subtitle:z.string().optional(),note:z.string().optional()})).min(1)},async({projectPath,decisions})=>{const{project}=loadProject(projectPath),result=reviewProductPromoCards(project,decisions);saveProject(projectPath,project);return{content:[{type:"text",text:JSON.stringify(result,null,2)}]}});
server.tool("render_product_promo_cards", "Render only reviewed product claims and CTA cards as safe editable SVG Motion Graphics on V3 Text & CTA.", {projectPath:z.string(),accent:z.string().regex(/^#[0-9a-f]{6}$/i).default("#e5484d"),background:z.string().regex(/^#[0-9a-f]{6}$/i).default("#17150f"),textColor:z.string().regex(/^#[0-9a-f]{6}$/i).default("#ffffff"),secondaryColor:z.string().regex(/^#[0-9a-f]{6}$/i).default("#e4dac7"),replace:z.boolean().default(true)},async({projectPath,...options})=>{const{project}=loadProject(projectPath),result=renderProductPromoCards(project,projectPath,options);saveProject(projectPath,project);return{content:[{type:"text",text:JSON.stringify(result,null,2)}]}});
server.tool("plan_wedding_director", "Create a non-mutating wedding-film plan for preparation, ceremony, portraits, speeches, and reception using annotated local media, transcribed vows, music, explicit gaps, and full/highlight variants.", {projectPath:z.string(),coupleName:z.string(),weddingDate:z.string().default(""),location:z.string().default(""),targetDuration:z.number().min(30).max(7200).optional(),highlightDuration:z.number().min(15).max(300).default(60),vowsAssetId:z.string().optional(),musicAssetId:z.string().optional()},async({projectPath,...options})=>{const{project}=loadProject(projectPath);return{content:[{type:"text",text:JSON.stringify(planWeddingDirector(project,options),null,2)}]}});
server.tool("apply_wedding_director", "Apply a reviewed wedding plan to Program, Cutaways, vow/speech audio, captions, music ducking, event markers, export settings, and separate full/highlight timelines.", {projectPath:z.string(),plan:z.object({type:z.literal("wedding-director-plan")}).passthrough()},async({projectPath,plan})=>{const{project}=loadProject(projectPath),result=applyWeddingDirector(project,plan);saveProject(projectPath,project);return{content:[{type:"text",text:JSON.stringify(result,null,2)}]}});
server.tool("review_wedding_titles", "Approve, edit, or reject couple names, date, location, and wedding title cards before rendering.", {projectPath:z.string(),decisions:z.array(z.object({id:z.string(),action:z.enum(["approve","reject"]),title:z.string().optional(),subtitle:z.string().optional(),note:z.string().optional()})).min(1)},async({projectPath,decisions})=>{const{project}=loadProject(projectPath),result=reviewWeddingTitles(project,decisions);saveProject(projectPath,project);return{content:[{type:"text",text:JSON.stringify(result,null,2)}]}});
server.tool("render_wedding_titles", "Render reviewed wedding titles as safe editable SVG Motion Graphics on V3 Titles.", {projectPath:z.string(),accent:z.string().regex(/^#[0-9a-f]{6}$/i).default("#e5484d"),background:z.string().regex(/^#[0-9a-f]{6}$/i).default("#17150f"),textColor:z.string().regex(/^#[0-9a-f]{6}$/i).default("#ffffff"),secondaryColor:z.string().regex(/^#[0-9a-f]{6}$/i).default("#e4dac7"),replace:z.boolean().default(true)},async({projectPath,...options})=>{const{project}=loadProject(projectPath),result=renderWeddingTitles(project,projectPath,options);saveProject(projectPath,project);return{content:[{type:"text",text:JSON.stringify(result,null,2)}]}});
server.tool("plan_podcast_director", "Create a non-mutating speaker-aware podcast plan from reviewed multicamera sync and a speaker-labeled transcript, including overlap handling, chapters, guest titles, and short-clip candidates.", {projectPath:z.string(),transcriptAssetId:z.string().optional(),speakerCameraMap:z.record(z.string()),overlapAssetId:z.string().optional(),displayNames:z.record(z.string()).default({}),pace:z.enum(["stable","balanced","dynamic"]).default("balanced"),chapterMinutes:z.number().min(1).max(120).default(5),clipMinSeconds:z.number().min(5).max(300).default(15),clipMaxSeconds:z.number().min(5).max(600).default(60),maxClips:z.number().int().min(0).max(10).default(3)},async({projectPath,...options})=>{const{project}=loadProject(projectPath);return{content:[{type:"text",text:JSON.stringify(planPodcastDirector(project,options),null,2)}]}});
server.tool("apply_podcast_director", "Apply a reviewed podcast plan to the multicamera program, independent speaker audio, captions, chapters, title checklist, and separate short-clip timelines with In/Out ranges.", {projectPath:z.string(),plan:z.object({type:z.literal("podcast-director-plan")}).passthrough()},async({projectPath,plan})=>{const{project}=loadProject(projectPath),result=applyPodcastDirector(project,plan);saveProject(projectPath,project);return{content:[{type:"text",text:JSON.stringify(result,null,2)}]}});
server.tool("review_podcast_titles", "Approve, edit, or reject podcast host and guest identity titles before rendering.", {projectPath:z.string(),decisions:z.array(z.object({id:z.string(),action:z.enum(["approve","reject"]),title:z.string().optional(),subtitle:z.string().optional(),note:z.string().optional()})).min(1)},async({projectPath,decisions})=>{const{project}=loadProject(projectPath),result=reviewPodcastTitles(project,decisions);saveProject(projectPath,project);return{content:[{type:"text",text:JSON.stringify(result,null,2)}]}});
server.tool("render_podcast_titles", "Render reviewed host and guest titles as safe editable SVG Motion Graphics on V4 Titles.", {projectPath:z.string(),accent:z.string().regex(/^#[0-9a-f]{6}$/i).default("#e5484d"),background:z.string().regex(/^#[0-9a-f]{6}$/i).default("#17150f"),textColor:z.string().regex(/^#[0-9a-f]{6}$/i).default("#ffffff"),secondaryColor:z.string().regex(/^#[0-9a-f]{6}$/i).default("#e4dac7"),replace:z.boolean().default(true)},async({projectPath,...options})=>{const{project}=loadProject(projectPath),result=renderPodcastTitles(project,projectPath,options);saveProject(projectPath,project);return{content:[{type:"text",text:JSON.stringify(result,null,2)}]}});
const mgSceneSchema=z.object({kind:z.enum(["title","data","list","cta"]).default("title"),title:z.string().min(1),subtitle:z.string().default(""),value:z.string().default(""),unit:z.string().default(""),duration:z.number().min(.8).max(30).default(3)});
server.tool("plan_motion_graphics_director", "Create a non-mutating pure-MG storyboard from user-authored text/data scenes with beat alignment, editable keyframes, transitions, GLSL presets, and SFX cues. It never invents scene copy or values.", {projectPath:z.string(),scenes:z.array(mgSceneSchema).min(1).max(30),musicAssetId:z.string().optional(),sfxAssetIds:z.array(z.string()).default([]),accent:z.string().regex(/^#[0-9a-f]{6}$/i).default("#e5484d"),background:z.string().regex(/^#[0-9a-f]{6}$/i).default("#17150f"),pace:z.enum(["calm","balanced","energetic"]).default("balanced")},async({projectPath,...options})=>{const{project}=loadProject(projectPath);return{content:[{type:"text",text:JSON.stringify(planMotionGraphicsDirector(project,options),null,2)}]}});
server.tool("apply_motion_graphics_director", "Apply a reviewed MG storyboard as pending scenes, markers, music, SFX, and export settings while keeping content review locked.", {projectPath:z.string(),plan:z.object({type:z.literal("motion-graphics-director-plan")}).passthrough()},async({projectPath,plan})=>{const{project}=loadProject(projectPath),result=applyMotionGraphicsDirector(project,plan);saveProject(projectPath,project);return{content:[{type:"text",text:JSON.stringify(result,null,2)}]}});
server.tool("review_motion_graphics_scenes", "Approve, edit, or reject every MG scene title and subtitle before rendering user-provided text and data.", {projectPath:z.string(),decisions:z.array(z.object({id:z.string(),action:z.enum(["approve","reject"]),title:z.string().optional(),subtitle:z.string().optional(),note:z.string().optional()})).min(1)},async({projectPath,decisions})=>{const{project}=loadProject(projectPath),result=reviewMotionGraphicsScenes(project,decisions);saveProject(projectPath,project);return{content:[{type:"text",text:JSON.stringify(result,null,2)}]}});
server.tool("render_motion_graphics_scenes", "Render approved MG scenes into editable background and overlay SVG/PNG assets with keyframes, transitions, and validated GLSL presets.", {projectPath:z.string(),textColor:z.string().regex(/^#[0-9a-f]{6}$/i).default("#ffffff"),secondaryColor:z.string().regex(/^#[0-9a-f]{6}$/i).default("#e4dac7"),replace:z.boolean().default(true)},async({projectPath,...options})=>{const{project}=loadProject(projectPath),result=renderMotionGraphicsScenes(project,projectPath,options);saveProject(projectPath,project);return{content:[{type:"text",text:JSON.stringify(result,null,2)}]}});
server.tool("analyze_vlog_coverage", "Analyze whether local media covers the Vlog hook, setup, journey, payoff, and outro without changing the project, and report actionable story gaps.", { projectPath: z.string() }, async ({ projectPath }) => { const { project } = loadProject(projectPath); return { content: [{ type: "text", text: JSON.stringify(analyzeVlogCoverage(project), null, 2) }] }; });
server.tool("plan_vlog_edit", "Build a non-mutating Vlog rough-cut proposal with hook, setup, journey, payoff, and outro sections using source subclips and factual asset annotations.", { projectPath: z.string(), targetDuration: z.number().min(10).max(3600).optional(), pace: z.enum(["calm","balanced","energetic"]).optional(), start: z.number().nonnegative().default(0), includeAssetIds: z.array(z.string()).default([]), excludeAssetIds: z.array(z.string()).default([]) }, async ({ projectPath, ...options }) => { const { project } = loadProject(projectPath); return { content: [{ type: "text", text: JSON.stringify(planVlogEdit(project, options), null, 2) }] }; });
server.tool("apply_vlog_edit", "Apply a reviewed Vlog plan to the editable story track while preserving exact source ranges and section labels.", { projectPath: z.string(), plan: z.object({ type: z.literal("vlog"), style: z.string(), pace: z.string(), targetDuration: z.number(), start: z.number(), duration: z.number(), shots: z.array(z.object({ assetId: z.string(), subclipId: z.string().nullable().optional(), start: z.number().nonnegative(), sourceStart: z.number().nonnegative(), duration: z.number().positive(), section: z.string(), sectionLabel: z.string(), label: z.string(), reason: z.string() })).min(1) }), trackName: z.string().default("V1 · Story"), replace: z.boolean().default(true) }, async ({ projectPath, plan, trackName, replace }) => { const { project } = loadProject(projectPath), result = applyVlogEdit(project, plan, { trackName, replace }); saveProject(projectPath, project); return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] }; });
const vlogNarrationCueSchema = z.object({ start: z.number().nonnegative(), end: z.number().positive(), text: z.string().min(1) });
const vlogBrollPlanSchema = z.object({ type: z.literal("vlog-broll"), shots: z.array(z.object({ cueIndex: z.number().int().nonnegative(), cueText: z.string(), assetId: z.string(), subclipId: z.string().nullable().optional(), start: z.number().nonnegative(), sourceStart: z.number().nonnegative(), duration: z.number().positive(), label: z.string(), matches: z.array(z.string()), score: z.number(), reason: z.string() })).min(1), gaps: z.array(z.any()).default([]) }).passthrough();
server.tool("plan_vlog_narration_broll", "Match timestamped Vlog narration or captions to semantically relevant local B-roll, penalize repetition, and report unmatched lines without changing the timeline.", { projectPath: z.string(), cues: z.array(vlogNarrationCueSchema).default([]), transcriptAssetId: z.string().optional(), includeAssetIds: z.array(z.string()).default([]), excludeAssetIds: z.array(z.string()).default([]), minCueDuration: z.number().min(.1).max(30).default(.6), maxShotDuration: z.number().min(.2).max(30).default(4), coverage: z.number().min(.25).max(1).default(.82) }, async ({ projectPath, ...options }) => { const { project } = loadProject(projectPath); return { content: [{ type: "text", text: JSON.stringify(planVlogBroll(project, options), null, 2) }] }; });
server.tool("apply_vlog_narration_broll", "Apply a reviewed narration-to-B-roll plan to the editable V2 cutaway track with cue provenance and exact source ranges.", { projectPath: z.string(), plan: vlogBrollPlanSchema, trackName: z.string().default("V2 · Cutaways"), replace: z.boolean().default(true) }, async ({ projectPath, plan, trackName, replace }) => { const { project } = loadProject(projectPath), result = applyVlogBroll(project, plan, { trackName, replace }); saveProject(projectPath, project); return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] }; });
const vlogRhythmOptions = { maxTalkingHeadSeconds: z.number().min(1).max(60).optional(), maxShotSeconds: z.number().min(.5).max(60).optional(), gapWindowSeconds: z.number().min(1).max(60).default(6) };
server.tool("analyze_vlog_rhythm", "Audit a Vlog for long talking-head runs, overly long shots, repeated adjacent footage, B-roll gaps, and missing voice/music ducking roles without changing the project.", { projectPath: z.string(), ...vlogRhythmOptions }, async ({ projectPath, ...options }) => { const { project } = loadProject(projectPath); return { content: [{ type: "text", text: JSON.stringify(analyzeVlogRhythm(project, options), null, 2) }] }; });
server.tool("plan_vlog_rhythm", "Create a non-mutating Vlog rhythm-director plan with safe visual prelaps, cutaway handoffs, audio fades, voice anchoring, music ducking, and separately listed manual editorial decisions.", { projectPath: z.string(), ...vlogRhythmOptions }, async ({ projectPath, ...options }) => { const { project } = loadProject(projectPath); return { content: [{ type: "text", text: JSON.stringify(planVlogRhythm(project, options), null, 2) }] }; });
server.tool("apply_vlog_rhythm", "Apply a reviewed Vlog rhythm-director plan and preserve subjective long-take or deletion decisions for manual review.", { projectPath: z.string(), plan: z.object({ type: z.literal("vlog-rhythm-plan") }).passthrough() }, async ({ projectPath, plan }) => { const { project } = loadProject(projectPath), result = applyVlogRhythm(project, plan); saveProject(projectPath, project); return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] }; });
server.tool("plan_vlog_sound", "Build a non-mutating Vlog sound-design plan using explicitly identified music and SFX plus natural sound from cutaways, with intro/body/payoff/outro music levels and honest missing-source warnings.", { projectPath: z.string(), musicAssetId: z.string().optional(), sfxAssetIds: z.array(z.string()).default([]), naturalSound: z.boolean().default(true), musicVolumeDb: z.number().min(-60).max(6).default(-17), ambienceVolumeDb: z.number().min(-60).max(6).default(-20), sfxVolumeDb: z.number().min(-60).max(6).default(-10) }, async ({ projectPath, ...options }) => { const { project } = loadProject(projectPath); return { content: [{ type: "text", text: JSON.stringify(planVlogSound(project, options), null, 2) }] }; });
server.tool("apply_vlog_sound", "Apply a reviewed Vlog sound plan to music, SFX, and natural-sound tracks with voice/music ducking roles and snapshot-safe editable clips.", { projectPath: z.string(), plan: z.object({ type: z.literal("vlog-sound-plan") }).passthrough(), musicTrackName: z.string().default("A2 · Music"), sfxTrackName: z.string().default("A3 · SFX"), ambienceTrackName: z.string().default("A4 · Natural Sound"), replace: z.boolean().default(true) }, async ({ projectPath, plan, ...options }) => { const { project } = loadProject(projectPath), result = applyVlogSound(project, plan, options); saveProject(projectPath, project); return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] }; });
server.tool("plan_vlog_finishing", "Build a non-mutating Vlog finishing plan covering caption readability, platform safe areas, opening/location/CTA title-card specs, chapter markers, and export settings.", { projectPath: z.string(), openingTitle: z.string().optional(), openingSubtitle: z.string().default(""), cta: z.string().default("关注我，继续记录"), platform: z.enum(["short-video","youtube","instagram","custom"]).default("short-video"), bilingual: z.boolean().default(false) }, async ({ projectPath, ...options }) => { const { project } = loadProject(projectPath); return { content: [{ type: "text", text: JSON.stringify(planVlogFinishing(project, options), null, 2) }] }; });
server.tool("apply_vlog_finishing", "Apply a reviewed Vlog finishing plan to caption style, safe-area metadata, chapter markers, export preset, and editable pending title-card specifications on V3.", { projectPath: z.string(), plan: z.object({ type: z.literal("vlog-finishing-plan") }).passthrough() }, async ({ projectPath, plan }) => { const { project } = loadProject(projectPath), result = applyVlogFinishing(project, plan); saveProject(projectPath, project); return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] }; });
server.tool("render_vlog_title_cards", "Render applied Vlog finishing title-card specs through the safe editable SVG pipeline, create transparent PNG assets, and place them on V3 with overlap protection.", { projectPath: z.string(), trackName: z.string().default("V3 · Titles"), accent: z.string().regex(/^#[0-9a-f]{6}$/i).default("#e5484d"), background: z.string().regex(/^#[0-9a-f]{6}$/i).default("#17150f"), textColor: z.string().regex(/^#[0-9a-f]{6}$/i).default("#ffffff"), secondaryColor: z.string().regex(/^#[0-9a-f]{6}$/i).default("#e4dac7"), replace: z.boolean().default(true) }, async ({ projectPath, ...options }) => { const { project } = loadProject(projectPath), result = renderVlogTitleCards(project, projectPath, options); saveProject(projectPath, project); return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] }; });
server.tool("analyze_vlog_release", "Run a strict Vlog release preflight covering offline assets, invalid edits, primary-video gaps, captions, rendered titles, duration, audio roles, safe areas, and export settings.", { projectPath: z.string(), requireCaptions: z.boolean().default(true), maxVideoGap: z.number().min(0).max(5).default(.25) }, async ({ projectPath, ...options }) => { const { project } = loadProject(projectPath); return { content: [{ type: "text", text: JSON.stringify(analyzeVlogRelease(project, options), null, 2) }] }; });
server.tool("apply_vlog_release_fixes", "Apply only safe mechanical fixes from a reviewed Vlog release preflight, then rerun the strict readiness check without guessing offline media paths or deleting creative content.", { projectPath: z.string(), preflight: z.object({ type: z.literal("vlog-release-preflight") }).passthrough() }, async ({ projectPath, preflight }) => { const { project } = loadProject(projectPath), result = applyVlogReleaseFixes(project, preflight); saveProject(projectPath, project); return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] }; });
server.tool("get_vlog_workflow_status", "Read the evidence-based Vlog stage checklist, overall progress, strict release state, and the single recommended next action without changing the project.", { projectPath: z.string() }, async ({ projectPath }) => { const { project } = loadProject(projectPath); return { content: [{ type: "text", text: JSON.stringify(analyzeVlogWorkflow(project), null, 2) }] }; });
const vlogReleaseExportOptions = z.object({ codec: z.enum(["h264", "vp8"]).optional(), crf: z.number().int().min(15).max(32).optional(), burnCaptions: z.boolean().optional(), range: z.enum(["full", "zone", "custom"]).optional(), rangeStart: z.number().nonnegative().optional(), rangeEnd: z.number().positive().optional(), resolution: z.enum(["original", "1080p", "720p", "480p"]).optional(), frameRate: z.number().min(24).max(60).optional() }).default({});
server.tool("submit_vlog_release_export", "Submit a persistent Vlog MP4 export only after rerunning strict release preflight and proving every blocking issue is cleared.", { projectPath: z.string(), outputPath: z.string(), options: vlogReleaseExportOptions }, async ({ projectPath, outputPath, options }) => { const { project } = loadProject(projectPath), workflow = analyzeVlogWorkflow(project); if (!workflow.readyToExport) throw new Error(`Vlog export blocked: ${workflow.release.blockers.map((entry)=>entry.message).join("; ")}`); return { content: [{ type: "text", text: JSON.stringify({ workflow, job: submitExportJob(projectPath,{ kind:"video",outputPath,options }) }, null, 2) }] }; });

server.tool("read_project", "Read a CutPilot project, its assets, tracks, items, captions, markers, and validation state.", {
  projectPath: z.string(),
}, async ({ projectPath }) => {
  const { path, project } = loadProject(projectPath);
  const timeline = activeTimeline(project);
  return { content: [{ type: "text", text: JSON.stringify({ path, project, activeTimelineDuration: projectDuration(timeline), validation: validateProject(project) }, null, 2) }] };
});

const editContextReference = z.discriminatedUnion("type", [
  z.object({ type: z.literal("asset"), assetId: z.string() }),
  z.object({ type: z.literal("item"), itemId: z.string() }),
  z.object({ type: z.literal("time"), timelineId: z.string().optional(), time: z.number().nonnegative() }),
  z.object({ type: z.literal("region"), timelineId: z.string().optional(), x: z.number(), y: z.number(), width: z.number().positive(), height: z.number().positive(), units: z.enum(["normalized", "pixels"]).default("normalized"), time: z.number().nonnegative().optional() }),
  z.object({ type: z.literal("transcript"), assetId: z.string(), start: z.number().nonnegative(), end: z.number().positive() }),
]);
server.tool("read_edit_context", "Read the persistent ChatCut-style selection references for a CutPilot project.", { projectPath: z.string() }, async ({ projectPath }) => ({ content: [{ type: "text", text: JSON.stringify(readEditContext(projectPath), null, 2) }] }));
server.tool("add_timeline_marker", "Add a named, colored marker to the active CutPilot timeline.", { projectPath: z.string(), time: z.number().nonnegative(), label: z.string().default("Marker"), note: z.string().default(""), color: z.enum(["red", "orange", "yellow", "green", "blue", "purple"]).default("red"), kind: z.string().default("comment") }, async ({ projectPath, ...options }) => { const { project } = loadProject(projectPath), result = addTimelineMarker(project, options); saveProject(projectPath, project); return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] }; });
server.tool("update_timeline_marker", "Rename, recolor, retime, or annotate an active timeline marker.", { projectPath: z.string(), markerId: z.string(), time: z.number().nonnegative().optional(), label: z.string().optional(), note: z.string().optional(), color: z.enum(["red", "orange", "yellow", "green", "blue", "purple"]).optional() }, async ({ projectPath, markerId, ...changes }) => { const { project } = loadProject(projectPath), result = updateTimelineMarker(project, markerId, changes); saveProject(projectPath, project); return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] }; });
server.tool("delete_timeline_marker", "Delete one marker without changing clips or captions.", { projectPath: z.string(), markerId: z.string() }, async ({ projectPath, markerId }) => { const { project } = loadProject(projectPath), result = deleteTimelineMarker(project, markerId); saveProject(projectPath, project); return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] }; });
server.tool("find_duplicate_shots", "Analyze representative frames locally and propose visually repeated timeline shots without modifying the project.", { projectPath: z.string(), threshold: z.number().min(.5).max(1).default(.92), minDuration: z.number().min(.05).default(.2), trackIdOrName: z.string().optional() }, async ({ projectPath, ...options }) => { const { project } = loadProject(projectPath); return { content: [{ type: "text", text: JSON.stringify(findDuplicateShots(project, options), null, 2) }] }; });
server.tool("remove_duplicate_shots", "Remove explicitly reviewed duplicate timeline items, optionally ripple-closing their time across all tracks.", { projectPath: z.string(), duplicateItemIds: z.array(z.string()).min(1), ripple: z.boolean().default(true) }, async ({ projectPath, duplicateItemIds, ripple }) => { const { project } = loadProject(projectPath), result = removeDuplicateShots(project, duplicateItemIds, { ripple }); saveProject(projectPath, project); return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] }; });
const multicamAnalysisSchema = z.object({ referenceAssetId: z.string(), offsets: z.array(z.object({ assetId: z.string(), name: z.string(), offsetSeconds: z.number(), sourceStart: z.number().nonnegative(), confidence: z.number().min(0).max(1), correlation: z.number().optional() })).min(2), duration: z.number().nonnegative(), envelopeRate: z.number().optional(), analysisSeconds: z.number().optional(), method: z.string().optional(), warning: z.string().nullable().optional() });
server.tool("analyze_multicam_sync", "Analyze scratch/reference audio locally and propose frame-independent source offsets for two or more camera or recorder assets without changing the timeline.", { projectPath: z.string(), assetIds: z.array(z.string()).min(2), referenceAssetId: z.string().optional(), maxOffsetSeconds: z.number().positive().max(600).default(30), analysisSeconds: z.number().positive().max(3600).default(180), envelopeRate: z.number().int().min(10).max(200).default(50) }, async ({ projectPath, ...options }) => { const { project } = loadProject(projectPath); return { content: [{ type: "text", text: JSON.stringify(analyzeMulticamSync(project, options), null, 2) }] }; });
server.tool("apply_multicam_sync", "Apply a reviewed multicam sync analysis to separate editable angle tracks, optionally adding linked original-audio tracks.", { projectPath: z.string(), analysis: multicamAnalysisSchema, trackPrefix: z.string().default("CAM"), includeAudio: z.boolean().default(false), replace: z.boolean().default(false) }, async ({ projectPath, analysis, ...options }) => { const { project } = loadProject(projectPath), result = applyMulticamSync(project, analysis, options); saveProject(projectPath, project); return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] }; });
server.tool("plan_multicam_cut", "Build a non-mutating, reviewable automatic camera-switch plan using asset quality/motion annotations, pacing targets, anti-repetition scoring, preferred angles, and explicit directed holds.", { projectPath: z.string(), analysis: multicamAnalysisSchema, start: z.number().nonnegative().default(0), end: z.number().positive().optional(), pace: z.enum(["stable", "balanced", "dynamic"]).default("balanced"), minShotSeconds: z.number().min(.25).max(30).optional(), maxShotSeconds: z.number().min(.25).max(30).optional(), preferredAssetIds: z.array(z.string()).default([]), holds: z.array(z.object({ assetId: z.string(), start: z.number().nonnegative(), end: z.number().positive(), reason: z.string().optional() })).default([]) }, async ({ projectPath, analysis, ...options }) => { const { project } = loadProject(projectPath); return { content: [{ type: "text", text: JSON.stringify(planMulticamCut(project, analysis, options), null, 2) }] }; });
server.tool("plan_speaker_multicam_cut", "Build a non-mutating camera-switch plan from speaker-labeled transcript cues. Maps speakers to synchronized cameras, supports an overlap/wide camera, skips unsafe micro-shots, and reports unmapped speakers instead of pretending diarization succeeded.", { projectPath: z.string(), analysis: multicamAnalysisSchema, transcriptAssetId: z.string(), speakerCameraMap: z.record(z.string()), overlapAssetId: z.string().optional(), start: z.number().nonnegative().default(0), end: z.number().positive().optional(), pace: z.enum(["stable", "balanced", "dynamic"]).default("balanced"), minShotSeconds: z.number().min(.25).max(30).optional(), maxShotSeconds: z.number().min(.25).max(30).optional(), preferredAssetIds: z.array(z.string()).default([]), minSpeakerShot: z.number().min(.2).max(10).default(.6), mergeGap: z.number().min(0).max(5).default(.35) }, async ({ projectPath, analysis, transcriptAssetId, ...options }) => { const { project } = loadProject(projectPath), asset = project.assets.find((entry) => entry.id === transcriptAssetId); if (!asset?.transcript) throw new Error(`Transcript not found for asset ${transcriptAssetId}`); return { content: [{ type: "text", text: JSON.stringify(planSpeakerMulticamCut(project, analysis, { transcript: asset.transcript, ...options }), null, 2) }] }; });
server.tool("apply_multicam_cut", "Create an editable program track from reviewed camera switches using offsets from a multicam sync analysis.", { projectPath: z.string(), analysis: multicamAnalysisSchema, switches: z.array(z.object({ assetId: z.string(), start: z.number().nonnegative(), end: z.number().positive(), label: z.string().optional() })).min(1), trackName: z.string().default("V1 · Multicam Program"), replace: z.boolean().default(false) }, async ({ projectPath, analysis, ...options }) => { const { project } = loadProject(projectPath), result = applyMulticamCut(project, analysis, options); saveProject(projectPath, project); return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] }; });
server.tool("set_edit_context", "Replace or append precise asset, clip, timeline-time, canvas-region, or transcript-range references for subsequent AI editing.", { projectPath: z.string(), references: z.array(editContextReference).max(50), mode: z.enum(["replace", "append"]).default("replace") }, async ({ projectPath, references, mode }) => { const { project } = loadProject(projectPath); return { content: [{ type: "text", text: JSON.stringify(setEditContext(projectPath, project, references, { mode }), null, 2) }] }; });
server.tool("resolve_edit_context", "Resolve current selection references into exact project objects and a concise prompt context for AI editing.", { projectPath: z.string() }, async ({ projectPath }) => { const { project } = loadProject(projectPath); return { content: [{ type: "text", text: JSON.stringify(resolveEditContext(projectPath, project), null, 2) }] }; });
server.tool("clear_edit_context", "Clear all persistent edit-context references without adding an Undo history entry.", { projectPath: z.string() }, async ({ projectPath }) => ({ content: [{ type: "text", text: JSON.stringify(clearEditContext(projectPath), null, 2) }] }));
server.tool("place_asset_on_timeline", "Place a local source range onto a compatible target track by appending, ripple-inserting across all tracks, or overwriting only the target range with source-continuous remainder clips.", { projectPath: z.string(), assetId: z.string(), trackIdOrName: z.string(), mode: z.enum(["append", "insert", "overwrite"]).default("append"), at: z.number().nonnegative().optional(), sourceStart: z.number().nonnegative().default(0), sourceEnd: z.number().positive().optional(), duration: z.number().positive().optional(), label: z.string().optional() }, async ({ projectPath, ...options }) => { const { project } = loadProject(projectPath), result = placeAssetOnTimeline(project, options); saveProject(projectPath, project); return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] }; });
server.tool("place_linked_av", "Place one source range from a video-with-audio asset onto a video track and audio track as a persistent linked group.", { projectPath: z.string(), assetId: z.string(), videoTrackIdOrName: z.string(), audioTrackIdOrName: z.string(), mode: z.enum(["append", "insert", "overwrite"]).default("append"), at: z.number().nonnegative().optional(), sourceStart: z.number().nonnegative().default(0), sourceEnd: z.number().positive().optional(), duration: z.number().positive().optional(), label: z.string().optional() }, async ({ projectPath, ...options }) => { const { project } = loadProject(projectPath), result = placeLinkedAv(project, options); saveProject(projectPath, project); return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] }; });
server.tool("link_timeline_items", "Link two or more timeline items so linked-aware edits preserve their relative synchronization.", { projectPath: z.string(), itemIds: z.array(z.string()).min(2), groupId: z.string().optional() }, async ({ projectPath, itemIds, groupId }) => { const { project } = loadProject(projectPath), result = linkTimelineItems(project, itemIds, groupId); saveProject(projectPath, project); return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] }; });
server.tool("move_linked_group", "Move every member of a link group by the same delta while rejecting negative time, locks, and collisions.", { projectPath: z.string(), itemOrGroupId: z.string(), start: z.number().nonnegative() }, async ({ projectPath, itemOrGroupId, start }) => { const { project } = loadProject(projectPath), result = moveLinkedGroup(project, itemOrGroupId, start); saveProject(projectPath, project); return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] }; });
server.tool("trim_linked_group", "Trim aligned linked items to common timeline boundaries with exact source continuity.", { projectPath: z.string(), itemOrGroupId: z.string(), newStart: z.number().nonnegative().optional(), newEnd: z.number().positive().optional() }, async ({ projectPath, itemOrGroupId, newStart, newEnd }) => { const { project } = loadProject(projectPath), result = trimLinkedGroup(project, itemOrGroupId, { newStart, newEnd }); saveProject(projectPath, project); return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] }; });
server.tool("unlink_timeline_items", "Remove a persistent link group without changing clip timing or media.", { projectPath: z.string(), itemOrGroupId: z.string() }, async ({ projectPath, itemOrGroupId }) => { const { project } = loadProject(projectPath), result = unlinkTimelineItems(project, itemOrGroupId); saveProject(projectPath, project); return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] }; });
const exportJobOptions = z.object({ timelineId: z.string().optional(), codec: z.enum(["h264", "vp8"]).optional(), crf: z.number().int().min(15).max(32).optional(), burnCaptions: z.boolean().optional(), range: z.enum(["full", "zone", "custom"]).optional(), rangeStart: z.number().nonnegative().optional(), rangeEnd: z.number().positive().optional(), resolution: z.enum(["original", "1080p", "720p", "480p"]).optional(), frameRate: z.number().min(24).max(60).optional(), format: z.enum(["wav", "flac", "mp3", "m4a"]).optional(), copyMedia: z.boolean().optional() }).default({});
server.tool("submit_category_release_export", "Submit a persistent MP4 for a non-Vlog category only after rerunning strict release preflight and proving all blockers are cleared.", {projectPath:z.string(),outputPath:z.string(),options:exportJobOptions},async({projectPath,outputPath,options})=>{const{project}=loadProject(projectPath),workflow=analyzeCategoryWorkflow(project);if(!workflow.readyToExport)throw new Error(`Category export blocked: ${workflow.release.blockers.map((entry)=>entry.message).join("; ")}`);return{content:[{type:"text",text:JSON.stringify({workflow,job:submitExportJob(projectPath,{kind:"video",outputPath,options})},null,2)}]}});
server.tool("submit_export_job", "Start a detached, persistent local export without blocking the Codex session. Supports video, audio, editable NLE interchange, and experimental Jianying drafts.", { projectPath: z.string(), kind: z.enum(["video", "audio", "fcpxml", "premiere-xml", "edl", "jianying"]), outputPath: z.string(), options: exportJobOptions }, async ({ projectPath, kind, outputPath, options }) => ({ content: [{ type: "text", text: JSON.stringify(submitExportJob(projectPath, { kind, outputPath, options }), null, 2) }] }));
server.tool("read_export_job", "Read one persistent export job's phase, progress, output, result, or failure.", { projectPath: z.string(), jobId: z.string() }, async ({ projectPath, jobId }) => ({ content: [{ type: "text", text: JSON.stringify(readExportJob(projectPath, jobId), null, 2) }] }));
server.tool("list_export_jobs", "List newest-first persistent background export jobs for a CutPilot project.", { projectPath: z.string() }, async ({ projectPath }) => ({ content: [{ type: "text", text: JSON.stringify(listExportJobs(projectPath), null, 2) }] }));
server.tool("cancel_export_job", "Cancel a queued or running background export process while preserving its cancelled history record.", { projectPath: z.string(), jobId: z.string() }, async ({ projectPath, jobId }) => ({ content: [{ type: "text", text: JSON.stringify(cancelExportJob(projectPath, jobId), null, 2) }] }));
server.tool("list_delivery_variants", "List the editable multi-platform delivery variants CutPilot can derive from one approved timeline.", {}, async () => ({ content: [{ type: "text", text: JSON.stringify(DELIVERY_VARIANTS, null, 2) }] }));
server.tool("create_delivery_variants", "Create or refresh independent editable 16:9, 9:16, 1:1, and 4:5 timelines from one approved source timeline while preserving the original active sequence.", { projectPath: z.string(), sourceTimelineId: z.string().optional(), variants: z.array(z.enum(["youtube", "shorts", "square", "feed"])).default(["youtube", "shorts", "square", "feed"]), layoutMode: z.enum(["scale", "preserve"]).default("scale"), replace: z.boolean().default(false) }, async ({ projectPath, ...options }) => { const { project } = loadProject(projectPath), result = createDeliveryVariants(project, options); saveProject(projectPath, project); return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] }; });
server.tool("submit_delivery_pack", "Submit background MP4 exports for selected delivery-variant timelines; every job snapshots and renders its explicit timeline instead of relying on the active sequence.", { projectPath: z.string(), outputFolder: z.string().optional(), timelineIds: z.array(z.string()).optional(), resolution: z.enum(["original", "1080p", "720p", "480p"]).default("original"), frameRate: z.number().min(24).max(60).optional(), burnCaptions: z.boolean().default(true), crf: z.number().int().min(15).max(32).default(20) }, async ({ projectPath, ...options }) => ({ content: [{ type: "text", text: JSON.stringify(submitDeliveryPack(projectPath, options), null, 2) }] }));
server.tool("analyze_asset_silence", "Locally detect proposed silence removals without modifying the project. Returns raw silence and padded keep ranges for review.", { projectPath: z.string(), assetId: z.string(), thresholdDb: z.number().min(-90).max(-5).default(-35), minSilence: z.number().min(.1).max(10).default(.35), padding: z.number().min(0).max(2).default(.08), minKeep: z.number().min(0).max(5).default(.12) }, async ({ projectPath, assetId, ...options }) => { const { project } = loadProject(projectPath), asset = project.assets.find((entry) => entry.id === assetId); if (!asset) throw new Error(`Asset not found: ${assetId}`); return { content: [{ type: "text", text: JSON.stringify(analyzeAssetSilence(asset, options), null, 2) }] }; });
const silenceRangeSchema = z.object({ start: z.number().nonnegative(), end: z.number().positive() });
server.tool("apply_silence_cut", "After reviewing proposed keep ranges, rebuild linked picture/original-audio clips and remapped captions with silent regions removed.", { projectPath: z.string(), assetId: z.string(), keepRanges: z.array(silenceRangeSchema).min(1), videoTrackName: z.string().default("V1"), audioTrackName: z.string().default("A1"), includeVideo: z.boolean().default(true), includeAudio: z.boolean().default(true), gapSeconds: z.number().min(0).max(2).default(0), replaceTracks: z.boolean().default(true) }, async ({ projectPath, ...options }) => { const { project } = loadProject(projectPath), result = applySilenceCut(project, options); saveProject(projectPath, project); return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] }; });
server.tool("analyze_asset_scenes", "Detect hard visual cuts locally and generate per-scene thumbnails plus a contact sheet without modifying the project.", { projectPath: z.string(), assetId: z.string(), threshold: z.number().min(.05).max(.9).default(.3), minScene: z.number().min(.1).max(30).default(.5), thumbnailWidth: z.number().int().min(120).max(1280).default(320) }, async ({ projectPath, assetId, ...options }) => { const { project } = loadProject(projectPath), asset = project.assets.find((entry) => entry.id === assetId); if (!asset) throw new Error(`Asset not found: ${assetId}`); return { content: [{ type: "text", text: JSON.stringify(analyzeAssetScenes(projectPath, asset, options), null, 2) }] }; });
const sceneSubclipSchema = z.object({ id: z.string().optional(), name: z.string().optional(), sourceStart: z.number().nonnegative(), sourceEnd: z.number().positive(), midpoint: z.number().nonnegative().optional(), thumbnailPath: z.string().nullable().optional(), tags: z.array(z.string()).optional(), annotation: z.string().optional() });
server.tool("save_scene_subclips", "Persist reviewed detected scenes as searchable source subclips on an asset.", { projectPath: z.string(), assetId: z.string(), scenes: z.array(sceneSubclipSchema).min(1), replace: z.boolean().default(true) }, async ({ projectPath, assetId, scenes, replace }) => { const { project } = loadProject(projectPath), result = saveSceneSubclips(project, assetId, scenes, { replace }); saveProject(projectPath, project); return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] }; });
server.tool("list_asset_subclips", "List or search persisted scene subclips by name, annotation, or tag.", { projectPath: z.string(), assetId: z.string(), query: z.string().default("") }, async ({ projectPath, assetId, query }) => { const { project } = loadProject(projectPath); return { content: [{ type: "text", text: JSON.stringify(listAssetSubclips(project, assetId, query), null, 2) }] }; });
server.tool("place_asset_subclip", "Place one persisted scene subclip on a compatible timeline track using its exact source range.", { projectPath: z.string(), assetId: z.string(), subclipId: z.string(), trackIdOrName: z.string(), mode: z.enum(["append", "insert", "overwrite"]).default("append"), at: z.number().nonnegative().optional(), label: z.string().optional() }, async ({ projectPath, ...options }) => { const { project } = loadProject(projectPath), result = placeAssetSubclip(project, options); saveProject(projectPath, project); return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] }; });
server.tool("generate_video_proxy", "Generate and attach a local low-resolution H.264 editing proxy while retaining the original source for final rendering.", { projectPath: z.string(), assetId: z.string(), profile: z.enum(["540p", "720p", "1080p"]).default("720p"), quality: z.number().int().min(18).max(32).default(23), includeAudio: z.boolean().default(true) }, async ({ projectPath, assetId, ...options }) => { const { project } = loadProject(projectPath), asset = project.assets.find((entry) => entry.id === assetId); if (!asset) throw new Error(`Asset not found: ${assetId}`); const result = generateVideoProxy(projectPath, asset, options); project.history.push({ at: new Date().toISOString(), action: "generate_video_proxy", assetId, profile: options.profile }); saveProject(projectPath, project); return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] }; });
server.tool("scan_proxy_status", "Check every video proxy for ready, missing, stale-source, or not-generated status using source size and modification time.", { projectPath: z.string() }, async ({ projectPath }) => { const { project } = loadProject(projectPath); return { content: [{ type: "text", text: JSON.stringify(scanProxyStatus(project), null, 2) }] }; });
server.tool("read_asset_proxy", "Read one video asset's proxy status and metadata without exposing it as final-render media.", { projectPath: z.string(), assetId: z.string() }, async ({ projectPath, assetId }) => { const { project } = loadProject(projectPath), asset = project.assets.find((entry) => entry.id === assetId); if (!asset) throw new Error(`Asset not found: ${assetId}`); return { content: [{ type: "text", text: JSON.stringify(proxyStatus(asset), null, 2) }] }; });
server.tool("detach_video_proxy", "Detach a video proxy and optionally delete only its project-owned proxy file; the original media and edits remain untouched.", { projectPath: z.string(), assetId: z.string(), deleteFile: z.boolean().default(false) }, async ({ projectPath, assetId, deleteFile }) => { const { project } = loadProject(projectPath), asset = project.assets.find((entry) => entry.id === assetId); if (!asset) throw new Error(`Asset not found: ${assetId}`); const result = detachVideoProxy(projectPath, asset, { deleteFile }); project.history.push({ at: new Date().toISOString(), action: "detach_video_proxy", assetId, deleteFile }); saveProject(projectPath, project); return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] }; });
server.tool("analyze_asset_beats", "Detect rhythmic onsets and estimate tempo from a local audio or video asset without modifying the project.", { projectPath: z.string(), assetId: z.string(), sensitivity: z.number().min(0).max(1).default(.6), minInterval: z.number().min(.1).max(2).default(.22), maxBpm: z.number().min(60).max(300).default(220) }, async ({ projectPath, assetId, ...options }) => { const { project } = loadProject(projectPath), asset = project.assets.find((entry) => entry.id === assetId); if (!asset) throw new Error(`Asset not found: ${assetId}`); return { content: [{ type: "text", text: JSON.stringify(analyzeAssetBeats(asset, options), null, 2) }] }; });
const beatSchema = z.object({ index: z.number().int().nonnegative().optional(), time: z.number().nonnegative(), strength: z.number().nonnegative(), accent: z.boolean().optional() });
server.tool("save_beat_markers", "Persist reviewed beat or accent positions as editable timeline markers.", { projectPath: z.string(), assetId: z.string(), analysis: z.object({ bpm: z.number().positive().nullable().optional(), beats: z.array(beatSchema).min(1) }), replace: z.boolean().default(true), accentsOnly: z.boolean().default(false), label: z.string().default("Beat") }, async ({ projectPath, assetId, analysis, ...options }) => { const { project } = loadProject(projectPath), result = saveBeatMarkers(project, assetId, analysis, options); saveProject(projectPath, project); return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] }; });
server.tool("plan_beat_montage", "Create a non-mutating cut-on-beat montage proposal from reviewed beat times and visual assets or their saved scene subclips.", { projectPath: z.string(), beatTimes: z.array(z.number().nonnegative()).min(2), assetIds: z.array(z.string()).min(1), start: z.number().nonnegative().optional(), end: z.number().positive().optional(), cutEvery: z.number().int().min(1).max(16).default(1), minClip: z.number().min(.05).max(5).default(.12) }, async ({ projectPath, ...options }) => { const { project } = loadProject(projectPath); return { content: [{ type: "text", text: JSON.stringify(buildBeatMontagePlan(project, options), null, 2) }] }; });
const montageClipSchema = z.object({ index: z.number().int().nonnegative().optional(), start: z.number().nonnegative(), duration: z.number().positive(), assetId: z.string(), subclipId: z.string().nullable().optional(), label: z.string(), sourceStart: z.number().nonnegative(), sourceDuration: z.number().positive(), freezeFrame: z.boolean().optional() });
server.tool("apply_beat_montage", "Apply an explicitly reviewed beat montage proposal to a video track as one reversible project change.", { projectPath: z.string(), trackIdOrName: z.string().default("V1"), plan: z.object({ start: z.number().nonnegative(), end: z.number().positive(), clips: z.array(montageClipSchema).min(1) }), replaceRange: z.boolean().default(true) }, async ({ projectPath, ...options }) => { const { project } = loadProject(projectPath), result = applyBeatMontage(project, options); saveProject(projectPath, project); return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] }; });

server.tool("list_timelines", "List every editable sequence in a CutPilot project, including active state, format, duration, item count, and In/Out zone.", { projectPath: z.string() }, async ({ projectPath }) => { const { project } = loadProject(projectPath); return { content: [{ type: "text", text: JSON.stringify({ activeTimelineId: project.activeTimelineId, timelines: listTimelines(project) }, null, 2) }] }; });

server.tool("create_timeline", "Create a new empty sequence sharing the project's asset library.", { projectPath: z.string(), name: z.string(), width: z.number().int().positive().optional(), height: z.number().int().positive().optional(), fps: z.number().positive().optional(), activate: z.boolean().default(true) }, async ({ projectPath, ...options }) => { const { project } = loadProject(projectPath), result = createProjectTimeline(project, options); saveProject(projectPath, project); return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] }; });

server.tool("duplicate_timeline", "Duplicate an editable sequence with fresh track, clip, and marker IDs while sharing source assets.", { projectPath: z.string(), timelineId: z.string(), name: z.string().optional(), activate: z.boolean().default(true) }, async ({ projectPath, timelineId, name, activate }) => { const { project } = loadProject(projectPath), result = duplicateProjectTimeline(project, timelineId, { name, activate }); saveProject(projectPath, project); return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] }; });

server.tool("activate_timeline", "Switch the active sequence used by editing, preview, validation, and rendering tools.", { projectPath: z.string(), timelineId: z.string() }, async ({ projectPath, timelineId }) => { const { project } = loadProject(projectPath), result = activateProjectTimeline(project, timelineId); saveProject(projectPath, project); return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] }; });

server.tool("rename_timeline", "Rename an editable sequence.", { projectPath: z.string(), timelineId: z.string(), name: z.string() }, async ({ projectPath, timelineId, name }) => { const { project } = loadProject(projectPath), result = renameProjectTimeline(project, timelineId, name); saveProject(projectPath, project); return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] }; });

server.tool("delete_timeline", "Delete a sequence while preserving shared assets; at least one sequence must remain.", { projectPath: z.string(), timelineId: z.string() }, async ({ projectPath, timelineId }) => { const { project } = loadProject(projectPath), result = deleteProjectTimeline(project, timelineId); saveProject(projectPath, project); return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] }; });

server.tool("set_timeline_in_out", "Set or clear the active export zone for a sequence.", { projectPath: z.string(), timelineId: z.string().optional(), inPoint: z.number().nonnegative().nullable(), outPoint: z.number().positive().nullable() }, async ({ projectPath, timelineId, inPoint, outPoint }) => { const { project } = loadProject(projectPath), result = setTimelineInOut(project, timelineId, { inPoint, outPoint }); saveProject(projectPath, project); return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] }; });
server.tool("list_aspect_presets", "List ChatCut-compatible canvas aspect presets and their reference dimensions.", {}, async () => ({ content: [{ type: "text", text: JSON.stringify(ASPECT_PRESETS, null, 2) }] }));
server.tool("set_timeline_format", "Change a sequence canvas size/aspect/FPS, optionally scaling pixel-based transforms, keyframes, masks, and caption styling with it.", { projectPath: z.string(), timelineId: z.string().optional(), preset: z.enum(["16:9", "9:16", "1:1", "4:5", "4:3", "3:4"]).optional(), width: z.number().int().min(16).max(8192).optional(), height: z.number().int().min(16).max(8192).optional(), fps: z.number().min(1).max(120).optional(), layoutMode: z.enum(["scale", "preserve"]).default("scale") }, async ({ projectPath, timelineId, ...format }) => { const { project } = loadProject(projectPath), result = setTimelineFormat(project, timelineId, format); saveProject(projectPath, project); return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] }; });

server.tool("open_review_session", "Start a token-protected localhost review UI for the real CutPilot project and optional rendered preview.", {
  projectPath: z.string(), previewPath: z.string().optional(),
}, async ({ projectPath, previewPath }) => ({ content: [{ type: "text", text: JSON.stringify(await openReviewSession({ projectPath, previewPath }), null, 2) }] }));

server.tool("close_review_session", "Expire a CutPilot localhost review session token.", {
  token: z.string(),
}, async ({ token }) => ({ content: [{ type: "text", text: JSON.stringify({ token, closed: closeReviewSession(token) }, null, 2) }] }));

server.tool("create_project_snapshot", "Create an immutable local project snapshot before substantial AI edits.", {
  projectPath: z.string(), label: z.string().default("snapshot"),
}, async ({ projectPath, label }) => ({ content: [{ type: "text", text: JSON.stringify(createSnapshot(projectPath, label), null, 2) }] }));

server.tool("list_project_snapshots", "List restorable local snapshots for a CutPilot project.", {
  projectPath: z.string(),
}, async ({ projectPath }) => ({ content: [{ type: "text", text: JSON.stringify({ snapshots: listSnapshots(projectPath) }, null, 2) }] }));

server.tool("restore_project_snapshot", "Restore a snapshot while automatically preserving the current state as a safety snapshot.", {
  projectPath: z.string(), snapshotId: z.string(),
}, async ({ projectPath, snapshotId }) => ({ content: [{ type: "text", text: JSON.stringify(restoreSnapshot(projectPath, snapshotId), null, 2) }] }));

server.tool("editor_history_status", "Inspect the persistent 100-step automatic undo/redo journal for a CutPilot project.", { projectPath: z.string() }, async ({ projectPath }) => ({ content: [{ type: "text", text: JSON.stringify(editorHistoryStatus(projectPath), null, 2) }] }));
server.tool("undo_project", "Undo the most recent saved project edit and make it available for redo.", { projectPath: z.string() }, async ({ projectPath }) => { const result = undoProject(projectPath), validation = validateProject(result.project); if (!validation.valid) throw new Error(validation.errors.join("\n")); return { content: [{ type: "text", text: JSON.stringify({ ...result, validation }, null, 2) }] }; });
server.tool("redo_project", "Redo the most recently undone project edit.", { projectPath: z.string() }, async ({ projectPath }) => { const result = redoProject(projectPath), validation = validateProject(result.project); if (!validation.valid) throw new Error(validation.errors.join("\n")); return { content: [{ type: "text", text: JSON.stringify({ ...result, validation }, null, 2) }] }; });

server.tool("list_asset_library", "Search and filter the local asset library by text, type, bin, online/missing state, or generated provenance.", { projectPath: z.string(), query: z.string().default(""), type: z.enum(["video", "audio", "image", "motion-graphic"]).optional(), binId: z.string().nullable().optional(), status: z.enum(["online", "missing"]).optional(), generated: z.boolean().optional() }, async ({ projectPath, ...filter }) => { const { project } = loadProject(projectPath); return { content: [{ type: "text", text: JSON.stringify(listAssetLibrary(project, filter), null, 2) }] }; });
server.tool("create_asset_bin", "Create a local asset-library bin, optionally nested inside another bin.", { projectPath: z.string(), name: z.string(), parentId: z.string().nullable().default(null) }, async ({ projectPath, name, parentId }) => { const { project } = loadProject(projectPath), bin = createBin(project, { name, parentId }); saveProject(projectPath, project); return { content: [{ type: "text", text: JSON.stringify(bin, null, 2) }] }; });
server.tool("rename_asset_bin", "Rename an asset-library bin.", { projectPath: z.string(), binId: z.string(), name: z.string() }, async ({ projectPath, binId, name }) => { const { project } = loadProject(projectPath), bin = renameBin(project, binId, name); saveProject(projectPath, project); return { content: [{ type: "text", text: JSON.stringify(bin, null, 2) }] }; });
server.tool("move_asset_bin", "Move an asset bin to the root or another parent while preventing hierarchy cycles.", { projectPath: z.string(), binId: z.string(), parentId: z.string().nullable().default(null) }, async ({ projectPath, binId, parentId }) => { const { project } = loadProject(projectPath), bin = moveBin(project, binId, parentId); saveProject(projectPath, project); return { content: [{ type: "text", text: JSON.stringify(bin, null, 2) }] }; });
server.tool("delete_asset_bin", "Delete a bin without deleting media; child bins and assets move to its parent.", { projectPath: z.string(), binId: z.string() }, async ({ projectPath, binId }) => { const { project } = loadProject(projectPath), result = deleteBin(project, binId); saveProject(projectPath, project); return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] }; });
server.tool("assign_assets_to_bin", "Move one or more project assets into a bin or back to the unfiled root.", { projectPath: z.string(), assetIds: z.array(z.string()).min(1), binId: z.string().nullable().default(null) }, async ({ projectPath, assetIds, binId }) => { const { project } = loadProject(projectPath), assets = assignAssetsToBin(project, assetIds, binId); saveProject(projectPath, project); return { content: [{ type: "text", text: JSON.stringify({ assets: assets.map(({ id, name, binId: assignedBinId }) => ({ id, name, binId: assignedBinId || null })) }, null, 2) }] }; });
server.tool("update_asset_metadata", "Rename a project asset or update searchable local tags without changing the source file.", { projectPath: z.string(), assetId: z.string(), name: z.string().optional(), tags: z.array(z.string()).optional() }, async ({ projectPath, assetId, name, tags }) => { const { project } = loadProject(projectPath), asset = updateAssetMetadata(project, assetId, { name, tags }); saveProject(projectPath, project); return { content: [{ type: "text", text: JSON.stringify(asset, null, 2) }] }; });
server.tool("scan_missing_assets", "Find offline project media and report every timeline item that depends on it.", { projectPath: z.string() }, async ({ projectPath }) => { const { project } = loadProject(projectPath); return { content: [{ type: "text", text: JSON.stringify({ missing: scanMissingAssets(project) }, null, 2) }] }; });
server.tool("relink_asset", "Safely replace one asset's missing or moved local path while preserving its ID, transcript, annotations, bins, provenance, and timeline references.", { projectPath: z.string(), assetId: z.string(), newPath: z.string(), allowTypeChange: z.boolean().default(false) }, async ({ projectPath, assetId, newPath, allowTypeChange }) => { const { project } = loadProject(projectPath), result = relinkAsset(project, assetId, newPath, { allowTypeChange }), validation = validateProject(project); if (!validation.valid) throw new Error(validation.errors.join("\n")); saveProject(projectPath, project); return { content: [{ type: "text", text: JSON.stringify({ ...result, validation }, null, 2) }] }; });
server.tool("relink_missing_from_folder", "Recursively relink missing assets by exact case-insensitive filename, reporting ambiguous and unmatched files without guessing.", { projectPath: z.string(), folder: z.string() }, async ({ projectPath, folder }) => { const { project } = loadProject(projectPath), result = relinkMissingFromFolder(project, folder), validation = validateProject(project); if (!validation.valid) throw new Error(validation.errors.join("\n")); saveProject(projectPath, project); return { content: [{ type: "text", text: JSON.stringify({ ...result, validation }, null, 2) }] }; });

server.tool("import_assets", "Register local media files as reusable project assets without uploading them.", {
  projectPath: z.string(),
  paths: z.array(z.string()).min(1),
  binId: z.string().nullable().default(null),
  tags: z.array(z.string()).default([]),
}, async ({ projectPath, paths, binId, tags }) => {
  const { project } = loadProject(projectPath);
  const imported = [];
  for (const input of paths) {
    const path = resolve(input);
    if (!existsSync(path)) throw new Error(`Asset not found: ${path}`);
    imported.push(registerAsset(project, path, { binId, tags }));
  }
  if (binId !== null) assignAssetsToBin(project, imported.map((asset) => asset.id), binId);
  if (tags.length) imported.forEach((asset) => updateAssetMetadata(project, asset.id, { tags: [...new Set([...(asset.tags || []), ...tags])] }));
  const validation = validateProject(project); if (!validation.valid) throw new Error(validation.errors.join("\n"));
  saveProject(projectPath, project);
  return { content: [{ type: "text", text: JSON.stringify({ imported }, null, 2) }] };
});

server.tool("annotate_assets", "Store Codex-authored visual descriptions and tags after contact-sheet inspection.", {
  projectPath: z.string(),
  annotations: z.array(z.object({ assetId: z.string(), description: z.string(), tags: z.array(z.string()).default([]), people: z.array(z.string()).default([]), actions: z.array(z.string()).default([]), locations: z.array(z.string()).default([]), quality: z.number().min(0).max(1).default(0.7), motion: z.number().min(0).max(1).default(0.5) })).min(1),
}, async ({ projectPath, annotations }) => {
  const { project } = loadProject(projectPath);
  const updated = [];
  for (const annotation of annotations) {
    const asset = project.assets.find((entry) => entry.id === annotation.assetId);
    if (!asset) throw new Error(`Asset not found: ${annotation.assetId}`);
    asset.annotation = { ...annotation, assetId: undefined, updatedAt: new Date().toISOString() };
    delete asset.annotation.assetId;
    updated.push({ assetId: asset.id, name: asset.name, annotation: asset.annotation });
  }
  project.history.push({ at: new Date().toISOString(), action: "annotate_assets", assets: updated.length });
  saveProject(projectPath, project);
  return { content: [{ type: "text", text: JSON.stringify({ updated }, null, 2) }] };
});

server.tool("rank_assets_for_narration", "Rank annotated footage for a narration phrase while penalizing repeated shots.", {
  projectPath: z.string(), query: z.string(), limit: z.number().int().min(1).max(30).default(10), avoidAssetIds: z.array(z.string()).default([]),
}, async ({ projectPath, query, limit, avoidAssetIds }) => {
  const { project } = loadProject(projectPath);
  return { content: [{ type: "text", text: JSON.stringify({ query, results: rankAssets(project.assets.filter((asset) => asset.type === "video"), query, { limit, avoidAssetIds }) }, null, 2) }] };
});

const animationSchema = z.object({
  enter: z.enum(["none", "fade", "slide-left", "slide-right", "slide-up", "slide-down"]).default("none"),
  exit: z.enum(["none", "fade", "slide-left", "slide-right", "slide-up", "slide-down"]).default("none"),
  enterDuration: z.number().min(0.05).max(5).default(0.35), exitDuration: z.number().min(0.05).max(5).default(0.3), distance: z.number().min(1).max(4000).default(120), float: z.boolean().default(false), floatAmplitude: z.number().min(-500).max(500).default(8), floatFrequency: z.number().min(0.05).max(10).default(0.6),
});
const keyframeSchema = z.object({ time: z.number().min(0), x: z.number().optional(), y: z.number().optional(), scale: z.number().positive().optional(), rotation: z.number().min(-3600).max(3600).optional(), opacity: z.number().min(0).max(1).optional(), easing: z.enum(["linear", "ease-in", "ease-out", "ease-in-out", "hold", "bezier"]).default("linear"), bezier: z.object({ y1: z.number(), y2: z.number() }).optional() });
const transformSchema = z.object({ x: z.number().optional(), y: z.number().optional(), width: z.number().positive().optional(), height: z.number().positive().optional(), rotation: z.number().min(-360).max(360).default(0), fit: z.enum(["cover", "contain"]).default("cover"), animation: animationSchema.optional(), keyframes: z.array(keyframeSchema).max(100).optional() });

server.tool("edit_timeline", "Atomically add, update, or delete timeline items on one track.", {
  projectPath: z.string(),
  timelineId: z.string().optional(),
  trackName: z.string().describe("Track alias such as V1, V2, A1"),
  adds: z.array(z.object({ assetId: z.string(), start: z.number().min(0), duration: z.number().positive(), sourceStart: z.number().min(0).default(0), label: z.string().optional(), volumeDb: z.number().default(0), opacity: z.number().min(0).max(1).default(1), fadeIn: z.number().min(0).default(0), fadeOut: z.number().min(0).default(0), audioFadeIn: z.number().min(0).default(0), audioFadeOut: z.number().min(0).default(0), transform: transformSchema.optional() })).default([]),
  updates: z.array(z.object({ id: z.string(), start: z.number().min(0).optional(), duration: z.number().positive().optional(), sourceStart: z.number().min(0).optional(), label: z.string().optional(), volumeDb: z.number().optional(), opacity: z.number().min(0).max(1).optional(), fadeIn: z.number().min(0).optional(), fadeOut: z.number().min(0).optional(), audioFadeIn: z.number().min(0).optional(), audioFadeOut: z.number().min(0).optional(), transform: transformSchema.optional() })).default([]),
  deletes: z.array(z.string()).default([]),
}, async ({ projectPath, timelineId, trackName, adds, updates, deletes }) => {
  const { project } = loadProject(projectPath);
  const result = applyTimelineEdit(project, { timelineId, trackName, adds, updates, deletes });
  saveProject(projectPath, project);
  return { content: [{ type: "text", text: JSON.stringify({ track: result.track, duration: projectDuration(result.timeline), validation: result.validation }, null, 2) }] };
});

server.tool("create_track", "Create an explicitly named video or audio track at a type-relative stack position.", { projectPath: z.string(), type: z.enum(["video", "audio"]), name: z.string().optional(), position: z.number().int().nonnegative().optional() }, async ({ projectPath, ...options }) => { const { project } = loadProject(projectPath), result = createTrack(project, options); saveProject(projectPath, project); return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] }; });
server.tool("rename_track", "Rename a timeline track while preserving its stable ID and items.", { projectPath: z.string(), trackIdOrName: z.string(), name: z.string() }, async ({ projectPath, trackIdOrName, name }) => { const { project } = loadProject(projectPath), result = renameTrack(project, trackIdOrName, name); saveProject(projectPath, project); return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] }; });
server.tool("reorder_track", "Move a video or audio track to a zero-based position within its media-type stack.", { projectPath: z.string(), trackIdOrName: z.string(), position: z.number().int().nonnegative() }, async ({ projectPath, trackIdOrName, position }) => { const { project } = loadProject(projectPath), result = reorderTrack(project, trackIdOrName, position); saveProject(projectPath, project); return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] }; });
server.tool("delete_track", "Delete an extra track, optionally deleting its clips or moving them to a non-overlapping same-type destination.", { projectPath: z.string(), trackIdOrName: z.string(), deleteItems: z.boolean().default(false), destinationTrackId: z.string().optional() }, async ({ projectPath, trackIdOrName, deleteItems, destinationTrackId }) => { const { project } = loadProject(projectPath), result = deleteTrack(project, trackIdOrName, { deleteItems, destinationTrackId }); saveProject(projectPath, project); return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] }; });
server.tool("set_timeline_snapping", "Enable/disable timeline snapping and set its tolerance in frames.", { projectPath: z.string(), enabled: z.boolean().optional(), toleranceFrames: z.number().min(0).max(30).optional() }, async ({ projectPath, enabled, toleranceFrames }) => { const { project } = loadProject(projectPath), result = setSnapping(project, { enabled, toleranceFrames }); saveProject(projectPath, project); return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] }; });
server.tool("snap_timeline_time", "Resolve a proposed timeline time against clip edges, markers, In/Out, playhead, and timeline start without editing.", { projectPath: z.string(), time: z.number().nonnegative(), excludeItemId: z.string().optional(), playhead: z.number().nonnegative().optional(), toleranceFrames: z.number().min(0).max(30).optional() }, async ({ projectPath, time, ...options }) => { const { project } = loadProject(projectPath); return { content: [{ type: "text", text: JSON.stringify(snapTimelineTime(activeTimeline(project), time, options), null, 2) }] }; });
server.tool("move_item", "Move one clip with optional deterministic snapping and overlap validation.", { projectPath: z.string(), itemId: z.string(), start: z.number().nonnegative(), snap: z.boolean().default(true), playhead: z.number().nonnegative().optional(), toleranceFrames: z.number().min(0).max(30).optional() }, async ({ projectPath, itemId, start, ...options }) => { const { project } = loadProject(projectPath), result = moveItem(project, itemId, start, options); saveProject(projectPath, project); return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] }; });

server.tool("edit_item_transform", "Set an item's editable position, size, rotation, fit, and entrance/exit/float animation.", {
  projectPath: z.string(), itemId: z.string(), transform: transformSchema,
}, async ({ projectPath, itemId, transform }) => {
  const { project } = loadProject(projectPath);
  const item = activeTimeline(project).tracks.flatMap((track) => track.items).find((entry) => entry.id === itemId);
  if (!item) throw new Error(`Item not found: ${itemId}`);
  item.transform = transform;
  project.history.push({ at: new Date().toISOString(), action: "edit_item_transform", itemId, transform });
  saveProject(projectPath, project);
  return { content: [{ type: "text", text: JSON.stringify({ itemId, transform }, null, 2) }] };
});
server.tool("analyze_item_reframe", "Locally analyze a video clip's saliency and motion into a non-mutating, reviewable focus trajectory for a target canvas.", { projectPath: z.string(), itemId: z.string(), targetWidth: z.number().int().min(64).max(8192).optional(), targetHeight: z.number().int().min(64).max(8192).optional(), sampleFps: z.number().min(1).max(15).default(4), analysisWidth: z.number().int().min(64).max(640).default(160), smoothing: z.number().min(0).max(.98).default(.72), keyframeInterval: z.number().min(.1).max(10).default(.5) }, async ({ projectPath, itemId, ...options }) => { const { project } = loadProject(projectPath), timeline = activeTimeline(project), item = timeline.tracks.flatMap((track) => track.items).find((entry) => entry.id === itemId), asset = project.assets.find((entry) => entry.id === item?.assetId); if (!item || !asset) throw new Error(`Timeline item not found: ${itemId}`); const sourceSpan = playbackSourceSpan(item), plan = analyzeSmartReframe(asset, { ...options, targetWidth: options.targetWidth || timeline.width, targetHeight: options.targetHeight || timeline.height, sourceStart: item.sourceStart, sourceEnd: item.sourceStart + sourceSpan }); if (Math.abs(plan.sourceDuration - item.duration) > .0001) plan.keyframes = plan.keyframes.map((keyframe) => ({ ...keyframe, time: Number((keyframe.time / plan.sourceDuration * item.duration).toFixed(4)) })); plan.itemId = itemId; plan.timelineDuration = item.duration; return { content: [{ type: "text", text: JSON.stringify(plan, null, 2) }] }; });
const reframeKeyframeSchema = z.object({ time: z.number().nonnegative(), focusX: z.number().min(0).max(1), focusY: z.number().min(0).max(1), confidence: z.number().min(0).max(1).optional() });
server.tool("apply_item_reframe", "Apply a reviewed automatic or manually edited focus trajectory to a video clip as dynamic crop keyframes.", { projectPath: z.string(), itemId: z.string(), plan: z.object({ detector: z.string().optional(), targetWidth: z.number().positive(), targetHeight: z.number().positive(), keyframes: z.array(reframeKeyframeSchema).min(1) }) }, async ({ projectPath, itemId, plan }) => { const { project } = loadProject(projectPath), result = applySmartReframe(project, { itemId, plan }); saveProject(projectPath, project); return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] }; });
server.tool("clear_item_reframe", "Remove a clip's dynamic reframe trajectory without changing its source media or timing.", { projectPath: z.string(), itemId: z.string() }, async ({ projectPath, itemId }) => { const { project } = loadProject(projectPath), result = clearSmartReframe(project, itemId); saveProject(projectPath, project); return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] }; });

function commitTimelineOperation(projectPath, label, operation) {
  const { project } = loadProject(projectPath);
  const draft = structuredClone(project);
  const result = operation(draft);
  const snapshot = createSnapshot(projectPath, label);
  saveProject(projectPath, draft);
  return { ...result, snapshot };
}

server.tool("split_item", "Split one timeline item at an absolute timeline time while preserving source continuity and redistributing fades/keyframes.", {
  projectPath: z.string(), itemId: z.string(), splitTime: z.number().min(0),
}, async ({ projectPath, itemId, splitTime }) => ({ content: [{ type: "text", text: JSON.stringify(commitTimelineOperation(projectPath, "before-split", (project) => splitTimelineItem(project, itemId, splitTime)), null, 2) }] }));

server.tool("trim_item", "Trim an item's in/out boundary, optionally ripple-closing an out-trim on the same track.", {
  projectPath: z.string(), itemId: z.string(), newStart: z.number().min(0).optional(), newEnd: z.number().min(0).optional(), ripple: z.boolean().default(false), snap: z.boolean().default(false), playhead: z.number().min(0).optional(), toleranceFrames: z.number().min(0).max(30).optional(),
}, async ({ projectPath, itemId, newStart, newEnd, ripple, snap, playhead, toleranceFrames }) => {
  if (newStart === undefined && newEnd === undefined) throw new Error("Provide newStart or newEnd");
  return { content: [{ type: "text", text: JSON.stringify(commitTimelineOperation(projectPath, "before-trim", (project) => { const timeline = activeTimeline(project), snappedStart = snap && newStart !== undefined ? snapTimelineTime(timeline, newStart, { excludeItemId: itemId, playhead, toleranceFrames }) : null, snappedEnd = snap && newEnd !== undefined ? snapTimelineTime(timeline, newEnd, { excludeItemId: itemId, playhead, toleranceFrames }) : null; return { ...trimTimelineItem(project, itemId, { newStart: snappedStart?.time ?? newStart, newEnd: snappedEnd?.time ?? newEnd, ripple }), snap: { start: snappedStart, end: snappedEnd } }; }), null, 2) }] };
});

server.tool("ripple_delete_item", "Delete an item and close its timeline duration on its track or across all unlocked tracks/captions/markers.", {
  projectPath: z.string(), itemId: z.string(), scope: z.enum(["track", "all"]).default("all"),
}, async ({ projectPath, itemId, scope }) => ({ content: [{ type: "text", text: JSON.stringify(commitTimelineOperation(projectPath, "before-ripple-delete", (project) => rippleDeleteItem(project, itemId, scope)), null, 2) }] }));

server.tool("insert_timeline_gap", "Insert time at a timeline position on one track or all unlocked tracks, shifting captions and markers when global.", {
  projectPath: z.string(), at: z.number().min(0), duration: z.number().positive(), scope: z.enum(["track", "all"]).default("all"), trackName: z.string().optional(),
}, async ({ projectPath, at, duration, scope, trackName }) => ({ content: [{ type: "text", text: JSON.stringify(commitTimelineOperation(projectPath, "before-insert-gap", (project) => insertTimelineGap(project, at, duration, scope, trackName)), null, 2) }] }));

server.tool("razor_all_tracks", "Split every unlocked item crossing an absolute timeline time.", {
  projectPath: z.string(), at: z.number().min(0),
}, async ({ projectPath, at }) => ({ content: [{ type: "text", text: JSON.stringify(commitTimelineOperation(projectPath, "before-razor-all", (project) => razorAllTracks(project, at)), null, 2) }] }));

const effectSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("grayscale") }),
  z.object({ type: z.literal("color"), brightness: z.number().min(-1).max(1).default(0), contrast: z.number().min(0).max(3).default(1), saturation: z.number().min(0).max(3).default(1) }),
  z.object({ type: z.literal("blur"), radius: z.number().min(0).max(30).default(2) }),
  z.object({ type: z.literal("zoom"), factor: z.number().min(1).max(8).default(1.15) }),
  z.object({ type: z.literal("lut"), path: z.string() }),
  z.object({ type: z.literal("chroma-key"), color: z.string().default("#00ff00"), similarity: z.number().min(0.00001).max(1).default(0.12), blend: z.number().min(0).max(1).default(0.08) }),
  z.object({ type: z.literal("mask"), shape: z.enum(["rectangle", "ellipse"]), x: z.number(), y: z.number(), width: z.number().positive(), height: z.number().positive(), feather: z.number().min(0).default(0), invert: z.boolean().default(false) }),
  z.object({ type: z.literal("color-grade"), exposure: z.number().min(-3).max(3).default(0), contrast: z.number().min(0).max(3).default(1), saturation: z.number().min(0).max(3).default(1), temperature: z.number().min(-1).max(1).default(0), tint: z.number().min(-1).max(1).default(0), redShadows: z.number().min(-1).max(1).default(0), blueShadows: z.number().min(-1).max(1).default(0), redHighlights: z.number().min(-1).max(1).default(0), blueHighlights: z.number().min(-1).max(1).default(0), preserveLightness: z.boolean().default(true) }),
  z.object({ type: z.literal("curves"), preset: z.enum(CURVE_PRESETS) }),
  z.object({ type: z.literal("vignette"), angle: z.number().min(0).max(Math.PI / 2).default(Math.PI / 5), softness: z.number().min(0.01).max(1).default(0.5) }),
  z.object({ type: z.literal("glsl"), name: z.string().default("Custom GLSL"), source: z.string().max(20000), uniforms: z.record(z.union([z.number(), z.array(z.number()).min(2).max(4)])).default({}) }),
]);

server.tool("edit_item_effects", "Replace a video item's editable effect stack.", {
  projectPath: z.string(), itemId: z.string(), effects: z.array(effectSchema),
}, async ({ projectPath, itemId, effects }) => {
  const { project } = loadProject(projectPath);
  const item = activeTimeline(project).tracks.flatMap((track) => track.items).find((entry) => entry.id === itemId);
  if (!item) throw new Error(`Item not found: ${itemId}`);
  for (const effect of effects) if (effect.type === "glsl") { const validation = validateGlslSource(effect.source); if (!validation.valid) throw new Error(validation.errors.join("; ")); }
  item.effects = validateEffectStack(effects);
  project.history.push({ at: new Date().toISOString(), action: "edit_item_effects", itemId, effects });
  saveProject(projectPath, project);
  return { content: [{ type: "text", text: JSON.stringify({ itemId, effects }, null, 2) }] };
});

const audioEffectSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("highpass"), frequency: z.number().min(20).max(20000) }),
  z.object({ type: z.literal("lowpass"), frequency: z.number().min(20).max(20000) }),
  z.object({ type: z.literal("equalizer"), bands: z.array(z.object({ frequency: z.number().min(20).max(20000), gainDb: z.number().min(-24).max(24).default(0), q: z.number().min(0.1).max(20).default(1) })).min(1).max(12) }),
  z.object({ type: z.literal("compressor"), thresholdDb: z.number().min(-60).max(0).default(-18), ratio: z.number().min(1).max(20).default(3), attackMs: z.number().min(0.01).max(2000).default(15), releaseMs: z.number().min(0.01).max(9000).default(180), makeupDb: z.number().min(0).max(24).default(0), knee: z.number().min(1).max(8).default(2.8), mix: z.number().min(0).max(1).default(1) }),
  z.object({ type: z.literal("gate"), thresholdDb: z.number().min(-90).max(0).default(-42), reductionDb: z.number().min(-90).max(0).default(-40), ratio: z.number().min(1).max(9000).default(8), attackMs: z.number().min(0.01).max(9000).default(5), releaseMs: z.number().min(0.01).max(9000).default(180) }),
  z.object({ type: z.literal("deesser"), intensity: z.number().min(0).max(1).default(0.5), maxReduction: z.number().min(0).max(1).default(0.5), frequency: z.number().min(0).max(1).default(0.55) }),
  z.object({ type: z.literal("stereo"), balance: z.number().min(-1).max(1).default(0), width: z.number().min(-1).max(1).default(0), softClip: z.boolean().default(false), phaseLeft: z.boolean().default(false), phaseRight: z.boolean().default(false) }),
  z.object({ type: z.literal("pitch"), semitones: z.number().min(-12).max(12).default(0) }),
  z.object({ type: z.literal("limiter"), ceilingDb: z.number().min(-12).max(-0.01).default(-1) }),
]);

server.tool("edit_item_audio_effects", "Replace an audio item's ordered local EQ, dynamics, de-esser, stereo, pitch, and limiter stack.", {
  projectPath: z.string(), itemId: z.string(), audioEffects: z.array(audioEffectSchema).max(24),
}, async ({ projectPath, itemId, audioEffects }) => {
  const { project } = loadProject(projectPath), timeline = activeTimeline(project), track = timeline.tracks.find((entry) => entry.items.some((item) => item.id === itemId)), item = track?.items.find((entry) => entry.id === itemId); if (!item) throw new Error(`Item not found: ${itemId}`); if (track.type !== "audio") throw new Error("Audio effects require an audio-track item");
  createSnapshot(projectPath, "before-audio-effects-edit"); item.audioEffects = validateAudioEffectStack(audioEffects); project.history.push({ at: new Date().toISOString(), action: "edit_item_audio_effects", itemId, count: item.audioEffects.length }); saveProject(projectPath, project);
  return { content: [{ type: "text", text: JSON.stringify({ itemId, audioEffects: item.audioEffects }, null, 2) }] };
});

const speedPointSchema = z.object({ time: z.number().min(0), rate: z.number().min(0.1).max(16), easing: z.enum(["linear", "ease-in", "ease-out", "ease-in-out", "hold", "bezier"]).default("linear"), bezier: z.object({ y1: z.number(), y2: z.number() }).optional() });
server.tool("edit_item_playback", "Set constant or curve playback speed, reverse playback, or video freeze-frame behavior while preserving timeline duration.", {
  projectPath: z.string(), itemId: z.string(), playbackRate: z.number().min(0.1).max(16).default(1), speedCurve: z.array(speedPointSchema).max(64).optional(), reverse: z.boolean().default(false), freezeFrame: z.boolean().default(false),
}, async ({ projectPath, itemId, playbackRate, speedCurve, reverse, freezeFrame }) => {
  const { project } = loadProject(projectPath), timeline = activeTimeline(project), track = timeline.tracks.find((entry) => entry.items.some((item) => item.id === itemId)), item = track?.items.find((entry) => entry.id === itemId); if (!item) throw new Error(`Item not found: ${itemId}`); if (track.type === "audio" && freezeFrame) throw new Error("Audio items cannot use freeze frame");
  const normalizedCurve = validateSpeedCurve(speedCurve, item.duration); const candidate = { ...item, playbackRate, speedCurve: normalizedCurve, reverse, freezeFrame }; const sourceSpan = playbackSourceSpan(candidate);
  const asset = project.assets.find((entry) => entry.id === item.assetId), sourceEnd = item.sourceStart + sourceSpan; if (asset?.duration && sourceEnd > asset.duration + 0.05) throw new Error(`Playback needs source through ${sourceEnd.toFixed(2)}s but asset ends at ${asset.duration.toFixed(2)}s`);
  createSnapshot(projectPath, "before-playback-edit"); item.playbackRate = playbackRate; item.speedCurve = normalizedCurve; item.reverse = reverse; item.freezeFrame = freezeFrame; project.history.push({ at: new Date().toISOString(), action: "edit_item_playback", itemId, playbackRate, speedCurve: normalizedCurve, reverse, freezeFrame }); saveProject(projectPath, project);
  return { content: [{ type: "text", text: JSON.stringify({ itemId, playbackRate, speedCurve: normalizedCurve, reverse, freezeFrame, sourceSpan }, null, 2) }] };
});

server.tool("list_glsl_presets", "List built-in real WebGL fragment shader presets and editable uniforms.", {}, async () => ({ content: [{ type: "text", text: JSON.stringify({ backend: "chrome-webgl1", presets: listGlslPresets() }, null, 2) }] }));

server.tool("apply_glsl_preset", "Apply a built-in GLSL preset to a timeline item while preserving its editable source and uniforms.", {
  projectPath: z.string(), itemId: z.string(), preset: z.enum(["chromatic-pulse", "film-grain", "heat-wave", "pixel-reveal"]), uniforms: z.record(z.union([z.number(), z.array(z.number()).min(2).max(4)])).default({}),
}, async ({ projectPath, itemId, preset, uniforms }) => {
  const { project } = loadProject(projectPath), item = activeTimeline(project).tracks.flatMap((track) => track.items).find((entry) => entry.id === itemId);
  if (!item) throw new Error(`Item not found: ${itemId}`);
  const spec = GLSL_PRESETS[preset]; item.effects = (item.effects || []).filter((effect) => effect.type !== "glsl");
  item.effects.push({ type: "glsl", name: spec.name, preset, source: spec.source, uniforms: { ...spec.uniforms, ...uniforms } });
  project.history.push({ at: new Date().toISOString(), action: "apply_glsl_preset", itemId, preset }); saveProject(projectPath, project);
  return { content: [{ type: "text", text: JSON.stringify(item.effects.at(-1), null, 2) }] };
});

server.tool("set_transition", "Set fade, dip, dissolve, directional wipe, radial reveal, or directional slide transition on an item boundary.", {
  projectPath: z.string(), itemId: z.string(), edge: z.enum(["in", "out"]), type: z.enum(["fade", "dip-black", "cross-dissolve", "wipe-left", "wipe-right", "wipe-up", "wipe-down", "radial", "slide-left", "slide-right", "slide-up", "slide-down"]).default("fade"), duration: z.number().min(0.05).max(5).default(0.35),
}, async ({ projectPath, itemId, edge, type, duration }) => {
  const { project } = loadProject(projectPath);
  const item = activeTimeline(project).tracks.flatMap((track) => track.items).find((entry) => entry.id === itemId);
  if (!item) throw new Error(`Item not found: ${itemId}`);
  item[edge === "in" ? "transitionIn" : "transitionOut"] = { type, duration };
  project.history.push({ at: new Date().toISOString(), action: "set_transition", itemId, edge, type, duration });
  saveProject(projectPath, project);
  return { content: [{ type: "text", text: JSON.stringify({ itemId, edge, transition: item[edge === "in" ? "transitionIn" : "transitionOut"] }, null, 2) }] };
});

const itemKeyframeSchema = z.object({
  time: z.number().min(0), x: z.number().optional(), y: z.number().optional(), scale: z.number().positive().optional(), rotation: z.number().optional(), opacity: z.number().min(0).max(1).optional(),
  easing: z.enum(["linear", "ease-in", "ease-out", "ease-in-out", "hold", "bezier"]).default("linear"),
  bezier: z.object({ y1: z.number(), y2: z.number() }).optional(),
});

server.tool("edit_item_keyframes", "Set editable x, y, scale, rotation, and opacity keyframes with segment easing curves.", {
  projectPath: z.string(), itemId: z.string(), keyframes: z.array(itemKeyframeSchema),
}, async ({ projectPath, itemId, keyframes }) => {
  const { project } = loadProject(projectPath);
  const item = activeTimeline(project).tracks.flatMap((track) => track.items).find((entry) => entry.id === itemId);
  if (!item) throw new Error(`Item not found: ${itemId}`);
  if (keyframes.some((entry) => entry.time > item.duration)) throw new Error("Keyframe time must be within the clip duration");
  item.transform ||= {};
  item.transform.keyframes = [...keyframes].sort((a, b) => a.time - b.time);
  project.history.push({ at: new Date().toISOString(), action: "edit_item_keyframes", itemId, count: keyframes.length });
  saveProject(projectPath, project);
  return { content: [{ type: "text", text: JSON.stringify({ itemId, keyframes: item.transform.keyframes }, null, 2) }] };
});

server.tool("create_motion_graphic", "Create an editable raster-backed Motion Graphic asset for title, lower-third, or info-card overlays.", {
  projectPath: z.string(), kind: z.enum(["title", "lower-third", "info-card"]), title: z.string(), subtitle: z.string().default(""), accentColor: z.string().default("#ff6b35"), textColor: z.string().default("#ffffff"), bgColor: z.string().default("#111827"), transparentBackground: z.boolean().default(true), name: z.string().optional(), width: z.number().int().positive().optional(), height: z.number().int().positive().optional(),
}, async (spec) => {
  const { project } = loadProject(spec.projectPath);
  const timeline = activeTimeline(project);
  const id = randomUUID();
  const folder = join(resolve(spec.projectPath, ".."), "mycut-assets");
  const path = join(folder, `${id}.png`);
  const defaultWidth = spec.kind === "lower-third" ? Math.round(timeline.width * 0.82) : timeline.width;
  const defaultHeight = spec.kind === "lower-third" ? Math.round(timeline.height * 0.16) : spec.kind === "info-card" ? Math.round(timeline.height * 0.45) : timeline.height;
  const mgSpec = { ...spec, projectPath: undefined, width: spec.width || defaultWidth, height: spec.height || defaultHeight };
  delete mgSpec.projectPath;
  renderMotionGraphic(mgSpec, path);
  const asset = { id, path, name: spec.name || `${spec.kind}-${spec.title}.png`, type: "motion-graphic", duration: null, width: mgSpec.width, height: mgSpec.height, motionGraphic: mgSpec };
  project.assets.push(asset);
  project.history.push({ at: new Date().toISOString(), action: "create_motion_graphic", assetId: id, kind: spec.kind });
  saveProject(spec.projectPath, project);
  return { content: [{ type: "text", text: JSON.stringify(asset, null, 2) }] };
});

server.tool("update_motion_graphic", "Patch Motion Graphic text/colors and regenerate its local visual asset.", {
  projectPath: z.string(), assetId: z.string(), title: z.string().optional(), subtitle: z.string().optional(), accentColor: z.string().optional(), textColor: z.string().optional(), bgColor: z.string().optional(), transparentBackground: z.boolean().optional(),
}, async ({ projectPath, assetId, ...patch }) => {
  const { project } = loadProject(projectPath);
  const asset = project.assets.find((entry) => entry.id === assetId && entry.type === "motion-graphic");
  if (!asset) throw new Error(`Motion Graphic not found: ${assetId}`);
  Object.entries(patch).forEach(([key, value]) => { if (value !== undefined) asset.motionGraphic[key] = value; });
  renderMotionGraphic(asset.motionGraphic, asset.path);
  project.history.push({ at: new Date().toISOString(), action: "update_motion_graphic", assetId, patch });
  saveProject(projectPath, project);
  return { content: [{ type: "text", text: JSON.stringify(asset, null, 2) }] };
});

const svgPropertySchema = z.object({ key: z.string().regex(/^[a-zA-Z][\w.-]*$/), label: z.string(), type: z.enum(["text", "number", "color", "boolean"]), defaultValue: z.union([z.string(), z.number(), z.boolean()]) });

server.tool("create_motion_graphic_from_svg", "Create a direct-authored, property-driven SVG Motion Graphic with local safe rasterization.", {
  projectPath: z.string(), name: z.string().min(1), description: z.string().default(""), source: z.string().min(20), width: z.number().int().positive(), height: z.number().int().positive(), properties: z.array(svgPropertySchema).default([]), values: z.record(z.union([z.string(), z.number(), z.boolean()])).default({}),
}, async ({ projectPath, name, description, source, width, height, properties, values }) => {
  const { project } = loadProject(projectPath);
  const validation = validateSvgSource(source);
  if (!validation.valid) throw new Error(validation.errors.join("\n"));
  const id = randomUUID();
  const folder = join(resolve(projectPath, ".."), "mycut-assets", "motion-graphics");
  const sourcePath = join(folder, `${id}.svg`), outputPath = join(folder, `${id}.png`);
  renderSvgMotionGraphic({ source, properties, values, width, height, sourcePath, outputPath });
  const asset = { id, path: outputPath, sourcePath, name, description, type: "motion-graphic", duration: null, width, height, motionGraphic: { engine: "svg", source, properties, values } };
  project.assets.push(asset);
  project.history.push({ at: new Date().toISOString(), action: "create_motion_graphic_from_svg", assetId: id });
  saveProject(projectPath, project);
  return { content: [{ type: "text", text: JSON.stringify(asset, null, 2) }] };
});

server.tool("update_svg_motion_graphic", "Patch SVG Motion Graphic source or editable property values and regenerate it.", {
  projectPath: z.string(), assetId: z.string(), source: z.string().min(20).optional(), values: z.record(z.union([z.string(), z.number(), z.boolean()])).optional(),
}, async ({ projectPath, assetId, source, values }) => {
  const { project } = loadProject(projectPath);
  const asset = project.assets.find((entry) => entry.id === assetId && entry.motionGraphic?.engine === "svg");
  if (!asset) throw new Error(`SVG Motion Graphic not found: ${assetId}`);
  if (source !== undefined) asset.motionGraphic.source = source;
  if (values) asset.motionGraphic.values = { ...asset.motionGraphic.values, ...values };
  renderSvgMotionGraphic({ source: asset.motionGraphic.source, properties: asset.motionGraphic.properties, values: asset.motionGraphic.values, width: asset.width, height: asset.height, sourcePath: asset.sourcePath, outputPath: asset.path });
  project.history.push({ at: new Date().toISOString(), action: "update_svg_motion_graphic", assetId, values: Object.keys(values || {}) });
  saveProject(projectPath, project);
  return { content: [{ type: "text", text: JSON.stringify(asset, null, 2) }] };
});

server.tool("create_jsx_motion_graphic", "Create a transparent, frame-driven JSX/React Motion Graphic and retain editable component source and props.", {
  projectPath: z.string(), name: z.string().min(1), source: z.string().min(20).max(30000), props: z.record(z.unknown()).default({}), width: z.number().int().positive(), height: z.number().int().positive(), fps: z.number().int().min(1).max(60), duration: z.number().positive().max(60),
}, async ({ projectPath, name, source, props, width, height, fps, duration }) => {
  const check = validateJsxMotionSource(source); if (!check.valid) throw new Error(check.errors.join("; "));
  const { project } = loadProject(projectPath), id = randomUUID(), folder = join(resolve(projectPath, ".."), "mycut-assets", "motion-graphics"), path = join(folder, `${id}.mov`);
  const motionGraphic = { engine: "jsx-react", source, props, width, height, fps, duration }; renderJsxMotionGraphic({ ...motionGraphic, outputPath: path });
  const asset = { id, path, name, type: "motion-graphic", duration, width, height, motionGraphic }; project.assets.push(asset); project.history.push({ at: new Date().toISOString(), action: "create_jsx_motion_graphic", assetId: id }); saveProject(projectPath, project);
  return { content: [{ type: "text", text: JSON.stringify(asset, null, 2) }] };
});

server.tool("update_jsx_motion_graphic", "Update JSX/React Motion Graphic source or props and regenerate its transparent animation.", {
  projectPath: z.string(), assetId: z.string(), source: z.string().min(20).max(30000).optional(), props: z.record(z.unknown()).optional(),
}, async ({ projectPath, assetId, source, props }) => {
  const { project } = loadProject(projectPath), asset = project.assets.find((entry) => entry.id === assetId && entry.motionGraphic?.engine === "jsx-react"); if (!asset) throw new Error(`JSX Motion Graphic not found: ${assetId}`);
  if (source !== undefined) { const check = validateJsxMotionSource(source); if (!check.valid) throw new Error(check.errors.join("; ")); asset.motionGraphic.source = source; }
  if (props !== undefined) asset.motionGraphic.props = props; renderJsxMotionGraphic({ ...asset.motionGraphic, outputPath: asset.path }); project.history.push({ at: new Date().toISOString(), action: "update_jsx_motion_graphic", assetId }); saveProject(projectPath, project);
  return { content: [{ type: "text", text: JSON.stringify(asset, null, 2) }] };
});

server.tool("generate_voiceover", "Generate a private local macOS voiceover and register it as an editable project asset.", {
  projectPath: z.string(), text: z.string().min(1), voice: z.string().optional(), rate: z.number().int().min(80).max(500).default(180), name: z.string().default("generated-voiceover.wav"), provider: z.literal("macos-say").default("macos-say"),
}, async ({ projectPath, text, voice, rate, name, provider }) => {
  const { project } = loadProject(projectPath);
  const folder = join(resolve(projectPath, ".."), "mycut-assets");
  const path = join(folder, `${randomUUID()}-${name.replace(/[^\w.\-\u4e00-\u9fff]+/g, "-")}`);
  generateLocalVoice({ text, outputPath: path, voice, rate });
  const asset = registerAsset(project, path, { generated: { kind: "voice", provider, prompt: text, voice: voice || null, rate, createdAt: new Date().toISOString() } });
  project.history.push({ at: new Date().toISOString(), action: "generate_voiceover", assetId: asset.id, provider });
  saveProject(projectPath, project);
  return { content: [{ type: "text", text: JSON.stringify(asset, null, 2) }] };
});

server.tool("register_generated_asset", "Register externally generated video, image, music, voice, or sound effects with provenance metadata.", {
  projectPath: z.string(), path: z.string(), kind: z.enum(["video", "image", "music", "voice", "sound-effect"]), provider: z.string(), prompt: z.string().default(""), model: z.string().optional(), metadata: z.record(z.unknown()).default({}),
}, async ({ projectPath, path, kind, provider, prompt, model, metadata }) => {
  const { project } = loadProject(projectPath);
  const type = kind === "video" ? "video" : kind === "image" ? "image" : "audio";
  const asset = registerAsset(project, path, { type, generated: { kind, provider, prompt, model: model || null, metadata, createdAt: new Date().toISOString() } });
  project.history.push({ at: new Date().toISOString(), action: "register_generated_asset", assetId: asset.id, kind, provider });
  saveProject(projectPath, project);
  return { content: [{ type: "text", text: JSON.stringify(asset, null, 2) }] };
});

server.tool("submit_generation", "Submit a persistent image/video/music/SFX job through offline fixtures, OpenAI image, generic HTTP, or configured Seedance/Kling/Mureka/SFX bridges.", {
  projectPath: z.string(), kind: z.enum(["image", "video", "music", "sound-effect"]), provider: z.enum(["local-procedural", "openai-image", "http", "seedance", "kling", "mureka", "sound-effect"]), model: z.string().optional(), prompt: z.string().min(1), name: z.string().min(1), parameters: z.record(z.unknown()).default({}),
}, async ({ projectPath, ...spec }) => {
  loadProject(projectPath);
  if (spec.provider === "openai-image" && spec.kind !== "image") throw new Error("openai-image only supports image jobs");
  if (["seedance", "kling"].includes(spec.provider) && spec.kind !== "video") throw new Error(`${spec.provider} only supports video jobs`);
  if (spec.provider === "mureka" && spec.kind !== "music") throw new Error("mureka only supports music jobs");
  if (spec.provider === "sound-effect" && spec.kind !== "sound-effect") throw new Error("sound-effect provider only supports sound-effect jobs");
  const job = await submitGeneration(projectPath, spec);
  return { content: [{ type: "text", text: JSON.stringify(job, null, 2) }] };
});
server.tool("inspect_generation_providers", "Report which local and remote image, video, voice, music, and sound-effect generation providers are actually ready, and which environment settings are still absent.", {}, async()=>({content:[{type:"text",text:JSON.stringify(inspectGenerationProviders(),null,2)}]}));

server.tool("track_generation", "Refresh a generation job or materialize its completed output into the CutPilot asset library.", {
  projectPath: z.string(), jobId: z.string(), action: z.enum(["status", "materialize"]).default("status"),
}, async ({ projectPath, jobId, action }) => {
  let job = action === "status" ? await refreshGenerationJob(projectPath, jobId) : readGenerationJob(projectPath, jobId);
  if (action === "materialize") {
    if (job.status !== "completed") job = await refreshGenerationJob(projectPath, jobId);
    if (job.status !== "completed" || !job.result?.outputPath) throw new Error(`Generation job is not complete: ${job.status}`);
    if (!job.materializedAssetId) {
      const { project } = loadProject(projectPath);
      const type = job.kind === "image" ? "image" : job.kind === "video" ? "video" : "audio";
      const asset = registerAsset(project, job.result.outputPath, { type, name: job.name, generated: { kind: job.kind, provider: job.provider, model: job.model, prompt: job.prompt, parameters: job.parameters, jobId: job.id, createdAt: job.createdAt } });
      project.history.push({ at: new Date().toISOString(), action: "materialize_generation", jobId: job.id, assetId: asset.id });
      saveProject(projectPath, project);
      job = markJobMaterialized(projectPath, job.id, asset.id);
    }
  }
  return { content: [{ type: "text", text: JSON.stringify(job, null, 2) }] };
});

server.tool("edit_track", "Configure track role, lock/mute, gain, denoise, loudness normalization, or video opacity.", {
  projectPath: z.string(), trackName: z.string(), locked: z.boolean().optional(), muted: z.boolean().optional(), role: z.enum(["anchor", "follower", "mix"]).optional(), volumeDb: z.number().min(-60).max(24).optional(), denoise: z.boolean().optional(), normalizeLufs: z.number().min(-30).max(-5).nullable().optional(), opacity: z.number().min(0).max(1).optional(),
}, async ({ projectPath, trackName, ...changes }) => {
  const { project } = loadProject(projectPath);
  const result = updateTrack(project, trackName, changes), track = result.track;
  saveProject(projectPath, project);
  return { content: [{ type: "text", text: JSON.stringify(track, null, 2) }] };
});

const cueSchema = z.object({ id: z.string().optional(), start: z.number().min(0), end: z.number().positive(), text: z.string().min(1), translation: z.string().min(1).optional(), words: z.array(z.object({ start: z.number().min(0), end: z.number().positive(), text: z.string() })).optional() });
const captionStyleSchema = z.object({ template: z.enum(["classic", "bold-box", "karaoke", "minimal"]).optional(), fontFamily: z.string().optional(), fontSize: z.number().min(12).max(240).optional(), secondaryFontSize: z.number().min(10).max(200).optional(), secondaryColor: z.string().regex(/^#[0-9a-f]{6}$/i).optional(), bilingualGap: z.number().min(0).max(100).optional(), bilingual: z.boolean().optional(), maxWidth: z.number().min(100).max(4000).optional(), color: z.string().regex(/^#[0-9a-f]{6}$/i).optional(), highlightColor: z.string().regex(/^#[0-9a-f]{6}$/i).optional(), outlineColor: z.string().regex(/^#[0-9a-f]{6}$/i).optional(), outlineWidth: z.number().min(0).max(20).optional(), backgroundColor: z.string().regex(/^#[0-9a-f]{6}$/i).optional(), backgroundOpacity: z.number().min(0).max(1).optional(), position: z.enum(["top", "center", "bottom"]).optional(), margin: z.number().min(0).max(1000).optional(), weight: z.enum(["normal", "bold"]).optional(), karaoke: z.boolean().optional(), uppercase: z.boolean().optional(), shadow: z.boolean().optional() });

server.tool("set_captions", "Enable or replace timeline captions from timestamped transcript cues.", {
  projectPath: z.string(),
  cues: z.array(cueSchema),
  enabled: z.boolean().default(true),
  style: captionStyleSchema.default({}),
}, async ({ projectPath, cues, enabled, style }) => {
  const { project } = loadProject(projectPath);
  for (let i = 0; i < cues.length; i++) {
    if (cues[i].end <= cues[i].start) throw new Error(`Caption ${i + 1} ends before it starts`);
    if (i && cues[i].start < cues[i - 1].end) throw new Error(`Caption overlap at ${i + 1}`);
  }
  const timeline = activeTimeline(project);
  timeline.captions = { enabled, cues, style };
  project.history.push({ at: new Date().toISOString(), action: "set_captions", cues: cues.length });
  saveProject(projectPath, project);
  return { content: [{ type: "text", text: JSON.stringify({ enabled, cues: cues.length, duration: cues.length ? cues.at(-1).end : 0 }, null, 2) }] };
});

server.tool("list_caption_templates", "List built-in editable caption style templates, including word-level karaoke highlighting.", {}, async () => ({ content: [{ type: "text", text: JSON.stringify(CAPTION_TEMPLATES, null, 2) }] }));
server.tool("update_caption_style", "Patch the active timeline's rich caption style without replacing its cues.", { projectPath: z.string(), style: captionStyleSchema }, async ({ projectPath, style }) => { const { project } = loadProject(projectPath), timeline = activeTimeline(project); timeline.captions ||= { enabled: true, cues: [], style: {} }; timeline.captions.style = { ...(timeline.captions.style || {}), ...style }; project.history.push({ at: new Date().toISOString(), action: "update_caption_style", style }); saveProject(projectPath, project); return { content: [{ type: "text", text: JSON.stringify(timeline.captions.style, null, 2) }] }; });

server.tool("import_subtitles", "Import a local SRT, WebVTT, or ASS subtitle file into the active editable timeline.", { projectPath: z.string(), inputPath: z.string(), format: z.enum(["srt", "vtt", "ass"]).optional(), offset: z.number().min(-86400).max(86400).default(0), enabled: z.boolean().default(true), preserveStyle: z.boolean().default(true) }, async ({ projectPath, inputPath, format, offset, enabled, preserveStyle }) => { const { project } = loadProject(projectPath), timeline = activeTimeline(project), imported = importSubtitleFile(inputPath, format), cues = imported.cues.map((cue) => ({ ...cue, start: cue.start + offset, end: cue.end + offset })); if (cues.some((cue) => cue.start < 0)) throw new Error("Subtitle offset moves a cue before timeline zero"); timeline.captions = { enabled, cues, style: preserveStyle ? timeline.captions?.style || {} : {}, source: { path: imported.inputPath, format: imported.format, importedAt: new Date().toISOString(), offset } }; project.history.push({ at: new Date().toISOString(), action: "import_subtitles", format: imported.format, cues: cues.length }); saveProject(projectPath, project); return { content: [{ type: "text", text: JSON.stringify({ ...imported, cues, enabled }, null, 2) }] }; });
server.tool("set_caption_translations", "Attach one reviewed translation to every active caption cue by stable order or cue ID for bilingual rendering and export.", { projectPath: z.string(), language: z.string(), translations: z.array(z.union([z.string().min(1), z.object({ id: z.string().optional(), text: z.string().min(1) })])).min(1), mode: z.enum(["replace", "append"]).default("replace") }, async ({ projectPath, language, translations, mode }) => { const { project } = loadProject(projectPath), timeline = activeTimeline(project), result = alignCaptionTranslations(timeline.captions?.cues || [], translations, { language, mode }); timeline.captions ||= { enabled: true, cues: [], style: {} }; timeline.captions.cues = result.cues; timeline.captions.translationLanguage = result.translationLanguage; timeline.captions.style = { ...(timeline.captions.style || {}), bilingual: true }; project.history.push({ at: new Date().toISOString(), action: "set_caption_translations", language, cues: result.cues.length }); saveProject(projectPath, project); return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] }; });
server.tool("export_subtitles", "Export active timeline captions as SRT, WebVTT, ASS, or plain text, using original, translated, or bilingual text.", {
  projectPath: z.string(), outputPath: z.string(), format: z.enum(["srt", "vtt", "ass", "txt"]).default("srt"), variant: z.enum(["original", "translation", "bilingual"]).default("original"),
}, async ({ projectPath, outputPath, format, variant }) => {
  const { project } = loadProject(projectPath);
  const cues = activeTimeline(project).captions?.cues || [];
  if (!cues.length) throw new Error("No captions to export");
  const output = resolve(outputPath);
  mkdirSync(resolve(output, ".."), { recursive: true });
  const result = format === "txt" ? (writeFileSync(output, cuesToTxt(cues)), { outputPath: output, format, variant, cues: cues.length }) : exportSubtitleFile(output, cues, format, { variant, title: project.name });
  return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
});

server.tool("clean_transcript", "Mechanically remove fixed fillers and compress long gaps in timestamped cues.", {
  cues: z.array(cueSchema),
  language: z.enum(["en", "zh", "auto"]).default("auto"),
  removeFillers: z.boolean().default(true),
  maxGapSeconds: z.number().min(0).max(5).default(0.4),
}, async ({ cues, language, removeFillers, maxGapSeconds }) => {
  const fillerPattern = language === "zh" ? /(?:^|[，。！？、\s])(呃|额)(?=$|[，。！？、\s])/g : language === "en" ? /\b(um|uh|er|ah)\b[,.]?/gi : /\b(um|uh|er|ah)\b[,.]?|(?:^|[，。！？、\s])(呃|额)(?=$|[，。！？、\s])/gi;
  let removedFillers = 0;
  let compressedSeconds = 0;
  const cleaned = [];
  let cursor = 0;
  for (const cue of cues) {
    const original = cue.text;
    const text = removeFillers ? original.replace(fillerPattern, (match) => { removedFillers++; return match.match(/[，。！？、\s]/)?.[0] || ""; }).replace(/\s{2,}/g, " ").trim() : original;
    if (!text) continue;
    const originalGap = Math.max(0, cue.start - cursor);
    const keptGap = Math.min(originalGap, maxGapSeconds);
    compressedSeconds += originalGap - keptGap;
    const duration = cue.end - cue.start;
    const start = cursor + keptGap;
    const end = start + duration;
    cleaned.push({ ...cue, start, end, text });
    cursor = end;
  }
  return { content: [{ type: "text", text: JSON.stringify({ cues: cleaned, removedFillers, compressedSeconds: Number(compressedSeconds.toFixed(3)) }, null, 2) }] };
});

server.tool("render_project", "Render the active multitrack CutPilot timeline with mixed audio and optional burned captions.", {
  projectPath: z.string(), outputPath: z.string(), codec: z.enum(["h264", "vp8"]).default("h264"), crf: z.number().int().min(15).max(32).default(20), burnCaptions: z.boolean().default(false), range: z.enum(["full", "zone", "custom"]).default("full"), rangeStart: z.number().nonnegative().optional(), rangeEnd: z.number().positive().optional(), resolution: z.enum(["original", "1080p", "720p", "480p"]).default("original"), frameRate: z.number().min(24).max(60).optional(),
}, async ({ projectPath, outputPath, codec, crf, burnCaptions, range, rangeStart, rangeEnd, resolution, frameRate }) => {
  const loaded = loadProject(projectPath); let project = loaded.project, selectedRange = null; const timeline = activeTimeline(project);
  if (range !== "full") { const points = range === "zone" ? timeline.inOut : { in: rangeStart, out: rangeEnd }; if (!points || points.in === undefined || points.out === undefined) throw new Error(`${range} render requires a valid In/Out range`); const sliced = sliceProjectRange(project, points.in, points.out); project = sliced.project; selectedRange = { start: sliced.start, end: sliced.end }; }
  const exportFormat = projectForExportFormat(project, { resolution, frameRate }); project = exportFormat.project;
  const validation = validateProject(project);
  if (!validation.valid) throw new Error(validation.errors.join("\n"));
  const result = renderProject(project, outputPath, { codec, crf, burnCaptions });
  return { content: [{ type: "text", text: JSON.stringify({ ...result, range: selectedRange || "full", exportFormat: exportFormat.format, probe: probeOutput(result.outputPath), warnings: validation.warnings }, null, 2) }] };
});

server.tool("render_audio", "Render the active timeline's processed multitrack audio mix without a video stream.", {
  projectPath: z.string(), outputPath: z.string(), format: z.enum(["wav", "flac", "mp3", "m4a"]).default("wav"), range: z.enum(["full", "zone", "custom"]).default("full"), rangeStart: z.number().nonnegative().optional(), rangeEnd: z.number().positive().optional(),
}, async ({ projectPath, outputPath, format, range, rangeStart, rangeEnd }) => {
  const loaded = loadProject(projectPath); let project = loaded.project, selectedRange = null; const expectedExtension = format === "m4a" ? ".m4a" : `.${format}`; if (extname(outputPath).toLowerCase() !== expectedExtension) throw new Error(`Output path must end in ${expectedExtension}`);
  if (range !== "full") { const timeline = activeTimeline(project), points = range === "zone" ? timeline.inOut : { in: rangeStart, out: rangeEnd }; if (!points || points.in === undefined || points.out === undefined) throw new Error(`${range} render requires a valid In/Out range`); const sliced = sliceProjectRange(project, points.in, points.out); project = sliced.project; selectedRange = { start: sliced.start, end: sliced.end }; }
  const validation = validateProject(project); if (!validation.valid) throw new Error(validation.errors.join("\n"));
  const result = renderProject(project, outputPath, { audioOnly: true, audioCodec: format === "m4a" ? "aac" : format }); return { content: [{ type: "text", text: JSON.stringify({ ...result, format, range: selectedRange || "full", validation }, null, 2) }] };
});

server.tool("export_motion_graphic", "Export one editable Motion Graphic asset as a standalone transparent ProRes 4444 MOV.", { projectPath: z.string(), assetId: z.string(), outputPath: z.string(), duration: z.number().positive().optional(), fps: z.number().positive().optional() }, async ({ projectPath, assetId, outputPath, duration, fps }) => { const { project } = loadProject(projectPath), asset = project.assets.find((entry) => entry.id === assetId); if (!asset) throw new Error(`Asset not found: ${assetId}`); const result = exportMotionGraphicAsset(asset, outputPath, { duration, fps: fps || activeTimeline(project).fps }); return { content: [{ type: "text", text: JSON.stringify({ ...result, probe: probeOutput(result.outputPath) }, null, 2) }] }; });

server.tool("export_interchange", "Export the active timeline as FCPXML, Premiere xmeml XML, or CMX 3600 EDL for editable NLE handoff.", {
  projectPath: z.string(), outputPath: z.string(), format: z.enum(["fcpxml", "premiere-xml", "edl"]).default("fcpxml"),
}, async ({ projectPath, outputPath, format }) => {
  const { project } = loadProject(projectPath);
  const validation = validateProject(project);
  if (!validation.valid) throw new Error(validation.errors.join("\n"));
  const output = exportInterchange(project, outputPath, format);
  return { content: [{ type: "text", text: JSON.stringify({ outputPath: output, format, warnings: validation.warnings }, null, 2) }] };
});

server.tool("import_fcpxml", "Import a local FCPXML timeline into a new editable CutPilot project with local asset references and multitrack timing.", {
  inputPath: z.string(), outputProjectPath: z.string(), projectName: z.string().optional(),
}, async ({ inputPath, outputProjectPath, projectName }) => {
  const result = importFcpxml(inputPath, outputProjectPath, { projectName }); const validation = validateProject(result.project); if (!validation.valid) throw new Error(validation.errors.join("\n"));
  return { content: [{ type: "text", text: JSON.stringify({ projectPath: result.projectPath, project: result.project, warnings: validation.warnings }, null, 2) }] };
});

server.tool("import_premiere_xml", "Import a local Premiere xmeml XML sequence into a new editable CutPilot project with local assets, multitrack timing, source ranges, audio gain, and markers.", {
  inputPath: z.string(), outputProjectPath: z.string(), projectName: z.string().optional(),
}, async ({ inputPath, outputProjectPath, projectName }) => {
  const result = importPremiereXml(inputPath, outputProjectPath, { projectName }); const validation = validateProject(result.project); if (!validation.valid) throw new Error(validation.errors.join("\n"));
  return { content: [{ type: "text", text: JSON.stringify({ projectPath: result.projectPath, project: result.project, warnings: validation.warnings }, null, 2) }] };
});

server.tool("export_jianying_draft", "Export an experimental legacy-plaintext JianyingPro draft folder. This is version-dependent and must not be described as universally compatible.", {
  projectPath: z.string(), outputFolder: z.string(), copyMedia: z.boolean().default(true),
}, async ({ projectPath, outputFolder, copyMedia }) => { const { project } = loadProject(projectPath), result = exportJianyingDraft(project, outputFolder, { copyMedia }), validation = validateJianyingDraft(result.folder); if (!validation.valid) throw new Error(validation.errors.join("\n")); return { content: [{ type: "text", text: JSON.stringify({ ...result, validation, warning: "Experimental legacy plaintext draft; modern encrypted Jianying versions may reject or migrate it." }, null, 2) }] }; });

server.tool("validate_jianying_draft", "Validate CutPilot's experimental Jianying draft structure, references, timing, and metadata consistency without opening or modifying Jianying.", {
  folder: z.string(),
}, async ({ folder }) => ({ content: [{ type: "text", text: JSON.stringify(validateJianyingDraft(folder), null, 2) }] }));
server.tool("inspect_capcut_draft", "Inspect a CapCut/Jianying draft folder without modifying or attempting to decrypt it. Reports JSON, version, and encrypted/unsupported files honestly.", {folder:z.string()}, async({folder})=>({content:[{type:"text",text:JSON.stringify(inspectCapCutDraft(folder),null,2)}]}));
server.tool("export_capcut_editable_handoff", "Create the safest supported CapCut/Jianying continuation bundle: copied source media, UTF-8 editable SRT captions, EDL timecodes, FCPXML/Premiere XML, and a complete CutPilot timing manifest. Does not claim encrypted direct-draft compatibility.", {projectPath:z.string(),outputFolder:z.string(),copyMedia:z.boolean().default(true)}, async({projectPath,outputFolder,copyMedia})=>{const{project}=loadProject(projectPath);return{content:[{type:"text",text:JSON.stringify(exportCapCutHandoff(project,outputFolder,{copyMedia}),null,2)}]}});
server.tool("render_glsl_batch", "Render multiple validated GLSL video jobs concurrently through independent local Chrome WebGL1 workers, preserving a durable batch manifest and per-job errors.", {jobs:z.array(z.object({inputPath:z.string(),outputPath:z.string(),fragmentSource:z.string().max(20000),uniforms:z.record(z.union([z.number(),z.array(z.number()).min(2).max(4)])).default({}),width:z.number().int().positive(),height:z.number().int().positive(),fps:z.number().positive(),duration:z.number().positive(),sourceStart:z.number().nonnegative().default(0)})).min(1).max(100),concurrency:z.number().int().min(1).max(8).default(2),jobFolder:z.string().optional()}, async(options)=>({content:[{type:"text",text:JSON.stringify(await renderGlslBatch(options),null,2)}]}));

server.tool("inspect_rendered_video", "Generate a contact sheet and detect sustained black or frozen segments in a rendered video.", {
  inputPath: z.string(), contactSheetPath: z.string(), samples: z.number().int().min(4).max(36).default(12), blackMinimum: z.number().min(0.1).max(10).default(0.35), freezeMinimum: z.number().min(0.3).max(30).default(1.5),
}, async ({ inputPath, contactSheetPath, samples, blackMinimum, freezeMinimum }) => ({ content: [{ type: "text", text: JSON.stringify(inspectRenderedVideo(inputPath, contactSheetPath, { samples, blackMinimum, freezeMinimum }), null, 2) }] }));

server.tool("validate_project", "Check a project for missing assets, invalid timing, overlaps, and visible gaps.", {
  projectPath: z.string(),
}, async ({ projectPath }) => {
  const { project } = loadProject(projectPath);
  return { content: [{ type: "text", text: JSON.stringify(validateProject(project), null, 2) }] };
});

server.tool("transcription_status", "Check whether local FFmpeg, whisper.cpp, and a configured model are ready.", {
  modelPath: z.string().optional(),
}, async ({ modelPath }) => ({ content: [{ type: "text", text: JSON.stringify(transcriptionBackendStatus(modelPath), null, 2) }] }));

server.tool("download_transcription_model", "Download an official whisper.cpp GGML model into the CutPilot local cache.", {
  size: z.enum(["tiny", "base", "small"]).default("base"),
  multilingual: z.boolean().default(true),
  destinationFolder: z.string().optional(),
}, async ({ size, multilingual, destinationFolder }) => {
  if (!multilingual && size === "small") throw new Error("Use the multilingual small model; small.en is intentionally not exposed in v0.3");
  const suffix = multilingual ? size : `${size}.en`;
  const folder = destinationFolder ? resolve(destinationFolder) : join(homedir(), ".cache", "mycut", "models");
  mkdirSync(folder, { recursive: true });
  const output = join(folder, `ggml-${suffix}.bin`);
  if (!existsSync(output)) run("curl", ["-L", "--fail", "--silent", "--show-error", `https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-${suffix}.bin`, "-o", output]);
  return { content: [{ type: "text", text: JSON.stringify({ modelPath: output, ...transcriptionBackendStatus(output) }, null, 2) }] };
});

server.tool("transcribe_asset", "Transcribe a project audio/video asset locally with whisper.cpp and store word timestamps.", {
  projectPath: z.string(), assetId: z.string(), modelPath: z.string(), language: z.string().default("auto"), enableCaptions: z.boolean().default(false),
}, async ({ projectPath, assetId, modelPath, language, enableCaptions }) => {
  const { project } = loadProject(projectPath);
  const asset = project.assets.find((entry) => entry.id === assetId);
  if (!asset) throw new Error(`Asset not found: ${assetId}`);
  const transcript = transcribeLocal({ inputPath: asset.path, modelPath, language });
  asset.transcript = { language: transcript.language, text: transcript.text, cues: transcript.cues, modelPath: transcript.modelPath, createdAt: new Date().toISOString() };
  if (enableCaptions) activeTimeline(project).captions = { enabled: true, cues: transcript.cues, style: {} };
  project.history.push({ at: new Date().toISOString(), action: "transcribe_asset", assetId, cues: transcript.cues.length, language: transcript.language });
  saveProject(projectPath, project);
  return { content: [{ type: "text", text: JSON.stringify({ assetId, language: transcript.language, text: transcript.text, cues: transcript.cues, rawPath: transcript.rawPath, captionsEnabled: enableCaptions }, null, 2) }] };
});

server.tool("find_transcript_phrase", "Locate exact source-time ranges for spoken phrases using stored word timestamps.", {
  projectPath: z.string(), assetId: z.string(), phrases: z.array(z.string()).min(1),
}, async ({ projectPath, assetId, phrases }) => {
  const { project } = loadProject(projectPath);
  const asset = project.assets.find((entry) => entry.id === assetId);
  if (!asset?.transcript) throw new Error(`Transcript not found for asset ${assetId}`);
  return { content: [{ type: "text", text: JSON.stringify({ assetId, matches: findPhraseRanges(asset.transcript, phrases) }, null, 2) }] };
});

server.tool("read_transcript_edit", "Read a transcribed source as ordered editable segments for text-based video editing. Returns the current sequence when one exists.", { projectPath: z.string(), assetId: z.string().optional() }, async ({ projectPath, assetId }) => { const { project } = loadProject(projectPath); return { content: [{ type: "text", text: JSON.stringify(readTranscriptEdit(project, assetId), null, 2) }] }; });

const transcriptSegmentSchema = z.object({ id: z.string().optional(), sourceStart: z.number().nonnegative(), sourceEnd: z.number().positive(), label: z.string().optional() });
server.tool("apply_transcript_sequence", "Rebuild linked talking-head video/audio tracks and word captions from ordered source transcript segments. Reorder or omit segments to edit by text.", { projectPath: z.string(), assetId: z.string(), segments: z.array(transcriptSegmentSchema).min(1), videoTrackName: z.string().default("V1"), audioTrackName: z.string().default("A1"), includeVideo: z.boolean().default(true), includeAudio: z.boolean().default(true), gapSeconds: z.number().min(0).max(10).default(0), replaceTracks: z.boolean().default(true) }, async ({ projectPath, ...options }) => { const { project } = loadProject(projectPath), result = applyTranscriptSequence(project, options); saveProject(projectPath, project); return { content: [{ type: "text", text: JSON.stringify({ transcriptEdit: result.transcriptEdit, captions: result.captions, duration: result.duration, validation: result.validation }, null, 2) }] }; });

server.tool("apply_script_edit", "Remove spoken phrases by word timestamps and rebuild a ripple-closed speech track plus captions.", {
  projectPath: z.string(), assetId: z.string(), removePhrases: z.array(z.string()).min(1), trackName: z.string().default("A1"), updateCaptions: z.boolean().default(true),
}, async ({ projectPath, assetId, removePhrases, trackName, updateCaptions }) => {
  const { project } = loadProject(projectPath);
  const asset = project.assets.find((entry) => entry.id === assetId);
  if (!asset?.transcript) throw new Error(`Transcript not found for asset ${assetId}`);
  const edit = buildSpeechEdit(asset, asset.transcript, removePhrases);
  if (!edit.removed.length) throw new Error(`None of the requested phrases were found: ${removePhrases.join(", ")}`);
  const timeline = activeTimeline(project);
  let track = timeline.tracks.find((entry) => entry.name === trackName);
  if (!track) { track = { id: randomUUID(), name: trackName, type: "audio", role: "anchor", locked: false, muted: false, items: [] }; timeline.tracks.push(track); }
  track.items = track.items.filter((item) => item.assetId !== assetId);
  track.items.push(...edit.kept.map((segment) => ({ id: randomUUID(), assetId, start: segment.start, sourceStart: segment.sourceStart, duration: segment.duration, label: asset.name, volumeDb: 0, audioFadeIn: 0.01, audioFadeOut: 0.01 })));
  track.items.sort((a, b) => a.start - b.start);
  if (updateCaptions) timeline.captions = { ...(timeline.captions || {}), enabled: true, cues: edit.captions };
  project.history.push({ at: new Date().toISOString(), action: "apply_script_edit", assetId, removePhrases, removedRanges: edit.removed.length });
  const validation = validateProject(project);
  if (!validation.valid) throw new Error(validation.errors.join("\n"));
  saveProject(projectPath, project);
  return { content: [{ type: "text", text: JSON.stringify({ assetId, trackName, ...edit, validation }, null, 2) }] };
});

server.tool("inspect_media_folder", "Scan local media and generate contact sheets for Codex visual inspection.", {
  folder: z.string().describe("Absolute local folder containing source media"),
  intervalSeconds: z.number().min(1).max(30).default(4),
}, async ({ folder, intervalSeconds }) => {
  const root = resolve(folder);
  if (!existsSync(root) || !statSync(root).isDirectory()) throw new Error(`Folder not found: ${root}`);
  const cache = join(tmpdir(), "mycut", String(Date.now()));
  mkdirSync(cache, { recursive: true });
  const media = [];
  for (const path of walk(root)) {
    const ext = extname(path).toLowerCase();
    if (!VIDEO_EXT.has(ext) && !AUDIO_EXT.has(ext)) continue;
    const meta = ffprobe(path);
    let contactSheet = null;
    if (VIDEO_EXT.has(ext)) {
      contactSheet = join(cache, `${basename(path, ext).replace(/[^\w\u4e00-\u9fff-]+/g, "_")}.jpg`);
      run("ffmpeg", ["-y", "-hide_banner", "-loglevel", "error", "-i", path, "-vf", `fps=1/${intervalSeconds},scale=280:-1,tile=4x4`, "-frames:v", "1", contactSheet]);
    }
    media.push({ path, name: basename(path), type: VIDEO_EXT.has(ext) ? "video" : "audio", ...meta, contactSheet });
  }
  const manifestPath = join(cache, "manifest.json");
  writeFileSync(manifestPath, JSON.stringify({ folder: root, createdAt: new Date().toISOString(), media }, null, 2));
  return { content: [{ type: "text", text: JSON.stringify({ manifestPath, contactSheetFolder: cache, media }, null, 2) }] };
});

const clipSchema = z.object({
  path: z.string(), timelineStart: z.number().min(0), sourceStart: z.number().min(0), duration: z.number().positive(), label: z.string().optional(), mute: z.boolean().default(true),
});

server.tool("save_edit_plan", "Validate and save an editable CutPilot JSON project.", {
  outputPath: z.string().describe("Absolute .json output path"),
  name: z.string(), width: z.number().int().positive().default(1080), height: z.number().int().positive().default(1920), fps: z.number().positive().default(30),
  narrationPath: z.string().optional(), clips: z.array(clipSchema).min(1),
}, async (plan) => {
  const ordered = [...plan.clips].sort((a, b) => a.timelineStart - b.timelineStart);
  const errors = [];
  for (let i = 0; i < ordered.length; i++) {
    if (!existsSync(ordered[i].path)) errors.push(`Missing clip: ${ordered[i].path}`);
    if (i && ordered[i].timelineStart < ordered[i - 1].timelineStart + ordered[i - 1].duration - 0.001) errors.push(`Overlap near ${ordered[i].label || i}`);
  }
  if (plan.narrationPath && !existsSync(plan.narrationPath)) errors.push(`Missing narration: ${plan.narrationPath}`);
  if (errors.length) throw new Error(errors.join("\n"));
  const outputPath = resolve(plan.outputPath);
  mkdirSync(resolve(outputPath, ".."), { recursive: true });
  writeFileSync(outputPath, JSON.stringify({ version: 1, ...plan, clips: ordered }, null, 2));
  return { content: [{ type: "text", text: `Saved CutPilot project: ${outputPath}\nClips: ${ordered.length}\nDuration: ${Math.max(...ordered.map((c) => c.timelineStart + c.duration)).toFixed(2)}s` }] };
});

server.tool("render_edit_plan", "Render a CutPilot JSON project to a local MP4 using FFmpeg.", {
  planPath: z.string(), outputPath: z.string().describe("Absolute .mp4 output path"), crf: z.number().int().min(15).max(32).default(20),
}, async ({ planPath, outputPath, crf }) => {
  const plan = JSON.parse(readFileSync(resolve(planPath), "utf8"));
  const args = [];
  plan.clips.forEach((clip) => args.push("-ss", String(clip.sourceStart), "-t", String(clip.duration), "-i", clip.path));
  if (plan.narrationPath) args.push("-i", plan.narrationPath);
  const filters = plan.clips.map((clip, i) => `[${i}:v]scale=${plan.width}:${plan.height}:force_original_aspect_ratio=increase,crop=${plan.width}:${plan.height},fps=${plan.fps},setsar=1[v${i}]`);
  filters.push(`${plan.clips.map((_, i) => `[v${i}]`).join("")}concat=n=${plan.clips.length}:v=1:a=0[vout]`);
  const narrationIndex = plan.clips.length;
  const total = Math.max(...plan.clips.map((c) => c.timelineStart + c.duration));
  args.push("-filter_complex", filters.join(";"), "-map", "[vout]");
  if (plan.narrationPath) args.push("-map", `${narrationIndex}:a:0`, "-t", String(total), "-c:a", "aac", "-b:a", "192k");
  args.push("-c:v", "libx264", "-preset", "medium", "-crf", String(crf), "-pix_fmt", "yuv420p", "-movflags", "+faststart", "-y", resolve(outputPath));
  mkdirSync(resolve(outputPath, ".."), { recursive: true });
  run("ffmpeg", args);
  return { content: [{ type: "text", text: `Rendered: ${resolve(outputPath)}` }] };
});

await server.connect(new StdioServerTransport());
