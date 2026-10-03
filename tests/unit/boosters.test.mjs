import { check, done } from './lib.mjs';
import { createEconDb } from '../lib/econdb.mjs';

const { run } = await import('../../src/econ/engine.js');
const { predict } = await import('../../src/econ/local.js');
const R = await import('../../src/econ/rules.js');
const { rollRarity, oddsFor } = await import('../../src/data/odds.js');
const { rarityRank, rarityById } = await import('../../src/data/rarities.js');
const { setLive } = await import('../../src/live.js');
const { sellPriceFor } = await import('../../src/economy.js');
const { specId } = await import('../../src/booster.js');
const { timedSpec } = await import('../../src/timed.js');
const { priceFor } = await import('../../src/pricing.js');

const NOW = Date.UTC(2026, 8, 23, 12, 0, 0);
const SPEC = { kind: 'theme', themeId: 'animals', rarityId: null, cards: 5 };
const ID = specId(SPEC);
let seed = 7;
const random = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };

let allCommons = 0;
let inflated = 0;
for (let i = 0; i < 10000; i++) {
  const cards = Array.from({ length: 5 }, () => ({ rarityId: rollRarity(oddsFor(null), random) }));
  const shaped = R.shapeHit(cards, SPEC, oddsFor(null), random);
  if (rarityRank(shaped.at(-1).rarityId) < 1) allCommons++;
  const had = cards.some((c) => rarityRank(c.rarityId) >= 1);
  const same = JSON.stringify(cards.map((c) => c.rarityId).sort()) === JSON.stringify(shaped.map((c) => c.rarityId).sort());
  if (had && !same) inflated++;
}
check('over 10,000 standard boosters the last card is never Common', allCommons === 0, String(allCommons));
check('a booster that already had a hit only moves it last, it is never upgraded', inflated === 0, String(inflated));
check('one-card and code boosters are left alone',
  R.shapeHit([{ rarityId: 'common' }, { rarityId: 'common' }], { kind: 'code', codeId: 'x', cards: 2 }, oddsFor(null)).at(-1).rarityId === 'common'
  && R.shapeHit([{ rarityId: 'common' }], { kind: 'open', cards: 1 }, oddsFor(null)).at(-1).rarityId === 'common');
const lowTimed = R.shapeHit([{ rarityId: 'common' }, { rarityId: 'common' }, { rarityId: 'common' }], timedSpec(1), oddsFor(null), random);
check('a timed booster gets its hit within its ceiling', rarityRank(lowTimed.at(-1).rarityId) >= 1 && rarityRank(lowTimed.at(-1).rarityId) <= R.topRank(timedSpec(1)));

let drawn = 0;
const commons = async (pack) => {
  drawn++;
  return Array.from({ length: pack.cards ?? 5 }, (_, i) => ({
    key: `en:Pity_${drawn}_${i}`, title: `Pity ${drawn} ${i}`, thumbnail: 'https://img/x.jpg', lang: 'en',
    views: 100, popularity: 0.3, rarityId: 'common'
  }));
};
const db = createEconDb();
const fills = [];
const ctxFor = (id, extra = {}) => ({ store: db.store(id), now: NOW, random, draw: commons, later: (p) => fills.push(p), user: id, ...extra });
const call = (id, action, args, extra) => run(ctxFor(id, extra), action, args);

setLive({ tuning: { 'odds.table': { none: [50, 0, 50, 0, 0, 0, 0, 0] } } });
const U = 'user-hit';
await db.store(U).apply({ state: { imported: true }, inventory: [{ spec_id: ID, spec: SPEC, delta: 40 }] });
let rareHits = 0;
for (let i = 0; i < 20; i++) {
  const p = await call(U, 'prepare', { specId: ID });
  if (p.cards.at(-1).rarityId === 'rare') rareHits++;
  await call(U, 'open', { nonce: p.nonce });
}
check('the server hit slot follows the live odds tuning', rareHits === 20, String(rareHits));
setLive(null);

setLive({ tuning: { 'odds.table': { none: [50, 50, 0, 0, 0, 0, 0, 0] } } });
const P = 'user-pity';
await db.store(P).apply({ state: { imported: true }, inventory: [{ spec_id: ID, spec: SPEC, delta: 90 }] });
let firstLegend = null;
for (let i = 1; i <= 45 && firstLegend == null; i++) {
  const p = await call(P, 'prepare', { specId: ID });
  const r = await call(P, 'open', { nonce: p.nonce });
  if (r.pulls.some((c) => rarityRank(c.rarityId) >= 4)) firstLegend = i;
}
check('pity guarantees a Legendary within 40 boosters', firstLegend === 40, String(firstLegend));
check('and resets the counter', (db.users.get(P).state.pity ?? -1) === 0);
setLive({ tuning: { 'pity.legendary': 10, 'odds.table': { none: [50, 50, 0, 0, 0, 0, 0, 0] } } });
let tuned = null;
for (let i = 1; i <= 12 && tuned == null; i++) {
  const p = await call(P, 'prepare', { specId: ID });
  const r = await call(P, 'open', { nonce: p.nonce });
  if (r.pulls.some((c) => rarityRank(c.rarityId) >= 4)) tuned = i;
}
check('the pity threshold is a live tuning key', tuned === 10, String(tuned));
setLive(null);
const cards = [{ rarityId: 'common', price: 20, article: { popularity: 0.3 } }, { rarityId: 'uncommon', price: 30, article: { popularity: 0.3 } }];
const forced = R.withPity(cards, { kind: 'theme', themeId: 'x', cards: 3 }, 39, 40);
check('the phone applies the same pity to a waiting draw', forced.at(-1).rarityId === 'legendary' && forced.at(-1).price === priceFor(0.3, rarityById('legendary')));
check('and not before it is due', R.withPity(cards, { kind: 'theme', themeId: 'x', cards: 3 }, 30, 40) === cards);
const p1 = await call(P, 'prepare', { specId: ID });
const opened1 = await call(P, 'open', { nonce: p1.nonce });
const again1 = await call(P, 'open', { nonce: p1.nonce });
check('an open replayed returns the cards it filed, pity included', again1.outcome === 'already'
  && JSON.stringify(again1.pulls.map((c) => c.rarityId)) === JSON.stringify(opened1.pulls.map((c) => c.rarityId)));

