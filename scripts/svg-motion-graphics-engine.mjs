import { spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

const xml = (value) => String(value ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");

export function validateSvgSource(source) {
  const errors = [];
  if (!/<svg[\s>]/i.test(source)) errors.push("Source must contain an <svg> root");
  const forbidden = [/<script[\s>]/i, /<foreignObject[\s>]/i, /\son[a-z]+\s*=/i, /(?:href|xlink:href)\s*=\s*["']\s*(?:https?:|file:|data:|\/\/)/i, /url\s*\(\s*["']?\s*(?:https?:|file:|data:|\/\/)/i, /<!ENTITY/i, /<!DOCTYPE/i];
  if (forbidden.some((pattern) => pattern.test(source))) errors.push("SVG contains scripts, event handlers, external resources, entities, or foreignObject");
  return { valid: errors.length === 0, errors };
}

export function renderSvgTemplate(source, properties, values = {}) {
  const validation = validateSvgSource(source);
  if (!validation.valid) throw new Error(validation.errors.join("\n"));
  const allowed = new Set(properties.map((entry) => entry.key));
  const rendered = source.replace(/\{\{([a-zA-Z][\w.-]*)\}\}/g, (_, key) => {
    if (!allowed.has(key)) throw new Error(`SVG template uses undeclared property: ${key}`);
    const property = properties.find((entry) => entry.key === key);
    const value = values[key] ?? property.defaultValue;
    if (property.type === "number" && !Number.isFinite(Number(value))) throw new Error(`Property ${key} must be numeric`);
    return xml(value);
  });
  const unresolved = [...rendered.matchAll(/\{\{([^}]+)\}\}/g)].map((match) => match[1]);
  if (unresolved.length) throw new Error(`Unresolved SVG properties: ${unresolved.join(", ")}`);
  return rendered;
}

export function renderSvgMotionGraphic({ source, properties = [], values = {}, width, height, sourcePath, outputPath }) {
  const svg = renderSvgTemplate(source, properties, values);
  const svgPath = resolve(sourcePath);
  const output = resolve(outputPath);
  mkdirSync(dirname(svgPath), { recursive: true });
  mkdirSync(dirname(output), { recursive: true });
  writeFileSync(svgPath, svg);
  const result = spawnSync("magick", ["-background", "none", "-font", "/System/Library/Fonts/Supplemental/Arial Unicode.ttf", "-density", "144", svgPath, "-resize", `${width}x${height}!`, output], { encoding: "utf8", maxBuffer: 32 * 1024 * 1024 });
  if (result.status !== 0) throw new Error(result.stderr || "SVG Motion Graphic render failed");
  return { sourcePath: svgPath, outputPath: output, svg };
}
