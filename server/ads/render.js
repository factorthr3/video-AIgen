// Renders ads from the client's own assets: video ads (frames composed with
// Skia and piped into ffmpeg) and static image ads, in any format. Motion is
// deliberately restrained (slow pushes, soft fades, clean type) so the result
// looks like an agency edit, not a generated video.
import fs from 'node:fs';
import { spawn } from 'node:child_process';
import { createCanvas, loadImage, ImageData } from '@napi-rs/canvas';
import { config } from '../config.js';
import { ffmpeg } from '../pipeline/ffmpeg.js';
import { FORMATS, STYLE, BRAND_FONT, palette, textOn, luminance, rgbToHex } from './design.js';
import { assetFile, cropFor, extractColors } from './assets.js';

const FPS = 30;
const TRANSITION = 0.35;
export const END_CARD = { 6: 1.6, 15: 2.4, 30: 3 };

const clamp01 = (x) => Math.max(0, Math.min(1, x));
const easeOut = (x) => 1 - (1 - clamp01(x)) ** 3;
const easeInOut = (x) => (x < 0.5 ? 4 * x * x * x : 1 - (-2 * x + 2) ** 3 / 2);
const easeOutBack = (x) => {
  const c1 = 1.4;
  const c3 = c1 + 1;
  const t = clamp01(x);
  return 1 + c3 * (t - 1) ** 3 + c1 * (t - 1) ** 2;
};
const even = (n) => Math.max(2, Math.floor(n / 2) * 2);

// ---------- video assets ----------
// Streams frames of one stretch of a video, cropped and scaled to the frame.
class VideoReader {
  constructor({ file, start, duration, crop, W, H, loop }) {
    this.frameSize = W * H * 4;
    this.chunks = [];
    this.buffered = 0;
    this.ended = false;
    this.index = -1;
    this.last = null;
    this.waiters = [];
    const vf = `crop=${even(crop.sw)}:${even(crop.sh)}:${Math.round(crop.sx)}:${Math.round(crop.sy)},scale=${W}:${H}:flags=lanczos,fps=${FPS}`;
    this.proc = spawn(config.ffmpeg, [
      '-hide_banner', '-loglevel', 'error',
      ...(loop ? ['-stream_loop', '-1'] : []), '-ss', start.toFixed(3), '-i', file, '-t', duration.toFixed(3),
      '-an', '-vf', vf, '-f', 'rawvideo', '-pix_fmt', 'rgba', 'pipe:1',
    ], { stdio: ['ignore', 'pipe', 'ignore'] });
    this.proc.stdout.on('data', (d) => {
      this.chunks.push(d);
      this.buffered += d.length;
      if (this.buffered > this.frameSize * 4) this.proc.stdout.pause();
      this.wake();
    });
    const finish = () => {
      this.ended = true;
      this.wake();
    };
    this.proc.stdout.on('end', finish);
    this.proc.on('error', finish);
  }

  wake() {
    const w = this.waiters;
    this.waiters = [];
    w.forEach((resolve) => resolve());
  }

  async readOne() {
    while (this.buffered < this.frameSize && !this.ended) {
      this.proc.stdout.resume();
      await new Promise((resolve) => this.waiters.push(resolve));
    }
    if (this.buffered < this.frameSize) return null;
    const frame = Buffer.allocUnsafe(this.frameSize);
    let offset = 0;
    while (offset < this.frameSize) {
      const chunk = this.chunks[0];
      const take = Math.min(chunk.length, this.frameSize - offset);
      chunk.copy(frame, offset, 0, take);
      offset += take;
      if (take === chunk.length) this.chunks.shift();
      else this.chunks[0] = chunk.subarray(take);
    }
    this.buffered -= this.frameSize;
    if (this.buffered < this.frameSize * 2) this.proc.stdout.resume();
    return frame;
  }

  async frame(index) {
    while (this.index < index) {
      const f = await this.readOne();
      if (!f) break;
      this.last = f;
      this.index++;
    }
    return this.last;
  }

  close() {
    this.proc.kill('SIGKILL');
  }
}

