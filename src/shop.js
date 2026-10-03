import { THEME_PACKS } from './data/packs.js';
import { RARITIES, rarityRank } from './data/rarities.js';
import {
  CARD_COUNT_RANGE, windowIndexAt, boosterPrice, pressPrice, bundlePrice, BUNDLE_OFF_RANGE,
  freeSlots, freeCards, freeWindowAt, shopPrice, eventPrice
} from './economy.js';
import { specId } from './booster.js';
import { activeEvents, cleanSpec, livePacks, liveSold, packOnSale } from './live.js';

function seeded(seed) {
  let a = (seed >>> 0) + 0x6d2b79f5;
  return () => {
    a = Math.imul(a ^ (a >>> 15), a | 1);
    a ^= a + Math.imul(a ^ (a >>> 7), a | 61);
    return ((a ^ (a >>> 14)) >>> 0) / 4294967296;
  };
}

const pick = (rng, arr) => arr[Math.floor(rng() * arr.length)];
const between = (rng, lo, hi) => lo + Math.floor(rng() * (hi - lo + 1));
function weighted(rng, table) {
  const total = table.reduce((sum, [, w]) => sum + w, 0);
  let ticket = rng() * total;
  for (const [value, w] of table) { ticket -= w; if (ticket <= 0) return value; }
  return table[table.length - 1][0];
}

const PRESS_ODDS = {
  uncommon: 1, rare: 1, epic: 0.7, legendary: 0.45,
  mythic: 0.22, exotic: 0.12, prismatic: 0.06
};

const FEATURE_TIER_WEIGHT = { uncommon: 10, rare: 7, epic: 4, legendary: 2, mythic: 1 };
function featureTier(rng) {
  return weighted(rng, RARITIES.filter((r) => FEATURE_TIER_WEIGHT[r.id]).map((r) => [r.id, FEATURE_TIER_WEIGHT[r.id]]));
}

function customSpec(rng, pack, cards = null) {
  return {
    kind: 'custom',
    themeId: null,
    rarityId: null,
    cards: cards ?? between(rng, CARD_COUNT_RANGE[0], CARD_COUNT_RANGE[1]),
    wiki: pack.wiki,
    customName: pack.name,
    customTagline: pack.tagline,
    customId: pack.id,
    icon: pack.icon,
    accent: pack.accent,
    accent2: pack.accent2,
    art: pack.art ?? null
  };
}

export const CUSTOM_SHOP_CARDS = 5;

export function customShopSpec(pack, cards = CUSTOM_SHOP_CARDS) {
  return customSpec(null, pack, cards);
}

export function sortedCustoms(customPacks = []) {
  return (Array.isArray(customPacks) ? customPacks : [])
    .filter((pack) => pack?.id && pack?.wiki?.apiUrl)
    .slice()
    .sort((a, b) => (String(a.id) < String(b.id) ? -1 : String(a.id) > String(b.id) ? 1 : 0));
}

export function generateShop(windowIndex = windowIndexAt(), customPacks = [], freeWindow = freeWindowAt(), now = Date.now()) {
  const rng = seeded(windowIndex);
  const seen = new Set();
  const claim = (spec) => {
    spec.cards = Math.min(CARD_COUNT_RANGE[1], Math.max(CARD_COUNT_RANGE[0], spec.cards));
    const id = specId(spec);
    if (seen.has(id)) return null;
    seen.add(id);
    return id;
  };
  const entry = (spec, stock, section) => {
    const id = claim(spec);
    return id ? { id, spec, price: shopPrice(boosterPrice(spec), spec, section, now), stock } : null;
  };

  const featSpec = {
    kind: 'theme',
    themeId: pick(rng, THEME_PACKS).id,
    rarityId: rng() < 0.55 ? featureTier(rng) : null,
    cards: between(rng, 5, CARD_COUNT_RANGE[1])
  };
  claim(featSpec);
  const fullPrice = shopPrice(boosterPrice(featSpec), featSpec, 'featured', now);
  const pct = between(rng, 15, 25);
  const featured = {
    id: specId(featSpec),
    spec: featSpec,
    fullPrice,
    pct,
    price: Math.max(5, Math.round((fullPrice * (100 - pct)) / 100 / 5) * 5),
    stock: 1
  };

  const freeRng = seeded(freeWindow * 104729 + 7);
  const free = [];
  for (let i = 0, slots = freeSlots(); i < slots; i++) {
    const spec = {
      kind: 'theme',
      themeId: pick(freeRng, THEME_PACKS).id,
      rarityId: freeRng() < 0.1 ? RARITIES[1].id : null,
      cards: freeCards(),
      free: true
    };
    const id = claim(spec);
    if (id) free.push({ id, spec, price: 0, stock: 1 });
  }

  const themePool = [...THEME_PACKS];
  const subjects = [];
  while (subjects.length < 6 && themePool.length) {
    const theme = themePool.splice(Math.floor(rng() * themePool.length), 1)[0];
    const item = entry({ kind: 'theme', themeId: theme.id, rarityId: null, cards: between(rng, 4, 6) }, between(rng, 1, 3), 'subjects');
    if (item) subjects.push(item);
  }

  const press = [];
  for (const rarity of RARITIES) {
    const odds = PRESS_ODDS[rarity.id] ?? 0;
    if (odds <= 0 || rng() >= odds) continue;
    const themed = rng() < 0.5;
    const spec = {
      kind: themed ? 'theme' : 'open',
      themeId: themed ? pick(rng, THEME_PACKS).id : null,
      rarityId: rarity.id,
      cards: between(rng, 4, 6)
    };
    const id = claim(spec);
    if (!id) continue;
    const stock = rarityRank(rarity.id) >= rarityRank('mythic') ? 1 : between(rng, 1, 2);
    press.push({ id, spec, price: shopPrice(pressPrice(spec), spec, 'press', now), plain: shopPrice(boosterPrice(spec), spec, 'press', now), rarity, stock });
  }
  press.sort((a, b) => rarityRank(a.rarity.id) - rarityRank(b.rarity.id));

  const bundles = [];
  const bundleCount = between(rng, 2, 3);
  let guard = 0;
  while (bundles.length < bundleCount && guard++ < 20) {
    const size = between(rng, 2, 4);
    const mixed = rng() < 0.55;
    const specs = [];
    if (mixed) {
      for (let i = 0; i < size; i++) {
        specs.push({
          kind: 'theme', themeId: pick(rng, THEME_PACKS).id,
          rarityId: rng() < 0.4 ? featureTier(rng) : null,
          cards: between(rng, 3, CARD_COUNT_RANGE[1])
        });
      }
    } else {
      const one = { kind: 'theme', themeId: pick(rng, THEME_PACKS).id, rarityId: rng() < 0.35 ? featureTier(rng) : null, cards: between(rng, 4, 6) };
      for (let i = 0; i < size; i++) specs.push({ ...one });
    }
    const pct = between(rng, BUNDLE_OFF_RANGE[0], BUNDLE_OFF_RANGE[1]);
    const id = `bundle|${windowIndex}|${bundles.length}|${specs.map(specId).join('+')}`;
    if (seen.has(id)) continue;
    seen.add(id);
    const full = shopPrice(specs.reduce((sum, spec) => sum + boosterPrice(spec), 0), null, 'bundles', now);
    bundles.push({ id, specs, mixed, pct, full, price: shopPrice(bundlePrice(specs, pct), null, 'bundles', now), stock: 1 });
  }

  const customs = [];
  for (const pack of sortedCustoms(customPacks)) {
    const item = entry(customShopSpec(pack), Infinity, 'customs');
    if (item) customs.push(item);
  }

  return { featured, free, subjects, press, bundles, customs };
}

