import { RARITIES } from '../data/rarities.js';

export const ITEM_BUCKETS = ['themes', 'frames', 'fx', 'looks', 'openings', 'supporter'];
export const SPEC_KINDS = ['theme', 'open', 'custom', 'today'];
export const ITEM_KINDS = ['coins', 'ink', 'xp', 'level', 'boostersOpened', 'booster', 'card', 'owned'];
export const GRANT_ONLY_KINDS = ['takeCard', 'revokeOwned'];

const RARITY_IDS = RARITIES.map((r) => r.id);

export class ItemError extends Error {
  constructor(code) {
    super(code);
    this.code = code;
  }
}

const bad = (code) => { throw new ItemError(code); };
const whole = (v, lo, hi) => typeof v === 'number' && Number.isInteger(v) && v >= lo && v <= hi;
const str = (v, max) => {
  if (typeof v !== 'string') return null;
  const t = v.trim();
  return t && t.length <= max ? t : null;
};
const isObject = (v) => Boolean(v) && typeof v === 'object' && !Array.isArray(v);
const has = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
const color = (v) => {
  const t = str(v, 9);
  return t && /^#[0-9a-fA-F]{3,8}$/.test(t) ? v : undefined;
};

export function checkSpec(raw) {
  if (!isObject(raw)) bad('BAD_SPEC');
  const kind = str(raw.kind, 20);
  if (!SPEC_KINDS.includes(kind)) bad('BAD_SPEC');
  if (!whole(raw.cards, 1, 12)) bad('BAD_SPEC');
  let rarityId = null;
  if (raw.rarityId != null) {
    rarityId = str(raw.rarityId, 20);
    if (!RARITY_IDS.includes(rarityId)) bad('BAD_SPEC');
  }
  const spec = { kind, themeId: null, rarityId, cards: raw.cards };
  if (kind === 'theme') {
    const themeId = str(raw.themeId, 60);
    if (!themeId || !/^[a-z0-9_-]{1,60}$/.test(themeId)) bad('BAD_SPEC');
    spec.themeId = themeId;
  } else if (kind === 'today') {
    const day = str(raw.day, 10);
    if (!day || !/^\d{4}-\d{2}-\d{2}$/.test(day)) bad('BAD_SPEC');
    spec.day = raw.day;
  } else if (kind === 'custom') {
    if (isObject(raw.wiki)) {
      const apiUrl = str(raw.wiki.apiUrl, 300);
      if (!apiUrl || !/^https?:\/\/[^/\s]+\//.test(apiUrl)) bad('BAD_SPEC');
      const sitename = str(raw.wiki.sitename, 120);
      spec.wiki = sitename ? { apiUrl, sitename } : { apiUrl };
      const topic = str(raw.wiki.topic, 80);
      const lang = str(raw.wiki.lang, 12);
      if (topic) spec.wiki.topic = topic;
      if (lang && /^[a-z-]{2,12}$/.test(lang)) spec.wiki.lang = lang;
      if (raw.wiki.mature === true) spec.wiki.mature = true;
    } else if (raw.wiki != null || !str(raw.customId, 120)) {
      bad('BAD_SPEC');
    }
    const extra = {
      customId: str(raw.customId, 120),
      customName: str(raw.customName, 60),
      customTagline: str(raw.customTagline, 160),
      icon: str(raw.icon, 40),
      accent: color(raw.accent),
      accent2: color(raw.accent2)
    };
    for (const [k, v] of Object.entries(extra)) if (v != null) spec[k] = v;
  }
  return spec;
}

export function specOrNull(raw) {
  try {
    return checkSpec(raw);
  } catch {
    return null;
  }
}

export function checkItem(item, ctx = 'grant') {
  if (!isObject(item)) bad('BAD_ITEM');
  const kind = str(item.kind, 20);
  switch (kind) {
    case 'coins':
    case 'ink':
    case 'xp': {
      const lim = kind === 'coins' ? 100000000 : 10000000;
      if (!whole(item.amount, -lim, lim)) bad('BAD_AMOUNT');
      if (item.amount === 0 || (item.amount < 0 && (kind === 'xp' || ctx !== 'grant'))) bad('BAD_AMOUNT');
      return { kind, amount: item.amount };
    }
    case 'level':
      if (!whole(item.value, 1, 500)) bad('BAD_LEVEL');
      return { kind, value: item.value };
    case 'boostersOpened':
      if (!whole(item.value, 0, 10000000)) bad('BAD_VALUE');
      return { kind, value: item.value };
    case 'booster': {
      let count = 1;
      if (has(item, 'count')) {
        if (!whole(item.count, 1, 100)) bad('BAD_COUNT');
        count = item.count;
      }
      return { kind, spec: checkSpec(item.spec), count };
    }
    case 'card': {
      const src = isObject(item.card) ? item.card : item;
      const article = src.article;
      if (!isObject(article) || JSON.stringify(article).length > 20000) bad('BAD_CARD');
      const key = str(article.key, 320);
      if (!key) bad('BAD_CARD');
      let rarityId = 'common';
      if (src.rarityId != null) {
        rarityId = str(src.rarityId, 20);
        if (!RARITY_IDS.includes(rarityId)) bad('BAD_CARD');
      }
      let count = 1;
      if (has(src, 'count')) {
        if (!whole(src.count, 1, 100)) bad('BAD_COUNT');
        count = src.count;
      }
      const rest = { ...article };
      delete rest.rarityId;
      delete rest.count;
      return { kind, article: { ...rest, key, title: str(article.title, 300) ?? key }, rarityId, count };
    }
    case 'owned':
    case 'revokeOwned': {
      if (kind === 'revokeOwned' && ctx !== 'grant') bad('BAD_KIND');
      const bucket = str(item.bucket, 20);
      if (!ITEM_BUCKETS.includes(bucket)) bad('BAD_OWNED');
      if (kind === 'owned' && Array.isArray(item.ids)) {
        if (item.ids.length < 1 || item.ids.length > 50 || item.ids.some((x) => !str(x, 80))) bad('BAD_OWNED');
        const ids = [...new Set(item.ids.map((x) => x.trim()))];
        return ids.length > 1 ? { kind, bucket, ids } : { kind, bucket, id: ids[0] };
      }
      const id = str(item.id, 80);
      if (!id) bad('BAD_OWNED');
      return { kind, bucket, id };
    }
    case 'takeCard': {
      if (ctx !== 'grant') bad('BAD_KIND');
      const key = str(item.key, 320);
      if (!key) bad('BAD_CARD');
      return { kind, key };
    }
    default:
      return bad('BAD_KIND');
  }
}

export function checkItems(items, ctx = 'grant') {
  if (!Array.isArray(items) || items.length < 1 || items.length > 50) bad('BAD_ITEMS');
  return items.map((item) => checkItem(item, ctx));
}