// ---------- drawing helpers ----------
function roundRect(ctx, x, y, w, h, r) {
  const rr = Math.min(r, h / 2, w / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

/** Draw `img`'s crop to fill W x H, pushed in by `zoom` towards the subject. */
function drawCover(ctx, img, crop, W, H, zoom = 1) {
  const s = crop.subject;
  const fx = (s.x + s.width / 2) * img.width;
  const fy = (s.y + s.height / 2) * img.height;
  const sw = crop.sw / zoom;
  const sh = crop.sh / zoom;
  const sx = Math.max(crop.sx, Math.min(crop.sx + crop.sw - sw, fx - sw / 2));
  const sy = Math.max(crop.sy, Math.min(crop.sy + crop.sh - sh, fy - sh / 2));
  ctx.drawImage(img, sx, sy, sw, sh, 0, 0, W, H);
}

/** A transparent product cut-out on a soft brand-coloured backdrop. */
/** Where a cut-out product goes: clear of the text (to the right in wide, left-aligned layouts). */
function cutoutBox(d, lay, reserve = 0) {
  const { box, U } = d;
  if (d.fmt.id === '16:9' && d.style.align === 'left') {
    return { cx: box.x0 + (box.x1 - box.x0) * 0.74, w: (box.x1 - box.x0) * 0.42, h: (box.y1 - box.y0) * 0.92, cy: (box.y0 + box.y1) / 2 };
  }
  const top = box.y0 + U * 0.08;
  const bottom = (d.style.anchor === 'bottom' ? lay.top - reserve : box.y1) - U * 0.04;
  return { cx: d.W / 2, w: (box.x1 - box.x0) * 0.8, h: Math.max(U * 0.3, bottom - top), cy: (top + bottom) / 2 };
}

function drawCutout(ctx, img, W, H, pal, zoom, area) {
  const g = ctx.createLinearGradient(0, 0, W, H);
  g.addColorStop(0, pal.primary);
  g.addColorStop(1, shade(pal.primary, -0.35));
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  const cx = area.cx ?? W / 2;
  const glow = ctx.createRadialGradient(cx, area.cy, 0, cx, area.cy, Math.max(W, H) * 0.55);
  glow.addColorStop(0, 'rgba(255,255,255,0.28)');
  glow.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, W, H);
  const fit = Math.min(area.w / img.width, area.h / img.height) * zoom;
  const dw = img.width * fit;
  const dh = img.height * fit;
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.35)';
  ctx.shadowBlur = Math.min(W, H) * 0.04;
  ctx.shadowOffsetY = Math.min(W, H) * 0.02;
  ctx.drawImage(img, cx - dw / 2, area.cy - dh / 2, dw, dh);
  ctx.restore();
}

function shade(hex, amount) {
  const n = parseInt(hex.slice(1), 16);
  const rgb = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  return rgbToHex(rgb.map((v) => (amount < 0 ? v * (1 + amount) : v + (255 - v) * amount)));
}

function scrim(ctx, kind, W, H, strength = 1) {
  if (kind === 'bottom') {
    const g = ctx.createLinearGradient(0, H * 0.4, 0, H);
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(1, `rgba(0,0,0,${0.72 * strength})`);
    ctx.fillStyle = g;
    ctx.fillRect(0, H * 0.4, W, H * 0.6);
  } else if (kind === 'full') {
    ctx.fillStyle = `rgba(0,0,0,${0.32 * strength})`;
    ctx.fillRect(0, 0, W, H);
  } else if (kind === 'vignette') {
    const g = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.2, W / 2, H / 2, Math.max(W, H) * 0.75);
    g.addColorStop(0, `rgba(0,0,0,${0.25 * strength})`);
    g.addColorStop(1, `rgba(0,0,0,${0.75 * strength})`);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
  }
}

function wrap(ctx, text, maxWidth) {
  const lines = [];
  let line = '';
  for (const word of String(text).split(/\s+/).filter(Boolean)) {
    const next = line ? `${line} ${word}` : word;
    if (line && ctx.measureText(next).width > maxWidth) {
      lines.push(line);
      line = word;
    } else line = next;
  }
  if (line) lines.push(line);
  return lines;
}

