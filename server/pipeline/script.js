// Stage 1: write the script. Claude produces a structured script (title,
// caption, hashtags, scene-by-scene narration + visual prompts). Without an
// API key we fall back to the hand-written library.
import Anthropic from '@anthropic-ai/sdk';
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod';
import { z } from 'zod';
import { config } from '../config.js';
import { NICHE, LANGUAGE, DURATION } from '../catalog.js';
import { libraryScript } from './library.js';

const ScriptSchema = z.object({
  title: z.string().describe('Scroll-stopping title, max 70 characters, in the target language'),
  description: z.string().describe('1-2 sentence post caption in the target language, no hashtags'),
  hashtags: z.array(z.string()).describe('5-8 relevant hashtags without the # symbol'),
  scenes: z.array(z.object({
    narration: z.string().describe('What the narrator says during this scene, in the target language'),
    visual: z.string().describe('English image-generation prompt describing exactly what is on screen'),
    motion: z.string().describe('English prompt for animating that image into a short video clip: what moves and how the camera moves'),
  })),
});

const SYSTEM = `You write scripts for faceless short-form videos (TikTok, Instagram Reels, YouTube Shorts) that are narrated by a voiceover over AI-generated images.

What makes these videos work:
- The first scene is the hook. It must create curiosity or tension within the first two seconds; never open with a greeting or "Did you know".
- Every scene earns the next one. Short, concrete, spoken-language sentences. No filler, no rhetorical padding.
- The ending pays off the hook: a twist, a reveal, a lesson, or a line that makes people rewatch or comment.
- Narration is written to be read aloud: no emojis, no stage directions, no hashtags, numbers written the way they are spoken when that helps.

Scene rules:
- Each scene is one or two sentences of narration (about 8-20 words) that will be on screen for roughly 3-6 seconds.
- Each visual prompt describes a single striking, concrete image in English: subject, setting, lighting, camera framing. If a character recurs, repeat the same physical description so images stay consistent. Never ask for text, captions, logos or watermarks in the image. Keep visuals non-graphic.
- Each motion prompt (English, one sentence) says how that image comes alive as a 3-10 second clip: the subject's action and the camera move (e.g. "The wave surges toward the camera as debris tumbles; slow push-in"). Keep motion physically plausible and continuous with the image, with no cuts and no new characters appearing.

Accuracy: when the niche is factual (history, science, true crime, religion, facts), only state things that are true and well established. Use real names, dates and figures only when you are confident they are correct; otherwise leave the detail out.`;

let client;
const getClient = () => (client ??= new Anthropic());

export async function writeScript({ niche, customTopic, language, duration, usedTitles = [] }) {
  if (!config.anthropic.enabled) {
    const script = libraryScript(niche, usedTitles);
    return { ...script, source: 'library' };
  }

  const n = NICHE[niche];
  const lang = LANGUAGE[language] || LANGUAGE.en;
  const target = DURATION[duration] || DURATION[60];
  const topic = customTopic?.trim()
    ? `Topic: ${customTopic.trim()}${n ? ` (niche: ${n.name})` : ''}`
    : `Niche: ${n.name}. ${n.brief}`;

  const avoid = usedTitles.length
    ? `\n\nThis channel already posted these videos, so pick a clearly different story or subject:\n${usedTitles.slice(-40).map((t) => `- ${t}`).join('\n')}`
    : '';

  const prompt = `${topic}

Write one complete video script.
- Language for title, description and narration: ${lang.name}. Visual prompts stay in English.
- Target length: about ${target.words} spoken words across ${target.scenes} scenes (roughly ${target.id} seconds).${avoid}`;

  const params = {
    model: config.anthropic.model,
    max_tokens: 16000,
    system: SYSTEM,
    messages: [{ role: 'user', content: prompt }],
    output_config: { format: betaZodOutputFormat(ScriptSchema) },
  };
  // Server-side refusal fallback is supported on the Opus 5 / Fable 5 families.
  if (/^claude-(opus|fable)-5/.test(config.anthropic.model)) {
    params.betas = ['server-side-fallback-2026-07-01'];
    params.fallbacks = 'default';
  }

  const response = await getClient().beta.messages.parse(params);
  if (response.stop_reason === 'refusal') {
    throw new Error(`Claude declined to write this script${response.stop_details?.explanation ? `: ${response.stop_details.explanation}` : '.'}`);
  }
  if (response.stop_reason === 'max_tokens') throw new Error('Script generation was cut off; try a shorter duration.');
  const script = response.parsed_output;
  if (!script?.scenes?.length) throw new Error('Claude returned an empty script.');

  script.hashtags = script.hashtags.map((h) => h.replace(/^#/, '').replace(/\s+/g, '')).filter(Boolean).slice(0, 8);
  script.scenes = script.scenes.filter((sc) => sc.narration?.trim());
  if (!script.scenes.length) throw new Error('Claude returned a script with no narration.');
  return { ...script, source: 'claude', model: response.model };
}
