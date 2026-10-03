import { RARITIES } from './data/rarities.js';
import { specOrNull } from './econ/items.js';
import { parseStamp } from './days.js';

export const TIER_KEYS = ['plain', ...RARITIES.slice(1).map((r) => r.id)];
export const ODDS_KEYS = ['none', ...RARITIES.map((r) => r.id)];
export const EVENT_KINDS = ['drop_rate', 'free_packs', 'limited_booster', 'price', 'xp'];
export const MAX_SPEC_CARDS = 12;

export const TUNING = {
  'shop.priceMult': { kind: 'number', def: 1, min: 0.2, max: 5, about: 'Multiplier on every booster price in the shop' },
  'shop.tierMult': { kind: 'tiers', def: {}, min: 0.2, max: 5, about: 'Extra shop price multiplier per booster tier: plain, uncommon, rare, epic, legendary, mythic, exotic, prismatic' },
  'sell.mult': { kind: 'number', def: 1, min: 0, max: 5, about: 'Multiplier on what selling a card pays' },
  'daily.coinsMult': { kind: 'number', def: 1, min: 0, max: 10, about: 'Multiplier on the coins of the daily gift' },
  'stipend.amount': { kind: 'int', def: 250, min: 0, max: 20000, about: 'Coins paid for every one hour shop window' },
  'stipend.maxBanked': { kind: 'int', def: 8, min: 0, max: 48, about: 'Hourly stipend windows that can pile up while away' },
  'timed.regenMult': { kind: 'number', def: 1, min: 0.1, max: 10, about: 'Multiplier on the wait between timed free packs, below 1 is faster' },
  'timed.capBonus': { kind: 'int', def: 0, min: -6, max: 50, about: 'Timed free packs that can be held, added to the cap of each level' },
  'xp.mult': { kind: 'number', def: 1, min: 0, max: 10, about: 'Multiplier on the XP every pulled card gives' },
  'fuse.copies': { kind: 'int', def: 3, min: 1, max: 10, about: 'Copies a fusion consumes' },
  'crate.basePrice': { kind: 'int', def: 1000, min: 50, max: 100000, about: 'Price of the first crate in a shop window' },
  'starter.coins': { kind: 'int', def: 1500, min: 0, max: 100000, about: 'Coins a new player starts with' },
  'free.slots': { kind: 'int', def: 2, min: 0, max: 6, about: 'Boosters on the free shelf' },
  'free.cards': { kind: 'int', def: 3, min: 3, max: 7, about: 'Cards in each free shelf booster' },
  'odds.table': { kind: 'odds', def: {}, min: 0, max: 100, about: 'Rarity odds per booster tier (none, common ... prismatic), eight weights from common to prismatic' },
  'pity.legendary': { kind: 'int', def: 40, min: 10, max: 200, about: 'Boosters opened without a Legendary or better before one is guaranteed' },
  'market.fee': { kind: 'number', def: 5, min: 0, max: 25, about: 'Auction House fee in percent, kept from the final price when a lot sells' },
  'market.step': { kind: 'number', def: 5, min: 1, max: 50, about: 'Smallest raise over the current bid at the Auction House, in percent' },
  'market.maxLots': { kind: 'int', def: 20, min: 1, max: 100, about: 'Lots one player can have open at the Auction House at once' }
};

const num = (v) => (v === null || v === undefined || v === '' ? NaN : Number(v));
const clampTo = (n, lo, hi) => Math.min(hi, Math.max(lo, n));

export function tuningValue(def, raw) {
  if (def.kind === 'number' || def.kind === 'int') {
    const n = num(raw);
    if (!Number.isFinite(n)) return undefined;
    const v = clampTo(n, def.min, def.max);
    return def.kind === 'int' ? Math.round(v) : v;
  }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined;
  const out = {};
  if (def.kind === 'tiers') {
    for (const k of TIER_KEYS) {
      const n = num(raw[k]);
      if (Number.isFinite(n)) out[k] = clampTo(n, def.min, def.max);
    }
    return out;
  }
  if (def.kind === 'odds') {
    for (const k of ODDS_KEYS) {
      const row = oddsRowOf(raw[k]);
      if (row) out[k] = row;
    }
    return out;
  }
  return undefined;
}

