// Change requests: the client says what to change in their own words ("punchier
// headlines", "open on the pouring clip", "add a square version") and Claude
// turns it into edits to the copy, storyboard and settings. Only the ads those
// edits touch are re-rendered, and each change can be undone.
import fs from 'node:fs';
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod';
import { z } from 'zod';
import { config } from '../config.js';
import { db, insert, update, newId, now, parseJson } from '../db.js';
import { VOICES, VOICE, MUSIC, MUSIC_TRACK, LANGUAGE } from '../catalog.js';
import { HttpError } from '../services.js';
import { plainDashes } from '../text.js';
import { STYLES, STYLE, FORMAT_IDS, LENGTHS } from './design.js';
import { MUSIC_MOODS, MUSIC_MOOD, soundtrackEnabled } from './soundtrack.js';
import { CopySchema, COPY_RULES, SCENES_FOR, assetLine, claude, modelParams, tidy } from './brief.js';
import { plannedAds, enqueueAdSet, adFile, adThumb } from './jobs.js';

export const REVISIONS_PER_SET = 30;
export const reviseEnabled = () => config.anthropic.enabled;

const SYSTEM = `You are the creative director of an advertising studio. A client has a finished set of social media ads (videos and image ads made from their own photos and footage) and asks for changes in their own words. Make the changes they ask for and keep everything else exactly as it is.

What you can change:
- Words: on-screen headlines and sublines, the button text (cta), the offer badge, voiceover lines and the post captions.
- Storyboard: which photo or clip each video scene shows, and the order of scenes. Each video keeps its number of scenes (${Object.entries(SCENES_FOR).map(([l, n]) => `${n} for ${l}s`).join(', ')}).
- Image ads: their headline, subline and photo, and how many there are (0 to 3).
- Look: the style.
- Sound: the soundtrack (composed to fit, a stock track or none), its mood, the soundtrack brief in the copy, voiceover on or off, and the voice.
- Sizes: which formats and video lengths the set includes.

What you can't change here. Say so kindly, leave it as it is and point to the fix:
- What's inside a photo or clip (recolouring, removing things, new shots): they can upload new photos or clips to the brand library, then ask for them to be used.
- The logo, brand colours and font: these are set on the brand's page.

How to answer:
- Return the complete settings and copy. Copy every field you are not changing exactly as it is now, word for word.
- When the request is broad ("make it better", "more exciting"), make a clear improvement in that direction instead of asking questions.
- When only part of a request is possible, do that part and say what you couldn't do.
- Use an offer, price or claim only when the client states it, in the brief or in their request.
- When voiceover is on, every scene needs a line of about 2.5 words per second of the scene.
- Reply in one or two short, plain sentences, like a helpful designer: what you changed, not how.

${COPY_RULES}`;

// How the soundtrack setting is described to Claude, and read back.
const musicChoice = (music) => (music === 'ai' ? 'composed' : String(music || '').startsWith('upload:') ? 'current' : music);
const musicChoices = () => ['current', 'none', ...MUSIC.filter((m) => m.id !== 'none').map((m) => m.id), ...(soundtrackEnabled() ? ['composed'] : [])];

function revisionSchema() {
  return z.object({
    reply: z.string().describe("Your reply to the client: one or two short sentences saying what you changed, or why you couldn't and what they can do instead"),
    changed: z.boolean().describe('True if you changed anything; false if the request was unclear or not possible here'),
    settings: z.object({
      style: z.enum(STYLES.map((s) => s.id)),
      formats: z.array(z.enum(FORMAT_IDS)).describe('Ad sizes in the set'),
      lengths: z.array(z.number()).describe(`Video lengths in seconds, each one of ${LENGTHS.join(', ')}; empty for no videos`),
      statics: z.number().describe('Number of image ad variants, 0 to 3'),
      voiceover: z.boolean(),
      voice: z.enum(VOICES.map((v) => v.id)),
      music: z.enum(musicChoices()).describe('"composed" = an original track composed for each video, "none", a stock track ID, or "current" to keep the client\'s own uploaded track'),
      musicMood: z.enum(MUSIC_MOODS.map((m) => m.id)).describe('Mood of the composed soundtrack; "auto" follows the soundtrack brief in the copy'),
    }),
    copy: CopySchema,
  });
}

