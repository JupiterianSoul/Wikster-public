import { RARITIES, normalizeRarityId, rarityById, rarityRank } from '../data/rarities.js';
import { priceFor } from '../pricing.js';
import { tune } from '../live.js';
import { timedDrawCaps } from '../timed.js';

export const HIT_RANK = 1;
export const PITY_RANK = 4;
export const PITY_RARITY = RARITIES[PITY_RANK].id;
export const OPENS_KEPT = 24;

export const pityLimit = () => tune('pity.legendary');

export function topRank(spec) {
  const cap = spec?.kind === 'timed' ? timedDrawCaps(spec.timedLevel ?? 1).maxPopularity : null;
  if (cap == null) return RARITIES.length - 1;
  for (let i = RARITIES.length - 1; i >= 0; i--) if (RARITIES[i].minPop < cap) return i;
  return 0;
}

export const standardSpec = (spec) => Boolean(spec) && spec.kind !== 'code' && !spec.exact && (Number(spec.cards) || 0) >= 3;

const rankOf = (card) => rarityRank(card?.rarityId);

function rollFrom(odds, from, to, random) {
  const row = Array.isArray(odds) ? odds : [];
  const weights = RARITIES.map((_, i) => (i >= from && i <= to ? Math.max(0, Number(row[i]) || 0) : 0));
  const total = weights.reduce((a, b) => a + b, 0);
  if (!(total > 0)) return RARITIES[from].id;
  let ticket = random() * total;
  for (let i = 0; i < weights.length; i++) {
    ticket -= weights[i];
    if (ticket < 0) return RARITIES[i].id;
  }
  return RARITIES[from].id;
}

export function shapeHit(cards, spec, odds, random = Math.random) {
  if (!standardSpec(spec) || !Array.isArray(cards) || cards.length < 2) return cards;
  const top = topRank(spec);
  if (top < HIT_RANK) return cards;
  const out = [...cards];
  const last = out.length - 1;
  if (rankOf(out[last]) >= HIT_RANK) return out;
  let best = -1;
  for (let i = 0; i < last; i++) if (!out[i]?.special && rankOf(out[i]) >= HIT_RANK && (best < 0 || rankOf(out[i]) > rankOf(out[best]))) best = i;
  if (best >= 0) {
    [out[best], out[last]] = [out[last], out[best]];
    return out;
  }
  out[last] = { ...out[last], rarityId: rollFrom(odds, HIT_RANK, top, random), upgraded: true };
  return out;
}

export const hasPityHit = (cards) => (cards ?? []).some((c) => rankOf(c) >= PITY_RANK && rankOf(c) < RARITIES.length);

export function pityAfter(dry, spec, cards) {
  if (!spec || spec.kind === 'code') return Math.max(0, Number(dry) || 0);
  return hasPityHit(cards) ? 0 : Math.max(0, Number(dry) || 0) + 1;
}

export function withPity(cards, spec, dry, limit = pityLimit()) {
  if (!Array.isArray(cards) || !cards.length || !standardSpec(spec)) return cards;
  if (topRank(spec) < PITY_RANK) return cards;
  if ((Math.max(0, Number(dry) || 0) + 1) < limit) return cards;
  if (hasPityHit(cards)) return cards;
  const out = [...cards];
  const last = out.length - 1;
  const card = out[last];
  const rarity = rarityById(PITY_RARITY);
  out[last] = { ...card, rarityId: rarity.id, price: priceFor(Number(card.article?.popularity) || 0, rarity), pity: true };
  return out;
}

export const pityLeft = (dry, limit = pityLimit()) => Math.max(1, limit - Math.max(0, Number(dry) || 0));

export function noteOpen(list, nonce) {
  const tag = String(nonce ?? '').slice(-12);
  const held = Array.isArray(list) ? list.filter((n) => n !== tag) : [];
  return [...held, tag].slice(-OPENS_KEPT);
}