/** Largest size (up to `size`) where `text` fits in `maxLines` lines of `maxWidth`. */
function fit(ctx, text, family, size, maxWidth, maxLines) {
  for (let s = size; ; s = Math.round(s * 0.92)) {
    ctx.font = `${s}px "${family}"`;
    const lines = wrap(ctx, text, maxWidth);
    if ((lines.length <= maxLines && lines.every((l) => ctx.measureText(l).width <= maxWidth)) || s < 28) return { lines, size: s };
  }
}

// ---------- the ad's look ----------
function designFor({ brand, style: styleId, format }) {
  const fmt = FORMATS[format];
  const style = STYLE[styleId] || STYLE.clean;
  const fonts = BRAND_FONT[style.font || brand.font] || BRAND_FONT.montserrat;
  const pal = palette(JSON.parse(brand.colors || '[]'));
  const { w: W, h: H, safe } = fmt;
  // Type reads smaller in tall frames, so vertical formats get a boost.
  const U = Math.min(W, H) * ({ '9:16': 1.14, '4:5': 1.05 }[format] || 1);
  const box = { x0: W * safe.left, x1: W * (1 - safe.right), y0: H * safe.top, y1: H * (1 - safe.bottom) };
  return { fmt, style, fonts, pal, W, H, U, box };
}

/** Lay out a scene's headline and subline for the style (sizes and positions). */
function layoutText(ctx, d, headline, subline) {
  const { style, fonts, U, box } = d;
  const width = box.x1 - box.x0;
  const head = style.uppercase ? String(headline).toUpperCase() : String(headline);
  const base = U * 0.082 * style.headlineScale * (d.fmt.id === '16:9' ? 1.05 : 1);
  const h = fit(ctx, head, fonts.heading, Math.round(base), width * (style.align === 'center' ? 0.92 : 0.88), 3);
  const sub = subline ? fit(ctx, subline, fonts.body, Math.round(Math.max(26, h.size * 0.42)), width * 0.85, 2) : null;
  const lineH = h.size * (fonts.heading === 'Bebas Neue' ? 0.98 : 1.12);
  const subLineH = sub ? sub.size * 1.3 : 0;
  const gap = sub ? h.size * 0.35 : 0;
  const blockH = h.lines.length * lineH + gap + (sub ? sub.lines.length * subLineH : 0);
  let top;
  if (style.anchor === 'bottom') top = box.y1 - blockH;
  else top = box.y0 + (box.y1 - box.y0 - blockH) / 2;
  return { head: h, sub, lineH, subLineH, gap, top, blockH };
}

function drawText(ctx, d, lay, p, ctaReserve = 0) {
  const { style, fonts, pal, W, box } = d;
  const appear = style.id === 'luxury' ? easeOut(p / 1.8) : easeOut(p);
  let dy = (1 - appear) * d.U * 0.035;
  let scale = 1;
  if (style.id === 'bold') {
    scale = 0.9 + 0.1 * easeOutBack(p);
    dy = 0;
  }
  if (style.id === 'promo') {
    scale = 1 + 0.18 * (1 - easeOut(p * 1.6));
    dy = 0;
  }
  const top = lay.top - ctaReserve;
  const cx = style.align === 'center' ? W / 2 : box.x0;
  ctx.save();
  ctx.globalAlpha *= clamp01(appear * 1.2);
  ctx.translate(cx, top + lay.blockH / 2);
  ctx.scale(scale, scale);
  ctx.translate(-cx, -(top + lay.blockH / 2));
  ctx.textAlign = style.align === 'center' ? 'center' : 'left';
  ctx.textBaseline = 'top';
  let y = top + dy;
  ctx.font = `${lay.head.size}px "${fonts.heading}"`;
  for (const line of lay.head.lines) {
    if (style.textBox) {
      const w = ctx.measureText(line).width;
      const padX = lay.head.size * 0.28;
      const x = style.align === 'center' ? cx - w / 2 : cx;
      ctx.fillStyle = pal.primary;
      roundRect(ctx, x - padX, y - lay.head.size * 0.1, w + padX * 2, lay.lineH * 0.98, lay.head.size * 0.12);
      ctx.fill();
      ctx.fillStyle = textOn(pal.primary);
    } else {
      ctx.shadowColor = 'rgba(0,0,0,0.45)';
      ctx.shadowBlur = lay.head.size * 0.25;
      ctx.shadowOffsetY = lay.head.size * 0.04;
      ctx.fillStyle = '#ffffff';
    }
    ctx.fillText(line, cx, y);
    ctx.shadowColor = 'transparent';
    y += lay.lineH;
  }
  if (lay.sub) {
    y += lay.gap;
    if (style.id === 'luxury') {
      ctx.fillStyle = 'rgba(255,255,255,0.75)';
      ctx.fillRect(cx - d.U * 0.04, y - lay.gap * 0.55, d.U * 0.08, Math.max(2, d.U * 0.002));
    }
    ctx.font = `${lay.sub.size}px "${fonts.body}"`;
    ctx.fillStyle = 'rgba(255,255,255,0.92)';
    ctx.shadowColor = 'rgba(0,0,0,0.5)';
    ctx.shadowBlur = lay.sub.size * 0.3;
    for (const line of lay.sub.lines) {
      ctx.fillText(line, cx, y);
      y += lay.subLineH;
    }
  }
  ctx.restore();
}

