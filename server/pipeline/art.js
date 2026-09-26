// Procedural scene art: stylised illustrated backdrops (skies, silhouettes,
// light, particles) drawn with Skia. Used when no image-model key is set, and
// as a fallback when an image request fails. Keywords in the scene's visual
// prompt steer the motif and time of day so images loosely follow the story.
import { createCanvas } from '@napi-rs/canvas';

function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const hashString = (str) => {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) h = Math.imul(h ^ str.charCodeAt(i), 16777619);
  return h >>> 0;
};

// ---- colour helpers ----
const hex = (h) => {
  const n = parseInt(h.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
const rgb = ([r, g, b], a = 1) => `rgba(${r | 0},${g | 0},${b | 0},${a})`;
const mix = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);
const shade = (c, f) => c.map((v) => Math.max(0, Math.min(255, v * f)));

// Word lists rather than \b regexes so accented words like "café" match.
const words = (list) => new RegExp(`(^|[^\\p{L}])(${list})(?![\\p{L}])`, 'iu');
const MOTIF_KEYWORDS = [
  ['space', words('space|star|stars|planet|galaxy|nebula|cosmic|supernova|pulsar|orbit|venus|milky way|universe')],
  ['ocean', words('ocean|sea|reef|beach|shore|wave|waves|underwater|coast|harbour|harbor|ship')],
  ['forest', words('forest|woods|trees|jungle|pine|bush')],
  ['desert', words('desert|dune|dunes|sand|egypt|pyramid|valley|outback|wheat|field|farm')],
  ['ruins', words('ruin|ruins|temple|column|columns|ancient|marble|olympus|roman|greek|forum|tomb|statue|courtyard|arena')],
  ['mountains', words('mountain|mountains|cliff|peak|hill|summit|ridge')],
  ['city', words('city|street|streets|skyline|hotel|building|office|café|cafe|school|classroom|academy|corridor|lobby|room|garage|courtroom|vault|stage|hallway|window')],
];

function pickMotif(visual, fallbackMotifs, rand) {
  for (const [motif, re] of MOTIF_KEYWORDS) if (re.test(visual)) return motif;
  return fallbackMotifs[Math.floor(rand() * fallbackMotifs.length)] || 'mountains';
}

function pickTime(visual) {
  if (words('night|midnight|dark|moon|shadow|shadows|candlelight|torchlight|neon').test(visual)) return 'night';
  if (words('sunset|sunrise|dawn|dusk|golden').test(visual)) return 'golden';
  return 'default';
}

// ---- layers ----
function sky(ctx, W, H, colors) {
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, rgb(colors[0]));
  g.addColorStop(0.55, rgb(colors[1]));
  g.addColorStop(1, rgb(colors[2]));
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
}

function glowOrb(ctx, x, y, r, color, intensity = 1) {
  const g = ctx.createRadialGradient(x, y, 0, x, y, r * 5);
  g.addColorStop(0, rgb(color, 0.55 * intensity));
  g.addColorStop(0.2, rgb(color, 0.18 * intensity));
  g.addColorStop(1, rgb(color, 0));
  ctx.fillStyle = g;
  ctx.fillRect(x - r * 5, y - r * 5, r * 10, r * 10);
  ctx.fillStyle = rgb(mix(color, [255, 255, 255], 0.5));
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
}

function stars(ctx, W, H, rand, count, maxY) {
  for (let i = 0; i < count; i++) {
    const x = rand() * W;
    const y = rand() * maxY;
    const r = rand() * 2.2 + 0.4;
    ctx.fillStyle = `rgba(255,255,255,${0.3 + rand() * 0.7})`;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
}

function clouds(ctx, W, H, rand, color, alpha, band = [0.1, 0.6]) {
  for (let i = 0; i < 9; i++) {
    const x = rand() * W;
    const y = H * (band[0] + rand() * (band[1] - band[0]));
    const rx = 200 + rand() * 420;
    const g = ctx.createRadialGradient(x, y, 0, x, y, rx);
    g.addColorStop(0, rgb(color, alpha));
    g.addColorStop(1, rgb(color, 0));
    ctx.fillStyle = g;
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(1, 0.35);
    ctx.translate(-x, -y);
    ctx.fillRect(x - rx, y - rx, rx * 2, rx * 2);
    ctx.restore();
  }
}

// Smooth ridge line built from a few random sines.
function ridge(rand, base, amp, jagged) {
  const waves = Array.from({ length: 5 }, (_, i) => ({ f: (i + 1) * (0.6 + rand()) * 0.004, p: rand() * 10, a: amp / (i + 1) }));
  return (x) => {
    let y = base;
    for (const w of waves) y -= (jagged ? Math.abs(Math.sin(x * w.f + w.p)) : Math.sin(x * w.f + w.p) * 0.5 + 0.5) * w.a;
    return y;
  };
}

function fillRidge(ctx, W, H, fn, color) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(0, H);
  for (let x = 0; x <= W; x += 8) ctx.lineTo(x, fn(x));
  ctx.lineTo(W, H);
  ctx.closePath();
  ctx.fill();
}

