import { randomUUID } from "node:crypto";
import { createServer } from "node:http";
import { createReadStream, existsSync, statSync } from "node:fs";
import { basename, dirname, extname, join, resolve } from "node:path";
import { activeTimeline, loadProject, projectDuration, saveProject, validateProject } from "./project-store.mjs";
import { playbackSourceSpan, validateSpeedCurve } from "./speed-curve-engine.mjs";
import { validateEffectStack } from "./visual-effects-engine.mjs";
import { validateAudioEffectStack } from "./audio-effects-engine.mjs";
import { createSnapshot } from "./version-engine.mjs";
import { renderSvgMotionGraphic } from "./svg-motion-graphics-engine.mjs";
import { reviewHtml } from "./review-ui.mjs";
import { insertTimelineGap, razorAllTracks, rippleDeleteItem, splitTimelineItem, trimTimelineItem } from "./timeline-operations-engine.mjs";
import { ensureWaveform } from "./waveform-engine.mjs";
import { validateGlslSource } from "./glsl-shader-engine.mjs";
import { renderJsxMotionGraphic, validateJsxMotionSource } from "./jsx-motion-graphics-engine.mjs";
import { activateTimeline as activateProjectTimeline, setTimelineFormat, setTimelineInOut } from "./timeline-management-engine.mjs";
import { applyTranscriptSequence } from "./transcript-edit-engine.mjs";
import { assignAssetsToBin } from "./asset-library-engine.mjs";
import { redoProject, undoProject } from "./version-engine.mjs";
import { deleteTrack, setSnapping, snapTimelineTime, updateTrack } from "./track-engine.mjs";
import { clearEditContext, readEditContext, setEditContext } from "./edit-context-engine.mjs";
import { placeAssetOnTimeline } from "./source-placement-engine.mjs";
import { moveLinkedGroup, placeLinkedAv, trimLinkedGroup, unlinkTimelineItems } from "./linked-clips-engine.mjs";
import { cancelExportJob, listExportJobs, submitExportJob } from "./export-job-engine.mjs";
import { analyzeAssetSilence, applySilenceCut } from "./silence-edit-engine.mjs";
import { analyzeAssetScenes, saveSceneSubclips } from "./scene-detection-engine.mjs";
import { analyzeAssetBeats, applyBeatMontage, buildBeatMontagePlan, saveBeatMarkers } from "./beat-edit-engine.mjs";
import { exportSubtitleFile, importSubtitleFile } from "./subtitle-engine.mjs";
import { detachVideoProxy, generateVideoProxy, proxyStatus, resolvePreviewMedia } from "./proxy-media-engine.mjs";
import { analyzeSmartReframe, applySmartReframe, clearSmartReframe } from "./smart-reframe-engine.mjs";
import { addTimelineMarker, deleteTimelineMarker, updateTimelineMarker } from "./marker-engine.mjs";
import { findDuplicateShots, removeDuplicateShots } from "./duplicate-shot-engine.mjs";
import { selectVideoType } from "./video-type-engine.mjs";
import { analyzeVlogCoverage, analyzeVlogRelease, analyzeVlogRhythm, analyzeVlogWorkflow, applyVlogBroll, applyVlogEdit, applyVlogFinishing, applyVlogReleaseFixes, applyVlogRhythm, applyVlogSound, planVlogBroll, planVlogEdit, planVlogFinishing, planVlogRhythm, planVlogSound, renderVlogTitleCards } from "./vlog-engine.mjs";
import { analyzeCategoryWorkflow, applyCategoryReleaseFixes } from "./category-workflow-engine.mjs";
import { applyTalkingHeadDirector, planTalkingHeadDirector } from "./talking-head-director-engine.mjs";
import { applyExplainerDirector, planExplainerDirector, renderExplainerInfoCards, reviewExplainerInfoCards } from "./explainer-director-engine.mjs";
import { applyProductPromoDirector, planProductPromoDirector, renderProductPromoCards, reviewProductPromoCards } from "./product-promo-director-engine.mjs";
import { applyWeddingDirector, planWeddingDirector, renderWeddingTitles, reviewWeddingTitles } from "./wedding-director-engine.mjs";
import { applyPodcastDirector, planPodcastDirector, renderPodcastTitles, reviewPodcastTitles } from "./podcast-director-engine.mjs";
import { applyMotionGraphicsDirector, planMotionGraphicsDirector, renderMotionGraphicsScenes, reviewMotionGraphicsScenes } from "./motion-graphics-director-engine.mjs";
import { auditCutPilotProject } from "./director-acceptance-engine.mjs";
import { createDeliveryVariants, submitDeliveryPack } from "./delivery-pack-engine.mjs";
import { analyzeAssetIntelligence, applyAssetIntelligence } from "./asset-intelligence-engine.mjs";
import { applyNaturalLanguageEdit, planNaturalLanguageEdit } from "./natural-language-edit-engine.mjs";
import { exportCapCutHandoff } from "./capcut-handoff-engine.mjs";
import { inspectGenerationProviders } from "./generation-job-engine.mjs";
import { buildSemanticIndex, semanticIndexStatus } from "./semantic-index-engine.mjs";
import { applyDirectorAgentPlan, planDirectorAgent } from "./director-agent-engine.mjs";
import { cancelBackgroundTask, listBackgroundTasks, retryBackgroundTask, submitBackgroundTask } from "./task-center-engine.mjs";

const sessions = new Map();
let server = null;
let port = null;
let idleCloseTimer = null;