function drawLogo(ctx, d, logo, alpha = 1) {
  if (!logo) return;
  const h = d.U * 0.065;
  const w = Math.min((logo.img.width / logo.img.height) * h, d.U * 0.34);
  const hh = (logo.img.height / logo.img.width) * w;
  const x = d.box.x0;
  const y = d.box.y0 - (d.fmt.id === '9:16' ? d.H * 0.02 : 0);
  ctx.save();
  ctx.globalAlpha *= alpha;
  if (!logo.transparent || !logo.mono) {
    // Logos with a solid background, or in several colours, sit on a white tile.
    const pad = h * 0.18;
    ctx.fillStyle = '#ffffff';
    roundRect(ctx, x - pad, y - pad, w + pad * 2, hh + pad * 2, pad);
    ctx.fill();
    ctx.drawImage(logo.img, x, y, w, hh);
  } else {
    // Single-colour logos turn white over imagery (as brands do).
    ctx.shadowColor = 'rgba(0,0,0,0.35)';
    ctx.shadowBlur = h * 0.3;
    ctx.drawImage(logo.white, x, y, w, hh);
  }
  ctx.restore();
}

function drawBadge(ctx, d, text, t) {
  if (!text) return;
  const r = d.U * 0.105;
  const cx = d.box.x1 - r;
  const cy = d.box.y0 + r + (d.fmt.id === '9:16' ? d.H * 0.04 : 0);
  const p = easeOutBack(clamp01((t - 0.3) / 0.45));
  if (p <= 0) return;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(-0.14);
  ctx.scale(p, p);
  ctx.fillStyle = d.pal.accent;
  ctx.shadowColor = 'rgba(0,0,0,0.3)';
  ctx.shadowBlur = r * 0.25;
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.shadowColor = 'transparent';
  ctx.fillStyle = textOn(d.pal.accent);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const { lines, size } = fit(ctx, text.toUpperCase(), 'Bebas Neue', Math.round(r * 0.62), r * 1.55, 2);
  ctx.font = `${size}px "Bebas Neue"`;
  lines.forEach((l, i) => ctx.fillText(l, 0, (i - (lines.length - 1) / 2) * size * 0.95));
  ctx.restore();
}

function drawButton(ctx, d, label, cx, cy, alpha = 1, scale = 1) {
  const size = Math.round(d.U * 0.042);
  ctx.save();
  ctx.globalAlpha *= alpha;
  ctx.font = `${size}px "${d.fonts.heading === 'Bebas Neue' ? 'Inter Bold' : d.fonts.heading}"`;
  const w = ctx.measureText(label).width + size * 2.2;
  const h = size * 2.3;
  ctx.translate(cx, cy);
  ctx.scale(scale, scale);
  ctx.fillStyle = d.pal.accent;
  ctx.shadowColor = 'rgba(0,0,0,0.25)';
  ctx.shadowBlur = size * 0.6;
  roundRect(ctx, -w / 2, -h / 2, w, h, h / 2);
  ctx.fill();
  ctx.shadowColor = 'transparent';
  ctx.fillStyle = textOn(d.pal.accent);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, 0, size * 0.04);
  ctx.restore();
  return h;
}

