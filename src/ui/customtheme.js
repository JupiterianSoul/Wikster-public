import { DEFAULT_THEME, THEMES } from './themes.js';
import { RARITIES, SPECIAL } from '../data/rarities.js';

export const CUSTOM_THEME = 'custom';

export const PALETTE_TOKENS = [
  'bg', 'ink', 'ink-dim', 'ink-faint', 'surface', 'surface-2', 'surface-solid', 'line', 'line-strong',
  'accent', 'accent-2', 'accent-ink', 'positive', 'negative', 'warning'
];

export const ALPHA_TOKENS = ['surface', 'surface-2', 'line', 'line-strong'];

export const PALETTE_GROUPS = [
  ['background', ['bg', 'surface', 'surface-2', 'surface-solid']],
  ['text', ['ink', 'ink-dim', 'ink-faint']],
  ['accent', ['accent', 'accent-2', 'accent-ink']],
  ['lines', ['line', 'line-strong']],
  ['signals', ['positive', 'negative', 'warning']]
];

export const LAYERS = ['sound', 'font', 'shape', 'scene', 'special'];

export const FONT_TOKENS = ['font', 'font-display', 'display-weight', 'display-tracking', 'display-transform', 'label-tracking'];

export const SHADE_TOKENS = ['surface-shadow', 'raise-shadow', 'glow'];

export const SPECIALS = ['arcade', 'noir', 'pixel', 'assur', 'tabletop'];

export const NO_SPECIAL = 'none';

export const DEFAULT_PALETTE = {
  bg: '#0b1024',
  ink: '#eaeefb',
  'ink-dim': '#93a0c4',
  'ink-faint': '#5d6a8c',
  surface: '#ffffff0e',
  'surface-2': '#ffffff16',
  'surface-solid': '#10142a',
  line: '#ffffff1c',
  'line-strong': '#ffffff33',
  accent: '#7dd3fc',
  'accent-2': '#a78bfa',
  'accent-ink': '#05070f',
  positive: '#6ee7b7',
  negative: '#fda4af',
  warning: '#fcd34d'
};

export const DEFAULT_VEIL = 0;
export const MAX_VEIL = 90;

const HEX = /^#[0-9a-f]{6}([0-9a-f]{2})?$/;
const ID = /^[a-z0-9-]{1,24}$/;

const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));
const hex2 = (n) => clamp(Math.round(n), 0, 255).toString(16).padStart(2, '0');

export function parseColor(text) {
  const s = String(text ?? '').trim().toLowerCase();
  let m = s.match(/^#([0-9a-f]{3,8})$/);
  if (m) {
    let h = m[1];
    if (h.length === 3 || h.length === 4) h = [...h].map((c) => c + c).join('');
    if (h.length !== 6 && h.length !== 8) return null;
    return {
      r: parseInt(h.slice(0, 2), 16), g: parseInt(h.slice(2, 4), 16), b: parseInt(h.slice(4, 6), 16),
      a: h.length === 8 ? parseInt(h.slice(6, 8), 16) / 255 : 1
    };
  }
  m = s.match(/^rgba?\(([^)]*)\)$/);
  if (!m) return null;
  const parts = m[1].split(/[\s,/]+/).filter(Boolean);
  if (parts.length < 3) return null;
  const channel = (p) => (p.endsWith('%') ? (parseFloat(p) / 100) * 255 : parseFloat(p));
  const [r, g, b] = parts.slice(0, 3).map(channel);
  let a = parts[3] == null ? 1 : parts[3].endsWith('%') ? parseFloat(parts[3]) / 100 : parseFloat(parts[3]);
  if (![r, g, b, a].every(Number.isFinite)) return null;
  a = clamp(a, 0, 1);
  return { r: clamp(r, 0, 255), g: clamp(g, 0, 255), b: clamp(b, 0, 255), a };
}

export function toHex(color) {
  if (!color) return null;
  const base = `#${hex2(color.r)}${hex2(color.g)}${hex2(color.b)}`;
  return color.a >= 0.999 ? base : `${base}${hex2(color.a * 255)}`;
}

