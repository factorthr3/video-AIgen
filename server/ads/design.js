// The ad design system: output formats (with each platform's safe zones) and
// the visual styles. Everything is laid out in fractions of the frame so one
// storyboard renders cleanly in every aspect ratio.
import path from 'node:path';
import { createRequire } from 'node:module';
import { GlobalFonts } from '@napi-rs/canvas';
import { FONTS_DIR } from '../config.js';

// ---------- formats ----------
// Safe zones keep text clear of each platform's own buttons and captions
// (TikTok/Reels put UI along the bottom and right edge of vertical video).
export const FORMATS = {
  '9:16': { id: '9:16', w: 1080, h: 1920, name: 'Vertical 9:16', platforms: ['TikTok', 'Instagram Reels', 'YouTube Shorts', 'Stories'], safe: { top: 0.13, bottom: 0.22, left: 0.07, right: 0.14 } },
  '4:5': { id: '4:5', w: 1080, h: 1350, name: 'Portrait 4:5', platforms: ['Instagram feed', 'Facebook feed'], safe: { top: 0.07, bottom: 0.08, left: 0.07, right: 0.07 } },
  '1:1': { id: '1:1', w: 1080, h: 1080, name: 'Square 1:1', platforms: ['Instagram', 'Facebook', 'LinkedIn', 'X'], safe: { top: 0.07, bottom: 0.08, left: 0.07, right: 0.07 } },
  '16:9': { id: '16:9', w: 1920, h: 1080, name: 'Landscape 16:9', platforms: ['YouTube', 'LinkedIn', 'X', 'Facebook'], safe: { top: 0.08, bottom: 0.1, left: 0.06, right: 0.06 } },
};
export const FORMAT_IDS = Object.keys(FORMATS);
export const LENGTHS = [6, 15, 30];

// ---------- fonts (SIL Open Font License, bundled via @fontsource) ----------
const require = createRequire(import.meta.url);
const fontsource = (pkg, file) => path.join(path.dirname(require.resolve(`@fontsource/${pkg}/package.json`)), 'files', file);
const FONT_FILES = [
  ['Montserrat', fontsource('montserrat', 'montserrat-latin-600-normal.woff2')],
  ['Montserrat Bold', fontsource('montserrat', 'montserrat-latin-800-normal.woff2')],
  ['Inter', fontsource('inter', 'inter-latin-500-normal.woff2')],
  ['Inter Bold', fontsource('inter', 'inter-latin-700-normal.woff2')],
  ['Playfair Display', fontsource('playfair-display', 'playfair-display-latin-600-normal.woff2')],
  ['Playfair Display Bold', fontsource('playfair-display', 'playfair-display-latin-700-normal.woff2')],
  ['Bebas Neue', fontsource('bebas-neue', 'bebas-neue-latin-400-normal.woff2')],
  ['Anton', path.join(FONTS_DIR, 'Anton-Regular.ttf')],
];
for (const [family, file] of FONT_FILES) GlobalFonts.registerFromPath(file, family);

// Fonts a brand can choose for its headlines; body text pairs with each.
export const BRAND_FONTS = [
  { id: 'montserrat', name: 'Montserrat', description: 'Modern and confident', heading: 'Montserrat Bold', body: 'Montserrat' },
  { id: 'inter', name: 'Inter', description: 'Clean and neutral', heading: 'Inter Bold', body: 'Inter' },
  { id: 'playfair', name: 'Playfair Display', description: 'Elegant serif', heading: 'Playfair Display Bold', body: 'Inter' },
  { id: 'bebas', name: 'Bebas Neue', description: 'Tall and punchy', heading: 'Bebas Neue', body: 'Inter' },
];
export const BRAND_FONT = Object.fromEntries(BRAND_FONTS.map((f) => [f.id, f]));

// ---------- styles ----------
// Each style sets type, text placement, motion and transitions. `font: null`
// means the brand's own font.
export const STYLES = [
  {
    id: 'clean', name: 'Clean', description: 'Calm, modern and premium. Soft fades, text in the lower third.',
    font: null, uppercase: false, align: 'left', anchor: 'bottom', scrim: 'bottom', textBox: false,
    transition: 'dissolve', push: 0.06, headlineScale: 1, logo: 'corner',
  },
  {
    id: 'bold', name: 'Bold', description: 'Big centred type on colour blocks, quick punchy cuts.',
    font: 'montserrat', uppercase: true, align: 'center', anchor: 'center', scrim: 'full', textBox: true,
    transition: 'punch', push: 0.1, headlineScale: 1.15, logo: 'corner',
  },
  {
    id: 'luxury', name: 'Luxury', description: 'Elegant serif type, slow pushes and long fades.',
    font: 'playfair', uppercase: false, align: 'center', anchor: 'center', scrim: 'vignette', textBox: false,
    transition: 'fade', push: 0.05, headlineScale: 1, logo: 'end', tracking: 0.02,
  },
  {
    id: 'promo', name: 'Promo', description: 'Offer-led with a price badge, energetic for sales and launches.',
    font: 'bebas', uppercase: true, align: 'center', anchor: 'bottom', scrim: 'bottom', textBox: false,
    transition: 'slide', push: 0.09, headlineScale: 1.3, logo: 'corner', badge: true,
  },
];
export const STYLE = Object.fromEntries(STYLES.map((s) => [s.id, s]));

// ---------- colour helpers ----------
export function hexToRgb(hex) {
  const m = String(hex || '').replace('#', '').match(/^([0-9a-f]{6})$/i);
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
export const rgbToHex = ([r, g, b]) => `#${[r, g, b].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')}`;
// Relative luminance (WCAG), 0 = black, 1 = white.
export function luminance(hex) {
  const rgb = hexToRgb(hex) || [0, 0, 0];
  const [r, g, b] = rgb.map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
/** Black or white, whichever reads better on `hex`. */
export const textOn = (hex) => (luminance(hex) > 0.45 ? '#0b0b10' : '#ffffff');

/** A brand's palette with safe defaults: primary (brand colour), accent (buttons), dark and light. */
export function palette(colors = []) {
  const valid = colors.filter((c) => hexToRgb(c));
  const primary = valid[0] || '#7c3aed';
  const accent = valid[1] || primary;
  return { primary, accent, dark: '#0b0b10', light: '#ffffff' };
}