const S = 'user-prints';
const row = (rarityId, price) => ({ key: 'en:Print', title: 'Print', rarityId, price, copies: 1, lang: 'en', data: { popularity: 0.5 } });
await db.store(S).apply({ state: { imported: true }, add: [row('rare', 160)] });
await db.store(S).apply({ add: [row('rare', 160)] });
await db.store(S).apply({ add: [row('epic', 240)] });
let card = db.users.get(S).cards.get('en:Print');
check('a better pull shows as the best print', card.rarity_id === 'epic' && card.copies === 3 && card.prints.rare === 2 && card.prints.epic === 1);
check('the collection value sums every print at its own price', R.cardValue({ rarityId: card.rarity_id, count: card.copies, prints: card.prints, price: card.price }) === 160 * 2 + 240);
let r = await call(S, 'sell', { key: 'en:Print' });
check('selling takes the lowest spare at its own price', r.rarityId === 'rare' && r.amount === sellPriceFor(160), JSON.stringify({ r: r.rarityId, a: r.amount }));
card = db.users.get(S).cards.get('en:Print');
check('and keeps the best print', card.rarity_id === 'epic' && card.prints.rare === 1 && card.prints.epic === 1);
const failedFuse = await call(S, 'fuse', { key: 'en:Print' }).then(() => 'ok', (e) => e.code);
check('fusing needs three spares of the same rarity', failedFuse === 'CANNOT_FUSE', failedFuse);
await db.store(S).apply({ add: [row('rare', 160), row('rare', 160)] });
r = await call(S, 'fuse', { key: 'en:Print' });
card = db.users.get(S).cards.get('en:Print');
check('three rare spares fuse into an epic booster', r.from === 'rare' && r.tier === 'epic' && card.copies === 1 && card.rarity_id === 'epic');
const base = { wallet: { coins: 0, ink: 0 }, state: db.users.get(S).state, inventory: {}, custom: [], entries: { 'en:Print': { key: 'en:Print', title: 'Print', rarityId: 'epic', price: 240, count: 3, prints: { common: 2, epic: 1 } } } };
const guess = await predict(run, 'sell', { key: 'en:Print' }, base, null, NOW);
check('the phone predicts the same spare and amount', guess.rarityId === 'common' && guess.amount === sellPriceFor(R.printPrice(240, 'epic', 'common')));

const G = 'user-old';
await db.users.set(G, { wallet: { coins: 0, ink: 0 }, state: { imported: true }, inventory: new Map(), cards: new Map([['en:Old', { article_key: 'en:Old', title: 'Old', rarity_id: 'legendary', price: 420, copies: 3, lang: 'en', pack_id: null, data: {}, favorite: false }]]), claims: new Set(), custom: new Map(), ledger: [], gone: new Map() });
r = await call(G, 'sell', { key: 'en:Old' });
const old = db.users.get(G).cards.get('en:Old');
check('a row from before prints keeps one rarity for every copy', r.rarityId === 'legendary' && r.amount === sellPriceFor(420) && old.copies === 2 && old.rarity_id === 'legendary' && old.prints.legendary === 2);

db.friends.add(`${G}|${S}`);
await db.store(G).apply({ add: [{ key: 'en:Old', title: 'Old', rarityId: 'common', price: 30, copies: 1, lang: 'en', data: {} }] });
const gift = await db.store(G).p2p('gift', { p_to: S, p_kind: 'card', p_ref: 'en:Old' });
check('a gifted spare travels at its own rarity', gift.payload.rarityId === 'common' && gift.payload.price === R.printPrice(420, 'legendary', 'common'));

const T = 'user-timed';
await db.store(T).apply({ state: { imported: true, timed: { count: 3, last: NOW, opened: 0 } } });
await call(T, 'ready', {});
while (fills.length) await fills.shift();
const ready = await call(T, 'ready', {});
const baseId = specId(timedSpec(1));
const parts = ready.ready[baseId];
check('three single free boosters are drawn ahead', parts?.length === 3, String(parts?.length));
const timed = await call(T, 'timed', { slots: 3 });
const mergedId = specId(timed.spec);
check('taking three slots offers the merged draw', timed.merged?.nonce === R.mergedNonce(parts) && timed.merged.cards.length === 9);
const merged = await call(T, 'open', { nonce: R.mergedNonce(parts), parts });
check('the merged draw opens with the cards of the three', merged.outcome === 'opened' && merged.pulls.length === 9
  && parts.every((n) => ready.pulls[n].every((c) => merged.cards[c.article.key])));
check('it uses the merged booster and counts three opened', !merged.inventory[mergedId] && db.users.get(T).state.timed.opened === 3);
check('the parts are spent', parts.every((n) => db.pulls.get(n).claimedAt));
const mergedAgain = await call(T, 'open', { nonce: R.mergedNonce(parts), parts });
check('replaying the merged open is answered as already done', mergedAgain.outcome === 'already' && mergedAgain.pulls.length === 9);

done();
