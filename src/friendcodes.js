import { THEMES } from './ui/themes.js';
import { EMBLEMS } from './data/emblems.js';
import { RARITIES } from './data/rarities.js';
import { ItemError } from './econ/items.js';

export const FRIEND_PREFIX = 'db:';
export const FRIEND_RARITIES = [...RARITIES.map((r) => r.id), 'special'];
export const FRIEND_EMBLEMS = Object.keys(EMBLEMS);
export const FRIEND_THEMES = THEMES.map((th) => th.id);

const HEX = /^#[0-9a-fA-F]{6}$/;
const HTTPS = /^https:\/\/[^\s<>"]+$/;

export const isFriendId = (id) => typeof id === 'string' && id.startsWith(FRIEND_PREFIX) && id.length > FRIEND_PREFIX.length;
export const friendCodeOf = (id) => (isFriendId(id) ? id.slice(FRIEND_PREFIX.length) : null);
export const isFriendSpec = (spec) => spec?.kind === 'code' && isFriendId(spec.codeId);
export const friendLookId = (code) => `fc-${String(code ?? '').toLowerCase()}`;
export const isFriendLook = (id) => typeof id === 'string' && /^fc-[a-z0-9]{4,32}$/.test(id);
export const codeOfLook = (id) => (isFriendLook(id) ? id.slice(3).toUpperCase() : null);

let source = () => null;
export const useFriendSource = (fn) => { source = typeof fn === 'function' ? fn : () => null; };

const mapOf = (codes) => (codes && typeof codes === 'object' && !Array.isArray(codes) ? codes : {});
export function friendCodes(st = undefined) {
  if (st !== undefined) return mapOf(st?.friendCodes);
  try { return mapOf(source()); } catch { return {}; }
}
export const friendDef = (code, st = undefined) => friendCodes(st)[code] ?? null;
export const friendThemeOf = (id, st = undefined) => {
  const code = codeOfLook(id);
  const theme = code ? friendDef(code, st)?.theme : null;
  return theme && typeof theme === 'object' ? theme : null;
};
export const friendBadgeOf = (id, st = undefined) => {
  const code = codeOfLook(id);
  const badge = code ? friendDef(code, st)?.badge : null;
  return badge && typeof badge === 'object' ? badge : null;
};

export function shade(hex, amount) {
  const m = HEX.exec(String(hex ?? '')) ? String(hex).slice(1) : '64748b';
  const parts = [0, 2, 4].map((i) => parseInt(m.slice(i, i + 2), 16));
  const to = amount < 0 ? 0 : 255;
  const k = Math.min(1, Math.abs(amount));
  return `#${parts.map((v) => Math.round(v + (to - v) * k).toString(16).padStart(2, '0')).join('')}`;
}

export function friendSpec(code, booster, person = null) {
  const accent = HEX.test(booster?.accent ?? '') ? booster.accent.toLowerCase() : '#64748b';
  const n = Array.isArray(booster?.cards) ? booster.cards.length : Math.max(1, Number(booster?.cards) || 1);
  return {
    kind: 'code', codeId: `${FRIEND_PREFIX}${code}`, rarityId: null, themeId: null, cards: n,
    codeName: String(booster?.name ?? ''), codeFor: person ? String(person) : null,
    accent, accent2: HEX.test(booster?.accent2 ?? '') ? booster.accent2.toLowerCase() : shade(accent, -0.65)
  };
}

const bad = () => { throw new ItemError('BAD_SPECIAL'); };
const isObject = (v) => Boolean(v) && typeof v === 'object' && !Array.isArray(v);
const given = (v) => v !== undefined && v !== null;
const str = (v, max) => {
  if (typeof v !== 'string') return null;
  const t = v.trim();
  return t && t.length <= max ? t : null;
};
const cut = (v, max) => {
  if (typeof v !== 'string') return null;
  const t = v.trim().slice(0, max).trim();
  return t || null;
};
const url = (v, max) => {
  const t = str(v, max);
  return t && HTTPS.test(t) ? t : null;
};
const hex = (v) => (typeof v === 'string' && HEX.test(v) ? v.toLowerCase() : null);
const num = (v, lo, hi, whole = false) => typeof v === 'number' && Number.isFinite(v) && v >= lo && v <= hi && (!whole || Number.isInteger(v));
const strip = (o) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== null && v !== undefined));

