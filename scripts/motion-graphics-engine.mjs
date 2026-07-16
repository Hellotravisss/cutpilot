import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { spawnSync } from "node:child_process";

const FONT = "/System/Library/Fonts/Supplemental/Arial Unicode.ttf";

function run(args) {
  const result = spawnSync("magick", args, { encoding: "utf8", maxBuffer: 16 * 1024 * 1024 });
  if (result.status !== 0) throw new Error(result.stderr || "ImageMagick failed");
}

const safe = (value) => String(value || "").replace(/[\\]/g, "\\\\").replace(/'/g, "\\'");

export function renderMotionGraphic(spec, outputPath) {
  const width = spec.width || 1080;
  const height = spec.height || 1920;
  const output = resolve(outputPath);
  mkdirSync(dirname(output), { recursive: true });
  const bg = spec.transparentBackground === false ? (spec.bgColor || "#111827") : "none";
  const accent = spec.accentColor || "#ff6b35";
  const text = spec.textColor || "white";
  const title = safe(spec.title || "Title");
  const subtitle = safe(spec.subtitle || "");
  const args = ["-size", `${width}x${height}`, `xc:${bg}`, "-font", FONT];

  if (spec.kind === "lower-third") {
    const x1 = Math.round(width * 0.02), y1 = Math.round(height * 0.04), x2 = Math.round(width * 0.98), y2 = Math.round(height * 0.96);
    const radius = Math.max(10, Math.round(Math.min(width, height) * 0.1));
    args.push("-fill", "#111827e6", "-stroke", "none", "-draw", `roundrectangle ${x1},${y1} ${x2},${y2} ${radius},${radius}`, "-fill", accent, "-draw", `roundrectangle ${x1},${y1} ${x1 + Math.max(8, Math.round(width * 0.025))},${y2} 7,7`, "-fill", text, "-pointsize", String(Math.round(height * 0.31)), "-gravity", "northwest", "-annotate", `+${Math.round(width * 0.11)}+${Math.round(height * 0.13)}`, title);
    if (subtitle) args.push("-fill", "#d1d5db", "-pointsize", String(Math.round(height * 0.18)), "-annotate", `+${Math.round(width * 0.115)}+${Math.round(height * 0.58)}`, subtitle);
  } else if (spec.kind === "info-card") {
    const x1 = Math.round(width * 0.08), y1 = Math.round(height * 0.18), x2 = Math.round(width * 0.92), y2 = Math.round(height * 0.52);
    args.push("-fill", "#111827ee", "-stroke", accent, "-strokewidth", "4", "-draw", `roundrectangle ${x1},${y1} ${x2},${y2} 36,36`, "-fill", text, "-stroke", "none", "-pointsize", String(Math.round(width * 0.07)), "-gravity", "northwest", "-annotate", `+${x1 + 54}+${y1 + 62}`, title);
    if (subtitle) args.push("-fill", "#d1d5db", "-pointsize", String(Math.round(width * 0.04)), "-size", `${x2 - x1 - 108}x${y2 - y1 - 170}`, "caption:" + subtitle, "-gravity", "northwest", "-geometry", `+${x1 + 54}+${y1 + 160}`, "-composite");
  } else {
    args.push("-fill", accent, "-stroke", "none", "-draw", `rectangle ${Math.round(width * 0.12)},${Math.round(height * 0.44)} ${Math.round(width * 0.88)},${Math.round(height * 0.455)}`, "-fill", text, "-pointsize", String(Math.round(width * 0.085)), "-gravity", "center", "-annotate", "+0-50", title);
    if (subtitle) args.push("-fill", "#d1d5db", "-pointsize", String(Math.round(width * 0.04)), "-annotate", "+0+70", subtitle);
  }
  args.push(output);
  run(args);
  return output;
}