export function oddsRowOf(raw) {
  let row = null;
  if (Array.isArray(raw)) row = raw.map(num);
  else if (raw && typeof raw === 'object') row = RARITIES.map((r) => num(raw[r.id] ?? 0));
  if (!row || row.length !== RARITIES.length || row.some((n) => !Number.isFinite(n) || n < 0)) return null;
  return row.reduce((a, b) => a + b, 0) > 0 ? row : null;
}

const text = (v, n) => (typeof v === 'string' ? v.slice(0, n) : null);
const langs = (v, n = 200) => {
  if (typeof v === 'string') return { en: v.slice(0, n), fr: v.slice(0, n) };
  const en = text(v?.en, n) ?? text(v?.fr, n) ?? '';
  return { en, fr: text(v?.fr, n) || en };
};
const stamp = parseStamp;
const posInt = (v) => {
  const n = Math.floor(num(v));
  return Number.isFinite(n) && n > 0 ? n : null;
};

export function cleanSpec(raw) {
  return specOrNull(raw);
}

function perLang(value, wrap) {
  if (value == null) return null;
  const list = (v) => (Array.isArray(v) ? v : [v]).map((x) => text(x, 300)).filter(Boolean).slice(0, 200).map(wrap);
  if (typeof value === 'string' || Array.isArray(value)) {
    const en = list(value);
    return en.length ? { en } : null;
  }
  if (typeof value !== 'object') return null;
  const out = {};
  for (const lang of ['en', 'fr']) if (value[lang] != null) { const l = list(value[lang]); if (l.length) out[lang] = l; }
  return out.en || out.fr ? { en: out.en ?? out.fr, ...out } : null;
}

export function packTheme(row) {
  const id = text(row?.id, 60);
  if (!id) return null;
  const name = langs(row.name, 60);
  const source = row.source && typeof row.source === 'object' ? row.source : {};
  const pack = {
    id,
    live: true,
    icon: text(row.icon, 40) || 'packs',
    name,
    tagline: langs(row.tagline ?? '', 160),
    hero: { en: text(source.hero, 200) || name.en, fr: text(source.hero, 200) || name.fr },
    accent: text(row.accent, 20) || '#94a3b8',
    accent2: text(row.accent2, 20) || '#1e2233',
    match: {},
    queries: {},
    odds: oddsRowOf(row.rarity_odds),
    cards: clampTo(Math.round(num(row.default_cards) || 5), 1, MAX_SPEC_CARDS),
    price: Number.isFinite(num(row.price)) && num(row.price) >= 0 ? Math.round(num(row.price)) : null,
    from: stamp(row.available_from),
    until: stamp(row.available_until),
    limit: posInt(row.limited_stock),
    perPlayer: posInt(row.per_player),
    visible: Boolean(row.visible),
    borrow: null
  };
  if (source.type === 'category') pack.queries = perLang(source.value, (c) => `incategory:"${c.replace(/"/g, '')}"`) ?? {};
  else if (source.type === 'search') pack.queries = perLang(source.value, (q) => q) ?? {};
  else if (source.type === 'titles') {
    const titles = perLang(source.value, (t) => t);
    if (titles) pack.titles = titles;
  } else if (source.type === 'theme') pack.borrow = text(source.value, 60);
  return pack;
}

function normEvent(row) {
  const id = text(row?.id, 64);
  const kind = EVENT_KINDS.includes(row?.kind) ? row.kind : null;
  const starts = stamp(row?.starts_at ?? row?.starts);
  const ends = stamp(row?.ends_at ?? row?.ends);
  if (!id || !kind || starts == null || ends == null || ends <= starts) return null;
  const params = row.params && typeof row.params === 'object' && !Array.isArray(row.params) ? row.params : {};
  return { id, kind, name: text(row.name, 120) ?? '', params, starts, ends };
}

