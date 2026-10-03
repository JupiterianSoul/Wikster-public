import { check, done } from './lib.mjs';
import { createEconDb } from '../lib/econdb.mjs';

const { run, EconError } = await import('../../src/econ/engine.js');
const { predict } = await import('../../src/econ/local.js');
const { generateShop } = await import('../../src/shop.js');
const { windowIndexAt, freeWindowAt, STARTER_COINS, STIPEND, REFRESH_MS, sellPriceFor, cratePriceAt, TODAY_PRICE } = await import('../../src/economy.js');
const { specId } = await import('../../src/booster.js');
const { rewardForLevel } = await import('../../src/progression.js');
const { RESERVE_SPEC, reservePlan } = await import('../../src/econ/rules.js');

const NOW = Date.UTC(2026, 8, 23, 12, 0, 0);
let drawn = 0;
const fakeDraw = async (pack) => {
  drawn++;
  const n = pack.cards ?? 5;
  return Array.from({ length: n }, (_, i) => ({
    key: `en:Card_${drawn}_${i}`, title: `Card ${drawn} ${i}`, thumbnail: 'https://img/x.jpg', lang: 'en',
    views: 1000 * (i + 1), popularity: 0.4 + i * 0.05, rarityId: i === 0 && pack.guarantee ? pack.guarantee : 'common'
  }));
};

const db = createEconDb();
const fills = [];
const ctxFor = (id, extra = {}) => ({ store: db.store(id), now: NOW, random: () => 0.42, draw: fakeDraw, later: (p) => fills.push(p), user: id, ...extra });
const filled = async () => { while (fills.length) await fills.shift(); };
const call = (id, action, args, extra) => run(ctxFor(id, extra), action, args);
const refused = async (fn, code) => {
  try { await fn(); return false; } catch (e) { return e instanceof EconError && e.code === code; }
};

const A = 'user-a';
let r = await call(A, 'import');
check('an account with no save imports nothing', ['new', 'empty'].includes(r.outcome) && r.state.imported === true && r.wallet.coins === 0);
r = await call(A, 'starter');
check('the starter pays its coins', r.wallet.coins === STARTER_COINS);
check('and three boosters', Object.values(r.inventory).reduce((s, slot) => s + slot.count, 0) === 3);
check('only once', await refused(() => call(A, 'starter'), 'ALREADY_CLAIMED'));

check('the shop restocks every hour', REFRESH_MS === 3600000 && windowIndexAt(NOW + 3600000) === windowIndexAt(NOW) + 1);
r = await call(A, 'stipend', {}, { now: NOW + 6 * REFRESH_MS });
check('the stipend pays for the windows missed', r.paid === 6 * STIPEND, String(r.paid));
let applies = db.applies;
r = await call(A, 'stipend', {}, { now: NOW + 6 * REFRESH_MS });
check('and not twice for the same window', r.paid === 0);
check('a stipend with nothing due writes nothing', db.applies === applies);
await call(A, 'sync');
applies = db.applies;
r = await call(A, 'sync');
check('a sync with nothing new writes nothing', db.applies === applies && r.wallet.coins === 6 * STIPEND + STARTER_COINS && Boolean(r.state.crateNext));
await call(A, 'collect');
await call(A, 'medals');
check('collecting nothing and winning no medal write nothing', db.applies === applies);
{
  const OLD = 'user-old-window';
  await call(OLD, 'import');
  await db.store(OLD).apply({ state: { started: true, stipendWindow: Math.floor(NOW / 7200000) } });
  const same = await call(OLD, 'stipend', {}, { now: NOW + REFRESH_MS });
  check('an account paid under the old two hour window is not paid again inside it', same.paid === 0, String(same.paid));
  const next = await call(OLD, 'stipend', {}, { now: NOW + 2 * REFRESH_MS });
  check('and gets one hourly stipend once that window is over', next.paid === STIPEND && next.state.stipendHour === windowIndexAt(NOW + 2 * REFRESH_MS), String(next.paid));
  const day = await call(OLD, 'stipend', {}, { now: NOW + 30 * REFRESH_MS });
  check('a day away banks the same eight hours as before', day.paid === 8 * STIPEND && 8 * STIPEND === 4 * 500, String(day.paid));
}

