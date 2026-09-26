// Royalty-free background beds synthesised with ffmpeg's aevalsrc, so every
// install has music without licensing or downloads. Generated once, then cached.
import fs from 'node:fs';
import path from 'node:path';
import { CACHE_DIR, UPLOAD_DIR } from '../config.js';
import { ffmpeg } from './ffmpeg.js';

const LENGTH = 180; // seconds; longer than the longest video

const sin = (f, amp = 1, phase = '') => `${amp}*sin(2*PI*${f}*t${phase})`;

// f(t) that steps through `values` every `step` seconds.
const stepped = (values, step) =>
  values.map((v, i) => `${v}*eq(mod(floor(t/${step}),${values.length}),${i})`).join('+');

function arpeggio() {
  const chords = [
    [523.25, 659.25, 783.99, 1046.5], // C
    [440.0, 523.25, 659.25, 880.0], // Am
    [349.23, 440.0, 523.25, 698.46], // F
    [392.0, 493.88, 587.33, 783.99], // G
  ];
  const note = 0.2;
  const bar = note * 8;
  const freq = chords
    .map((notes, c) =>
      notes
        .map((f, n) => `${f}*eq(mod(floor(t/${bar}),4),${c})*eq(mod(floor(t/${note}),4),${n})`)
        .join('+'))
    .join('+');
  const root = stepped(chords.map((c) => (c[0] / 4).toFixed(2)), bar);
  return `0.16*sin(2*PI*(${freq})*t)*exp(-9*mod(t,${note}))+0.10*sin(2*PI*(${root})*t)`;
}

const RECIPES = {
  'dark-ambient': {
    expr: [
      `${sin(55, 0.22)}*(0.65+0.35*sin(2*PI*0.07*t))`,
      sin(82.41, 0.14, '+0.8*sin(2*PI*0.13*t)'),
      `${sin(110.3, 0.08)}*(0.5+0.5*sin(2*PI*0.05*t))`,
      `${sin(164.8, 0.05)}*(0.5+0.5*sin(2*PI*0.031*t))`,
    ].join('+'),
    post: 'lowpass=f=900,aecho=0.8:0.7:120|300:0.3|0.2',
  },
  'calm-pad': {
    // Crossfade smoothly between Cmaj7 and Am7 every 8 seconds.
    expr: (() => {
      const a = [130.81, 196.0, 246.94, 329.63].map((f) => sin(f, 0.07)).join('+');
      const b = [110.0, 164.81, 196.0, 261.63].map((f) => sin(f, 0.07)).join('+');
      const w = '(0.5+0.5*cos(2*PI*t/16))';
      return `((${a})*${w}+(${b})*(1-${w}))*(0.85+0.15*sin(2*PI*0.2*t))`;
    })(),
    post: 'lowpass=f=1500,aecho=0.8:0.6:180|420:0.35|0.25',
  },
  'epic-pulse': {
    expr: (() => {
      const f = `(${stepped([73.42, 58.27, 87.31, 65.41], 4)})`;
      return [
        `0.32*sin(2*PI*${f}*t)*exp(-5*mod(t,0.25))`,
        `0.10*sin(2*PI*2*${f}*t)*exp(-8*mod(t,0.25))`,
        `0.30*sin(2*PI*50*t)*exp(-4*mod(t,2))`,
        `0.05*sin(2*PI*4*${f}*t)`,
      ].join('+');
    })(),
    post: 'lowpass=f=2200,aecho=0.8:0.5:90:0.2',
  },
  'bright-pluck': {
    expr: arpeggio(),
    post: 'lowpass=f=5000,aecho=0.8:0.5:150:0.25',
  },
};

export async function musicTrack(trackId) {
  if (!trackId || trackId === 'none') return null;
  if (trackId.startsWith('upload:')) {
    const file = path.join(UPLOAD_DIR, path.basename(trackId.slice('upload:'.length)));
    return fs.existsSync(file) ? file : null;
  }
  const recipe = RECIPES[trackId];
  if (!recipe) return null;
  const out = path.join(CACHE_DIR, `music-${trackId}.m4a`);
  if (fs.existsSync(out)) return out;
  const tmp = `${out}.tmp.m4a`;
  await ffmpeg([
    '-f', 'lavfi', '-i', `aevalsrc='${recipe.expr}':s=44100:d=${LENGTH}`,
    '-af', `${recipe.post},afade=t=in:d=2,volume=1.6`,
    '-ac', '2', '-c:a', 'aac', '-b:a', '160k', tmp,
  ]);
  fs.renameSync(tmp, out);
  return out;
}

export const MUSIC_IDS = Object.keys(RECIPES);
