import { createHash } from "node:crypto";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { buildSync } from "esbuild";

const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const run = (command, args, timeout = 120000) => { const result = spawnSync(command, args, { encoding: "utf8", timeout, maxBuffer: 64 * 1024 * 1024 }); if (result.error) throw result.error; if (result.status) throw new Error(result.stderr || `${command} failed`); return result.stdout; };
export function validateJsxMotionSource(source) {
  const text = String(source || ""), errors = [];
  if (!/\bfunction\s+MotionGraphic\b|\bconst\s+MotionGraphic\s*=/.test(text)) errors.push("Source must define MotionGraphic");
  if (text.length > 30000) errors.push("JSX source exceeds 30KB");
  if (/\b(?:import|export)\b/.test(text)) errors.push("Imports/exports are not allowed; React is provided");
  if (/\b(?:eval|Function|fetch|WebSocket|XMLHttpRequest|Worker|SharedWorker)\b/.test(text)) errors.push("Dynamic code and network APIs are not allowed");
  if (/\b(?:while|do)\s*\(/.test(text)) errors.push("Unbounded while/do loops are not allowed");
  return { valid: errors.length === 0, errors };
}
export function renderJsxMotionGraphic({ source, props = {}, outputPath, width, height, fps, duration }) {
  const validation = validateJsxMotionSource(source); if (!validation.valid) throw new Error(validation.errors.join("; "));
  if (!existsSync(CHROME)) throw new Error("Google Chrome is required for JSX Motion Graphics");
  if (!(width > 0 && height > 0 && fps > 0 && duration > 0) || duration * fps > 1800) throw new Error("JSX MG requires positive dimensions/timing and at most 1800 frames");
  const fingerprint = createHash("sha256").update(JSON.stringify({ source, props, width, height, fps, duration })).digest("hex").slice(0, 20);
  const folder = join(tmpdir(), "mycut-jsx-mg", fingerprint), frames = join(folder, "frames"), entry = join(folder, "entry.jsx"), bundle = join(folder, "bundle.js"); mkdirSync(frames, { recursive: true }); mkdirSync(dirname(resolve(outputPath)), { recursive: true });
  writeFileSync(entry, `import React from 'react';import{createRoot}from'react-dom/client';\n${source}\nconst root=createRoot(document.getElementById('root'));window.__render=(p)=>new Promise(resolve=>{root.render(React.createElement(MotionGraphic,p));requestAnimationFrame(()=>requestAnimationFrame(resolve));});`);
  buildSync({ entryPoints: [entry], outfile: bundle, bundle: true, platform: "browser", format: "iife", jsx: "automatic", minify: false, logLevel: "silent", nodePaths: [resolve(dirname(new URL(import.meta.url).pathname), "..", "node_modules")] });
  const jobPath = join(folder, "job.json"); writeFileSync(jobPath, JSON.stringify({ bundle, frames, props, width, height, fps, duration, totalFrames: Math.ceil(duration * fps) }));
  run(process.execPath, [resolve(dirname(new URL(import.meta.url).pathname), "jsx-motion-graphics-worker.mjs"), jobPath], Math.max(120000, Math.ceil(duration * fps) * 2000));
  run("ffmpeg", ["-y", "-hide_banner", "-loglevel", "error", "-framerate", String(fps), "-i", join(frames, "%06d.png"), "-c:v", "qtrle", "-pix_fmt", "argb", resolve(outputPath)]);
  return { outputPath: resolve(outputPath), fingerprint, backend: "react-chrome-qtrle", frames: Math.ceil(duration * fps) };
}