const shop = generateShop(windowIndexAt(NOW), [], freeWindowAt(NOW));
const subject = shop.subjects[0];
await db.store(A).apply({ coins: subject.price * subject.stock });
r = await call(A, 'snapshot');
const coinsBefore = r.wallet.coins;
r = await call(A, 'buy', { section: 'subjects', id: subject.id });
check('buying takes exactly the shop price', r.wallet.coins === coinsBefore - subject.price, `${coinsBefore} - ${subject.price} = ${r.wallet.coins}`);
check('and gives the booster', (r.inventory[subject.id]?.count ?? 0) >= 1);
for (let i = 1; i < subject.stock; i++) await call(A, 'buy', { section: 'subjects', id: subject.id });
check('stock runs out', await refused(() => call(A, 'buy', { section: 'subjects', id: subject.id }), 'SOLD_OUT'));
check('an offer that is not in the shop is refused', await refused(() => call(A, 'buy', { section: 'subjects', id: 'theme|made-up|std|5' }), 'NOT_IN_SHOP'));

const free = shop.free[0];
r = await call(A, 'buy', { section: 'free', id: free.id });
check('the free shelf costs nothing', r.inventory[free.id]?.count >= 1);
check('and is taken once per window', await refused(() => call(A, 'buy', { section: 'free', id: free.id }), 'SOLD_OUT'));

const poor = 'user-poor';
await call(poor, 'import');
check('no coins, no purchase', await refused(() => call(poor, 'buy', { section: 'subjects', id: subject.id }), 'INSUFFICIENT_FUNDS'));
check('and the failed purchase leaves nothing behind', Object.keys((await call(poor, 'snapshot')).inventory).length === 0);

const before = (await call(A, 'snapshot')).wallet.coins;
r = await call(A, 'buy', { section: 'crate' });
check('the crate charges the crate price', r.wallet.coins === before - cratePriceAt(0));
check('and hands over the booster it rolled', Boolean(r.winner) && (r.inventory[specId(r.winner)]?.count ?? 0) >= 1);

await db.store(A).apply({ coins: TODAY_PRICE });
r = await call(A, 'buy', { section: 'today' });
check('the day booster costs its price', r.price === TODAY_PRICE);
check('once a day', await refused(() => call(A, 'buy', { section: 'today' }), 'SOLD_OUT'));

const held = Object.keys((await call(A, 'snapshot')).inventory).find((id) => id.startsWith('theme|'));
const p1 = await call(A, 'prepare', { specId: held });
const p2 = await call(A, 'prepare', { specId: held });
check('a draw is held for the booster', Boolean(p1.nonce) && p1.cards.length > 0);
check('and asking again does not re-roll it', p1.nonce === p2.nonce && JSON.stringify(p1.cards) === JSON.stringify(p2.cards));
check('a booster not held cannot be drawn', await refused(() => call(A, 'prepare', { specId: 'theme|nothing|std|5' }), 'NOT_HELD'));
const countBefore = (await call(A, 'snapshot')).inventory[held].count;
const ledgerBefore = db.users.get(A).ledger.length;
r = await call(A, 'open', { nonce: p1.nonce });
check('opening a booster writes no ledger row', db.users.get(A).ledger.length === ledgerBefore);
check('opening uses the booster', (r.inventory[held]?.count ?? 0) === countBefore - 1);
check('and files exactly the drawn cards', p1.cards.every((c) => r.cards[c.article.key]?.count >= 1));
check('with the price the server set', p1.cards.every((c) => r.cards[c.article.key].price >= c.price || r.cards[c.article.key].rarityId !== c.rarityId));
check('experience is earned', r.xp > 0 && r.state.boostersOpened === 1);
const again = await call(A, 'open', { nonce: p1.nonce });
check('opening a claimed draw again is answered, not refused', again.outcome === 'already' && again.pulls.length === p1.cards.length);
check('and changes nothing', (again.inventory[held]?.count ?? 0) === countBefore - 1 && again.state.boostersOpened === 1);

