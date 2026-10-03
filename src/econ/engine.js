import { CUSTOM_SHOP_CARDS, customShopSpec, generateShop, rollCrate } from '../shop.js';
import {
  CRATE_BASE_PRICE, CUSTOM_CARD_RANGE, CUSTOM_QTY_RANGE, boosterPrice, STARTER_PACKS, STARTER_PACK_CARDS,
  TODAY_CARDS, canFuse, cratePriceAt, freeWindowAt, fuseCopies, fuseTierFor, sellPriceFor, shopPrice, starterCoins,
  legacyWindowAt, stipendAmount, stipendHourOf, stipendMaxBanked, todayPrice, windowIndexAt
} from '../economy.js';
import { specColours, specIcon, specId, specName, toDrawPack } from '../booster.js';
import { priceFor } from '../pricing.js';
import { rarityById, rarityOfCard, rarityRank } from '../data/rarities.js';
import { THEME_PACKS, themeById } from '../data/packs.js';
import { getLanguage } from '../i18n.js';
import { screenText } from '../wordfilter.js';
import { matureOptedIn, noNsfwMeta } from '../age.js';
import { matureHost, matureTopic } from '../wiki/mature.js';
import { cardAllowed, minorsText, minorsWiki } from '../wiki/safety.js';
import { seasonAt, seasonSpec } from '../season.js';
import { SPECIAL_RARITY_ID, cleanCodeDef, codeDefsOf, learnCodeDefs, missingCodeDefs } from '../codedefs.js';
import { isFriendSpec } from '../friendcodes.js';
import { addXp, rewardForLevel, xpForCard } from '../progression.js';
import { claim as claimDaily, emptyDaily, normalizeDaily } from '../daily.js';
import { accrue, emptyTimed, maxHeld, timedLevel, timedSpec } from '../timed.js';
import { CUSTOM_THEME_PRICE, INK_DAILY_WEEK, LOOK_PRICE, OPENING_PRICE, THEME_PRICE, exchangeCost, fxPrice, inkForAchievement, inkForLevel } from '../ink.js';
import { DEFAULT_THEME, THEMES } from '../ui/themes.js';
import { CUSTOM_THEME } from '../ui/customtheme.js';
import { inkFramePrice } from '../frames.js';
import { fxExists } from '../data/fx.js';
import { lookById, openingById } from '../data/looks.js';
import { ACHIEVEMENTS, measure } from '../achievements.js';
import {
  ALBUM_TIERS, albumHasTiers, albumTierBooster, albumTiersReached, albumsDeep, albumsHundred, albumsStarted, buildAlbums
} from '../albums.js';
import { entryToRow, pullEntry, rowToEntry } from './cards.js';
import { ECON_KEYS, EconError, MAX_CUSTOM_PACKS, clone, commit, dayBefore, fail, invOp, utcDay } from './core.js';
import { track } from './track.js';
import { REWARD_ACTIONS } from './rewards.js';
import { dealQuests } from '../data/quests.js';
import { SOCIAL_ACTIONS } from './social.js';
import { SERVER_ONLY } from './local.js';
import { CARD_FIX, fixSpecialCards } from './fix.js';
import { fixCardPictures } from './picfix.js';
import { buyLive, eventGift, redeemFromBook, withOverrides } from './liveops.js';
import { reservePlan, batchable, batchCap, batchNonce, batchPity, batchSizes, bestPrint, fuseRarity, fuseTierOf, mergedNonce, noteOpen, pityAfter, printCount, printPrice, printsOf, shapeHit, sortedPrints, spareRarity, takePrints, withPity } from './rules.js';

export { ECON_KEYS, EconError };

export const CRATE_ID = 'crate';
export { MAX_CUSTOM_PACKS };