export function liveShelf(now = Date.now()) {
  const items = [];
  for (const pack of livePacks()) {
    if (!packOnSale(pack, now)) continue;
    const spec = { kind: 'theme', themeId: pack.id, rarityId: null, cards: pack.cards };
    const id = `live|${pack.id}`;
    const price = pack.price != null ? eventPrice(pack.price, spec, 'live', now) : shopPrice(boosterPrice(spec), spec, 'live', now);
    const left = pack.limit != null ? Math.max(0, pack.limit - liveSold(id)) : Infinity;
    items.push({ id, spec, price, stock: left, limit: pack.limit, perPlayer: pack.perPlayer ?? Infinity, endsAt: pack.until, name: pack.name, tagline: pack.tagline });
  }
  for (const event of activeEvents('limited_booster', now)) {
    const p = event.params;
    const spec = cleanSpec(p.spec);
    const base = Math.round(Number(p.price));
    if (!spec || !(base >= 0)) continue;
    const id = `live|event:${event.id}`;
    const limit = Number.isFinite(Number(p.stock)) && Number(p.stock) > 0 ? Math.floor(Number(p.stock)) : null;
    const perPlayer = Number.isFinite(Number(p.perPlayer)) && Number(p.perPlayer) > 0 ? Math.floor(Number(p.perPlayer)) : Infinity;
    items.push({
      id, spec, price: eventPrice(base, spec, 'live', now), stock: limit != null ? Math.max(0, limit - liveSold(id)) : Infinity,
      limit, perPlayer, endsAt: event.ends, name: p.title ?? null, tagline: p.tagline ?? null, event: event.id
    });
  }
  return items;
}

export const CRATE_TIER_WEIGHTS = [
  [null, 46], ['uncommon', 22], ['rare', 14], ['epic', 8.5], ['legendary', 5],
  ['mythic', 2.6], ['exotic', 1.2], ['prismatic', 0.5]
];
export const CRATE_CARD_WEIGHTS = [[3, 34], [4, 30], [5, 20], [6, 11], [7, 5]];

export function rollCrate(customPacks = [], rng = Math.random) {
  const cards = weighted(rng, CRATE_CARD_WEIGHTS);
  const rarityId = weighted(rng, CRATE_TIER_WEIGHTS);
  const sources = [...THEME_PACKS.map((theme) => ({ theme })), ...customPacks.slice(0, 8).map((pack) => ({ pack }))];
  const source = pick(rng, sources);
  if (source.pack) return { ...customSpec(rng, source.pack, cards), rarityId };
  return { kind: 'theme', themeId: source.theme.id, rarityId, cards };
}

export function crateReel(winner, customPacks = [], { length = 28, winnerAt = 22, rng = Math.random } = {}) {
  const reel = Array.from({ length }, () => rollCrate(customPacks, rng));
  reel[winnerAt] = winner;
  return reel;
}

export function crateExpectedPrice(customPacks = [], samples = 20000, rng = Math.random) {
  let sum = 0;
  for (let i = 0; i < samples; i++) sum += boosterPrice(rollCrate(customPacks, rng));
  return sum / samples;
}

export function formatCountdown(ms) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  if (hours) return `${hours}h ${String(minutes).padStart(2, '0')}m`;
  if (minutes) return `${minutes}m ${String(seconds).padStart(2, '0')}s`;
  return `${seconds}s`;
}
