import { spawnSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";

function run(command, args) {
  const result = spawnSync(command, args, { encoding: "utf8", maxBuffer: 32 * 1024 * 1024 });
  if (result.status !== 0) throw new Error(result.stderr || `${command} failed`);
}

export function generateLocalVoice({ text, outputPath, voice, rate = 180 }) {
  const output = resolve(outputPath);
  mkdirSync(dirname(output), { recursive: true });
  const intermediate = `${output}.aiff`;
  const args = ["-r", String(rate)];
  if (voice) args.push("-v", voice);
  args.push("-o", intermediate, text);
  run("say", args);
  run("ffmpeg", ["-y", "-hide_banner", "-loglevel", "error", "-i", intermediate, "-ar", "48000", "-ac", "1", "-c:a", "pcm_s16le", output]);
  return output;
}