// The closing card: logo, call to action and link on a clean background.
function drawEndCard(ctx, d, { logo, brandName, cta, url }, local) {
  const { W, H, U } = d;
  // Pick a background the logo reads on (logos are often in the brand colour).
  const bg = logo?.dark ? '#f6f5f2' : '#0d0d12';
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);
  const glow = ctx.createRadialGradient(W / 2, H * 0.42, 0, W / 2, H * 0.42, Math.max(W, H) * 0.6);
  glow.addColorStop(0, `${d.pal.primary}33`);
  glow.addColorStop(1, `${d.pal.primary}00`);
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, W, H);
  const fg = textOn(bg);
  const p = easeOut(local / 0.6);
  const midY = d.box.y0 + (d.box.y1 - d.box.y0) * 0.42;
  ctx.save();
  ctx.globalAlpha *= p;
  if (logo) {
    const maxW = Math.min(W * 0.55, U * 0.6);
    const maxH = U * 0.24;
    const s = Math.min(maxW / logo.img.width, maxH / logo.img.height) * (0.94 + 0.06 * p);
    const lw = logo.img.width * s;
    const lh = logo.img.height * s;
    if (!logo.transparent) {
      const pad = U * 0.03;
      ctx.fillStyle = '#ffffff';
      roundRect(ctx, W / 2 - lw / 2 - pad, midY - lh / 2 - pad, lw + pad * 2, lh + pad * 2, pad);
      ctx.fill();
    }
    ctx.drawImage(logo.img, W / 2 - lw / 2, midY - lh / 2, lw, lh);
  } else {
    ctx.fillStyle = fg;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const { lines, size } = fit(ctx, brandName, d.fonts.heading, Math.round(U * 0.11), W * 0.8, 2);
    ctx.font = `${size}px "${d.fonts.heading}"`;
    lines.forEach((l, i) => ctx.fillText(l, W / 2, midY + (i - (lines.length - 1) / 2) * size * 1.1));
  }
  ctx.restore();
  const bp = easeOutBack(clamp01((local - 0.3) / 0.5));
  const btnY = midY + U * 0.22;
  const bh = drawButton(ctx, d, cta, W / 2, btnY, clamp01((local - 0.25) / 0.3), 0.85 + 0.15 * bp);
  if (url) {
    ctx.save();
    ctx.globalAlpha *= clamp01((local - 0.45) / 0.4);
    ctx.fillStyle = fg === '#ffffff' ? 'rgba(255,255,255,0.7)' : 'rgba(11,11,16,0.6)';
    ctx.font = `${Math.round(U * 0.032)}px "${d.fonts.body}"`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText(url.replace(/^https?:\/\//, '').replace(/\/$/, ''), W / 2, btnY + bh / 2 + U * 0.035);
    ctx.restore();
  }
}

// ---------- shared loading ----------
export async function loadLogo(asset) {
  if (!asset || asset.status !== 'ready') return null;
  const img = await loadImage(fs.readFileSync(assetFile(asset)));
  // Average luminance of the logo's visible pixels decides the end card colour.
  const c = createCanvas(64, Math.max(1, Math.round((64 * img.height) / img.width)));
  const cx = c.getContext('2d');
  cx.drawImage(img, 0, 0, c.width, c.height);
  const data = cx.getImageData(0, 0, c.width, c.height).data;
  let sum = 0;
  let n = 0;
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] < 128) continue;
    sum += luminance(rgbToHex([data[i], data[i + 1], data[i + 2]]));
    n++;
  }
  // A white silhouette for overlays on photos and footage.
  const white = createCanvas(img.width, img.height);
  const wctx = white.getContext('2d');
  wctx.drawImage(img, 0, 0);
  wctx.globalCompositeOperation = 'source-in';
  wctx.fillStyle = '#ffffff';
  wctx.fillRect(0, 0, img.width, img.height);
  // Several distinct colours (e.g. a coloured mark plus a wordmark) would turn into a blob in white.
  const sample = createCanvas(Math.min(400, img.width), Math.max(1, Math.round((Math.min(400, img.width) * img.height) / img.width)));
  const sctx = sample.getContext('2d');
  sctx.drawImage(img, 0, 0, sample.width, sample.height);
  const mono = extractColors(sctx, sample.width, sample.height, 2).length < 2;
  return { img, white, mono, transparent: Boolean(asset.has_alpha), dark: n ? sum / n < 0.5 : false };
}

