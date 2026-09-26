// Everything a user can pick when creating a series. Shared with the web app
// via GET /api/catalog so the two never drift.

export const NICHES = [
  {
    id: 'scary', name: 'Scary Stories', emoji: '👻',
    tagline: 'Original horror that keeps viewers up at night',
    brief: 'Original, suspenseful short horror stories told in first or second person, with a chilling twist at the end. Unsettling, never gory.',
    hook: 'I was alone in the house. So who kept whispering my name?',
    motifs: ['forest', 'city', 'ruins'], art: 'dark-fantasy', voice: 'onyx', music: 'dark-ambient',
    colors: ['#1e1b4b', '#7f1d1d'],
  },
  {
    id: 'history', name: 'Untold History', emoji: '🏛️',
    tagline: 'Wild true stories your teacher skipped',
    brief: 'Surprising, little-known but TRUE historical events, told as a gripping story with accurate names, dates and places.',
    hook: 'In 1932, Australia declared war on birds. And lost.',
    motifs: ['ruins', 'desert', 'city'], art: 'oil-painting', voice: 'fable', music: 'epic-pulse',
    colors: ['#78350f', '#1c1917'],
  },
  {
    id: 'mythology', name: 'Myths & Legends', emoji: '⚡',
    tagline: 'Gods, monsters and heroes from every culture',
    brief: 'Myths and legends from world cultures (Greek, Norse, Egyptian, Japanese, etc.), retold dramatically and faithfully to the source myth.',
    hook: 'Zeus gave her a jar and one rule: never open it.',
    motifs: ['mountains', 'ruins', 'ocean'], art: 'cinematic', voice: 'onyx', music: 'epic-pulse',
    colors: ['#1e3a8a', '#a16207'],
  },
  {
    id: 'fun-facts', name: 'Mind-Blowing Facts', emoji: '🤯',
    tagline: 'Fast, true facts people share instantly',
    brief: 'A rapid-fire list of surprising but TRUE facts around a single theme, each one punchy and verifiable.',
    hook: 'Oxford University is older than the Aztec Empire.',
    motifs: ['space', 'ocean', 'mountains', 'city'], art: '3d-cartoon', voice: 'coral', music: 'bright-pluck',
    colors: ['#0e7490', '#7c3aed'],
  },
  {
    id: 'motivation', name: 'Stoic Motivation', emoji: '🗿',
    tagline: 'Timeless wisdom for the grind',
    brief: 'Motivational monologues grounded in Stoic philosophy and real quotes (Marcus Aurelius, Seneca, Epictetus). Direct, second person, no clichés.',
    hook: 'Marcus Aurelius ruled an empire. Every morning he wrote himself the same warning.',
    motifs: ['mountains', 'desert', 'ocean'], art: 'cinematic', voice: 'echo', music: 'calm-pad',
    colors: ['#27272a', '#a8a29e'],
  },
  {
    id: 'heists', name: 'Legendary Heists', emoji: '💎',
    tagline: 'The boldest robberies ever pulled off',
    brief: 'TRUE stories of famous heists and cons: the plan, the execution, and how it unravelled. Accurate names, places and amounts.',
    hook: 'They beat ten layers of security. A half-eaten sandwich beat them.',
    motifs: ['city'], art: 'neon', voice: 'ash', music: 'epic-pulse',
    colors: ['#0f172a', '#059669'],
  },
  {
    id: 'space', name: 'Space & Cosmos', emoji: '🪐',
    tagline: 'The universe is stranger than fiction',
    brief: 'Awe-inspiring, scientifically accurate stories and facts about space, planets, stars and black holes.',
    hook: 'A teaspoon of this star would weigh a billion tons.',
    motifs: ['space'], art: 'cinematic', voice: 'sage', music: 'calm-pad',
    colors: ['#020617', '#4338ca'],
  },
  {
    id: 'bible', name: 'Bible Stories', emoji: '📜',
    tagline: 'Scripture brought to life, faithfully',
    brief: 'Stories from the Bible retold vividly and respectfully, faithful to the text, ending with the lesson or verse reference.',
    hook: 'He was a shepherd boy with five stones. The giant was nine feet tall.',
    motifs: ['desert', 'mountains'], art: 'oil-painting', voice: 'fable', music: 'calm-pad',
    colors: ['#92400e', '#fbbf24'],
  },
  {
    id: 'kindness', name: 'Acts of Kindness', emoji: '💛',
    tagline: 'Wholesome stories that restore faith in people',
    brief: 'Heartwarming original short stories about small acts of kindness with an emotional payoff at the end.',
    hook: 'Every morning, the old man paid for a stranger\'s coffee. Then one day he didn\'t show up.',
    motifs: ['city', 'ocean', 'mountains'], art: 'watercolor', voice: 'shimmer', music: 'calm-pad',
    colors: ['#be185d', '#f59e0b'],
  },
  {
    id: 'anime', name: 'Anime Stories', emoji: '🌸',
    tagline: 'Original anime-style tales with a twist',
    brief: 'Original short stories in the style of an anime: underdog heroes, rivals, hidden powers, emotional reveals.',
    hook: 'Everyone at the academy had a power. Except me. Or so they thought.',
    motifs: ['mountains', 'city', 'ocean'], art: 'anime', voice: 'nova', music: 'bright-pluck',
    colors: ['#db2777', '#6366f1'],
  },
  {
    id: 'drama', name: 'School Drama', emoji: '🍿',
    tagline: 'Juicy, bingeable storytime drama',
    brief: 'Original first-person "storytime" drama about school, friends and rivals, with a satisfying twist or comeback at the end. Clean language.',
    hook: 'My best friend stole my project. She forgot I record everything.',
    motifs: ['city'], art: '3d-cartoon', voice: 'coral', music: 'bright-pluck',
    colors: ['#9333ea', '#f43f5e'],
  },
];

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

