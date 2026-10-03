import { RARITIES, rarityById } from './data/rarities.js';
import { oddsFor } from './data/odds.js';
import { priceFor } from './pricing.js';
import { timedDrawCaps } from './timed.js';
import { eventMult, tune } from './live.js';
import { fuseRarity, fuseTierOf } from './econ/rules.js';

export const SELL_RATE = 0.3;

export const RETURN_RATE = 0.72;

const TYPICAL_POP = 0.56;

const THEME_SURCHARGE = 1.25;

export const CARD_COUNT_RANGE = [3, 7];

export const CUSTOM_CARD_RANGE = [1, 10];

export const CUSTOM_QTY_RANGE = [1, 10];

export const WRAPPER_CARDS = 1.2;

export function drawCapsFor(spec) {
  if (spec?.kind === 'timed') return timedDrawCaps(spec.timedLevel ?? 1);
  return {
    minPopularity: null,
    maxPopularity: null,
    odds: spec?.rarityId ?? null,
    guarantee: spec?.rarityId ?? null
  };
}

export function expectedCardValue(spec) {
  if (spec?.kind === 'timed') {
    const caps = timedDrawCaps(spec.timedLevel ?? 1);
    const pop = Math.min(TYPICAL_POP, caps.maxPopularity ?? 1);
    return priceFor(pop, rarityById('common'));
  }
  const row = oddsFor(spec?.rarityId ?? null);
  let value = 0;
  for (let i = 0; i < RARITIES.length; i++) {
    value += ((row[i] ?? 0) / 100) * priceFor(TYPICAL_POP, RARITIES[i]);
  }
  return value;
}

export function boosterPrice(spec) {
  const cards = spec.cards ?? 5;
  const perCard = (expectedCardValue(spec) * SELL_RATE) / RETURN_RATE;
  const raw = perCard * (cards + WRAPPER_CARDS);
  const themed = spec.themeId || spec.kind === 'custom' ? THEME_SURCHARGE : 1;
  return Math.max(5, Math.round((raw * themed) / 5) * 5);
}

export const PRESS_MARKUP = {
  uncommon: 1.05, rare: 1.2, epic: 1.45, legendary: 1.9, mythic: 2.6, exotic: 3.6, prismatic: 5
};
export const pressPrice = (spec) =>
  Math.max(5, Math.round((boosterPrice(spec) * (PRESS_MARKUP[spec.rarityId] ?? 1)) / 5) * 5);

export const BUNDLE_OFF_RANGE = [10, 20];
export const bundlePrice = (specs, pct) =>
  Math.max(5, Math.round((specs.reduce((sum, spec) => sum + boosterPrice(spec), 0) * (100 - pct)) / 100 / 5) * 5);

export function shopPrice(price, spec = null, section = null, now = Date.now()) {
  if (!(price > 0)) return price;
  const tier = spec?.rarityId ?? 'plain';
  const m = tune('shop.priceMult') * (tune('shop.tierMult')?.[tier] ?? 1) * eventMult('price', now, spec, section);
  return m === 1 ? price : Math.max(5, Math.round((price * m) / 5) * 5);
}

export const eventPrice = (price, spec = null, section = null, now = Date.now()) => {
  const m = eventMult('price', now, spec, section);
  return m === 1 || !(price > 0) ? price : Math.max(5, Math.round((price * m) / 5) * 5);
};

export const CRATE_BASE_PRICE = 1000;
export const CRATE_STEP_PCT = 25;
export const cratePriceAt = (bought, now = Date.now()) =>
  shopPrice(Math.round((tune('crate.basePrice') * Math.pow(1 + CRATE_STEP_PCT / 100, Math.max(0, bought))) / 5) * 5, null, 'crate', now);

export const sellPriceFor = (price) => Math.max(1, Math.round(price * SELL_RATE * tune('sell.mult')));

