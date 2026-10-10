// The creative: Claude writes the ad copy and storyboards each video length
// from the brand, the client's brief and the assets (choosing which shot goes
// where). Without an API key, a plain template is used instead.
import Anthropic from '@anthropic-ai/sdk';
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod';
import { z } from 'zod';
import { config } from '../config.js';
import { parseJson } from '../db.js';
import { LANGUAGE } from '../catalog.js';
import { plainDashes } from '../text.js';

// Scenes per video length, before the logo/CTA end card the renderer adds.
export const SCENES_FOR = { 6: 2, 15: 4, 30: 7 };

const Scene = z.object({
  role: z.enum(['hook', 'benefit', 'feature', 'proof', 'offer']),
  headline: z.string().describe('On-screen headline, at most 6 words'),
  subline: z.string().describe('Optional supporting line, at most 10 words; empty string for none'),
  assetId: z.string().describe('ID of the asset shown in this scene, from the asset list'),
  voiceover: z.string().describe('What the voiceover says during this scene; empty string when voiceover is off'),
});

// AI-directed scenes: each video scene is filmed by AI as one short shot.
const Shot = z.object({
  frame: z.string().describe("The shot's opening image, set up like a photographer would: subject, setting, composition and lighting. The product appears exactly as in its reference photo. Empty only for a scene that shows its photo or clip as it is."),
  action: z.string().describe('What happens during the shot (about 4 seconds): one clear movement or event, and the camera move. Empty only for a scene that shows its photo or clip as it is.'),
});
const DirectedScene = Scene.extend({
  assetId: z.string().describe('ID of the brand photo the product in this shot must match (its reference), from the asset list'),
  shot: Shot,
});

export const CopySchema = z.object({
  concept: z.string().describe('The creative idea in one sentence'),
  cta: z.string().describe('Call-to-action button text, 1 to 3 words (e.g. "Shop now")'),
  badge: z.string().describe('Short offer badge such as "20% OFF" or "NEW"; empty string if the brief has no offer or launch'),
  music: z.string().describe('Brief for the instrumental soundtrack, under 35 words: genre, mood, tempo in BPM and lead instruments, suited to the brand and audience. No artist or song names.'),
  videos: z.array(z.object({
    length: z.number().describe('Video length in seconds'),
    scenes: z.array(Scene),
  })),
  statics: z.array(z.object({
    headline: z.string().describe('Headline, at most 7 words'),
    subline: z.string().describe('Supporting line, at most 14 words'),
    assetId: z.string(),
  })).describe('Static image ad variants'),
  captions: z.object({
    primaryText: z.string().describe('Meta (Facebook/Instagram) primary text: 1 to 3 short sentences'),
    headline: z.string().describe('Meta ad headline, at most 40 characters'),
    description: z.string().describe('Meta link description, at most 30 characters'),
    tiktok: z.string().describe('TikTok caption, at most 150 characters, may include 1 or 2 emojis'),
    youtubeTitle: z.string().describe('YouTube title, at most 70 characters'),
    linkedin: z.string().describe('LinkedIn post intro, 1 to 2 professional sentences'),
    hashtags: z.array(z.string()).describe('4 to 6 relevant hashtags without #'),
  }),
});

/** The copy schema; with AI-directed scenes every video scene also has a shot to film. */
export const copySchema = (directed) => (directed
  ? CopySchema.extend({ videos: z.array(z.object({ length: z.number().describe('Video length in seconds'), scenes: z.array(DirectedScene) })) })
  : CopySchema);

