// Stage 4: compose every frame with Skia (Ken Burns motion, crossfades,
// animated captions, watermark) and stream raw RGBA frames into ffmpeg.
// Doing the compositing in-process means we only need a stock ffmpeg with
// libx264 - no libass/freetype builds required.
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { createCanvas, loadImage, GlobalFonts, ImageData } from '@napi-rs/canvas';
import { config, FONTS_DIR } from '../config.js';
import { ffmpeg } from './ffmpeg.js';

GlobalFonts.registerFromPath(path.join(FONTS_DIR, 'Anton-Regular.ttf'), 'Anton');
GlobalFonts.registerFromPath(path.join(FONTS_DIR, 'Poppins-ExtraBold.ttf'), 'Poppins ExtraBold');
GlobalFonts.registerFromPath(path.join(FONTS_DIR, 'Poppins-SemiBold.ttf'), 'Poppins SemiBold');

const XFADE = 0.35; // seconds of crossfade between scenes
const NON_LATIN = new Set(['ja', 'zh', 'ko', 'hi']);

const easeInOut = (x) => (x < 0.5 ? 2 * x * x : 1 - (-2 * x + 2) ** 2 / 2);
const easeOutBack = (x) => {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * (x - 1) ** 3 + c1 * (x - 1) ** 2;
};
const clamp01 = (x) => Math.max(0, Math.min(1, x));

// ---------- audio ----------
export async function buildAudioTrack({ clips, totalDuration, musicFile, out }) {
  // Voice: each clip padded to its scene length, then concatenated.
  const args = [];
  clips.forEach((c) => args.push('-i', c.file));
  const padded = clips.map((c, i) => `[${i}:a]apad=whole_dur=${c.slotDuration.toFixed(3)},atrim=0:${c.slotDuration.toFixed(3)}[v${i}]`);
  const concat = `${clips.map((_, i) => `[v${i}]`).join('')}concat=n=${clips.length}:v=0:a=1,loudnorm=I=-15:TP=-1.5:LRA=11,aresample=44100[voice]`;
  let graph = `${padded.join(';')};${concat}`;
  if (musicFile) {
    const m = clips.length;
    args.push('-stream_loop', '-1', '-i', musicFile);
    const fadeStart = Math.max(0, totalDuration - 2).toFixed(3);
    graph += `;[${m}:a]atrim=0:${totalDuration.toFixed(3)},asetpts=N/SR/TB,loudnorm=I=-31:TP=-8:LRA=11,aresample=44100,afade=t=out:st=${fadeStart}:d=2[music]`;
    graph += ';[voice][music]amix=inputs=2:duration=first:normalize=0,alimiter=limit=0.95[out]';
  } else {
    graph += ';[voice]anull[out]';
  }
  await ffmpeg([...args, '-filter_complex', graph, '-map', '[out]', '-ac', '2', '-c:a', 'aac', '-b:a', '192k', out]);
}

// ---------- captions ----------
function captionFont(style, size, language) {
  // Noto on Linux servers (installed in the Docker image), Arial Unicode on macOS.
  if (NON_LATIN.has(language)) {
    const noto = language === 'hi' ? '"Noto Sans Devanagari"' : '"Noto Sans CJK SC"';
    return `${size}px ${noto}, "Arial Unicode MS", sans-serif`;
  }
  if (style === 'bold') return `${size}px Anton`;
  if (style === 'minimal') return `${size}px "Poppins SemiBold"`;
  return `${size}px "Poppins ExtraBold"`;
}

const CAPTION_SIZES = { bold: 112, boxed: 86, neon: 90, minimal: 60 };