export const FUSE_COPIES = 3;
export const fuseCopies = () => tune('fuse.copies');

export function canFuse(entry, rarityId = null) {
  if (!entry || entry.special) return false;
  return fuseRarity(entry, fuseCopies(), rarityId) != null;
}

export const fuseFrom = (entry, rarityId = null) => fuseRarity(entry, fuseCopies(), rarityId) ?? entry?.rarityId ?? 'common';

export const fuseTierFor = (entry, rarityId = null) => fuseTierOf(fuseFrom(entry, rarityId));

export const REFRESH_MS = 60 * 60 * 1000;

export const LEGACY_REFRESH_MS = 2 * 60 * 60 * 1000;

export const STIPEND = 250;

export const STIPEND_MAX_BANKED = 8;

export const stipendAmount = () => tune('stipend.amount');
export const stipendMaxBanked = () => tune('stipend.maxBanked');

export const windowIndexAt = (now = Date.now()) => Math.floor(now / REFRESH_MS);

export const nextRefreshAt = (now = Date.now()) => (windowIndexAt(now) + 1) * REFRESH_MS;

export const legacyWindowAt = (now = Date.now()) => Math.floor(now / LEGACY_REFRESH_MS);

export function stipendHourOf(state) {
  const hour = state?.stipendHour;
  if (hour != null && Number.isFinite(Number(hour))) return Math.floor(Number(hour));
  const old = state?.stipendWindow;
  if (old == null || !Number.isFinite(Number(old))) return null;
  return Math.floor(((Math.floor(Number(old)) + 1) * LEGACY_REFRESH_MS - 1) / REFRESH_MS);
}

export const TODAY_POOL = 200;
export const TODAY_CARDS = 5;

const TODAY_LADDER = [
  { upTo: 1,   id: 'prismatic' },
  { upTo: 5,   id: 'exotic' },
  { upTo: 15,  id: 'mythic' },
  { upTo: 40,  id: 'legendary' },
  { upTo: 100, id: 'epic' },
  { upTo: Infinity, id: 'rare' }
];

export const todayBands = () => TODAY_LADDER.map((band, i) => ({
  from: i === 0 ? 1 : TODAY_LADDER[i - 1].upTo + 1,
  to: Number.isFinite(band.upTo) ? band.upTo : null,
  rarity: rarityById(band.id)
}));

export function todayRarityForRank(rank) {
  const n = Number.isFinite(rank) && rank > 0 ? rank : TODAY_POOL;
  return rarityById((TODAY_LADDER.find((band) => n <= band.upTo) ?? TODAY_LADDER[TODAY_LADDER.length - 1]).id);
}

export function todayExpectedCardValue() {
  let total = 0;
  for (let rank = 1; rank <= TODAY_POOL; rank++) total += priceFor(1, todayRarityForRank(rank));
  return total / TODAY_POOL;
}

export const TODAY_PRICE = Math.max(5, Math.round(
  ((todayExpectedCardValue() * SELL_RATE) / RETURN_RATE) * (TODAY_CARDS + WRAPPER_CARDS) / 5) * 5);

export const todayPrice = (now = Date.now()) => shopPrice(TODAY_PRICE, null, 'today', now);

export const STARTER_COINS = 1500;
export const WIPE_EVERY_DAYS = 30;
export const starterCoins = () => tune('starter.coins');
export const STARTER_PACKS = 3;
export const STARTER_PACK_CARDS = 5;

export const FREE_SLOTS = 2;
export const FREE_CARDS = 3;
export const freeSlots = () => tune('free.slots');
export const freeCards = () => tune('free.cards');

export const FREE_REFRESH_MS = 4 * 60 * 60 * 1000;

export const freeWindowAt = (now = Date.now()) => Math.floor(now / FREE_REFRESH_MS);

export const nextFreeAt = (now = Date.now()) => (freeWindowAt(now) + 1) * FREE_REFRESH_MS;
