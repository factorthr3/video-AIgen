// Change requests: the client says what to change in their own words ("punchier
// headlines", "open on the pouring clip", "add a square version") and Claude
// turns it into edits to the copy, storyboard and settings. Changes are a draft
// until the client presses Generate, which re-renders only the ads they touch.
// Each change can be undone.
import fs from 'node:fs';
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod';
import { z } from 'zod';
import { config } from '../config.js';
import { db, insert, update, newId, now, parseJson } from '../db.js';
import { VOICES, VOICE, MUSIC, MUSIC_TRACK, LANGUAGE } from '../catalog.js';
import { HttpError } from '../services.js';
import { plainDashes } from '../text.js';
import { STYLES, STYLE, FORMAT_IDS, LENGTHS, cleanEndCard, cleanElements } from './design.js';
import { MUSIC_MOODS, MUSIC_MOOD, soundtrackEnabled } from './soundtrack.js';
import { copySchema, COPY_RULES, DIRECTING_RULES, SCENES_FOR, assetLine, claude, modelParams, tidy } from './brief.js';
import { plannedAds, enqueueAdSet, adFile, adThumb, adSignature } from './jobs.js';
import { motionEnabled } from './motion.js';

export const REVISIONS_PER_SET = 30;
export const reviseEnabled = () => config.anthropic.enabled;

const SYSTEM = `You are the creative director of an advertising studio. A client has a finished set of social media ads (videos and image ads made from their own photos and footage) and asks for changes in their own words. Make the changes they ask for and keep everything else exactly as it is.

Your changes are saved as a draft. The client presses Generate when they're ready, and only then are the ads re-made, so never say the ads have been re-made: say what you changed. If the client says they're happy, that nothing needs changing, or asks you to generate or render, change nothing and tell them to press Generate.

What you can change:
- Words: on-screen headlines and sublines, the button text (cta), the offer badge, voiceover lines and the post captions.
- Storyboard: which photo or clip each video scene shows, and the order of scenes. Each video keeps its number of scenes (${Object.entries(SCENES_FOR).map(([l, n]) => `${n} for ${l}s`).join(', ')}).
- Movement, in any scene: every video scene can be filmed with AI from its photo. Give the scene a shot (frame: the opening image built around that photo's product; action: what happens) and it is filmed when the client presses Generate. So when the client asks for something to move, open, pour, be used, or for "animation", "motion" or "real footage", write shots for those scenes. Never ask them to upload video. A scene with an empty shot (frame and action both "") shows its photo or clip as it is; only add or change shots where the client asks for movement, or where they already exist.
- Image ads: their headline, subline and photo, and how many there are (0 to 3).
- Look: the style, plus every element in settings.elements, which overrides the style ("auto" keeps the style's choice):
  - intro: open on the logo screen (on by default); outro: close on the logo screen; button and link: the call to action and website on the closing screen.
  - cornerLogo: the logo in the corner while the video plays (off by default); badge: the offer badge (auto, on, off).
  - textPosition (auto, top, middle, bottom), textAlign (auto, left, centre), textSize (0.6 to 1.6, 1 = normal), uppercase (auto, on, off), textBlock: headlines on a coloured block (auto, on, off), font (auto, montserrat, inter, playfair, bebas).
  - buttonColor (buttons and badges) and highlightColor (text blocks and glows): "auto" or a hex colour.
  - transition between scenes (auto, dissolve, fade, slide, punch, cut), cameraMove: slow push-in on photos (true or false), shading: darkening behind text (auto, none, bottom, full, vignette).
- The logo screens (opening and closing): the logo size (1 = small, 2 = standard, 3 = as big as fits, edge to edge; "3x bigger" from the standard means 3) and their background ("auto" = the logo's own background colour, bled full screen, or a dark stage when the logo has none; "brand" = the brand colour; or any hex colour).
- Sound: the soundtrack (composed to fit, a stock track or none), its mood, the soundtrack brief in the copy, voiceover on or off, and the voice.
- Sizes: which formats and video lengths the set includes.

Everything in these ads can be changed. Never reply that something can't be done, isn't possible, isn't supported or is a fixed feature: find the closest way to do it with the copy and settings above, and do it. The only things you can't make are files the client supplies themselves (a new logo image, new product photos); for those, do everything else they asked and say in one short sentence where to add the file (the brand's page).

How to answer:
- Return the complete settings and copy. Copy every field you are not changing exactly as it is now, word for word.
- When the request is broad ("make it better", "more exciting"), make a clear improvement in that direction instead of asking questions.
- If a request is unclear, make your best reasonable interpretation and say what you did.
- Leave the soundtrack (music setting, mood and the soundtrack brief in the copy) exactly as it is unless the client asks to change the music.
- Use an offer, price or claim only when the client states it, in the brief or in their request.
- When voiceover is on, every scene needs a line of about 2.5 words per second of the scene.
- Reply in one or two short, plain sentences, like a helpful designer: what you changed, not how.

${COPY_RULES}`;

