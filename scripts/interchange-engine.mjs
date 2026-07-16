import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { randomUUID } from "node:crypto";
import { XMLParser } from "fast-xml-parser";
import { activeTimeline, applyTimelineEdit, newProject, projectDuration, saveProject } from "./project-store.mjs";

const xml = (value) => String(value ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
const frames = (seconds, fps) => Math.max(0, Math.round(Number(seconds || 0) * fps));
const time = (seconds, fps) => `${frames(seconds, fps)}/${fps}s`;
const metadataValue = (value) => Buffer.from(JSON.stringify(value)).toString("base64url");
const metadataNode = (key, value) => `<metadata><md key="${xml(key)}" value="${metadataValue(value)}"/></metadata>`;

export function projectToFcpxml(project) {
  const timeline = activeTimeline(project);
  const fps = Math.round(timeline.fps);
  const duration = projectDuration(timeline);
  const usedIds = new Set(timeline.tracks.flatMap((track) => track.items.map((item) => item.assetId)));
  const assets = project.assets.filter((asset) => usedIds.has(asset.id));
  const assetRefs = new Map(assets.map((asset, index) => [asset.id, `r${index + 2}`]));
  const resources = assets.map((asset) => `    <asset id="${assetRefs.get(asset.id)}" name="${xml(asset.name)}" src="${xml(pathToFileURL(asset.path).href)}" start="0s"${asset.duration ? ` duration="${time(asset.duration, fps)}"` : ""} hasVideo="${asset.type === "audio" ? "0" : "1"}" hasAudio="${asset.hasAudio || asset.type === "audio" ? "1" : "0"}"/>`).join("\n");
  const videoTracks = timeline.tracks.filter((track) => track.type === "video" && !track.muted);
  const audioTracks = timeline.tracks.filter((track) => track.type === "audio" && !track.muted);
  const clips = [];
  videoTracks.forEach((track, trackIndex) => track.items.forEach((item) => {
    const lane = trackIndex === 0 ? "" : ` lane="${trackIndex}"`;
    const extras = Object.fromEntries(Object.entries(item).filter(([key]) => !["id", "assetId", "start", "sourceStart", "duration", "label"].includes(key)));
    clips.push(`          <asset-clip ref="${assetRefs.get(item.assetId)}" name="${xml(item.label || project.assets.find((asset) => asset.id === item.assetId)?.name || "clip")}" offset="${time(item.start, fps)}" start="${time(item.sourceStart, fps)}" duration="${time(item.duration, fps)}"${lane}>${metadataNode("com.mycut.item", extras)}</asset-clip>`);
  }));
  audioTracks.forEach((track, trackIndex) => track.items.forEach((item) => {
    const gain = Number(item.volumeDb || 0) + Number(track.volumeDb || 0);
    const extras = Object.fromEntries(Object.entries(item).filter(([key]) => !["id", "assetId", "start", "sourceStart", "duration", "label"].includes(key)));
    clips.push(`          <asset-clip ref="${assetRefs.get(item.assetId)}" name="${xml(item.label || "audio")}" offset="${time(item.start, fps)}" start="${time(item.sourceStart, fps)}" duration="${time(item.duration, fps)}" lane="-${trackIndex + 1}" audioRole="${xml(track.role || "dialogue")}"><adjust-volume amount="${gain.toFixed(1)}dB"/>${metadataNode("com.mycut.item", extras)}</asset-clip>`);
  }));
  return `<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE fcpxml>\n<fcpxml version="1.10">\n  <resources>\n    <format id="r1" name="CutPilot ${timeline.width}x${timeline.height} ${fps}p" frameDuration="1/${fps}s" width="${timeline.width}" height="${timeline.height}"/>\n${resources}\n  </resources>\n  <library><event name="${xml(project.name)}"><project name="${xml(timeline.name)}"><sequence format="r1" duration="${time(duration, fps)}" tcStart="0s" tcFormat="NDF"><spine>\n${clips.join("\n")}\n        </spine></sequence></project></event></library>\n</fcpxml>\n`;
}

export function projectToEdl(project) {
  const timeline = activeTimeline(project);
  const fps = Math.round(timeline.fps);
  const primary = timeline.tracks.find((track) => track.type === "video" && !track.muted);
  const tc = (seconds) => {
    const total = frames(seconds, fps); const ff = total % fps; const ss = Math.floor(total / fps) % 60; const mm = Math.floor(total / fps / 60) % 60; const hh = Math.floor(total / fps / 3600);
    return [hh, mm, ss, ff].map((value) => String(value).padStart(2, "0")).join(":");
  };
  const events = (primary?.items || []).map((item, index) => {
    const asset = project.assets.find((entry) => entry.id === item.assetId);
    return `${String(index + 1).padStart(3, "0")}  AX       V     C        ${tc(item.sourceStart)} ${tc(item.sourceStart + item.duration)} ${tc(item.start)} ${tc(item.start + item.duration)}\n* FROM CLIP NAME: ${asset?.name || item.label || item.assetId}`;
  });
  return `TITLE: ${project.name}\nFCM: NON-DROP FRAME\n\n${events.join("\n\n")}\n`;
}

export function projectToPremiereXml(project) {
  const timeline = activeTimeline(project), fps = Math.round(timeline.fps), duration = frames(projectDuration(timeline), fps);
  const rate = `<rate><timebase>${fps}</timebase><ntsc>FALSE</ntsc></rate>`;
  const assetMap = new Map(project.assets.map((asset, index) => [asset.id, { asset, fileId: `file-${index + 1}` }]));
  const trackXml = (track, media) => `<track>${track.items.map((item, index) => { const ref = assetMap.get(item.assetId), start = frames(item.start, fps), len = frames(item.duration, fps), source = frames(item.sourceStart, fps), gain = Number(item.volumeDb || 0) + Number(track.volumeDb || 0); return `<clipitem id="${media}-clip-${track.id}-${index}"><name>${xml(item.label || ref?.asset.name || "clip")}</name><enabled>TRUE</enabled><duration>${len}</duration>${rate}<start>${start}</start><end>${start + len}</end><in>${source}</in><out>${source + len}</out><file id="${ref.fileId}"><name>${xml(ref.asset.name)}</name><pathurl>${xml(pathToFileURL(ref.asset.path).href)}</pathurl>${rate}<duration>${frames(ref.asset.duration || item.duration, fps)}</duration><media><${media}/></media></file>${media === "audio" ? `<filter><effect><name>Audio Levels</name><effectid>audiolevels</effectid><effectcategory>audiolevels</effectcategory><parameter><parameterid>level</parameterid><name>Level</name><value>${Math.pow(10, gain / 20).toFixed(6)}</value></parameter></effect></filter>` : ""}</clipitem>`; }).join("")}</track>`;
  const video = timeline.tracks.filter((track) => track.type === "video" && !track.muted).map((track) => trackXml(track, "video")).join("");
  const audio = timeline.tracks.filter((track) => track.type === "audio" && !track.muted).map((track) => trackXml(track, "audio")).join("");
  return `<?xml version="1.0" encoding="UTF-8"?><!DOCTYPE xmeml><xmeml version="5"><sequence id="sequence-1"><name>${xml(project.name)}</name><duration>${duration}</duration>${rate}<media><video><format><samplecharacteristics>${rate}<width>${timeline.width}</width><height>${timeline.height}</height><pixelaspectratio>square</pixelaspectratio></samplecharacteristics></format>${video}</video><audio><numOutputChannels>2</numOutputChannels>${audio}</audio></media></sequence></xmeml>`;
}

const list = (value) => value === undefined ? [] : Array.isArray(value) ? value : [value];
const seconds = (value) => { const match = /^(-?\d+(?:\.\d+)?)(?:\/(\d+(?:\.\d+)?))?s$/.exec(String(value || "0s")); if (!match) throw new Error(`Unsupported FCPXML time: ${value}`); return Number(match[1]) / Number(match[2] || 1); };
const readMetadata = (node, key) => { for (const md of list(node?.metadata?.md)) if (md.key === key) { try { return JSON.parse(Buffer.from(md.value, "base64url").toString("utf8")); } catch { throw new Error(`Invalid CutPilot metadata: ${key}`); } } return null; };
const parseXml = (source, kind) => { const raw = String(source); if (raw.length > 20 * 1024 * 1024) throw new Error(`${kind} exceeds 20MB`); if (/<!ENTITY|<\?xml-stylesheet/i.test(raw)) throw new Error(`${kind} entities and stylesheets are not allowed`); return new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "", parseTagValue: false, processEntities: false, trimValues: true }).parse(raw); };
const localPath = (url, label) => { if (!String(url || "").startsWith("file:")) throw new Error(`Only local file assets are allowed: ${label || url}`); return fileURLToPath(url); };
const overlap = (item, start, duration) => item.start < start + duration - 0.0001 && start < item.start + item.duration - 0.0001;
function addOnAvailableTrack(project, baseTrackName, add) {
  const audio = baseTrackName.startsWith("A"), prefix = audio ? "A" : "V"; let number = Math.max(1, Number(baseTrackName.slice(1)) || 1);
  while (true) { const name = `${prefix}${number}`, timeline = activeTimeline(project), track = timeline.tracks.find((entry) => entry.name === name); if (!track || !track.items.some((item) => overlap(item, add.start, add.duration))) { applyTimelineEdit(project, { trackName: name, adds: [add] }); return name; } number++; }
}
const nodeText = (node) => typeof node === "string" || typeof node === "number" ? String(node) : node?.["#text"] !== undefined ? String(node["#text"]) : "";
function findFirst(node, key) { if (!node || typeof node !== "object") return null; if (node[key]) return list(node[key])[0]; for (const value of Object.values(node)) for (const child of list(value)) { const found = findFirst(child, key); if (found) return found; } return null; }