const domain = (url) => (url ? String(url).trim() : '');

// ---------- video ads ----------
/**
 * scenes: [{ headline, subline, assetId }], each with `duration` (seconds);
 * the end card follows. assets: Map of id -> asset row.
 */
export async function renderVideoAd({ brand, logo, assets, scenes, endCard, copy, format, style, url, audioFile, out, thumbOut, onProgress }) {
  const d = designFor({ brand, style, format });
  const { W, H } = d;
  let t = 0;
  const timeline = scenes.map((s) => {
    const entry = { ...s, start: t };
    t += s.duration;
    return entry;
  });
  const endStart = t;
  const total = t + endCard;
  const totalFrames = Math.ceil(total * FPS);

  // Media per scene: images load once; videos stream their own stretch.
  const images = new Map();
  const videoCursor = new Map();
  for (const s of timeline) {
    const a = assets.get(s.assetId);
    if (!a) continue;
    if (a.kind === 'video') {
      const startAt = videoCursor.get(a.id) || 0;
      const fits = startAt + s.duration + TRANSITION <= a.duration;
      s.videoStart = fits ? startAt : 0;
      videoCursor.set(a.id, fits ? startAt + s.duration : s.duration);
    } else if (!images.has(a.id)) {
      images.set(a.id, await loadImage(fs.readFileSync(assetFile(a))));
    }
  }
  const crops = new Map();
  const cropOf = (a) => {
    if (!crops.has(a.id)) crops.set(a.id, cropFor(a, W / H));
    return crops.get(a.id);
  };
  const readers = new Map();
  const frameCanvas = createCanvas(W, H);
  const frameCtx = frameCanvas.getContext('2d');
  const layer = createCanvas(W, H);
  const layerCtx = layer.getContext('2d');

  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext('2d');
  const layouts = timeline.map((s) => layoutText(ctx, d, s.headline, s.subline));
  const cutoutArea = (lay) => cutoutBox(d, lay);

  // Paint scene i at `local` seconds into ctx2 (background, scrim, text).
  const paintScene = async (c2, i, local) => {
    const s = timeline[i];
    const a = assets.get(s.assetId);
    const p = clamp01(local / s.duration);
    const zoom = 1 + d.style.push * easeInOut(p) + (d.style.transition === 'punch' ? 0.06 * (1 - easeOut(local / 0.35)) : 0);
    c2.fillStyle = '#000';
    c2.fillRect(0, 0, W, H);
    if (a?.kind === 'video') {
      if (!readers.has(i)) {
        readers.set(i, new VideoReader({ file: assetFile(a), start: s.videoStart, duration: s.duration + TRANSITION + 0.2, crop: cropOf(a), W, H, loop: a.duration < s.duration + TRANSITION }));
      }
      const frame = await readers.get(i).frame(Math.max(0, Math.round(local * FPS)));
      if (frame) {
        frameCtx.putImageData(new ImageData(new Uint8ClampedArray(frame.buffer, frame.byteOffset, frame.length), W, H), 0, 0);
        c2.drawImage(frameCanvas, 0, 0);
      }
    } else if (a) {
      const img = images.get(a.id);
      if (a.has_alpha) drawCutout(c2, img, W, H, d.pal, 1 + (zoom - 1) * 0.5, cutoutArea(layouts[i]));
      else drawCover(c2, img, cropOf(a), W, H, zoom);
    }
    scrim(c2, d.style.scrim, W, H, a?.has_alpha ? 0.5 : 1);
    drawText(c2, d, layouts[i], (local - 0.12) / 0.5);
  };

  const tmp = `${out}.part.mp4`;
  const proc = spawn(config.ffmpeg, [
    '-hide_banner', '-loglevel', 'error', '-y',
    '-f', 'rawvideo', '-pix_fmt', 'rgba', '-s', `${W}x${H}`, '-r', String(FPS), '-i', 'pipe:0',
    '-i', audioFile, '-map', '0:v', '-map', '1:a',
    '-c:v', 'libx264', '-preset', config.render.preset, '-crf', config.render.crf, '-pix_fmt', 'yuv420p', '-profile:v', 'high',
    '-c:a', 'aac', '-b:a', '192k', '-shortest', '-movflags', '+faststart', tmp,
  ], { stdio: ['pipe', 'ignore', 'pipe'] });
  let stderr = '';
  proc.stderr.on('data', (x) => (stderr += x));
  const exited = new Promise((resolve, reject) => {
    proc.on('error', reject);
    proc.on('close', (code) => (code === 0 ? resolve() : reject(new Error(`ffmpeg encode failed (${code}): ${stderr.slice(-300)}`))));
  });
  proc.stdin.on('error', () => {});

  const endInfo = { logo, brandName: brand.name, cta: copy.cta, url: domain(url) };
  const thumbFrame = Math.min(totalFrames - 1, Math.round(FPS * Math.min(1.2, timeline[0]?.duration * 0.6 || 1)));
  let idx = 0;
  try {
    for (let f = 0; f < totalFrames; f++) {
      const time = f / FPS;
      ctx.globalAlpha = 1;
      if (time >= endStart) {
        drawEndCard(ctx, d, endInfo, time - endStart);
      } else {
        while (idx < timeline.length - 1 && time >= timeline[idx + 1].start) idx++;
        const s = timeline[idx];
        const local = time - s.start;
        for (const [k, r] of readers) if (k < idx) {
          r.close();
          readers.delete(k);
        }
        await paintScene(ctx, idx, local);
        if (d.style.logo === 'corner') drawLogo(ctx, d, logo, clamp01(time / 0.4));
        if (d.style.badge) drawBadge(ctx, d, copy.badge, time);
        // Transition into the next scene (or the end card) over its last moments.
        const into = s.duration - local;
        if (into < TRANSITION) {
          const q = easeInOut(1 - into / TRANSITION);
          layerCtx.globalAlpha = 1;
          if (idx < timeline.length - 1) {
            await paintScene(layerCtx, idx + 1, 0);
            if (d.style.logo === 'corner') drawLogo(layerCtx, d, logo);
            if (d.style.badge) drawBadge(layerCtx, d, copy.badge, time);
          } else {
            drawEndCard(layerCtx, d, endInfo, 0);
          }
          ctx.save();
          if (d.style.transition === 'slide') {
            ctx.drawImage(layer, W * (1 - q), 0);
          } else if (d.style.transition === 'punch') {
            if (q > 0.6) ctx.drawImage(layer, 0, 0);
          } else {
            ctx.globalAlpha = q;
            ctx.drawImage(layer, 0, 0);
          }
          ctx.restore();
        }
      }
      if (f === thumbFrame && thumbOut) {
        const th = createCanvas(Math.round(W / 2), Math.round(H / 2));
        th.getContext('2d').drawImage(canvas, 0, 0, th.width, th.height);
        fs.writeFileSync(thumbOut, await th.encode('jpeg', 84));
      }
      if (!proc.stdin.write(canvas.data())) await Promise.race([new Promise((r) => proc.stdin.once('drain', r)), exited]);
      if (f % FPS === 0) onProgress?.(f / totalFrames);
    }
    proc.stdin.end();
    await exited;
  } catch (err) {
    proc.kill('SIGKILL');
    fs.rmSync(tmp, { force: true });
    throw err;
  } finally {
    for (const r of readers.values()) r.close();
  }
  fs.renameSync(tmp, out);
  return { duration: total };
}