// How the soundtrack setting is described to Claude, and read back.
const musicChoice = (music) => (music === 'ai' ? 'composed' : String(music || '').startsWith('upload:') ? 'current' : music);
const musicChoices = () => ['current', 'none', ...MUSIC.filter((m) => m.id !== 'none').map((m) => m.id), ...(soundtrackEnabled() ? ['composed'] : [])];

function revisionSchema(directed) {
  return z.object({
    reply: z.string().describe('Your reply to the client: one or two short sentences saying what you changed'),
    changed: z.boolean().describe('True if you changed anything; false only if the client asked for no changes'),
    soundtrackChanged: z.boolean().describe('True only if the client asked to change the music or soundtrack'),
    settings: z.object({
      style: z.enum(STYLES.map((s) => s.id)),
      formats: z.array(z.enum(FORMAT_IDS)).describe('Ad sizes in the set'),
      lengths: z.array(z.number()).describe(`Video lengths in seconds, each one of ${LENGTHS.join(', ')}; empty for no videos`),
      statics: z.number().describe('Number of image ad variants, 0 to 3'),
      voiceover: z.boolean(),
      voice: z.enum(VOICES.map((v) => v.id)),
      music: z.enum(musicChoices()).describe('"composed" = an original track composed for each video, "none", a stock track ID, or "current" to keep the client\'s own uploaded track'),
      musicMood: z.enum(MUSIC_MOODS.map((m) => m.id)).describe('Mood of the composed soundtrack; "auto" follows the soundtrack brief in the copy'),
      endCard: z.object({
        logoSize: z.number().describe('Logo screens: logo size, 1 = small, 2 = standard, 3 = as big as fits (edge to edge)'),
        background: z.string().describe('Logo screens: background, "auto" (the logo\'s own background colour, full screen), "brand", or a hex colour like #0b1f3a'),
      }),
      elements: z.object({
        intro: z.boolean(), outro: z.boolean(), button: z.boolean(), link: z.boolean(), cornerLogo: z.boolean(),
        badge: z.enum(['auto', 'on', 'off']),
        textPosition: z.enum(['auto', 'top', 'middle', 'bottom']),
        textAlign: z.enum(['auto', 'left', 'centre']),
        textSize: z.number().describe('0.6 to 1.6; 1 = normal'),
        uppercase: z.enum(['auto', 'on', 'off']),
        textBlock: z.enum(['auto', 'on', 'off']),
        font: z.enum(['auto', 'montserrat', 'inter', 'playfair', 'bebas']),
        buttonColor: z.string().describe('"auto" or a hex colour'),
        highlightColor: z.string().describe('"auto" or a hex colour'),
        transition: z.enum(['auto', 'dissolve', 'fade', 'slide', 'punch', 'cut']),
        cameraMove: z.boolean(),
        shading: z.enum(['auto', 'none', 'bottom', 'full', 'vignette']),
      }),
    }),
    copy: copySchema(directed),
  });
}

const library = (brandId) => db.all("SELECT * FROM assets WHERE brand_id = ? AND status = 'ready' AND kind != 'logo' AND shot_key IS NULL ORDER BY created_at", brandId);