export const cleanHex = (text) => {
  const c = parseColor(text);
  return c ? toHex(c) : null;
};

export const opaqueHex = (text) => (cleanHex(text) ?? '#000000').slice(0, 7);

export const alphaOf = (text) => parseColor(text)?.a ?? 1;

export function withAlpha(text, alpha) {
  const c = parseColor(text) ?? { r: 0, g: 0, b: 0, a: 1 };
  return toHex({ ...c, a: clamp(Number(alpha), 0, 1) });
}

function over(top, bottom) {
  const a = top.a + bottom.a * (1 - top.a);
  if (a <= 0) return { r: 0, g: 0, b: 0, a: 0 };
  const mix = (k) => (top[k] * top.a + bottom[k] * bottom.a * (1 - top.a)) / a;
  return { r: mix('r'), g: mix('g'), b: mix('b'), a };
}

export function luminance(color) {
  const lin = (v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin(color.r) + 0.7152 * lin(color.g) + 0.0722 * lin(color.b);
}

export function contrastRatio(fg, bg, base = '#000000') {
  const ground = parseColor(base) ?? { r: 0, g: 0, b: 0, a: 1 };
  const under = over(parseColor(bg) ?? ground, { ...ground, a: 1 });
  const top = over(parseColor(fg) ?? under, under);
  const a = luminance(top);
  const b = luminance(under);
  const ratio = (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
  return Math.round(ratio * 100) / 100;
}

export const CONTRAST_PAIRS = [
  { id: 'inkBg', fg: 'ink', bg: 'bg', min: 4.5 },
  { id: 'inkSolid', fg: 'ink', bg: 'surface-solid', min: 4.5 },
  { id: 'inkSurface', fg: 'ink', bg: 'surface', on: 'bg', min: 4.5 },
  { id: 'dimSolid', fg: 'ink-dim', bg: 'surface-solid', min: 3 },
  { id: 'accentInk', fg: 'accent-ink', bg: 'accent', min: 4.5 },
  { id: 'accentSolid', fg: 'accent', bg: 'surface-solid', min: 3 }
];

export function contrastWarnings(palette) {
  const p = { ...DEFAULT_PALETTE, ...(palette ?? {}) };
  const out = [];
  for (const pair of CONTRAST_PAIRS) {
    const base = pair.on ? p[pair.on] : p.bg;
    const ratio = contrastRatio(p[pair.fg], p[pair.bg], base);
    if (ratio < pair.min) out.push({ id: pair.id, fg: pair.fg, bg: pair.bg, ratio, min: pair.min });
  }
  return out;
}

export function readableOn(fg, grounds, min = 4.5) {
  const start = parseColor(fg);
  if (!start) return fg;
  const worst = (c) => Math.min(...grounds.map(([bg, base]) => contrastRatio(toHex(c), bg, base)));
  const solid = { ...start, a: 1 };
  if (worst(solid) >= min) return cleanHex(fg);
  const dark = grounds.reduce((sum, [bg, base]) => sum + luminance(over(parseColor(bg) ?? solid, { ...(parseColor(base) ?? solid), a: 1 })), 0) / grounds.length < 0.18;
  const target = dark ? { r: 255, g: 255, b: 255, a: 1 } : { r: 0, g: 0, b: 0, a: 1 };
  for (let i = 1; i <= 20; i++) {
    const k = i / 20;
    const c = { r: solid.r + (target.r - solid.r) * k, g: solid.g + (target.g - solid.g) * k, b: solid.b + (target.b - solid.b) * k, a: 1 };
    if (worst(c) >= min) return toHex(c);
  }
  return toHex(target);
}

export function readableTokens(palette) {
  const p = { ...DEFAULT_PALETTE, ...(palette ?? {}) };
  const grounds = [[p.bg, p.bg], [p['surface-solid'], p.bg], [p.surface, p.bg], [p['surface-2'], p.bg]];
  return {
    '--ink': readableOn(p.ink, grounds),
    '--ink-dim': readableOn(p['ink-dim'], grounds),
    '--ink-faint': readableOn(p['ink-faint'], grounds),
    '--accent-text': readableOn(p.accent, grounds),
    '--negative-ink': contrastRatio('#ffffff', p.negative) >= contrastRatio('#14080a', p.negative) ? '#ffffff' : '#14080a',
    ...rarityTextTokens(p)
  };
}

export const RARITY_TEXT_TIERS = [...RARITIES, SPECIAL];

export const rarityTextVar = (id) => `--rarity-${id}-text`;

export function rarityGrounds(palette, color, sky = []) {
  const p = { ...DEFAULT_PALETTE, ...(palette ?? {}) };
  const solid = p['surface-solid'];
  return [
    [p.bg, p.bg], [solid, p.bg], [p.surface, p.bg], [p['surface-2'], p.bg],
    [mixHex(solid, color, 0.18), p.bg], [mixHex(p.bg, color, 0.18), p.bg],
    ...(sky ?? []).map((c) => [opaqueHex(c), p.bg])
  ];
}

export function rarityTextTokens(palette, sky = []) {
  const out = {};
  for (const tier of RARITY_TEXT_TIERS) out[rarityTextVar(tier.id)] = readableOn(tier.color, rarityGrounds(palette, tier.color, sky), 4.6);
  return out;
}

export function themeRarityText(id) {
  const theme = THEMES.find((th) => th.id === id);
  return rarityTextTokens(presetPalette(id), theme?.backdrop?.sky ?? []);
}

export const themeKnown = (id) => THEMES.some((theme) => theme.id === id);

export function normalizeCustom(raw, owns = () => true) {
  const src = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  const palette = { ...DEFAULT_PALETTE };
  const given = src.palette && typeof src.palette === 'object' ? src.palette : {};
  for (const token of PALETTE_TOKENS) {
    const hex = typeof given[token] === 'string' ? cleanHex(given[token]) : null;
    if (hex && HEX.test(hex)) palette[token] = hex;
  }
  const layers = {};
  const asked = src.layers && typeof src.layers === 'object' ? src.layers : {};
  for (const layer of LAYERS) {
    const id = typeof asked[layer] === 'string' ? asked[layer] : null;
    if (layer === 'special') {
      layers.special = id && SPECIALS.includes(id) && owns(id) ? id : NO_SPECIAL;
      continue;
    }
    layers[layer] = id && ID.test(id) && themeKnown(id) && owns(id) ? id : DEFAULT_THEME;
  }
  const veil = clamp(Math.round(Number(src.veil) || 0), 0, MAX_VEIL);
  const base = typeof src.base === 'string' && themeKnown(src.base) ? src.base : DEFAULT_THEME;
  return { v: 1, base, palette, layers, veil };
}

export function paletteFromTokens(tokens, theme = null) {
  const palette = { ...DEFAULT_PALETTE };
  for (const token of PALETTE_TOKENS) {
    const raw = token === 'bg' ? (theme?.swatch?.[0] ?? tokens?.bg) : tokens?.[token];
    const hex = raw ? cleanHex(raw) : null;
    if (hex) palette[token] = hex;
  }
  return palette;
}

const sameRgb = (a, b) => a && b && Math.round(a.r) === Math.round(b.r) && Math.round(a.g) === Math.round(b.g) && Math.round(a.b) === Math.round(b.b);

export function recolor(value, swaps) {
  if (typeof value !== 'string') return value;
  return value.replace(/rgba?\([^)]*\)|#[0-9a-fA-F]{3,8}\b/g, (found) => {
    const c = parseColor(found);
    if (!c) return found;
    for (const [from, to] of swaps) {
      if (sameRgb(c, from)) return toHex({ ...to, a: c.a });
    }
    return found;
  });
}

