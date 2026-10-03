import { check, done } from './lib.mjs';
import { createEconDb } from '../lib/econdb.mjs';

const { run, EconError } = await import('../../src/econ/engine.js');
const { specId } = await import('../../src/booster.js');

const NOW = Date.UTC(2026, 8, 23, 12, 0, 0);
const db = createEconDb();
const call = (id, action, args) => run({ store: db.store(id), now: NOW, random: () => 0.5, draw: async () => [] }, action, args);
const refused = async (fn, code) => {
  try { await fn(); return false; } catch (e) { return e instanceof EconError && e.code === code; }
};

const A = '00000000-0000-0000-0000-00000000000a';
const B = '00000000-0000-0000-0000-00000000000b';
const C = '00000000-0000-0000-0000-00000000000c';
for (const id of [A, B, C]) await call(id, 'import');
db.friends.add(`${A}|${B}`);
const spec = { kind: 'open', themeId: null, rarityId: 'epic', cards: 5 };
await db.store(A).apply({
  add: [{ key: 'en:Cat', title: 'Cat', rarityId: 'rare', price: 300, copies: 2, data: { thumbnail: 't.jpg' } }],
  inventory: [{ spec_id: specId(spec), spec, delta: 1 }]
});

let r = await call(A, 'gift', { to: B, kind: 'card', ref: 'en:Cat', note: 'hi' });
check('a gift leaves the sender with one copy fewer', r.cards['en:Cat']?.count === 1);
check('and counts for the season', r.season?.gained > 0);
r = await call(A, 'gift', { to: B, kind: 'booster', ref: specId(spec) });
check('a booster can be given', Object.keys(r.inventory).length === 0);
check('only to friends', await refused(() => call(A, 'gift', { to: C, kind: 'card', ref: 'en:Cat' }), 'NOT_FRIENDS'));
check('an address that is not an account is refused', await refused(() => call(A, 'gift', { to: 'bob', kind: 'card', ref: 'en:Cat' }), 'NOT_FOUND'));
check('only cards and boosters', await refused(() => call(A, 'gift', { to: B, kind: 'coins', ref: '1' }), 'BAD_KIND'));

db.deliveries.push(
  { id: 'd-old', sender: C, recipient: B, kind: 'card', payload: { key: 'en:Old', title: 'Old', rarityId: 'common', price: 12, count: 1, thumbnail: 'o.jpg' } },
  { id: 'd-money', sender: C, recipient: B, kind: 'auction-money', payload: { amount: 250, reason: 'sale' } },
  { id: 'd-trade', sender: C, recipient: B, kind: 'trade-return', payload: { cards: [{ key: 'en:Traded', title: 'T', rarityId: 'uncommon', price: 40, count: 1 }] } }
);
r = await call(B, 'collect');
check('collecting lands the card', r.cards['en:Cat']?.count === 1 && r.cards['en:Cat'].thumbnail === 't.jpg');
check('and the booster', r.inventory[specId(spec)]?.count === 1);
check('and cards sent before the switch', r.cards['en:Old']?.thumbnail === 'o.jpg');
check('and auction money', r.wallet.coins === 250);
check('and cards from a trade', r.cards['en:Traded']?.count === 1);
check('and says what landed', r.landed.length === 5);
r = await call(B, 'collect');
check('a delivery lands once', r.landed.length === 0 && r.wallet.coins === 250);

done();
