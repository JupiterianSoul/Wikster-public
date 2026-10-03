import { wikiLang } from '../i18n.js';
import { RARITIES, rarityRank } from '../data/rarities.js';
import { rollRarity } from '../data/odds.js';
import { popularityFromViews } from '../pricing.js';
import { ACTION, DRAW_BUDGET_MS, FILL_ROUNDS, MAX_SEARCH_OFFSET, deadQueries, offline, querySizeCache } from './core.js';
import { POOL_LIMIT, bestImage, fetchViewsFor, freshlyVandalised, pageToCard, randomPool, searchPool, subjectScore } from './fetch.js';
import { isUsableText } from './filter.js';
import { findPictures, textPicture } from './art.js';

export function shuffled(arr, random = Math.random) {
  const out = [...arr];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

export async function gatherCandidates(pack) {
  const live = (pack.queries ?? []).filter((q) => !deadQueries.has(`${wikiLang()}|${q}`));
  const pages = [];

  if (!live.length) pages.push(...await randomPool().catch(() => []));

  if (live.length) {
    const queries = shuffled(live).slice(0, Math.min(2, live.length));
    const leansFamous = rarityRank(pack.guarantee ?? 'common') >= 2;
    const pools = await Promise.all(queries.map((q, i) =>
      searchPool(q, { preferBig: leansFamous && i === 0 }).catch(() => [])));
    for (const pool of pools) pages.push(...pool);
  }

  if (!pages.length) pages.push(...await randomPool().catch(() => []));

  const seen = new Set();
  const scored = [];
  for (const page of pages) {
    if (seen.has(page.title)) continue;
    seen.add(page.title);
    if (!isUsableText(page.title, page.extract)) continue;
    const score = subjectScore(pack, page);
    if (score > 0) scored.push({ page, score });
  }
  return [...shuffled(scored.filter((c) => c.score === 2)), ...shuffled(scored.filter((c) => c.score === 1))]
    .map((c) => c.page);
}

export const BARE_PATIENCE_MS = 7000;

export async function picturedCards(pack, pages, seen, wanted, deadline) {
  const bare = pages.filter((page) => !seen.has(page.title) && !bestImage(page) && isUsableText(page.title, page.extract) && !freshlyVandalised(page))
    .slice(0, wanted + 2);
  if (!bare.length) return [];
  for (const page of bare) seen.add(page.title);
  const look = pack.look ?? null;
  const arts = await findPictures(bare, {
    apiUrl: ACTION(), look: look ? { ...look, subject: pack.name } : { subject: pack.name },
    deadline: Math.min(deadline, Date.now() + BARE_PATIENCE_MS)
  }).catch(() => null);
  return bare.map((page) => pageToCard(page, null, arts?.get(page.title) ?? textPicture(page.title, { ...look, subject: pack.name })))
    .filter(Boolean)
    .sort((a, b) => (a.picture?.source === 'text' ? 1 : 0) - (b.picture?.source === 'text' ? 1 : 0))
    .slice(0, wanted);
}

export function rollWishes(pack, wanted, random = Math.random) {
  const wishes = Array.from({ length: wanted }, () => rollRarity(pack.odds, random));
  if (!pack.guarantee) return wishes;
  const promised = rarityRank(pack.guarantee);
  if (wishes.some((wish) => rarityRank(wish) >= promised)) return wishes;
  wishes[Math.floor(random() * wishes.length)] = pack.guarantee;
  return wishes;
}

export function settleWishes(pack, wishes, count, random = Math.random) {
  const kept = wishes.slice(0, Math.max(1, count));
  if (!pack.guarantee) return kept;
  const promised = rarityRank(pack.guarantee);
  if (kept.some((wish) => rarityRank(wish) >= promised)) return kept;
  kept[Math.floor(random() * kept.length)] = pack.guarantee;
  return kept;
}

export function stampSet(pack, set, random = Math.random) {
  const wanted = Math.max(1, pack.cards ?? 5);
  return stampPrints(set, settleWishes(pack, cappedWishes(pack, rollWishes(pack, wanted, random)), set.length, random));
}

export function dealSets(pack, cards, n, { random = Math.random, stamp = true } = {}) {
  const sets = Math.max(1, Math.floor(Number(n) || 1));
  const wanted = Math.max(1, pack.cards ?? 5);
  const seen = new Set();
  const unique = [];
  for (const card of shuffled(cards, random)) {
    const id = card?.key ?? card?.title;
    if (!id || seen.has(id)) continue;
    seen.add(id);
    unique.push({ ...card });
  }
  const out = [];
  for (let i = 0; i < sets && (i + 1) * wanted <= unique.length; i++) out.push(unique.slice(i * wanted, (i + 1) * wanted));
  if (!out.length && unique.length) out.push(unique.slice(0, wanted));
  return stamp ? out.map((set) => stampSet(pack, set, random)) : out;
}

export function ceilingRank(pack) {
  if (pack.maxPopularity == null) return RARITIES.length - 1;
  for (let i = RARITIES.length - 1; i >= 0; i--) {
    if (RARITIES[i].minPop < pack.maxPopularity) return i;
  }
  return 0;
}

export function cappedWishes(pack, wishes) {
  const ceiling = ceilingRank(pack);
  return wishes.map((wish) => (rarityRank(wish) > ceiling ? RARITIES[ceiling].id : wish));
}

export function pagesToCards(pages, seen) {
  const fresh = pages.filter((page) => !seen.has(page.title) && bestImage(page) && isUsableText(page.title, page.extract));
  for (const page of fresh) seen.add(page.title);
  return fresh.map((page) => pageToCard(page, null)).filter(Boolean);
}

export const VIEWS_PATIENCE_MS = 1500;

export async function priceOnReadership(cards) {
  const titles = cards.map((card) => card.title);
  if (!titles.length) return cards;
  const views = await Promise.race([
    fetchViewsFor(titles).catch(() => null),
    new Promise((resolve) => setTimeout(() => resolve(null), VIEWS_PATIENCE_MS))
  ]);
  if (!views) return cards;
  for (const card of cards) {
    const n = views.get(card.title);
    if (n == null) continue;
    card.views = n;
    card.popularity = popularityFromViews(n);
  }
  return cards;
}

export function stampPrints(cards, wishes) {
  cards.forEach((card, i) => { card.rarityId = wishes[i] ?? wishes[wishes.length - 1] ?? RARITIES[0].id; });
  return cards;
}

export const FILL_LANES = 4;

export async function drawWikipediaSet(pack, { budget = DRAW_BUDGET_MS } = {}) {
  const wanted = Math.max(1, pack.cards ?? 5);
  const seen = new Set();
  const deadline = Date.now() + budget;
  const outOfTime = () => Date.now() > deadline || offline();

  if (offline()) throw new Error('OFFLINE');

  const wishes = cappedWishes(pack, rollWishes(pack, wanted));
  const candidates = await gatherCandidates(pack);
  const out = pagesToCards(candidates, seen).slice(0, wanted);
  if (out.length < wanted && !outOfTime()) out.push(...await picturedCards(pack, candidates, seen, wanted - out.length, deadline));

  for (let round = 0; out.length < wanted && round < FILL_ROUNDS && !outOfTime();) {
    const lanes = Math.min(FILL_ROUNDS - round, FILL_LANES, Math.max(1, Math.ceil((wanted - out.length) / 8)));
    round += lanes;
    const pools = await Promise.all(Array.from({ length: lanes }, () => randomPool().catch(() => [])));
    for (const pool of pools) {
      for (const card of pagesToCards(pool, seen)) { if (out.length >= wanted) break; out.push(card); }
    }
  }
  if (out.length < wanted) console.warn(`Wikster draw "${pack.name}": ${out.length} of ${wanted} cards`);

  if (!out.length) throw new Error(`No usable article found for "${pack.name}"`);
  if (!outOfTime()) await priceOnReadership(out);
  return stampPrints(out, settleWishes(pack, wishes, out.length));
}

export const MANY_LANES = 12;
export const MANY_BARE_MAX = 12;

const GUESS_ROAM = 200;

function offsetsFor(query, preferBig) {
  const known = querySizeCache.get(`${wikiLang()}|${query}`);
  const roam = Math.min(known ?? GUESS_ROAM, preferBig ? 300 : MAX_SEARCH_OFFSET);
  const slots = Math.max(1, Math.floor(roam / POOL_LIMIT));
  const list = shuffled(Array.from({ length: slots }, (_, i) => i * POOL_LIMIT));
  return known == null ? [0, ...list.filter((at) => at !== 0)] : list;
}

function searchPlan(pack, count, leansFamous, offsets) {
  const live = shuffled((pack.queries ?? []).filter((q) => !deadQueries.has(`${wikiLang()}|${q}`)));
  if (!live.length) return [];
  for (const q of live) if (!offsets.has(q)) offsets.set(q, offsetsFor(q, leansFamous));
  const out = [];
  for (let i = 0; out.length < count && i < count * live.length; i++) {
    const q = live[i % live.length];
    const at = offsets.get(q).shift();
    if (at == null) continue;
    out.push(() => searchPool(q, { preferBig: leansFamous && i % 2 === 0, at }));
  }
  return out;
}

export async function gatherWikipedia(pack, total, { budget = DRAW_BUDGET_MS, lanes = MANY_LANES } = {}) {
  const seen = new Set();
  const deadline = Date.now() + budget;
  const outOfTime = () => Date.now() > deadline || offline();
  if (offline()) throw new Error('OFFLINE');
  const leansFamous = rarityRank(pack.guarantee ?? 'common') >= 2;

  const strong = [];
  const weak = [];
  const loose = [];
  const bare = [];
  const take = (pages, anything) => {
    for (const page of pages) {
      if (seen.has(page.title)) continue;
      seen.add(page.title);
      if (!isUsableText(page.title, page.extract)) continue;
      const score = anything ? 1 : subjectScore(pack, page);
      if (score <= 0) continue;
      if (!bestImage(page)) { if (!anything && !freshlyVandalised(page)) bare.push(page); continue; }
      const card = pageToCard(page, null);
      if (card) (anything ? loose : score === 2 ? strong : weak).push(card);
    }
  };
  const have = () => strong.length + weak.length + loose.length;
  const offsets = new Map();
  const budgetJobs = Math.ceil(total / 6) + lanes;
  let jobs = 0;
  let searches = 0;
  const searchCap = Math.ceil(total / 8) + 4;
  const nextJob = () => {
    if (searches < searchCap) {
      const [search] = searchPlan(pack, 1, leansFamous, offsets);
      if (search) { searches++; return { run: search, anything: false }; }
    }
    return { run: () => randomPool(), anything: true };
  };
  const lane = async () => {
    while (have() < total && jobs < budgetJobs && !outOfTime()) {
      jobs++;
      const job = nextJob();
      take(await job.run().catch(() => []), job.anything);
    }
  };
  await Promise.all(Array.from({ length: Math.min(lanes, Math.max(1, Math.ceil(total / 8))) }, lane));

  const cards = [...shuffled(strong), ...shuffled(weak), ...shuffled(loose)];
  if (cards.length < total && bare.length && !outOfTime()) {
    const missing = Math.min(total - cards.length, MANY_BARE_MAX);
    cards.push(...await picturedCards(pack, bare, new Set(), missing, deadline));
  }
  const kept = cards.slice(0, total);
  if (kept.length && !outOfTime()) await priceOnReadership(kept);
  return kept;
}

export async function drawWikipediaMany(pack, n, { budget = DRAW_BUDGET_MS, random = Math.random } = {}) {
  const sets = Math.max(1, Math.floor(Number(n) || 1));
  const wanted = Math.max(1, pack.cards ?? 5);
  const cards = await gatherWikipedia(pack, wanted * sets, { budget });
  if (!cards.length) throw new Error(`No usable article found for "${pack.name}"`);
  return dealSets(pack, cards, sets, { random });
}