export function composeCustom(raw, tokensOf = () => ({}), owns = () => true) {
  const custom = normalizeCustom(raw, owns);
  const { palette, layers } = custom;
  const vars = {};
  for (const token of PALETTE_TOKENS) {
    if (token !== 'bg') vars[`--${token}`] = palette[token];
  }
  Object.assign(vars, readableTokens(palette));
  const font = tokensOf(layers.font) ?? {};
  for (const token of FONT_TOKENS) if (font[token]) vars[`--${token}`] = font[token];
  const shape = tokensOf(layers.shape) ?? {};
  const swaps = [];
  for (const token of ['accent', 'accent-2', 'ink']) {
    const from = parseColor(shape[token]);
    const to = parseColor(palette[token]);
    if (from && to) swaps.push([from, to]);
  }
  for (const token of SHADE_TOKENS) if (shape[token]) vars[`--${token}`] = recolor(shape[token], swaps);
  const shapeTheme = THEMES.find((theme) => theme.id === layers.shape) ?? THEMES[0];
  return {
    id: CUSTOM_THEME,
    shape: layers.shape,
    font: layers.font,
    scene: layers.scene,
    sound: layers.sound,
    special: layers.special,
    motion: shapeTheme.motion,
    vars,
    tint: palette.bg,
    veil: custom.veil,
    swatch: [palette.bg, palette.accent, palette['accent-2']],
    custom
  };
}