function buildPrompt({ brand, brief, options, copy, assets, history, request }) {
  const { concept, cta, badge, music, videos, statics, captions } = copy;
  const settings = {
    style: options.style, formats: options.formats, lengths: options.lengths, statics: options.statics,
    voiceover: options.voiceover, voice: options.voice, music: musicChoice(options.music), musicMood: options.musicMood || 'auto',
    endCard: options.endCard || { logoSize: 2, background: 'auto' },
    elements: cleanElements(options.elements),
  };
  return `Brand: ${brand.name}${brand.website ? ` (${brand.website})` : ''}
${brand.about ? `About the brand: ${brand.about}\n` : ''}${brand.tone ? `Brand voice: ${brand.tone}\n` : ''}
The brief the ads were made from:
- Product or service: ${brief.product}
- Description: ${brief.description}
${brief.offer ? `- Offer: ${brief.offer}\n` : ''}${brief.audience ? `- Audience: ${brief.audience}\n` : ''}${brief.url ? `- Link: ${brief.url}\n` : ''}Language for all copy: ${(LANGUAGE[options.language] || LANGUAGE.en).name}

Photos and clips in the brand library (IDs):
${assets.map(assetLine).join('\n')}

Styles: ${STYLES.map((s) => `${s.id} (${s.description})`).join('; ')}
Soundtrack moods: ${MUSIC_MOODS.map((m) => `${m.id}${m.prompt ? ` (${m.prompt})` : ' (follows the soundtrack brief in the copy)'}`).join('; ')}
Stock tracks: ${MUSIC.filter((m) => m.id !== 'none').map((m) => `${m.id} (${m.description})`).join('; ')}
Voices: ${VOICES.map((v) => `${v.id} (${v.gender}, ${v.description})`).join('; ')}

Current settings:
${JSON.stringify(settings, null, 1)}

Current copy:
${JSON.stringify({ concept, cta, badge, music, videos, statics, captions }, null, 1)}
${history.length ? `\nEarlier requests on these ads (oldest first):\n${history.map((h) => `- "${h.request}" -> ${h.reply}${h.undone ? ' (later undone)' : ''}`).join('\n')}\n` : ''}
The client's request:
"""${request}"""`;
}

/** Ask Claude for the revision; returns { reply, changed, copy?, options? }. */
async function askClaude({ adset, brand, request }) {
  const brief = parseJson(adset.brief, {});
  const options = parseJson(adset.options, {});
  const copy = parseJson(adset.copy, null);
  const assets = library(brand.id);
  const history = db.all('SELECT request, reply, undone FROM adset_revisions WHERE adset_id = ? ORDER BY created_at DESC LIMIT 6', adset.id).reverse();
  const response = await claude().beta.messages.parse(modelParams({
    max_tokens: 12000,
    system: `${SYSTEM}\n\n${DIRECTING_RULES}`,
    messages: [{ role: 'user', content: buildPrompt({ brand, brief, options, copy, assets, history, request }) }],
    output_config: { format: betaZodOutputFormat(revisionSchema(true)) },
  }));
  if (response.stop_reason === 'refusal') return { reply: "I wasn't able to apply that one as written. Could you describe the change another way?", changed: false };
  const out = response.parsed_output;
  if (!out) throw new Error('The editor returned nothing.');
  const reply = plainDashes(out.reply).trim().slice(0, 600) || 'Done.';
  if (!out.changed) return { reply, changed: false };

  // Settings, checked against what the app supports (anything odd keeps its current value).
  const s = out.settings;
  const formats = FORMAT_IDS.filter((f) => s.formats.includes(f));
  const next = {
    ...options,
    style: STYLE[s.style] ? s.style : options.style,
    formats: formats.length ? formats : options.formats,
    lengths: [...new Set(s.lengths.map(Number).filter((l) => LENGTHS.includes(l)))].sort((x, y) => x - y),
    statics: Math.max(0, Math.min(3, Math.round(Number(s.statics) || 0))),
    voiceover: Boolean(s.voiceover),
    voice: VOICE[s.voice] ? s.voice : options.voice,
    musicMood: MUSIC_MOOD[s.musicMood] ? s.musicMood : options.musicMood,
    music: s.music === 'current' ? options.music
      : s.music === 'composed' ? (soundtrackEnabled() ? 'ai' : options.music)
        : MUSIC_TRACK[s.music] ? s.music : options.music,
  };
  if (!next.lengths.length && !next.statics) Object.assign(next, { lengths: options.lengths, statics: options.statics });
  const closing = cleanEndCard(s.endCard);
  if (closing && JSON.stringify(closing) !== JSON.stringify(options.endCard || { logoSize: 2, background: 'auto' })) next.endCard = closing;
  const elements = cleanElements(s.elements, cleanElements(options.elements));
  if (JSON.stringify(elements) !== JSON.stringify(cleanElements(options.elements))) next.elements = elements;
  // The music only changes when the client asks for it.
  if (!out.soundtrackChanged) Object.assign(next, { music: options.music, musicMood: options.musicMood });

  const revised = tidy(out.copy, { assets, lengths: next.lengths, voiceover: next.voiceover });
  // Scenes with a shot are filmed with AI on Generate.
  next.aiScenes = motionEnabled() && revised.videos.some((v) => v.scenes.some((sc) => sc.shot));
  if (!out.soundtrackChanged) revised.music = copy.music;
  revised.statics = revised.statics.slice(0, next.statics);
  if (copy.musicNote) revised.musicNote = copy.musicNote;
  // Ad sets made from picked assets render only those, so add any newly used ones.
  if (next.assetIds?.length) {
    const used = [...revised.videos.flatMap((v) => v.scenes.map((sc) => sc.assetId)), ...revised.statics.map((x) => x.assetId)];
    next.assetIds = [...new Set([...next.assetIds, ...used])];
  }
  return { reply, changed: true, copy: revised, options: next };
}