// ---------- audio ----------
/** Music bed (looped, faded) plus optional voice lines at their scene starts. */
export async function buildAdAudio({ duration, music, voices = [], out }) {
  const args = [];
  const parts = [];
  const mixIn = [];
  voices.forEach((v, i) => {
    args.push('-i', v.file);
    parts.push(`[${i}:a]aresample=44100,adelay=${Math.round(v.start * 1000)}:all=1[v${i}]`);
    mixIn.push(`[v${i}]`);
  });
  if (music) {
    const m = voices.length;
    args.push('-stream_loop', '-1', '-i', music);
    const fadeOut = Math.max(0, duration - 1.2).toFixed(2);
    // Quieter under a voiceover.
    const level = voices.length ? 'loudnorm=I=-28:TP=-6' : 'loudnorm=I=-16:TP=-1.5';
    parts.push(`[${m}:a]atrim=0:${duration.toFixed(3)},asetpts=N/SR/TB,${level},aresample=44100,afade=t=in:d=0.25,afade=t=out:st=${fadeOut}:d=1.2[m]`);
    mixIn.push('[m]');
  }
  if (!mixIn.length) {
    await ffmpeg(['-f', 'lavfi', '-i', 'anullsrc=r=44100:cl=stereo', '-t', duration.toFixed(3), '-c:a', 'aac', '-b:a', '128k', out]);
    return;
  }
  const voiceNorm = voices.length ? `${mixIn.length > 1 ? `${mixIn.join('')}amix=inputs=${mixIn.length}:duration=longest:normalize=0` : `${mixIn[0]}anull`},apad=whole_dur=${duration.toFixed(3)},atrim=0:${duration.toFixed(3)},alimiter=limit=0.95[out]`
    : `${mixIn[0]}apad=whole_dur=${duration.toFixed(3)},atrim=0:${duration.toFixed(3)}[out]`;
  await ffmpeg([...args, '-filter_complex', `${parts.join(';')};${voiceNorm}`, '-map', '[out]', '-ac', '2', '-c:a', 'aac', '-b:a', '192k', out]);
}