export function prepareLive(raw) {
  const r = raw && typeof raw === 'object' ? raw : {};
  const tuning = {};
  for (const [k, v] of Object.entries(r.tuning && typeof r.tuning === 'object' ? r.tuning : {})) {
    const def = Object.prototype.hasOwnProperty.call(TUNING, k) ? TUNING[k] : null;
    const value = def ? tuningValue(def, v) : undefined;
    if (value !== undefined) tuning[k] = value;
  }
  const events = (Array.isArray(r.events) ? r.events : []).map(normEvent).filter(Boolean)
    .sort((a, b) => a.starts - b.starts || (a.id < b.id ? -1 : 1));
  const packs = new Map();
  for (const row of Array.isArray(r.packs) ? r.packs : []) {
    const pack = packTheme(row);
    if (pack) packs.set(pack.id, pack);
  }
  const stock = {};
  for (const [k, v] of Object.entries(r.stock && typeof r.stock === 'object' ? r.stock : {})) {
    const n = Math.floor(num(v));
    if (Number.isFinite(n) && n >= 0) stock[k] = n;
  }
  return { tuning, events, packs, stock, raw: r };
}

const memo = new WeakMap();
let base = prepareLive(null);
let version = 0;
let source = null;
const watchers = new Set();

export function useLiveSource(fn) {
  source = typeof fn === 'function' ? fn : null;
}

export function setLive(raw) {
  base = prepareLive(raw);
  version++;
  for (const fn of [...watchers]) { try { fn(base); } catch {} }
  return base;
}

export const liveVersion = () => version;

export function onLiveChange(fn) {
  watchers.add(fn);
  return () => watchers.delete(fn);
}

export function liveNow() {
  const raw = source?.();
  if (!raw || typeof raw !== 'object') return base;
  let prepared = memo.get(raw);
  if (!prepared) { prepared = prepareLive(raw); memo.set(raw, prepared); }
  return prepared;
}

export function tune(key) {
  const def = TUNING[key];
  if (!def) return undefined;
  const held = liveNow().tuning[key];
  return held === undefined ? def.def : held;
}

export const eventOn = (event, now = Date.now()) => event.starts <= now && now < event.ends;

export function activeEvents(kind, now = Date.now()) {
  return liveNow().events.filter((e) => (!kind || e.kind === kind) && eventOn(e, now));
}

export function upcomingEvents(now = Date.now(), within = 86400000) {
  return liveNow().events.filter((e) => e.ends > now && e.starts <= now + within);
}

const listed = (list, value) => !Array.isArray(list) || !list.length || list.includes(value);

export function eventFits(event, spec = null, section = null) {
  const p = event.params ?? {};
  if (spec && !listed(p.kinds, spec.kind)) return false;
  if (spec && Array.isArray(p.themes) && p.themes.length && !p.themes.includes(spec.themeId)) return false;
  return !section || listed(p.sections, section);
}

export function eventMult(kind, now = Date.now(), spec = null, section = null) {
  let m = 1;
  for (const e of activeEvents(kind, now)) {
    if (!eventFits(e, spec, section)) continue;
    const v = num(e.params.mult);
    if (Number.isFinite(v) && v > 0) m *= Math.min(10, v);
  }
  return m;
}

export function livePackById(id) {
  return liveNow().packs.get(id) ?? null;
}

export const livePacks = () => [...liveNow().packs.values()];

export const liveSold = (item) => liveNow().stock[item] ?? 0;

export function eventGiftOf(event) {
  const p = event?.params ?? {};
  const spec = cleanSpec(p.spec);
  const whole = (v) => Math.round(Number(v) || 0);
  return {
    spec,
    count: spec ? Math.min(20, Math.max(1, whole(p.count) || 1)) : 0,
    timed: Math.min(50, Math.max(0, whole(p.timed)))
  };
}

export const eventTitle = (event, lang = 'en') => {
  const title = event?.params?.title;
  if (title && typeof title === 'object') return String(title[lang] ?? title.en ?? event.name ?? '');
  return String(typeof title === 'string' && title ? title : event?.name ?? '');
};

export const packOnSale = (pack, now = Date.now()) =>
  Boolean(pack?.visible) && (pack.from == null || pack.from <= now) && (pack.until == null || now < pack.until);