// ---------- applying a change ----------
const adKey = (a) => `${a.kind}|${a.format}|${a.length ?? ''}|${a.variant}`;
const lastChange = (adsetId) => db.get('SELECT MAX(created_at) AS t FROM adset_revisions WHERE adset_id = ? AND changed = 1', adsetId)?.t;

// What a ready ad was rendered from. Ads made before signatures were kept count
// as current, unless a change was made after they were rendered.
function renderedSig(ad, copy, options, changedAt) {
  if (ad.rendered_sig) return ad.rendered_sig;
  return changedAt && changedAt > (ad.updated_at || ad.created_at) ? 'before-changes' : adSignature(copy, options, ad);
}

/** IDs of the ads Generate would make: never rendered, failed, or out of date with the copy and settings. */
export function outdatedAds(adset) {
  const copy = parseJson(adset.copy, null);
  const options = parseJson(adset.options, {});
  const ads = db.all('SELECT * FROM ads WHERE adset_id = ?', adset.id);
  const changedAt = lastChange(adset.id);
  return new Set(ads.filter((ad) => ad.status !== 'ready'
    || (copy && renderedSig(ad, copy, options, changedAt) !== adSignature(copy, options, ad))).map((ad) => ad.id));
}

/** Save new copy and settings, and add or drop ads to match. Nothing renders until Generate. */
export function applyChanges(adset, next) {
  const prev = { copy: parseJson(adset.copy, {}), options: parseJson(adset.options, {}) };
  const changedAt = lastChange(adset.id);
  const planned = plannedAds(next.options);
  const wanted = new Set(planned.map(adKey));
  const existing = db.all('SELECT * FROM ads WHERE adset_id = ?', adset.id);
  const have = new Set(existing.map(adKey));
  const dropped = existing.filter((ad) => !wanted.has(adKey(ad)));
  db.transaction(() => {
    for (const ad of dropped) db.run('DELETE FROM ads WHERE id = ?', ad.id);
    // Pin down what older ads were made from before the copy changes under them.
    for (const ad of existing) {
      if (!ad.rendered_sig && ad.status === 'ready' && wanted.has(adKey(ad))) {
        db.run('UPDATE ads SET rendered_sig = ? WHERE id = ?', renderedSig(ad, prev.copy, prev.options, changedAt), ad.id);
      }
    }
    for (const p of planned) {
      if (!have.has(adKey(p))) insert('ads', { id: newId('ad'), adset_id: adset.id, ...p, status: 'pending', created_at: now() });
    }
    update('adsets', adset.id, { copy: JSON.stringify(next.copy), options: JSON.stringify(next.options), updated_at: now() });
  });
  for (const ad of dropped) {
    fs.rmSync(adFile(ad), { force: true });
    fs.rmSync(adThumb(ad), { force: true });
  }
}

/** Render the ads that are out of date (or, when everything is current, all of them). Returns how many. */
export function generateAds(adset) {
  const outdated = outdatedAds(adset);
  const ids = outdated.size ? [...outdated] : db.all('SELECT id FROM ads WHERE adset_id = ?', adset.id).map((r) => r.id);
  db.transaction(() => {
    for (const id of ids) db.run("UPDATE ads SET status = 'queued', error = NULL WHERE id = ?", id);
    update('adsets', adset.id, { status: 'queued', stage: 'Queued', progress: 0, error: null, updated_at: now() });
  });
  enqueueAdSet(adset.id);
  return ids.length;
}