export const openNoted = (list, nonce) => Array.isArray(list) && list.includes(String(nonce ?? '').slice(-12));

const bonus = (id) => Number(rarityById(id).bonusPct) || 0;

export function printPrice(price, best, rarity) {
  if (normalizeRarityId(best) === normalizeRarityId(rarity)) return Math.max(0, Math.round(Number(price) || 0));
  return Math.max(0, Math.round((Math.max(0, Number(price) || 0) * (100 + bonus(rarity))) / (100 + bonus(best))));
}

export function printsOf(card) {
  if (!card) return {};
  const copies = Math.max(1, Math.round(Number(card.count ?? card.copies) || 1));
  const best = normalizeRarityId(card.rarityId ?? card.rarity_id ?? 'common');
  const raw = card.prints;
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    const out = {};
    let sum = 0;
    for (const [id, n] of Object.entries(raw)) {
      const k = Math.max(0, Math.round(Number(n) || 0));
      if (!k) continue;
      const rid = normalizeRarityId(id);
      out[rid] = (out[rid] ?? 0) + k;
      sum += k;
    }
    if (sum === copies && out[best]) return out;
  }
  return { [best]: copies };
}

export function bestPrint(prints) {
  let best = null;
  for (const [id, n] of Object.entries(prints ?? {})) if (n > 0 && (best == null || rarityRank(id) > rarityRank(best))) best = id;
  return best ?? 'common';
}

export const printCount = (prints) => Object.values(prints ?? {}).reduce((a, n) => a + (Number(n) || 0), 0);

export const sortedPrints = (prints) => Object.entries(prints ?? {}).filter(([, n]) => n > 0).sort((a, b) => rarityRank(a[0]) - rarityRank(b[0]));

export function sparesOf(card) {
  const prints = printsOf(card);
  const best = bestPrint(prints);
  const spares = { ...prints };
  spares[best] -= 1;
  if (!spares[best]) delete spares[best];
  return spares;
}

export function spareRarity(card, wanted = null) {
  const prints = printsOf(card);
  if (wanted && prints[normalizeRarityId(wanted)]) {
    const w = normalizeRarityId(wanted);
    const spares = sparesOf(card);
    if (spares[w] || printCount(prints) === 1) return w;
  }
  const spares = sortedPrints(sparesOf(card));
  if (spares.length) return spares[0][0];
  return bestPrint(prints);
}

export function cardValue(card) {
  const prints = printsOf(card);
  const best = bestPrint(prints);
  const price = Number(card?.price) || 0;
  return Object.entries(prints).reduce((sum, [id, n]) => sum + n * printPrice(price, best, id), 0);
}

export const collectionValue = (entries) => (entries ?? []).reduce((sum, e) => sum + cardValue(e), 0);

export function takePrints(card, copies = 1, wanted = null) {
  const prints = printsOf(card);
  const taken = {};
  let left = Math.max(1, Math.round(Number(copies) || 1));
  if (wanted) {
    const w = normalizeRarityId(wanted);
    const spare = sparesOf(card)[w] ?? 0;
    const can = printCount(prints) <= left ? prints[w] ?? 0 : spare;
    if (can < left) return null;
    taken[w] = left;
    prints[w] -= left;
    if (!prints[w]) delete prints[w];
    return { prints, taken };
  }
  while (left > 0) {
    const total = printCount(prints);
    if (!total) return null;
    const pick = total === 1 ? bestPrint(prints) : spareRarity({ rarityId: bestPrint(prints), count: total, prints });
    taken[pick] = (taken[pick] ?? 0) + 1;
    prints[pick] -= 1;
    if (!prints[pick]) delete prints[pick];
    left--;
  }
  return { prints, taken };
}

export function addPrints(prints, more) {
  const out = { ...(prints ?? {}) };
  for (const [id, n] of Object.entries(more ?? {})) {
    const k = Math.max(0, Math.round(Number(n) || 0));
    if (!k) continue;
    const rid = normalizeRarityId(id);
    out[rid] = (out[rid] ?? 0) + k;
  }
  return out;
}

