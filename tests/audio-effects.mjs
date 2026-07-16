import assert from "node:assert/strict";
import { mkdirSync, readFileSync, rmSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { applyTimelineEdit, newProject, validateProject } from "../scripts/project-store.mjs";
import { probeOutput, renderProject } from "../scripts/media-engine.mjs";
import { compileAudioEffectFilters, validateAudioEffectStack } from "../scripts/audio-effects-engine.mjs";

const root = resolve(process.argv[2] || "/tmp/mycut-audio-effects"); rmSync(root, { recursive: true, force: true }); mkdirSync(root, { recursive: true });
const run = (command, args) => { const result = spawnSync(command, args, { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 }); if (result.status) throw new Error(result.stderr); return result.stdout; };
const makeAudio = (name, expression) => { const path = `${root}/${name}.wav`; run("ffmpeg", ["-y", "-hide_banner", "-loglevel", "error", "-f", "lavfi", "-i", `aevalsrc=${expression}:s=48000:d=1.2`, "-ac", "2", "-c:a", "pcm_f32le", path]); return path; };
const video = `${root}/base.mp4`, output = `${root}/audio-effects.mp4`;
run("ffmpeg", ["-y", "-hide_banner", "-loglevel", "error", "-f", "lavfi", "-i", "color=c=0x101820:s=160x90:r=10:d=6", "-c:v", "libx264", "-pix_fmt", "yuv420p", video]);
const sources = {
  eq: makeAudio("eq", "0.18*sin(2*PI*200*t)+0.18*sin(2*PI*4000*t)"),
  dynamics: makeAudio("dynamics", "if(lt(t\\,0.6)\\,0.85\\,0.08)*sin(2*PI*440*t)"),
  gate: makeAudio("gate", "if(lt(t\\,0.6)\\,0.004\\,0.45)*sin(2*PI*600*t)"),
  stereo: makeAudio("stereo", "0.3*sin(2*PI*500*t)"),
  pitch: makeAudio("pitch", "0.3*sin(2*PI*440*t)"),
};
const effects = {
  eq: [{ type: "highpass", frequency: 60 }, { type: "equalizer", bands: [{ frequency: 200, gainDb: -8, q: 2 }, { frequency: 4000, gainDb: 10, q: 2 }] }, { type: "deesser", intensity: 0.15, maxReduction: 0.2, frequency: 0.7 }],
  dynamics: [{ type: "compressor", thresholdDb: -18, ratio: 8, attackMs: 2, releaseMs: 80, makeupDb: 0, knee: 2, mix: 1 }, { type: "limiter", ceilingDb: -1 }],
  gate: [{ type: "gate", thresholdDb: -32, reductionDb: -70, ratio: 20, attackMs: 2, releaseMs: 50 }],
  stereo: [{ type: "stereo", balance: 0.8, width: 0.2, softClip: false, phaseLeft: false, phaseRight: false }],
  pitch: [{ type: "pitch", semitones: 12 }],
};
assert.equal(validateAudioEffectStack(effects.eq)[1].bands.length, 2); assert.throws(() => validateAudioEffectStack([{ type: "pitch", semitones: 20 }]), /semitones/); assert.throws(() => validateAudioEffectStack([{ type: "equalizer", bands: [] }]), /1-12/); assert.ok(compileAudioEffectFilters(effects.dynamics).filters.some((filter) => filter.startsWith("acompressor=")));
const project = newProject({ name: "Audio effects", width: 160, height: 90, fps: 10 }); project.assets.push({ id: "v", path: video, name: "base", type: "video", duration: 6 });
for (const [id, path] of Object.entries(sources)) project.assets.push({ id, path, name: `${id}.wav`, type: "audio", duration: 1.2 });
applyTimelineEdit(project, { trackName: "V1", adds: [{ assetId: "v", start: 0, sourceStart: 0, duration: 6 }] });
applyTimelineEdit(project, { trackName: "A1", adds: Object.keys(sources).map((id, index) => ({ assetId: id, start: index * 1.2, sourceStart: 0, duration: 1.2, label: id, audioEffects: effects[id] })) });
assert.equal(validateProject(project).valid, true); const invalid = structuredClone(project); invalid.timelines[0].tracks.find((track) => track.name === "V1").items[0].audioEffects = effects.eq; assert.equal(validateProject(invalid).valid, false);
const result = renderProject(project, output, { crf: 25 }), probe = probeOutput(output); assert.ok(probe.streams.some((stream) => stream.codec_type === "audio")); assert.ok(Number(probe.format.duration) >= 5.95);
const audioOnlyPath = `${root}/processed.wav`, audioOnlyResult = renderProject(project, audioOnlyPath, { audioOnly: true, audioCodec: "wav" }), audioOnlyProbe = probeOutput(audioOnlyPath); assert.equal(audioOnlyResult.videoItems, 0); assert.equal(audioOnlyProbe.streams.some((stream) => stream.codec_type === "video"), false); assert.equal(audioOnlyProbe.streams.find((stream) => stream.codec_type === "audio").codec_name, "pcm_s24le"); assert.ok(Number(audioOnlyProbe.format.duration) >= 5.95);
const pcmPath = `${root}/decoded.f32`; run("ffmpeg", ["-y", "-hide_banner", "-loglevel", "error", "-i", output, "-vn", "-ac", "2", "-ar", "48000", "-f", "f32le", pcmPath]); const bytes = readFileSync(pcmPath), samples = new Float32Array(bytes.buffer, bytes.byteOffset, Math.floor(bytes.byteLength / 4));
const slice = (start, end, channel = null) => { const first = Math.floor(start * 48000), last = Math.floor(end * 48000), values = []; for (let index = first; index < last; index++) if (channel === null) values.push((samples[index * 2] + samples[index * 2 + 1]) / 2); else values.push(samples[index * 2 + channel]); return values; };
const rms = (values) => Math.sqrt(values.reduce((sum, value) => sum + value * value, 0) / values.length);
const tone = (values, frequency) => { let real = 0, imaginary = 0; for (let index = 0; index < values.length; index++) { const angle = 2 * Math.PI * frequency * index / 48000; real += values[index] * Math.cos(angle); imaginary -= values[index] * Math.sin(angle); } return Math.hypot(real, imaginary) / values.length; };
const eqWindow = slice(0.15, 1.05), eqRatio = tone(eqWindow, 4000) / tone(eqWindow, 200); assert.ok(eqRatio > 4, `EQ ratio ${eqRatio}`);
const compressedLoud = rms(slice(1.3, 1.7)), compressedQuiet = rms(slice(1.95, 2.3)), compressionRatio = compressedLoud / compressedQuiet; assert.ok(compressionRatio < 5, `compression ratio ${compressionRatio}`);
const gatedLow = rms(slice(2.5, 2.85)), gatedHigh = rms(slice(3.1, 3.45)), gateRatio = gatedLow / gatedHigh; assert.ok(gateRatio < 0.03, `gate ratio ${gateRatio}`);
const left = rms(slice(3.75, 4.65, 0)), right = rms(slice(3.75, 4.65, 1)), stereoRatio = right / left; assert.ok(stereoRatio > 2, `stereo ratio ${stereoRatio}`);
const pitchWindow = slice(4.95, 5.85), pitchRatio = tone(pitchWindow, 880) / tone(pitchWindow, 440); assert.ok(pitchRatio > 4, `pitch ratio ${pitchRatio}`);
console.log(JSON.stringify({ result, probe, audioOnly: { result: audioOnlyResult, probe: audioOnlyProbe }, measurements: { eqHighToLow: eqRatio, compressedLoudToQuiet: compressionRatio, gateLowToHigh: gateRatio, stereoRightToLeft: stereoRatio, pitch880To440: pitchRatio }, output, pcmPath }, null, 2));
