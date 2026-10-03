import { check, done } from './lib.mjs';

const { useLanguageSource } = await import('../../src/i18n.js');
useLanguageSource(() => 'en');
const { RARITIES } = await import('../../src/data/rarities.js');
const { oddsFor } = await import('../../src/data/odds.js');
const { drawArticlesMany } = await import('../../src/wiki/core.js');
const { useArticlePool, poolPlan, compactCard, POOL_MAX, repicture } = await import('../../src/wiki/pool.js');
const { usePictureCache, textCardArt, isTextArt } = await import('../../src/wiki/art.js');
usePictureCache({ async get() { return []; }, async put() {} });

function seeded(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const text = (title) => `${title} is an article with enough words in its lead to make a proper card for the test of the pool.`;
const article = (i, extra = {}) => ({
  key: `wikipedia:en:${i}`, sourceId: 'wikipedia:en', sourceName: 'Wikipedia', pageId: i, title: `Pooled ${i}`,
  description: 'd', extract: text(`Pooled ${i}`), thumbnail: `https://upload.wikimedia.org/p/${i}.jpg`,
  url: `https://en.wikipedia.org/wiki/Pooled_${i}`, lang: 'en', views: 1000 + i, popularity: 0.3, ...extra
});

const rows = new Map();
const meta = new Map();
let draws = 0;
let fills = 0;
const dbRandom = seeded(7);
const store = {
  async draw(id, n) {
    draws++;
    const list = [...(rows.get(id) ?? new Map()).values()];
    for (let i = list.length - 1; i > 0; i--) { const j = Math.floor(dbRandom() * (i + 1)); [list[i], list[j]] = [list[j], list[i]]; }
    const m = meta.get(id);
    return { cards: list.slice(0, n), size: list.length, due: !m };
  },
  async fill(id, kind, cards, max) {
    fills++;
    const held = rows.get(id) ?? new Map();
    for (const c of cards) held.set(c.key, c);
    while (held.size > max) held.delete(held.keys().next().value);
    rows.set(id, held);
    meta.set(id, { kind, at: Date.now() });
    return held.size;
  },
  async fail() {},
  async release() {},
  later: () => {}
};
useArticlePool(store);

const odds = oddsFor(null);
const pack = { name: 'Test', cards: 5, source: 'wikipedia', queries: ['pooltest'], match: [], odds, guarantee: null, look: { icon: 'book' } };
const plan = await poolPlan(pack);
await store.fill(plan.id, 'wiki', Array.from({ length: POOL_MAX }, (_, i) => compactCard(article(i + 1))), POOL_MAX);

const sets = await drawArticlesMany(pack, 30, { random: seeded(1) });
const keys = sets.flat().map((c) => c.key);
check('thirty boosters come out of the pool in one read', sets.length === 30 && sets.every((s) => s.length === 5) && draws === 1, `${sets.length} sets, ${draws} reads`);
check('no article twice in a batch', new Set(keys).size === keys.length);

const BOOSTERS = 4000;
const random = seeded(42);
const seen = new Map();
const rarity = new Map();
let ordered = 0;
let pairsInOrder = 0;
let previous = null;
for (let i = 0; i < BOOSTERS; i++) {
  const [set] = await drawArticlesMany(pack, 1, { random });
  const idx = set.map((c) => Number(c.pageId));
  if (idx.every((v, k) => k === 0 || v > idx[k - 1])) ordered++;
  if (previous && idx[0] === previous.at(-1) + 1) pairsInOrder++;
  previous = idx;
  for (const c of set) {
    seen.set(c.key, (seen.get(c.key) ?? 0) + 1);
    rarity.set(c.rarityId, (rarity.get(c.rarityId) ?? 0) + 1);
  }
}
const total = BOOSTERS * 5;
const sum = odds.reduce((a, b) => a + b, 0);
const worst = Math.max(...RARITIES.map((r, i) => Math.abs((rarity.get(r.id) ?? 0) / total - odds[i] / sum)));
check('the rarities follow the pack odds', worst < 0.01, `worst gap ${(worst * 100).toFixed(2)} points`);
const counts = [...seen.values()];
const mean = total / POOL_MAX;
const sd = Math.sqrt(counts.reduce((a, n) => a + (n - mean) ** 2, 0) / counts.length);
check('every article of the pool turns up', seen.size === POOL_MAX, String(seen.size));
check('articles come out about equally often', sd / mean < 0.2 && Math.min(...counts) > mean * 0.5 && Math.max(...counts) < mean * 1.6,
  `mean ${mean.toFixed(1)} sd ${sd.toFixed(1)} min ${Math.min(...counts)} max ${Math.max(...counts)}`);
check('a booster is not dealt in pool order', ordered / BOOSTERS < 0.05, `${ordered} of ${BOOSTERS} in order`);
check('a booster does not follow on from the last one', pairsInOrder / BOOSTERS < 0.02, `${pairsInOrder} of ${BOOSTERS}`);

const livePages = (from, n) => Object.fromEntries(Array.from({ length: n }, (_, i) => {
  const id = from + i;
  return [id, { pageid: id, title: `Live ${id}`, extract: text(`Live ${id}`), thumbnail: { source: `https://upload.wikimedia.org/l/${id}.jpg` }, fullurl: `https://en.wikipedia.org/wiki/Live_${id}` }];
}));
let liveSeq = 100000;
globalThis.fetch = async (url) => {
  const u = new URL(String(url));
  const body = u.searchParams.get('prop') === 'pageviews' ? { query: { pages: {} } }
    : { query: { searchinfo: { totalhits: 100000 }, pages: livePages((liveSeq += 20), 20) } };
  return new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } });
};
useArticlePool(null);
const liveRarity = new Map();
const liveRandom = seeded(99);
for (let i = 0; i < 400; i++) {
  const got = await drawArticlesMany(pack, 10, { random: liveRandom });
  for (const c of got.flat()) liveRarity.set(c.rarityId, (liveRarity.get(c.rarityId) ?? 0) + 1);
}
const liveTotal = [...liveRarity.values()].reduce((a, b) => a + b, 0);
const gap = Math.max(...RARITIES.map((r) => Math.abs((liveRarity.get(r.id) ?? 0) / liveTotal - (rarity.get(r.id) ?? 0) / total)));
check('pool draws and live draws give the same rarities', liveTotal >= 19000 && gap < 0.015, `${liveTotal} live cards, worst gap ${(gap * 100).toFixed(2)} points`);
useArticlePool(store);