const mime = (path) => ({ ".mp4": "video/mp4", ".webm": "video/webm", ".mov": "video/quicktime", ".mp3": "audio/mpeg", ".wav": "audio/wav", ".m4a": "audio/mp4", ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg" }[extname(path).toLowerCase()] || "application/octet-stream");
const json = (response, status, data) => { response.writeHead(status, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" }); response.end(JSON.stringify(data)); };
const body = async (request) => { let raw = ""; for await (const chunk of request) { raw += chunk; if (raw.length > 1024 * 1024) throw new Error("Request too large"); } return JSON.parse(raw || "{}"); };

function publicState(session) {
  const { project } = loadProject(session.projectPath);
  const timeline = activeTimeline(project);
  return { project: { ...project, assets: project.assets.map(({ path, sourcePath, ...asset }) => ({ ...asset, proxy: asset.proxy ? { ...asset.proxy, path: undefined, status: proxyStatus({ ...asset, path, proxy: asset.proxy }).status } : undefined, online: existsSync(path) })) }, timeline, duration: projectDuration(timeline), previewUrl: session.previewPath ? `/media?token=${session.token}&preview=1` : null, snapshots: null, editContext: readEditContext(session.projectPath), exportJobs: listExportJobs(session.projectPath).slice(0, 20), backgroundTasks: listBackgroundTasks(session.projectPath).slice(0, 20), semanticIndex: semanticIndexStatus(session.projectPath, project) };
}

function streamFile(request, response, path) {
  if (!existsSync(path)) return json(response, 404, { error: "Media not found" });
  const size = statSync(path).size;
  const range = request.headers.range;
  if (range) {
    const match = /bytes=(\d*)-(\d*)/.exec(range); const start = Number(match?.[1] || 0); const end = Math.min(size - 1, Number(match?.[2] || size - 1));
    if (!match || start < 0 || start >= size || end < start) { response.writeHead(416, { "content-range": `bytes */${size}` }); return response.end(); }
    response.writeHead(206, { "content-type": mime(path), "content-length": end - start + 1, "content-range": `bytes ${start}-${end}/${size}`, "accept-ranges": "bytes" });
    createReadStream(path, { start, end }).pipe(response);
  } else { response.writeHead(200, { "content-type": mime(path), "content-length": size, "accept-ranges": "bytes" }); createReadStream(path).pipe(response); }
}

function applyReviewEdit(session, operation) {
  if (operation.kind === "undo") { undoProject(session.projectPath); return publicState(session); }
  if (operation.kind === "redo") { redoProject(session.projectPath); return publicState(session); }
  const { project } = loadProject(session.projectPath);
  if (operation.kind === "context-add") { setEditContext(session.projectPath, project, [operation.reference], { mode: "append" }); return publicState(session); }
  if (operation.kind === "context-clear") { clearEditContext(session.projectPath); return publicState(session); }
  if (operation.kind === "asset-intelligence-analyze") { const asset=project.assets.find((entry)=>entry.id===operation.assetId);if(!asset)throw new Error(`Asset not found: ${operation.assetId}`);return{...publicState(session),assetIntelligenceAnalysis:analyzeAssetIntelligence(session.projectPath,asset,operation.options||{})}; }
  if (operation.kind === "asset-intelligence-apply") { const draft=structuredClone(project),result=applyAssetIntelligence(draft,session.projectPath,operation.analysis,operation.options||{});createSnapshot(session.projectPath,"review-asset-intelligence");saveProject(session.projectPath,draft);return{...publicState(session),appliedAssetIntelligence:result}; }
  if (operation.kind === "natural-edit-plan") { return{...publicState(session),naturalEditPlan:planNaturalLanguageEdit(project,{instruction:operation.instruction,itemIds:operation.itemIds||[],trackIds:operation.trackIds||[],scope:operation.scope||"selection"})}; }
  if (operation.kind === "natural-edit-apply") { const draft=structuredClone(project),result=applyNaturalLanguageEdit(draft,operation.plan,{approved:operation.approved===true});createSnapshot(session.projectPath,"review-natural-language-edit");saveProject(session.projectPath,draft);return{...publicState(session),appliedNaturalEdit:result}; }
  if (operation.kind === "generation-provider-status") return{...publicState(session),generationProviders:inspectGenerationProviders()};
  if (operation.kind === "semantic-index-build") return { ...publicState(session), builtSemanticIndex: buildSemanticIndex(session.projectPath, project) };
  if (operation.kind === "director-agent-plan") return { ...publicState(session), directorAgentPlan: planDirectorAgent(session.projectPath, project, operation.options || {}) };
  if (operation.kind === "director-agent-apply") { const draft = structuredClone(project), result = applyDirectorAgentPlan(draft, operation.plan, { approved: operation.approved === true, targetTrackName: operation.targetTrackName || "V2 · AI Director", replaceTargetTrack: operation.replaceTargetTrack === true }); createSnapshot(session.projectPath, "review-director-agent"); saveProject(session.projectPath, draft); return { ...publicState(session), appliedDirectorAgent: result }; }
  if (operation.kind === "background-task-submit") return { ...publicState(session), submittedBackgroundTask: submitBackgroundTask(session.projectPath, { kind: operation.taskKind, options: operation.options || {} }) };
  if (operation.kind === "background-task-cancel") return { ...publicState(session), cancelledBackgroundTask: cancelBackgroundTask(session.projectPath, operation.taskId) };
  if (operation.kind === "background-task-retry") return { ...publicState(session), retriedBackgroundTask: retryBackgroundTask(session.projectPath, operation.taskId) };
  if (operation.kind === "capcut-handoff-export") { const name=String(project.name||"cutpilot").replace(/[^\w.\-\u4e00-\u9fff]+/g,"-").slice(0,80),result=exportCapCutHandoff(project,join(dirname(session.projectPath),"exports",`${name}-capcut-handoff`),{copyMedia:true});return{...publicState(session),capcutHandoff:result}; }
  if (operation.kind === "select-video-type") { const draft = structuredClone(project), result = selectVideoType(draft, operation.typeId, operation.setup || {}); createSnapshot(session.projectPath, "review-select-video-type"); saveProject(session.projectPath, draft); return { ...publicState(session), selectedVideoType: result.videoType }; }
  if (operation.kind === "vlog-coverage") return { ...publicState(session), vlogCoverage: analyzeVlogCoverage(project) };
  if (operation.kind === "vlog-plan") { const coverage = analyzeVlogCoverage(project), plan = planVlogEdit(project, operation.options || {}); return { ...publicState(session), vlogCoverage: coverage, vlogPlan: plan }; }
  if (operation.kind === "vlog-apply") { const draft = structuredClone(project), result = applyVlogEdit(draft, operation.plan, operation.options || {}); createSnapshot(session.projectPath, "review-vlog-rough-cut"); saveProject(session.projectPath, draft); return { ...publicState(session), appliedVlogEdit: result.items.length }; }
  if (operation.kind === "vlog-broll-plan") return { ...publicState(session), vlogBrollPlan: planVlogBroll(project, operation.options || {}) };
  if (operation.kind === "vlog-broll-apply") { const draft = structuredClone(project), result = applyVlogBroll(draft, operation.plan, operation.options || {}); createSnapshot(session.projectPath, "review-vlog-broll"); saveProject(session.projectPath, draft); return { ...publicState(session), appliedVlogBroll: result.items.length, vlogBrollGaps: result.gaps }; }
  if (operation.kind === "vlog-rhythm-analyze") return { ...publicState(session), vlogRhythmAudit: analyzeVlogRhythm(project, operation.options || {}) };
  if (operation.kind === "vlog-rhythm-plan") return { ...publicState(session), vlogRhythmPlan: planVlogRhythm(project, operation.options || {}) };
  if (operation.kind === "vlog-rhythm-apply") { const draft = structuredClone(project), result = applyVlogRhythm(draft, operation.plan); createSnapshot(session.projectPath, "review-vlog-rhythm"); saveProject(session.projectPath, draft); return { ...publicState(session), appliedVlogRhythm: result.summary }; }
  if (operation.kind === "vlog-sound-plan") return { ...publicState(session), vlogSoundPlan: planVlogSound(project, operation.options || {}) };
  if (operation.kind === "vlog-sound-apply") { const draft = structuredClone(project), result = applyVlogSound(draft, operation.plan, operation.options || {}); createSnapshot(session.projectPath, "review-vlog-sound"); saveProject(session.projectPath, draft); return { ...publicState(session), appliedVlogSound: { musicItems: result.musicItems, soundItems: result.soundItems, warnings: result.warnings } }; }
  if (operation.kind === "vlog-finishing-plan") return { ...publicState(session), vlogFinishingPlan: planVlogFinishing(project, operation.options || {}) };
  if (operation.kind === "vlog-finishing-apply") { const draft = structuredClone(project), result = applyVlogFinishing(draft, operation.plan); createSnapshot(session.projectPath, "review-vlog-finishing"); saveProject(session.projectPath, draft); return { ...publicState(session), appliedVlogFinishing: { pendingTitleCards: result.pendingTitleCards.length, markers: result.markers, warnings: result.warnings } }; }
  if (operation.kind === "vlog-titles-render") { const draft = structuredClone(project); createSnapshot(session.projectPath, "review-vlog-title-render"); const result = renderVlogTitleCards(draft, session.projectPath, operation.options || {}); saveProject(session.projectPath, draft); return { ...publicState(session), renderedVlogTitles: result.rendered }; }
  if (operation.kind === "vlog-release-analyze") return { ...publicState(session), vlogReleasePreflight: analyzeVlogRelease(project, operation.options || {}) };
  if (operation.kind === "vlog-release-fix") { const draft = structuredClone(project), result = applyVlogReleaseFixes(draft, operation.preflight); createSnapshot(session.projectPath, "review-vlog-release-fixes"); saveProject(session.projectPath, draft); return { ...publicState(session), vlogReleasePreflight: result.remaining, appliedVlogReleaseFixes: result.applied }; }
  if (operation.kind === "vlog-workflow-status") return { ...publicState(session), vlogWorkflowStatus: analyzeVlogWorkflow(project) };
  if (operation.kind === "category-workflow-status") return { ...publicState(session), categoryWorkflowStatus: analyzeCategoryWorkflow(project) };
  if (operation.kind === "talking-head-plan") return { ...publicState(session), talkingHeadPlan: planTalkingHeadDirector(project,operation.options||{}) };
  if (operation.kind === "talking-head-apply") { const draft=structuredClone(project),result=applyTalkingHeadDirector(draft,operation.plan,operation.options||{});createSnapshot(session.projectPath,"review-talking-head-director");saveProject(session.projectPath,draft);return{...publicState(session),appliedTalkingHeadDirector:result.summary,categoryWorkflowStatus:analyzeCategoryWorkflow(draft)}; }
  if (operation.kind === "explainer-plan") return { ...publicState(session), explainerPlan:planExplainerDirector(project,operation.options||{}) };
  if (operation.kind === "explainer-apply") { const draft=structuredClone(project),result=applyExplainerDirector(draft,operation.plan);createSnapshot(session.projectPath,"review-explainer-director");saveProject(session.projectPath,draft);return{...publicState(session),appliedExplainerDirector:result.summary,categoryWorkflowStatus:analyzeCategoryWorkflow(draft)}; }
  if (operation.kind === "explainer-info-review") { const draft=structuredClone(project),result=reviewExplainerInfoCards(draft,operation.decisions||[]);createSnapshot(session.projectPath,"review-explainer-info-review");saveProject(session.projectPath,draft);return{...publicState(session),reviewedExplainerInfo:result,categoryWorkflowStatus:analyzeCategoryWorkflow(draft)}; }
  if (operation.kind === "explainer-info-render") { const draft=structuredClone(project);createSnapshot(session.projectPath,"review-explainer-info-render");const result=renderExplainerInfoCards(draft,session.projectPath,operation.options||{});saveProject(session.projectPath,draft);return{...publicState(session),renderedExplainerInfo:result.rendered,categoryWorkflowStatus:analyzeCategoryWorkflow(draft)}; }
  if (operation.kind === "product-promo-plan") return { ...publicState(session), productPromoPlan:planProductPromoDirector(project,operation.options||{}) };
  if (operation.kind === "product-promo-apply") { const draft=structuredClone(project),result=applyProductPromoDirector(draft,operation.plan);createSnapshot(session.projectPath,"review-product-promo-director");saveProject(session.projectPath,draft);return{...publicState(session),appliedProductPromo:result.summary,categoryWorkflowStatus:analyzeCategoryWorkflow(draft)}; }
  if (operation.kind === "product-promo-review") { const draft=structuredClone(project),result=reviewProductPromoCards(draft,operation.decisions||[]);createSnapshot(session.projectPath,"review-product-promo-claims");saveProject(session.projectPath,draft);return{...publicState(session),reviewedProductPromo:result,categoryWorkflowStatus:analyzeCategoryWorkflow(draft)}; }
  if (operation.kind === "product-promo-render") { const draft=structuredClone(project);createSnapshot(session.projectPath,"review-product-promo-mg");const result=renderProductPromoCards(draft,session.projectPath,operation.options||{});saveProject(session.projectPath,draft);return{...publicState(session),renderedProductPromo:result.rendered,categoryWorkflowStatus:analyzeCategoryWorkflow(draft)}; }
  if (operation.kind === "wedding-plan") return { ...publicState(session), weddingPlan:planWeddingDirector(project,operation.options||{}) };
  if (operation.kind === "wedding-apply") { const draft=structuredClone(project),result=applyWeddingDirector(draft,operation.plan);createSnapshot(session.projectPath,"review-wedding-director");saveProject(session.projectPath,draft);return{...publicState(session),appliedWedding:result.summary,categoryWorkflowStatus:analyzeCategoryWorkflow(draft)}; }
  if (operation.kind === "wedding-title-review") { const draft=structuredClone(project),result=reviewWeddingTitles(draft,operation.decisions||[]);createSnapshot(session.projectPath,"review-wedding-title-review");saveProject(session.projectPath,draft);return{...publicState(session),reviewedWeddingTitles:result,categoryWorkflowStatus:analyzeCategoryWorkflow(draft)}; }
  if (operation.kind === "wedding-title-render") { const draft=structuredClone(project);createSnapshot(session.projectPath,"review-wedding-title-render");const result=renderWeddingTitles(draft,session.projectPath,operation.options||{});saveProject(session.projectPath,draft);return{...publicState(session),renderedWeddingTitles:result.rendered,categoryWorkflowStatus:analyzeCategoryWorkflow(draft)}; }
  if (operation.kind === "podcast-plan") return { ...publicState(session), podcastPlan:planPodcastDirector(project,operation.options||{}) };
  if (operation.kind === "podcast-apply") { const draft=structuredClone(project),result=applyPodcastDirector(draft,operation.plan);createSnapshot(session.projectPath,"review-podcast-director");saveProject(session.projectPath,draft);return{...publicState(session),appliedPodcast:result.summary,categoryWorkflowStatus:analyzeCategoryWorkflow(draft)}; }
  if (operation.kind === "podcast-title-review") { const draft=structuredClone(project),result=reviewPodcastTitles(draft,operation.decisions||[]);createSnapshot(session.projectPath,"review-podcast-title-review");saveProject(session.projectPath,draft);return{...publicState(session),reviewedPodcastTitles:result,categoryWorkflowStatus:analyzeCategoryWorkflow(draft)}; }
  if (operation.kind === "podcast-title-render") { const draft=structuredClone(project);createSnapshot(session.projectPath,"review-podcast-title-render");const result=renderPodcastTitles(draft,session.projectPath,operation.options||{});saveProject(session.projectPath,draft);return{...publicState(session),renderedPodcastTitles:result.rendered,categoryWorkflowStatus:analyzeCategoryWorkflow(draft)}; }
  if (operation.kind === "mg-director-plan") return { ...publicState(session), motionGraphicsPlan:planMotionGraphicsDirector(project,operation.options||{}) };
  if (operation.kind === "mg-director-apply") { const draft=structuredClone(project),result=applyMotionGraphicsDirector(draft,operation.plan);createSnapshot(session.projectPath,"review-mg-director");saveProject(session.projectPath,draft);return{...publicState(session),appliedMotionGraphics:result.summary,categoryWorkflowStatus:analyzeCategoryWorkflow(draft)}; }
  if (operation.kind === "mg-scene-review") { const draft=structuredClone(project),result=reviewMotionGraphicsScenes(draft,operation.decisions||[]);createSnapshot(session.projectPath,"review-mg-scene-review");saveProject(session.projectPath,draft);return{...publicState(session),reviewedMotionGraphics:result,categoryWorkflowStatus:analyzeCategoryWorkflow(draft)}; }
  if (operation.kind === "mg-scene-render") { const draft=structuredClone(project);createSnapshot(session.projectPath,"review-mg-scene-render");const result=renderMotionGraphicsScenes(draft,session.projectPath,operation.options||{});saveProject(session.projectPath,draft);return{...publicState(session),renderedMotionGraphics:result.rendered,categoryWorkflowStatus:analyzeCategoryWorkflow(draft)}; }
  if (operation.kind === "project-acceptance") return { ...publicState(session), projectAcceptance:auditCutPilotProject(project) };
  if (operation.kind === "category-release-fix") { const draft=structuredClone(project),result=applyCategoryReleaseFixes(draft,operation.preflight);createSnapshot(session.projectPath,"review-category-release-fixes");saveProject(session.projectPath,draft);return{...publicState(session),categoryWorkflowStatus:analyzeCategoryWorkflow(draft),appliedCategoryReleaseFixes:result.applied}; }
  if (operation.kind === "category-release-export") { const workflow=analyzeCategoryWorkflow(project);if(!workflow.readyToExport)throw new Error(`Category export blocked: ${workflow.release.blockers.map((entry)=>entry.message).join("; ")}`);const safe=String(operation.name||`${project.name}-release`).replace(/[^\w.\-\u4e00-\u9fff]+/g,"-").replace(/^-+|-+$/g,"").slice(0,100)||"cutpilot-release",outputPath=join(dirname(session.projectPath),"exports",safe.endsWith(".mp4")?safe:`${safe}.mp4`),preset=activeTimeline(project).exportPreset||{},job=submitExportJob(session.projectPath,{kind:"video",outputPath,options:{range:preset.range||"full",resolution:preset.resolution||"original",frameRate:preset.fps||undefined,burnCaptions:preset.burnCaptions!==false}});return{...publicState(session),submittedExportJob:job,categoryWorkflowStatus:workflow}; }
  if (operation.kind === "vlog-release-export") { const workflow = analyzeVlogWorkflow(project); if (!workflow.readyToExport) throw new Error(`Vlog export blocked: ${workflow.release.blockers.map((entry)=>entry.message).join("; ")}`); const safe = String(operation.name || `${project.name}-release`).replace(/[^\w.\-\u4e00-\u9fff]+/g,"-").replace(/^-+|-+$/g,"").slice(0,100)||"cutpilot-vlog-release", outputPath = join(dirname(session.projectPath),"exports",safe.endsWith(".mp4")?safe:`${safe}.mp4`), preset = activeTimeline(project).exportPreset || {}; const job = submitExportJob(session.projectPath,{ kind:"video",outputPath,options:{ range:preset.range||"full",resolution:preset.resolution||"original",frameRate:preset.fps||undefined,burnCaptions:preset.burnCaptions!==false } }); return { ...publicState(session), submittedExportJob:job,vlogWorkflowStatus:workflow }; }
  if (operation.kind === "marker-add") { const draft = structuredClone(project), result = addTimelineMarker(draft, operation); createSnapshot(session.projectPath, "review-marker-add"); saveProject(session.projectPath, draft); return { ...publicState(session), changedMarker: result.marker }; }
  if (operation.kind === "marker-update") { const draft = structuredClone(project), result = updateTimelineMarker(draft, operation.markerId, operation.changes); createSnapshot(session.projectPath, "review-marker-update"); saveProject(session.projectPath, draft); return { ...publicState(session), changedMarker: result.marker }; }
  if (operation.kind === "marker-delete") { const draft = structuredClone(project), result = deleteTimelineMarker(draft, operation.markerId); createSnapshot(session.projectPath, "review-marker-delete"); saveProject(session.projectPath, draft); return { ...publicState(session), deletedMarkerId: result.markerId }; }
  if (operation.kind === "duplicates-analyze") return { ...publicState(session), duplicateAnalysis: findDuplicateShots(project, operation.options || {}) };
  if (operation.kind === "duplicates-remove") { const draft = structuredClone(project), result = removeDuplicateShots(draft, operation.duplicateItemIds, { ripple: operation.ripple !== false }); createSnapshot(session.projectPath, "review-remove-duplicates"); saveProject(session.projectPath, draft); return { ...publicState(session), removedDuplicates: result.removed.length }; }
  if (operation.kind === "source-place") { const draft = structuredClone(project), result = placeAssetOnTimeline(draft, operation); createSnapshot(session.projectPath, `review-source-${operation.mode || "append"}`); saveProject(session.projectPath, draft); return { ...publicState(session), placedItemId: result.item.id }; }
  if (operation.kind === "source-place-linked") { const draft = structuredClone(project), result = placeLinkedAv(draft, operation); createSnapshot(session.projectPath, `review-linked-${operation.mode || "append"}`); saveProject(session.projectPath, draft); return { ...publicState(session), placedItemId: result.video.id, linkGroupId: result.groupId }; }
  if (operation.kind === "linked-move") { const draft = structuredClone(project), result = moveLinkedGroup(draft, operation.itemOrGroupId, operation.start); createSnapshot(session.projectPath, "review-linked-move"); saveProject(session.projectPath, draft); return { ...publicState(session), linkGroupId: result.groupId }; }
  if (operation.kind === "linked-trim") { const draft = structuredClone(project), result = trimLinkedGroup(draft, operation.itemOrGroupId, { newStart: operation.newStart, newEnd: operation.newEnd }); createSnapshot(session.projectPath, "review-linked-trim"); saveProject(session.projectPath, draft); return { ...publicState(session), linkGroupId: result.groupId }; }
  if (operation.kind === "linked-unlink") { const draft = structuredClone(project), result = unlinkTimelineItems(draft, operation.itemOrGroupId); createSnapshot(session.projectPath, "review-unlink"); saveProject(session.projectPath, draft); return { ...publicState(session), unlinkedGroupId: result.groupId }; }
  if (operation.kind === "export-submit") { const extensions = { video: ".mp4", audio: operation.options?.format === "m4a" ? ".m4a" : `.${operation.options?.format || "wav"}`, fcpxml: ".fcpxml", "premiere-xml": ".xml", edl: ".edl", jianying: "" }, extension = extensions[operation.exportKind]; if (extension === undefined) throw new Error("Unsupported export kind"); const safe = String(operation.name || `${project.name}-${operation.exportKind}`).replace(/[^\w.\-\u4e00-\u9fff]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 100) || "mycut-export", folder = join(dirname(session.projectPath), "exports"), outputPath = operation.exportKind === "jianying" ? join(folder, safe) : join(folder, safe.endsWith(extension) ? safe : `${safe}${extension}`), job = submitExportJob(session.projectPath, { kind: operation.exportKind, outputPath, options: operation.options || {} }); return { ...publicState(session), submittedExportJob: job }; }
  if (operation.kind === "export-cancel") { const job = cancelExportJob(session.projectPath, operation.jobId); return { ...publicState(session), cancelledExportJob: job }; }
  if (operation.kind === "delivery-variants") { const draft=structuredClone(project),result=createDeliveryVariants(draft,operation.options||{});createSnapshot(session.projectPath,"review-delivery-variants");saveProject(session.projectPath,draft);return{...publicState(session),deliveryVariants:result}; }
  if (operation.kind === "delivery-submit") { const result=submitDeliveryPack(session.projectPath,operation.options||{});return{...publicState(session),submittedDeliveryPack:result}; }
  if (operation.kind === "silence-analyze") { const asset = project.assets.find((entry) => entry.id === operation.assetId); if (!asset) throw new Error(`Asset not found: ${operation.assetId}`); return { ...publicState(session), silenceAnalysis: analyzeAssetSilence(asset, operation.options || {}) }; }
  if (operation.kind === "silence-apply") { const draft = structuredClone(project), result = applySilenceCut(draft, operation); createSnapshot(session.projectPath, "review-silence-cut"); saveProject(session.projectPath, draft); return { ...publicState(session), silenceCut: { duration: result.duration, segments: result.segments.length } }; }
  if (operation.kind === "scene-analyze") { const asset = project.assets.find((entry) => entry.id === operation.assetId); if (!asset) throw new Error(`Asset not found: ${operation.assetId}`); return { ...publicState(session), sceneAnalysis: analyzeAssetScenes(session.projectPath, asset, operation.options || {}) }; }
  if (operation.kind === "scene-save") { const draft = structuredClone(project), result = saveSceneSubclips(draft, operation.assetId, operation.scenes, { replace: operation.replace !== false }); createSnapshot(session.projectPath, "review-scene-subclips"); saveProject(session.projectPath, draft); return { ...publicState(session), savedSceneSubclips: result.subclips.length }; }
  if (operation.kind === "beat-analyze") { const asset = project.assets.find((entry) => entry.id === operation.assetId); if (!asset) throw new Error(`Asset not found: ${operation.assetId}`); return { ...publicState(session), beatAnalysis: analyzeAssetBeats(asset, operation.options || {}) }; }
  if (operation.kind === "beat-save") { const draft = structuredClone(project), result = saveBeatMarkers(draft, operation.assetId, operation.analysis, operation.options || {}); createSnapshot(session.projectPath, "review-beat-markers"); saveProject(session.projectPath, draft); return { ...publicState(session), savedBeatMarkers: result.markers.length, beatAnalysis: operation.analysis }; }
  if (operation.kind === "beat-plan") return { ...publicState(session), beatAnalysis: operation.analysis, beatPlan: buildBeatMontagePlan(project, operation.options || {}) };
  if (operation.kind === "beat-apply") { const draft = structuredClone(project), result = applyBeatMontage(draft, operation.options || {}); createSnapshot(session.projectPath, "review-beat-montage"); saveProject(session.projectPath, draft); return { ...publicState(session), appliedBeatMontage: result.items.length }; }
  if (operation.kind === "subtitle-import") { const imported = importSubtitleFile(operation.inputPath, operation.format), offset = Number(operation.offset || 0), cues = imported.cues.map((cue) => ({ ...cue, start: cue.start + offset, end: cue.end + offset })); if (cues.some((cue) => cue.start < 0)) throw new Error("Subtitle offset moves a cue before timeline zero"); const draft = structuredClone(project), timeline = activeTimeline(draft); timeline.captions = { enabled: true, cues, style: timeline.captions?.style || {}, source: { path: imported.inputPath, format: imported.format, importedAt: new Date().toISOString(), offset } }; createSnapshot(session.projectPath, "review-subtitle-import"); saveProject(session.projectPath, draft); return { ...publicState(session), importedSubtitles: { format: imported.format, cues: cues.length } }; }
  if (operation.kind === "subtitle-export") { const timeline = activeTimeline(project), cues = timeline.captions?.cues || []; if (!cues.length) throw new Error("No captions to export"); const result = exportSubtitleFile(operation.outputPath, cues, operation.format, { variant: operation.variant || "original", title: project.name }); return { ...publicState(session), exportedSubtitles: result }; }
  if (operation.kind === "proxy-generate") { const draft = structuredClone(project), asset = draft.assets.find((entry) => entry.id === operation.assetId); if (!asset) throw new Error(`Asset not found: ${operation.assetId}`); const result = generateVideoProxy(session.projectPath, asset, operation.options || {}); createSnapshot(session.projectPath, "review-proxy-generate"); saveProject(session.projectPath, draft); return { ...publicState(session), generatedProxy: result }; }
  if (operation.kind === "proxy-detach") { const draft = structuredClone(project), asset = draft.assets.find((entry) => entry.id === operation.assetId); if (!asset) throw new Error(`Asset not found: ${operation.assetId}`); const result = detachVideoProxy(session.projectPath, asset, { deleteFile: operation.deleteFile === true }); createSnapshot(session.projectPath, "review-proxy-detach"); saveProject(session.projectPath, draft); return { ...publicState(session), detachedProxy: result }; }
  if (operation.kind === "reframe-analyze") { const timeline = activeTimeline(project), item = timeline.tracks.flatMap((track) => track.items).find((entry) => entry.id === operation.itemId), asset = project.assets.find((entry) => entry.id === item?.assetId); if (!item || !asset) throw new Error(`Timeline item not found: ${operation.itemId}`); const plan = analyzeSmartReframe(asset, { ...(operation.options || {}), targetWidth: operation.options?.targetWidth || timeline.width, targetHeight: operation.options?.targetHeight || timeline.height, sourceStart: item.sourceStart, sourceEnd: item.sourceStart + playbackSourceSpan(item) }); if (Math.abs(plan.sourceDuration - item.duration) > .0001) plan.keyframes = plan.keyframes.map((keyframe) => ({ ...keyframe, time: Number((keyframe.time / plan.sourceDuration * item.duration).toFixed(4)) })); return { ...publicState(session), reframePlan: { ...plan, itemId: item.id, timelineDuration: item.duration } }; }
  if (operation.kind === "reframe-apply") { const draft = structuredClone(project), result = applySmartReframe(draft, { itemId: operation.itemId, plan: operation.plan, keyframes: operation.keyframes }); createSnapshot(session.projectPath, "review-smart-reframe"); saveProject(session.projectPath, draft); return { ...publicState(session), appliedReframe: result.reframe.keyframes.length }; }
  if (operation.kind === "reframe-clear") { const draft = structuredClone(project), result = clearSmartReframe(draft, operation.itemId); createSnapshot(session.projectPath, "review-clear-reframe"); saveProject(session.projectPath, draft); return { ...publicState(session), clearedReframe: result.removed }; }
  const draft = structuredClone(project);
  const timeline = activeTimeline(draft);
  let mgAssetToRender = null;
  if (operation.kind === "activate-timeline") {
    activateProjectTimeline(draft, operation.timelineId);
  } else if (operation.kind === "timeline-in-out") {
    setTimelineInOut(draft, operation.timelineId, { inPoint: operation.inPoint, outPoint: operation.outPoint });
  } else if (operation.kind === "timeline-format") {
    setTimelineFormat(draft, operation.timelineId, { preset: operation.preset, width: operation.width, height: operation.height, fps: operation.fps, layoutMode: operation.layoutMode || "scale" });
  } else if (operation.kind === "transcript-sequence") {
    applyTranscriptSequence(draft, { assetId: operation.assetId, segments: operation.segments, videoTrackName: operation.videoTrackName || "V1", audioTrackName: operation.audioTrackName || "A1", includeVideo: operation.includeVideo !== false, includeAudio: operation.includeAudio !== false, gapSeconds: Number(operation.gapSeconds || 0), replaceTracks: true });
  } else if (operation.kind === "asset-bin") {
    assignAssetsToBin(draft, [operation.assetId], operation.binId || null);
  } else if (operation.kind === "track-update") {
    updateTrack(draft, operation.trackId, operation.changes || {});
  } else if (operation.kind === "track-delete") {
    deleteTrack(draft, operation.trackId, { deleteItems: false });
  } else if (operation.kind === "snapping") {
    setSnapping(draft, { enabled: operation.enabled, toleranceFrames: operation.toleranceFrames });
  } else if (operation.kind === "item") {
    const item = timeline.tracks.flatMap((track) => track.items).find((entry) => entry.id === operation.itemId);
    if (!item) throw new Error(`Item not found: ${operation.itemId}`);
    const patch = { ...(operation.patch || {}) }; if (patch.start !== undefined && operation.snap !== false) patch.start = snapTimelineTime(timeline, patch.start, { excludeItemId: operation.itemId, playhead: operation.playhead }).time;
    const allowed = new Set(["start", "duration", "sourceStart", "label", "opacity"]);
    for (const [key, value] of Object.entries(patch)) if (allowed.has(key)) item[key] = value;
    if (!Number.isFinite(item.start) || item.start < 0 || !Number.isFinite(item.sourceStart) || item.sourceStart < 0 || !Number.isFinite(item.duration) || item.duration <= 0) throw new Error("Item timing must use finite non-negative start/source values and positive duration");
    if (!Number.isFinite(item.opacity) || item.opacity < 0 || item.opacity > 1) throw new Error("Item opacity must be between 0 and 1");
    item.label = String(item.label || "").slice(0, 300);
  } else if (operation.kind === "playback") {
    const item = timeline.tracks.flatMap((track) => track.items).find((entry) => entry.id === operation.itemId), track = timeline.tracks.find((entry) => entry.items.some((candidate) => candidate.id === operation.itemId)); if (!item) throw new Error(`Item not found: ${operation.itemId}`);
    const rate = Number(operation.playbackRate); if (!Number.isFinite(rate) || rate < 0.1 || rate > 16) throw new Error("Playback rate must be 0.1-16"); if (track.type === "audio" && operation.freezeFrame) throw new Error("Audio items cannot use freeze frame");
    const curve = validateSpeedCurve(operation.speedCurve, item.duration), candidate = { ...item, playbackRate: rate, speedCurve: curve, freezeFrame: Boolean(operation.freezeFrame) };
    const asset = draft.assets.find((entry) => entry.id === item.assetId), sourceEnd = item.sourceStart + playbackSourceSpan(candidate); if (asset?.duration && sourceEnd > asset.duration + 0.05) throw new Error("Playback source range exceeds the asset");
    item.playbackRate = rate; item.speedCurve = curve; item.reverse = Boolean(operation.reverse); item.freezeFrame = Boolean(operation.freezeFrame);
  } else if (operation.kind === "caption") {
    const cue = timeline.captions?.cues?.[operation.index];
    if (!cue) throw new Error(`Caption not found: ${operation.index}`);
    for (const key of ["start", "end", "text", "translation"]) if (operation.patch?.[key] !== undefined) cue[key] = operation.patch[key];
    if (!(cue.end > cue.start) || !String(cue.text).trim()) throw new Error("Caption requires non-empty text and end > start");
  } else if (operation.kind === "effects") {
    const item = timeline.tracks.flatMap((track) => track.items).find((entry) => entry.id === operation.itemId); if (!item) throw new Error(`Item not found: ${operation.itemId}`); item.effects = validateEffectStack(operation.effects || []);
  } else if (operation.kind === "audio-effects") {
    const item = timeline.tracks.flatMap((track) => track.items).find((entry) => entry.id === operation.itemId), track = timeline.tracks.find((entry) => entry.items.some((candidate) => candidate.id === operation.itemId)); if (!item) throw new Error(`Item not found: ${operation.itemId}`); if (track.type !== "audio") throw new Error("Audio effects require an audio item"); item.audioEffects = validateAudioEffectStack(operation.audioEffects || []);
  } else if (operation.kind === "caption-style") {
    const patch = operation.style || {}, allowed = new Set(["template","fontFamily","fontSize","maxWidth","color","highlightColor","outlineColor","outlineWidth","backgroundColor","backgroundOpacity","position","margin","weight","karaoke","uppercase","shadow"]);
    timeline.captions ||= { enabled: true, cues: [], style: {} }; timeline.captions.style ||= {};
    for (const [key,value] of Object.entries(patch)) if (allowed.has(key)) timeline.captions.style[key]=value;
    if (timeline.captions.style.fontSize!==undefined && !(timeline.captions.style.fontSize>=12&&timeline.captions.style.fontSize<=240)) throw new Error("Caption font size must be 12-240");
    if (timeline.captions.style.backgroundOpacity!==undefined && !(timeline.captions.style.backgroundOpacity>=0&&timeline.captions.style.backgroundOpacity<=1)) throw new Error("Caption background opacity must be 0-1");
  } else if (operation.kind === "mg-values") {
    const asset = draft.assets.find((entry) => entry.id === operation.assetId && entry.motionGraphic?.engine === "svg");
    if (!asset) throw new Error(`SVG Motion Graphic not found: ${operation.assetId}`);
    const allowed = new Set(asset.motionGraphic.properties.map((entry) => entry.key));
    for (const [key, value] of Object.entries(operation.values || {})) if (allowed.has(key)) asset.motionGraphic.values[key] = value;
    mgAssetToRender = asset;
  } else if (operation.kind === "keyframes") {
    const item = timeline.tracks.flatMap((track) => track.items).find((entry) => entry.id === operation.itemId);
    if (!item) throw new Error(`Item not found: ${operation.itemId}`);
    const easings = new Set(["linear", "ease-in", "ease-out", "ease-in-out", "hold", "bezier"]);
    const keyframes = (operation.keyframes || []).map((entry) => {
      const keyframe = { time: Number(entry.time), easing: easings.has(entry.easing) ? entry.easing : "linear" };
      if (!Number.isFinite(keyframe.time) || keyframe.time < 0 || keyframe.time > item.duration) throw new Error("Keyframe time must be within the clip duration");
      for (const property of ["x", "y", "scale", "rotation", "opacity"]) if (entry[property] !== undefined && entry[property] !== "") {
        keyframe[property] = Number(entry[property]);
        if (!Number.isFinite(keyframe[property])) throw new Error(`${property} must be finite`);
      }
      if (keyframe.scale !== undefined && keyframe.scale <= 0) throw new Error("Keyframe scale must be positive");
      if (keyframe.opacity !== undefined && (keyframe.opacity < 0 || keyframe.opacity > 1)) throw new Error("Keyframe opacity must be between 0 and 1");
      if (keyframe.easing === "bezier") {
        const y1 = Number(entry.bezier?.y1 ?? 0.25), y2 = Number(entry.bezier?.y2 ?? 0.75);
        if (![y1, y2].every(Number.isFinite)) throw new Error("Bezier controls must be finite");
        keyframe.bezier = { y1, y2 };
      }
      return keyframe;
    }).sort((a, b) => a.time - b.time);
    item.transform ||= {};
    item.transform.keyframes = keyframes;
  } else if (operation.kind === "shader-effect") {
    const item = timeline.tracks.flatMap((track) => track.items).find((entry) => entry.id === operation.itemId);
    if (!item) throw new Error(`Item not found: ${operation.itemId}`);
    const source = String(operation.source || ""), validation = validateGlslSource(source);
    if (!validation.valid) throw new Error(validation.errors.join("; "));
    const uniforms = {};
    for (const [key, value] of Object.entries(operation.uniforms || {})) {
      if (!/^[A-Za-z_]\w{0,63}$/.test(key)) throw new Error(`Invalid uniform name: ${key}`);
      if (Array.isArray(value)) { if (value.length < 2 || value.length > 4 || !value.every(Number.isFinite)) throw new Error(`Invalid uniform: ${key}`); uniforms[key] = value.map(Number); }
      else { const number = Number(value); if (!Number.isFinite(number)) throw new Error(`Invalid uniform: ${key}`); uniforms[key] = number; }
    }
    item.effects = (item.effects || []).filter((effect) => effect.type !== "glsl");
    item.effects.push({ type: "glsl", name: String(operation.name || "Custom GLSL").slice(0, 100), source, uniforms });
  } else if (operation.kind === "jsx-mg") {
    const asset = draft.assets.find((entry) => entry.id === operation.assetId && entry.motionGraphic?.engine === "jsx-react");
    if (!asset) throw new Error(`JSX Motion Graphic not found: ${operation.assetId}`);
    const source = String(operation.source || asset.motionGraphic.source), check = validateJsxMotionSource(source); if (!check.valid) throw new Error(check.errors.join("; "));
    asset.motionGraphic.source = source; asset.motionGraphic.props = operation.props || {}; mgAssetToRender = asset;
  } else if (operation.kind === "split") {
    splitTimelineItem(draft, operation.itemId, operation.at);
  } else if (operation.kind === "trim") {
    const newStart = operation.newStart === undefined ? undefined : snapTimelineTime(timeline, operation.newStart, { excludeItemId: operation.itemId, playhead: operation.playhead }).time, newEnd = operation.newEnd === undefined ? undefined : snapTimelineTime(timeline, operation.newEnd, { excludeItemId: operation.itemId, playhead: operation.playhead }).time; trimTimelineItem(draft, operation.itemId, { newStart, newEnd, ripple: Boolean(operation.ripple) });
  } else if (operation.kind === "ripple-delete") {
    rippleDeleteItem(draft, operation.itemId, operation.scope === "track" ? "track" : "all");
  } else if (operation.kind === "insert-gap") {
    insertTimelineGap(draft, operation.at, operation.duration, operation.scope === "track" ? "track" : "all", operation.trackName || null);
  } else if (operation.kind === "razor-all") {
    razorAllTracks(draft, operation.at);
  } else if (operation.kind === "transition") {
    const item = timeline.tracks.flatMap((track) => track.items).find((entry) => entry.id === operation.itemId);
    if (!item) throw new Error(`Item not found: ${operation.itemId}`);
    const type = ["none", "fade", "dip-black", "cross-dissolve", "wipe-left", "wipe-right", "wipe-up", "wipe-down", "radial", "slide-left", "slide-right", "slide-up", "slide-down"].includes(operation.type) ? operation.type : "none";
    const duration = Number(operation.duration);
    if (type !== "none" && (!Number.isFinite(duration) || duration < 0.05 || duration > 5)) throw new Error("Transition duration must be 0.05-5 seconds");
    const key = operation.edge === "in" ? "transitionIn" : "transitionOut";
    if (type === "none") delete item[key]; else item[key] = { type, duration };
  } else throw new Error(`Unsupported review edit: ${operation.kind}`);
  draft.history.push({ at: new Date().toISOString(), action: "review_edit", kind: operation.kind, target: operation.itemId || operation.assetId || operation.index });
  const validation = validateProject(draft);
  if (!validation.valid) throw new Error(validation.errors.join("\n"));
  createSnapshot(session.projectPath, `review-${operation.kind}`);
  if (mgAssetToRender?.motionGraphic.engine === "svg") renderSvgMotionGraphic({ source: mgAssetToRender.motionGraphic.source, properties: mgAssetToRender.motionGraphic.properties, values: mgAssetToRender.motionGraphic.values, width: mgAssetToRender.width, height: mgAssetToRender.height, sourcePath: mgAssetToRender.sourcePath, outputPath: mgAssetToRender.path });
  if (mgAssetToRender?.motionGraphic.engine === "jsx-react") renderJsxMotionGraphic({ ...mgAssetToRender.motionGraphic, outputPath: mgAssetToRender.path });
  saveProject(session.projectPath, draft);
  return publicState(session);
}

async function handler(request, response) {
  const url = new URL(request.url, `http://127.0.0.1:${port}`);
  const token = url.searchParams.get("token");
  const session = sessions.get(token);
  if (url.pathname === "/" && session) { response.writeHead(200, { "content-type": "text/html; charset=utf-8", "content-security-policy": "default-src 'self'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; media-src 'self'; connect-src 'self'; frame-ancestors *", "cache-control": "no-store" }); return response.end(reviewHtml); }
  if (!session) return json(response, 403, { error: "Invalid or expired review token" });
  try {
    if (url.pathname === "/api/project" && request.method === "GET") return json(response, 200, publicState(session));
    if (url.pathname === "/api/edit" && request.method === "POST") return json(response, 200, applyReviewEdit(session, await body(request)));
    if (url.pathname === "/media" && request.method === "GET") {
      if (url.searchParams.get("preview") === "1") return streamFile(request, response, session.previewPath);
      const assetId = url.searchParams.get("assetId"); const { project } = loadProject(session.projectPath); const asset = project.assets.find((entry) => entry.id === assetId); if (!asset) return json(response, 404, { error: "Asset not found" }); const media = resolvePreviewMedia(asset, { preferProxy: url.searchParams.get("proxy") === "1" }); response.setHeader("x-mycut-media", media.usingProxy ? "proxy" : "original"); return streamFile(request, response, media.path);
    }
    if (url.pathname === "/thumbnail" && request.method === "GET") { const assetId = url.searchParams.get("assetId"), subclipId = url.searchParams.get("subclipId"), { project } = loadProject(session.projectPath), asset = project.assets.find((entry) => entry.id === assetId), subclip = asset?.subclips?.find((entry) => entry.id === subclipId), expected = resolve(dirname(session.projectPath), "mycut-assets", "scene-thumbnails", String(assetId || "")), thumbnail = subclip?.thumbnailPath ? resolve(subclip.thumbnailPath) : null; if (!thumbnail || !(thumbnail === expected || thumbnail.startsWith(`${expected}/`))) return json(response, 404, { error: "Scene thumbnail not found" }); return streamFile(request, response, thumbnail); }
    if (url.pathname === "/waveform" && request.method === "GET") {
      const assetId = url.searchParams.get("assetId"); const { project } = loadProject(session.projectPath); const asset = project.assets.find((entry) => entry.id === assetId && entry.type === "audio"); if (!asset) return json(response, 404, { error: "Audio asset not found" }); return streamFile(request, response, ensureWaveform(session.projectPath, asset));
    }
    return json(response, 404, { error: "Not found" });
  } catch (error) { return json(response, 400, { error: error.message }); }
}

async function ensureServer() {
  if (idleCloseTimer) { clearTimeout(idleCloseTimer); idleCloseTimer = null; }
  if (server) return;
  server = createServer(handler);
  await new Promise((resolveListen, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", resolveListen); });
  port = server.address().port;
}

export async function openReviewSession({ projectPath, previewPath }) {
  const project = resolve(projectPath); loadProject(project);
  const preview = previewPath ? resolve(previewPath) : null;
  if (preview && !existsSync(preview)) throw new Error(`Preview not found: ${preview}`);
  await ensureServer();
  const token = randomUUID();
  const session = { token, projectPath: project, previewPath: preview, createdAt: new Date().toISOString() };
  sessions.set(token, session);
  return { token, url: `http://127.0.0.1:${port}/?token=${token}`, projectPath: project, previewPath: preview };
}

export function closeReviewSession(token) {
  const closed = sessions.delete(token);
  if (!sessions.size && server && !idleCloseTimer) {
    idleCloseTimer = setTimeout(() => {
      idleCloseTimer = null;
      if (sessions.size || !server) return;
      const idleServer = server;
      server = null;
      port = null;
      idleServer.close();
    }, 1000);
    idleCloseTimer.unref();
  }
  return closed;
}
