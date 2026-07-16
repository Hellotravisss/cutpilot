const normalize = (value) => String(value || "").toLowerCase().normalize("NFKC").replace(/[^\p{L}\p{N}\u4e00-\u9fff]+/gu, " ").trim();

export function terms(value) {
  const cleaned = normalize(value);
  const words = cleaned.split(/\s+/).filter(Boolean);
  const chinese = [...cleaned.replace(/[^\u4e00-\u9fff]/g, "")];
  const bigrams = chinese.slice(0, -1).map((char, index) => char + chinese[index + 1]);
  return new Set([...words, ...chinese, ...bigrams]);
}

export function rankAssets(assets, query, { limit = 10, avoidAssetIds = [] } = {}) {
  const queryTerms = terms(query);
  const avoid = new Set(avoidAssetIds);
  return assets.map((asset) => {
    const annotationText = [asset.name, asset.annotation?.description, ...(asset.annotation?.tags || []), ...(asset.annotation?.people || []), ...(asset.annotation?.actions || []), ...(asset.annotation?.locations || [])].join(" ");
    const assetTerms = terms(annotationText);
    const matches = [...queryTerms].filter((term) => assetTerms.has(term));
    const tagMatches = (asset.annotation?.tags || []).filter((tag) => {
      const tagTerms = terms(tag);
      return [...queryTerms].some((term) => tagTerms.has(term));
    });
    const semanticBoost = Number(asset.annotation?.quality || 0.5) + Number(asset.annotation?.motion || 0.5) * 0.15;
    const repetitionPenalty = avoid.has(asset.id) ? 4 : 0;
    const score = matches.length * 2 + tagMatches.length * 1.5 + semanticBoost - repetitionPenalty;
    return { assetId: asset.id, name: asset.name, score: Number(score.toFixed(3)), matches, tagMatches, annotation: asset.annotation || null, avoided: avoid.has(asset.id) };
  }).filter((entry) => entry.matches.length > 0 || entry.tagMatches.length > 0).sort((a, b) => b.score - a.score || a.name.localeCompare(b.name)).slice(0, limit);
}

const compact = (value) => normalize(value).replace(/\s+/g, "");

export function transcriptWords(transcript) {
  return (transcript?.cues || []).flatMap((cue) => (cue.words || []).filter((word) => compact(word.text)).map((word) => ({ ...word, normalized: compact(word.text) })));
}

export function findPhraseRanges(transcript, phrases) {
  const words = transcriptWords(transcript);
  const joined = words.map((word) => word.normalized).join("");
  const offsets = [];
  let cursor = 0;
  words.forEach((word, index) => {
    offsets.push({ index, start: cursor, end: cursor + word.normalized.length });
    cursor += word.normalized.length;
  });
  const ranges = [];
  for (const phrase of phrases) {
    const needle = compact(phrase);
    if (!needle) continue;
    let from = 0;
    while (from < joined.length) {
      const found = joined.indexOf(needle, from);
      if (found < 0) break;
      const endChar = found + needle.length;
      const first = offsets.find((offset) => offset.end > found);
      const last = [...offsets].reverse().find((offset) => offset.start < endChar);
      if (first && last) ranges.push({ phrase, start: words[first.index].start, end: words[last.index].end, text: words.slice(first.index, last.index + 1).map((word) => word.text).join("") });
      from = found + Math.max(1, needle.length);
    }
  }
  return ranges.sort((a, b) => a.start - b.start);
}

export function buildSpeechEdit(asset, transcript, removePhrases, { maxGapSeconds = 0.35 } = {}) {
  const removed = findPhraseRanges(transcript, removePhrases);
  const merged = [];
  for (const range of removed) {
    const previous = merged.at(-1);
    if (previous && range.start <= previous.end + 0.03) previous.end = Math.max(previous.end, range.end);
    else merged.push({ ...range });
  }
  const kept = [];
  let sourceCursor = 0;
  let timelineCursor = 0;
  const sourceEnd = Number(asset.duration || Math.max(0, ...(transcript.cues || []).map((cue) => cue.end)));
  for (const range of merged) {
    if (range.start > sourceCursor + 0.02) {
      const sourceDuration = range.start - sourceCursor;
      kept.push({ sourceStart: sourceCursor, duration: sourceDuration, start: timelineCursor });
      timelineCursor += sourceDuration;
    }
    sourceCursor = Math.max(sourceCursor, range.end);
  }
  if (sourceEnd > sourceCursor + 0.02) kept.push({ sourceStart: sourceCursor, duration: sourceEnd - sourceCursor, start: timelineCursor });

  const mapping = kept.map((segment) => ({ sourceStart: segment.sourceStart, sourceEnd: segment.sourceStart + segment.duration, timelineStart: segment.start }));
  const captions = [];
  for (const cue of transcript.cues || []) {
    const words = (cue.words || []).filter((word) => !merged.some((range) => word.start < range.end && word.end > range.start));
    if (!words.length) continue;
    const mapTime = (sourceTime) => {
      const segment = mapping.find((entry) => sourceTime >= entry.sourceStart - 0.001 && sourceTime <= entry.sourceEnd + 0.001);
      return segment ? segment.timelineStart + sourceTime - segment.sourceStart : null;
    };
    const start = mapTime(words[0].start);
    const end = mapTime(words.at(-1).end);
    if (start == null || end == null || end <= start) continue;
    const text = words.map((word) => word.text).join("").trim();
    captions.push({ start, end, text, words: words.map((word) => ({ ...word, start: mapTime(word.start), end: mapTime(word.end) })) });
  }
  return { removed, kept, captions, duration: kept.reduce((sum, segment) => sum + segment.duration, 0), maxGapSeconds };
}
