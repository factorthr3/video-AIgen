// Everything a user can pick, shared with the web app via GET /api/catalog
// so the two never drift.
import { FORMATS, FORMAT_IDS, LENGTHS, STYLES, BRAND_FONTS } from './ads/design.js';
import { MUSIC_MOODS } from './ads/soundtrack.js';

// Voices are app-level personas mapped to each TTS provider's native voice.
// ElevenLabs IDs are its current default ("premade") voices, available to every account.
export const VOICES = [
  { id: 'onyx', name: 'Onyx', gender: 'male', description: 'Deep & dramatic', openai: 'onyx', elevenlabs: 'nPczCjzI2devNBz1zQrb', system: 'Reed (English (US))' }, // Brian
  { id: 'fable', name: 'Fable', gender: 'male', description: 'British storyteller', openai: 'fable', elevenlabs: 'JBFqnCBsd6RMkjVDRZzb', system: 'Daniel' }, // George
  { id: 'echo', name: 'Echo', gender: 'male', description: 'Calm & wise', openai: 'echo', elevenlabs: 'pqHfZKP75CvOlQylNhV4', system: 'Rocko (English (US))' }, // Bill
  { id: 'ash', name: 'Ash', gender: 'male', description: 'Energetic hype', openai: 'ash', elevenlabs: 'TX3LPaxmHKxFdv7VOQHJ', system: 'Eddy (English (US))' }, // Liam
  { id: 'nova', name: 'Nova', gender: 'female', description: 'Bright & friendly', openai: 'nova', elevenlabs: 'cgSgspJ2msm6clMCkdW9', system: 'Samantha' }, // Jessica
  { id: 'shimmer', name: 'Shimmer', gender: 'female', description: 'Soft & reassuring', openai: 'shimmer', elevenlabs: 'EXAVITQu4vr4xnSDxMaL', system: 'Karen' }, // Sarah
  { id: 'coral', name: 'Coral', gender: 'female', description: 'Upbeat creator', openai: 'coral', elevenlabs: 'FGY2WhTYpPnrIDTdsKH5', system: 'Flo (English (US))' }, // Laura
  { id: 'sage', name: 'Sage', gender: 'female', description: 'Velvety & measured', openai: 'sage', elevenlabs: 'pFZP5JQG7iQjIQuC4Bku', system: 'Moira' }, // Lily
];

export const MUSIC = [
  { id: 'none', name: 'No music' },
  { id: 'dark-ambient', name: 'Dark Ambient', description: 'Low drones for suspense' },
  { id: 'epic-pulse', name: 'Epic Pulse', description: 'Driving cinematic pulse' },
  { id: 'calm-pad', name: 'Calm Pad', description: 'Warm, reflective chords' },
  { id: 'bright-pluck', name: 'Bright Pluck', description: 'Upbeat arpeggio' },
];

export const LANGUAGES = [
  { id: 'en', name: 'English', locale: 'en_US' },
  { id: 'es', name: 'Spanish', locale: 'es_ES' },
  { id: 'fr', name: 'French', locale: 'fr_FR' },
  { id: 'de', name: 'German', locale: 'de_DE' },
  { id: 'pt', name: 'Portuguese', locale: 'pt_BR' },
  { id: 'it', name: 'Italian', locale: 'it_IT' },
  { id: 'nl', name: 'Dutch', locale: 'nl_NL' },
  { id: 'hi', name: 'Hindi', locale: 'hi_IN' },
  { id: 'ja', name: 'Japanese', locale: 'ja_JP' },
  { id: 'ko', name: 'Korean', locale: 'ko_KR' },
  { id: 'zh', name: 'Chinese (Mandarin)', locale: 'zh_CN' },
  { id: 'id', name: 'Indonesian', locale: 'id_ID' },
];

// Plans. Ids stay stable for existing subscriptions; names and limits are the
// ad product's. `adsets` = ad sets a month (each makes every format), `brands` = brand kits.
export const PLANS = [
  { id: 'free', name: 'Tester', price: 5.99, adsets: 2, brands: 1, features: ['2 ad sets / month', '1 brand', 'Video + image ads in every format', 'Client share links'] },
  { id: 'starter', name: 'Starter', price: 19, adsets: 6, brands: 1, features: ['6 ad sets / month', '1 brand', 'Video + image ads in every format', 'Voiceover', 'Client share links'] },
  { id: 'daily', name: 'Growth', price: 39, adsets: 15, brands: 3, popular: true, features: ['15 ad sets / month', '3 brands', 'Every format, 6s to 30s', 'Voiceover', 'Client share links'] },
  { id: 'pro', name: 'Agency', price: 69, adsets: 40, brands: 10, features: ['40 ad sets / month', '10 brands', 'Every format, 6s to 30s', 'Voiceover', 'Client share links', 'Priority rendering'] },
];

const byId = (list) => Object.fromEntries(list.map((x) => [x.id, x]));
export const VOICE = byId(VOICES);
export const PLAN = byId(PLANS);
export const LANGUAGE = byId(LANGUAGES);
export const MUSIC_TRACK = byId(MUSIC);

export function catalog() {
  return {
    voices: VOICES.map(({ id, name, gender, description }) => ({ id, name, gender, description })),
    music: MUSIC,
    musicMoods: MUSIC_MOODS.map(({ id, name }) => ({ id, name })),
    languages: LANGUAGES.map(({ id, name }) => ({ id, name })),
    plans: PLANS,
    formats: FORMAT_IDS.map((id) => ({ id, name: FORMATS[id].name, width: FORMATS[id].w, height: FORMATS[id].h, platforms: FORMATS[id].platforms })),
    lengths: LENGTHS,
    styles: STYLES.map(({ id, name, description }) => ({ id, name, description })),
    fonts: BRAND_FONTS.map(({ id, name, description }) => ({ id, name, description })),
  };
}