export function checkFriendCard(raw) {
  if (!isObject(raw)) bad();
  const art = raw.article;
  if (!isObject(art) || JSON.stringify(art).length > 20000) bad();
  const key = str(art.key, 300) ?? bad();
  let rarityId = 'common';
  if (given(raw.rarityId)) {
    rarityId = str(raw.rarityId, 20);
    if (!FRIEND_RARITIES.includes(rarityId)) bad();
  }
  let picture = null;
  if (isObject(art.picture)) {
    const at = url(art.picture.url, 1000) ?? bad();
    picture = strip({ source: 'upload', url: at, credit: cut(art.picture.credit, 200), license: cut(art.picture.license, 120), link: url(art.picture.link, 1000) });
  } else if (given(art.picture)) bad();
  let thumbnail = null;
  if (given(art.thumbnail)) thumbnail = url(art.thumbnail, 1000) ?? bad();
  const lang = str(art.lang, 12);
  return {
    article: strip({
      key,
      title: cut(art.title, 300) ?? key,
      lang: lang && /^[a-z-]{2,12}$/.test(lang) ? lang : 'en',
      description: cut(art.description, 300),
      extract: cut(art.extract, 1500),
      url: url(art.url, 600),
      thumbnail: picture?.url ?? thumbnail,
      sourceName: cut(art.sourceName, 80),
      views: num(art.views, 0, 1e12, true) ? art.views : null,
      popularity: num(art.popularity, 0, 1) ? art.popularity : null,
      picture
    }),
    rarityId
  };
}

export function checkSpecial(raw, hasItems = false) {
  if (!isObject(raw)) bad();
  const name = str(raw.name, 40) ?? bad();
  const message = str(raw.message, 800) ?? bad();
  let cards = [];
  if (given(raw.cards)) {
    if (!Array.isArray(raw.cards) || raw.cards.length > 20) bad();
    cards = raw.cards.map(checkFriendCard);
  }
  let booster = null;
  if (isObject(raw.booster)) {
    const b = raw.booster;
    const bname = str(b.name, 60);
    if (!bname || !hex(b.accent) || (given(b.accent2) && !hex(b.accent2)) || !Array.isArray(b.cards) || b.cards.length < 1 || b.cards.length > 12) bad();
    booster = { ...strip({ name: bname, accent: hex(b.accent), accent2: hex(b.accent2) }), cards: b.cards.map(checkFriendCard) };
  } else if (given(raw.booster)) bad();
  let theme = null;
  if (isObject(raw.theme)) {
    const t = raw.theme;
    if (!str(t.name, 40) || !hex(t.accent) || !FRIEND_THEMES.includes(str(t.base, 40))) bad();
    theme = { name: str(t.name, 40), base: str(t.base, 40), accent: hex(t.accent) };
  } else if (given(raw.theme)) bad();
  let badge = null;
  if (isObject(raw.badge)) {
    const b = raw.badge;
    if (!str(b.name, 40) || !hex(b.color) || !FRIEND_EMBLEMS.includes(str(b.emblem, 40))) bad();
    badge = { name: str(b.name, 40), emblem: str(b.emblem, 40), color: hex(b.color) };
  } else if (given(raw.badge)) bad();
  if (!cards.length && !booster && !theme && !badge && !hasItems) bad();
  return { name, message, cards, booster, theme, badge };
}

export function cleanThemeLook(raw) {
  if (!isObject(raw)) return null;
  const name = str(raw.name, 40);
  const base = str(raw.base, 40);
  const accent = hex(raw.accent);
  return name && accent && FRIEND_THEMES.includes(base) ? { name, base, accent } : null;
}

export function cleanBadgeLook(raw) {
  if (!isObject(raw)) return null;
  const name = str(raw.name, 40);
  const emblem = str(raw.emblem, 40);
  const color = hex(raw.color);
  return name && color && FRIEND_EMBLEMS.includes(emblem) ? { name, emblem, color } : null;
}

const codeBadgeLookOf = (id, st) => {
  const defs = isObject(st?.codeDefs) ? st.codeDefs : {};
  for (const [key, def] of Object.entries(defs)) {
    const badge = isObject(def) ? def.badge : null;
    if (!isObject(badge) || badge.id !== id || !(Number(st?.codesRedeemed?.[key]) > 0)) continue;
    return { name: badge.name, motif: badge.motif, foil: badge.foil, ...(badge.live === 'fire' ? { live: 'fire' } : {}) };
  }
  return null;
};

export function cleanFriendBadges(badges, st) {
  const text = isObject(badges) ? JSON.stringify(badges) : '';
  if (!isObject(badges) || !Array.isArray(badges.earned) || (!text.includes('fc-') && !text.includes('special-'))) return badges;
  const ids = [];
  const earned = [];
  for (const e of badges.earned) {
    const id = isObject(e) && typeof e.id === 'string' ? e.id : null;
    let row = e;
    if (id && id.startsWith('fc-')) {
      const d = friendBadgeOf(id, st);
      if (!d) continue;
      row = { id, rank: 1, look: { name: d.name, emblem: d.emblem, color: d.color } };
    } else if (id && id.startsWith('special-')) {
      const look = codeBadgeLookOf(id, st);
      if (!look) continue;
      row = { id, rank: 1, look };
    }
    if (id) ids.push(id);
    earned.push(row);
  }
  const out = { ...badges, earned };
  if (Array.isArray(badges.worn)) out.worn = badges.worn.filter((w) => typeof w !== 'string' || (!w.startsWith('fc-') && !w.startsWith('special-')) || ids.includes(w));
  return out;
}
