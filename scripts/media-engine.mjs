import { spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { activeTimeline, projectDuration } from "./project-store.mjs";
import { renderGlslVideo } from "./glsl-shader-engine.mjs";
import { renderCaptionOverlays } from "./caption-style-engine.mjs";
import { buildSpeedSegments, playbackSourceSpan, videoCurveSetptsExpression } from "./speed-curve-engine.mjs";
import { compileVisualEffectFilters } from "./visual-effects-engine.mjs";
import { compileAudioEffectFilters } from "./audio-effects-engine.mjs";

function run(command, args) {
  if (process.env.MYCUT_DEBUG_COMMANDS === "1") process.stderr.write(`[CutPilot] ${command} ${JSON.stringify(args)}\n`);
  const result = spawnSync(command, args, { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  if (result.status !== 0) throw new Error(result.stderr || `${command} failed`);
  return result.stdout;
}

const dbToLinear = (db) => Math.pow(10, Number(db || 0) / 20).toFixed(6);
const ffexpr = (value) => String(value).replace(/,/g, "\\,");
function atempoFilters(rate) { const filters = [], value = Number(rate || 1); let remaining = value; while (remaining > 2) { filters.push("atempo=2"); remaining /= 2; } while (remaining < 0.5) { filters.push("atempo=0.5"); remaining /= 0.5; } if (Math.abs(remaining - 1) > 0.0001) filters.push(`atempo=${remaining.toFixed(6)}`); return filters; }

function keyframeExpression(item, property, fallback, { localTime = false } = {}) {
  const points = (item.transform?.keyframes || []).filter((entry) => Number.isFinite(entry[property])).sort((a, b) => a.time - b.time);
  if (!points.length) return String(fallback);
  if (points.length === 1) return String(points[0][property]);
  const clock = localTime ? "t" : `(t-${item.start})`;
  let expression = String(points.at(-1)[property]);
  for (let index = points.length - 2; index >= 0; index--) {
    const left = points[index], right = points[index + 1];
    const span = Math.max(0.000001, right.time - left.time);
    const progress = `max(0,min(1,(${clock}-${left.time})/${span}))`;
    let eased = progress;
    if (left.easing === "hold") eased = "0";
    else if (left.easing === "ease-in") eased = `(${progress})*(${progress})`;
    else if (left.easing === "ease-out") eased = `1-(1-(${progress}))*(1-(${progress}))`;
    else if (left.easing === "ease-in-out") eased = `(${progress})*(${progress})*(3-2*(${progress}))`;
    else if (left.easing === "bezier") {
      const y1 = Number(left.bezier?.y1 ?? 0.25), y2 = Number(left.bezier?.y2 ?? 0.75);
      eased = `3*(1-(${progress}))*(1-(${progress}))*(${progress})*${y1}+3*(1-(${progress}))*(${progress})*(${progress})*${y2}+(${progress})*(${progress})*(${progress})`;
    }
    const interpolated = `${left[property]}+(${right[property]}-${left[property]})*(${eased})`;
    expression = `if(lte(${clock},${left.time}),${left[property]},if(lte(${clock},${right.time}),${interpolated},${expression}))`;
  }
  return expression;
}

function focusExpression(item, property, fallback = .5) {
  const points = (item.reframe?.keyframes || []).filter((entry) => Number.isFinite(entry[property])).sort((a, b) => a.time - b.time); if (!points.length) return String(fallback); if (points.length === 1) return String(points[0][property]); let expression = String(points.at(-1)[property]);
  for (let index = points.length - 2; index >= 0; index--) { const left = points[index], right = points[index + 1], span = Math.max(.000001, right.time - left.time), progress = `max(0,min(1,(t-${left.time})/${span}))`, eased = `(${progress})*(${progress})*(3-2*(${progress}))`, value = `${left[property]}+(${right[property]}-${left[property]})*(${eased})`; expression = `if(lte(t,${left.time}),${left[property]},if(lte(t,${right.time}),${value},${expression}))`; }
  return expression;
}

function animatedPosition(item, axis, canvasSize, clipSize, incomingTransition = null) {
  const transform = item.transform || {};
  const target = Number(transform[axis] ?? Math.round((canvasSize - clipSize) / 2));
  const animation = transform.animation || {};
  const enterDuration = Math.min(Number(animation.enterDuration || 0.35), item.duration / 2);
  const exitDuration = Math.min(Number(animation.exitDuration || 0.3), item.duration / 2);
  let expression = keyframeExpression(item, axis, target);
  const distance = Number(animation.distance || Math.max(60, Math.round(canvasSize * 0.12)));
  const enterOffset = animation.enter === `slide-${axis === "x" ? "left" : "up"}` ? -distance : animation.enter === `slide-${axis === "x" ? "right" : "down"}` ? distance : 0;
  if (enterOffset && enterDuration > 0) {
    const end = item.start + enterDuration;
    expression = `if(lt(t,${end}),${target + enterOffset}+(${target}-${target + enterOffset})*(t-${item.start})/${enterDuration},${expression})`;
  }
  const exitOffset = animation.exit === `slide-${axis === "x" ? "left" : "up"}` ? -distance : animation.exit === `slide-${axis === "x" ? "right" : "down"}` ? distance : 0;
  if (exitOffset && exitDuration > 0) {
    const begin = item.start + item.duration - exitDuration;
    expression = `if(gte(t,${begin}),${target}+(${target + exitOffset}-${target})*(t-${begin})/${exitDuration},${expression})`;
  }
  if (animation.float && Number(animation.floatAmplitude || 0) !== 0) {
    const amplitude = Number(animation.floatAmplitude || 8);
    const frequency = Number(animation.floatFrequency || 0.6);
    expression = `(${expression})+${amplitude}*sin(2*PI*${frequency}*(t-${item.start}))`;
  }
  if (incomingTransition?.type?.startsWith("slide-") && incomingTransition.duration > 0) {
    const direction = incomingTransition.type.slice(6);
    const relevant = axis === "x" ? ["left", "right"].includes(direction) : ["up", "down"].includes(direction);
    if (relevant) {
      const offset = direction === "left" || direction === "up" ? canvasSize : -canvasSize;
      const begin = item.start - incomingTransition.duration;
      expression = `if(lt(t,${item.start}),${target}+${offset}*(1-(t-${begin})/${incomingTransition.duration}),${expression})`;
    }
  }
  return ffexpr(expression);
}

function transitionMask(type, duration) {
  const progress = `min(1,max(0,T/${duration}))`;
  let alpha = null;
  if (type === "wipe-left") alpha = `if(lte(X/W,${progress}),alpha(X,Y),0)`;
  else if (type === "wipe-right") alpha = `if(gte(X/W,1-${progress}),alpha(X,Y),0)`;
  else if (type === "wipe-down") alpha = `if(lte(Y/H,${progress}),alpha(X,Y),0)`;
  else if (type === "wipe-up") alpha = `if(gte(Y/H,1-${progress}),alpha(X,Y),0)`;
  else if (type === "radial") alpha = `if(lte(hypot(X-W/2,Y-H/2),hypot(W/2,H/2)*${progress}),alpha(X,Y),0)`;
  if (!alpha) return null;
  return `geq=r='r(X,Y)':g='g(X,Y)':b='b(X,Y)':a='${ffexpr(alpha)}'`;
}
const srtTime = (seconds) => {
  const ms = Math.max(0, Math.round(seconds * 1000));
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")},${String(ms % 1000).padStart(3, "0")}`;
};

export function cuesToSrt(cues) {
  return cues.map((cue, index) => `${index + 1}\n${srtTime(cue.start)} --> ${srtTime(cue.end)}\n${cue.text.trim()}\n`).join("\n");
}

export function cuesToTxt(cues) {
  return cues.map((cue) => cue.text.trim()).filter(Boolean).join("\n");
}

export function renderProject(project, outputPath, { codec = "h264", crf = 20, burnCaptions = false, audioOnly = false, audioCodec = "aac" } = {}) {
  const timeline = activeTimeline(project);
  const duration = audioOnly ? Math.max(0, ...timeline.tracks.filter((track) => track.type === "audio" && !track.muted).flatMap((track) => track.items.map((item) => item.start + item.duration))) : projectDuration(timeline);
  if (duration <= 0) throw new Error("Timeline is empty");
  const assets = new Map(project.assets.map((asset) => [asset.id, asset]));
  const videoTracks = audioOnly ? [] : timeline.tracks.filter((track) => track.type === "video" && !track.muted);
  const audioTracks = timeline.tracks.filter((track) => track.type === "audio" && !track.muted);
  const inputItems = [];
  for (const track of videoTracks) for (const item of track.items) inputItems.push({ track, item, kind: "video", asset: assets.get(item.assetId) });
  for (const track of audioTracks) for (const item of track.items) inputItems.push({ track, item, kind: "audio", asset: assets.get(item.assetId) });
  if (!audioOnly && !inputItems.some((entry) => entry.kind === "video")) throw new Error("No visible video items");
  if (audioOnly && !inputItems.some((entry) => entry.kind === "audio")) throw new Error("No audible audio items");

  const args = [];
  inputItems.forEach((entry) => {
    const { item, asset, kind } = entry;
    if (!asset) throw new Error(`Missing asset ${item.assetId}`);
    const shader = kind === "video" ? (item.effects || []).find((effect) => effect.type === "glsl") : null;
    if (shader) {
      const output = join(tmpdir(), "mycut-glsl", `clip-${item.id}.mp4`);
      renderGlslVideo({ inputPath: asset.path, outputPath: output, fragmentSource: shader.source, uniforms: shader.uniforms || {}, width: timeline.width, height: timeline.height, fps: timeline.fps, duration: playbackSourceSpan(item), sourceStart: item.sourceStart });
      entry.renderPath = output; entry.shaderRendered = true;
    }
    if (kind === "video" && item.freezeFrame && asset.type !== "image") {
      const freezeImage = join(tmpdir(), "mycut-render", `freeze-${item.id}.png`), freezeVideo = join(tmpdir(), "mycut-render", `freeze-${item.id}.mp4`); mkdirSync(dirname(freezeImage), { recursive: true });
      run("ffmpeg", ["-y", "-hide_banner", "-loglevel", "error", "-ss", String(entry.shaderRendered ? 0 : item.sourceStart), "-i", entry.renderPath || asset.path, "-frames:v", "1", freezeImage]);
      run("ffmpeg", ["-y", "-hide_banner", "-loglevel", "error", "-loop", "1", "-i", freezeImage, "-t", String(item.duration), "-r", String(timeline.fps), "-c:v", "libx264", "-pix_fmt", "yuv420p", freezeVideo]); entry.renderPath = freezeVideo; entry.freezeRendered = true;
    }
    if (asset.type === "image" || (asset.type === "motion-graphic" && !asset.duration)) args.push("-loop", "1");
    args.push("-i", entry.renderPath || asset.path);
  });
  const captionInputs = [];
  if (!audioOnly && burnCaptions && timeline.captions?.enabled && timeline.captions.cues?.length) {
    const folder = join(tmpdir(), "mycut-render", `captions-${Date.now()}`);
    renderCaptionOverlays(timeline, folder).forEach((event, index) => {
      args.push("-loop", "1", "-i", event.path);
      captionInputs.push({ ...event, inputIndex: inputItems.length + index });
    });
  }

  const filters = audioOnly ? [] : [`color=c=black:s=${timeline.width}x${timeline.height}:r=${timeline.fps}:d=${duration.toFixed(6)}[base]`];
  const incomingTransitions = new Map();
  const overlapTransitions = new Set(["cross-dissolve", "wipe-left", "wipe-right", "wipe-up", "wipe-down", "radial", "slide-left", "slide-right", "slide-up", "slide-down"]);
  for (const track of videoTracks) {
    const sorted = [...track.items].sort((a, b) => a.start - b.start);
    for (let index = 1; index < sorted.length; index++) {
      const previous = sorted[index - 1], current = sorted[index];
      const transition = previous.transitionOut || current.transitionIn || null;
      if (transition && Math.abs(previous.start + previous.duration - current.start) < 0.05) incomingTransitions.set(current.id, { ...transition, duration: Math.min(transition.duration, previous.duration / 2, current.duration / 2), overlap: overlapTransitions.has(transition.type) });
    }
  }
  let videoLabel = "base";
  let overlayIndex = 0;
  inputItems.forEach(({ item, kind, track }, inputIndex) => {
    if (kind !== "video") return;
    const clipLabel = `vclip${inputIndex}`;
    const nextLabel = `vstage${overlayIndex++}`;
    const end = item.start + item.duration;
    const playbackRate = Number(item.playbackRate || 1), reversePlayback = Boolean(item.reverse), freezeFrame = Boolean(item.freezeFrame);
    const curveSegments = buildSpeedSegments(item.speedCurve, item.duration, playbackRate, 1 / Math.min(30, timeline.fps));
    const incomingTransition = incomingTransitions.get(item.id) || null;
    const preRoll = incomingTransition?.overlap && !reversePlayback && !freezeFrame && !curveSegments.length ? incomingTransition.duration : 0;
    const visualStart = Math.max(0, item.start - preRoll);
    const availablePreRoll = Math.min(preRoll, item.sourceStart / playbackRate);
    const heldPreRoll = preRoll - availablePreRoll;
    const trimStart = inputItems[inputIndex].shaderRendered || inputItems[inputIndex].freezeRendered ? 0 : Math.max(0, item.sourceStart - availablePreRoll * playbackRate);
    const targetWidth = Math.round(item.transform?.width || timeline.width);
    const targetHeight = Math.round(item.transform?.height || timeline.height);
    const fit = item.transform?.fit || "cover";
    let sourceLabel = `${inputIndex}:v`;
    const chain = [];
    if (curveSegments.length && !freezeFrame) {
      const span = curveSegments.at(-1).sourceEnd;
      chain.push(`trim=start=${trimStart}:duration=${span}`, "setpts=PTS-STARTPTS");
      if (reversePlayback) chain.push("reverse", "setpts=PTS-STARTPTS");
      chain.push(`setpts='${ffexpr(videoCurveSetptsExpression(curveSegments))}'`, `fps=${timeline.fps}`, `tpad=stop_mode=clone:stop_duration=${1 / timeline.fps}`, `trim=duration=${item.duration}`, "setpts=PTS-STARTPTS");
    } else {
      const sourceDuration = freezeFrame ? item.duration : (item.duration + availablePreRoll) * playbackRate;
      chain.push(`trim=start=${trimStart}:duration=${sourceDuration}`);
      if (reversePlayback && !freezeFrame) chain.push("reverse");
      chain.push(playbackRate !== 1 && !freezeFrame ? `setpts=(PTS-STARTPTS)/${playbackRate}` : "setpts=PTS-STARTPTS");
    }
    if (heldPreRoll > 0) chain.push(`tpad=start_mode=clone:start_duration=${heldPreRoll}`);
    chain.push(`scale=${targetWidth}:${targetHeight}:force_original_aspect_ratio=${fit === "contain" ? "decrease" : "increase"}`);
    if (fit === "cover" && item.reframe?.keyframes?.length) { const focusX = ffexpr(focusExpression(item, "focusX")), focusY = ffexpr(focusExpression(item, "focusY")); chain.push(`crop=${targetWidth}:${targetHeight}:x='max(0,min(iw-ow,(${focusX})*iw-ow/2))':y='max(0,min(ih-oh,(${focusY})*ih-oh/2))'`); }
    else if (fit === "cover") chain.push(`crop=${targetWidth}:${targetHeight}`);
    else chain.push(`pad=${targetWidth}:${targetHeight}:(ow-iw)/2:(oh-ih)/2:color=0x00000000`);
    chain.push(`fps=${timeline.fps}`);
    chain.push(...compileVisualEffectFilters(item.effects || [], { canvasWidth: timeline.width, canvasHeight: timeline.height }).filters);
    const scale = keyframeExpression(item, "scale", Number(item.transform?.scale || 1), { localTime: true });
    if (scale !== "1") chain.push(`scale=w='iw*(${ffexpr(scale)})':h='ih*(${ffexpr(scale)})':eval=frame`);
    const rotation = keyframeExpression(item, "rotation", Number(item.transform?.rotation || 0), { localTime: true });
    if (rotation !== "0") chain.push(`rotate='${ffexpr(rotation)}*PI/180':c=none:ow=rotw(iw):oh=roth(ih)`);
    chain.push("format=rgba", `colorchannelmixer=aa=${Number(item.opacity ?? 1) * Number(track.opacity ?? 1)}`);
    const opacity = keyframeExpression(item, "opacity", 1, { localTime: true });
    if (opacity !== "1") chain.push(`geq=r='r(X,Y)':g='g(X,Y)':b='b(X,Y)':a='${ffexpr(`alpha(X,Y)*(${opacity.replace(/\bt\b/g, "T")})`)}'`);
    const mask = incomingTransition ? transitionMask(incomingTransition.type, incomingTransition.duration) : null;
    if (mask) chain.push(mask);
    const animation = item.transform?.animation || {};
    const incomingFade = incomingTransition && ["cross-dissolve", "dip-black", "fade"].includes(incomingTransition.type) ? incomingTransition.duration : 0;
    const ownTransitionInFade = item.transitionIn && ["cross-dissolve", "dip-black", "fade"].includes(item.transitionIn.type) ? item.transitionIn.duration : 0;
    const ownTransitionOutFade = item.transitionOut && ["cross-dissolve", "dip-black", "fade"].includes(item.transitionOut.type) ? item.transitionOut.duration : 0;
    const fadeIn = incomingFade || item.fadeIn || ownTransitionInFade || (animation.enter === "fade" ? animation.enterDuration || 0.35 : 0);
    const fadeOut = item.fadeOut || ownTransitionOutFade || (animation.exit === "fade" ? animation.exitDuration || 0.3 : 0);
    if (fadeIn > 0) chain.push(`fade=t=in:st=0:d=${Math.min(fadeIn, item.duration / 2)}:alpha=1`);
    if (fadeOut > 0) chain.push(`fade=t=out:st=${Math.max(0, item.duration - fadeOut)}:d=${Math.min(fadeOut, item.duration / 2)}:alpha=1`);
    chain.push(`setpts=PTS+${visualStart}/TB`);
    filters.push(`[${sourceLabel}]${chain.join(",")}[${clipLabel}]`);
    const x = animatedPosition(item, "x", timeline.width, targetWidth, incomingTransition);
    const y = animatedPosition(item, "y", timeline.height, targetHeight, incomingTransition);
    filters.push(`[${videoLabel}][${clipLabel}]overlay=x='${x}':y='${y}':eof_action=pass:enable='between(t,${visualStart},${end})'[${nextLabel}]`);
    videoLabel = nextLabel;
  });

  captionInputs.forEach(({ start, end, position, margin, inputIndex }, index) => {
    const nextLabel = `captionstage${index}`;
    filters.push(`[${inputIndex}:v]format=rgba[caption${index}]`);
    const y = position === "top" ? margin : position === "center" ? "(H-h)/2" : `H-h-${margin}`;
    filters.push(`[${videoLabel}][caption${index}]overlay=(W-w)/2:${y}:eof_action=pass:enable='between(t,${start},${end})'[${nextLabel}]`);
    videoLabel = nextLabel;
  });

  const audioLabels = [];
  inputItems.forEach(({ item, kind, track }, inputIndex) => {
    if (kind !== "audio") return;
    const delay = Math.max(0, Math.round(item.start * 1000));
    const label = `aclip${inputIndex}`;
    const playbackRate = Number(item.playbackRate || 1);
    const curveSegments = buildSpeedSegments(item.speedCurve, item.duration, playbackRate);
    let sourceLabel = `${inputIndex}:a`;
    const chain = [];
    if (curveSegments.length) {
      const span = curveSegments.at(-1).sourceEnd;
      const labels = curveSegments.map((segment, segmentIndex) => {
        const segmentLabel = `acurve${inputIndex}_${segmentIndex}`;
        const offset = item.reverse ? span - segment.sourceEnd : segment.sourceStart;
        const segmentChain = [`atrim=start=${item.sourceStart + offset}:duration=${segment.sourceDuration}`, "asetpts=PTS-STARTPTS"];
        if (item.reverse) segmentChain.push("areverse");
        segmentChain.push(...atempoFilters(segment.rate));
        filters.push(`[${inputIndex}:a]${segmentChain.join(",")}[${segmentLabel}]`);
        return `[${segmentLabel}]`;
      });
      sourceLabel = `acurve${inputIndex}`;
      filters.push(`${labels.join("")}concat=n=${labels.length}:v=0:a=1[${sourceLabel}]`);
    } else {
      chain.push(`atrim=start=${item.sourceStart}:duration=${item.duration * playbackRate}`, "asetpts=PTS-STARTPTS");
      if (item.reverse) chain.push("areverse");
      chain.push(...atempoFilters(playbackRate));
    }
    chain.push(...compileAudioEffectFilters(item.audioEffects || []).filters);
    if (track.denoise) chain.push("highpass=f=70", "afftdn=nf=-25");
    if (Number.isFinite(track.normalizeLufs)) chain.push(`loudnorm=I=${track.normalizeLufs}:TP=-1.5:LRA=11`);
    chain.push(`volume=${dbToLinear(Number(item.volumeDb || 0) + Number(track.volumeDb || 0))}`);
    if (item.audioFadeIn > 0) chain.push(`afade=t=in:st=0:d=${Math.min(item.audioFadeIn, item.duration / 2)}`);
    if (item.audioFadeOut > 0) chain.push(`afade=t=out:st=${Math.max(0, item.duration - item.audioFadeOut)}:d=${Math.min(item.audioFadeOut, item.duration / 2)}`);
    chain.push(`adelay=${delay}|${delay}`);
    filters.push(`[${sourceLabel}]${chain.join(",")}[${label}]`);
    audioLabels.push({ label, role: track.role || "mix" });
  });
  let audioLabel = null;
  if (audioLabels.length) {
    const mixGroup = (entries, name) => {
      if (entries.length === 1) { filters.push(`[${entries[0].label}]anull[${name}]`); return name; }
      filters.push(`${entries.map((entry) => `[${entry.label}]`).join("")}amix=inputs=${entries.length}:duration=longest:dropout_transition=0[${name}]`);
      return name;
    };
    const anchors = audioLabels.filter((entry) => entry.role === "anchor");
    const followers = audioLabels.filter((entry) => entry.role === "follower");
    const mixes = audioLabels.filter((entry) => entry.role !== "anchor" && entry.role !== "follower");
    const anchorLabel = anchors.length ? mixGroup(anchors, "anchorMix") : null;
    const followerLabel = followers.length ? mixGroup(followers, "followerMix") : null;
    const mixLabel = mixes.length ? mixGroup(mixes, "regularMix") : null;
    const finalInputs = [];
    if (anchorLabel && followerLabel) {
      filters.push(`[${anchorLabel}]asplit=2[anchorForMix][anchorKey]`);
      filters.push(`[${followerLabel}][anchorKey]sidechaincompress=threshold=0.03:ratio=10:attack=20:release=350[duckedFollowers]`);
      finalInputs.push("[anchorForMix]", "[duckedFollowers]");
    } else {
      if (anchorLabel) finalInputs.push(`[${anchorLabel}]`);
      if (followerLabel) finalInputs.push(`[${followerLabel}]`);
    }
    if (mixLabel) finalInputs.push(`[${mixLabel}]`);
    filters.push(`${finalInputs.join("")}amix=inputs=${finalInputs.length}:duration=longest:dropout_transition=0,alimiter=limit=0.95[aout]`);
    audioLabel = "aout";
  }

  args.push("-filter_complex", filters.join(";"));
  if (!audioOnly) args.push("-map", `[${videoLabel}]`);
  if (audioLabel) {
    args.push("-map", `[${audioLabel}]`);
    if (audioOnly && audioCodec === "wav") args.push("-c:a", "pcm_s24le");
    else if (audioOnly && audioCodec === "flac") args.push("-c:a", "flac");
    else if (audioOnly && audioCodec === "mp3") args.push("-c:a", "libmp3lame", "-b:a", "256k");
    else args.push("-c:a", "aac", "-b:a", "192k");
  }
  const output = resolve(outputPath);
  mkdirSync(dirname(output), { recursive: true });
  if (!audioOnly && codec === "vp8") args.push("-c:v", "libvpx", "-crf", String(crf), "-b:v", "0");
  else if (!audioOnly) args.push("-c:v", "libx264", "-preset", "medium", "-crf", String(crf), "-pix_fmt", "yuv420p", "-movflags", "+faststart");
  args.push("-t", String(duration), "-y", output);
  run("ffmpeg", args);
  return { outputPath: output, duration, audioOnly, audioCodec: audioOnly ? audioCodec : "aac", videoItems: inputItems.filter((i) => i.kind === "video").length, audioItems: audioLabels.length, duckingApplied: audioLabels.some((entry) => entry.role === "anchor") && audioLabels.some((entry) => entry.role === "follower"), captionsBurned: Boolean(!audioOnly && burnCaptions && timeline.captions?.enabled && timeline.captions.cues?.length) };
}

export function probeOutput(path) {
  const raw = run("ffprobe", ["-v", "error", "-show_entries", "format=duration,size:stream=codec_type,codec_name,width,height,r_frame_rate", "-of", "json", path]);
  return JSON.parse(raw);
}

export function exportMotionGraphicAsset(asset, outputPath, { duration, fps = 30 } = {}) {
  if (!asset?.motionGraphic || asset.type !== "motion-graphic") throw new Error("Asset is not an editable Motion Graphic");
  const output = resolve(outputPath); if (!output.toLowerCase().endsWith(".mov")) throw new Error("Motion Graphic export path must end in .mov");
  const exportDuration = Number(duration || asset.duration || asset.motionGraphic.duration || 3); if (!(exportDuration > 0) || !(Number(fps) > 0)) throw new Error("Motion Graphic export requires positive duration and fps");
  mkdirSync(dirname(output), { recursive: true }); const args = ["-y", "-hide_banner", "-loglevel", "error"];
  if (!asset.duration) args.push("-loop", "1", "-framerate", String(fps)); args.push("-i", asset.path, "-t", String(exportDuration), "-r", String(fps), "-an", "-c:v", "prores_ks", "-profile:v", "4", "-pix_fmt", "yuva444p10le", output); run("ffmpeg", args);
  return { outputPath: output, duration: exportDuration, fps: Number(fps), codec: "prores", profile: "4444", alpha: true, assetId: asset.id };
}
