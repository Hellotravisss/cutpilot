import { randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, extname, join, resolve } from "node:path";

const now = () => new Date().toISOString();
const run = (command, args) => {
  const result = spawnSync(command, args, { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  if (result.status !== 0) throw new Error(result.stderr || `${command} failed`);
};

function jobFolder(projectPath) {
  const path = resolve(projectPath);
  return join(dirname(path), ".mycut-jobs", basename(path));
}

function jobPath(projectPath, jobId) { return join(jobFolder(projectPath), `${jobId}.json`); }
function writeJob(projectPath, job) {
  mkdirSync(jobFolder(projectPath), { recursive: true });
  job.updatedAt = now();
  writeFileSync(jobPath(projectPath, job.id), JSON.stringify(job, null, 2));
  return job;
}
export function readGenerationJob(projectPath, jobId) {
  const path = jobPath(projectPath, jobId);
  if (!existsSync(path)) throw new Error(`Generation job not found: ${jobId}`);
  return JSON.parse(readFileSync(path, "utf8"));
}

const extensionFor = (kind) => kind === "image" ? ".png" : kind === "video" ? ".mp4" : ".wav";
const outputFor = (projectPath, job) => {
  const folder = join(dirname(resolve(projectPath)), "mycut-assets", "generated");
  mkdirSync(folder, { recursive: true });
  return join(folder, `${job.id}${extensionFor(job.kind)}`);
};

function localProcedural(projectPath, job) {
  const output = outputFor(projectPath, job);
  if (job.kind === "image") {
    const size = job.parameters.ratio === "9:16" ? "720x1280" : "1280x720";
    run("magick", ["-size", size, "gradient:#172033-#d95f34", "-font", "/System/Library/Fonts/Supplemental/Arial Unicode.ttf", "-fill", "white", "-gravity", "center", "-pointsize", "46", "-annotate", "+0+0", String(job.prompt).slice(0, 80), output]);
  } else if (job.kind === "video") {
    const size = job.parameters.ratio === "9:16" ? "720x1280" : "1280x720";
    const duration = Number(job.parameters.durationSeconds || 3);
    run("ffmpeg", ["-y", "-hide_banner", "-loglevel", "error", "-f", "lavfi", "-i", `testsrc2=s=${size}:r=30:d=${duration}`, "-vf", "hue=h=20*t", "-c:v", "libx264", "-pix_fmt", "yuv420p", output]);
  } else if (job.kind === "music") {
    const duration = Number(job.parameters.durationSeconds || 8);
    const fade = Math.min(0.5, duration / 3);
    run("ffmpeg", ["-y", "-hide_banner", "-loglevel", "error", "-f", "lavfi", "-i", `sine=frequency=220:sample_rate=48000:duration=${duration}`, "-af", `tremolo=f=4:d=0.35,afade=t=in:d=${fade},afade=t=out:st=${Math.max(0, duration - fade)}:d=${fade}`, "-c:a", "pcm_s16le", output]);
  } else {
    const duration = Number(job.parameters.durationSeconds || 1);
    const fade = Math.min(0.3, duration / 2);
    run("ffmpeg", ["-y", "-hide_banner", "-loglevel", "error", "-f", "lavfi", "-i", `anoisesrc=color=pink:sample_rate=48000:duration=${duration}`, "-af", `afade=t=out:st=${Math.max(0, duration - fade)}:d=${fade}`, "-c:a", "pcm_s16le", output]);
  }
  job.status = "completed"; job.result = { outputPath: output }; job.completedAt = now();
}

async function saveRemoteResult(response, output) {
  if (response.b64_json) writeFileSync(output, Buffer.from(response.b64_json, "base64"));
  else if (response.outputPath) return resolve(response.outputPath);
  else if (response.outputUrl || response.url) {
    const fetched = await fetch(response.outputUrl || response.url);
    if (!fetched.ok) throw new Error(`Generated media download failed: ${fetched.status}`);
    writeFileSync(output, Buffer.from(await fetched.arrayBuffer()));
  } else return null;
  return output;
}

async function submitOpenAIImage(projectPath, job) {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error("OPENAI_API_KEY is required for provider openai-image");
  const response = await fetch("https://api.openai.com/v1/images/generations", { method: "POST", headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" }, body: JSON.stringify({ model: job.model || "gpt-image-1", prompt: job.prompt, size: job.parameters.size || "1024x1024", quality: job.parameters.quality || "high", n: 1 }) });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error?.message || `OpenAI image generation failed: ${response.status}`);
  const item = data.data?.[0];
  const output = await saveRemoteResult(item || {}, outputFor(projectPath, job));
  if (!output) throw new Error("OpenAI image response had no output");
  job.status = "completed"; job.result = { outputPath: output, revisedPrompt: item.revised_prompt || null }; job.completedAt = now();
}

const NAMED_PROVIDERS = {
  seedance: { endpointEnv: "MYCUT_SEEDANCE_ENDPOINT", tokenEnv: "MYCUT_SEEDANCE_TOKEN" },
  kling: { endpointEnv: "MYCUT_KLING_ENDPOINT", tokenEnv: "MYCUT_KLING_TOKEN" },
  mureka: { endpointEnv: "MYCUT_MUREKA_ENDPOINT", tokenEnv: "MYCUT_MUREKA_TOKEN" },
  "sound-effect": { endpointEnv: "MYCUT_SFX_ENDPOINT", tokenEnv: "MYCUT_SFX_TOKEN" },
};

export function inspectGenerationProviders() {
  const command = (name) => spawnSync("/usr/bin/which", [name], { encoding: "utf8" }).status === 0;
  const providers = [
    { id:"local-procedural", kinds:["image","video","music","sound-effect"], ready:command("ffmpeg") && (command("magick") || command("convert")), local:true, cost:"free" },
    { id:"macos-voice", kinds:["voice"], ready:process.platform==="darwin" && command("say"), local:true, cost:"free" },
    { id:"openai-image", kinds:["image"], ready:Boolean(process.env.OPENAI_API_KEY), local:false, required:["OPENAI_API_KEY"] },
    ...Object.entries(NAMED_PROVIDERS).map(([id,spec])=>({id,kinds:[id==="mureka"?"music":id==="sound-effect"?"sound-effect":"video"],ready:Boolean(process.env[spec.endpointEnv]),local:false,required:[spec.endpointEnv],tokenConfigured:Boolean(process.env[spec.tokenEnv])})),
    { id:"http", kinds:["image","video","music","sound-effect"], ready:Boolean(process.env.MYCUT_GENERATION_ENDPOINT), local:false, required:["MYCUT_GENERATION_ENDPOINT"] },
  ];
  return {type:"cutpilot-generation-providers",ready:providers.filter(x=>x.ready).map(x=>x.id),providers,inspectedAt:now()};
}

const authHeaders = (job) => {
  const token = (job.authTokenEnv && process.env[job.authTokenEnv]) || process.env.MYCUT_GENERATION_TOKEN;
  return token ? { Authorization: `Bearer ${token}` } : {};
};

async function submitHttp(projectPath, job) {
  const named = NAMED_PROVIDERS[job.provider];
  const endpoint = job.parameters.endpoint || (named ? process.env[named.endpointEnv] : process.env.MYCUT_GENERATION_ENDPOINT);
  if (!endpoint) throw new Error("HTTP generation requires parameters.endpoint or MYCUT_GENERATION_ENDPOINT");
  job.authTokenEnv = named?.tokenEnv || null;
  const response = await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json", ...authHeaders(job) }, body: JSON.stringify({ provider: job.provider, kind: job.kind, model: job.model, prompt: job.prompt, name: job.name, parameters: job.parameters }) });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || `Generator submission failed: ${response.status}`);
  job.externalJobId = data.jobId || data.id || null;
  job.statusUrl = data.statusUrl || (job.externalJobId ? `${endpoint.replace(/\/$/, "")}/${job.externalJobId}` : null);
  job.status = data.status || (data.outputPath || data.outputUrl || data.url ? "completed" : "submitted");
  job.remoteResult = data;
  if (["completed", "succeeded"].includes(job.status)) {
    const output = await saveRemoteResult(data, outputFor(projectPath, job));
    if (!output) throw new Error("Completed generation response has no output media");
    job.status = "completed"; job.result = { outputPath: output }; job.completedAt = now();
  }
}

export async function submitGeneration(projectPath, spec) {
  const job = { id: randomUUID(), projectPath: resolve(projectPath), kind: spec.kind, provider: spec.provider, model: spec.model || null, prompt: spec.prompt, name: spec.name, parameters: spec.parameters || {}, status: "queued", createdAt: now(), updatedAt: now(), result: null, error: null, materializedAssetId: null };
  writeJob(projectPath, job);
  try {
    job.status = "running"; writeJob(projectPath, job);
    if (job.provider === "local-procedural") localProcedural(projectPath, job);
    else if (job.provider === "openai-image") await submitOpenAIImage(projectPath, job);
    else if (job.provider === "http" || NAMED_PROVIDERS[job.provider]) await submitHttp(projectPath, job);
    else throw new Error(`Unsupported generation provider: ${job.provider}`);
  } catch (error) { job.status = "failed"; job.error = error.message; job.completedAt = now(); }
  return writeJob(projectPath, job);
}

export async function refreshGenerationJob(projectPath, jobId) {
  const job = readGenerationJob(projectPath, jobId);
  if (!["submitted", "running"].includes(job.status) || !job.statusUrl) return job;
  try {
    const response = await fetch(job.statusUrl, { headers: authHeaders(job) });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || `Generator status failed: ${response.status}`);
    job.status = data.status || job.status;
    job.remoteResult = data;
    if (["completed", "succeeded"].includes(job.status)) {
      const output = await saveRemoteResult(data, outputFor(projectPath, job));
      if (!output) throw new Error("Completed generation job has no output media");
      job.status = "completed"; job.result = { outputPath: output }; job.completedAt = now();
    } else if (["failed", "cancelled"].includes(job.status)) { job.error = data.error || data.message || job.status; job.completedAt = now(); }
  } catch (error) { job.status = "failed"; job.error = error.message; job.completedAt = now(); }
  return writeJob(projectPath, job);
}

export function markJobMaterialized(projectPath, jobId, assetId) {
  const job = readGenerationJob(projectPath, jobId);
  job.materializedAssetId = assetId;
  return writeJob(projectPath, job);
}
