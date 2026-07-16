import { existsSync, mkdirSync, rmSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";

const run = (command, args) => { const result = spawnSync(command, args, { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 }); if (result.status !== 0) throw new Error(result.stderr || `${command} failed`); return result.stdout; };
const probe = (path) => { const data = JSON.parse(run("ffprobe", ["-v", "error", "-show_entries", "format=duration,size:stream=codec_type,codec_name,width,height,r_frame_rate", "-of", "json", path])); const video = data.streams?.find((stream) => stream.codec_type === "video"), audio = data.streams?.find((stream) => stream.codec_type === "audio"); return { duration: Number(data.format?.duration || 0), size: Number(data.format?.size || 0), width: video?.width || null, height: video?.height || null, codec: video?.codec_name || null, fps: video?.r_frame_rate || null, hasAudio: Boolean(audio), audioCodec: audio?.codec_name || null }; };

export function sourceFingerprint(path) { const source = resolve(path); if (!existsSync(source)) return null; const stat = statSync(source); return { path: source, size: stat.size, mtimeMs: Math.round(stat.mtimeMs) }; }
const sameFingerprint = (left, right) => Boolean(left && right && left.path === right.path && left.size === right.size && Math.abs(left.mtimeMs - right.mtimeMs) <= 1);

export function proxyStatus(asset) {
  if (!asset?.proxy) return { status: "none", assetId: asset?.id, reason: "not-generated" };
  const source = sourceFingerprint(asset.path), proxyOnline = existsSync(asset.proxy.path);
  if (!proxyOnline) return { status: "missing", assetId: asset.id, reason: "proxy-file-missing", proxy: asset.proxy };
  if (!sameFingerprint(source, asset.proxy.sourceFingerprint)) return { status: "stale", assetId: asset.id, reason: "source-changed", proxy: asset.proxy, currentSourceFingerprint: source };
  return { status: "ready", assetId: asset.id, proxy: asset.proxy };
}

export function generateVideoProxy(projectPath, asset, { profile = "720p", quality = 23, includeAudio = true } = {}) {
  if (!asset || asset.type !== "video") throw new Error("Proxy generation requires a video asset"); if (!existsSync(asset.path)) throw new Error(`Source media is offline: ${asset.path}`);
  const heights = { "540p": 540, "720p": 720, "1080p": 1080 }; if (!heights[profile]) throw new Error(`Unknown proxy profile: ${profile}`); if (!(quality >= 18 && quality <= 32)) throw new Error("Proxy quality must be CRF 18-32");
  const folder = join(dirname(resolve(projectPath)), "mycut-assets", "proxies"), outputPath = join(folder, `${asset.id}-${profile}.mp4`); mkdirSync(folder, { recursive: true });
  const args = ["-y", "-hide_banner", "-loglevel", "error", "-i", resolve(asset.path), "-map", "0:v:0", ...(includeAudio && asset.hasAudio ? ["-map", "0:a:0?"] : []), "-vf", `scale=-2:'min(${heights[profile]},ih)'`, "-c:v", "libx264", "-preset", "veryfast", "-crf", String(quality), "-pix_fmt", "yuv420p", "-movflags", "+faststart", ...(includeAudio && asset.hasAudio ? ["-c:a", "aac", "-b:a", "128k"] : ["-an"]), outputPath]; run("ffmpeg", args);
  const original = probe(asset.path), generated = probe(outputPath); if (!generated.width || !generated.height || generated.height > heights[profile] + 2) throw new Error("Generated proxy has invalid dimensions"); if (Math.abs(generated.duration - original.duration) > Math.max(.1, original.duration * .002)) { rmSync(outputPath, { force: true }); throw new Error("Generated proxy duration does not match source"); }
  asset.proxy = { path: outputPath, profile, quality, includeAudio: Boolean(includeAudio && asset.hasAudio), sourceFingerprint: sourceFingerprint(asset.path), generatedAt: new Date().toISOString(), original, media: generated };
  return { assetId: asset.id, status: "ready", proxy: asset.proxy, compressionRatio: original.size ? Number((generated.size / original.size).toFixed(4)) : null };
}

export function scanProxyStatus(project) { const assets = project.assets.filter((asset) => asset.type === "video").map((asset) => ({ id: asset.id, name: asset.name, ...proxyStatus(asset) })); return { assets, ready: assets.filter((entry) => entry.status === "ready").length, stale: assets.filter((entry) => entry.status === "stale").length, missing: assets.filter((entry) => entry.status === "missing").length, none: assets.filter((entry) => entry.status === "none").length }; }

export function detachVideoProxy(projectPath, asset, { deleteFile = false } = {}) {
  if (!asset?.proxy) return { assetId: asset?.id, detached: false, deleted: false }; const path = resolve(asset.proxy.path), expectedRoot = resolve(dirname(projectPath), "mycut-assets", "proxies"); let deleted = false;
  if (deleteFile) { if (!(path === expectedRoot || path.startsWith(`${expectedRoot}/`))) throw new Error("Refusing to delete a proxy outside the project proxy folder"); rmSync(path, { force: true }); deleted = true; }
  delete asset.proxy; return { assetId: asset.id, detached: true, deleted, path };
}

export function resolvePreviewMedia(asset, { preferProxy = true } = {}) { const status = proxyStatus(asset); return preferProxy && status.status === "ready" ? { path: asset.proxy.path, usingProxy: true, status } : { path: asset.path, usingProxy: false, status }; }
