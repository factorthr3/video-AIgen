// Custom instrumental soundtracks for ads, composed by ElevenLabs Music to the
// exact length of each video. Tracks are cached by prompt, length and model,
// so re-renders with unchanged timing reuse them.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { config, CACHE_DIR } from '../config.js';

export const soundtrackEnabled = () => Boolean(config.elevenlabs.key);

// Moods a client can pick; "auto" uses the brief Claude writes for the ad set.
export const MUSIC_MOODS = [
  { id: 'auto', name: 'Match the ad', prompt: null },
  { id: 'upbeat', name: 'Upbeat', prompt: 'Upbeat modern pop instrumental, bright synths, claps and a warm bass line, around 118 BPM, feel-good and confident' },
  { id: 'chill', name: 'Chill', prompt: 'Chill lo-fi house instrumental, warm electric piano, soft drums and gentle bass, around 100 BPM, relaxed and premium' },
  { id: 'cinematic', name: 'Cinematic', prompt: 'Cinematic hybrid orchestral instrumental, pulsing strings and synths that build tension into a confident, uplifting finish, around 90 BPM' },
  { id: 'luxury', name: 'Luxury', prompt: 'Elegant minimal instrumental, solo piano with soft strings and subtle ambient texture, around 75 BPM, refined and timeless' },
  { id: 'energetic', name: 'Energetic', prompt: 'High-energy electronic instrumental, punchy drums, driving bass and rising synth hooks, around 128 BPM, exciting and bold' },
];
export const MUSIC_MOOD = Object.fromEntries(MUSIC_MOODS.map((m) => [m.id, m]));

// A sensible default per ad style when there's no brief from Claude.
const STYLE_MOOD = { clean: 'chill', bold: 'upbeat', luxury: 'luxury', promo: 'energetic' };

/** The music brief for an ad set: the chosen mood, else Claude's brief, else the style's default. */
export function musicBrief({ mood, copyBrief, style }) {
  if (mood && mood !== 'auto' && MUSIC_MOOD[mood]) return MUSIC_MOOD[mood].prompt;
  return copyBrief || MUSIC_MOOD[STYLE_MOOD[style] || 'upbeat'].prompt;
}

let workingModel = null;
const inFlight = new Map(); // ad sets rendering the same brief at once share one request

/** Compose (or reuse) an instrumental track of `seconds` for `brief`; returns the file path. */
export function soundtrack({ brief, seconds }) {
  const ms = Math.min(600_000, Math.max(3000, Math.ceil(seconds * 1000)));
  const id = JSON.stringify([brief, ms]);
  if (!inFlight.has(id)) inFlight.set(id, compose(brief, ms).finally(() => inFlight.delete(id)));
  return inFlight.get(id);
}

async function compose(brief, ms) {
  const secs = Math.round(ms / 1000);
  // Ad tracks need energy right to the end card, then a clean stop (no long fade).
  const prompt = `${brief}. Instrumental only, no vocals. A ${secs}-second advert soundtrack that starts strong, keeps full energy for the whole ${secs} seconds and stops on a final hit right at the end, with no long fade-out.`;
  const models = workingModel ? [workingModel] : [...new Set([config.elevenlabs.musicModel, 'music_v2', 'music_v1'])];
  let lastError;
  for (const model of models) {
    const key = crypto.createHash('sha1').update(JSON.stringify([model, prompt, ms])).digest('hex').slice(0, 16);
    const file = path.join(CACHE_DIR, `soundtrack-${key}.mp3`);
    if (fs.existsSync(file)) return file;
    const res = await fetch(`${config.elevenlabs.baseUrl}/v1/music`, {
      method: 'POST',
      headers: { 'xi-api-key': config.elevenlabs.key, 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt, music_length_ms: ms, model_id: model, force_instrumental: true }),
      signal: AbortSignal.timeout(240_000),
    });
    if (res.ok) {
      const audio = Buffer.from(await res.arrayBuffer());
      if (audio.length < 1000) throw new Error('ElevenLabs returned an empty track.');
      fs.writeFileSync(`${file}.part`, audio);
      fs.renameSync(`${file}.part`, file);
      workingModel = model;
      return file;
    }
    const detail = (await res.text().catch(() => '')).slice(0, 300);
    lastError = new Error(`ElevenLabs music ${res.status}: ${detail}`);
    // Only an unavailable model is worth retrying with an older one.
    if (![400, 403, 404, 422].includes(res.status) || !/model/i.test(detail)) break;
  }
  throw lastError;
}
