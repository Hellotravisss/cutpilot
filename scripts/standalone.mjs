#!/usr/bin/env node
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, readdirSync, statSync } from "node:fs";
import { basename, extname, join, resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { createProjectFromStarter } from "./project-starter-engine.mjs";
import { loadProject, saveProject } from "./project-store.mjs";
import { openReviewSession } from "./review-server-engine.mjs";

const args = process.argv.slice(2), value = (name, fallback) => { const index = args.indexOf(name); return index >= 0 ? args[index + 1] : fallback; };
if (args.includes("--help")) { console.log("cutpilot --project /path/video.cutpilot.json [--name Name] [--starter vlog] [--media /path/to/media]"); process.exit(0); }
const projectPath = resolve(value("--project", `${process.cwd()}/CutPilot Project.cutpilot.json`)), mediaFolder = value("--media", ""), starterId = value("--starter", "vlog"), name = value("--name", basename(projectPath).replace(/\.cutpilot\.json$/i, ""));
const supported = new Set([".mov", ".mp4", ".m4v", ".webm", ".mkv", ".wav", ".mp3", ".m4a", ".aac", ".flac", ".ogg", ".png", ".jpg", ".jpeg", ".webp", ".gif"]);
const walk = (folder) => readdirSync(folder).flatMap((entry) => { const path = join(folder, entry); return statSync(path).isDirectory() ? walk(path) : [path]; });
const probe = (path) => JSON.parse(execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration:stream=codec_type,width,height,r_frame_rate", "-of", "json", path], { encoding: "utf8" }));

if (!existsSync(projectPath)) {
  const project = createProjectFromStarter({ name, starterId, brief: { objective: "Created in standalone CutPilot" } });
  if (mediaFolder) for (const path of walk(resolve(mediaFolder)).filter((entry) => supported.has(extname(entry).toLowerCase()))) {
    const ext = extname(path).toLowerCase(), type = [".png", ".jpg", ".jpeg", ".webp", ".gif"].includes(ext) ? "image" : [".wav", ".mp3", ".m4a", ".aac", ".flac", ".ogg"].includes(ext) ? "audio" : "video", data = type === "image" ? { streams: [], format: {} } : probe(path), video = data.streams?.find((stream) => stream.codec_type === "video"), audio = data.streams?.find((stream) => stream.codec_type === "audio");
    project.assets.push({ id: randomUUID(), path, name: basename(path), type, duration: type === "image" ? null : Number(data.format?.duration || 0), width: video?.width || null, height: video?.height || null, fps: video?.r_frame_rate || null, hasAudio: Boolean(audio) });
  }
  saveProject(projectPath, project);
} else loadProject(projectPath);

const session = await openReviewSession({ projectPath });
console.log(`CutPilot is running: ${session.url}`);
if (!args.includes("--no-open")) spawnSync("open", [session.url]);
process.on("SIGINT", () => process.exit(0));
await new Promise(() => {});