function layerColors(land, skyBottom, layers) {
  // Far layers fade toward the horizon colour (atmospheric perspective).
  return Array.from({ length: layers }, (_, i) => mix(skyBottom, land, (i + 1) / layers));
}

const MOTIFS = {
  mountains(ctx, W, H, rand, p) {
    const cols = layerColors(p.land, p.sky[2], 4);
    cols.forEach((c, i) => fillRidge(ctx, W, H, ridge(rand, H * (0.5 + i * 0.1), 260 - i * 40, true), rgb(c)));
  },
  forest(ctx, W, H, rand, p) {
    const cols = layerColors(p.land, p.sky[2], 4);
    cols.forEach((c, i) => {
      const hill = ridge(rand, H * (0.62 + i * 0.09), 80, false);
      fillRidge(ctx, W, H, hill, rgb(c));
      ctx.fillStyle = rgb(c);
      const size = 70 + i * 55;
      for (let x = -size; x < W + size; x += size * (0.45 + rand() * 0.4)) {
        const h = size * (2.2 + rand() * 1.4);
        const baseY = hill(x) + 10;
        ctx.beginPath();
        ctx.moveTo(x, baseY - h);
        ctx.lineTo(x - size * 0.55, baseY);
        ctx.lineTo(x + size * 0.55, baseY);
        ctx.closePath();
        ctx.fill();
      }
    });
  },
  city(ctx, W, H, rand, p, night) {
    const cols = layerColors(p.land, p.sky[2], 3);
    cols.forEach((c, i) => {
      const ground = H * (0.72 + i * 0.1);
      let x = -20;
      while (x < W) {
        const bw = 70 + rand() * (110 + i * 60);
        const bh = 180 + rand() * (560 - i * 90);
        ctx.fillStyle = rgb(c);
        ctx.fillRect(x, ground - bh, bw, H - ground + bh);
        if (rand() > 0.6) ctx.fillRect(x + bw * 0.4, ground - bh - 60, 6, 60); // antenna
        if (night || i === 0) {
          for (let wy = ground - bh + 22; wy < ground - 20; wy += 34) {
            for (let wx = x + 12; wx < x + bw - 16; wx += 26) {
              if (rand() > (night ? 0.55 : 0.85)) {
                ctx.fillStyle = rgb(p.accent, (night ? 0.75 : 0.35) * (1 - i * 0.25));
                ctx.fillRect(wx, wy, 12, 16);
              }
            }
          }
        }
        x += bw + 4 + rand() * 18;
      }
    });
  },
  desert(ctx, W, H, rand, p) {
    const cols = layerColors(mix(p.land, [194, 150, 90], 0.35), p.sky[2], 4);
    if (rand() > 0.4) {
      const px = W * (0.2 + rand() * 0.6);
      const ph = 300 + rand() * 200;
      const py = H * 0.62;
      ctx.fillStyle = rgb(cols[0]);
      ctx.beginPath();
      ctx.moveTo(px, py - ph);
      ctx.lineTo(px - ph * 0.9, py + 20);
      ctx.lineTo(px + ph * 0.9, py + 20);
      ctx.fill();
    }
    cols.forEach((c, i) => fillRidge(ctx, W, H, ridge(rand, H * (0.62 + i * 0.09), 120, false), rgb(c)));
  },
  ocean(ctx, W, H, rand, p) {
    const horizon = H * 0.58;
    const water = ctx.createLinearGradient(0, horizon, 0, H);
    const sea = mix(p.land, [20, 80, 150], 0.6);
    water.addColorStop(0, rgb(mix(p.sky[2], sea, 0.4)));
    water.addColorStop(1, rgb(shade(sea, 0.55)));
    ctx.fillStyle = water;
    ctx.fillRect(0, horizon, W, H - horizon);
    // light path on the water
    const lx = W * 0.5;
    for (let y = horizon; y < H; y += 10) {
      const t = (y - horizon) / (H - horizon);
      const w = 30 + t * 380 * (0.5 + rand() * 0.5);
      ctx.fillStyle = rgb(p.accent, 0.18 * (1 - t) + rand() * 0.05);
      ctx.fillRect(lx - w / 2 + (rand() - 0.5) * 60, y, w, 3);
    }
    fillRidge(ctx, W, H, ridge(rand, horizon + 4, 60, true), rgb(mix(p.sky[2], p.land, 0.6), 0.8));
    ctx.strokeStyle = rgb(p.accent, 0.12);
    ctx.lineWidth = 2;
    for (let i = 0; i < 40; i++) {
      const y = horizon + 40 + rand() * (H - horizon);
      const x = rand() * W;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.quadraticCurveTo(x + 30, y - 8, x + 60 + rand() * 60, y);
      ctx.stroke();
    }
  },
  ruins(ctx, W, H, rand, p) {
    const cols = layerColors(p.land, p.sky[2], 3);
    fillRidge(ctx, W, H, ridge(rand, H * 0.7, 90, false), rgb(cols[0]));
    const ground = H * 0.8;
    ctx.fillStyle = rgb(cols[1]);
    const n = 5 + Math.floor(rand() * 4);
    const spacing = W / n;
    for (let i = 0; i < n; i++) {
      const cx = spacing * (i + 0.5) + (rand() - 0.5) * 30;
      const ch = 380 + rand() * 420;
      const broken = rand() > 0.55;
      const h = broken ? ch * (0.35 + rand() * 0.4) : ch;
      ctx.fillRect(cx - 34, ground - h, 68, h);
      ctx.fillRect(cx - 48, ground - h - 26, 96, 26); // capital
      if (!broken && i < n - 1 && rand() > 0.5) ctx.fillRect(cx - 48, ground - ch - 60, spacing + 10, 36); // lintel
    }
    fillRidge(ctx, W, H, ridge(rand, H * 0.84, 40, false), rgb(cols[2]));
  },
  space(ctx, W, H, rand, p) {
    // nebula clouds
    for (let i = 0; i < 6; i++) {
      const x = rand() * W;
      const y = rand() * H;
      const r = 300 + rand() * 500;
      const c = i % 2 ? p.accent : p.sky[1];
      const g = ctx.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, rgb(c, 0.22));
      g.addColorStop(1, rgb(c, 0));
      ctx.fillStyle = g;
      ctx.fillRect(x - r, y - r, r * 2, r * 2);
    }
    stars(ctx, W, H, rand, 500, H);
    // a planet
    const px = W * (0.2 + rand() * 0.6);
    const py = H * (0.55 + rand() * 0.25);
    const pr = 220 + rand() * 260;
    const pg = ctx.createRadialGradient(px - pr * 0.4, py - pr * 0.4, pr * 0.1, px, py, pr);
    pg.addColorStop(0, rgb(mix(p.accent, [255, 255, 255], 0.3)));
    pg.addColorStop(0.6, rgb(p.sky[1]));
    pg.addColorStop(1, rgb(shade(p.sky[0], 0.6)));
    ctx.fillStyle = pg;
    ctx.beginPath();
    ctx.arc(px, py, pr, 0, Math.PI * 2);
    ctx.fill();
    if (rand() > 0.4) {
      ctx.strokeStyle = rgb(p.accent, 0.5);
      ctx.lineWidth = 10;
      ctx.beginPath();
      ctx.ellipse(px, py, pr * 1.7, pr * 0.35, -0.3, 0, Math.PI * 2);
      ctx.stroke();
    }
  },
};