function shuffled(list, random) {
  const out = [...list];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

function parseKey(blob, key) {
  const raw = blob?.data?.[key] ?? (key.startsWith('wikster.') ? blob?.data?.[`packywiki.${key.slice(8)}`] : undefined);
  if (typeof raw !== 'string') return null;
  try { return JSON.parse(raw); } catch { return null; }
}

function customSpecs(custom) {
  return (custom ?? []).map((row) => row.def ?? row).filter((def) => def?.id && def?.wiki?.apiUrl);
}

const boughtIn = (state, id, window) =>
  state.shopStock?.window === window ? Number(state.shopStock.bought?.[id] ?? 0) : 0;

function withBought(state, id, window, n = 1) {
  const stock = state.shopStock?.window === window ? clone(state.shopStock) : { window, bought: {} };
  stock.bought[id] = (Number(stock.bought[id]) || 0) + n;
  return stock;
}


function starterSpecs(random) {
  return shuffled(THEME_PACKS, random).slice(0, STARTER_PACKS).map((theme) => ({
    kind: 'theme', themeId: theme.id, rarityId: null, cards: STARTER_PACK_CARDS
  }));
}

const ATELIER_THEMES = () => THEMES.filter((theme) => !theme.code && !theme.season && !theme.supporter && theme.id !== DEFAULT_THEME).map((th) => th.id);

function atelierPrice(kind, id) {
  if (kind === 'themes' && id === CUSTOM_THEME) return CUSTOM_THEME_PRICE;
  if (kind === 'themes') return ATELIER_THEMES().includes(id) ? THEME_PRICE : null;
  if (kind === 'frames') return inkFramePrice(id);
  if (kind === 'looks') return lookById(id) ? LOOK_PRICE : null;
  if (kind === 'openings') return openingById(id) ? OPENING_PRICE : null;
  if (kind === 'fx') {
    const [rarityId, fxId] = String(id).split(':');
    return fxExists(rarityId, fxId) ? fxPrice(rarityId) : null;
  }
  return null;
}

const PRIVATE_SUFFIXES = ['localhost', 'local', 'internal', 'intranet', 'lan', 'home', 'corp', 'localdomain', 'arpa'];

export function publicWikiUrl(raw) {
  let url;
  try { url = new URL(String(raw ?? '')); } catch { return null; }
  if (url.protocol !== 'https:' || url.port || url.username || url.password) return null;
  if (!/\/api\.php$/.test(url.pathname)) return null;
  const host = url.hostname.toLowerCase();
  if (!host.includes('.') || host.includes(':') || host.startsWith('[')) return null;
  if (/^\d+(\.\d+){3}$/.test(host) || /^[0-9.]+$/.test(host)) return null;
  const last = host.split('.').pop();
  if (PRIVATE_SUFFIXES.includes(last) || PRIVATE_SUFFIXES.some((s) => host === s)) return null;
  return url;
}

export function hostBlocked(host, blocked = []) {
  const h = String(host ?? '').toLowerCase();
  return blocked.some((b) => h === b || h.endsWith(`.${b}`));
}

async function refuseBlockedWiki(ctx, apiUrl) {
  const url = publicWikiUrl(apiUrl) ?? fail('BAD_PACK');
  const blocked = (await ctx.store.blockedHosts?.()) ?? [];
  if (hostBlocked(url.hostname, blocked)) fail('HOST_BLOCKED');
  return url;
}

export function matureOk(ctx) {
  ctx.matureCheck ??= Promise.resolve().then(async () => {
    if (ctx.android) return false;
    if (!ctx.store.account) return false;
    return matureOptedIn(await ctx.store.account());
  });
  return ctx.matureCheck;
}

export function safeOnly(ctx) {
  ctx.safeCheck ??= Promise.resolve().then(async () => {
    if (!ctx.store.account) return false;
    return noNsfwMeta(await ctx.store.account());
  }).catch(() => false);
  return ctx.safeCheck;
}

const refuseMinors = (wiki, extra = []) => { if (minorsWiki(wiki, extra)) fail('CONTENT_REFUSED'); };

async function safeDraw(ctx, pack, options, safe) {
  const first = await ctx.draw(pack, options);
  if (!Array.isArray(first)) return first;
  const ok = (article) => cardAllowed(article, { safe });
  const kept = first.filter(ok);
  if (kept.length === first.length) return kept;
  const want = first.length;
  const seen = new Set(kept.map((a) => a.key));
  for (let round = 0; round < 2 && kept.length < want; round++) {
    const more = await ctx.draw(pack, options).catch(() => []);
    for (const article of Array.isArray(more) ? more : []) {
      if (kept.length >= want) break;
      if (!ok(article) || seen.has(article.key)) continue;
      seen.add(article.key);
      kept.push(article);
    }
  }
  return kept;
}

const REQ_ID = /^[A-Za-z0-9_-]{8,64}$/;

export async function refuseMature(ctx) {
  if (!(await matureOk(ctx))) fail('MATURE_LOCKED');
}

export const wikiIsMature = (wiki) => {
  if (wiki?.mature === true) return true;
  if (typeof wiki?.topic === 'string' && matureTopic(wiki.topic)) return true;
  try { return matureHost(new URL(String(wiki?.apiUrl ?? '')).hostname); } catch { return false; }
};

function sanitizeCustom(def) {
  const text = (v, n) => (typeof v === 'string' ? v.slice(0, n) : null);
  const url = publicWikiUrl(def?.wiki?.apiUrl);
  if (!url) return null;
  if (!text(def?.id, 80)) return null;
  const wiki = {};
  for (const [k, v] of Object.entries(def.wiki ?? {})) {
    if (['string', 'number', 'boolean'].includes(typeof v)) wiki[k] = typeof v === 'string' ? v.slice(0, 400) : v;
  }
  wiki.apiUrl = url.toString();
  if (wiki.mature !== true) delete wiki.mature;
  if (typeof wiki.topic === 'string') wiki.topic = wiki.topic.replace(/\s+/g, ' ').trim().slice(0, 80) || undefined;
  if (!wiki.topic) delete wiki.topic;
  return {
    id: text(def.id, 80),
    name: text(def.name, 60) ?? 'Custom',
    tagline: text(def.tagline, 160) ?? '',
    icon: text(def.icon, 40),
    accent: text(def.accent, 20),
    accent2: text(def.accent2, 20),
    art: text(def.art, 600),
    lang: text(def.lang, 12),
    query: text(def.query, 120),
    wiki
  };
}

function importOps(blob, loaded) {
  const wallet = Math.max(0, Math.round(Number(parseKey(blob, 'wikster.wallet.v1')) || 0));
  const inkN = Math.max(0, Math.floor(Number(parseKey(blob, 'wikster.ink.v1')) || 0));
  const inventory = parseKey(blob, 'wikster.inventory.v1') ?? {};
  const collection = parseKey(blob, 'wikster.collection.v3') ?? { entries: {} };
  const profile = parseKey(blob, 'wikster.profile.v1') ?? {};
  const add = [];
  for (const entry of Object.values(collection.entries ?? {})) {
    if (!entry?.key || !entry.title) continue;
    add.push(entryToRow(entry, 'import'));
  }
  const inv = [];
  for (const slot of Object.values(inventory)) {
    const n = Math.floor(Number(slot?.count) || 0);
    if (slot?.spec && n > 0) inv.push(invOp(slot.spec, n));
  }
  const state = {};
  for (const key of ECON_KEYS) if (profile[key] !== undefined) state[key] = profile[key];
  state.imported = true;
  return {
    ops: {
      coins: wallet - (Number(loaded.wallet.coins) || 0),
      ink: inkN - (Number(loaded.wallet.ink) || 0),
      inventory: inv,
      add,
      state,
      claims: ['import'],
      kind: 'import',
      reason: 'the save this account already had'
    },
    custom: parseKey(blob, 'wikster.customPacks.v2') ?? [],
    keys: add.map((row) => row.key)
  };
}

function albumsOf(entries, custom) {
  return buildAlbums(entries, customSpecs(custom));
}

const DEEPEST_NEED = Math.max(...ALBUM_TIERS.map((tier) => Number(tier.need) || 0));

async function sizeAlbums(albums, claimed, ctx) {
  for (const album of albums) {
    if (!albumHasTiers(album) || album.owned <= 0 || album.total != null) continue;
    if ((Number(claimed[album.key]) || 0) >= ALBUM_TIERS.length) continue;
    const roll = album.kind === 'theme' ? themeById(album.themeId)?.titles : null;
    let total = null;
    if (roll) total = (roll[getLanguage()] ?? roll.en ?? []).length;
    else if (ctx.albumTotal && (album.kind === 'custom' || (album.kind === 'theme' && album.owned >= DEEPEST_NEED))) {
      total = await ctx.albumTotal(album).catch(() => null);
    }
    if (Number.isFinite(total) && total > 0) album.total = Math.max(total, album.owned);
  }
}

export const SERVER_STATS = new Set([
  'boosters', 'cards', 'unique', 'value', 'level', 'albumsDeep', 'albumsStarted', 'albumsHundred', 'legendaries',
  'prismatics', 'customsBuilt', 'dailyClaims', 'boardsDone', 'sold', 'timedOpened', 'wallet', 'maxCardPrice',
  'maxViews', 'favorites', 'maxCopies', 'raritiesOwned', 'albumTiers', 'fused', 'commons', 'uncommons', 'rares',
  'epics', 'mythics', 'exotics', 'seasonPoints', 'seasonsPlayed', 'seasonBadges', 'themesOwned', 'framesOwned',
  'fxOwned', 'codesRedeemed', 'giftWeeks', 'specials'
]);

async function achievementStat(ctx, loaded, stat, facts) {
  if (!SERVER_STATS.has(stat)) {
    const n = Number(facts?.[stat]);
    return Number.isFinite(n) ? n : 0;
  }
  const all = (await ctx.store.cards(null)).map(rowToEntry);
  const entries = all.filter((e) => !e.special);
  const custom = customSpecs(loaded.custom);
  const measured = measure({
    profile: loaded.state,
    entries,
    albumsDeep: albumsDeep(entries, custom),
    albumsStarted: albumsStarted(entries, custom),
    albumsHundred: albumsHundred(entries, custom),
    customPacks: custom,
    friends: 0,
    wallet: loaded.wallet.coins,
    specials: all.filter((e) => e.special).length
  });
  return Number(measured[stat]) || 0;
}

export const READY_FILL_MAX = 60;
export const READY_LANES = 3;
export const READY_FILL_MS = 20000;
export const FOREGROUND_DRAW_MS = 14000;
export const READY_DRAW_MS = 15000;

const skipList = (skip) => (Array.isArray(skip) ? skip : []).map(String).filter((n) => n.length <= 64).slice(0, 80);

function readyWanted(loaded, now, opening = new Map(), focus = null) {
  const specs = new Map();
  const slots = [];
  for (const [id, slot] of Object.entries(loaded.inventory ?? {})) {
    const left = (Number(slot?.count) || 0) - (opening.get(id) ?? 0);
    if (!slot?.spec || !(left > 0)) continue;
    if (slot.spec.kind === 'timed' && (Number(slot.spec.timedSlots) || 1) > 1) continue;
    specs.set(id, slot.spec);
    slots.push({ id, left });
  }
  const timed = accrue(clone(loaded.state.timed) ?? emptyTimed(), now);
  if ((timed.count ?? 0) > 0) {
    const spec = timedSpec(timedLevel(timed.opened ?? 0));
    const id = specId(spec);
    const left = (Number(loaded.inventory?.[id]?.count) || 0) + (timed.count ?? 0) - (opening.get(id) ?? 0);
    const at = slots.findIndex((s) => s.id === id);
    if (at >= 0) slots.splice(at, 1);
    if (left > 0) { specs.set(id, spec); slots.push({ id, left }); }
  }
  const wanted = new Map();
  for (const [id, want] of reservePlan(slots, { focus })) wanted.set(id, { id, spec: specs.get(id), want });
  return wanted;
}

function drawError(error) {
  if (error instanceof EconError) return error;
  const why = String(error?.message ?? error ?? '');
  return new EconError(/responded|fetch|abort|timed? ?out|network|connect|dns|tls/i.test(why) ? 'WIKI_DOWN' : 'DRAW_FAILED', why.slice(0, 160));
}

async function drawSetup(ctx, spec) {
  if (isFriendSpec(spec)) fail('DRAW_FAILED');
  const pack = toDrawPack(spec);
  if (spec?.kind === 'custom') {
    await refuseBlockedWiki(ctx, spec.wiki?.apiUrl);
    refuseMinors(spec.wiki, [spec.customName]);
    if (wikiIsMature(spec.wiki)) {
      await refuseMature(ctx);
      pack.wiki = { ...pack.wiki, mature: true };
    }
  }
  const safe = await safeOnly(ctx);
  if (safe) pack.safe = true;
  return { pack, safe };
}

function pullCards(ctx, spec, pack, articles) {
  const ordered = spec.kind === 'code' ? articles : shuffled(articles, ctx.random);
  const colours = specColours(spec);
  const rated = ordered.map((article) => ({
    article,
    special: Boolean(article.special),
    rarityId: article.special ? SPECIAL_RARITY_ID : rarityOfCard(article).id
  }));
  const shaped = spec.kind === 'code' ? rated : shapeHit(rated, spec, pack.odds, ctx.random);
  return shaped.map(({ article, rarityId }) => {
    const rarity = rarityById(rarityId);
    const price = article.livePrice ?? priceFor(article.popularity, article.special ? rarityById('prismatic') : rarity);
    delete article.livePrice;
    return { article, rarityId: rarity.id, price, packName: specName(spec), packIcon: specIcon(spec), packAccent: colours.accent };
  });
}

async function mergedTimedCards(ctx, spec, pack, options) {
  const slots = Math.max(1, Math.floor(Number(spec.timedSlots) || 1));
  const base = { ...spec, cards: Math.max(1, Math.round((Number(spec.cards) || slots) / slots)), timedSlots: 1 };
  const basePack = toDrawPack(base);
  if (pack.safe) basePack.safe = true;
  const sets = (await ctx.drawMany(basePack, slots, { ...options, random: ctx.random, user: ctx.user ?? null }).catch(() => [])).filter((set) => Array.isArray(set) && set.length);
  const sub = memoOverrides(ctx, [...new Set(sets.flat().map((a) => a?.key).filter(Boolean))]);
  const out = [];
  for (const set of sets) {
    const articles = await withOverrides(sub, set, null);
    if (articles.length) out.push(...pullCards(ctx, base, basePack, articles));
  }
  return out;
}

async function drawPull(ctx, id, spec, options = {}) {
  const { pack, safe } = await drawSetup(ctx, spec);
  if (spec.kind === 'timed' && (Number(spec.timedSlots) || 1) > 1 && typeof ctx.drawMany === 'function') {
    const cards = await mergedTimedCards(ctx, spec, pack, options);
    if (cards.length) {
      const nonce = await ctx.store.stash({ specId: id, spec, cards });
      return nonce ? { nonce, cards } : null;
    }
  }
  const drawOnce = () => safeDraw(ctx, pack, options, safe).catch((error) => { throw drawError(error); });
  const drawn = await drawOnce();
  if (!Array.isArray(drawn) || !drawn.length) fail('DRAW_FAILED');
  const articles = spec.kind === 'code' ? drawn : await withOverrides(ctx, drawn, drawOnce);
  if (!articles.length) fail('DRAW_FAILED');
  const cards = pullCards(ctx, spec, pack, articles);
  const nonce = await ctx.store.stash({ specId: id, spec, cards });
  return nonce ? { nonce, cards } : null;
}

export const MANY_MIN = 1;
export const PREPARE_MAX = 60;
export const OVERRIDE_CHUNK = 60;

function memoOverrides(ctx, keys) {
  if (typeof ctx.store.overrides !== 'function' || !keys.length) return ctx;
  const known = new Map();
  const asked = new Set(keys);
  const chunks = [];
  for (let i = 0; i < keys.length; i += OVERRIDE_CHUNK) chunks.push(keys.slice(i, i + OVERRIDE_CHUNK));
  const ready = Promise.all(chunks.map((chunk) => ctx.store.overrides(chunk).catch(() => [])))
    .then((lists) => { for (const row of lists.flat()) if (row?.article_key) known.set(row.article_key, row); });
  const overrides = async (list) => {
    await ready;
    const rest = list.filter((k) => !asked.has(k));
    const more = rest.length ? await ctx.store.overrides(rest).catch(() => []) : [];
    return [...list.map((k) => known.get(k)).filter(Boolean), ...(Array.isArray(more) ? more : [])];
  };
  return { ...ctx, store: { ...ctx.store, overrides } };
}

async function stashAll(ctx, rows) {
  if (typeof ctx.store.stashMany === 'function' && rows.length > 1) {
    try {
      const nonces = await ctx.store.stashMany(rows);
      if (Array.isArray(nonces) && nonces.length === rows.length) return nonces;
    } catch (error) {
      console.warn('stashMany', error?.message ?? error);
    }
  }
  const out = [];
  for (const row of rows) out.push(await ctx.store.stash(row).catch(() => null));
  return out;
}

export async function drawPulls(ctx, id, spec, n, options = {}) {
  const count = Math.max(0, Math.floor(Number(n) || 0));
  if (!count) return [];
  const many = count >= MANY_MIN && typeof ctx.drawMany === 'function' && spec?.kind !== 'code' && !isFriendSpec(spec);
  if (!many) {
    const out = [];
    let left = count;
    let refused = null;
    const lane = async () => {
      while (left > 0 && !refused) {
        left--;
        const got = await drawPull(ctx, id, spec, options).catch((error) => { if (error instanceof EconError) refused = error; return null; });
        if (got) out.push(got);
      }
    };
    await Promise.all(Array.from({ length: Math.min(READY_LANES, count) }, lane));
    if (!out.length && refused) throw refused;
    return out;
  }
  const { pack } = await drawSetup(ctx, spec);
  const started = Date.now();
  let missed = null;
  const sets = (await ctx.drawMany(pack, count, { ...options, random: ctx.random, user: ctx.user ?? null }).catch((error) => { missed = drawError(error); return []; })).filter((set) => Array.isArray(set) && set.length);
  if (!sets.length) throw missed ?? new EconError('DRAW_FAILED');
  const sub = memoOverrides(ctx, [...new Set(sets.flat().map((a) => a?.key).filter(Boolean))]);
  const finished = [];
  for (const set of sets) {
    const articles = await withOverrides(sub, set, null);
    if (articles.length) finished.push(pullCards(ctx, spec, pack, articles));
  }
  const rows = finished.map((cards) => ({ specId: id, spec, cards }));
  const nonces = await stashAll(ctx, rows);
  const out = [];
  nonces.forEach((nonce, i) => { if (nonce) out.push({ nonce, cards: finished[i] }); });
  console.info(`Wikster pulls x${count} for ${id}: ${out.length} in ${Date.now() - started} ms`);
  return out;
}

const fillingFor = new Map();

export const pullKey = (card) => card?.article?.key ?? card?.k ?? null;

export const slimPull = (cards) => cards.map((c) => ({ k: c.article.key, r: c.rarityId, p: c.price }));

function fullPullCard(card, entry, spec) {
  if (card?.article) return card;
  const colours = specColours(spec);
  const article = entry
    ? (({ rarityId: _r, price: _p, count: _c, favorite: _f, prints: _x, packId: _i, packName: _n, packIcon: _o, packAccent: _a, firstPulledAt: _s, lastPulledAt: _l, ...rest }) => rest)(entry)
    : { key: card.k, title: String(card.k ?? '').replace(/^[a-z-]+:/, '').replace(/_/g, ' ') };
  return { article, rarityId: card.r, price: Number(card.p) || 0, packName: specName(spec), packIcon: specIcon(spec), packAccent: colours.accent };
}

export const READY_NOTIFY_CHUNK = 8;

async function fillReady(ctx, jobs, owner) {
  let failed = 0;
  const notify = async (pulls, last) => {
    if (typeof ctx.notify !== 'function') return;
    for (let i = 0; i < pulls.length || (last && i === 0); i += READY_NOTIFY_CHUNK) {
      const chunk = pulls.slice(i, i + READY_NOTIFY_CHUNK);
      const end = last && i + READY_NOTIFY_CHUNK >= pulls.length;
      try { await ctx.notify('ready', { pulls: chunk, failed, ...(end ? { done: true } : { filling: true }) }); } catch {}
    }
  };
  try {
    const queue = jobs.filter((job) => job.missing > 0).map((job) => ({ ...job, need: job.missing }));
    let left = queue.length;
    if (!left) await notify([], true);
    const lane = async () => {
      while (queue.length) {
        const job = queue.shift();
        const got = await drawPulls(ctx, job.id, job.spec, job.need, { budget: READY_DRAW_MS }).catch(() => []);
        failed += Math.max(0, job.need - got.length);
        left--;
        await notify(got.map((p) => ({ nonce: p.nonce, id: job.id, cards: p.cards })), left === 0);
      }
    };
    await Promise.all(Array.from({ length: Math.min(READY_LANES, Math.max(1, queue.length)) }, lane));
  } catch {
    failed++;
  }
  return failed;
}

function trackFill(owner, work) {
  if (owner == null) return work;
  fillingFor.set(owner, work);
  const clear = () => { if (fillingFor.get(owner) === work) fillingFor.delete(owner); };
  work.then(clear, clear);
  return work;
}

async function timedParts(ctx, baseId, take, spent = []) {
  const list = (await ctx.store.waitingList()).filter((p) => p.specId === baseId && !spent.includes(p.nonce));
  if (list.length < take) return null;
  const parts = list.slice(0, take).map((p) => p.nonce);
  const rows = new Map((await ctx.store.pullCards(parts)).map((row) => [row.nonce, row.cards]));
  if (!parts.every((n) => Array.isArray(rows.get(n)))) return null;
  return { nonce: mergedNonce(parts), parts, cards: parts.flatMap((n) => rows.get(n)) };
}

async function mergeParts(ctx, loaded, nonce, parts) {
  const list = [...new Set(parts.map(String))];
  if (list.length !== parts.length || list.length > 50 || mergedNonce(list) !== nonce) return null;
  const pulls = [];
  for (const n of list) {
    const p = await ctx.store.pullByNonce(n);
    if (!p || p.claimed || p.spec?.kind !== 'timed' || (Number(p.spec.timedSlots) || 1) !== 1) return null;
    pulls.push(p);
  }
  if (!pulls.every((p) => p.specId === pulls[0].specId)) return null;
  const base = pulls[0].spec;
  const spec = { ...base, cards: base.cards * list.length, timedSlots: list.length };
  const id = specId(spec);
  if (!((Number(loaded.inventory?.[id]?.count) || 0) > 0)) fail('NOT_HELD');
  const cards = pulls.flatMap((p) => p.cards);
  await ctx.store.stash({ specId: id, spec, cards, nonce });
  const pull = await ctx.store.pullByNonce(nonce);
  return pull ? { pull, parts: list } : null;
}

async function batchParts(ctx, loaded, nonce, parts) {
  const list = [...new Set(parts.map(String))];
  if (list.length !== parts.length || list.length < 2 || list.length > 50 || batchNonce(list) !== nonce) return null;
  const waiting = new Map((await ctx.store.waitingList()).map((p) => [p.nonce, p.specId]));
  const id = waiting.get(list[0]);
  if (!id || !list.every((n) => waiting.get(n) === id)) return null;
  const slot = loaded.inventory?.[id];
  if (!slot?.spec || (Number(slot.count) || 0) < list.length) fail('NOT_HELD');
  if (!batchable(slot.spec) || list.length > batchCap(slot.spec)) fail('BAD_REQUEST');
  const rows = new Map((await ctx.store.pullCards(list)).map((row) => [row.nonce, row.cards]));
  if (!list.every((n) => Array.isArray(rows.get(n)) && rows.get(n).length)) return null;
  const spec = { ...slot.spec, batch: list.length, sizes: list.map((n) => rows.get(n).length) };
  await ctx.store.stash({ specId: `batch|${list.length}|${id}`, spec, cards: list.flatMap((n) => rows.get(n)), nonce });
  const pull = await ctx.store.pullByNonce(nonce);
  return pull ? { pull, parts: list } : null;
}

async function partsLeft(ctx, nonce, parts, batch) {
  if (!Array.isArray(parts) || parts.length < 2) return [];
  const list = [...new Set(parts.map(String))];
  if (list.length !== parts.length || (batch ? batchNonce(list) : mergedNonce(list)) !== nonce) return [];
  const waiting = new Set((await ctx.store.waitingList()).map((p) => p.nonce));
  return list.filter((n) => waiting.has(n));
}

async function launchSteps(ctx, ask) {
  const day = utcDay(ctx.now);
  let facts = null;
  try { facts = await ctx.store.facts('launch', { day }); } catch { facts = null; }
  const known = facts && typeof facts === 'object' && !Array.isArray(facts) ? facts : null;
  const store = known ? { ...ctx.store, facts: (kind, args) => (Array.isArray(known[kind]) ? Promise.resolve(known[kind]) : ctx.store.facts(kind, args)) } : ctx.store;
  const sub = { ...ctx, store };
  const step = async (fn) => {
    try { return await fn(); } catch (error) { return { error: error instanceof EconError ? error.code : 'FAILED' }; }
  };
  const out = {};
  if (ask.grants) {
    out.grants = await step(async () => {
      const res = await ACTIONS.grants(sub, {});
      return { landed: res.landed ?? [], left: res.left ?? [], local: res.local ?? [], failed: res.failed ?? [] };
    });
  }
  if (ask.collect) {
    out.collect = await step(async () => {
      const res = await ACTIONS.collect(sub, {});
      return { landed: res.landed ?? [], season: res.season ?? null };
    });
  }
  if (ask.stipend) {
    out.stipend = await step(async () => {
      const loaded = await ctx.store.load();
      if (!loaded.state.started) return { paid: 0, skipped: true };
      const res = await ACTIONS.stipend(sub, {});
      return { paid: Number(res.paid) || 0 };
    });
  }
  if (ask.quests && ctx.user) out.quests = questBoard(ctx.user, day, Array.isArray(known?.quests) ? known.quests : null);
  return out;
}

function questBoard(user, day, rows) {
  const expiresAt = new Date(Date.parse(`${day}T00:00:00Z`) + 86400000).toISOString();
  const held = new Map((rows ?? []).map((r) => [r.quest_id, r]));
  const quests = dealQuests(user, day)
    .map((q) => held.get(q.id) ?? { quest_id: q.id, target: q.target, progress: 0, claimed: false, expires_at: expiresAt })
    .map((r) => ({ quest_id: r.quest_id, target: Number(r.target) || 0, progress: Number(r.progress) || 0, claimed: Boolean(r.claimed), expires_at: r.expires_at ?? expiresAt }))
    .sort((a, b) => (a.quest_id < b.quest_id ? -1 : a.quest_id > b.quest_id ? 1 : 0));
  return { day, expiresAt, quests, seeded: rows != null && quests.every((q) => held.has(q.quest_id)) };
}

export async function readyAfter(ctx, ask) {
  try {
    const got = await ACTIONS.ready(ctx, ask && typeof ask === 'object' ? ask : {});
    return got;
  } catch {
    return null;
  }
}

export const SINCE_MAX_MS = 25 * 86400000;
export const SINCE_SLACK_MS = 120000;

function sinceOf(ctx, since) {
  const at = Number(since);
  if (!Number.isFinite(at) || at <= 0 || at > ctx.now || ctx.now - at > SINCE_MAX_MS) return null;
  return typeof ctx.store.cardsSince === 'function' ? at : null;
}

async function settleSync(ctx, sync) {
  if (!sync) return {};
  await ACTIONS.sync(ctx, {});
  return { synced: true };
}

async function fillCodeDefs(ctx, loaded) {
  const ids = missingCodeDefs(loaded.state);
  if (!ids.length || typeof ctx.store.codeDefs !== 'function') return false;
  const found = await ctx.store.codeDefs(ids);
  const defs = {};
  for (const raw of Array.isArray(found) ? found : []) {
    const def = cleanCodeDef(raw);
    if (def && ids.includes(def.id)) defs[def.id] = def;
  }
  if (!Object.keys(defs).length) return false;
  learnCodeDefs(defs);
  await commit(ctx, loaded, { state: { codeDefs: { ...codeDefsOf(loaded.state), ...defs } } });
  return true;
}

export const ACTIONS = {
  async snapshot(ctx, { since = null } = {}) {
    const at = sinceOf(ctx, since);
    if (at != null) ctx.store.prefetch?.({ since: at });
    let loaded = await ctx.store.load();
    try { if (await fillCodeDefs(ctx, loaded)) loaded = await ctx.store.load(); } catch {}
    let fixed = null;
    try { fixed = await fixSpecialCards(ctx, loaded); } catch { fixed = null; }
    if (fixed) loaded = await ctx.store.load();
    let pictured = null;
    try { pictured = await fixCardPictures(ctx, loaded); } catch { pictured = null; }
    if (pictured) loaded = await ctx.store.load();
    const moved = fixed && Object.keys(fixed.renamed).length ? { renamed: fixed.renamed } : {};
    const base = {
      wallet: loaded.wallet,
      state: loaded.state,
      inventory: loaded.inventory,
      custom: customSpecs(loaded.custom),
      since: ctx.now - SINCE_SLACK_MS
    };
    const changed = at != null ? await ctx.store.cardsSince(at) : null;
    if (changed) {
      const cards = {};
      for (const key of changed.gone ?? []) cards[key] = null;
      for (const row of changed.rows ?? []) { const e = rowToEntry(row); cards[e.key] = e; }
      return { ...base, cards, ...moved };
    }
    const rows = await ctx.store.cards(null);
    return { ...base, cards: Object.fromEntries(rows.map((row) => { const e = rowToEntry(row); return [e.key, e]; })), replace: true, ...moved };
  },

  async import(ctx, { since = null, sync = false, launch = null } = {}) {
    const at = sinceOf(ctx, since);
    if (at != null) ctx.store.prefetch?.({ since: at });
    const loaded = await ctx.store.load();
    const ask = launch && typeof launch === 'object' ? launch : null;
    const finish = async (snap, outcome) => {
      const synced = await settleSync(ctx, sync);
      const steps = ask ? await launchSteps(ctx, ask) : null;
      const out = { ...(await ACTIONS.snapshot(ctx, snap)), ...synced, outcome };
      if (steps) out.launch = { ...steps, ...(ask.ready ? { ready: await readyAfter(ctx, ask.ready) } : {}) };
      return out;
    };
    if (loaded.state.imported) return finish({ since: at }, 'already');
    const eligible = loaded.cutover != null && loaded.born != null && loaded.born <= loaded.cutover;
    const blob = eligible ? await ctx.store.legacy() : null;
    if (!blob) {
      await commit(ctx, loaded, { state: { imported: true, cardFix: CARD_FIX }, claims: ['import'], kind: 'import', reason: 'nothing to carry over' });
      return finish({}, eligible ? 'empty' : 'new');
    }
    const { ops, custom } = importOps(blob, loaded);
    for (const def of Array.isArray(custom) ? custom.slice(0, MAX_CUSTOM_PACKS) : []) {
      const clean = sanitizeCustom(def);
      if (clean) await ctx.store.customPut(clean);
    }
    await commit(ctx, loaded, ops);
    return finish({}, 'imported');
  },

  async starter(ctx) {
    const loaded = await ctx.store.load();
    if (loaded.state.started) fail('ALREADY_CLAIMED');
    const specs = starterSpecs(ctx.random);
    return commit(ctx, loaded, {
      coins: starterCoins(),
      inventory: specs.map((spec) => invOp(spec, 1)),
      state: { started: true, stipendHour: windowIndexAt(ctx.now), stipendWindow: legacyWindowAt(ctx.now), createdAt: ctx.now },
      claims: ['starter'],
      kind: 'starter'
    }, { extra: { specs } });
  },

  async stipend(ctx) {
    const loaded = await ctx.store.load();
    const now = windowIndexAt(ctx.now);
    const last = stipendHourOf(loaded.state);
    const stamp = { stipendHour: now, stipendWindow: legacyWindowAt(ctx.now) };
    if (last == null) return commit(ctx, loaded, { state: stamp }, { extra: { paid: 0 } });
    const missed = Math.min(stipendMaxBanked(), now - last);
    if (missed <= 0) return { ...(await commit(ctx, loaded, {})), paid: 0 };
    const paid = missed * stipendAmount();
    return commit(ctx, loaded, {
      coins: paid,
      state: stamp,
      claims: [`stipendh:${now}`],
      kind: 'stipend'
    }, { extra: { paid } });
  },

  async buy(ctx, { section, id, customId = null, cards, count = 1, req = null }) {
    const loaded = await ctx.store.load();
    const window = windowIndexAt(ctx.now);
    const freeWindow = freeWindowAt(ctx.now);
    const shop = generateShop(window, customSpecs(loaded.custom), freeWindow, ctx.now);
    const state = loaded.state;

    if (section === 'live') return buyLive(ctx, loaded, String(id ?? ''));

    if (section === 'free') {
      const item = shop.free.find((it) => it.id === id) ?? fail('NOT_IN_SHOP');
      const taken = state.freeTaken?.window === freeWindow ? state.freeTaken.ids ?? [] : [];
      if (taken.includes(id)) fail('SOLD_OUT');
      return commit(ctx, loaded, {
        inventory: [invOp(item.spec, 1)],
        state: { freeTaken: { window: freeWindow, ids: [...taken, id] } },
        kind: 'buy', reason: 'free shelf', detail: { id }
      }, { extra: { specs: [item.spec] } });
    }

    if (section === 'bundles') {
      const item = shop.bundles.find((it) => it.id === id) ?? fail('NOT_IN_SHOP');
      if (boughtIn(state, id, window) >= item.stock) fail('SOLD_OUT');
      return commit(ctx, loaded, {
        coins: -item.price,
        inventory: item.specs.map((spec) => invOp(spec, 1)),
        state: { shopStock: withBought(state, id, window) },
        kind: 'buy', reason: 'bundle', detail: { id, price: item.price }
      }, { extra: { specs: item.specs, price: item.price } });
    }

    if (section === 'crate') {
      const bought = boughtIn(state, CRATE_ID, window);
      const price = cratePriceAt(bought, ctx.now);
      const custom = customSpecs(loaded.custom);
      const held = state.crateNext?.spec;
      const stillSold = held && (held.kind !== 'custom' || custom.some((p) => p.id === held.customId));
      let winner = stillSold ? held : rollCrate(custom, ctx.random);
      if (winner?.kind === 'custom' && (minorsWiki(winner.wiki) || (wikiIsMature(winner.wiki) && !(await matureOk(ctx))))) {
        winner = rollCrate(custom.filter((p) => !minorsWiki(p.wiki) && !wikiIsMature(p.wiki)), ctx.random);
      }
      return commit(ctx, loaded, {
        coins: -price,
        inventory: [invOp(winner, 1)],
        state: { shopStock: withBought(state, CRATE_ID, window), crateNext: { spec: rollCrate(custom, ctx.random) } },
        kind: 'buy', reason: 'crate', detail: { price, base: CRATE_BASE_PRICE }
      }, { extra: { specs: [winner], winner, price } });
    }

    if (section === 'today') {
      const day = dayBefore(ctx.now);
      if (state.todayBought === day) fail('SOLD_OUT');
      const spec = { kind: 'today', day, cards: TODAY_CARDS };
      const price = todayPrice(ctx.now);
      return commit(ctx, loaded, {
        coins: -price,
        inventory: [invOp(spec, 1)],
        state: { todayBought: day },
        kind: 'buy', reason: 'today', detail: { day, price }
      }, { extra: { specs: [spec], price } });
    }

    if (section === 'season') {
      const { season } = seasonAt(ctx.now);
      const spec = [seasonSpec(season), seasonSpec(season, { rarityId: 'rare' })].find((sp) => specId(sp) === id) ?? fail('NOT_IN_SHOP');
      const price = shopPrice(boosterPrice(spec), spec, 'season', ctx.now);
      return commit(ctx, loaded, {
        coins: -price,
        inventory: [invOp(spec, 1)],
        kind: 'buy', reason: 'season', detail: { id, price }
      }, { extra: { specs: [spec], price } });
    }

    if (section === 'customs') {
      const packs = customSpecs(loaded.custom);
      const wanted = typeof customId === 'string' && customId ? customId : null;
      const hostOf = (key) => String(key ?? '').split('|').slice(0, 2).join('|');
      const pack = (wanted ? packs.find((p) => p.id === wanted) : null)
        ?? packs.find((p) => { try { return hostOf(specId(customShopSpec(p))) === hostOf(id); } catch { return false; } })
        ?? fail('NOT_IN_SHOP');
      const qty = Math.floor(Number(count ?? 1));
      if (!(qty >= CUSTOM_QTY_RANGE[0] && qty <= CUSTOM_QTY_RANGE[1])) fail('BAD_COUNT');
      const n = Math.floor(Number(cards ?? String(id ?? '').split('|')[3] ?? CUSTOM_SHOP_CARDS));
      if (!(n >= CUSTOM_CARD_RANGE[0] && n <= CUSTOM_CARD_RANGE[1])) fail('BAD_SIZE');
      const spec = customShopSpec(pack, n);
      await refuseBlockedWiki(ctx, spec.wiki?.apiUrl);
      refuseMinors(spec.wiki, [spec.customName]);
      if (wikiIsMature(spec.wiki)) await refuseMature(ctx);
      const slot = specId(spec);
      const total = shopPrice(boosterPrice(spec), spec, 'customs', ctx.now) * qty;
      const claims = typeof req === 'string' && REQ_ID.test(req) ? [`buy:${req}`] : [];
      try {
        return await commit(ctx, loaded, {
          coins: -total,
          inventory: [invOp(spec, qty)],
          state: { shopStock: withBought(state, slot, window, qty) },
          claims,
          kind: 'buy', reason: section, detail: { id: slot, price: total, ...(qty > 1 ? { count: qty } : {}) }
        }, { extra: { specs: [spec], price: total, count: qty } });
      } catch (error) {
        if (!claims.length || (error?.code ?? error?.message) !== 'ALREADY_CLAIMED') throw error;
        return commit(ctx, await ctx.store.load(), {}, { extra: { specs: [spec], price: 0, count: qty, already: true } });
      }
    }

    const list = section === 'featured' ? [shop.featured]
      : section === 'subjects' ? shop.subjects
        : section === 'press' ? shop.press
          : section === 'customs' ? shop.customs : [];
    const found = list.find((it) => it?.id === id) ?? fail('NOT_IN_SHOP');
    const qty = section === 'customs' ? Math.floor(Number(count ?? 1)) : 1;
    if (!(qty >= CUSTOM_QTY_RANGE[0] && qty <= CUSTOM_QTY_RANGE[1])) fail('BAD_COUNT');
    if (Number.isFinite(found.stock) && boughtIn(state, id, window) + qty > found.stock) fail('SOLD_OUT');
    let item = found;
    if (section === 'customs') {
      await refuseBlockedWiki(ctx, found.spec?.wiki?.apiUrl);
      refuseMinors(found.spec?.wiki, [found.spec?.customName]);
      if (wikiIsMature(found.spec?.wiki)) await refuseMature(ctx);
    }
    if (section === 'customs' && cards != null) {
      const n = Math.floor(Number(cards));
      if (!(n >= CUSTOM_CARD_RANGE[0] && n <= CUSTOM_CARD_RANGE[1])) fail('BAD_SIZE');
      const spec = { ...found.spec, cards: n };
      item = { ...found, spec, price: shopPrice(boosterPrice(spec), spec, 'customs', ctx.now) };
    }
    const total = item.price * qty;
    const claims = section === 'customs' && typeof req === 'string' && REQ_ID.test(req) ? [`buy:${req}`] : [];
    try {
      return await commit(ctx, loaded, {
        coins: -total,
        inventory: [invOp(item.spec, qty)],
        state: { shopStock: withBought(state, id, window, qty) },
        claims,
        kind: 'buy', reason: section, detail: { id, price: total, ...(qty > 1 ? { count: qty } : {}) }
      }, { extra: { specs: [item.spec], price: total, count: qty } });
    } catch (error) {
      if (!claims.length || (error?.code ?? error?.message) !== 'ALREADY_CLAIMED') throw error;
      return commit(ctx, await ctx.store.load(), {}, { extra: { specs: [item.spec], price: 0, count: qty, already: true } });
    }
  },

  async prepare(ctx, { specId: id, skip = [] }) {
    const loaded = await ctx.store.load();
    const slot = loaded.inventory[id];
    if (!slot || !(slot.count > 0)) fail('NOT_HELD');
    const spent = skipList(skip);
    const waiting = await ctx.store.waiting(id, spent);
    if (waiting) return { nonce: waiting.nonce, cards: waiting.cards };
    if (spent.length) {
      const opening = (await ctx.store.waitingList()).filter((p) => p.specId === id && spent.includes(p.nonce)).length;
      if (slot.count <= opening) fail('NOT_HELD');
    }
    const [drawn] = await drawPulls(ctx, id, slot.spec, 1, { budget: FOREGROUND_DRAW_MS });
    if (drawn) return drawn;
    return (await ctx.store.waiting(id, spent)) ?? fail('DRAW_FAILED');
  },

  async prepareMany(ctx, { specId: id, count = 2, skip = [] } = {}) {
    const loaded = await ctx.store.load();
    const slot = loaded.inventory?.[id];
    if (!slot?.spec || !(slot.count > 0)) fail('NOT_HELD');
    if (!batchable(slot.spec)) fail('BAD_REQUEST');
    const spent = skipList(skip);
    const mine = (await ctx.store.waitingList()).filter((p) => p.specId === id);
    const opening = mine.filter((p) => spent.includes(p.nonce)).length;
    const want = Math.min(PREPARE_MAX, Math.max(1, Math.floor(Number(count) || 1)), slot.count - opening);
    if (want < 1) fail('NOT_HELD');
    const free = mine.filter((p) => !spent.includes(p.nonce)).slice(0, want).map((p) => p.nonce);
    const missing = want - free.length;
    let drawn = [];
    let refused = null;
    const later = typeof ctx.later === 'function' && typeof ctx.notify === 'function';
    if (missing > 0) {
      drawn = await drawPulls(ctx, id, slot.spec, missing, { budget: FOREGROUND_DRAW_MS, poolOnly: later }).catch((error) => { if (error instanceof EconError) refused = error; return []; });
    }
    const rest = missing - drawn.length;
    const owner = ctx.user ?? null;
    let streaming = false;
    if (rest > 0 && later && !(refused && refused.code !== 'DRAW_FAILED' && refused.code !== 'WIKI_DOWN')) {
      const prior = owner != null ? fillingFor.get(owner) : null;
      const handed = new Set([...free, ...drawn.map((p) => p.nonce)]);
      const chained = Promise.resolve(prior).catch(() => null).then(async () => {
        let need = rest;
        if (prior) {
          const waitingNow = (await ctx.store.waitingList().catch(() => [])).filter((p) => p.specId === id && !spent.includes(p.nonce) && !handed.has(p.nonce)).length;
          need = Math.max(0, rest - waitingNow);
        }
        return fillReady(ctx, [{ id, spec: slot.spec, missing: need, total: need }], owner);
      });
      ctx.later(trackFill(owner, chained));
      streaming = true;
    }
    if (!free.length && !drawn.length && refused && !streaming) throw refused;
    const rows = new Map((free.length ? await ctx.store.pullCards(free) : []).map((row) => [row.nonce, row.cards]));
    const pulls = [...free.filter((n) => Array.isArray(rows.get(n))).map((n) => ({ nonce: n, cards: rows.get(n) })), ...drawn];
    return { want, pulls: pulls.slice(0, want), ...(streaming ? { filling: true } : {}) };
  },

  async ready(ctx, { have = [], skip = [], focus = null, kick = false } = {}) {
    const loaded = await ctx.store.load();
    const spent = new Set(skipList(skip));
    const list = await ctx.store.waitingList();
    const opening = new Map();
    for (const p of list) if (spent.has(p.nonce)) opening.set(p.specId, (opening.get(p.specId) ?? 0) + 1);
    const wanted = readyWanted(loaded, ctx.now, opening, typeof focus === 'string' ? focus : null);
    const bySpec = new Map();
    for (const p of list) {
      if (spent.has(p.nonce)) continue;
      if (!bySpec.has(p.specId)) bySpec.set(p.specId, []);
      bySpec.get(p.specId).push(p.nonce);
    }
    const short = [...wanted.values()]
      .map((w) => ({ ...w, missing: w.want - (bySpec.get(w.id)?.length ?? 0), total: w.want + (opening.get(w.id) ?? 0) }))
      .filter((w) => w.missing > 0 && !isFriendSpec(w.spec))
      .sort((a, b) => (bySpec.get(a.id)?.length ?? 0) - (bySpec.get(b.id)?.length ?? 0) || b.missing - a.missing);
    const jobs = [];
    let budget = READY_FILL_MAX;
    for (const w of short) {
      if (budget <= 0) break;
      const missing = Math.min(w.missing, budget);
      budget -= missing;
      jobs.push({ ...w, missing });
    }
    const owner = ctx.user ?? null;
    const filling = jobs.length > 0;
    if (filling && !(owner != null && fillingFor.has(owner))) {
      const work = fillReady(ctx, jobs, owner);
      trackFill(owner, work);
      if (typeof ctx.later === 'function') ctx.later(work);
      else work.catch(() => {});
    }
    const known = new Set(Array.isArray(have) ? have.map(String) : []);
    const ready = {};
    const fresh = [];
    for (const w of wanted.values()) {
      const nonces = (bySpec.get(w.id) ?? []).slice(0, w.want);
      if (!nonces.length) continue;
      ready[w.id] = nonces;
      for (const n of nonces) if (!known.has(n)) fresh.push(n);
    }
    const pulls = {};
    if (kick) return { filling };
    for (const row of fresh.length ? await ctx.store.pullCards(fresh) : []) pulls[row.nonce] = row.cards;
    const want = {};
    for (const w of wanted.values()) want[w.id] = w.want;
    return { ready, pulls, more: filling, filling, want };
  },

  async open(ctx, { nonce, parts = null, batch = false }) {
    ctx.store.prefetch?.({ pull: nonce });
    const loaded = await ctx.store.load();
    let pull = await ctx.store.pullByNonce(nonce);
    let consume = [];
    if (!pull && Array.isArray(parts) && parts.length > 1) {
      const merged = batch ? await batchParts(ctx, loaded, String(nonce ?? ''), parts) : await mergeParts(ctx, loaded, String(nonce ?? ''), parts);
      if (merged) { pull = merged.pull; consume = merged.parts; }
    } else if (pull && !pull.claimed) {
      consume = await partsLeft(ctx, String(nonce ?? ''), parts, batch);
    }
    if (!pull) fail('NO_PULL');
    const boosters = Math.max(1, Math.floor(Number(pull.spec?.batch) || 1));
    const spec = boosters > 1 ? (({ batch: _b, sizes: _s, ...rest }) => rest)(pull.spec) : pull.spec;
    const heldId = boosters > 1 ? String(pull.specId).split('|').slice(2).join('|') : pull.specId;
    const keys = pull.cards.map(pullKey).filter(Boolean);
    if (pull.claimed) {
      const done = await commit(ctx, loaded, {}, { keys });
      const cards = pull.cards.map((card) => fullPullCard(card, done.cards?.[pullKey(card)], spec));
      const results = cards.map((card) => ({ key: card.article.key, rarityId: card.rarityId, price: card.price, isNew: false }));
      return { ...done, pulls: cards, results, levels: [], xp: 0, season: null, outcome: 'already' };
    }
    const dry = Number(loaded.state.pity) || 0;
    const sizes = boosters > 1 ? batchSizes(pull.spec.sizes, pull.cards.length, boosters) : [pull.cards.length];
    const pitied = spec.kind === 'code' ? { cards: pull.cards, dry } : batchPity(pull.cards, spec, dry, sizes);
    const cards = pitied.cards.every((c, i) => c === pull.cards[i]) ? pull.cards : pitied.cards;
    const before = new Map((await ctx.store.cards(keys)).map((row) => [row.article_key ?? row.key, rowToEntry(row)]));
    const add = [];
    const results = [];
    const seen = new Set();
    cards.forEach((card, i) => {
      const entry = pullEntry(card, pull.specId, ctx.now + i);
      const row = { ...entryToRow(entry, 'pull'), copies: 1 };
      const had = before.get(entry.key);
      if (had && !had.special && card.article.views != null && Number.isFinite(card.article.popularity)
        && rarityRank(card.rarityId) <= rarityRank(had.rarityId)) {
        row.reprice = priceFor(card.article.popularity, rarityById(had.rarityId));
      }
      add.push(row);
      results.push({ key: entry.key, rarityId: card.rarityId, price: card.price, isNew: !had && !seen.has(entry.key) });
      seen.add(entry.key);
    });
    const state = {};
    const progress = clone(loaded.state.progress ?? { level: 1, xp: 0 });
    const xp = cards.reduce((sum, c) => sum + xpForCard(c.rarityId, ctx.now), 0);
    let levels = [];
    if (spec.kind !== 'code') {
      levels = addXp(progress, xp);
      state.progress = progress;
      state.pendingLevels = [...(loaded.state.pendingLevels ?? []), ...levels];
      state.boostersOpened = (Number(loaded.state.boostersOpened) || 0) + boosters;
      const counts = clone(loaded.state.rarityCounts ?? {});
      for (const c of cards) counts[c.rarityId] = (counts[c.rarityId] ?? 0) + 1;
      state.rarityCounts = counts;
      state.pity = pitied.dry;
      if (spec.kind === 'timed') {
        const timed = clone(loaded.state.timed ?? emptyTimed());
        timed.opened = (Number(timed.opened) || 0) + (spec.timedSlots ?? 1) * boosters;
        state.timed = timed;
      }
    }
    state.opens = noteOpen(loaded.state.opens, nonce);
    const events = Array.from({ length: boosters }, () => ({ m: 'open', d: { kind: spec.kind, themeId: spec.themeId ?? null, rarityId: spec.rarityId ?? null } }));
    cards.forEach((card, i) => events.push({ m: 'pull', d: {
      rarityId: card.rarityId, themeId: spec.themeId ?? null, isNew: results[i].isNew, popularity: card.article.popularity ?? 0
    } }));
    const tracked = track(loaded.state, events, ctx.now);
    Object.assign(state, tracked.state);
    return commit(ctx, loaded, {
      pull: nonce,
      pullCards: slimPull(cards),
      ...(consume.length ? { consume } : {}),
      inventory: [{ spec_id: heldId, spec, delta: -boosters }],
      add,
      state,
      kind: 'open',
      detail: { specId: heldId, ...(boosters > 1 ? { boosters } : {}) }
    }, { keys, extra: { pulls: cards, results, levels, xp: spec.kind === 'code' ? 0 : xp, season: tracked.season, outcome: 'opened', ...(boosters > 1 ? { boosters } : {}) } });
  },

  async level(ctx, { level }) {
    const loaded = await ctx.store.load();
    const n = Math.floor(Number(level));
    const pending = loaded.state.pendingLevels ?? [];
    if (!pending.includes(n)) fail('NOT_EARNED');
    const reward = rewardForLevel(n);
    return commit(ctx, loaded, {
      coins: reward.coins ?? 0,
      ink: inkForLevel(n),
      inventory: reward.spec ? [invOp(reward.spec, 1)] : [],
      state: { pendingLevels: pending.filter((l) => l !== n) },
      claims: [`level:${n}`],
      kind: 'level', detail: { level: n }
    }, { extra: { reward, ink: inkForLevel(n) } });
  },

  async sell(ctx, { key, rarityId = null }) {
    ctx.store.prefetch?.({ keys: [key] });
    const loaded = await ctx.store.load();
    const [row] = await ctx.store.cards([key]);
    const entry = rowToEntry(row) ?? fail('NOT_OWNED');
    if (entry.special) fail('LOCKED');
    const print = spareRarity(entry, rarityId);
    const amount = sellPriceFor(printPrice(entry.price, bestPrint(printsOf(entry)), print));
    return commit(ctx, loaded, {
      coins: amount,
      remove: [{ key, copies: 1, rarityId: print }],
      state: { cardsSold: (Number(loaded.state.cardsSold) || 0) + 1 },
      kind: 'sell', detail: { key, rarityId: print }
    }, { keys: [key], extra: { amount, rarityId: print } });
  },

  async fuse(ctx, { key, rarityId = null }) {
    ctx.store.prefetch?.({ keys: [key] });
    const loaded = await ctx.store.load();
    const [row] = await ctx.store.cards([key]);
    const entry = rowToEntry(row) ?? fail('NOT_OWNED');
    const print = fuseRarity(entry, fuseCopies(), rarityId) ?? fail('CANNOT_FUSE');
    const tier = fuseTierOf(print);
    const spec = { kind: 'open', themeId: null, rarityId: tier.id, cards: 1 };
    return commit(ctx, loaded, {
      remove: [{ key, copies: fuseCopies(), rarityId: print }],
      inventory: [invOp(spec, 1)],
      state: { fused: (Number(loaded.state.fused) || 0) + 1 },
      kind: 'fuse', detail: { key, tier: tier.id, from: print }
    }, { keys: [key], extra: { spec, tier: tier.id, from: print } });
  },

  async sellMany(ctx, { items = [] } = {}) {
    const list = bulkSellList(items);
    if (!list.length) fail('BAD_BATCH');
    const keys = list.map((item) => item.key);
    ctx.store.weigh?.(Math.ceil(keys.length / 50));
    ctx.store.prefetch?.({ keys });
    const loaded = await ctx.store.load();
    const rows = await ctx.store.cards(keys);
    const owned = new Map(rows.map((row) => [row.article_key ?? row.key, rowToEntry(row)]));
    let amount = 0;
    let copies = 0;
    const remove = [];
    const sold = [];
    for (const item of list) {
      const entry = owned.get(item.key) ?? fail('NOT_OWNED');
      if (entry.special) fail('LOCKED');
      const best = bestPrint(printsOf(entry));
      let card = { rarityId: entry.rarityId, count: entry.count, prints: printsOf(entry) };
      const taken = {};
      const steps = item.prints ? sortedPrints(item.prints) : [[null, item.copies]];
      for (const [wanted, n] of steps) {
        const took = takePrints(card, n, wanted) ?? fail('NOT_OWNED');
        for (const [rid, k] of Object.entries(took.taken)) {
          taken[rid] = (taken[rid] ?? 0) + k;
          remove.push({ key: item.key, copies: k, rarityId: rid });
        }
        const left = printCount(took.prints);
        card = left ? { rarityId: bestPrint(took.prints), count: left, prints: took.prints } : { rarityId: best, count: 0, prints: {} };
      }
      for (const [rid, k] of Object.entries(taken)) {
        amount += k * sellPriceFor(printPrice(entry.price, best, rid));
        copies += k;
      }
      sold.push({ key: item.key, prints: taken });
    }
    return commit(ctx, loaded, {
      coins: amount,
      remove,
      state: { cardsSold: (Number(loaded.state.cardsSold) || 0) + copies },
      kind: 'sell', detail: { cards: sold.length, copies }
    }, { keys, extra: { amount, copies, sold } });
  },

  async fuseMany(ctx, { items = [] } = {}) {
    const list = (Array.isArray(items) ? items : []).slice(0, FUSE_MANY_MAX)
      .filter((item) => typeof item?.key === 'string' && item.key);
    const seen = new Set();
    const unique = list.filter((item) => !seen.has(item.key) && seen.add(item.key));
    if (!unique.length) fail('BAD_BATCH');
    const keys = unique.map((item) => item.key);
    ctx.store.weigh?.(Math.ceil(keys.length / 20));
    ctx.store.prefetch?.({ keys });
    const loaded = await ctx.store.load();
    const rows = await ctx.store.cards(keys);
    const owned = new Map(rows.map((row) => [row.article_key ?? row.key, rowToEntry(row)]));
    const remove = [];
    const specs = new Map();
    const fused = [];
    for (const item of unique) {
      const entry = owned.get(item.key) ?? fail('NOT_OWNED');
      const print = fuseRarity(entry, fuseCopies(), item.rarityId ?? null) ?? fail('CANNOT_FUSE');
      const tier = fuseTierOf(print);
      const spec = { kind: 'open', themeId: null, rarityId: tier.id, cards: 1 };
      remove.push({ key: item.key, copies: fuseCopies(), rarityId: print });
      const id = specId(spec);
      specs.set(id, { spec, n: (specs.get(id)?.n ?? 0) + 1 });
      fused.push({ key: item.key, tier: tier.id, from: print, spec });
    }
    return commit(ctx, loaded, {
      remove,
      inventory: [...specs.values()].map(({ spec, n }) => invOp(spec, n)),
      state: { fused: (Number(loaded.state.fused) || 0) + fused.length },
      kind: 'fuse', detail: { cards: fused.length }
    }, { keys, extra: { fused } });
  },

  async favoriteMany(ctx, { keys = [], on = true } = {}) {
    const list = [...new Set((Array.isArray(keys) ? keys : []).filter((k) => typeof k === 'string' && k))].slice(0, FAVORITE_MANY_MAX);
    if (!list.length) fail('BAD_BATCH');
    const loaded = await ctx.store.load();
    return commit(ctx, loaded, { patch: list.map((key) => ({ key, favorite: Boolean(on) })) }, { keys: list });
  },

  async daily(ctx) {
    const loaded = await ctx.store.load();
    const daily = normalizeDaily(clone(loaded.state.daily) ?? emptyDaily(), ctx.now);
    const got = claimDaily(daily, ctx.now) ?? fail('ALREADY_CLAIMED');
    const tracked = track(loaded.state, [{ m: 'daily' }], ctx.now);
    return commit(ctx, loaded, {
      coins: got.gift.coins ?? 0,
      ink: got.weekDone ? INK_DAILY_WEEK : 0,
      inventory: got.gift.spec ? [invOp(got.gift.spec, 1)] : [],
      state: { daily, ...tracked.state },
      claims: [`daily:${utcDay(ctx.now)}`],
      kind: 'daily'
    }, { extra: { got, season: tracked.season } });
  },

  async timed(ctx, { slots = 1, skip = [] }) {
    const loaded = await ctx.store.load();
    const timed = accrue(clone(loaded.state.timed) ?? emptyTimed(), ctx.now);
    const held = timed.count ?? 0;
    if (held <= 0) fail('NONE_HELD');
    const take = Math.min(Math.max(1, Math.floor(Number(slots) || 1)), held);
    const base = timedSpec(timedLevel(timed.opened ?? 0));
    const spec = take > 1 ? { ...base, cards: base.cards * take, timedSlots: take } : base;
    timed.count = held - take;
    if (!Number.isFinite(timed.last)) timed.last = ctx.now;
    const merged = take > 1 ? await timedParts(ctx, specId(base), take, skipList(skip)).catch(() => null) : null;
    return commit(ctx, loaded, {
      inventory: [invOp(spec, 1)],
      state: { timed },
      kind: 'timed', detail: { take }
    }, { extra: { spec, ...(merged ? { merged } : {}) } });
  },

  async sync(ctx, { timed = true } = {}) {
    const loaded = await ctx.store.load();
    if (!timed) return commit(ctx, loaded, {});
    const held = loaded.state.timed;
    const next = accrue(clone(held) ?? emptyTimed(), ctx.now);
    const capped = held && Number.isFinite(held.last) && next.count === held.count && (held.count ?? 0) >= maxHeld(timedLevel(held.opened ?? 0));
    const crate = loaded.state.crateNext?.spec ? {} : { crateNext: { spec: rollCrate(customSpecs(loaded.custom), ctx.random) } };
    return commit(ctx, loaded, { state: { ...(capped ? {} : { timed: next }), ...crate } });
  },

  async customSave(ctx, { pack }) {
    const clean = sanitizeCustom(pack) ?? fail('BAD_PACK');
    let mature = wikiIsMature(clean.wiki);
    refuseMinors({ ...clean.wiki, ...(mature ? { mature: true } : {}) }, [clean.name, clean.tagline, clean.query]);
    await refuseBlockedWiki(ctx, clean.wiki.apiUrl);
    const info = ctx.inspectWiki ? await ctx.inspectWiki(clean.wiki.apiUrl).catch(() => null) : null;
    if (info) refuseMinors({ ...info, apiUrl: clean.wiki.apiUrl, mature: mature || info.mature === true });
    if (!mature) mature = Boolean(info?.mature);
    if (mature) {
      await refuseMature(ctx);
      clean.wiki.mature = true;
    }
    if (screenText(clean.name, mature ? 'adultPack' : 'pack')) fail('NAME_REFUSED');
    const loaded = await ctx.store.load();
    const known = customSpecs(loaded.custom);
    const fresh = !known.some((p) => p.id === clean.id);
    if (fresh && known.length >= MAX_CUSTOM_PACKS) fail('TOO_MANY');
    await ctx.store.customPut(clean);
    ctx.warmCustom?.(clean);
    const tracked = fresh ? track(loaded.state, [{ m: 'custom' }], ctx.now) : null;
    const built = { packsBuilt: (Number(loaded.state.packsBuilt) || 0) + 1 };
    const done = await commit(ctx, loaded, tracked ? { state: { ...tracked.state, ...built } } : {});
    return { ...done, custom: customSpecs((await ctx.store.load()).custom), season: tracked?.season ?? null };
  },

  async wikiFind(ctx, { q, mature = false } = {}) {
    const query = typeof q === 'string' ? q.replace(/\s+/g, ' ').trim().slice(0, 80) : '';
    if (query.length < 2) fail('BAD_QUERY');
    if (!ctx.findWiki) fail('NO_FINDER');
    if (minorsText(query)) return { find: { query, corrected: null, results: [], mature: 0 }, mature: false };
    const allow = mature === true ? await matureOk(ctx).catch(() => false) : false;
    const quiet = Boolean(ctx.android) || await safeOnly(ctx);
    const found = await ctx.findWiki(query, { allowMature: allow });
    const blocked = (await ctx.store.blockedHosts?.()) ?? [];
    const results = (found?.results ?? []).filter((r) => {
      const url = publicWikiUrl(r?.apiUrl);
      return url && !hostBlocked(url.hostname, blocked) && (allow || !wikiIsMature(r)) && !minorsWiki(r);
    });
    return { find: { query, corrected: found?.corrected ?? null, results, mature: quiet ? 0 : Number(found?.mature) || 0 }, mature: allow };
  },

  async safeReady(ctx) {
    const list = await ctx.store.waitingList();
    if (!list.length) return { dropped: [] };
    const safe = await safeOnly(ctx);
    const allowed = await matureOk(ctx);
    const rows = await ctx.store.pullCards(list.map((p) => p.nonce));
    const dropped = rows.filter((row) => (row.cards ?? []).some((c) => {
      const article = c?.article ?? c;
      return !cardAllowed(article, { safe }) || (!allowed && article?.mature === true);
    })).map((row) => row.nonce);
    if (dropped.length) await ctx.store.dropPulls?.(dropped);
    return { dropped };
  },

  async customDelete(ctx, { id }) {
    await ctx.store.customDrop(String(id ?? ''));
    const loaded = await ctx.store.load();
    return { ...(await commit(ctx, loaded, {})), custom: customSpecs(loaded.custom) };
  },

  async redeem(ctx, { code }) {
    const loaded = await ctx.store.load();
    return redeemFromBook(ctx, loaded, code);
  },

  async atelier(ctx, { kind, id }) {
    const loaded = await ctx.store.load();
    const price = atelierPrice(kind, id) ?? fail('NOT_SOLD');
    const owned = clone(loaded.state.owned ?? { themes: [], frames: [], fx: [] });
    owned.themes ??= []; owned.frames ??= []; owned.fx ??= []; owned.looks ??= []; owned.openings ??= [];
    if (owned[kind].includes(id)) fail('OWNED');
    owned[kind].push(id);
    return commit(ctx, loaded, {
      ink: -price,
      state: { owned },
      kind: 'atelier', detail: { kind, id, price }
    }, { extra: { price } });
  },

  async exchange(ctx, { ink }) {
    const n = Math.floor(Number(ink) || 0);
    if (n <= 0 || n > 10000) fail('BAD_AMOUNT');
    const loaded = await ctx.store.load();
    return commit(ctx, loaded, { coins: -exchangeCost(n), ink: n, kind: 'exchange', detail: { ink: n } });
  },

  async achievement(ctx, { id, facts = {} }) {
    const loaded = await ctx.store.load();
    const a = ACHIEVEMENTS.find((x) => x.id === id) ?? fail('UNKNOWN');
    const achievements = clone(loaded.state.achievements ?? { redeemed: [] });
    achievements.redeemed ??= [];
    if (achievements.redeemed.includes(id)) fail('ALREADY_CLAIMED');
    const have = await achievementStat(ctx, loaded, a.stat, facts);
    if (!(have >= a.need)) fail('NOT_EARNED');
    achievements.redeemed.push(id);
    return commit(ctx, loaded, {
      coins: a.reward.kind === 'coins' ? a.reward.coins : 0,
      ink: inkForAchievement(a.reward),
      inventory: a.reward.kind === 'coins' ? [] : [invOp(a.reward.spec, 1)],
      state: { achievements },
      claims: [`ach:${id}`],
      kind: 'achievement', detail: { id }
    });
  },

  async medals(ctx) {
    const loaded = await ctx.store.load();
    const entries = (await ctx.store.cards(null)).map(rowToEntry);
    const albums = albumsOf(entries, loaded.custom);
    const claimed = { ...(loaded.state.albumTiers ?? {}) };
    await sizeAlbums(albums, claimed, ctx);
    let coins = 0;
    const inventory = [];
    const claims = [];
    const won = [];
    for (const album of albums) {
      if (!albumHasTiers(album)) continue;
      const reached = albumTiersReached(album);
      const had = Math.min(ALBUM_TIERS.length, Number(claimed[album.key]) || 0);
      for (let i = had; i < reached; i++) {
        const tier = ALBUM_TIERS[i];
        coins += tier.coins;
        const spec = albumTierBooster(album, tier);
        if (spec) inventory.push(invOp(spec, 1));
        claims.push(`medal:${album.key}:${tier.id}`);
        won.push({ album: album.key, name: album.name, tier: tier.id, coins: tier.coins, spec });
      }
      if (reached > had) claimed[album.key] = reached;
    }
    if (!won.length) return { ...(await commit(ctx, loaded, {})), won };
    const tracked = track(loaded.state, won.map(() => ({ m: 'album' })), ctx.now);
    return commit(ctx, loaded, {
      coins, inventory, claims,
      state: { albumTiers: claimed, ...tracked.state },
      kind: 'medal', detail: { won: won.map((w) => `${w.album}:${w.tier}`) }
    }, { extra: { won, season: tracked.season } });
  },

  async favorite(ctx, { key, on }) {
    const loaded = await ctx.store.load();
    return commit(ctx, loaded, { patch: [{ key, favorite: Boolean(on) }] }, { keys: [key] });
  },

  async repair(ctx, { key, title, data }) {
    const loaded = await ctx.store.load();
    const allowed = {};
    for (const k of ['description', 'extract', 'thumbnail', 'url', 'missing', 'checkedAt', 'lang']) {
      if (data && data[k] !== undefined) allowed[k] = data[k];
    }
    return commit(ctx, loaded, { patch: [{ key, title: typeof title === 'string' ? title.slice(0, 300) : undefined, data: allowed }] }, { keys: [key] });
  }
};

Object.assign(ACTIONS, REWARD_ACTIONS, SOCIAL_ACTIONS, { eventGift });

export const BATCH_MAX = 12;
export const SELL_MANY_MAX = 3000;
export const FUSE_MANY_MAX = 300;
export const FAVORITE_MANY_MAX = 5000;

export function bulkSellList(items) {
  const merged = new Map();
  for (const item of Array.isArray(items) ? items : []) {
    const key = typeof item?.key === 'string' ? item.key : '';
    if (!key) continue;
    const slot = merged.get(key) ?? { key, prints: null, copies: 0 };
    if (item.prints && typeof item.prints === 'object' && !Array.isArray(item.prints)) {
      slot.prints ??= {};
      for (const [rid, n] of Object.entries(item.prints)) {
        const k = Math.max(0, Math.min(100000, Math.round(Number(n) || 0)));
        if (k && rarityRank(rid) >= 0) slot.prints[rid] = (slot.prints[rid] ?? 0) + k;
      }
    } else {
      slot.copies += Math.max(0, Math.min(100000, Math.round(Number(item.copies ?? 1) || 0)));
    }
    merged.set(key, slot);
  }
  const out = [];
  for (const slot of merged.values()) {
    if (slot.prints && slot.copies) return [];
    if (slot.prints && Object.keys(slot.prints).length) out.push({ key: slot.key, prints: slot.prints });
    else if (!slot.prints && slot.copies > 0) out.push({ key: slot.key, copies: slot.copies });
  }
  return out.length > SELL_MANY_MAX ? [] : out;
}

ACTIONS.batch = async function batch(ctx, { items = [] } = {}) {
  const list = Array.isArray(items) ? items.slice(0, BATCH_MAX) : [];
  if (!list.length) fail('BAD_BATCH');
  ctx.store.weigh?.(list.length);
  const results = [];
  let broke = false;
  for (const item of list) {
    const action = String(item?.action ?? '');
    if (broke) { results.push({ error: 'FAILED' }); continue; }
    if (action === 'batch' || SERVER_ONLY.has(action) || !Object.prototype.hasOwnProperty.call(ACTIONS, action)) {
      results.push({ error: 'UNKNOWN_ACTION' });
      continue;
    }
    try {
      const { wallet, state, inventory, ...rest } = (await run(ctx, action, item.args ?? {})) ?? {};
      results.push({ ok: rest });
    } catch (error) {
      if (error instanceof EconError) results.push({ error: error.code });
      else { broke = true; results.push({ error: 'FAILED' }); }
    }
  }
  const fresh = await ctx.store.load();
  return { results, wallet: fresh.wallet, state: fresh.state, inventory: fresh.inventory };
};

const RETRIES = 2;

const GAINS = new Set(['buy', 'starter', 'grants', 'collect', 'claim', 'daily', 'level', 'quest', 'redeem', 'medals', 'timed', 'gift', 'marketCancel', 'atelier', 'exchange', 'batch', 'season', 'rung', 'achievement', 'reward', 'free']);
const READY_SKIP = new Set(['ready', 'prepare', 'prepareMany', 'ping', 'safeReady', 'wipe']);

export const KICK_GAP_MS = 5000;
const kicked = new Map();

function kickFill(ctx) {
  const owner = ctx.user ?? null;
  if (owner == null || typeof ctx.later !== 'function' || fillingFor.has(owner)) return;
  const now = Date.now();
  if (now - (kicked.get(owner) ?? 0) < KICK_GAP_MS) return;
  kicked.set(owner, now);
  if (kicked.size > 5000) for (const [k, at] of kicked) if (now - at > KICK_GAP_MS) kicked.delete(k);
  ctx.later(ACTIONS.ready({ ...ctx, now }, { kick: true }).catch(() => null));
}

export async function runAsked(ctx, action, args = {}, { ready = null } = {}) {
  const full = { now: Date.now(), random: Math.random, ...ctx };
  const result = await run(full, action, args);
  if (READY_SKIP.has(action) || !result || typeof result !== 'object' || !result.inventory) return result;
  if (!ready || typeof ready !== 'object') { if (GAINS.has(action)) kickFill(full); return result; }
  const got = await readyAfter({ ...full, now: Date.now() }, ready);
  return got ? { ...result, readyNow: got } : result;
}

function learning(store) {
  if (!store || typeof store.load !== 'function' || store.learnsCodes) return store;
  const load = store.load;
  return {
    ...store,
    learnsCodes: true,
    async load(...args) {
      const got = await load(...args);
      learnCodeDefs(got?.state?.codeDefs);
      return got;
    }
  };
}

export async function run(ctx, action, args = {}) {
  const handler = Object.prototype.hasOwnProperty.call(ACTIONS, action) ? ACTIONS[action] : null;
  if (!handler) fail('UNKNOWN_ACTION');
  const full = { now: Date.now(), random: Math.random, ...ctx };
  full.store = learning(full.store);
  for (let attempt = 0; ; attempt++) {
    try {
      return await handler(full, args ?? {});
    } catch (error) {
      const code = error?.code ?? String(error?.message ?? '');
      if (code === 'CONFLICT' && attempt < RETRIES) continue;
      if (error instanceof EconError) throw error;
      if (/^[A-Z][A-Z_]{2,}$/.test(code.trim())) throw new EconError(code.trim());
      throw error;
    }
  }
}
