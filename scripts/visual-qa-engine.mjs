import { spawnSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { probeOutput } from "./media-engine.mjs";

function run(command, args) {
  const result = spawnSync(command, args, { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  if (result.status !== 0) throw new Error(result.stderr || `${command} failed`);
  return { stdout: result.stdout, stderr: result.stderr };
}

export function inspectRenderedVideo(inputPath, contactSheetPath, { samples = 12, blackMinimum = 0.35, freezeMinimum = 1.5 } = {}) {
  const input = resolve(inputPath);
  const probe = probeOutput(input);
  const duration = Number(probe.format?.duration || 0);
  if (!(duration > 0)) throw new Error("Rendered media has no duration");
  const output = resolve(contactSheetPath);
  mkdirSync(dirname(output), { recursive: true });
  const columns = Math.ceil(Math.sqrt(samples));
  const rows = Math.ceil(samples / columns);
  const interval = Math.max(0.05, duration / samples);
  run("ffmpeg", ["-y", "-hide_banner", "-loglevel", "error", "-i", input, "-vf", `fps=1/${interval},scale=280:-1,tile=${columns}x${rows}:padding=4:margin=4:color=white`, "-frames:v", "1", output]);
  const detection = run("ffmpeg", ["-hide_banner", "-nostats", "-i", input, "-vf", `blackdetect=d=${blackMinimum}:pix_th=0.10,freezedetect=n=-55dB:d=${freezeMinimum}`, "-an", "-f", "null", "-"]).stderr;
  const blackSegments = [...detection.matchAll(/black_start:([\d.]+) black_end:([\d.]+) black_duration:([\d.]+)/g)].map((m) => ({ start: Number(m[1]), end: Number(m[2]), duration: Number(m[3]) }));
  const freezeStarts = [...detection.matchAll(/freeze_start: ([\d.]+)/g)].map((m) => Number(m[1]));
  const freezeEnds = [...detection.matchAll(/freeze_end: ([\d.]+) \| freeze_duration: ([\d.]+)/g)].map((m) => ({ end: Number(m[1]), duration: Number(m[2]) }));
  const frozenSegments = freezeEnds.map((entry, index) => ({ start: freezeStarts[index] ?? Math.max(0, entry.end - entry.duration), ...entry }));
  return { input, contactSheetPath: output, duration, samples, blackSegments, frozenSegments, warnings: [...blackSegments.map((segment) => `Black frame segment ${segment.start.toFixed(2)}-${segment.end.toFixed(2)}s`), ...frozenSegments.map((segment) => `Frozen segment ${segment.start.toFixed(2)}-${segment.end.toFixed(2)}s`)], probe };
}
