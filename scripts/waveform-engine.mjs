import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

export function ensureWaveform(projectPath, asset, { width = 1200, height = 96 } = {}) {
  const folder = join(dirname(resolve(projectPath)), ".mycut-waveforms");
  mkdirSync(folder, { recursive: true });
  const output = join(folder, `${asset.id}-${width}x${height}.png`);
  if (existsSync(output)) return output;
  const result = spawnSync("ffmpeg", ["-y", "-hide_banner", "-loglevel", "error", "-i", asset.path, "-filter_complex", `aformat=channel_layouts=mono,showwavespic=s=${width}x${height}:colors=4ade80`, "-frames:v", "1", output], { encoding: "utf8", maxBuffer: 32 * 1024 * 1024 });
  if (result.status !== 0) throw new Error(result.stderr || "Waveform generation failed");
  return output;
}