export function fuseRarity(card, copies, wanted = null) {
  if (!card || card.special) return null;
  const spares = sparesOf(card);
  const ok = (id) => (spares[id] ?? 0) >= copies && rarityRank(id) >= 0 && rarityRank(id) < RARITIES.length - 1;
  if (wanted && ok(normalizeRarityId(wanted))) return normalizeRarityId(wanted);
  const found = sortedPrints(spares).find(([id]) => ok(id));
  return found ? found[0] : null;
}

export const fuseTierOf = (rarityId) => RARITIES[Math.min(RARITIES.length - 1, rarityRank(rarityId) + 1)];

function fnv(text, seed) {
  let h = seed >>> 0;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

export function mergedNonce(parts) {
  const text = [...parts].map(String).join('|');
  const hex = [0x811c9dc5, 0x01000193, 0x9e3779b9, 0x85ebca6b].map((seed) => fnv(text, seed)).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

export const BATCH_MAX = 30;
export const BATCH_CARDS = 200;

export const batchable = (spec) => Boolean(spec) && !(spec.kind === 'timed' && (Number(spec.timedSlots) || 1) > 1) && (Number(spec.cards) || 0) > 0;

export const batchCap = (spec) => (batchable(spec) ? Math.max(1, Math.min(BATCH_MAX, Math.floor(BATCH_CARDS / Math.max(1, Number(spec.cards) || 1)))) : 1);

export const batchNonce = (parts) => mergedNonce(['batch', ...parts]);

export function batchSizes(sizes, total, boosters) {
  const list = Array.isArray(sizes) ? sizes.map((n) => Math.max(0, Math.floor(Number(n) || 0))) : [];
  if (list.length === boosters && list.reduce((a, n) => a + n, 0) === total) return list;
  const each = Math.floor(total / Math.max(1, boosters));
  return Array.from({ length: boosters }, (_, i) => (i === boosters - 1 ? total - each * (boosters - 1) : each));
}

export function batchPity(cards, spec, dry, sizes, limit = pityLimit()) {
  const out = [];
  let left = Math.max(0, Number(dry) || 0);
  let at = 0;
  for (const size of sizes) {
    const part = cards.slice(at, at + size);
    at += size;
    const shaped = withPity(part, spec, left, limit);
    left = pityAfter(left, spec, shaped);
    out.push(...shaped);
  }
  return { cards: out, dry: left };
}

export const RESERVE_TOTAL = 40;
export const RESERVE_FLOOR = 3;
export const RESERVE_FOCUS = 5;
export const RESERVE_SPEC = BATCH_MAX;

export function reservePlan(slots, { focus = null, total = RESERVE_TOTAL } = {}) {
  const list = (Array.isArray(slots) ? slots : [])
    .map((s) => ({ id: String(s?.id ?? ''), left: Math.max(0, Math.floor(Number(s?.left) || 0)) }))
    .filter((s) => s.id && s.left > 0)
    .sort((a, b) => (a.id === focus ? -1 : b.id === focus ? 1 : 0));
  const want = new Map();
  let room = Math.max(0, Math.floor(Number(total) || 0));
  for (const s of list) {
    const w = Math.min(s.left, s.id === focus ? RESERVE_FOCUS : RESERVE_FLOOR, RESERVE_SPEC, room);
    want.set(s.id, w);
    room -= w;
  }
  while (room > 0) {
    let moved = false;
    for (const s of list) {
      const w = want.get(s.id) ?? 0;
      if (room > 0 && w < Math.min(s.left, RESERVE_SPEC)) { want.set(s.id, w + 1); room--; moved = true; }
    }
    if (!moved) break;
  }
  for (const [id, w] of want) if (!w) want.delete(id);
  return want;
}