function layoutChunk(ctx, chunk, style, W, language) {
  const upper = style !== 'minimal' && !NON_LATIN.has(language);
  let size = CAPTION_SIZES[style];
  const maxWidth = W * 0.86;
  const texts = chunk.words.map((w) => (upper ? w.text.toUpperCase() : w.text));
  for (;;) {
    ctx.font = captionFont(style, size, language);
    // Extra room so the enlarged active word (and the highlight box's padding) never touches its neighbours.
    const space = ctx.measureText(' ').width + ({ minimal: 0, boxed: size * 0.4 }[style] ?? size * 0.14);
    const widths = texts.map((t) => ctx.measureText(t).width);
    const lines = [];
    let line = [];
    let lineWidth = 0;
    texts.forEach((t, i) => {
      const add = (line.length ? space : 0) + widths[i];
      if (line.length && lineWidth + add > maxWidth) {
        lines.push({ items: line, width: lineWidth });
        line = [];
        lineWidth = 0;
      }
      line.push({ text: t, width: widths[i], index: i });
      lineWidth += (line.length > 1 ? space : 0) + widths[i];
    });
    if (line.length) lines.push({ items: line, width: lineWidth });
    const tooWide = widths.some((w) => w > maxWidth);
    if ((!tooWide && lines.length <= 2) || size < 40) return { lines, size, space };
    size -= 6;
  }
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function drawCaption(ctx, chunk, layout, t, style, W, H) {
  const { lines, size, space } = layout;
  const appear = clamp01((t - chunk.start) / 0.14);
  const pop = style === 'minimal' ? 1 : 0.82 + 0.18 * easeOutBack(appear);
  const lineHeight = size * (style === 'bold' ? 1.08 : 1.2);
  const centerY = H * 0.7;
  const top = centerY - (lines.length * lineHeight) / 2 + lineHeight / 2;
  const active = chunk.words.findIndex((w) => t >= w.start && t < w.end);

  ctx.save();
  ctx.globalAlpha = style === 'minimal' ? appear : 1;
  ctx.translate(W / 2, centerY);
  ctx.scale(pop, pop);
  ctx.translate(-W / 2, -centerY);
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';
  ctx.lineJoin = 'round';
  ctx.font = captionFont(style, size, layout.language);

  lines.forEach((line, li) => {
    let x = (W - line.width) / 2;
    const y = top + li * lineHeight;
    for (const item of line.items) {
      const isActive = item.index === active && style !== 'minimal';
      ctx.save();
      if (isActive) {
        const s = 1.08;
        ctx.translate(x + item.width / 2, y);
        ctx.scale(s, s);
        ctx.translate(-(x + item.width / 2), -y);
      }
      if (style === 'bold') {
        ctx.shadowColor = 'rgba(0,0,0,0.55)';
        ctx.shadowOffsetY = 6;
        ctx.shadowBlur = 10;
        ctx.lineWidth = size * 0.16;
        ctx.strokeStyle = '#000';
        ctx.strokeText(item.text, x, y);
        ctx.shadowColor = 'transparent';
        ctx.fillStyle = isActive ? '#FFE14D' : '#FFFFFF';
        ctx.fillText(item.text, x, y);
      } else if (style === 'boxed') {
        if (isActive) {
          ctx.fillStyle = '#8B5CF6';
          roundRect(ctx, x - 16, y - size * 0.62, item.width + 32, size * 1.18, 18);
          ctx.fill();
        }
        ctx.lineWidth = size * 0.1;
        ctx.strokeStyle = 'rgba(0,0,0,0.85)';
        if (!isActive) ctx.strokeText(item.text, x, y);
        ctx.fillStyle = '#FFFFFF';
        ctx.fillText(item.text, x, y);
      } else if (style === 'neon') {
        ctx.lineWidth = size * 0.1;
        ctx.strokeStyle = 'rgba(8,8,20,0.9)';
        ctx.strokeText(item.text, x, y);
        if (isActive) {
          ctx.shadowColor = '#22D3EE';
          ctx.shadowBlur = 36;
          ctx.fillStyle = '#A5F3FC';
          ctx.fillText(item.text, x, y);
        }
        ctx.fillStyle = isActive ? '#ECFEFF' : '#FFFFFF';
        ctx.fillText(item.text, x, y);
      } else {
        ctx.shadowColor = 'rgba(0,0,0,0.85)';
        ctx.shadowBlur = 14;
        ctx.shadowOffsetY = 3;
        ctx.fillStyle = '#FFFFFF';
        ctx.fillText(item.text, x, y);
      }
      ctx.restore();
      x += item.width + space;
    }
  });
  ctx.restore();
}

// ---------- video clips ----------
// Streams a clip's frames, scaled and cropped to the output size, one at a
// time (sequential access). Past the end of the clip it holds the last frame.
class ClipReader {
  constructor(file, W, H, fps) {
    this.frameSize = W * H * 4;
    this.chunks = [];
    this.buffered = 0;
    this.ended = false;
    this.index = -1;
    this.last = null;
    this.waiters = [];
    this.proc = spawn(config.ffmpeg, [
      '-hide_banner', '-loglevel', 'error', '-i', file, '-an',
      '-vf', `scale=${W}:${H}:force_original_aspect_ratio=increase:flags=lanczos,crop=${W}:${H},fps=${fps}`,
      '-f', 'rawvideo', '-pix_fmt', 'rgba', 'pipe:1',
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
    const waiters = this.waiters;
    this.waiters = [];
    waiters.forEach((resolve) => resolve());
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
      const frame = await this.readOne();
      if (!frame) break;
      this.last = frame;
      this.index++;
    }
    return this.last;
  }

  close() {
    this.proc.kill('SIGKILL');
  }
}

// ---------- visuals ----------
function kenBurns(i) {
  // Alternate zoom direction and pan so consecutive shots feel different.
  const zoomIn = i % 2 === 0;
  const pans = [[0.6, 0.2], [-0.6, -0.3], [0.2, -0.6], [-0.3, 0.6]];
  const [px, py] = pans[i % pans.length];
  return { z0: zoomIn ? 1.06 : 1.2, z1: zoomIn ? 1.2 : 1.06, px, py };
}

function drawScene(ctx, img, motion, p, W, H) {
  const e = easeInOut(Math.max(-0.2, Math.min(1.2, p)));
  const z = motion.z0 + (motion.z1 - motion.z0) * e;
  const cover = Math.max(W / img.width, H / img.height) * z;
  const dw = img.width * cover;
  const dh = img.height * cover;
  const marginX = (dw - W) / 2;
  const marginY = (dh - H) / 2;
  const x = -marginX + motion.px * marginX * 0.6 * (e - 0.5) * 2;
  const y = -marginY + motion.py * marginY * 0.6 * (e - 0.5) * 2;
  ctx.drawImage(img, x, y, dw, dh);
}

function bottomShade(W, H) {
  const c = createCanvas(W, H);
  const ctx = c.getContext('2d');
  const g = ctx.createLinearGradient(0, H * 0.45, 0, H);
  g.addColorStop(0, 'rgba(0,0,0,0)');
  g.addColorStop(1, 'rgba(0,0,0,0.55)');
  ctx.fillStyle = g;
  ctx.fillRect(0, H * 0.45, W, H * 0.55);
  return c;
}

function drawWatermark(ctx, W, H) {
  ctx.save();
  ctx.font = '34px "Poppins SemiBold"';
  const text = 'Made with BlackCell';
  const w = ctx.measureText(text).width + 44;
  ctx.globalAlpha = 0.85;
  ctx.fillStyle = 'rgba(0,0,0,0.45)';
  roundRect(ctx, W - w - 36, H - 150, w, 60, 30);
  ctx.fill();
  ctx.fillStyle = '#fff';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, W - w - 14, H - 120);
  ctx.restore();
}

/**
 * scenes: [{ image, clip?, start, duration }]
 * chunks: caption chunks from captions.js (absolute times)
 */
export async function renderVideo({ scenes, chunks, captionStyle, language, watermark, audioFile, out, thumbOut, onProgress }) {
  const { width: W, height: H, fps } = config.render;
  const totalDuration = scenes.at(-1).start + scenes.at(-1).duration;
  const totalFrames = Math.ceil(totalDuration * fps);
  const images = await Promise.all(scenes.map((s) => loadImage(fs.readFileSync(s.image))));
  const motions = scenes.map((_, i) => kenBurns(i));
  const shade = bottomShade(W, H);

  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext('2d');
  const layoutCache = new Map();

  // Scenes with an AI clip play its frames; the rest animate their still.
  const readers = new Map();
  const clipCanvas = createCanvas(W, H);
  const clipCtx = clipCanvas.getContext('2d');
  const paintScene = async (i, local) => {
    const scene = scenes[i];
    if (scene.clip) {
      if (!readers.has(i)) readers.set(i, new ClipReader(scene.clip, W, H, fps));
      const frame = await readers.get(i).frame(Math.max(0, Math.round(local * fps)));
      if (frame) {
        clipCtx.putImageData(new ImageData(new Uint8ClampedArray(frame.buffer, frame.byteOffset, frame.length), W, H), 0, 0);
        ctx.drawImage(clipCanvas, 0, 0);
        return;
      }
    }
    drawScene(ctx, images[i], motions[i], local / scene.duration, W, H);
  };
  const closeReadersBefore = (i) => {
    for (const [k, reader] of readers) {
      if (k < i) {
        reader.close();
        readers.delete(k);
      }
    }
  };

  const tmp = `${out}.part.mp4`;
  const proc = spawn(config.ffmpeg, [
    '-hide_banner', '-loglevel', 'error', '-y',
    '-f', 'rawvideo', '-pix_fmt', 'rgba', '-s', `${W}x${H}`, '-r', String(fps), '-i', 'pipe:0',
    '-i', audioFile,
    '-map', '0:v', '-map', '1:a',
    '-c:v', 'libx264', '-preset', config.render.preset, '-crf', config.render.crf, '-pix_fmt', 'yuv420p', '-profile:v', 'high',
    '-c:a', 'copy', '-shortest', '-movflags', '+faststart', tmp,
  ], { stdio: ['pipe', 'ignore', 'pipe'] });
  let stderr = '';
  proc.stderr.on('data', (d) => (stderr += d));
  const exited = new Promise((resolve, reject) => {
    proc.on('error', reject);
    proc.on('close', (code) => (code === 0 ? resolve() : reject(new Error(`ffmpeg encode failed (${code}): ${stderr.slice(-400)}`))));
  });
  // If ffmpeg dies mid-stream, writes would throw EPIPE; surface the real error instead.
  proc.stdin.on('error', () => {});

  let sceneIdx = 0;
  let chunkIdx = 0;
  const thumbFrame = Math.min(totalFrames - 1, Math.round(fps * 1.2));
  try {
    for (let f = 0; f < totalFrames; f++) {
      const t = f / fps;
      while (sceneIdx < scenes.length - 1 && t >= scenes[sceneIdx + 1].start) sceneIdx++;
      const s = scenes[sceneIdx];
      const local = t - s.start;

      closeReadersBefore(sceneIdx);
      ctx.globalAlpha = 1;
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, W, H);
      await paintScene(sceneIdx, local);

      const next = scenes[sceneIdx + 1];
      const fadeStart = s.duration - XFADE;
      if (next && local > fadeStart) {
        ctx.globalAlpha = easeInOut(clamp01((local - fadeStart) / XFADE));
        await paintScene(sceneIdx + 1, t - next.start);
        ctx.globalAlpha = 1;
      }
      // Fade in from black at the very start and out at the very end.
      const edge = Math.min(t / 0.3, (totalDuration - t) / 0.5);
      if (edge < 1) {
        ctx.fillStyle = `rgba(0,0,0,${1 - clamp01(edge)})`;
        ctx.fillRect(0, 0, W, H);
      }

      if (captionStyle !== 'none') {
        ctx.drawImage(shade, 0, 0);
        while (chunkIdx < chunks.length - 1 && t >= chunks[chunkIdx].end) chunkIdx++;
        const chunk = chunks[chunkIdx];
        if (chunk && t >= chunk.start && t < chunk.end) {
          let layout = layoutCache.get(chunkIdx);
          if (!layout) {
            layout = { ...layoutChunk(ctx, chunk, captionStyle, W, language), language };
            layoutCache.set(chunkIdx, layout);
          }
          drawCaption(ctx, chunk, layout, t, captionStyle, W, H);
        }
      }
      if (watermark) drawWatermark(ctx, W, H);

      if (f === thumbFrame && thumbOut) {
        const thumb = createCanvas(W / 2, H / 2);
        thumb.getContext('2d').drawImage(canvas, 0, 0, W / 2, H / 2);
        fs.writeFileSync(thumbOut, await thumb.encode('jpeg', 82));
      }

      if (!proc.stdin.write(canvas.data())) {
        await Promise.race([new Promise((r) => proc.stdin.once('drain', r)), exited]);
      }
      if (f % fps === 0) onProgress?.(f / totalFrames);
    }
    proc.stdin.end();
    await exited;
  } catch (err) {
    proc.kill('SIGKILL');
    fs.rmSync(tmp, { force: true });
    throw err;
  } finally {
    closeReadersBefore(Infinity);
  }
  fs.renameSync(tmp, out);
  return { duration: totalDuration, frames: totalFrames };
}
