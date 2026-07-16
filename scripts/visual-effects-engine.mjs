import { existsSync } from "node:fs";

const finite = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const range = (value, min, max, label) => { const number = Number(value); if (!Number.isFinite(number) || number < min || number > max) throw new Error(`${label} must be ${min}-${max}`); return number; };
const color = (value, label) => { if (!/^#[0-9a-f]{6}$/i.test(String(value))) throw new Error(`${label} must be a #RRGGBB color`); return String(value); };
const escapeExpression = (value) => String(value).replace(/,/g, "\\,");

export const CURVE_PRESETS = ["color_negative", "cross_process", "darker", "increase_contrast", "lighter", "linear_contrast", "medium_contrast", "negative", "strong_contrast", "vintage"];

export function validateEffectStack(effects) {
  if (!Array.isArray(effects)) throw new Error("Effects must be an array");
  if (effects.length > 32) throw new Error("An item supports at most 32 effects");
  return effects.map((effect) => {
    if (!effect || typeof effect !== "object") throw new Error("Every effect must be an object");
    if (effect.type === "grayscale") return { type: "grayscale" };
    if (effect.type === "color") return { type: "color", brightness: range(effect.brightness ?? 0, -1, 1, "brightness"), contrast: range(effect.contrast ?? 1, 0, 3, "contrast"), saturation: range(effect.saturation ?? 1, 0, 3, "saturation") };
    if (effect.type === "blur") return { type: "blur", radius: range(effect.radius ?? 2, 0, 30, "blur radius") };
    if (effect.type === "zoom") return { type: "zoom", factor: range(effect.factor ?? 1.15, 1, 8, "zoom factor") };
    if (effect.type === "lut") { if (!effect.path || !existsSync(effect.path)) throw new Error("LUT path must exist"); return { type: "lut", path: String(effect.path) }; }
    if (effect.type === "chroma-key") return { type: "chroma-key", color: color(effect.color ?? "#00ff00", "key color"), similarity: range(effect.similarity ?? 0.12, 0.00001, 1, "similarity"), blend: range(effect.blend ?? 0.08, 0, 1, "blend") };
    if (effect.type === "mask") {
      if (!["rectangle", "ellipse"].includes(effect.shape)) throw new Error("Mask shape must be rectangle or ellipse");
      const output = { type: "mask", shape: effect.shape, x: finite(effect.x), y: finite(effect.y), width: range(effect.width, 0.001, 100000, "mask width"), height: range(effect.height, 0.001, 100000, "mask height"), feather: range(effect.feather ?? 0, 0, 10000, "mask feather"), invert: Boolean(effect.invert) };
      return output;
    }
    if (effect.type === "color-grade") return { type: "color-grade", exposure: range(effect.exposure ?? 0, -3, 3, "exposure"), contrast: range(effect.contrast ?? 1, 0, 3, "contrast"), saturation: range(effect.saturation ?? 1, 0, 3, "saturation"), temperature: range(effect.temperature ?? 0, -1, 1, "temperature"), tint: range(effect.tint ?? 0, -1, 1, "tint"), redShadows: range(effect.redShadows ?? 0, -1, 1, "red shadows"), blueShadows: range(effect.blueShadows ?? 0, -1, 1, "blue shadows"), redHighlights: range(effect.redHighlights ?? 0, -1, 1, "red highlights"), blueHighlights: range(effect.blueHighlights ?? 0, -1, 1, "blue highlights"), preserveLightness: effect.preserveLightness !== false };
    if (effect.type === "curves") { if (!CURVE_PRESETS.includes(effect.preset)) throw new Error(`Unknown curves preset: ${effect.preset}`); return { type: "curves", preset: effect.preset }; }
    if (effect.type === "vignette") return { type: "vignette", angle: range(effect.angle ?? Math.PI / 5, 0, Math.PI / 2, "vignette angle"), softness: range(effect.softness ?? 0.5, 0.01, 1, "vignette softness") };
    if (effect.type === "glsl") return effect;
    throw new Error(`Unsupported effect type: ${effect.type}`);
  });
}

function maskAlpha(effect) {
  const feather = Math.max(0.0001, effect.feather);
  let coverage;
  if (effect.shape === "ellipse") {
    const cx = effect.x + effect.width / 2, cy = effect.y + effect.height / 2, rx = effect.width / 2, ry = effect.height / 2;
    const normalized = `sqrt(pow((X-${cx})/${rx},2)+pow((Y-${cy})/${ry},2))`;
    coverage = effect.feather > 0 ? `clip(0.5+(1-(${normalized}))*${Math.min(rx, ry)}/${feather},0,1)` : `if(lte(${normalized},1),1,0)`;
  } else {
    const x2 = effect.x + effect.width, y2 = effect.y + effect.height;
    const insideDistance = `min(min(X-${effect.x},${x2}-X),min(Y-${effect.y},${y2}-Y))`;
    coverage = effect.feather > 0 ? `clip(0.5+(${insideDistance})/${feather},0,1)` : `if(gte(${insideDistance},0),1,0)`;
  }
  return effect.invert ? `(1-(${coverage}))` : coverage;
}

export function compileVisualEffectFilters(effects, { canvasWidth, canvasHeight } = {}) {
  const validated = validateEffectStack(effects || []), filters = [];
  for (const effect of validated) {
    if (effect.type === "grayscale") filters.push("hue=s=0");
    else if (effect.type === "color") filters.push(`eq=brightness=${effect.brightness}:contrast=${effect.contrast}:saturation=${effect.saturation}`);
    else if (effect.type === "blur") filters.push(`boxblur=${effect.radius}:1`);
    else if (effect.type === "zoom") filters.push(`scale=iw*${effect.factor}:ih*${effect.factor}`, `crop=${canvasWidth}:${canvasHeight}`);
    else if (effect.type === "lut") filters.push(`lut3d=file='${effect.path.replace(/:/g, "\\:").replace(/'/g, "\\'")}'`);
    else if (effect.type === "chroma-key") filters.push("format=yuva444p", `chromakey=color=0x${effect.color.slice(1)}:similarity=${effect.similarity}:blend=${effect.blend}`, "format=rgba");
    else if (effect.type === "mask") { const alpha = `alpha(X,Y)*(${maskAlpha(effect)})`; filters.push("format=rgba", `geq=r='r(X,Y)':g='g(X,Y)':b='b(X,Y)':a='${escapeExpression(alpha)}'`); }
    else if (effect.type === "color-grade") { const brightness = effect.exposure / 6, rm = effect.temperature * 0.25, bm = -effect.temperature * 0.25, gm = effect.tint * 0.2; filters.push(`eq=brightness=${brightness}:contrast=${effect.contrast}:saturation=${effect.saturation}`, `colorbalance=rs=${effect.redShadows}:bs=${effect.blueShadows}:rm=${rm}:gm=${gm}:bm=${bm}:rh=${effect.redHighlights}:bh=${effect.blueHighlights}:pl=${effect.preserveLightness ? 1 : 0}`); }
    else if (effect.type === "curves") filters.push(`curves=preset=${effect.preset}`);
    else if (effect.type === "vignette") filters.push(`vignette=angle=${effect.angle}:aspect=1/${effect.softness}`);
    else if (effect.type === "glsl") { /* rendered before the FFmpeg stack */ }
  }
  return { effects: validated, filters };
}