// How to direct AI-filmed scenes (used by the copywriter and the change-request editor).
export const DIRECTING_RULES = `AI-directed scenes: every video scene is filmed by AI as one short shot (about 4 seconds), so direct each one:
- Name the subject by what its reference photo actually shows (from the asset list), e.g. "the dark blue circuit-pattern padlock" or "the kraft-label cold brew bottle", never just "the product" or the brand name: the image and video models only know what you describe.
- frame: the opening image (subject, setting, composition, lighting). It is built from the brand photo given as the scene's assetId, so the subject looks exactly like that photo; put it in a new setting, angle or situation.
- action: one clear, physical thing that visibly happens to or with the subject in about 4 seconds, plus the camera move: hands turning, opening, pouring, unboxing or using it; something revealed, assembled, transformed or set in motion. A light sweep, a glow or a camera move on its own is not an action.
- When the brand sells software or a service, its photo is a visual metaphor: make the metaphor act (the padlock is turned until it clicks open and glowing code streams out; the vault door swings shut on the servers).
- Be bold and cinematic, like a top agency's commercial, but physically believable and photorealistic. The first scene must grab attention within a second. Vary the shots (a detail close-up, hands or a person using it, a wider scene, a hero shot) and end on a clean hero shot of the subject.
- Nothing readable in the shot apart from the subject's own label or logo: no captions, signs or screens with text. The headline is laid on top, so keep the subject central with calm space above and below.
- People are described generically ("a woman in her thirties"), never a real or famous person.`;

// Shared with the change-request editor (revise.js), so revisions follow the same rules.
export const COPY_RULES = `Copy rules:
- Lead with the customer's benefit, concretely. Short, confident, specific. Plain words a real person would say.
- Avoid ad cliches and hype words: elevate, unleash, unlock, revolutionise, game-changer, next level, seamless, "look no further", "say goodbye to".
- Only claim what the brief supports. Never invent statistics, reviews, awards, prices, discounts or guarantees. Use the offer exactly as the client wrote it.
- On-screen text is read in a second: headlines of 2 to 6 words, sublines optional. No emojis, no hashtags and no exclamation marks on screen.
- Never use em dashes or en dashes; use commas, full stops or plain hyphens.

Storyboard rules:
- The first scene is the hook: the strongest visual (prefer video footage when there is good footage) with a line that stops the scroll.
- Each scene uses one asset from the list, chosen to match its line (product shots for features and the offer, lifestyle or people shots for benefits). Prefer high-quality assets. Avoid showing the same asset in consecutive scenes when there are others; an AI motion clip and the photo it was animated from count as the same shot.
- The renderer adds the final logo and call-to-action card itself, so don't write a closing "CTA" scene.`;

const SYSTEM = `You are the creative director and senior copywriter of a high-end advertising studio. You turn a client's brief and their own photos and footage into scroll-stopping social media ads that look and read like a professional agency made them.

${COPY_RULES}`;

let client;
export const claude = () => (client ??= new Anthropic());

/** Request params for the configured model (with server-side fallback on Opus/Fable 5). */
export function modelParams(params) {
  const out = { model: config.anthropic.model, ...params };
  if (/^claude-(opus|fable)-5/.test(config.anthropic.model)) {
    out.betas = ['server-side-fallback-2026-07-01'];
    out.fallbacks = 'default';
  }
  return out;
}

export const assetLine = (a) => {
  const an = parseJson(a.analysis, null);
  const shape = a.width && a.height ? (a.width > a.height * 1.1 ? 'landscape' : a.height > a.width * 1.1 ? 'portrait' : 'square') : '';
  return `- ${a.id}: ${a.kind}${a.kind === 'video' ? ` (${Math.round(a.duration)}s)` : ''}${a.parent_id ? `, AI motion clip animated from photo ${a.parent_id}` : ''}${shape ? `, ${shape}` : ''}${a.has_alpha ? ', transparent cut-out' : ''}`
    + `${an ? `, ${an.category}, quality ${an.quality}/5: ${an.description}` : `: ${a.original_name}`}`;
};

export async function writeCopy(input) {
  if (!config.anthropic.enabled) return templateCopy(input);
  try {
    return await claudeCopy(input);
  } catch (err) {
    // A refusal is about the brief, so say so; anything else (outage, bad key)
    // shouldn't stop the ads: use plain copy from the brief and flag it.
    if (err.refusal) throw err;
    console.error('[ads] copywriter unavailable, using the brief:', err.message);
    return { ...templateCopy(input), fallback: true };
  }
}

