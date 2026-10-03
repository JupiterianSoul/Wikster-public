import * as store from '../collection.js';
import { t, tx } from '../i18n.js';
import { canFuse, fuseCopies, fuseFrom, fuseTierFor, sellPriceFor } from '../economy.js';
import { bestPrint, printPrice, printsOf, sortedPrints, sparesOf } from '../econ/rules.js';
import { rarityById, rarityRank } from '../data/rarities.js';
import { synth } from '../ui/sound.js';
import { reportQuest } from './arcade.js';
import { esc, money, refreshWallet, state, toast } from './core.js';
import { econ, econMessage, serverEconomy } from './econ.js';
import { gainBooster } from './open.js';
import { updateBadges } from './regalia.js';

export const printSellPrice = (entry, rarityId) =>
  sellPriceFor(printPrice(entry.price, bestPrint(printsOf(entry)), rarityId));

export function sellablePrints(entry, keep = 1) {
  if (!entry || entry.special) return {};
  const prints = printsOf(entry);
  const total = Object.values(prints).reduce((a, n) => a + n, 0);
  let left = Math.max(0, total - Math.max(0, keep));
  const out = {};
  const pool = keep > 0 ? sparesOf(entry) : prints;
  for (const [rid, n] of sortedPrints(pool)) {
    if (left <= 0) break;
    const k = Math.min(n, left);
    out[rid] = k;
    left -= k;
  }
  if (keep <= 0 && left > 0) {
    const best = bestPrint(prints);
    out[best] = (out[best] ?? 0) + left;
  }
  return out;
}

export function lowestPrints(entry, copies) {
  const prints = printsOf(entry);
  const order = [...sortedPrints(sparesOf(entry))];
  const out = {};
  let left = copies;
  for (const [rid, n] of order) {
    if (left <= 0) break;
    const k = Math.min(n, left);
    out[rid] = (out[rid] ?? 0) + k;
    left -= k;
  }
  if (left > 0) {
    const best = bestPrint(prints);
    out[best] = (out[best] ?? 0) + Math.min(left, 1);
  }
  return out;
}

export function planValue(plan) {
  let coins = 0;
  let copies = 0;
  for (const { key, prints } of plan) {
    const entry = state.collection.entries[key];
    if (!entry) continue;
    for (const [rid, n] of Object.entries(prints)) {
      coins += n * printSellPrice(entry, rid);
      copies += n;
    }
  }
  return { coins, copies, cards: plan.length };
}

function sellLocally(plan) {
  let amount = 0;
  let copies = 0;
  for (const { key, prints } of plan) {
    const entry = state.collection.entries[key];
    if (!entry || store.isLocked(entry)) continue;
    for (const [rid, n] of sortedPrints(prints)) {
      const value = printSellPrice(entry, rid);
      const sold = store.dropCopies(entry, n, rid);
      if (!sold) break;
      amount += n * value;
      copies += n;
      if (entry.count <= 0) { delete state.collection.entries[key]; break; }
    }
  }
  store.saveCollection(state.collection);
  state.profile.cardsSold = (state.profile.cardsSold ?? 0) + copies;
  store.saveProfile(state.profile);
  store.saveWallet(store.loadWallet() + amount);
  return { amount, copies };
}

function reportSale(amount, copies) {
  reportQuest('sell', { amount });
  for (let i = 1; i < Math.min(copies, 5); i++) reportQuest('sell', { amount: 0 });
}

export async function sellPlan(plan) {
  const clean = plan
    .map(({ key, prints }) => ({ key, prints: Object.fromEntries(Object.entries(prints ?? {}).filter(([, n]) => n > 0)) }))
    .filter((item) => Object.keys(item.prints).length && state.collection.entries[item.key] && !store.isLocked(state.collection.entries[item.key]));
  if (!clean.length) return null;
  let amount = 0;
  let copies = 0;
  if (serverEconomy()) {
    try {
      const res = await econ('sellMany', { items: clean });
      amount = Number(res?.amount) || 0;
      copies = Number(res?.copies) || 0;
    } catch (error) {
      synth.playDenied();
      toast(esc(econMessage(error, t)), 'error');
      return null;
    }
  } else {
    ({ amount, copies } = sellLocally(clean));
  }
  reportSale(amount, copies);
  refreshWallet();
  updateBadges();
  synth.playCoins();
  toast(t('bulkSold', { n: copies, amount: money(amount) }), 'ok');
  return { amount, copies, cards: clean.length };
}

export async function favoriteKeys(keys, on) {
  const list = keys.filter((key) => state.collection.entries[key] && Boolean(state.collection.entries[key].favorite) !== on);
  if (!list.length) return 0;
  for (const key of list) state.collection.entries[key].favorite = on;
  store.saveCollection(state.collection);
  if (serverEconomy()) econ('favoriteMany', { keys: list, on }).catch(() => {});
  synth.playFav(on);
  toast(t(on ? 'bulkFavorited' : 'bulkUnfavorited', { n: list.length }), 'ok');
  return list.length;
}

export const fusable = (keys) => keys.filter((key) => canFuse(state.collection.entries[key]));

export async function fuseKeys(keys) {
  const list = fusable(keys);
  if (!list.length) return 0;
  const items = list.map((key) => ({ key, rarityId: fuseFrom(state.collection.entries[key]) }));
  const specs = list.map((key) => ({ kind: 'open', themeId: null, rarityId: fuseTierFor(state.collection.entries[key]).id, cards: 1 }));
  if (serverEconomy()) {
    try { await econ('fuseMany', { items }); } catch (error) {
      synth.playDenied();
      toast(esc(econMessage(error, t)), 'error');
      return 0;
    }
  } else {
    items.forEach(({ key, rarityId }) => {
      const entry = state.collection.entries[key];
      if (!entry) return;
      store.dropCopies(entry, fuseCopies(), rarityId);
      if (entry.count <= 0) delete state.collection.entries[key];
    });
    store.saveCollection(state.collection);
    state.profile.fused = (state.profile.fused ?? 0) + list.length;
    store.saveProfile(state.profile);
  }
  specs.forEach((spec) => gainBooster(spec));
  for (let i = 0; i < Math.min(list.length, 5); i++) reportQuest('fuse');
  updateBadges();
  synth.playCoins();
  const top = specs.reduce((a, s) => (rarityRank(s.rarityId) > rarityRank(a.rarityId) ? s : a), specs[0]);
  toast(t('bulkFused', { n: list.length, tier: esc(tx(rarityById(top.rarityId).name)) }), 'ok');
  return list.length;
}
