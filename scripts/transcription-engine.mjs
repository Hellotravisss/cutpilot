import { existsSync, mkdirSync, readFileSync, rmSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";

function execute(command, args) {
  const result = spawnSync(command, args, { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  if (result.status !== 0) throw new Error(result.stderr || `${command} failed`);
  return result.stdout;
}

export function commandExists(command) {
  return spawnSync("sh", ["-lc", `command -v ${command}`], { encoding: "utf8" }).status === 0;
}

export function transcriptionBackendStatus(modelPath) {
  return {
    whisperCli: commandExists("whisper-cli"),
    ffmpeg: commandExists("ffmpeg"),
    modelPath: modelPath ? resolve(modelPath) : null,
    modelReady: Boolean(modelPath && existsSync(resolve(modelPath))),
  };
}

const validToken = (token) => token?.text && !token.text.startsWith("[_") && token.offsets?.to >= token.offsets?.from;

export function parseWhisperJson(data) {
  const cues = (data.transcription || []).map((segment) => ({
    start: Number(segment.offsets?.from || 0) / 1000,
    end: Number(segment.offsets?.to || 0) / 1000,
    text: String(segment.text || "").trim(),
    words: (segment.tokens || []).filter(validToken).map((token) => ({
      start: Number(token.offsets.from) / 1000,
      end: Number(token.offsets.to) / 1000,
      text: token.text,
      confidence: token.p,
    })),
  })).filter((cue) => cue.text && cue.end > cue.start);
  return { language: data.result?.language || data.params?.language || "unknown", cues, text: cues.map((cue) => cue.text).join(" ") };
}

export function transcribeLocal({ inputPath, modelPath, language = "auto", outputFolder }) {
  const status = transcriptionBackendStatus(modelPath);
  if (!status.ffmpeg || !status.whisperCli || !status.modelReady) throw new Error(`Local transcription unavailable: ${JSON.stringify(status)}`);
  const folder = outputFolder ? resolve(outputFolder) : join(tmpdir(), "mycut-transcription", String(Date.now()));
  mkdirSync(folder, { recursive: true });
  const wavPath = join(folder, "audio-16k.wav");
  const prefix = join(folder, "transcript");
  execute("ffmpeg", ["-y", "-hide_banner", "-loglevel", "error", "-i", resolve(inputPath), "-vn", "-ar", "16000", "-ac", "1", "-c:a", "pcm_s16le", wavPath]);
  if (!existsSync(wavPath) || statSync(wavPath).size <= 128) throw new Error(`Local transcription input contains no decodable audio: ${resolve(inputPath)}`);
  const rawPath = `${prefix}.json`;
  rmSync(rawPath, { force: true });
  execute("whisper-cli", ["-m", resolve(modelPath), "-f", wavPath, "-l", language, "-ojf", "-of", prefix, "-np"]);
  if (!existsSync(rawPath)) throw new Error("whisper-cli finished without producing transcript JSON; verify that the input contains audio and the model is compatible with the installed whisper-cli");
  const parsed = parseWhisperJson(JSON.parse(readFileSync(rawPath, "utf8")));
  return { ...parsed, rawPath, wavPath, modelPath: resolve(modelPath) };
}
