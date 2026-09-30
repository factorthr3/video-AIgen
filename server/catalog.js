// Everything a user can pick when creating a series. Shared with the web app
// via GET /api/catalog so the two never drift.

export const NICHE_CATEGORIES = ['Gaming', 'Animals', 'Stories', 'Kids', 'Facts & History', 'Mindset & Faith'];

// Gaming niches play footage from the gameplay library (`motion: 'gameplay'`)
// and are written about the chosen game (`gaming: true`).
export const NICHES = [
  {
    id: 'game-secrets', category: 'Gaming', name: 'Game Secrets', emoji: '🎮', gaming: true,
    tagline: 'Hidden details, easter eggs and wild facts about your game',
    brief: 'TRUE, surprising facts about the game: hidden details, easter eggs, developer secrets, cut content, speedrun tricks, record-breaking numbers. Name specific places, characters and missions. Only facts you are confident are real; never invent easter eggs.',
    hook: 'There is a room in this game that almost nobody has ever found.',
    motifs: ['city'], art: 'cinematic', voice: 'ash', music: 'epic-pulse', motion: 'gameplay',
    colors: ['#7c3aed', '#06b6d4'],
  },
  {
    id: 'game-lore', category: 'Gaming', name: 'Gaming Lore', emoji: '📜', gaming: true,
    tagline: 'The story behind the game, explained',
    brief: 'The lore of the game explained like a gripping story: character backstories, timelines, theories and the dark details players missed. Stay faithful to the real canon and label fan theories as theories.',
    hook: 'You played the whole game. You still missed what really happened.',
    motifs: ['city', 'ruins'], art: 'cinematic', voice: 'onyx', music: 'dark-ambient', motion: 'gameplay',
    colors: ['#1e1b4b', '#be123c'],
  },
  {
    id: 'game-hot-takes', category: 'Gaming', name: 'Gaming Hot Takes', emoji: '🔥', gaming: true,
    tagline: 'Funny, relatable gamer opinions and memes',
    brief: 'Short, funny, meme-style commentary about the game written the way gamers talk: bold hot takes, comparisons with other games, relatable player moments, playful roasts of game mechanics. Punchy and comment-bait, never mean-spirited.',
    hook: 'Nobody talks about how broken this mechanic really is.',
    motifs: ['city'], art: 'cinematic', voice: 'ash', music: 'bright-pluck', motion: 'gameplay',
    colors: ['#ea580c', '#db2777'],
  },
  {
    id: 'gamer-stories', category: 'Gaming', name: 'Gamer Storytime', emoji: '🕹️',
    tagline: 'Gripping first-person stories over gameplay',
    brief: 'Original first-person "storytime" stories (funny, dramatic or unbelievable moments from everyday life) with a twist at the end, told over gameplay footage. The story does not need to be about the game.',
    hook: 'My roommate thought I was asleep. I was not.',
    motifs: ['city'], art: 'cinematic', voice: 'coral', music: 'bright-pluck', motion: 'gameplay',
    colors: ['#16a34a', '#0ea5e9'],
  },
  {
    id: 'animal-tales', category: 'Animals', name: 'Animal Tales', emoji: '🦊',
    tagline: 'Animated animal heroes in funny, heartwarming stories',
    brief: 'Original short stories starring animal characters with big personalities (a brave fox cub, a clumsy bear, a penguin who wants to fly): a small adventure, a problem to overcome, and a warm or funny payoff. Family-friendly. Keep each character\'s look identical in every scene.',
    hook: 'The smallest penguin in the colony had one dream: to fly.',
    motifs: ['forest', 'mountains', 'ocean'], art: '3d-cartoon', voice: 'nova', music: 'bright-pluck',
    colors: ['#ea580c', '#16a34a'],
  },
  {
    id: 'animal-facts', category: 'Animals', name: 'Wild Animal Facts', emoji: '🐙',
    tagline: 'Jaw-dropping true facts about the animal kingdom',
    brief: 'Surprising, TRUE facts about real animals, either one creature per video or a themed list, told with wonder. Only well-established science.',
    hook: 'An octopus has three hearts, and one of them stops when it swims.',
    motifs: ['ocean', 'forest', 'desert'], art: 'wildlife', voice: 'coral', music: 'bright-pluck',
    colors: ['#0f766e', '#65a30d'],
  },
  {
    id: 'pet-pov', category: 'Animals', name: 'Funny Pet POV', emoji: '🐶',
    tagline: 'What your pets are really thinking',
    brief: 'Comedic first-person monologues from a pet (dog, cat, hamster, parrot) reacting to everyday human life. Punchy jokes, relatable situations, a funny twist at the end.',
    hook: 'Day 47. The human still thinks the red dot is random.',
    motifs: ['city'], art: '3d-cartoon', voice: 'ash', music: 'bright-pluck',
    colors: ['#f59e0b', '#ec4899'],
  },
  {
    id: 'bedtime', category: 'Kids', name: 'Bedtime Stories', emoji: '🌙',
    tagline: 'Gentle, cozy stories to wind down',
    brief: 'Calm, gentle bedtime stories for young children: soft imagery, kind characters (often animals), a small gentle adventure and a cozy, sleepy ending. No scary moments.',
    hook: 'High above the sleepy village, one little star could not fall asleep.',
    motifs: ['mountains', 'forest'], art: 'storybook', voice: 'shimmer', music: 'calm-pad',
    colors: ['#1e3a8a', '#a78bfa'],
  },
  {
    id: 'fables', category: 'Kids', name: 'Fables & Fairy Tales', emoji: '🐢',
    tagline: 'Classic fables, beautifully retold',
    brief: 'Classic fables and fairy tales from Aesop, the Brothers Grimm and world folklore, retold vividly and faithfully, ending with the moral in one line.',
    hook: 'The hare laughed at the tortoise. He should not have.',
    motifs: ['forest', 'mountains'], art: 'papercraft', voice: 'fable', music: 'calm-pad',
    colors: ['#65a30d', '#b45309'],
  },
  {
    id: 'dinosaurs', category: 'Facts & History', name: 'Dinosaurs', emoji: '🦖',
    tagline: 'The giants that ruled the Earth',
    brief: 'Scientifically accurate stories and facts about dinosaurs and prehistoric life: how they lived, hunted and vanished. Accurate species, sizes and time periods only.',
    hook: 'For 165 million years, these giants ruled the Earth. Then the sky caught fire.',
    motifs: ['desert', 'forest', 'mountains'], art: 'cinematic', voice: 'onyx', music: 'epic-pulse',
    colors: ['#365314', '#c2410c'],
  },
  {
    id: 'scary', category: 'Stories', name: 'Scary Stories', emoji: '👻',
    tagline: 'Original horror that keeps viewers up at night',
    brief: 'Original, suspenseful short horror stories told in first or second person, with a chilling twist at the end. Unsettling, never gory.',
    hook: 'I was alone in the house. So who kept whispering my name?',
    motifs: ['forest', 'city', 'ruins'], art: 'dark-fantasy', voice: 'onyx', music: 'dark-ambient',
    colors: ['#1e1b4b', '#7f1d1d'],
  },
  {
    id: 'history', category: 'Facts & History', name: 'Untold History', emoji: '🏛️',
    tagline: 'Wild true stories your teacher skipped',
    brief: 'Surprising, little-known but TRUE historical events, told as a gripping story with accurate names, dates and places.',
    hook: 'In 1932, Australia declared war on birds. And lost.',
    motifs: ['ruins', 'desert', 'city'], art: 'oil-painting', voice: 'fable', music: 'epic-pulse',
    colors: ['#78350f', '#1c1917'],
  },
  {
    id: 'mythology', category: 'Stories', name: 'Myths & Legends', emoji: '⚡',
    tagline: 'Gods, monsters and heroes from every culture',
    brief: 'Myths and legends from world cultures (Greek, Norse, Egyptian, Japanese, etc.), retold dramatically and faithfully to the source myth.',
    hook: 'Zeus gave her a jar and one rule: never open it.',
    motifs: ['mountains', 'ruins', 'ocean'], art: 'cinematic', voice: 'onyx', music: 'epic-pulse',
    colors: ['#1e3a8a', '#a16207'],
  },
  {
    id: 'fun-facts', category: 'Facts & History', name: 'Mind-Blowing Facts', emoji: '🤯',
    tagline: 'Fast, true facts people share instantly',
    brief: 'A rapid-fire list of surprising but TRUE facts around a single theme, each one punchy and verifiable.',
    hook: 'Oxford University is older than the Aztec Empire.',
    motifs: ['space', 'ocean', 'mountains', 'city'], art: '3d-cartoon', voice: 'coral', music: 'bright-pluck',
    colors: ['#0e7490', '#7c3aed'],
  },
  {
    id: 'motivation', category: 'Mindset & Faith', name: 'Stoic Motivation', emoji: '🗿',
    tagline: 'Timeless wisdom for the grind',
    brief: 'Motivational monologues grounded in Stoic philosophy and real quotes (Marcus Aurelius, Seneca, Epictetus). Direct, second person, no clichés.',
    hook: 'Marcus Aurelius ruled an empire. Every morning he wrote himself the same warning.',
    motifs: ['mountains', 'desert', 'ocean'], art: 'cinematic', voice: 'echo', music: 'calm-pad',
    colors: ['#27272a', '#a8a29e'],
  },
  {
    id: 'heists', category: 'Facts & History', name: 'Legendary Heists', emoji: '💎',
    tagline: 'The boldest robberies ever pulled off',
    brief: 'TRUE stories of famous heists and cons: the plan, the execution, and how it unravelled. Accurate names, places and amounts.',
    hook: 'They beat ten layers of security. A half-eaten sandwich beat them.',
    motifs: ['city'], art: 'neon', voice: 'ash', music: 'epic-pulse',
    colors: ['#0f172a', '#059669'],
  },
  {
    id: 'space', category: 'Facts & History', name: 'Space & Cosmos', emoji: '🪐',
    tagline: 'The universe is stranger than fiction',
    brief: 'Awe-inspiring, scientifically accurate stories and facts about space, planets, stars and black holes.',
    hook: 'A teaspoon of this star would weigh a billion tons.',
    motifs: ['space'], art: 'cinematic', voice: 'sage', music: 'calm-pad',
    colors: ['#020617', '#4338ca'],
  },
  {
    id: 'bible', category: 'Mindset & Faith', name: 'Bible Stories', emoji: '📜',
    tagline: 'Scripture brought to life, faithfully',
    brief: 'Stories from the Bible retold vividly and respectfully, faithful to the text, ending with the lesson or verse reference.',
    hook: 'He was a shepherd boy with five stones. The giant was nine feet tall.',
    motifs: ['desert', 'mountains'], art: 'oil-painting', voice: 'fable', music: 'calm-pad',
    colors: ['#92400e', '#fbbf24'],
  },
  {
    id: 'kindness', category: 'Stories', name: 'Acts of Kindness', emoji: '💛',
    tagline: 'Wholesome stories that restore faith in people',
    brief: 'Heartwarming original short stories about small acts of kindness with an emotional payoff at the end.',
    hook: 'Every morning, the old man paid for a stranger\'s coffee. Then one day he didn\'t show up.',
    motifs: ['city', 'ocean', 'mountains'], art: 'watercolor', voice: 'shimmer', music: 'calm-pad',
    colors: ['#be185d', '#f59e0b'],
  },
  {
    id: 'anime', category: 'Stories', name: 'Anime Stories', emoji: '🌸',
    tagline: 'Original anime-style tales with a twist',
    brief: 'Original short stories in the style of an anime: underdog heroes, rivals, hidden powers, emotional reveals.',
    hook: 'Everyone at the academy had a power. Except me. Or so they thought.',
    motifs: ['mountains', 'city', 'ocean'], art: 'anime', voice: 'nova', music: 'bright-pluck',
    colors: ['#db2777', '#6366f1'],
  },
  {
    id: 'drama', category: 'Stories', name: 'School Drama', emoji: '🍿',
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
// to image-model prompts. Grouped by category in the UI.
export const ART_CATEGORIES = ['Animation', 'Realistic', 'Illustrated'];

export const ART_STYLES = [
  // Animation
  { id: '3d-cartoon', category: 'Animation', name: '3D Animation', prompt: '3D animated feature film still, appealing stylized characters with big expressive eyes, soft global illumination, subsurface scattering, vibrant colors, cinematic depth of field', palette: { sky: ['#38bdf8', '#7dd3fc', '#fde68a'], land: '#15803d', accent: '#ffffff' } },
  { id: 'claymation', category: 'Animation', name: 'Claymation', prompt: 'claymation stop-motion scene, handmade plasticine characters with visible fingerprint texture, miniature practical set, soft studio lighting', palette: { sky: ['#fb923c', '#fdba74', '#fef3c7'], land: '#a16207', accent: '#fff7ed' } },
  { id: '2d-cartoon', category: 'Animation', name: '2D Cartoon', prompt: '2D animated cartoon frame, clean bold outlines, flat vibrant colors, expressive characters, TV animation style', palette: { sky: ['#60a5fa', '#93c5fd', '#fef08a'], land: '#22c55e', accent: '#ffffff' } },
  { id: 'anime', category: 'Animation', name: 'Anime', prompt: 'anime illustration, vibrant colors, detailed painted background, cel shading, studio quality', palette: { sky: ['#5b8cff', '#a78bfa', '#ffc4e1'], land: '#2a2f6b', accent: '#fff4b3' } },
  { id: 'felt', category: 'Animation', name: 'Felt Puppets', prompt: 'handmade felt and wool puppet characters, stop-motion miniature set, cozy knitted textures, warm soft lighting', palette: { sky: ['#fda4af', '#fecdd3', '#fef9c3'], land: '#84cc16', accent: '#fff1f2' } },
  { id: 'papercraft', category: 'Animation', name: 'Paper Cutout', prompt: 'layered paper cutout craft diorama, stop-motion papercraft characters, soft shadows between paper layers, textured paper', palette: { sky: ['#99f6e4', '#ccfbf1', '#fef3c7'], land: '#65a30d', accent: '#ffffff' } },
  { id: 'low-poly', category: 'Animation', name: 'Low Poly 3D', prompt: 'low-poly 3D render, faceted geometric shapes, soft pastel lighting, stylized game art', palette: { sky: ['#818cf8', '#c4b5fd', '#fbcfe8'], land: '#4d7c0f', accent: '#fef9c3' } },
  { id: 'kawaii', category: 'Animation', name: 'Kawaii Chibi', prompt: 'kawaii chibi illustration, cute round characters with tiny bodies and big heads, pastel colors, sparkles, soft shading', palette: { sky: ['#f9a8d4', '#fbcfe8', '#e9d5ff'], land: '#86efac', accent: '#ffffff' } },
  { id: 'pixel', category: 'Animation', name: 'Pixel Art', prompt: 'detailed 16-bit pixel art, retro video game aesthetic, limited palette', palette: { sky: ['#1b1f3b', '#53354a', '#ff8c61'], land: '#0f1020', accent: '#fff275' } },
  // Realistic
  { id: 'cinematic', category: 'Realistic', name: 'Cinematic', prompt: 'cinematic film still, dramatic lighting, anamorphic lens, photorealistic, highly detailed', palette: { sky: ['#0b1026', '#2b3a67', '#e2a26b'], land: '#0a0f1f', accent: '#ffd29a' } },
  { id: 'wildlife', category: 'Realistic', name: 'Nature Documentary', prompt: 'award-winning wildlife documentary photograph, telephoto lens, natural light, ultra detailed fur, feathers and scales, shallow depth of field', palette: { sky: ['#0c4a6e', '#38bdf8', '#fde68a'], land: '#14532d', accent: '#fef3c7' } },
  { id: 'miniature', category: 'Realistic', name: 'Tiny World', prompt: 'miniature tilt-shift diorama photograph, tiny detailed figurines and props, shallow depth of field, toy-like scale', palette: { sky: ['#7dd3fc', '#bae6fd', '#fef9c3'], land: '#16a34a', accent: '#ffffff' } },
  { id: 'dark-fantasy', category: 'Realistic', name: 'Dark Fantasy', prompt: 'dark fantasy digital painting, moody, ominous atmosphere, volumetric fog, muted palette', palette: { sky: ['#050507', '#1a1030', '#4a2340'], land: '#050308', accent: '#b8c4ff' } },
  { id: 'vintage', category: 'Realistic', name: 'Vintage Film', prompt: 'vintage 1970s photograph, film grain, faded warm colors, light leaks', palette: { sky: ['#3d2c1e', '#a1785c', '#e8d5b0'], land: '#2b2118', accent: '#fff3d6' } },
  // Illustrated
  { id: 'storybook', category: 'Illustrated', name: 'Storybook', prompt: "children's picture book illustration, gouache and colored pencil, warm soft light, whimsical and gentle", palette: { sky: ['#c4b5fd', '#ddd6fe', '#fef3c7'], land: '#4d7c0f', accent: '#fffbeb' } },
  { id: 'watercolor', category: 'Illustrated', name: 'Watercolor', prompt: 'soft watercolor painting, delicate washes, visible paper texture, gentle light', palette: { sky: ['#fde2e4', '#fad2e1', '#bee1e6'], land: '#8fb9a8', accent: '#ffffff' } },
  { id: 'oil-painting', category: 'Illustrated', name: 'Oil Painting', prompt: 'classical oil painting, rich textured brush strokes, chiaroscuro lighting, museum quality', palette: { sky: ['#2a1a0e', '#8b5a2b', '#e9c46a'], land: '#1f140b', accent: '#fff1c1' } },
  { id: 'comic', category: 'Illustrated', name: 'Comic Book', prompt: 'comic book art, bold ink outlines, halftone shading, dynamic composition, saturated colors', palette: { sky: ['#1d4ed8', '#f59e0b', '#fde047'], land: '#111827', accent: '#ef4444' } },
  { id: 'neon', category: 'Illustrated', name: 'Neon Noir', prompt: 'neon-lit night scene, rain-slick streets, synthwave palette, cinematic noir', palette: { sky: ['#0b0221', '#3b0a57', '#ff2e88'], land: '#07010f', accent: '#22d3ee' } },
];

const STYLE_BLURBS = {
  '3d-cartoon': 'Animated-movie characters', claymation: 'Plasticine stop-motion', '2d-cartoon': 'Bold, flat TV cartoon',
  anime: 'Cel-shaded anime', felt: 'Knitted, cosy puppets', papercraft: 'Layered paper diorama', 'low-poly': 'Faceted game-style 3D',
  kawaii: 'Cute pastel chibi', pixel: 'Retro 16-bit', cinematic: 'Photoreal film still', wildlife: 'Real animals, documentary',
  miniature: 'Tilt-shift toy world', 'dark-fantasy': 'Moody, ominous', vintage: 'Faded 70s film', storybook: "Children's book art",
  watercolor: 'Soft painted washes', 'oil-painting': 'Classical brushwork', comic: 'Ink and halftone', neon: 'Synthwave night',
};

export const MOTION = [
  { id: 'gameplay', name: 'Gameplay footage', description: 'Narration and captions over real clips from the gameplay library' },
  { id: 'hook', name: 'AI video hook', description: 'The opening scene is a real AI video clip to stop the scroll; the rest are animated images' },
  { id: 'video', name: 'AI video, every scene', description: 'Every scene becomes a real AI-generated video clip' },
  { id: 'still', name: 'Animated images', description: 'Cinematic pan & zoom over still images' },
];

// How gameplay footage sits in the vertical frame.
export const GAME_LAYOUTS = [
  { id: 'framed', name: 'Framed', description: 'Gameplay in the middle, headline on top, captions below' },
  { id: 'full', name: 'Full screen', description: 'Gameplay cropped to fill the screen, headline and captions over it' },
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
  // Entry plan. The id stays 'free' so existing accounts need no migration.
  { id: 'free', name: 'Tester', price: 5.99, videosPerMonth: 3, series: 1, watermark: false, features: ['3 videos / month', '1 series', 'All niches & styles', 'No watermark'] },
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
export const GAME_LAYOUT = byId(GAME_LAYOUTS);

export function catalog() {
  return {
    nicheCategories: NICHE_CATEGORIES,
    niches: NICHES.map(({ motifs, ...n }) => n),
    voices: VOICES.map(({ id, name, gender, description }) => ({ id, name, gender, description })),
    artCategories: ART_CATEGORIES,
    artStyles: ART_STYLES.map(({ id, name, category, palette }) => ({ id, name, category, blurb: STYLE_BLURBS[id], colors: palette.sky })),
    captionStyles: CAPTION_STYLES,
    motion: MOTION,
    gameLayouts: GAME_LAYOUTS,
    music: MUSIC,
    languages: LANGUAGES.map(({ id, name }) => ({ id, name })),
    durations: DURATIONS.map(({ id, name }) => ({ id, name })),
    plans: PLANS,
    platforms: PLATFORMS,
  };
}