const B = 'user-b';
await call(B, 'import');
check('nobody opens someone else\'s draw', await refused(() => call(B, 'open', { nonce: p1.nonce }), 'NO_PULL'));

const RD = 'user-ready';
await call(RD, 'import');
await call(RD, 'starter');
const rdSpec = Object.values((await call(RD, 'snapshot')).inventory)[0].spec;
await db.store(RD).apply({ inventory: [{ spec_id: specId(rdSpec), spec: rdSpec, delta: 4 }] });
const rdHeld = (await call(RD, 'snapshot')).inventory;
let open = null;
const gate = new Promise((resolve) => { open = resolve; });
let waitingDraws = 0;
const gated = async (pack) => { waitingDraws++; await gate; return fakeDraw(pack); };
let rr = await call(RD, 'ready', {}, { draw: gated });
check('ready answers at once without waiting for a draw', rr.filling === true && Object.keys(rr.ready).length === 0, String(waitingDraws));
open();
await filled();
rr = await call(RD, 'ready');
const rdId = specId(rdSpec);
check('ready draws ahead for every booster held', Object.keys(rdHeld).every((id) => (rr.ready[id]?.length ?? 0) >= 1));
const rdPlan = reservePlan(Object.entries(rdHeld).map(([id, slot]) => ({ id, left: slot.count })));
check('a waiting draw for every booster held, as the reserve plans', rr.ready[rdId].length === rdPlan.get(rdId) && rdPlan.get(rdId) === Math.min(rdHeld[rdId].count, RESERVE_SPEC), `${rr.ready[rdId].length} of ${rdHeld[rdId].count}`);
check('with the cards of each draw', rr.ready[rdId].every((n) => Array.isArray(rr.pulls[n]) && rr.pulls[n].length > 0));
const drawsBefore = drawn;
const rr2 = await call(RD, 'ready', { have: Object.keys(rr.pulls) });
check('asking again draws nothing new', drawn === drawsBefore && JSON.stringify(rr2.ready) === JSON.stringify(rr.ready));
check('and does not send cards already held', Object.keys(rr2.pulls).length === 0);
const [firstNonce, secondNonce] = rr.ready[rdId];
const later = await call(RD, 'open', { nonce: secondNonce });
check('a draw opens by its nonce, whatever the order', later.outcome === 'opened' && rr.pulls[secondNonce].every((c) => later.cards[c.article.key]));
const opened = await call(RD, 'open', { nonce: firstNonce });
check('the first waiting draw opens with the cards shown', rr.pulls[firstNonce].every((c) => opened.cards[c.article.key]));
rr = await call(RD, 'ready', { have: [firstNonce, secondNonce] });
await filled();
rr = await call(RD, 'ready', { have: [firstNonce, secondNonce] });
check('opened draws are no longer offered', !rr.ready[rdId]?.includes(firstNonce) && !rr.ready[rdId]?.includes(secondNonce));
check('and the stock is topped up to what is held', (rr.ready[rdId]?.length ?? 0) === Math.min(3, (await call(RD, 'snapshot')).inventory[rdId].count));
const [headNonce, nextNonce] = rr.ready[rdId];
const skipped = await call(RD, 'prepare', { specId: rdId, skip: [headNonce] });
check('a draw being opened is skipped when preparing the next', skipped.nonce === nextNonce);
const rrSkip = await call(RD, 'ready', { have: Object.keys(rr.pulls), skip: [headNonce] });
check('and left out of ready', !rrSkip.ready[rdId]?.includes(headNonce) && rrSkip.ready[rdId]?.[0] === nextNonce);
const failing = await run({ ...ctxFor(RD), draw: async () => { throw new Error('wiki down'); } }, 'ready', { have: Object.keys(rr.pulls) });
check('a draw that fails does not break ready', typeof failing.more === 'boolean');

