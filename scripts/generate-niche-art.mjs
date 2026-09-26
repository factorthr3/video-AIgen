// Generates the landing-page niche card images (web/public/niches/<id>.jpg)
// with OpenAI image generation, one per niche, in that niche's default art style.
//
//   node scripts/generate-niche-art.mjs            # only niches without an image
//   node scripts/generate-niche-art.mjs --all      # regenerate everything
//   node scripts/generate-niche-art.mjs history    # just these niches
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createCanvas, loadImage } from '@napi-rs/canvas';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
if (fs.existsSync(path.join(root, '.env'))) process.loadEnvFile(path.join(root, '.env'));
const { NICHES, ART } = await import('../server/catalog.js');

const KEY = process.env.OPENAI_API_KEY;
if (!KEY) throw new Error('OPENAI_API_KEY is not set');
const MODEL = process.env.NICHE_ART_MODEL || 'gpt-image-2.5-flare';
const OUT = path.join(root, 'web/public/niches');
fs.mkdirSync(OUT, { recursive: true });

// What each card shows: the niche's signature story, not a generic scene.
const SUBJECTS = {
  'animal-tales': 'a tiny penguin chick in a red knitted scarf flapping its little wings on an iceberg at golden hour, determined and hopeful expression',
  'animal-facts': 'an octopus gliding over a vibrant coral reef, tentacles flowing, shafts of sunlight through blue water',
  'pet-pov': 'a fluffy orange cat crouched low, staring with comically intense focus at a small red laser dot on a living room rug',
  bedtime: 'a small glowing star with a sleepy smile peeking over a quiet moonlit village with warm lit windows and rolling hills',
  fables: 'a determined tortoise crossing a finish line in a meadow while a hare naps under a tree in the background',
  dinosaurs: 'a Tyrannosaurus rex roaring in a misty prehistoric forest as a fiery meteor streaks across the sky',
  scary: 'a long dark hotel corridor at night, one door slightly open with eerie cold light spilling out, flickering wall lamps, ominous mood',
  history: 'a flock of emus charging across a golden Australian wheat field in 1932 while bewildered soldiers with an old machine gun look on',
  mythology: 'Pandora lifting the lid of an ornate ancient Greek jar as glowing shadowy spirits swirl out into a stormy sky',
  'fun-facts': 'a playful octopus balancing a honey jar, a banana and a tiny glowing planet on its tentacles, surrounded by sparkles',
  motivation: 'a marble statue of a Roman emperor on a cliff edge at sunrise above a sea of clouds, dramatic rays of light',
  heists: 'a massive circular bank vault door swinging open in an underground vault, glittering diamonds on black velvet',
  space: 'a blazing neutron star spinning with two brilliant pulsar beams sweeping across a colourful nebula',
  bible: 'a young shepherd with a sling facing a towering armoured giant across a rocky valley at dawn',
  kindness: 'an elderly man handing a steaming cup of coffee to a tired young nurse in a cosy café at sunrise',
  anime: 'a lone student standing firm in a stone arena as a colossal shadow monster looms, cherry blossom petals swirling in the wind',
  drama: 'two teenage students at a school science fair, one holding a first-place ribbon with a satisfied smile while the other looks shocked',
};

const args = process.argv.slice(2);
const all = args.includes('--all');
const only = args.filter((a) => !a.startsWith('--'));
const todo = NICHES.filter((n) => (only.length ? only.includes(n.id) : all || !fs.existsSync(path.join(OUT, `${n.id}.jpg`))));

async function generate(niche) {
  const style = ART[niche.art];
  const subject = SUBJECTS[niche.id] || `${niche.name}: ${niche.tagline}`;
  const prompt = `${subject}. ${style.prompt}. Vertical composition with the subject in the upper two thirds, no text, no letters, no captions, no watermark, no logos.`;
  let res;
  let body;
  for (let attempt = 0; ; attempt++) {
    res = await fetch('https://api.openai.com/v1/images/generations', {
      method: 'POST',
      headers: { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: MODEL, prompt, size: '1024x1536', quality: 'medium', n: 1 }),
    });
    body = await res.json();
    if (res.status !== 429 || attempt >= 8) break;
    // Rate limited (new accounts: ~5 images/min): wait as long as OpenAI asks.
    const hinted = Number((body.error?.message || '').match(/try again in ([\d.]+)s/i)?.[1]);
    await new Promise((r) => setTimeout(r, ((Number.isFinite(hinted) ? hinted : 13) + 2) * 1000));
  }
  if (!res.ok) throw new Error(`${niche.id}: ${res.status} ${body.error?.message}`);
  // Cards display at ~224x320, so 448x672 (2x) JPEG keeps them sharp and light.
  const img = await loadImage(Buffer.from(body.data[0].b64_json, 'base64'));
  const canvas = createCanvas(448, 672);
  canvas.getContext('2d').drawImage(img, 0, 0, 448, 672);
  fs.writeFileSync(path.join(OUT, `${niche.id}.jpg`), await canvas.encode('jpeg', 82));
  console.log(`✓ ${niche.id}`);
}

console.log(`Generating ${todo.length} niche image(s) with ${MODEL}…`);
const queue = [...todo];
const failures = [];
await Promise.all(Array.from({ length: 2 }, async () => {
  while (queue.length) {
    const n = queue.shift();
    await generate(n).catch((err) => failures.push(err.message));
  }
}));
if (failures.length) {
  console.error(`${failures.length} failed:\n  ${failures.join('\n  ')}`);
  process.exit(1);
}
