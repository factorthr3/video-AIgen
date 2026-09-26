// Stage 3: voiceover. One audio clip per scene so each image lasts exactly as
// long as its narration. Providers: ElevenLabs → OpenAI → system voice
// (macOS `say` / espeak-ng) → silence (captions still carry the story).
import fs from 'node:fs/promises';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { config, resolveTtsProvider, CACHE_DIR } from '../config.js';
import { VOICE, LANGUAGE } from '../catalog.js';
import { run, toWav, silenceWav, probeDuration } from './ffmpeg.js';

const DELIVERY = {
  scary: 'Narrate like a campfire horror storyteller: low, tense, deliberate, with dread building toward the end.',
  history: 'Narrate like a gripping documentary host: confident, vivid, a hint of wry humour.',
  mythology: 'Narrate like an epic trailer voice telling an ancient legend: grand and dramatic.',
  'fun-facts': 'Narrate fast and upbeat like a viral facts creator, with genuine amazement.',
  motivation: 'Narrate calmly and with conviction, like a mentor speaking directly to the listener.',
  heists: 'Narrate like a slick true-crime podcast host: suspenseful, punchy, cinematic.',
  space: 'Narrate with quiet awe, like a planetarium show host.',
  bible: 'Narrate reverently and warmly, like a storyteller reading scripture aloud.',
  kindness: 'Narrate gently and warmly, letting the emotional moments breathe.',
  anime: 'Narrate like an anime protagonist monologue: intense and emotional.',
  drama: 'Narrate like a juicy storytime creator: conversational, sassy, animated.',
};
const DEFAULT_DELIVERY = 'Narrate like an engaging short-form video storyteller: clear, energetic, natural pacing.';

async function elevenlabs(text, voice, file) {
  const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voice.elevenlabs}?output_format=mp3_44100_128`, {
    method: 'POST',
    headers: { 'xi-api-key': config.elevenlabs.key, 'Content-Type': 'application/json' },
    body: JSON.stringify({ text, model_id: config.elevenlabs.model }),
    signal: AbortSignal.timeout(90_000),
  });
  if (!res.ok) throw new Error(`ElevenLabs ${res.status}: ${(await res.text()).slice(0, 200)}`);
  await fs.writeFile(file, Buffer.from(await res.arrayBuffer()));
}

async function openai(text, voice, file, niche) {
  const body = { model: config.openai.ttsModel, voice: voice.openai, input: text, response_format: 'mp3' };
  if (config.openai.ttsModel.includes('gpt-4o')) body.instructions = DELIVERY[niche] || DEFAULT_DELIVERY;
  const res = await fetch('https://api.openai.com/v1/audio/speech', {
    method: 'POST',
    headers: { Authorization: `Bearer ${config.openai.key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(90_000),
  });
  if (!res.ok) throw new Error(`OpenAI TTS ${res.status}: ${(await res.text()).slice(0, 200)}`);
  await fs.writeFile(file, Buffer.from(await res.arrayBuffer()));
}