const BT = 'user-batch';
await call(BT, 'import');
await call(BT, 'starter');
const btShop = generateShop(windowIndexAt(NOW), [], freeWindowAt(NOW));
const btLoads = { n: 0 };
const btStore = db.store(BT);
const counted = { ...btStore, load: async () => { btLoads.n++; return btStore.load(); }, weigh: (n) => { btLoads.weight = n; } };
const batch = await run({ ...ctxFor(BT), store: counted }, 'batch', { items: [
  { action: 'buy', args: { section: 'subjects', id: btShop.subjects[0].id } },
  { action: 'buy', args: { section: 'subjects', id: 'theme|made-up|std|5' } },
  { action: 'open', args: { nonce: 'x' } },
  { action: 'exchange', args: { ink: 1 } }
] });
check('a batch runs every action in order and reports each', batch.results[0].ok?.price === btShop.subjects[0].price
  && batch.results[1].error === 'NOT_IN_SHOP' && batch.results[2].error === 'UNKNOWN_ACTION' && Boolean(batch.results[3].ok));
check('and returns the final wallet once', batch.wallet.ink === 1 && batch.wallet.coins === (await call(BT, 'snapshot')).wallet.coins && batch.wallet.coins < STARTER_COINS - btShop.subjects[0].price);
check('counting each action toward the limit', btLoads.weight === 4);
check('the items do not repeat the wallet and state', !('wallet' in batch.results[0].ok) && !('state' in batch.results[0].ok));

const SN = 'user-since';
const live = () => ({ now: Date.now() });
await call(SN, 'import', {}, live());
await db.store(SN).apply({ add: [{ key: 's1', title: 'S1' }, { key: 's2', title: 'S2' }, { key: 's3', title: 'S3' }] });
const full = await call(SN, 'snapshot', {}, live());
check('a snapshot without a moment sends every card and the moment to ask from next', full.replace === true && Object.keys(full.cards).length === 3 && Number.isFinite(full.since));
const stamp = Date.now();
while (Date.now() === stamp) await new Promise((res) => setTimeout(res, 2));
await db.store(SN).apply({ remove: [{ key: 's1' }], patch: [{ key: 's2', favorite: true }] });
const part = await call(SN, 'snapshot', { since: stamp }, live());
check('a snapshot since a moment sends only what changed', !part.replace && part.cards.s1 === null && part.cards.s2?.favorite === true && !('s3' in part.cards));
const old = await call(SN, 'snapshot', { since: Date.now() - 40 * 86400000 }, live());
check('a moment too far back gets everything', old.replace === true && Object.keys(old.cards).length === 2);
const started = await call(SN, 'import', { since: stamp, sync: true }, live());
check('starting up imports, syncs and catches up in one call', started.outcome === 'already' && started.synced === true && !started.replace
  && started.cards.s1 === null && Boolean(started.state.crateNext));

const key = p1.cards[0].article.key;
const priceNow = r.cards[key].price;
const walletNow = r.wallet.coins;
r = await call(A, 'sell', { key });
check('selling pays the sell price', r.wallet.coins === walletNow + sellPriceFor(priceNow));
check('and the card leaves', r.cards[key] === null);
check('a card not owned cannot be sold', await refused(() => call(A, 'sell', { key }), 'NOT_OWNED'));

const LEV = 'user-lev';
await call(LEV, 'import');
db.users.get(LEV).state.pendingLevels = [2, 3];
r = await call(LEV, 'level', { level: 2 });
const reward = rewardForLevel(2);
check('a level reward pays what the level promises', r.wallet.coins === (reward.coins ?? 0) && r.wallet.ink > 0);
check('once', await refused(() => call(LEV, 'level', { level: 2 }), 'NOT_EARNED'));
check('a level not reached pays nothing', await refused(() => call(LEV, 'level', { level: 50 }), 'NOT_EARNED'));

