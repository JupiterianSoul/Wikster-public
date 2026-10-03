import { getLanguage, wikiLang } from '../i18n.js';
import { dealSets, gatherWikipedia, shuffled } from './draw.js';
import { customPoolKey, gatherCustomFor, lookOf } from './custom.js';
import { ACTION } from './core.js';
import { findPictures, isTextArt, textPicture } from './art.js';
import { fetchTopRead } from './fetch.js';
import { titleCards } from './translate.js';
import { cardAllowed } from './safety.js';
import { isUsableText } from './filter.js';
import { maturePage } from './mature.js';
import { TODAY_POOL, todayRarityForRank } from '../economy.js';

export const POOL_MAX = 320;
export const POOL_LOW = 120;
export const WIKI_POOL_MAX = 600;
export const BIG_POOL_MAX = 1200;
export const POOL_SHARE = 0.15;
export const GROW_SHARE = 0.75;
export const ROTATE_SHARE = 0.5;
export const FULL_SHARE = 0.9;
export const POOL_STALE_S = 6 * 3600;
export const REFILL_COUNT = 160;
export const ROTATE_COUNT = 60;
export const REFILL_MAX = 240;
export const REFILL_LANES = 4;
export const REFILL_BUDGET_MS = 25000;
export const REFILLS_AT_ONCE = 2;
export const SAMPLE_SLACK = 1.2;
export const CUSTOM_SAMPLE_SLACK = 2;
export const SAMPLE_MAX = 400;
export const SERVED_KEEP = 500;
export const EXTRACT_MAX = 600;
export const DESCRIPTION_MAX = 160;
export const REPICTURE_MAX = 20;
export const CUSTOM_POOL_VERSION = 2;

let store = null;
const refilling = new Set();
const served = new Map();

export const poolSize = (articles) => {
  const n = Number(articles);
  if (!Number.isFinite(n) || n <= 0) return POOL_MAX;
  return Math.max(POOL_MAX, Math.min(BIG_POOL_MAX, Math.round(n * POOL_SHARE / 40) * 40));
};

const grows = (max) => Math.max(POOL_LOW, Math.round(max * GROW_SHARE));

export function useArticlePool(next) {
  store = next && typeof next.draw === 'function' && typeof next.fill === 'function' ? next : null;
}

export const poolReady = () => Boolean(store);

function hash(text) {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(36);
}

const clip = (text, max) => {
  const s = String(text ?? '');
  if (s.length <= max) return s;
  const cut = s.slice(0, max);
  const at = cut.lastIndexOf(' ');
  return `${(at > max * 0.6 ? cut.slice(0, at) : cut).trimEnd()}…`;
};

export const isPlate = (card) => !card?.thumbnail || isTextArt(card.thumbnail) || card.picture?.source === 'text';

export function compactCard(card, { plates = false } = {}) {
  if (!card?.key || !card.title) return null;
  const { wordCount: _w, article: _a, ...rest } = card;
  const plate = plates && isPlate(card);
  return {
    ...rest,
    ...(plate ? { thumbnail: null, picture: { source: 'text' } } : {}),
    extract: clip(card.extract, EXTRACT_MAX),
    description: clip(card.description, DESCRIPTION_MAX)
  };
}

export function withPlate(card, look) {
  if (card?.thumbnail && !isTextArt(card.thumbnail)) return card;
  return { ...card, ...textPicture(card.title, look) };
}

function wikipediaPlan(pack) {
  const lang = wikiLang();
  const queries = Array.isArray(pack.queries) ? [...pack.queries].sort() : [];
  const match = Array.isArray(pack.match) ? [...pack.match].sort() : [];
  return {
    id: `wp:${lang}:${hash(JSON.stringify([queries, match]))}`,
    kind: 'wiki',
    api: ACTION(),
    look: { ...(pack.look ?? {}), subject: pack.name },
    max: WIKI_POOL_MAX,
    low: grows(WIKI_POOL_MAX),
    stale: POOL_STALE_S,
    fill: (count) => gatherWikipedia(pack, count, { budget: REFILL_BUDGET_MS, lanes: REFILL_LANES }),
    deal: (cards, n, random) => dealSets(pack, cards, n, { random })
  };
}

async function customPlan(pack) {
  if (!pack.wiki?.apiUrl) return null;
  const { wiki, key } = await customPoolKey(pack);
  return {
    id: `cw${CUSTOM_POOL_VERSION}:${getLanguage()}:${key}`,
    kind: 'custom',
    api: wiki.apiUrl,
    hint: wiki.topic ?? pack.name,
    mature: Boolean(wiki.mature),
    look: lookOf(pack, wiki),
    max: poolSize(wiki.articles ?? pack.wiki?.articles),
    low: grows(poolSize(wiki.articles ?? pack.wiki?.articles)),
    stale: POOL_STALE_S,
    keep: (card) => wiki.mature || !(card.mature || maturePage(card)),
    fill: (count) => gatherCustomFor(pack, count, { budget: REFILL_BUDGET_MS, width: REFILL_LANES }),
    deal: (cards, n, random) => dealSets(pack, cards.map((card) => ({
      ...card, description: pack.name, lang: getLanguage(), ...(wiki.mature ? { mature: true } : {})
    })), n, { random })
  };
}

