import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const clean = (value) => String(value ?? "").replace(/\r/g, "").trim();
const parseClock = (value) => {
  const match = clean(value).replace(",", ".").match(/^(?:(\d+):)?(\d{1,2}):(\d{2})(?:\.(\d{1,3}))?$/); if (!match) throw new Error(`Invalid subtitle timestamp: ${value}`);
  return Number(match[1] || 0) * 3600 + Number(match[2]) * 60 + Number(match[3]) + Number(`0.${String(match[4] || "0").padEnd(3, "0")}`);
};
const validate = (cues) => {
  let previous = -1;
  return cues.map((cue, index) => { const start = Number(cue.start), end = Number(cue.end), text = clean(cue.text); if (!(start >= 0 && end > start)) throw new Error(`Cue ${index + 1} requires 0 <= start < end`); if (!text) throw new Error(`Cue ${index + 1} has empty text`); if (start < previous - .0001) throw new Error(`Cue ${index + 1} is not time ordered`); previous = start; return { id: String(cue.id || `cue-${index + 1}`), start, end, text, ...(cue.translation ? { translation: clean(cue.translation) } : {}), ...(cue.words?.length ? { words: cue.words } : {}) }; });
};

function parseSrtOrVtt(source) {
  const normalized = source.replace(/^\uFEFF/, "").replace(/^WEBVTT[^\n]*\n+/i, "").replace(/^NOTE[^\n]*(?:\n(?!\n).*)*\n*/gm, "");
  const blocks = normalized.split(/\n\s*\n/).map(clean).filter(Boolean), cues = [];
  for (const block of blocks) { const lines = block.split("\n"), timingIndex = lines.findIndex((line) => line.includes("-->")); if (timingIndex < 0) continue; const [left, rightRaw] = lines[timingIndex].split(/\s*-->\s*/), right = rightRaw.split(/\s+/)[0]; cues.push({ id: timingIndex ? lines[0] : undefined, start: parseClock(left), end: parseClock(right), text: lines.slice(timingIndex + 1).join("\n").replace(/<[^>]+>/g, "") }); }
  return cues;
}

function parseAss(source) {
  const cues = [];
  for (const line of source.replace(/\r/g, "").split("\n")) if (/^Dialogue\s*:/i.test(line)) { const fields = line.slice(line.indexOf(":") + 1).split(","); if (fields.length < 10) continue; cues.push({ start: parseClock(fields[1]), end: parseClock(fields[2]), text: fields.slice(9).join(",").replace(/\N/g, "\n").replace(/\{[^}]*\}/g, "") }); }
  return cues;
}

export function parseSubtitles(source, format) {
  format = String(format || "").toLowerCase().replace(/^\./, ""); if (!format) throw new Error("Subtitle format is required");
  const cues = format === "ass" || format === "ssa" ? parseAss(source) : format === "srt" || format === "vtt" ? parseSrtOrVtt(source) : null;
  if (!cues) throw new Error(`Unsupported subtitle format: ${format}`); if (!cues.length) throw new Error("No subtitle cues found"); return validate(cues);
}

export function importSubtitleFile(path, format) { const input = resolve(path), inferred = format || input.split(".").pop(); return { inputPath: input, format: String(inferred).toLowerCase(), cues: parseSubtitles(readFileSync(input, "utf8"), inferred) }; }

export function alignCaptionTranslations(cues, translations, { language, mode = "replace" } = {}) {
  if (!Array.isArray(translations) || translations.length !== cues.length) throw new Error(`Translation count ${translations?.length || 0} must equal cue count ${cues.length}`);
  const updated = validate(cues).map((cue, index) => { const entry = translations[index], text = clean(typeof entry === "string" ? entry : entry?.text); if (!text) throw new Error(`Translation ${index + 1} is empty`); if (typeof entry === "object" && entry.id && entry.id !== cue.id) throw new Error(`Translation ${index + 1} cue id mismatch`); return { ...cue, translation: mode === "append" && cue.translation ? `${cue.translation}\n${text}` : text }; });
  return { cues: updated, translationLanguage: clean(language || "unknown") };
}

const pad = (value, size = 2) => String(value).padStart(size, "0");
const stamp = (seconds, separator = ",", centiseconds = false) => { const ms = Math.max(0, Math.round(seconds * 1000)), h = Math.floor(ms / 3600000), m = Math.floor(ms % 3600000 / 60000), s = Math.floor(ms % 60000 / 1000), fraction = centiseconds ? pad(Math.floor(ms % 1000 / 10)) : pad(ms % 1000, 3); return centiseconds ? `${h}:${pad(m)}:${pad(s)}.${fraction}` : `${pad(h)}:${pad(m)}:${pad(s)}${separator}${fraction}`; };
const display = (cue, variant) => variant === "translation" ? cue.translation || cue.text : variant === "bilingual" && cue.translation ? `${cue.text}\n${cue.translation}` : cue.text;
const assEscape = (value) => String(value).replace(/\n/g, "\\N");

export function serializeSubtitles(cues, format, { variant = "original", title = "CutPilot Captions" } = {}) {
  cues = validate(cues); format = String(format).toLowerCase(); if (!new Set(["srt", "vtt", "ass"]).has(format)) throw new Error(`Unsupported subtitle format: ${format}`);
  if (format === "srt") return cues.map((cue, index) => `${index + 1}\n${stamp(cue.start)} --> ${stamp(cue.end)}\n${display(cue, variant)}`).join("\n\n") + "\n";
  if (format === "vtt") return "WEBVTT\n\n" + cues.map((cue, index) => `${cue.id || index + 1}\n${stamp(cue.start, ".")} --> ${stamp(cue.end, ".")}\n${display(cue, variant)}`).join("\n\n") + "\n";
  const header = `[Script Info]\nTitle: ${title}\nScriptType: v4.00+\n\n[V4+ Styles]\nFormat: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding\nStyle: Default,Arial,52,&H00FFFFFF,&H0000FFFF,&H00000000,&H64000000,-1,0,0,0,100,100,0,0,1,3,0,2,40,40,60,1\n\n[Events]\nFormat: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\n`;
  return header + cues.map((cue) => `Dialogue: 0,${stamp(cue.start, ".", true)},${stamp(cue.end, ".", true)},Default,,0,0,0,,${assEscape(display(cue, variant))}`).join("\n") + "\n";
}

export function exportSubtitleFile(path, cues, format, options = {}) { const outputPath = resolve(path), source = serializeSubtitles(cues, format, options); writeFileSync(outputPath, source); return { outputPath, format, cues: cues.length, variant: options.variant || "original", bytes: Buffer.byteLength(source) }; }