r = await call(LEV, 'daily');
check('the daily gift pays day one', r.wallet.coins > (reward.coins ?? 0) && r.state.daily.day === 1);
check('once a day', await refused(() => call(LEV, 'daily'), 'ALREADY_CLAIMED'));
r = await call(LEV, 'daily', {}, { now: NOW + 86400000 });
check('and again the next day', r.state.daily.day === 2);

const T = 'user-timed';
await call(T, 'import');
db.users.get(T).state.timed = { count: 0, last: NOW - 3600000, opened: 0 };
r = await call(T, 'timed', { slots: 99 });
check('timed boosters build up with time', r.spec.kind === 'timed' && r.spec.cards >= 3);
check('and cannot be taken twice', await refused(() => call(T, 'timed', { slots: 99 }), 'NONE_HELD'));

const F = 'user-fuse';
await call(F, 'import');
await db.store(F).apply({ add: [{ key: 'en:Cat', title: 'Cat', rarityId: 'rare', price: 300, copies: 4, data: { thumbnail: 'x' } }] });
r = await call(F, 'fuse', { key: 'en:Cat' });
check('fusing three spare copies gives a better booster', r.spec.rarityId === 'epic' && r.cards['en:Cat'].count === 1);
check('and needs the spares', await refused(() => call(F, 'fuse', { key: 'en:Cat' }), 'CANNOT_FUSE'));
await db.store(F).apply({ add: [{ key: 'special:x', title: 'Special', rarityId: 'special', price: 0, copies: 1, data: { special: 'x' } }] });
check('a special card is never sold', await refused(() => call(F, 'sell', { key: 'special:x' }), 'LOCKED'));

const BULK = 'user-bulk';
await call(BULK, 'import');
await db.store(BULK).apply({ add: [
  { key: 'en:Ant', title: 'Ant', rarityId: 'common', price: 100, copies: 3, data: { thumbnail: 'x' } },
  { key: 'en:Bee', title: 'Bee', rarityId: 'rare', price: 400, copies: 1, data: { thumbnail: 'x' } },
  { key: 'en:Bee', title: 'Bee', rarityId: 'common', price: 100, copies: 2, data: { thumbnail: 'x' } },
  { key: 'en:Cow', title: 'Cow', rarityId: 'epic', price: 900, copies: 5, data: { thumbnail: 'x' } },
  { key: 'en:Doe', title: 'Doe', rarityId: 'uncommon', price: 200, copies: 1, data: { thumbnail: 'x' } }
] });
const beeBefore = (await db.store(BULK).cards(['en:Bee']))[0];
const { printPrice: pp } = await import('../../src/econ/rules.js');
const coinsBulk = (await db.store(BULK).load()).wallet.coins;
applies = db.applies;
r = await call(BULK, 'sellMany', { items: [{ key: 'en:Ant', copies: 2 }, { key: 'en:Bee', prints: { common: 2 } }, { key: 'en:Doe', copies: 1 }] });
const beeCommon = sellPriceFor(pp(Number(beeBefore.price), 'rare', 'common'));
check('a bulk sale is one write', db.applies === applies + 1, String(db.applies - applies));
check('and pays every copy at the print it was', r.amount === 2 * sellPriceFor(100) + 2 * beeCommon + sellPriceFor(200) && r.wallet.coins === coinsBulk + r.amount, `${r.amount}`);
check('spares go first and the best print stays', r.cards['en:Ant'].count === 1 && r.cards['en:Bee'].count === 1 && r.cards['en:Bee'].rarityId === 'rare');
check('a last copy goes when it is asked for', r.cards['en:Doe'] === null && r.copies === 5);
check('and the sale is counted', r.state.cardsSold === 5);
check('selling more than is owned sells nothing', await refused(() => call(BULK, 'sellMany', { items: [{ key: 'en:Cow', copies: 2 }, { key: 'en:Ant', copies: 4 }] }), 'NOT_OWNED')
  && (await db.store(BULK).cards(['en:Cow']))[0].copies === 5);
