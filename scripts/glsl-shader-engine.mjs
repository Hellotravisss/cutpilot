import { createHash } from "node:crypto";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";

const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const run = (command, args) => { const result = spawnSync(command, args, { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 }); if (result.status) throw new Error(result.stderr || `${command} failed`); return result.stdout; };

export function validateGlslSource(source) {
  const errors = [];
  const text = String(source || "");
  if (!text.includes("void main")) errors.push("Shader must declare void main");
  if (text.length > 20000) errors.push("Shader source exceeds 20KB");
  if (/\b(?:while|do)\s*\(/.test(text)) errors.push("Unbounded while/do loops are not allowed");
  if (/^\s*#\s*(?:extension|include)/m.test(text)) errors.push("Shader extensions/includes are not allowed");
  if (/sampler(?:2D|Cube)\s+(?!u_texture\b)/.test(text)) errors.push("Only the supplied u_texture sampler is allowed");
  return { valid: errors.length === 0, errors };
}

export function renderGlslVideo({ inputPath, outputPath, fragmentSource, uniforms = {}, width, height, fps, duration, sourceStart = 0 }) {
  const validation = validateGlslSource(fragmentSource); if (!validation.valid) throw new Error(validation.errors.join("; "));
  if (!existsSync(CHROME)) throw new Error("Google Chrome is required for the local WebGL shader runtime");
  const fingerprint = createHash("sha256").update(JSON.stringify({ inputPath, fragmentSource, uniforms, width, height, fps, duration, sourceStart })).digest("hex").slice(0, 20);
  const folder = join(tmpdir(), "mycut-glsl", fingerprint), inputFrames = join(folder, "input"), outputFrames = join(folder, "output");
  mkdirSync(inputFrames, { recursive: true }); mkdirSync(outputFrames, { recursive: true }); mkdirSync(dirname(resolve(outputPath)), { recursive: true });
  run("ffmpeg", ["-y", "-hide_banner", "-loglevel", "error", "-ss", String(sourceStart), "-i", resolve(inputPath), "-t", String(duration), "-vf", `fps=${fps},scale=${width}:${height}:force_original_aspect_ratio=increase,crop=${width}:${height}`, join(inputFrames, "%06d.png")]);
  const jobPath = join(folder, "job.json");
  writeFileSync(jobPath, JSON.stringify({ inputFrames, outputFrames, fragmentSource, uniforms, width, height, fps }));
  run(process.execPath, [resolve(dirname(new URL(import.meta.url).pathname), "glsl-shader-worker.mjs"), jobPath]);
  run("ffmpeg", ["-y", "-hide_banner", "-loglevel", "error", "-framerate", String(fps), "-i", join(outputFrames, "%06d.png"), "-c:v", "libx264", "-pix_fmt", "yuv420p", resolve(outputPath)]);
  return { outputPath: resolve(outputPath), backend: "chrome-webgl1", fingerprint };
}
