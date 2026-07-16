import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const run = (command, args) => { const result = spawnSync(command, args, { encoding: "utf8", maxBuffer: 16 * 1024 * 1024 }); if (result.status) throw new Error(result.stderr || `${command} failed`); };
const escapeXml = (value) => String(value ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
export const CAPTION_TEMPLATES = {
  classic: { fontSize: 52, color: "#ffffff", highlightColor: "#ffd23f", outlineColor: "#000000", outlineWidth: 3, backgroundColor: "#000000", backgroundOpacity: 0, position: "bottom", margin: 70, weight: "bold", karaoke: false },
  "bold-box": { fontSize: 58, color: "#ffffff", highlightColor: "#ffe44d", outlineColor: "#000000", outlineWidth: 2, backgroundColor: "#111111", backgroundOpacity: 0.82, position: "bottom", margin: 85, weight: "bold", karaoke: false },
  karaoke: { fontSize: 56, color: "#ffffff", highlightColor: "#ffcf33", outlineColor: "#111111", outlineWidth: 3, backgroundColor: "#000000", backgroundOpacity: 0.28, position: "bottom", margin: 75, weight: "bold", karaoke: true },
  minimal: { fontSize: 44, color: "#ffffff", highlightColor: "#ffffff", outlineColor: "#000000", outlineWidth: 1, backgroundColor: "#000000", backgroundOpacity: 0, position: "bottom", margin: 60, weight: "normal", karaoke: false },
};
export function normalizeCaptionStyle(style = {}, timelineWidth = 1080) { const template = CAPTION_TEMPLATES[style.template] || CAPTION_TEMPLATES.classic; return { template: style.template || "classic", ...template, ...style, fontFamily: String(style.fontFamily || "/System/Library/Fonts/Supplemental/Arial Unicode.ttf"), fontSize: Number(style.fontSize || Math.max(28, Math.round(timelineWidth * 0.05))), secondaryFontSize: Number(style.secondaryFontSize || Math.max(20, Math.round(Number(style.fontSize || timelineWidth * .05) * .68))), secondaryColor: String(style.secondaryColor || "#dbeafe"), bilingualGap: Number(style.bilingualGap ?? 8), bilingual: style.bilingual !== false, maxWidth: Number(style.maxWidth || Math.round(timelineWidth * 0.88)), uppercase: Boolean(style.uppercase), shadow: Boolean(style.shadow) }; }
export function expandCaptionEvents(cues, style) { const events = []; for (const cue of cues) { const words = (cue.words || []).filter((word) => word.end > word.start); if (style.karaoke && words.length) for (let active = 0; active < words.length; active++) events.push({ cue, start: Math.max(cue.start, words[active].start), end: Math.min(cue.end, words[active].end), active }); else events.push({ cue, start: cue.start, end: cue.end, active: -1 }); } return events.filter((event) => event.end > event.start); }
export function renderCaptionOverlays(timeline, folder) {
  mkdirSync(folder, { recursive: true }); const style = normalizeCaptionStyle(timeline.captions?.style, timeline.width), events = expandCaptionEvents(timeline.captions?.cues || [], style);
  return events.map((event, index) => {
    const words = event.cue.words?.length ? event.cue.words.map((word) => word.text) : [event.cue.text];
    const tspans = words.map((word, i) => `<tspan fill="${i === event.active ? style.highlightColor : style.color}">${escapeXml(style.uppercase ? String(word).toUpperCase() : word)}</tspan>`).join("");
    const secondary = style.bilingual && event.cue.translation ? String(event.cue.translation) : "", width = style.maxWidth, height = Math.ceil(style.fontSize * 1.55 + (secondary ? style.secondaryFontSize * 1.35 + style.bilingualGap : 0) + 28), path = join(folder, `${String(index).padStart(5, "0")}.png`), svgPath = join(folder, `${String(index).padStart(5, "0")}.svg`), estimate = words.join("").length * style.fontSize * 0.58;
    const fit = estimate > width - 30 ? ` textLength="${width - 30}" lengthAdjust="spacingAndGlyphs"` : "";
    const background = style.backgroundOpacity > 0 ? `<rect width="100%" height="100%" rx="14" fill="${style.backgroundColor}" fill-opacity="${style.backgroundOpacity}"/>` : "";
    const shadow = style.shadow ? `<filter id="s"><feDropShadow dx="3" dy="4" stdDeviation="3" flood-color="#000" flood-opacity=".55"/></filter>` : "";
    const primaryY = secondary ? 16 + style.fontSize * .58 : height / 2, secondaryText = secondary ? `<text x="${width / 2}" y="${primaryY + style.fontSize * .7 + style.bilingualGap + style.secondaryFontSize * .55}" text-anchor="middle" dominant-baseline="central" font-size="${style.secondaryFontSize}" font-weight="${style.weight}" fill="${style.secondaryColor}" stroke="${style.outlineColor}" stroke-width="${Math.min(style.outlineWidth, 2)}" paint-order="stroke fill">${escapeXml(secondary)}</text>` : "";
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><defs>${shadow}</defs>${background}<text x="${width / 2}" y="${primaryY}" text-anchor="middle" dominant-baseline="central" font-size="${style.fontSize}" font-weight="${style.weight}" stroke="${style.outlineColor}" stroke-width="${style.outlineWidth}" paint-order="stroke fill" stroke-linejoin="round"${fit}${style.shadow ? ' filter="url(#s)"' : ""}>${tspans}</text>${secondaryText}</svg>`;
    writeFileSync(svgPath, svg); run("magick", ["-font", style.fontFamily, "-background", "none", svgPath, path]); return { ...event, path, position: style.position, margin: style.margin, style };
  });
}