check('a print that is not there is refused', await refused(() => call(BULK, 'sellMany', { items: [{ key: 'en:Cow', prints: { common: 1 } }] }), 'NOT_OWNED'));
check('an empty sale is refused', await refused(() => call(BULK, 'sellMany', { items: [] }), 'BAD_BATCH'));
r = await call(BULK, 'favoriteMany', { keys: ['en:Ant', 'en:Cow'], on: true });
check('favourites are set in one go', r.cards['en:Ant'].favorite === true && r.cards['en:Cow'].favorite === true);
r = await call(BULK, 'fuseMany', { items: [{ key: 'en:Cow' }] });
check('a bulk fuse takes three spares and gives a booster a tier up', r.cards['en:Cow'].count === 2 && r.fused[0].tier === 'legendary'
  && Object.values(r.inventory).some((slot) => slot.spec.rarityId === 'legendary' && slot.spec.cards === 1));
check('and refuses cards without the spares', await refused(() => call(BULK, 'fuseMany', { items: [{ key: 'en:Ant' }] }), 'CANNOT_FUSE'));

const ED = 'user-edition';
await call(ED, 'import');
await db.store(ED).apply({ add: Array.from({ length: 12 }, (_, i) => ({ key: `tiny:${i}`, title: `Tiny ${i}`, rarityId: 'common', price: 50, copies: 1, packId: 'custom|tiny.example.org', data: { thumbnail: 'x', packName: 'Tiny' } })) });
r = await call(ED, 'medals', {}, { albumTotal: async () => 13 });
check('a small album one card short wins nothing yet', r.won.length === 0, r.won.map((w) => w.tier).join());
await db.store(ED).apply({ add: [{ key: 'tiny:12', title: 'Tiny 12', rarityId: 'common', price: 50, copies: 1, packId: 'custom|tiny.example.org', data: { thumbnail: 'x' } }] });
r = await call(ED, 'medals', {}, { albumTotal: async () => 13 });
check('owning every card of the album wins the Complete Edition on top of the others', r.won.length === 5 && r.won.at(-1).tier === 'complete' && r.won.at(-1).spec?.rarityId === 'exotic', r.won.map((w) => w.tier).join());
check('which is the fifth medal of the album', r.state.albumTiers['custom:tiny-example-org'] === 5, JSON.stringify(r.state.albumTiers));
r = await call(ED, 'medals', {}, { albumTotal: async () => 13 });
check('and is paid once', r.won.length === 0);
r = await call(ED, 'medals', {}, { albumTotal: async () => null });
check('an album of unknown size never wins it', r.won.length === 0);

const I = 'user-ink';
await call(I, 'import');
await db.store(I).apply({ coins: 100000 });
r = await call(I, 'exchange', { ink: 200 });
check('Ink is pressed at the rate', r.wallet.ink === 200 && r.wallet.coins === 100000 - 200 * 60);
const theme = 'arcade';
r = await call(I, 'atelier', { kind: 'themes', id: theme });
check('a theme is bought with Ink', r.state.owned.themes.includes(theme) && r.wallet.ink === 200 - 120);
check('not twice', await refused(() => call(I, 'atelier', { kind: 'themes', id: theme }), 'OWNED'));
check('and only what is sold', await refused(() => call(I, 'atelier', { kind: 'themes', id: 'not-a-theme' }), 'NOT_SOLD'));
const { INK_FRAMES } = await import('../../src/frames.js');
check('Ink cannot go below zero', await refused(() => call(I, 'atelier', { kind: 'frames', id: INK_FRAMES[0].id }), 'INSUFFICIENT_FUNDS'));
check('and a silly exchange is refused', await refused(() => call(I, 'exchange', { ink: 99999 }), 'BAD_AMOUNT'));