// ---------- static image ads ----------
export async function renderStaticAd({ brand, logo, asset, headline, subline, copy, format, style, out, thumbOut }) {
  const d = designFor({ brand, style, format });
  const { W, H } = d;
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, W, H);
  // Leave room under the text for the button.
  const lay = layoutText(ctx, d, headline, subline);
  const btnSpace = d.U * 0.13;
  if (asset) {
    let img;
    if (asset.kind === 'video') {
      const still = `${out}.frame.jpg`;
      await ffmpeg(['-ss', (asset.duration * 0.35).toFixed(2), '-i', assetFile(asset), '-frames:v', '1', '-q:v', '2', still]);
      img = await loadImage(fs.readFileSync(still));
      fs.rmSync(still, { force: true });
    } else {
      img = await loadImage(fs.readFileSync(assetFile(asset)));
    }
    if (asset.has_alpha) {
      drawCutout(ctx, img, W, H, d.pal, 1, cutoutBox(d, lay, btnSpace));
    } else {
      const crop = cropFor({ ...asset, width: img.width, height: img.height }, W / H);
      drawCover(ctx, img, crop, W, H, 1.02);
    }
  }
  scrim(ctx, d.style.scrim === 'full' ? 'full' : d.style.scrim, W, H, asset?.has_alpha ? 0.5 : 1);
  const reserve = d.style.anchor === 'bottom' ? btnSpace : 0;
  drawText(ctx, d, lay, 1, reserve);
  // Button under the text block.
  const btnY = d.style.anchor === 'bottom' ? d.box.y1 - btnSpace / 2 + d.U * 0.01 : lay.top + lay.blockH + d.U * 0.09;
  drawButton(ctx, d, copy.cta, d.style.align === 'center' ? W / 2 : d.box.x0 + measureButton(ctx, d, copy.cta) / 2, btnY);
  drawLogo(ctx, d, logo);
  if (d.style.badge) drawBadge(ctx, d, copy.badge, 10);
  fs.writeFileSync(out, await canvas.encode('jpeg', 92));
  if (thumbOut) {
    const th = createCanvas(Math.round(W / 2), Math.round(H / 2));
    th.getContext('2d').drawImage(canvas, 0, 0, th.width, th.height);
    fs.writeFileSync(thumbOut, await th.encode('jpeg', 84));
  }
}

function measureButton(ctx, d, label) {
  const size = Math.round(d.U * 0.042);
  ctx.font = `${size}px "${d.fonts.heading === 'Bebas Neue' ? 'Inter Bold' : d.fonts.heading}"`;
  return ctx.measureText(label).width + size * 2.2;
}