export function fcpxmlToProject(source, { projectName, projectPath } = {}) {
  const parsed = parseXml(source, "FCPXML"), root = parsed.fcpxml;
  if (!root?.resources) throw new Error("Invalid FCPXML: resources missing");
  const formats = new Map(list(root.resources.format).map((entry) => [entry.id, entry])), resources = new Map(list(root.resources.asset).map((entry) => [entry.id, entry])), mediaResources = new Map(list(root.resources.media).map((entry) => [entry.id, entry]));
  const projectNode = findFirst(root.library || root, "project"); if (!projectNode?.sequence) throw new Error("Invalid FCPXML: sequence missing");
  const sequence = projectNode.sequence, format = formats.get(sequence.format) || list(root.resources.format)[0], fps = Math.round(1 / seconds(format.frameDuration || "1/30s"));
  const project = newProject({ name: projectName || projectNode.name || "Imported FCPXML", width: Number(format.width || 1920), height: Number(format.height || 1080), fps });
  const refs = new Map();
  for (const [ref, asset] of resources) { const src = asset.src || list(asset["media-rep"])[0]?.src; if (!src) continue; const id = randomUUID(), hasVideo = String(asset.hasVideo ?? "1") !== "0"; project.assets.push({ id, path: localPath(src, asset.name || ref), name: asset.name || ref, type: hasVideo ? "video" : "audio", duration: asset.duration ? seconds(asset.duration) : null, hasAudio: String(asset.hasAudio || "0") === "1" }); refs.set(ref, id); }
  const timeline = activeTimeline(project), markers = [], captions = [];
  const addMarkers = (node, timelineStart, sourceStart = 0) => { for (const marker of list(node?.marker)) { const start = timelineStart + seconds(marker.start || "0s") - sourceStart, duration = marker.duration ? seconds(marker.duration) : 0; markers.push({ id: randomUUID(), time: Math.max(0, start), duration, name: marker.value || marker.name || "Marker", note: marker.note || "" }); } };
  const addTitles = (node, timelineStart, inheritedDuration = 1) => { for (const title of [...list(node?.title), ...list(node?.caption)]) { const start = title.offset !== undefined ? timelineStart + seconds(title.offset) - seconds(node.start || "0s") : timelineStart, duration = title.duration ? seconds(title.duration) : inheritedDuration, textNodes = list(title.text?.["text-style"] || title["text-style"] || title.text), text = textNodes.map(nodeText).join("").trim() || title.name || "Title"; if (text) captions.push({ start: Math.max(0, start), end: Math.max(0, start) + duration, text }); } };
  const childKinds = ["asset-clip", "clip", "sync-clip", "mc-clip", "ref-clip", "gap", "title", "caption"];
  const walkContainer = (container, contextStart = 0, parentSourceStart = 0, primary = true) => {
    let cursor = contextStart; const ordered = [];
    for (const [key, value] of Object.entries(container || {})) if (childKinds.includes(key)) for (const node of list(value)) ordered.push({ key, node, order: Number(node.offset !== undefined ? seconds(node.offset) : cursor) });
    ordered.sort((a, b) => a.order - b.order);
    for (const { key, node } of ordered) {
      const duration = node.duration ? seconds(node.duration) : 0, lane = Number(node.lane || 0), explicit = node.offset !== undefined;
      const start = explicit ? (primary ? seconds(node.offset) : contextStart + seconds(node.offset) - parentSourceStart) : cursor;
      if (key === "gap") { addMarkers(node, start); addTitles(node, start, duration); walkContainer(node, start, seconds(node.start || "0s"), false); if (!explicit || lane === 0) cursor = Math.max(cursor, start + duration); continue; }
      if (key === "title" || key === "caption") { addTitles({ [key]: node }, start, duration || 1); if (!explicit || lane === 0) cursor = Math.max(cursor, start + duration); continue; }
      if (key === "ref-clip" && mediaResources.get(node.ref)?.sequence?.spine) walkContainer(mediaResources.get(node.ref).sequence.spine, start, seconds(node.start || "0s"), false);
      const assetId = refs.get(node.ref);
      if (assetId && duration > 0) {
        const sourceAsset = resources.get(node.ref), audio = lane < 0 || String(sourceAsset?.hasVideo) === "0" || Boolean(node.audioRole), baseTrack = audio ? `A${Math.max(1, Math.abs(lane))}` : `V${Math.max(1, lane + 1)}`, extras = readMetadata(node, "com.mycut.item") || {};
        addOnAvailableTrack(project, baseTrack, { ...extras, assetId, start: Math.max(0, start), sourceStart: Math.max(0, seconds(node.start || "0s")), duration, label: node.name || sourceAsset?.name || "clip", volumeDb: extras.volumeDb ?? (audio && node["adjust-volume"]?.amount ? Number(String(node["adjust-volume"].amount).replace("dB", "")) : 0) });
      }
      addMarkers(node, start, seconds(node.start || "0s")); addTitles(node, start, duration || 1);
      walkContainer(node, start, seconds(node.start || "0s"), false);
      if (!explicit || lane === 0) cursor = Math.max(cursor, start + duration);
    }
  };
  addMarkers(sequence, 0); addTitles(sequence, 0); walkContainer(sequence.spine, 0, 0, true);
  timeline.markers = markers.sort((a, b) => a.time - b.time); const sortedCaptions = captions.filter((cue) => cue.end > cue.start).sort((a, b) => a.start - b.start).filter((cue, index, array) => !index || cue.start >= array[index - 1].end - 0.0001); if (sortedCaptions.length) timeline.captions = { enabled: true, cues: sortedCaptions, style: {} };
  project.history.push({ at: new Date().toISOString(), action: "import_fcpxml", source: projectPath || null }); return project;
}