const C = 'user-custom';
await call(C, 'import');
check('a custom booster must point at a real wiki api', await refused(() => call(C, 'customSave', { pack: { id: 'x', name: 'X', wiki: { apiUrl: 'javascript:alert(1)' } } }), 'BAD_PACK'));
for (const bad of ['https://127.0.0.1/api.php', 'https://localhost/api.php', 'https://wiki.internal/api.php', 'https://[::1]/api.php', 'https://intranet/api.php', 'https://good.org:8443/api.php', 'http://starwars.fandom.com/api.php']) {
  check(`a custom booster cannot point at ${bad}`, await refused(() => call(C, 'customSave', { pack: { id: 'x', name: 'X', wiki: { apiUrl: bad } } }), 'BAD_PACK'));
}
db.blockedHosts.add('badwiki.example');
check('a blocked wiki is refused', await refused(() => call(C, 'customSave', { pack: { id: 'bw', name: 'Bad', wiki: { apiUrl: 'https://en.badwiki.example/api.php' } } }), 'HOST_BLOCKED'));
r = await call(C, 'customSave', { pack: { id: 'starwars', name: 'Star Wars', wiki: { apiUrl: 'https://starwars.fandom.com/api.php', sitename: 'Wookieepedia' } } });
check('a custom booster is kept on the server', r.custom.length === 1 && r.custom[0].wiki.apiUrl === 'https://starwars.fandom.com/api.php');
const withCustom = generateShop(windowIndexAt(NOW), r.custom, freeWindowAt(NOW));
await db.store(C).apply({ coins: 50000 });
r = await call(C, 'buy', { section: 'customs', id: withCustom.customs[0].id });
check('and can be bought from the shop at the shop price', r.price === withCustom.customs[0].price);
{
  const ORDER = 'user-custom-order';
  await call(ORDER, 'import');
  const made = ['zz-last', 'aa-first', 'mm-middle', 'bb-second'].map((id, i) => ({ id, name: `Wiki ${i}`, wiki: { apiUrl: `https://w${i}.fandom.com/api.php`, sitename: `W${i}` } }));
  for (const pack of made) await call(ORDER, 'customSave', { pack });
  await db.store(ORDER).apply({ coins: 500000 });
  const server = (await db.store(ORDER).load()).custom.map((row) => row.def ?? row);
  const device = [...made].reverse().slice(1);
  const seenBy = (list) => generateShop(windowIndexAt(NOW), list, freeWindowAt(NOW)).customs.map((it) => `${it.spec.customId}:${it.id}`).join(',');
  check('custom boosters sit in the same order on every device', seenBy(server) === seenBy([...server].reverse()) && seenBy(made) === seenBy(server));
  const deviceShop = generateShop(windowIndexAt(NOW), device, freeWindowAt(NOW));
  let bought = 0;
  for (const item of deviceShop.customs) {
    const res = await call(ORDER, 'buy', { section: 'customs', id: item.id, customId: item.spec.customId, cards: 8, count: 2 });
    if (res.count === 2 && res.specs[0].customId === item.spec.customId && res.specs[0].cards === 8) bought++;
  }
  check('every custom booster can be bought whatever order the device keeps them in', bought === device.length, `${bought} of ${device.length}`);
  let old = 0;
  for (const item of deviceShop.customs) {
    const res = await call(ORDER, 'buy', { section: 'customs', id: item.id });
    if (res.specs[0].customId === item.spec.customId && res.price === item.price) old++;
  }
  check('and an old app that only sends the shop id still buys the right one', old === device.length, `${old} of ${device.length}`);
  const local = await predict(run, 'buy', { section: 'customs', id: deviceShop.customs[0].id, customId: deviceShop.customs[0].spec.customId, cards: 3, count: 4 }, {
    wallet: { coins: 100000, ink: 0 }, state: {}, inventory: {}, custom: device, entries: {}
  }, null, NOW);
  const real = await call(ORDER, 'buy', { section: 'customs', id: deviceShop.customs[0].id, customId: deviceShop.customs[0].spec.customId, cards: 3, count: 4 });
  check('the phone predicts the same custom buy as the server', local.price === real.price && local.count === real.count && specId(local.specs[0]) === specId(real.specs[0]));
  check('a custom booster that is not the player\'s is not in the shop', await refused(() => call(ORDER, 'buy', { section: 'customs', id: 'custom|nowhere.fandom.com|std|5', customId: 'not-mine' }), 'NOT_IN_SHOP'));
  check('a size outside the range is refused', await refused(() => call(ORDER, 'buy', { section: 'customs', id: deviceShop.customs[0].id, cards: 99 }), 'BAD_SIZE'));
  const { t } = await import('../../src/i18n.js');
  const { readFileSync } = await import('node:fs');
  const econSource = readFileSync(new URL('../../src/app/econ.js', import.meta.url), 'utf8');
  check('and the player is told the shop moved on, not a generic failure', /NOT_IN_SHOP: 'econNotInShop'/.test(econSource) && t('econNotInShop') !== t('econFailed') && t('econNotInShop') !== 'econNotInShop');
}