const tokenCache = new Map();

const bare = (selector) => selector.replace(/["'\s]/g, '');

function rulesOf(sheet) {
  try { return sheet.cssRules ?? []; } catch { return []; }
}

function collect(rules, wanted, out) {
  for (const rule of rules) {
    if (rule.styleSheet) { collect(rulesOf(rule.styleSheet), wanted, out); continue; }
    if (rule.cssRules && !rule.selectorText) { collect(rule.cssRules, wanted, out); continue; }
    if (!rule.selectorText || !rule.style) continue;
    if (!rule.selectorText.split(',').some((s) => bare(s) === wanted)) continue;
    for (let i = 0; i < rule.style.length; i++) {
      const name = rule.style[i];
      if (name.startsWith('--')) out[name.slice(2)] = rule.style.getPropertyValue(name).trim();
    }
  }
}

export function themeTokens(id) {
  if (tokenCache.has(id)) return tokenCache.get(id);
  const out = {};
  if (typeof document === 'undefined' || !themeKnown(id)) return out;
  const wanted = `[data-theme=${id}]`;
  for (const sheet of document.styleSheets) collect(rulesOf(sheet), wanted, out);
  if (Object.keys(out).length) tokenCache.set(id, out);
  return out;
}

export function presetPalette(id) {
  const theme = THEMES.find((th) => th.id === id);
  if (!theme) return { ...DEFAULT_PALETTE };
  return paletteFromTokens(themeTokens(id), theme);
}

export function defaultCustom(base = DEFAULT_THEME) {
  const id = themeKnown(base) ? base : DEFAULT_THEME;
  return {
    v: 1, base: id, palette: presetPalette(id), veil: DEFAULT_VEIL,
    layers: { sound: id, font: id, shape: id, scene: id, special: SPECIALS.includes(id) ? id : NO_SPECIAL }
  };
}

function mixHex(a, b, k) {
  const x = parseColor(a) ?? { r: 0, g: 0, b: 0, a: 1 };
  const y = parseColor(b) ?? { r: 0, g: 0, b: 0, a: 1 };
  return toHex({ r: x.r + (y.r - x.r) * k, g: x.g + (y.g - x.g) * k, b: x.b + (y.b - x.b) * k, a: 1 });
}

export function friendCustom(def) {
  const base = themeKnown(def?.base) ? def.base : DEFAULT_THEME;
  const accent = cleanHex(def?.accent)?.slice(0, 7) ?? DEFAULT_PALETTE.accent;
  const palette = presetPalette(base);
  const light = luminance(parseColor(accent)) > 0.35;
  palette.accent = accent;
  palette['accent-2'] = mixHex(accent, light ? '#000000' : '#ffffff', 0.35);
  palette['accent-ink'] = contrastRatio('#05070f', accent) >= contrastRatio('#ffffff', accent) ? '#05070f' : '#ffffff';
  return {
    v: 1, base, palette, veil: DEFAULT_VEIL,
    layers: { sound: base, font: base, shape: base, scene: base, special: SPECIALS.includes(base) ? base : NO_SPECIAL }
  };
}

export function composeFriend(id, def) {
  if (!def) return null;
  const composed = composeCustom(friendCustom(def), themeTokens, () => true);
  return { ...composed, id, name: def.name, friend: true };
}
