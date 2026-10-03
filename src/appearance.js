import { DEFAULT_THEME, THEMES } from './ui/themes.js';
import { RARITIES } from './data/rarities.js';
import { DEFAULT_FX, fxExists } from './data/fx.js';
import { CUSTOM_THEME, LAYERS, NO_SPECIAL, PALETTE_TOKENS, SPECIALS, cleanHex, normalizeCustom } from './ui/customtheme.js';
import { codeThemeOwned } from './codedefs.js';
import { cleanThemeLook, friendCodes, friendLookId, friendThemeOf, isFriendLook } from './friendcodes.js';

export const APPEARANCE_MAX = 4000;

const listOf = (v) => (Array.isArray(v) ? v : []);

export function themeIdOwned(st, id) {
  if (id === DEFAULT_THEME) return true;
  const owned = listOf(st?.owned?.themes);
  if (id === CUSTOM_THEME) return owned.includes(CUSTOM_THEME);
  if (isFriendLook(id)) return owned.includes(id) && Boolean(friendThemeOf(id, st ?? null));
  const theme = THEMES.find((th) => th.id === id);
  if (!theme) return false;
  if (theme.code) return codeThemeOwned(st, id);
  if (theme.season) return listOf(st?.seasonUnlocks?.themes).includes(theme.season);
  return owned.includes(id);
}

export const friendThemeIds = (st) => Object.keys(friendCodes(st ?? null)).map(friendLookId).filter((id) => themeIdOwned(st, id));

export const ownedThemeIds = (st) => [...THEMES.filter((th) => themeIdOwned(st, th.id)).map((th) => th.id), ...friendThemeIds(st)];

export const fxOwned = (st, rarityId, fxId) => listOf(st?.owned?.fx).includes(`${rarityId}:${fxId}`);

function cleanFx(raw, st, strict) {
  const out = {};
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out;
  for (const rarity of RARITIES) {
    const id = raw[rarity.id];
    if (typeof id !== 'string' || id === DEFAULT_FX || !fxExists(rarity.id, id)) continue;
    if (strict && !fxOwned(st, rarity.id, id)) continue;
    out[rarity.id] = id;
  }
  return out;
}

export function buildAppearance({ theme = DEFAULT_THEME, custom = null, fx = {}, friend = null } = {}) {
  const look = { v: 1, theme, fx: cleanFx(fx, null, false) };
  if (isFriendLook(theme)) {
    const def = cleanThemeLook(friend);
    return def ? { ...look, friend: def } : { ...look, theme: DEFAULT_THEME };
  }
  if (theme === CUSTOM_THEME) {
    const tidy = normalizeCustom(custom);
    look.custom = { palette: tidy.palette, layers: tidy.layers, veil: tidy.veil };
  }
  return look;
}

export function cleanAppearance(raw, st = null) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  let size = 0;
  try { size = JSON.stringify(raw).length; } catch { return null; }
  if (size > APPEARANCE_MAX) return null;
  const strict = Boolean(st);
  const owns = (id) => !strict || themeIdOwned(st, id);
  let theme = typeof raw.theme === 'string' && /^[a-z0-9-]{1,40}$/.test(raw.theme) ? raw.theme : DEFAULT_THEME;
  if (!owns(theme)) theme = DEFAULT_THEME;
  const look = { v: 1, theme, fx: cleanFx(raw.fx, st, strict) };
  if (isFriendLook(theme)) {
    const def = cleanThemeLook(strict ? friendThemeOf(theme, st) : raw.friend);
    return def ? { ...look, friend: def } : { ...look, theme: DEFAULT_THEME };
  }
  if (theme !== CUSTOM_THEME) return look;
  const given = raw.custom && typeof raw.custom === 'object' ? raw.custom : null;
  if (!given) return { ...look, theme: DEFAULT_THEME };
  const palette = {};
  for (const token of PALETTE_TOKENS) {
    const hex = typeof given.palette?.[token] === 'string' ? cleanHex(given.palette[token]) : null;
    if (hex) palette[token] = hex;
  }
  const layers = {};
  for (const layer of LAYERS) {
    const id = given.layers?.[layer];
    if (typeof id !== 'string') continue;
    if (layer === 'special' && id === NO_SPECIAL) { layers.special = id; continue; }
    if (layer === 'special' && !SPECIALS.includes(id)) continue;
    if (id === CUSTOM_THEME || !/^[a-z0-9-]{1,24}$/.test(id) || !owns(id)) continue;
    layers[layer] = id;
  }
  const veil = Math.min(90, Math.max(0, Math.round(Number(given.veil) || 0)));
  return { ...look, custom: { palette, layers, veil } };
}

export function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((k) => `${JSON.stringify(k)}:${canonical(value[k])}`).join(',')}}`;
  }
  return JSON.stringify(value ?? null);
}