export function importFcpxml(inputPath, outputProjectPath, options = {}) { const project = fcpxmlToProject(readFileSync(resolve(inputPath), "utf8"), { ...options, projectPath: resolve(inputPath) }); return { project, projectPath: saveProject(outputProjectPath, project) }; }

const frameNumber = (value, fallback = 0) => { const number = Number(value); return Number.isFinite(number) ? number : fallback; };
const premiereRate = (node, fallback = 30) => Math.max(1, frameNumber(node?.rate?.timebase ?? findFirst(node, "timebase"), fallback));
const premiereFileUrl = (node) => node?.pathurl || node?.pathUrl || node?.url;
const premiereMarker = (marker, fps) => ({ id: randomUUID(), time: Math.max(0, frameNumber(marker.in ?? marker.start) / fps), duration: Math.max(0, (frameNumber(marker.out ?? marker.end, frameNumber(marker.in ?? marker.start)) - frameNumber(marker.in ?? marker.start)) / fps), name: marker.name || "Marker", note: marker.comment || marker.note || "" });

export function premiereXmlToProject(source, { projectName, projectPath } = {}) {
  const parsed = parseXml(source, "Premiere XML"), sequence = findFirst(parsed.xmeml || parsed, "sequence");
  if (!sequence?.media) throw new Error("Invalid Premiere XML: sequence media missing");
  const fps = premiereRate(sequence), characteristics = sequence.media.video?.format?.samplecharacteristics || {};
  const project = newProject({ name: projectName || sequence.name || "Imported Premiere XML", width: frameNumber(characteristics.width, 1920), height: frameNumber(characteristics.height, 1080), fps });
  const fileDefinitions = new Map();
  const collectFiles = (node) => { if (!node || typeof node !== "object") return; for (const file of list(node.file)) if (file?.id) { const prior = fileDefinitions.get(file.id) || {}; fileDefinitions.set(file.id, { ...prior, ...Object.fromEntries(Object.entries(file).filter(([, value]) => value !== undefined && value !== "")) }); } for (const [key, value] of Object.entries(node)) if (key !== "file") for (const child of list(value)) collectFiles(child); };
  collectFiles(sequence);
  const assetRefs = new Map();
  const ensureAsset = (fileNode, mediaType, fallbackDuration) => {
    const definition = fileNode?.id ? { ...(fileDefinitions.get(fileNode.id) || {}), ...fileNode } : fileNode;
    const url = premiereFileUrl(definition); if (!url) throw new Error(`Premiere file reference has no pathurl: ${fileNode?.id || "unknown"}`);
    const key = definition.id || url; if (assetRefs.has(key)) return assetRefs.get(key);
    const id = randomUUID(), fileFps = premiereRate(definition, fps), asset = { id, path: localPath(url, definition.name || key), name: definition.name || key, type: mediaType, duration: frameNumber(definition.duration, fallbackDuration * fileFps) / fileFps, hasAudio: mediaType === "audio" || Boolean(definition.media?.audio) };
    project.assets.push(asset); assetRefs.set(key, id); return id;
  };
  const audioLevel = (clip) => { for (const filter of list(clip.filter)) for (const effect of list(filter.effect)) for (const parameter of list(effect.parameter)) if (String(parameter.parameterid || parameter.name).toLowerCase() === "level") { const linear = frameNumber(parameter.value, 1); return linear > 0 ? 20 * Math.log10(linear) : -96; } return 0; };
  const importTracks = (mediaType) => {
    const media = sequence.media[mediaType]; if (!media) return;
    list(media.track).forEach((track, trackIndex) => list(track.clipitem).forEach((clip) => {
      if (String(clip.enabled || "TRUE").toUpperCase() === "FALSE") return;
      const clipFps = premiereRate(clip, fps), startFrame = frameNumber(clip.start), endFrame = frameNumber(clip.end, startFrame + frameNumber(clip.duration)), duration = Math.max(0, (endFrame - startFrame) / clipFps); if (!duration) return;
      const assetId = ensureAsset(clip.file, mediaType, duration), start = Math.max(0, startFrame / clipFps), sourceStart = Math.max(0, frameNumber(clip.in) / clipFps), add = { assetId, start, sourceStart, duration, label: clip.name || fileDefinitions.get(clip.file?.id)?.name || "clip" };
      if (mediaType === "audio") add.volumeDb = audioLevel(clip);
      addOnAvailableTrack(project, `${mediaType === "audio" ? "A" : "V"}${trackIndex + 1}`, add);
    }));
  };
  importTracks("video"); importTracks("audio");
  activeTimeline(project).markers = list(sequence.marker).map((marker) => premiereMarker(marker, fps)).sort((a, b) => a.time - b.time);
  project.history.push({ at: new Date().toISOString(), action: "import_premiere_xml", source: projectPath || null }); return project;
}

export function importPremiereXml(inputPath, outputProjectPath, options = {}) { const project = premiereXmlToProject(readFileSync(resolve(inputPath), "utf8"), { ...options, projectPath: resolve(inputPath) }); return { project, projectPath: saveProject(outputProjectPath, project) }; }

export function exportInterchange(project, outputPath, format) {
  const output = resolve(outputPath);
  mkdirSync(dirname(output), { recursive: true });
  writeFileSync(output, format === "edl" ? projectToEdl(project) : format === "premiere-xml" ? projectToPremiereXml(project) : projectToFcpxml(project));
  return output;
}
