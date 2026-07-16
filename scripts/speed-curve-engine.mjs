const clampRate = (value) => Math.min(16, Math.max(0.1, Number(value)));

function easingProgress(progress, easing = "linear", bezier = null) {
  if (easing === "hold") return 0;
  if (easing === "ease-in") return progress * progress;
  if (easing === "ease-out") return 1 - (1 - progress) ** 2;
  if (easing === "ease-in-out") return progress * progress * (3 - 2 * progress);
  if (easing === "bezier") {
    const y1 = Number(bezier?.y1 ?? 0.25), y2 = Number(bezier?.y2 ?? 0.75), inverse = 1 - progress;
    return 3 * inverse * inverse * progress * y1 + 3 * inverse * progress * progress * y2 + progress ** 3;
  }
  return progress;
}

export function normalizeSpeedCurve(curve, duration, fallbackRate = 1) {
  if (!Array.isArray(curve) || curve.length === 0) return [];
  const points = curve.map((point) => ({
    time: Number(point.time), rate: clampRate(point.rate), easing: point.easing || "linear", ...(point.bezier ? { bezier: point.bezier } : {}),
  })).filter((point) => Number.isFinite(point.time) && Number.isFinite(point.rate) && point.time >= 0 && point.time <= duration).sort((a, b) => a.time - b.time);
  if (!points.length) return [];
  for (let index = 1; index < points.length; index++) if (Math.abs(points[index].time - points[index - 1].time) < 0.000001) throw new Error("Speed curve point times must be unique");
  if (points[0].time > 0) points.unshift({ time: 0, rate: clampRate(fallbackRate), easing: "linear" });
  if (points.at(-1).time < duration) points.push({ time: duration, rate: points.at(-1).rate, easing: "linear" });
  return points;
}

export function speedAtTime(points, time) {
  if (!points.length) return 1;
  if (time <= points[0].time) return points[0].rate;
  for (let index = 0; index < points.length - 1; index++) {
    const left = points[index], right = points[index + 1];
    if (time <= right.time) {
      const progress = (time - left.time) / Math.max(0.000001, right.time - left.time);
      return left.rate + (right.rate - left.rate) * easingProgress(progress, left.easing, left.bezier);
    }
  }
  return points.at(-1).rate;
}

export function buildSpeedSegments(curve, duration, fallbackRate = 1, sampleDuration = 0.1) {
  const points = normalizeSpeedCurve(curve, duration, fallbackRate);
  if (!points.length) return [];
  const segmentCount = Math.min(300, Math.max(1, Math.ceil(duration / Math.max(0.02, sampleDuration))));
  const segments = [];
  let sourceCursor = 0;
  for (let index = 0; index < segmentCount; index++) {
    const start = duration * index / segmentCount, end = duration * (index + 1) / segmentCount;
    const rate = clampRate(speedAtTime(points, (start + end) / 2));
    const sourceDuration = (end - start) * rate;
    segments.push({ start, end, duration: end - start, rate, sourceStart: sourceCursor, sourceDuration, sourceEnd: sourceCursor + sourceDuration });
    sourceCursor += sourceDuration;
  }
  return segments;
}

export function videoCurveSetptsExpression(segments) {
  if (!segments.length) return "PTS-STARTPTS";
  const clock = "((PTS-STARTPTS)*TB)";
  let expression = String(segments.at(-1).end);
  for (let index = segments.length - 1; index >= 0; index--) {
    const segment = segments[index];
    const mapped = `${segment.start}+(${clock}-${segment.sourceStart})/${segment.rate}`;
    expression = `if(lt(${clock},${segment.sourceEnd}),${mapped},${expression})`;
  }
  return `(${expression})/TB`;
}

export function playbackSourceSpan(item) {
  if (item.freezeFrame) return 0;
  const segments = buildSpeedSegments(item.speedCurve, item.duration, Number(item.playbackRate || 1));
  return segments.length ? segments.at(-1).sourceEnd : item.duration * Number(item.playbackRate || 1);
}

export function sliceSpeedCurve(curve, duration, start, end, fallbackRate = 1) {
  if (!Array.isArray(curve) || !curve.length) return [];
  const points = normalizeSpeedCurve(curve, duration, fallbackRate), clipped = [];
  const activePoint = (time) => {
    let active = points[0];
    for (const point of points) { if (point.time > time) break; active = point; }
    return active;
  };
  const firstActive = activePoint(start);
  clipped.push({ time: 0, rate: speedAtTime(points, start), easing: firstActive.easing || "linear", ...(firstActive.bezier ? { bezier: firstActive.bezier } : {}) });
  for (const point of points) if (point.time > start && point.time < end) clipped.push({ ...point, time: point.time - start });
  clipped.push({ time: end - start, rate: speedAtTime(points, end), easing: "linear" });
  return clipped.filter((point, index) => index === 0 || Math.abs(point.time - clipped[index - 1].time) > 0.000001);
}

export function validateSpeedCurve(curve, duration) {
  if (curve === undefined || curve === null) return [];
  if (!Array.isArray(curve)) throw new Error("Speed curve must be an array");
  if (curve.length > 64) throw new Error("Speed curve supports at most 64 editable points");
  return normalizeSpeedCurve(curve, duration);
}