function todayPlan(pack) {
  const lang = wikiLang();
  return {
    id: `td:${lang}:${pack.day}`,
    kind: 'today',
    max: TODAY_POOL,
    low: 1,
    stale: 0,
    fill: async () => {
      const top = (await fetchTopRead(pack.day, lang, TODAY_POOL)).slice(0, TODAY_POOL);
      if (!top.length) throw new Error('NO_TOP_READ');
      const cards = await titleCards(top.map((row) => ({ title: row.title, fallback: row.title, name: null })), { ...pack, source: 'titles', pick: null });
      const rankOf = new Map(top.map((row) => [row.title, row.rank]));
      return cards.filter((card) => card?.key).map((card, i) => ({
        ...card, rarityId: todayRarityForRank(rankOf.get(card.title) ?? top[i]?.rank ?? TODAY_POOL).id
      }));
    },
    deal: (cards, n, random) => {
      const plate = (card) => String(card.thumbnail ?? '').startsWith('data:');
      const ordered = [...shuffled(cards.filter((c) => !plate(c)), random), ...shuffled(cards.filter(plate), random)];
      return dealSets({ ...pack }, ordered, n, { random, stamp: false });
    }
  };
}

function titlesPlan(pack) {
  if (!pack.pick || !Array.isArray(pack.titles) || !pack.titles.length || (pack.extra ?? []).length || pack.titles.length > SAMPLE_MAX) return null;
  const lang = wikiLang();
  const titles = pack.titles.map((t) => [t.title, t.fallback ?? null]);
  return {
    id: `tt:${lang}:${hash(JSON.stringify(titles))}`,
    kind: 'titles',
    max: pack.titles.length,
    low: Math.min(pack.titles.length, Math.max(pack.pick ?? 1, 1)),
    stale: POOL_STALE_S * 4,
    fill: () => titleCards(pack.titles, pack),
    deal: (cards, n, random) => dealSets({ ...pack, cards: pack.pick }, cards, n, { random, stamp: false })
  };
}

export async function poolPlan(pack) {
  if (!pack) return null;
  if (pack.source === 'custom') return customPlan(pack);
  if (pack.source === 'today') return pack.day ? todayPlan(pack) : null;
  if (pack.source === 'titles') return titlesPlan(pack);
  if (!pack.source || pack.source === 'wikipedia') return wikipediaPlan(pack);
  return null;
}

export function usableFromPool(cards, plan, { safe = false } = {}) {
  return (Array.isArray(cards) ? cards : []).filter((card) => card?.key && card.title
    && isUsableText(card.title, card.extract) && cardAllowed(card, { safe }) && (!plan.keep || plan.keep(card)));
}

export async function repicture(plan, plates) {
  const list = (Array.isArray(plates) ? plates : []).filter((card) => card?.title && isPlate(card)).slice(0, REPICTURE_MAX);
  if (!list.length || !plan.api) return [];
  const found = await findPictures(list.map((card) => ({ title: card.title })), {
    apiUrl: plan.api, hint: plan.hint ?? null, allowMature: Boolean(plan.mature), look: plan.look ?? null, deadline: Date.now() + 8000
  }).catch(() => null);
  const out = [];
  for (const card of list) {
    const got = found?.get(card.title);
    if (!got || got.picture?.source === 'text') continue;
    const next = { ...card, thumbnail: got.thumbnail };
    if (got.picture && (got.picture.source !== 'page' || got.picture.pixel)) next.picture = got.picture;
    else delete next.picture;
    out.push(next);
  }
  return out;
}