async function claudeCopy({ brand, brief, assets, lengths, statics, voiceover, directed, language = 'en' }) {
  const lang = LANGUAGE[language] || LANGUAGE.en;
  const prompt = `Brand: ${brand.name}${brand.website ? ` (${brand.website})` : ''}
${brand.about ? `About the brand: ${brand.about}\n` : ''}${brand.tone ? `Brand voice: ${brand.tone}\n` : ''}
The client's brief:
- Product or service: ${brief.product}
- Description: ${brief.description}
${brief.offer ? `- Offer: ${brief.offer}\n` : ''}${brief.audience ? `- Audience: ${brief.audience}\n` : ''}${brief.cta ? `- Preferred call to action: ${brief.cta}\n` : ''}${brief.url ? `- Link: ${brief.url}\n` : ''}
Assets you can use (IDs):
${assets.map(assetLine).join('\n')}

Write:
${lengths.map((l) => `- A ${l}-second video with exactly ${SCENES_FOR[l]} scenes.`).join('\n')}
- ${statics} static image ad variant${statics === 1 ? '' : 's'}, each a different angle.
- Captions for each platform.
${voiceover ? '- A voiceover line for every scene: natural and conversational, about 2.5 words per second of the scene so it fits (a 15-second video has about 30 words in total).' : '- Voiceover is off: leave every voiceover field empty.'}
${directed ? '- For every video scene, a shot to film (frame and action), with its assetId set to the brand photo the product must match. Think of the most striking, scroll-stopping way to show this product in action.\n' : ''}Language for all copy: ${lang.name}.`;

  const response = await claude().beta.messages.parse(modelParams({
    max_tokens: directed ? 12000 : 8000,
    system: directed ? `${SYSTEM}

${DIRECTING_RULES}` : SYSTEM,
    messages: [{ role: 'user', content: prompt }],
    output_config: { format: betaZodOutputFormat(copySchema(directed)) },
  }));
  if (response.stop_reason === 'refusal') throw Object.assign(new Error("The copywriter couldn't write ads for this brief. Try rewording the description."), { refusal: true });
  const copy = response.parsed_output;
  if (!copy) throw new Error('The copywriter returned nothing. Please try again.');
  return tidy(copy, { assets, lengths, voiceover });
}

/** A scene's shot to film, or null when it's empty (the scene shows its photo or clip as it is). */
export function shotOf(shot, clean = (s) => String(s || '').trim()) {
  const frame = clean(shot?.frame).slice(0, 600);
  const action = clean(shot?.action).slice(0, 400);
  if (!frame && !action) return null;
  return { frame: frame || 'The product exactly as in the reference photo, in the same setting.', action: action || 'The camera slowly pushes in as the light shifts.' };
}

