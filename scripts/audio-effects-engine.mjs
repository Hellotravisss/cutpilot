const range = (value, min, max, label) => { const number = Number(value); if (!Number.isFinite(number) || number < min || number > max) throw new Error(`${label} must be ${min}-${max}`); return number; };
const dbLinear = (db) => Math.pow(10, Number(db) / 20);

export function validateAudioEffectStack(effects) {
  if (!Array.isArray(effects)) throw new Error("Audio effects must be an array");
  if (effects.length > 24) throw new Error("An item supports at most 24 audio effects");
  return effects.map((effect) => {
    if (!effect || typeof effect !== "object") throw new Error("Every audio effect must be an object");
    if (effect.type === "highpass" || effect.type === "lowpass") return { type: effect.type, frequency: range(effect.frequency, 20, 20000, `${effect.type} frequency`) };
    if (effect.type === "equalizer") {
      if (!Array.isArray(effect.bands) || !effect.bands.length || effect.bands.length > 12) throw new Error("Equalizer requires 1-12 bands");
      return { type: "equalizer", bands: effect.bands.map((band) => ({ frequency: range(band.frequency, 20, 20000, "EQ frequency"), gainDb: range(band.gainDb ?? 0, -24, 24, "EQ gain"), q: range(band.q ?? 1, 0.1, 20, "EQ Q") })) };
    }
    if (effect.type === "compressor") return { type: "compressor", thresholdDb: range(effect.thresholdDb ?? -18, -60, 0, "compressor threshold"), ratio: range(effect.ratio ?? 3, 1, 20, "compressor ratio"), attackMs: range(effect.attackMs ?? 15, 0.01, 2000, "compressor attack"), releaseMs: range(effect.releaseMs ?? 180, 0.01, 9000, "compressor release"), makeupDb: range(effect.makeupDb ?? 0, 0, 24, "compressor makeup"), knee: range(effect.knee ?? 2.8, 1, 8, "compressor knee"), mix: range(effect.mix ?? 1, 0, 1, "compressor mix") };
    if (effect.type === "gate") return { type: "gate", thresholdDb: range(effect.thresholdDb ?? -42, -90, 0, "gate threshold"), reductionDb: range(effect.reductionDb ?? -40, -90, 0, "gate reduction"), ratio: range(effect.ratio ?? 8, 1, 9000, "gate ratio"), attackMs: range(effect.attackMs ?? 5, 0.01, 9000, "gate attack"), releaseMs: range(effect.releaseMs ?? 180, 0.01, 9000, "gate release") };
    if (effect.type === "deesser") return { type: "deesser", intensity: range(effect.intensity ?? 0.5, 0, 1, "de-esser intensity"), maxReduction: range(effect.maxReduction ?? 0.5, 0, 1, "de-esser max reduction"), frequency: range(effect.frequency ?? 0.55, 0, 1, "de-esser frequency") };
    if (effect.type === "stereo") return { type: "stereo", balance: range(effect.balance ?? 0, -1, 1, "stereo balance"), width: range(effect.width ?? 0, -1, 1, "stereo width"), softClip: Boolean(effect.softClip), phaseLeft: Boolean(effect.phaseLeft), phaseRight: Boolean(effect.phaseRight) };
    if (effect.type === "pitch") return { type: "pitch", semitones: range(effect.semitones ?? 0, -12, 12, "pitch semitones") };
    if (effect.type === "limiter") return { type: "limiter", ceilingDb: range(effect.ceilingDb ?? -1, -12, -0.01, "limiter ceiling") };
    throw new Error(`Unsupported audio effect type: ${effect.type}`);
  });
}

export function compileAudioEffectFilters(effects) {
  const validated = validateAudioEffectStack(effects || []), filters = [];
  for (const effect of validated) {
    if (effect.type === "highpass" || effect.type === "lowpass") filters.push(`${effect.type}=f=${effect.frequency}`);
    else if (effect.type === "equalizer") for (const band of effect.bands) filters.push(`equalizer=f=${band.frequency}:t=q:w=${band.q}:g=${band.gainDb}`);
    else if (effect.type === "compressor") filters.push(`acompressor=threshold=${dbLinear(effect.thresholdDb)}:ratio=${effect.ratio}:attack=${effect.attackMs}:release=${effect.releaseMs}:makeup=${dbLinear(effect.makeupDb)}:knee=${effect.knee}:mix=${effect.mix}`);
    else if (effect.type === "gate") filters.push(`agate=threshold=${dbLinear(effect.thresholdDb)}:range=${dbLinear(effect.reductionDb)}:ratio=${effect.ratio}:attack=${effect.attackMs}:release=${effect.releaseMs}`);
    else if (effect.type === "deesser") filters.push(`deesser=i=${effect.intensity}:m=${effect.maxReduction}:f=${effect.frequency}:s=o`);
    else if (effect.type === "stereo") filters.push(`aformat=channel_layouts=stereo`, `stereotools=balance_out=${effect.balance}:base=${effect.width}:softclip=${effect.softClip ? 1 : 0}:phasel=${effect.phaseLeft ? 1 : 0}:phaser=${effect.phaseRight ? 1 : 0}`);
    else if (effect.type === "pitch" && Math.abs(effect.semitones) > 0.0001) { const factor = Math.pow(2, effect.semitones / 12); filters.push("aresample=48000", `asetrate=${48000 * factor}`, "aresample=48000", `atempo=${(1 / factor).toFixed(8)}`); }
    else if (effect.type === "limiter") filters.push(`alimiter=limit=${dbLinear(effect.ceilingDb)}`);
  }
  return { effects: validated, filters };
}
