import { spawn } from 'node:child_process';
import { config } from '../config.js';

export function run(cmd, args, { input } = {}) {
  return new Promise((resolve, reject) => {
    const proc = spawn(cmd, args, { stdio: ['pipe', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    proc.stdout.on('data', (d) => (stdout += d));
    proc.stderr.on('data', (d) => (stderr += d));
    proc.on('error', reject);
    proc.on('close', (code) => {
      if (code === 0) resolve(stdout);
      else reject(new Error(`${cmd} exited ${code}: ${stderr.trim().split('\n').slice(-4).join(' | ')}`));
    });
    if (input) proc.stdin.end(input);
    else proc.stdin.end();
  });
}

export const ffmpeg = (args) => run(config.ffmpeg, ['-hide_banner', '-loglevel', 'error', '-y', ...args]);

export async function probeDuration(file) {
  const out = await run(config.ffprobe, ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=nw=1:nk=1', file]);
  const d = parseFloat(out);
  if (!Number.isFinite(d)) throw new Error(`Could not read duration of ${file}`);
  return d;
}

// Normalise any audio file to 44.1kHz mono WAV, which makes concatenation trivial.
export const toWav = (input, output) => ffmpeg(['-i', input, '-ac', '1', '-ar', '44100', '-c:a', 'pcm_s16le', output]);

export const silenceWav = (seconds, output) =>
  ffmpeg(['-f', 'lavfi', '-i', `anullsrc=r=44100:cl=mono`, '-t', seconds.toFixed(3), '-c:a', 'pcm_s16le', output]);