// Make the copy safe to render: valid asset IDs, the requested lengths, plain dashes.
export function tidy(copy, { assets, lengths, voiceover }) {
  const ids = new Set(assets.map((a) => a.id));
  const fallbackAsset = (i) => assets[i % assets.length]?.id;
  const clean = (s) => plainDashes(String(s || '')).trim();
  const scene = (sc, i) => ({
    role: sc.role,
    headline: clean(sc.headline),
    subline: clean(sc.subline),
    assetId: ids.has(sc.assetId) ? sc.assetId : fallbackAsset(i),
    voiceover: voiceover ? clean(sc.voiceover) : '',
    ...(shotOf(sc.shot, clean) ? { shot: shotOf(sc.shot, clean) } : {}),
  });
  const videos = lengths.map((length) => {
    const found = copy.videos.find((v) => Number(v.length) === length) || copy.videos[0];
    const scenes = (found?.scenes || []).slice(0, SCENES_FOR[length]).map(scene);
    return { length, scenes };
  }).filter((v) => v.scenes.length);
  return {
    concept: clean(copy.concept),
    cta: clean(copy.cta).slice(0, 24) || 'Learn more',
    badge: clean(copy.badge).slice(0, 14),
    music: clean(copy.music).replace(/["]/g, '').slice(0, 300),
    videos,
    statics: copy.statics.map((s, i) => ({ headline: clean(s.headline), subline: clean(s.subline), assetId: ids.has(s.assetId) ? s.assetId : fallbackAsset(i) })),
    captions: {
      ...Object.fromEntries(Object.entries(copy.captions).filter(([k]) => k !== 'hashtags').map(([k, v]) => [k, clean(v)])),
      hashtags: (copy.captions.hashtags || []).map((h) => String(h).replace(/^#/, '').replace(/\s+/g, '')).filter(Boolean).slice(0, 6),
    },
    source: 'claude',
  };
}

// Without Claude: simple shots a client can rewrite in the storyboard.
function templateShot(brief, i, count) {
  const product = brief.product || 'The product';
  if (i === count - 1) return { frame: `${product}, exactly as in the reference photo, as a clean hero shot on a simple surface with soft studio light.`, action: 'A slow, confident push-in on the product as light glides across it.' };
  if (i === 0) return { frame: `A striking close-up of ${product}, exactly as in the reference photo, in a setting that suits it.`, action: 'The camera sweeps in as the product catches the light, already moving from the first frame.' };
  return { frame: `A person's hands using ${product}, exactly as in the reference photo, in a real, everyday setting.`, action: 'The hands use the product naturally while the camera drifts closer.' };
}

// "20% off your first order" -> "20% OFF"; "Free delivery this week" -> "FREE DELIVERY".
function offerBadge(offer) {
  if (!offer) return '';
  const pct = offer.match(/\d+\s*%\s*off/i) || offer.match(/[£$€]\s*\d+\s*off/i) || offer.match(/buy \d+ get \d+( free)?/i);
  if (pct) return pct[0].replace(/\s+/g, ' ').toUpperCase();
  return offer.split(/\s+/).slice(0, 2).join(' ').toUpperCase().slice(0, 14);
}

// No API key: simple, honest copy straight from the brief.
function templateCopy({ brand, brief, assets, lengths, statics, directed }) {
  const sentences = String(brief.description || '').split(/(?<=[.!?])\s+/).map((s) => s.trim()).filter(Boolean);
  const short = (s, words) => s.split(/\s+/).slice(0, words).join(' ').replace(/[.,;:!?]+$/, '');
  const lines = [brief.product, ...sentences.map((s) => short(s, 6)), brief.offer].filter(Boolean);
  const pick = (i) => assets[i % assets.length].id;
  return {
    concept: `${brief.product} by ${brand.name}`,
    cta: brief.cta || 'Learn more',
    badge: offerBadge(brief.offer),
    music: '',
    videos: lengths.map((length) => ({
      length,
      scenes: Array.from({ length: SCENES_FOR[length] }, (_, i) => ({
        role: i === 0 ? 'hook' : 'benefit', headline: lines[i % lines.length], subline: '', assetId: pick(i), voiceover: '',
        ...(directed ? { shot: templateShot(brief, i, SCENES_FOR[length]) } : {}),
      })),
    })),
    statics: Array.from({ length: statics }, (_, i) => ({ headline: lines[i % lines.length], subline: brief.offer || '', assetId: pick(i) })),
    captions: {
      primaryText: sentences.slice(0, 2).join(' ') || brief.product, headline: short(brief.product, 6), description: brief.offer || brand.name,
      tiktok: sentences[0] || brief.product, youtubeTitle: `${brief.product} | ${brand.name}`, linkedin: sentences.slice(0, 2).join(' ') || brief.product, hashtags: [],
    },
    source: 'template',
  };
}
