import { check, done } from './lib.mjs';
import { createEconDb } from '../lib/econdb.mjs';

const { run, EconError } = await import('../../src/econ/engine.js');
const { specId } = await import('../../src/booster.js');
const { batchCap, batchNonce, batchPity, mergedNonce, pityLimit, BATCH_MAX } = await import('../../src/econ/rules.js');

const NOW = Date.UTC(2026, 9, 2, 12, 0, 0);
let drawn = 0;
const fakeDraw = async (pack) => {
  drawn++;
  const n = pack.cards ?? 5;
  return Array.from({ length: n }, (_, i) => ({
    key: `en:Batch_${drawn}_${i}`, title: `Batch ${drawn} ${i}`, thumbnail: 'https://img/x.jpg', lang: 'en',
    views: 10, popularity: 0.01, rarityId: 'common'
  }));
};
const db = createEconDb();
const ctxFor = (id, extra = {}) => ({ store: db.store(id), now: NOW, random: () => 0.42, draw: fakeDraw, later: () => {}, user: id, ...extra });
const call = (id, action, args, extra) => run(ctxFor(id, extra), action, args);
const refused = async (fn, code) => {
  try { await fn(); return false; } catch (e) { return e instanceof EconError && e.code === code; }
};

const spec = { kind: 'theme', themeId: 'animals', rarityId: null, cards: 5 };
const id = specId(spec);
const U = 'user-batch';
await call(U, 'import');
await db.store(U).apply({ inventory: [{ spec_id: id, spec, delta: 6 }], state: { pity: pityLimit() - 2 } });

const ready = await call(U, 'prepare', { specId: id });
const many = await call(U, 'prepareMany', { specId: id, count: 4 });
check('preparing many draws the missing boosters', many.want === 4 && many.pulls.length === 4, `${many.want} ${many.pulls.length}`);
check('and reuses the draw already waiting', many.pulls[0].nonce === ready.nonce);
check('every draw is a full booster', many.pulls.every((p) => p.cards.length === 5));
const skip = many.pulls.slice(0, 4).map((p) => p.nonce);
const rest = await call(U, 'prepareMany', { specId: id, count: 10, skip });
check('it never offers more than the boosters left once the opening ones are skipped', rest.want === 2 && rest.pulls.length === 2, `${rest.want} ${rest.pulls.length}`);
check('nor a draw that is being opened', rest.pulls.every((p) => !skip.includes(p.nonce)));
check('a booster not held cannot be prepared', await refused(() => call(U, 'prepareMany', { specId: 'theme|nothing|std|5', count: 3 }), 'NOT_HELD'));

const parts = many.pulls.map((p) => p.nonce);
const nonce = batchNonce(parts);
check('the batch nonce differs from a timed merge of the same draws', nonce !== mergedNonce(parts));
const before = db.users.get(U).state.boostersOpened ?? 0;
check('a wrong nonce opens nothing', await refused(() => call(U, 'open', { nonce: mergedNonce(parts), parts, batch: true }), 'NO_PULL'));
const predicted = batchPity(many.pulls.flatMap((p) => p.cards), spec, pityLimit() - 2, many.pulls.map((p) => p.cards.length));
const r = await call(U, 'open', { nonce, parts, batch: true });
check('one request opens all of them', r.outcome === 'opened' && r.boosters === 4 && r.pulls.length === 20, `${r.outcome} ${r.boosters} ${r.pulls?.length}`);
check('it uses four boosters', r.inventory[id]?.count === 2, String(r.inventory[id]?.count));
check('and counts four openings', r.state.boostersOpened === before + 4, String(r.state.boostersOpened));
check('every card is filed', many.pulls.every((p) => p.cards.every((c) => r.cards[c.article.key]?.count >= 1)));
check('the drawn parts are spent', parts.every((n) => db.pulls.get(n)?.claimedAt));
const pitied = r.pulls.map((c, i) => (c.pity ? i : -1)).filter((i) => i >= 0);
check('pity applies per booster: only the second booster reached it', pitied.length === 1 && pitied[0] === 9, JSON.stringify(pitied));
check('and the counter starts over after it', r.state.pity === 2, String(r.state.pity));
check('the device predicts the same cards', JSON.stringify(predicted.cards.map((c) => c.rarityId)) === JSON.stringify(r.pulls.map((c) => c.rarityId)) && predicted.dry === r.state.pity);

const again = await call(U, 'open', { nonce, parts, batch: true });
check('sending it again is answered, not refused', again.outcome === 'already' && again.pulls.length === 20);
check('and changes nothing', again.inventory[id]?.count === 2 && again.state.boostersOpened === before + 4);

const two = await call(U, 'prepareMany', { specId: id, count: 5 });
check('the two left can still be opened together', two.pulls.length === 2);
const twoParts = two.pulls.map((p) => p.nonce);
await db.store(U).apply({ inventory: [{ spec_id: id, spec, delta: -1 }] });
check('a batch larger than what is held is refused', await refused(() => call(U, 'open', { nonce: batchNonce(twoParts), parts: twoParts, batch: true }), 'NOT_HELD'));
check('and its draws stay usable', twoParts.every((n) => !db.pulls.get(n)?.claimedAt));

check('the cap keeps a batch under two hundred cards', batchCap({ kind: 'theme', cards: 5 }) === BATCH_MAX && batchCap({ kind: 'custom', cards: 20 }) === 10);
check('a merged free booster is never batched', batchCap({ kind: 'timed', cards: 15, timedSlots: 3 }) === 1);

done();