// `palette` drives the procedural (no-API-key) art renderer; `prompt` is appended
// to image-model prompts.
export const ART_STYLES = [
  { id: 'cinematic', name: 'Cinematic', prompt: 'cinematic film still, dramatic lighting, anamorphic lens, photorealistic, highly detailed', palette: { sky: ['#0b1026', '#2b3a67', '#e2a26b'], land: '#0a0f1f', accent: '#ffd29a' } },
  { id: 'dark-fantasy', name: 'Dark Fantasy', prompt: 'dark fantasy digital painting, moody, ominous atmosphere, volumetric fog, muted palette', palette: { sky: ['#050507', '#1a1030', '#4a2340'], land: '#050308', accent: '#b8c4ff' } },
  { id: 'anime', name: 'Anime', prompt: 'anime illustration, vibrant colors, detailed painted background, cel shading, studio quality', palette: { sky: ['#5b8cff', '#a78bfa', '#ffc4e1'], land: '#2a2f6b', accent: '#fff4b3' } },
  { id: '3d-cartoon', name: '3D Cartoon', prompt: '3D animated film style, soft global illumination, expressive characters, colorful, playful', palette: { sky: ['#38bdf8', '#7dd3fc', '#fde68a'], land: '#15803d', accent: '#ffffff' } },
  { id: 'oil-painting', name: 'Oil Painting', prompt: 'classical oil painting, rich textured brush strokes, chiaroscuro lighting, museum quality', palette: { sky: ['#2a1a0e', '#8b5a2b', '#e9c46a'], land: '#1f140b', accent: '#fff1c1' } },
  { id: 'watercolor', name: 'Watercolor', prompt: 'soft watercolor painting, delicate washes, visible paper texture, gentle light', palette: { sky: ['#fde2e4', '#fad2e1', '#bee1e6'], land: '#8fb9a8', accent: '#ffffff' } },
  { id: 'comic', name: 'Comic Book', prompt: 'comic book art, bold ink outlines, halftone shading, dynamic composition, saturated colors', palette: { sky: ['#1d4ed8', '#f59e0b', '#fde047'], land: '#111827', accent: '#ef4444' } },
  { id: 'neon', name: 'Neon Noir', prompt: 'neon-lit night scene, rain-slick streets, synthwave palette, cinematic noir', palette: { sky: ['#0b0221', '#3b0a57', '#ff2e88'], land: '#07010f', accent: '#22d3ee' } },
  { id: 'pixel', name: 'Pixel Art', prompt: 'detailed 16-bit pixel art, retro video game aesthetic, limited palette', palette: { sky: ['#1b1f3b', '#53354a', '#ff8c61'], land: '#0f1020', accent: '#fff275' } },
  { id: 'vintage', name: 'Vintage Film', prompt: 'vintage 1970s photograph, film grain, faded warm colors, light leaks', palette: { sky: ['#3d2c1e', '#a1785c', '#e8d5b0'], land: '#2b2118', accent: '#fff3d6' } },
];

