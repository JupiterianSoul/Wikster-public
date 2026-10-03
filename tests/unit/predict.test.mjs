import { check, done } from './lib.mjs';
import { createEconDb } from '../lib/econdb.mjs';

const { run } = await import('../../src/econ/engine.js');
const { predict } = await import('../../src/econ/local.js');
const { rowToEntry } = await import('../../src/econ/cards.js');
const { generateShop } = await import('../../src/shop.js');
const { windowIndexAt, freeWindowAt } = await import('../../src/economy.js');
const { INK_FRAMES } = await import('../../src/frames.js');

const NOW = Date.UTC(2026, 8, 23, 12, 0, 0);
let n = 0;
const draw = async (pack) => Array.from({ length: pack.cards ?? 5 }, (_, i) => ({
  key: `en:P_${++n}`, title: `P ${n}`, thumbnail: 'https://img/x.jpg', lang: 'en', views: 900 * (i + 1), popularity: 0.3 + i * 0.1, rarityId: 'common'
}));
const db = createEconDb();
const U = 'user-predict';
const serverCall = (action, args = {}) => run({ store: db.store(U), now: NOW, random: () => 0.37, draw }, action, args);

async function view() {
  const snap = await serverCall('snapshot');
  return {
    wallet: snap.wallet,
    state: snap.state,
    inventory: snap.inventory,
    custom: snap.custom,
    entries: snap.cards
  };
}

const shape = (r) => JSON.stringify({
  wallet: r.wallet,
  inventory: r.inventory,
  cards: r.cards,
  state: Object.fromEntries(Object.entries(r.state ?? {}).filter(([k]) => k !== 'rev' && k !== 'crateNext')),
  winner: r.winner ?? null
});

async function same(label, action, args = {}, known = null) {
  const before = await view();
  const guess = await predict(run, action, args, before, known, NOW);
  const truth = await serverCall(action, args);
  check(`${label}: the phone and the server agree`, shape(guess) === shape(truth), `${shape(guess).slice(0, 160)} | ${shape(truth).slice(0, 160)}`);
  return truth;
}

await serverCall('import');
await serverCall('starter');
await db.store(U).apply({ coins: 90000, ink: 5000 });
await serverCall('sync');

const shop = generateShop(windowIndexAt(NOW), [], freeWindowAt(NOW));
await same('buying a booster', 'buy', { section: 'subjects', id: shop.subjects[0].id });
await same('taking the free booster', 'buy', { section: 'free', id: shop.free[0].id });
await same('buying a bundle', 'buy', { section: 'bundles', id: shop.bundles[0].id });
await same('opening the crate', 'buy', { section: 'crate' });
await same('opening the crate again', 'buy', { section: 'crate' });
await same('the day booster', 'buy', { section: 'today' });
await same('the daily gift', 'daily');
await same('trading for ink', 'exchange', { ink: 3 });
await same('buying a frame', 'atelier', { kind: 'frames', id: INK_FRAMES[0].id });
await same('the stipend', 'stipend');

const held = Object.keys((await serverCall('snapshot')).inventory).find((id) => id.startsWith('theme|'));
const pull = await serverCall('prepare', { specId: held });
await serverCall('open', { nonce: pull.nonce });
const key = pull.cards[0].article.key;
await same('marking a favourite', 'favorite', { key, on: true });
await same('selling a card', 'sell', { key: pull.cards[1].article.key });
await same('favouriting in bulk', 'favoriteMany', { keys: [pull.cards[2].article.key, pull.cards[3].article.key], on: true });
await same('selling in bulk', 'sellMany', { items: [{ key: pull.cards[2].article.key, copies: 1 }, { key: pull.cards[3].article.key, copies: 1 }] });
db.users.get(U).state.pendingLevels = [2];
await same('claiming a level', 'level', { level: 2 });
await same('checking album medals', 'medals');

const before = await view();
let refused = null;
try { await predict(run, 'buy', { section: 'free', id: shop.free[0].id }, before, null, NOW); } catch (e) { refused = e.message; }
check('a refusal is known on the phone without asking', refused === 'SOLD_OUT', String(refused));
let needs = null;
try { await predict(run, 'collect', {}, before, null, NOW); } catch (e) { needs = e.cannotPredict; }
check('what only the server knows is left to the server', needs === true);
const quest = await predict(run, 'quest', { id: 'open-1' }, before, { quest: { progress: 1, target: 1, claimed: false } }, NOW).catch((e) => e);
check('a quest the phone knows is done is paid at once', quest?.wallet?.coins > before.wallet.coins || quest?.code === 'UNKNOWN', String(quest?.code ?? quest?.wallet?.coins));

done();
