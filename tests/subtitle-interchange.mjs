import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { alignCaptionTranslations, exportSubtitleFile, importSubtitleFile, parseSubtitles, serializeSubtitles } from "../scripts/subtitle-engine.mjs";
import { renderCaptionOverlays } from "../scripts/caption-style-engine.mjs";

const root = mkdtempSync(join(tmpdir(), "mycut-subtitles-"));
const srt = `1\n00:00:00,250 --> 00:00:01,500\nHello, world.\n\n2\n00:00:01,700 --> 00:00:03,000\nLocal video editing\n`;
const cues = parseSubtitles(srt, "srt"); assert.equal(cues.length, 2); assert.deepEqual(cues.map((cue) => [cue.start, cue.end]), [[.25, 1.5], [1.7, 3]]);
const translated = alignCaptionTranslations(cues, [{ id: "1", text: "你好，世界。" }, { id: "2", text: "本地视频剪辑" }], { language: "zh-CN" }); assert.equal(translated.translationLanguage, "zh-CN"); assert.equal(translated.cues[1].translation, "本地视频剪辑");
for (const format of ["srt", "vtt", "ass"]) { const path = join(root, `bilingual.${format}`), exported = exportSubtitleFile(path, translated.cues, format, { variant: "bilingual", title: "往返测试" }); assert.equal(exported.cues, 2); const roundTrip = importSubtitleFile(path, format); assert.equal(roundTrip.cues.length, 2); assert.deepEqual(roundTrip.cues.map((cue) => [Number(cue.start.toFixed(2)), Number(cue.end.toFixed(2))]), [[.25, 1.5], [1.7, 3]]); assert.match(readFileSync(path, "utf8"), /你好|本地视频/); }
const vtt = serializeSubtitles(translated.cues, "vtt", { variant: "translation" }); assert.match(vtt, /^WEBVTT/); assert.match(vtt, /00:00:00\.250 --> 00:00:01\.500/);
const assWithComma = `[Events]\nFormat: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\nDialogue: 0,0:00:00.20,0:00:01.00,Default,,0,0,0,,Hello, with comma\n`; assert.equal(parseSubtitles(assWithComma, "ass")[0].text, "Hello, with comma");
assert.throws(() => parseSubtitles("1\nBAD --> 00:01:00,000\nBroken", "srt"), /Invalid subtitle timestamp/); assert.throws(() => alignCaptionTranslations(cues, ["only one"], { language: "zh" }), /must equal cue count/);
const timeline = { width: 640, height: 360, captions: { enabled: true, cues: translated.cues.slice(0, 1), style: { template: "bold-box", fontSize: 42, secondaryFontSize: 26, secondaryColor: "#7dd3fc", bilingual: true } } }, overlays = renderCaptionOverlays(timeline, join(root, "overlays")); assert.equal(overlays.length, 1); const bilingualHash = createHash("sha256").update(readFileSync(overlays[0].path)).digest("hex"); timeline.captions.style.bilingual = false; const original = renderCaptionOverlays(timeline, join(root, "original")), originalHash = createHash("sha256").update(readFileSync(original[0].path)).digest("hex"); assert.notEqual(bilingualHash, originalHash); assert.ok(overlays[0].style.secondaryFontSize === 26);
writeFileSync(join(root, "fixture.srt"), srt);
console.log(JSON.stringify({ ok: true, root, cues: translated.cues, vttBytes: Buffer.byteLength(vtt), bilingualHash, originalHash }, null, 2));