async function refill(plan, extra = [], size = 0, plates = []) {
  if (!store || refilling.has(plan.id)) return;
  const fetching = refilling.size < REFILLS_AT_ONCE;
  if (!fetching && !extra.length) { await store.release?.(plan.id).catch(() => {}); return; }
  refilling.add(plan.id);
  const started = Date.now();
  try {
    const count = size >= plan.low ? Math.max(ROTATE_COUNT, Math.round(plan.max * 0.2)) : Math.min(REFILL_MAX, Math.max(ROTATE_COUNT, plan.max - size));
    const mended = fetching ? await repicture(plan, plates).catch(() => []) : [];
    const got = fetching ? [...mended, ...await plan.fill(count).catch(() => [])] : [];
    const stamped = plan.kind === 'wiki' || plan.kind === 'custom';
    const rows = [];
    const seen = new Set();
    for (const card of [...extra, ...(Array.isArray(got) ? got : [])]) {
      const row = compactCard(card, { plates: stamped });
      if (!row || seen.has(row.key) || !isUsableText(row.title, row.extract)) continue;
      if (stamped) delete row.rarityId;
      seen.add(row.key);
      rows.push(row);
    }
    if (!rows.length) { await store.fail?.(plan.id); return; }
    await store.fill(plan.id, plan.kind, rows.slice(0, REFILL_MAX + extra.length), plan.max);
    served.delete(plan.id);
    console.info(`Wikster pool ${plan.id}: ${rows.length} articles in ${Date.now() - started} ms`);
  } catch (error) {
    console.warn('pool refill', plan.id, error?.message ?? error);
    await store.fail?.(plan.id).catch(() => {});
  } finally {
    refilling.delete(plan.id);
  }
}

function background(work) {
  const run = Promise.resolve(work).catch(() => {});
  if (typeof store?.later === 'function') store.later(run);
  return run;
}

function servedNow(plan, size, handed) {
  const held = served.get(plan.id) ?? { n: 0, size: 0 };
  const next = { n: held.n + handed, size: size || held.size };
  served.delete(plan.id);
  served.set(plan.id, next);
  if (served.size > SERVED_KEEP) served.delete(served.keys().next().value);
  return next.size > 0 && next.n > next.size * ROTATE_SHARE;
}

function pictureFirst(cards, plan, need) {
  const platesOk = plan.kind === 'wiki' || plan.kind === 'custom';
  if (!platesOk) return cards;
  const pictured = cards.filter((card) => !isPlate(card));
  return (pictured.length >= need ? pictured : cards).map((card) => withPlate(card, plan.look));
}

export async function drawFromPool(pack, n, { safe = false, random = Math.random, live = null, user = null } = {}) {
  if (!store) return null;
  const plan = await poolPlan(pack).catch(() => null);
  if (!plan) return null;
  const sets = Math.max(1, Math.floor(Number(n) || 1));
  const per = Math.max(1, Number(plan.kind === 'titles' ? pack.pick : pack.cards) || 5);
  const ask = Math.min(SAMPLE_MAX, Math.ceil(per * sets * (plan.kind === 'custom' ? CUSTOM_SAMPLE_SLACK : SAMPLE_SLACK)) + 5);
  const rotate = servedNow(plan, 0, 0);
  let got = null;
  try {
    got = await store.draw(plan.id, ask, { low: plan.low, stale: plan.stale, kind: plan.kind, user, rotate });
  } catch (error) {
    console.warn('pool read', plan.id, error?.message ?? error);
    return null;
  }
  const size = Number(got?.size) || 0;
  const raw = Array.isArray(got?.cards) ? got.cards : [];
  const freshCount = Number.isFinite(Number(got?.fresh)) ? Math.max(0, Math.min(raw.length, Number(got.fresh))) : raw.length;
  const fresh = usableFromPool(raw.slice(0, freshCount), plan, { safe });
  const stale = usableFromPool(raw.slice(freshCount), plan, { safe });
  const plates = (plan.kind === 'wiki' || plan.kind === 'custom') ? [...fresh, ...stale].filter(isPlate) : [];
  const need = per * sets;
  const dealFrom = (cards, count, floor = Math.min(per, cards.length)) => {
    if (!cards.length || count <= 0) return [];
    const dealt = plan.deal(pictureFirst(cards, plan, per * count), count, random);
    return dealt.filter((set) => set.length >= floor);
  };
  const freshSets = Math.min(sets, Math.floor(fresh.length / per)) || (fresh.length && !stale.length ? 1 : 0);
  const full = dealFrom(fresh, freshSets);
  let missing = sets - full.length;
  const due = Boolean(got?.due) || servedNow(plan, size, full.length * per);
  const used = () => new Set(full.flat().map((card) => card.key));
  const spare = () => { const taken = used(); return [...fresh, ...stale].filter((card) => !taken.has(card.key)); };
  const deep = size >= plan.max * FULL_SHARE;
  const goLive = missing > 0 && typeof live === 'function' && (deep || spare().length < missing * per);
  let extra = [];
  if (goLive) {
    const taken = used();
    extra = (await live(missing).catch(() => [])).filter((set) => Array.isArray(set) && set.length)
      .map((set) => set.filter((card) => !taken.has(card.key))).filter((set) => set.length);
    full.push(...extra);
    missing = sets - full.length;
  }
  if (due || extra.length) background(refill(plan, extra.flat(), size, plates));
  if (missing > 0 && !(deep && typeof live !== 'function')) full.push(...dealFrom(spare(), missing, full.length ? per : 1));
  return full;
}

export const poolInternals = { refilling, hash, wikipediaPlan, served };