const library = (brandId) => db.all("SELECT * FROM assets WHERE brand_id = ? AND status = 'ready' AND kind != 'logo' ORDER BY created_at", brandId);

function buildPrompt({ brand, brief, options, copy, assets, history, request }) {
  const { concept, cta, badge, music, videos, statics, captions } = copy;
  const settings = {
    style: options.style, formats: options.formats, lengths: options.lengths, statics: options.statics,
    voiceover: options.voiceover, voice: options.voice, music: musicChoice(options.music), musicMood: options.musicMood || 'auto',
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
    system: SYSTEM,
    messages: [{ role: 'user', content: buildPrompt({ brand, brief, options, copy, assets, history, request }) }],
    output_config: { format: betaZodOutputFormat(revisionSchema()) },
  }));
  if (response.stop_reason === 'refusal') return { reply: "Sorry, I can't make that change to these ads.", changed: false };
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

  const revised = tidy(out.copy, { assets, lengths: next.lengths, voiceover: next.voiceover });
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
const same = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
const adKey = (a) => `${a.kind}|${a.format}|${a.length ?? ''}|${a.variant}`;

/** Does this ad look different with the new copy and settings? */
function stale(prev, next, ad) {
  const [po, no, pc, nc] = [prev.options, next.options, prev.copy, next.copy];
  if (po.style !== no.style || pc.cta !== nc.cta || pc.badge !== nc.badge) return true;
  if (ad.kind === 'image') {
    const pick = (c) => c.statics?.[ad.variant] || c.statics?.[0];
    return !same(pick(pc), pick(nc));
  }
  const video = (c) => c.videos?.find((v) => v.length === ad.length);
  if (!same(video(pc), video(nc))) return true;
  if (po.voiceover !== no.voiceover || (no.voiceover && po.voice !== no.voice) || po.music !== no.music) return true;
  return no.music === 'ai' && (po.musicMood !== no.musicMood || (no.musicMood === 'auto' && pc.music !== nc.music));
}

/** Save new copy and settings, add or drop ads to match, and queue the ones that changed. Returns how many will render. */
export function applyChanges(adset, next) {
  const prev = { copy: parseJson(adset.copy, {}), options: parseJson(adset.options, {}) };
  const planned = plannedAds(next.options);
  const wanted = new Set(planned.map(adKey));
  const existing = db.all('SELECT * FROM ads WHERE adset_id = ?', adset.id);
  const have = new Set(existing.map(adKey));
  const dropped = existing.filter((ad) => !wanted.has(adKey(ad)));
  let queued = 0;
  db.transaction(() => {
    for (const ad of dropped) db.run('DELETE FROM ads WHERE id = ?', ad.id);
    for (const ad of existing) {
      if (wanted.has(adKey(ad)) && (ad.status !== 'ready' || stale(prev, next, ad))) {
        db.run("UPDATE ads SET status = 'queued', error = NULL WHERE id = ?", ad.id);
        queued++;
      }
    }
    for (const p of planned) {
      if (have.has(adKey(p))) continue;
      insert('ads', { id: newId('ad'), adset_id: adset.id, ...p, status: 'queued', created_at: now() });
      queued++;
    }
    update('adsets', adset.id, {
      copy: JSON.stringify(next.copy),
      options: JSON.stringify(next.options),
      updated_at: now(),
      ...(queued ? { status: 'queued', stage: 'Queued', progress: 0, error: null } : {}),
    });
  });
  for (const ad of dropped) {
    fs.rmSync(adFile(ad), { force: true });
    fs.rmSync(adThumb(ad), { force: true });
  }
  if (queued) enqueueAdSet(adset.id);
  return queued;
}

// ---------- requests and undo ----------
// The state an undo would replace, without notes the renderer adds along the way.
const snapshot = (copy, options) => JSON.stringify({ copy: { ...copy, musicNote: undefined }, options });
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
  let rendering = 0;
  if (result.changed) rendering = applyChanges(current, { copy: result.copy, options: result.options });
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
  return { changed: result.changed, rendering };
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