const safeId = (await poolPlan({ ...pack, queries: ['safetest'] })).id;
await store.fill(safeId, 'wiki', Array.from({ length: 60 }, (_, i) => compactCard(article(1000 + i, i % 2 ? { mature: true } : {}))), POOL_MAX);
const safeSets = await drawArticlesMany({ ...pack, queries: ['safetest'], safe: true }, 4, { random: seeded(3) });
check('No NSFW keeps mature articles out of pool draws', safeSets.flat().length > 0 && safeSets.flat().every((c) => !c.mature));
const minorsId = (await poolPlan({ ...pack, queries: ['minortest'] })).id;
await store.fill(minorsId, 'wiki', [...Array.from({ length: 20 }, (_, i) => compactCard(article(2000 + i))),
  compactCard(article(2100, { title: 'Jailbait', extract: text('Jailbait') }))], POOL_MAX);
const minorSets = await drawArticlesMany({ ...pack, queries: ['minortest'] }, 4, { random: seeded(4) });
check('an article that slipped into a pool against the rules is never dealt', minorSets.flat().every((c) => c.title !== 'Jailbait'));

const small = (await poolPlan({ ...pack, queries: ['smalltest'] })).id;
await store.fill(small, 'wiki', Array.from({ length: 12 }, (_, i) => compactCard(article(3000 + i))), POOL_MAX);
const shortSets = await drawArticlesMany({ ...pack, queries: ['smalltest'] }, 5, { random: seeded(5), poolOnly: true });
check('a pool too small for the batch never repeats an article, it hands what it has', shortSets.length === 2 && new Set(shortSets.flat().map((c) => c.key)).size === 10);

const big = compactCard(article(1, { extract: 'x '.repeat(2000), wordCount: 9000 }));
check('pool rows stay compact', big.extract.length <= 601 && !('wordCount' in big));

const plated = compactCard(article(4000, { thumbnail: textCardArt({ title: 'Pooled 4000' }), picture: { source: 'text' } }), { plates: true });
check('a text card sits in a pool as a few bytes, not as its drawing', plated.thumbnail === null && plated.picture.source === 'text' && JSON.stringify(plated).length < 1200);
const plateId = (await poolPlan({ ...pack, queries: ['platetest'] })).id;
await store.fill(plateId, 'wiki', [...Array.from({ length: 12 }, (_, i) => compactCard(article(4100 + i))), ...Array.from({ length: 4 }, (_, i) => compactCard(article(4200 + i, { thumbnail: textCardArt({ title: 'x' }) }), { plates: true }))], POOL_MAX);
const platedSets = await drawArticlesMany({ ...pack, queries: ['platetest'] }, 2, { random: seeded(6), poolOnly: true });
check('a pool deals its pictured articles before any text card', platedSets.flat().length === 10 && platedSets.flat().every((c) => !isTextArt(c.thumbnail)));
const thinSets = await drawArticlesMany({ ...pack, queries: ['platetest'] }, 3, { random: seeded(8), poolOnly: true });
check('and draws the text card again from the title when it has to', thinSets.flat().some((c) => isTextArt(c.thumbnail)) && thinSets.flat().every((c) => c.thumbnail));
const mendPlan = { api: 'https://en.wikipedia.org/w/api.php', look: { subject: 'Test' } };
const realFetch = globalThis.fetch;
globalThis.fetch = async (url) => {
  const u = new URL(String(url));
  const json = (body) => ({ ok: true, status: 200, json: async () => body, headers: { get: () => null } });
  if (u.searchParams.get('prop') === 'images|pageprops') return json({ query: { pages: { 1: { title: 'Pooled 4200', images: [{ title: 'File:Pooled 4200.jpg' }] } } } });
  if (u.searchParams.get('prop') === 'imageinfo') return json({ query: { pages: { '-1': { title: 'File:Pooled 4200.jpg', imageinfo: [{ url: 'https://upload.wikimedia.org/p/4200.jpg', width: 800, height: 600, thumburl: 'https://upload.wikimedia.org/p/640px-4200.jpg', mime: 'image/jpeg' }] } } } });
  return json({ query: { pages: {} }, results: [] });
};
const mended = await repicture(mendPlan, [...rows.get(plateId).values()].filter((c) => c.picture?.source === 'text'));
globalThis.fetch = realFetch;
check('a refill finds the pictures its text cards were missing', mended.length === 1 && mended[0].title === 'Pooled 4200' && mended[0].thumbnail === 'https://upload.wikimedia.org/p/640px-4200.jpg' && !mended[0].picture);

done();