// ---- system voices ----
const NOVELTY = /^(Bad News|Bahh|Bells|Boing|Bubbles|Cellos|Wobble|Good News|Jester|Organ|Superstar|Trinoids|Whisper|Zarvox|Albert|Fred|Junior|Ralph|Kathy|Grandma|Grandpa)/;
let macVoices;
function listMacVoices() {
  if (macVoices) return macVoices;
  const out = spawnSync('say', ['-v', '?'], { encoding: 'utf8' });
  macVoices = (out.stdout || '').split('\n').map((line) => {
    const m = line.match(/^(.+?)\s+([a-z]{2}_[A-Z]{2})\s+#/);
    return m && { name: m[1].trim(), locale: m[2] };
  }).filter(Boolean);
  return macVoices;
}
const hasBinary = (bin) => spawnSync('which', [bin]).status === 0;
let systemEngine;
export function systemTtsEngine() {
  if (systemEngine !== undefined) return systemEngine;
  if (process.platform === 'darwin' && hasBinary('say')) systemEngine = 'say';
  else if (hasBinary('espeak-ng')) systemEngine = 'espeak-ng';
  else systemEngine = null;
  return systemEngine;
}

function macVoiceFor(voice, language) {
  const voices = listMacVoices();
  const locale = (LANGUAGE[language] || LANGUAGE.en).locale;
  const lang = locale.slice(0, 2);
  if (lang === 'en' && voices.some((v) => v.name === voice.system)) return voice.system;
  const candidates = voices.filter((v) => v.locale.startsWith(`${lang}_`) && !NOVELTY.test(v.name));
  // Keep the persona's gender feel where the locale offers a choice.
  const preferred = candidates.find((v) => (voice.gender === 'male' ? /Eddy|Reed|Rocko|Daniel|Thomas|Luca|Jorge|Diego/ : /Flo|Sandy|Shelley|Samantha|Amélie|Anna|Alice|Mónica|Paulina|Kyoko|Yuna|Tingting|Luciana|Damayanti|Lekha/).test(v.name));
  return (preferred || candidates.find((v) => v.locale === locale) || candidates[0] || { name: 'Samantha' }).name ?? 'Samantha';
}

async function system(text, voice, file, language) {
  const engine = systemTtsEngine();
  if (!engine) return false;
  const textFile = `${file}.txt`;
  await fs.writeFile(textFile, text);
  try {
    if (engine === 'say') {
      await run('say', ['-v', macVoiceFor(voice, language), '-r', '185', '-o', file, '-f', textFile]);
    } else {
      await run('espeak-ng', ['-v', language || 'en', '-s', '165', '-w', file, '-f', textFile]);
    }
  } finally {
    await fs.rm(textFile, { force: true });
  }
  return true;
}

const estimateSeconds = (text) => Math.max(1.2, text.split(/\s+/).filter(Boolean).length / 2.6);

// Synthesise one clip → normalised WAV. Returns { file, duration, provider }.
export async function speak({ text, voiceId, language, niche, outBase, provider = resolveTtsProvider() }) {
  const voice = VOICE[voiceId] || VOICE.nova;
  const raw = `${outBase}.raw${provider === 'system' ? (systemTtsEngine() === 'say' ? '.aiff' : '.wav') : '.mp3'}`;
  const wav = `${outBase}.wav`;
  let used = provider;
  try {
    if (provider === 'elevenlabs') await elevenlabs(text, voice, raw);
    else if (provider === 'openai') await openai(text, voice, raw, niche);
    else if (provider === 'system') { if (!(await system(text, voice, raw, language))) used = 'silent'; }
    else used = 'silent';
  } catch (err) {
    // A failed remote call shouldn't sink the whole video: fall back to the system voice.
    if (provider === 'system') throw err;
    return { ...(await speak({ text, voiceId, language, niche, outBase, provider: 'system' })), error: err.message };
  }
  if (used === 'silent') {
    await silenceWav(estimateSeconds(text), wav);
  } else {
    await toWav(raw, wav);
    await fs.rm(raw, { force: true });
  }
  return { file: wav, duration: await probeDuration(wav), provider: used };
}

export async function voicePreview(voiceId, language = 'en') {
  const provider = resolveTtsProvider();
  const dir = path.join(CACHE_DIR, 'voice-previews');
  await fs.mkdir(dir, { recursive: true });
  const base = path.join(dir, `${provider}-${voiceId}-${language}`);
  const out = `${base}.m4a`;
  try {
    await fs.access(out);
    return out;
  } catch {}
  const samples = {
    en: 'Nobody believed the story. Until the night it happened to me.',
    es: 'Nadie creía la historia. Hasta la noche en que me pasó a mí.',
    fr: "Personne ne croyait l'histoire. Jusqu'à la nuit où elle m'est arrivée.",
    de: 'Niemand glaubte die Geschichte. Bis sie mir in jener Nacht passierte.',
    pt: 'Ninguém acreditava na história. Até a noite em que aconteceu comigo.',
    it: 'Nessuno credeva alla storia. Fino alla notte in cui è successo a me.',
  };
  const { file } = await speak({ text: samples[language] || samples.en, voiceId, language, outBase: base, provider });
  await run(config.ffmpeg, ['-y', '-loglevel', 'error', '-i', file, '-c:a', 'aac', '-b:a', '128k', out]);
  await fs.rm(file, { force: true });
  return out;
}