const legacyUser = 'user-legacy';
db.born.set(legacyUser, NOW - 86400000 * 30);
db.cutover = NOW;
db.legacy.set(legacyUser, { format: 'wikster-save', data: {
  'wikster.wallet.v1': '4321',
  'wikster.ink.v1': '77',
  'wikster.inventory.v1': JSON.stringify({ 'theme|animals|std|5': { spec: { kind: 'theme', themeId: 'animals', rarityId: null, cards: 5 }, count: 2 } }),
  'wikster.collection.v3': JSON.stringify({ entries: { 'en:Dog': { key: 'en:Dog', title: 'Dog', rarityId: 'rare', price: 280, count: 3, thumbnail: 't', favorite: true } } }),
  'wikster.profile.v1': JSON.stringify({ started: true, progress: { level: 9, xp: 40 }, boostersOpened: 41, playMs: 5 })
} });
r = await call(legacyUser, 'import');
check('an existing save is carried over', r.outcome === 'imported' && r.wallet.coins === 4321 && r.wallet.ink === 77);
check('with its boosters', r.inventory['theme|animals|std|5']?.count === 2);
check('its cards, copies counted', r.cards['en:Dog']?.count === 3 && r.cards['en:Dog'].price === 280);
check('and its progress, but nothing that is not economy', r.state.progress.level === 9 && r.state.boostersOpened === 41 && r.state.playMs === undefined);
r = await call(legacyUser, 'import');
check('importing twice changes nothing', r.outcome === 'already' && r.wallet.coins === 4321);
const packy = 'user-packywiki';
db.born.set(packy, NOW - 86400000 * 40);
db.legacy.set(packy, { format: 'packywiki-save', version: 1, data: {
  'packywiki.wallet.v1': '650',
  'packywiki.inventory.v1': JSON.stringify({ 'theme|space|std|5': { spec: { kind: 'theme', themeId: 'space', rarityId: null, cards: 5 }, count: 1 } }),
  'packywiki.collection.v3': JSON.stringify({ entries: { 'en:Moon': { key: 'en:Moon', title: 'Moon', rarityId: 'epic', price: 500, count: 2 } } }),
  'packywiki.profile.v1': JSON.stringify({ started: true, codesRedeemed: { somecode: 1 }, boostersOpened: 7 })
} });
r = await call(packy, 'import');
check('a save from before the rename (packywiki keys) is carried over too', r.outcome === 'imported' && r.wallet.coins === 650
  && r.cards['en:Moon']?.count === 2 && r.inventory['theme|space|std|5']?.count === 1 && r.state.codesRedeemed?.somecode === 1 && r.state.boostersOpened === 7);
const late = 'user-late';
db.born.set(late, NOW + 1000);
db.legacy.set(late, { format: 'wikster-save', data: { 'wikster.wallet.v1': '999999' } });
r = await call(late, 'import');
check('an account made after the switch imports nothing, whatever its save says', r.outcome === 'new' && r.wallet.coins === 0);

const R = 'user-race';
await call(R, 'import');
await db.store(R).apply({ coins: 100 });
const [x, y] = await Promise.allSettled([call(R, 'daily'), call(R, 'daily')]);
const paid = (await call(R, 'snapshot')).wallet.coins - 100;
check('two claims at once pay once', [x, y].filter((s) => s.status === 'fulfilled').length === 1 && paid === 250, `${x.status}/${y.status} paid ${paid}`);

done();