export const MOTION = [
  { id: 'hook', name: 'AI video hook', description: 'The opening scene is a real AI video clip to stop the scroll; the rest are animated images' },
  { id: 'video', name: 'AI video, every scene', description: 'Every scene becomes a real AI-generated video clip' },
  { id: 'still', name: 'Animated images', description: 'Cinematic pan & zoom over still images' },
];

export const CAPTION_STYLES = [
  { id: 'bold', name: 'Bold Pop', description: 'Chunky uppercase, active word in yellow' },
  { id: 'boxed', name: 'Highlight Box', description: 'Active word gets a colour block' },
  { id: 'neon', name: 'Neon Glow', description: 'Glowing active word' },
  { id: 'minimal', name: 'Minimal', description: 'Clean sentence-case subtitles' },
  { id: 'none', name: 'No captions', description: 'Voice and visuals only' },
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

// Target narration length. ~2.5 spoken words per second.
export const DURATIONS = [
  { id: 30, name: '30 sec', words: 75, scenes: 6 },
  { id: 60, name: '60 sec', words: 150, scenes: 10 },
  { id: 90, name: '90 sec', words: 220, scenes: 14 },
];

export const PLANS = [
  { id: 'free', name: 'Free', price: 0, videosPerMonth: 3, series: 1, watermark: true, features: ['3 videos / month', '1 series', 'All niches & styles', 'Nrrtv watermark'] },
  { id: 'starter', name: 'Starter', price: 19, videosPerMonth: 12, series: 1, watermark: false, features: ['3 videos / week', '1 series', 'Auto-post to all platforms', 'No watermark'] },
  { id: 'daily', name: 'Daily', price: 39, videosPerMonth: 31, series: 1, watermark: false, popular: true, features: ['1 video every day', '1 series', 'Auto-post to all platforms', 'Premium voices', 'No watermark'] },
  { id: 'pro', name: 'Pro', price: 69, videosPerMonth: 93, series: 3, watermark: false, features: ['3 videos every day', '3 series', 'Auto-post to all platforms', 'Premium voices', 'Priority rendering'] },
];

export const PLATFORMS = [
  { id: 'tiktok', name: 'TikTok' },
  { id: 'youtube', name: 'YouTube Shorts' },
  { id: 'instagram', name: 'Instagram Reels' },
];

const byId = (list) => Object.fromEntries(list.map((x) => [x.id, x]));
export const NICHE = byId(NICHES);
export const VOICE = byId(VOICES);
export const ART = byId(ART_STYLES);
export const CAPTION = byId(CAPTION_STYLES);
export const PLAN = byId(PLANS);
export const LANGUAGE = byId(LANGUAGES);
export const DURATION = byId(DURATIONS);
export const MUSIC_TRACK = byId(MUSIC);
export const MOTION_TYPE = byId(MOTION);

export function catalog() {
  return {
    niches: NICHES.map(({ motifs, ...n }) => n),
    voices: VOICES.map(({ id, name, gender, description }) => ({ id, name, gender, description })),
    artStyles: ART_STYLES.map(({ id, name, palette }) => ({ id, name, colors: palette.sky })),
    captionStyles: CAPTION_STYLES,
    motion: MOTION,
    music: MUSIC,
    languages: LANGUAGES.map(({ id, name }) => ({ id, name })),
    durations: DURATIONS.map(({ id, name }) => ({ id, name })),
    plans: PLANS,
    platforms: PLATFORMS,
  };
}