// ---------- requests and undo ----------
// The state an undo would replace, without notes the renderer adds along the way.
const snapshot = (copy, options) => JSON.stringify({ copy: { ...copy, musicNote: undefined, motionNote: undefined }, options });
const working = new Set(); // ad sets with a request in progress

export async function reviseAdSet(adset, request) {
  if (working.has(adset.id)) throw new HttpError(409, "I'm already working on a change to these ads.");
  const used = db.get('SELECT COUNT(*) AS n FROM adset_revisions WHERE adset_id = ?', adset.id).n;
  if (used >= REVISIONS_PER_SET) throw new HttpError(429, `These ads have had ${REVISIONS_PER_SET} changes, the most for one ad set. Make a new ad set to keep going.`);
  const brand = db.get('SELECT * FROM brands WHERE id = ?', adset.brand_id);
  if (!brand) throw new HttpError(409, 'This brand was deleted.');
  working.add(adset.id);
  let result;
  try {
    result = await askClaude({ adset, brand, request });
  } catch (err) {
    console.error(`[ads] change request on ${adset.id} failed:`, err.message);
    throw new HttpError(503, "The AI editor couldn't be reached just now. Please try again in a minute, or use Edit copy.");
  } finally {
    working.delete(adset.id);
  }
  // Re-read in case the ads changed while Claude was working.
  const current = db.get('SELECT * FROM adsets WHERE id = ?', adset.id);
  if (!current) throw new HttpError(404, 'Ad set not found.');
  if (['queued', 'processing'].includes(current.status)) throw new HttpError(409, 'These ads started rendering in the meantime. Try again when they finish.');
  const before = { copy: parseJson(current.copy, {}), options: parseJson(current.options, {}) };
  if (result.changed) applyChanges(current, { copy: result.copy, options: result.options });
  insert('adset_revisions', {
    id: newId('rev'),
    adset_id: adset.id,
    request,
    reply: result.reply,
    changed: result.changed ? 1 : 0,
    before: result.changed ? JSON.stringify(before) : null,
    after: result.changed ? snapshot(result.copy, result.options) : null,
    created_at: now(),
  });
  const pending = outdatedAds(db.get('SELECT * FROM adsets WHERE id = ?', adset.id)).size;
  console.log(`[ads] change request on ${adset.id}: ${result.changed ? 'changed' : 'no change'}, ${pending} ad(s) to generate`);
  return { changed: result.changed, pending };
}

/** The most recent change that can still be undone (nothing edited since), if any. */
function undoable(adset) {
  const last = db.get('SELECT * FROM adset_revisions WHERE adset_id = ? AND changed = 1 AND undone = 0 ORDER BY created_at DESC LIMIT 1', adset.id);
  if (!last) return null;
  return last.after === snapshot(parseJson(adset.copy, {}), parseJson(adset.options, {})) ? last : null;
}

export function undoRevision(adset, revisionId) {
  const rev = undoable(adset);
  if (!rev || rev.id !== revisionId) {
    const asked = db.get('SELECT undone FROM adset_revisions WHERE id = ? AND adset_id = ?', revisionId, adset.id);
    throw new HttpError(409, asked?.undone ? 'That change has already been undone.' : "This change can't be undone any more, because the ads were changed after it.");
  }
  const before = parseJson(rev.before, null);
  if (!before) throw new HttpError(409, 'Nothing to undo.');
  applyChanges(adset, before);
  update('adset_revisions', rev.id, { undone: 1 });
}

export function revisionList(adset) {
  const undo = undoable(adset);
  const rows = db.all('SELECT id, request, reply, changed, undone, created_at FROM adset_revisions WHERE adset_id = ? ORDER BY created_at', adset.id);
  return {
    available: reviseEnabled(),
    left: Math.max(0, REVISIONS_PER_SET - rows.length),
    items: rows.slice(-20).map((r) => ({
      id: r.id, request: r.request, reply: r.reply, changed: Boolean(r.changed), undone: Boolean(r.undone),
      canUndo: r.id === undo?.id, createdAt: r.created_at,
    })),
  };
}
