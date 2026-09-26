// Word-level caption timing. ElevenLabs returns exact per-word timings, which
// we use as-is. Other providers don't, so we distribute each scene's measured
// audio duration across its words, weighted by length and punctuation pauses.
// Accurate enough for karaoke-style captions.

const CJK = new Set(['ja', 'zh']);

function tokenize(text, language) {
  if (!CJK.has(language)) return text.split(/\s+/).filter(Boolean);
  // No spaces between words: split on punctuation, then into short runs.
  const out = [];
  for (const clause of text.split(/(?<=[、。，！？!?,.])/)) {
    const c = clause.trim();
    for (let i = 0; i < c.length; i += 6) out.push(c.slice(i, i + 6));
  }
  return out.filter(Boolean);
}

function weight(word) {
  const letters = word.replace(/[^\p{L}\p{N}]/gu, '').length;
  let w = 2 + letters;
  if (/[,;:、，]$/.test(word)) w += 4;
  if (/[.!?…。！？]["'”’]?$/.test(word)) w += 7;
  return w;
}

// scenes: [{ narration, start, speechDuration, wordTimes? }] → flat [{ text, start, end }]
export function timeWords(scenes, language) {
  const words = [];
  for (const scene of scenes) {
    const tokens = tokenize(scene.narration, language);
    if (!tokens.length) continue;
    // Exact timings from the TTS provider, when they line up with our tokens.
    if (scene.wordTimes?.length === tokens.length && !CJK.has(language)) {
      scene.wordTimes.forEach((w, i) => words.push({ text: tokens[i], start: scene.start + w.start, end: scene.start + w.end }));
      continue;
    }
    const lead = 0.05;
    const usable = Math.max(0.3, scene.speechDuration - lead - 0.1);
    const total = tokens.reduce((sum, t) => sum + weight(t), 0);
    let t = scene.start + lead;
    for (const token of tokens) {
      const d = (weight(token) / total) * usable;
      words.push({ text: token, start: t, end: t + d });
      t += d;
    }
  }
  return words;
}

// Group words into on-screen chunks. Short punchy chunks for the animated
// styles, fuller subtitle lines for the minimal style.
export function chunkWords(words, captionStyle) {
  const maxWords = captionStyle === 'minimal' ? 7 : 3;
  const maxChars = captionStyle === 'minimal' ? 38 : 18;
  const chunks = [];
  let current = [];
  const flush = () => {
    if (current.length) chunks.push({ words: current, start: current[0].start, end: current.at(-1).end });
    current = [];
  };
  for (const w of words) {
    const chars = current.reduce((n, x) => n + x.text.length + 1, 0) + w.text.length;
    if (current.length && (current.length >= maxWords || chars > maxChars)) flush();
    current.push(w);
    if (/[.!?…。！？,;:]["'”’]?$/.test(w.text)) flush();
  }
  flush();
  // Hold each chunk on screen until the next one starts (no flicker between words).
  for (let i = 0; i < chunks.length - 1; i++) {
    const gap = chunks[i + 1].start - chunks[i].end;
    if (gap < 0.6) chunks[i].end = chunks[i + 1].start;
  }
  return chunks;
}