function particles(ctx, W, H, rand, color, count) {
  for (let i = 0; i < count; i++) {
    const r = rand() * 5 + 1;
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, r * 3);
    g.addColorStop(0, rgb(color, 0.5 * rand() + 0.2));
    g.addColorStop(1, rgb(color, 0));
    ctx.save();
    ctx.translate(rand() * W, rand() * H);
    ctx.fillStyle = g;
    ctx.fillRect(-r * 3, -r * 3, r * 6, r * 6);
    ctx.restore();
  }
}

function vignette(ctx, W, H, strength) {
  const g = ctx.createRadialGradient(W / 2, H / 2, H * 0.25, W / 2, H / 2, H * 0.75);
  g.addColorStop(0, 'rgba(0,0,0,0)');
  g.addColorStop(1, `rgba(0,0,0,${strength})`);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
}

function grain(ctx, W, H, rand, amount) {
  const img = ctx.getImageData(0, 0, W, H);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const n = (rand() - 0.5) * amount;
    d[i] += n;
    d[i + 1] += n;
    d[i + 2] += n;
  }
  ctx.putImageData(img, 0, 0);
}

function halftone(ctx, W, H, color) {
  ctx.fillStyle = rgb(color, 0.14);
  for (let y = 0; y < H; y += 14) {
    for (let x = (y / 14) % 2 ? 7 : 0; x < W; x += 14) {
      const r = 2 + 3 * (y / H);
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

export function drawSceneArt({ width, height, style, motifs, visual = '', seed }) {
  const rand = rng(seed);
  const pixel = style.id === 'pixel';
  const scale = pixel ? 1 / 8 : 1;
  const W = Math.round(width * scale);
  const H = Math.round(height * scale);
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext('2d');
  if (scale !== 1) ctx.scale(scale, scale);
  const w = width;
  const h = height;

  const time = pickTime(visual);
  const base = {
    sky: style.palette.sky.map(hex),
    land: hex(style.palette.land),
    accent: hex(style.palette.accent),
  };
  // Nudge the palette per scene so consecutive images don't look identical.
  const hueJitter = 0.85 + rand() * 0.3;
  const p = {
    ...base,
    sky: base.sky.map((c, i) => {
      let col = shade(c, hueJitter);
      if (time === 'night') col = shade(mix(col, [10, 14, 40], 0.55), 0.7);
      if (time === 'golden' && i > 0) col = mix(col, [255, 170, 90], 0.35);
      return col;
    }),
  };
  const night = time === 'night' || (p.sky[0][0] + p.sky[0][1] + p.sky[0][2]) / 3 < 50;
  const motif = pickMotif(visual, motifs, rand);

  sky(ctx, w, h, p.sky);
  if (motif !== 'space') {
    if (night) stars(ctx, w, h, rand, 220, h * 0.55);
    const orbColor = night ? [235, 240, 255] : p.accent;
    glowOrb(ctx, w * (0.2 + rand() * 0.6), h * (0.14 + rand() * 0.22), night ? 70 : 110, orbColor, night ? 0.8 : 1);
    clouds(ctx, w, h, rand, night ? [120, 130, 170] : [255, 255, 255], night ? 0.12 : 0.22);
  }
  MOTIFS[motif](ctx, w, h, rand, p, night);
  if (motif !== 'space') clouds(ctx, w, h, rand, mix(p.sky[2], [255, 255, 255], 0.3), 0.12, [0.6, 0.9]); // ground fog
  particles(ctx, w, h, rand, p.accent, style.id === 'dark-fantasy' || night ? 60 : 25);

  if (style.id === 'comic') halftone(ctx, w, h, [0, 0, 0]);
  if (style.id === 'vintage') {
    ctx.fillStyle = 'rgba(112,66,20,0.22)';
    ctx.fillRect(0, 0, w, h);
  }
  vignette(ctx, w, h, style.id === 'watercolor' || style.id === '3d-cartoon' ? 0.25 : 0.6);
  if (['vintage', 'oil-painting', 'dark-fantasy', 'cinematic'].includes(style.id)) grain(ctx, W, H, rand, style.id === 'vintage' ? 40 : 18);

  if (!pixel) return canvas;
  // Pixel art: upscale the tiny render with nearest-neighbour sampling.
  const out = createCanvas(width, height);
  const octx = out.getContext('2d');
  octx.imageSmoothingEnabled = false;
  octx.drawImage(canvas, 0, 0, width, height);
  return out;
}
