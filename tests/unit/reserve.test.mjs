import { check, done } from './lib.mjs';
import { createEconDb } from '../lib/econdb.mjs';

const { RESERVE_FLOOR, RESERVE_FOCUS, RESERVE_SPEC, RESERVE_TOTAL, reservePlan } = await import('../../src/econ/rules.js');
const { run } = await import('../../src/econ/engine.js');
const { specId } = await import('../../src/booster.js');

let plan = reservePlan([{ id: 'a', left: 1 }]);
check('one booster held keeps one draw', plan.get('a') === 1);
plan = reservePlan([{ id: 'a', left: 4 }]);
check('every booster of a small stack gets its draw', plan.get('a') === 4);
plan = reservePlan([{ id: 'a', left: 60 }]);
check('a big stack is capped at what one Open all takes', plan.get('a') === RESERVE_SPEC);
plan = reservePlan([{ id: 'a', left: 60 }, { id: 'b', left: 60 }]);
check('the whole reserve never goes over the total', [...plan.values()].reduce((s, n) => s + n, 0) <= RESERVE_TOTAL);
check('and is shared fairly', Math.abs(plan.get('a') - plan.get('b')) <= 1);
const many = Array.from({ length: 30 }, (_, i) => ({ id: `s${i}`, left: 4 }));
plan = reservePlan(many, { focus: 's29' });
check('the booster on screen is served first', plan.get('s29') === Math.min(4, RESERVE_FOCUS));
check('others get their floor while there is room', plan.get('s0') === RESERVE_FLOOR);
check('and the total holds', [...plan.values()].reduce((s, n) => s + n, 0) <= RESERVE_TOTAL);
plan = reservePlan([{ id: 'a', left: 0 }, { id: '', left: 3 }, { id: 'b', left: -2 }]);
check('nothing held, nothing planned', plan.size === 0);
plan = reservePlan([{ id: 'a', left: 2 }, { id: 'b', left: 50 }], { focus: 'b' });
check('a small stack keeps all its draws next to a big one', plan.get('a') === 2 && plan.get('b') === Math.min(RESERVE_SPEC, RESERVE_TOTAL - 2));

const NOW = Date.UTC(2026, 9, 3, 12, 0, 0);
const db = createEconDb();
const fills = [];
let singles = 0;
let manyCalls = 0;
let n = 0;
const article = (i) => ({ key: `en:Many_${++n}`, title: `Many ${n}`, thumbnail: 'https://img/x.jpg', lang: 'en', views: 100 * (i + 1), popularity: 0.3, rarityId: 'common' });
const draw = async (pack) => { singles++; return Array.from({ length: pack.cards ?? 5 }, (_, i) => article(i)); };
const drawMany = async (pack, count) => { manyCalls++; return Array.from({ length: count }, () => Array.from({ length: pack.cards ?? 5 }, (_, i) => article(i))); };
const notes = [];
const ctxFor = (extra = {}) => ({ store: db.store('u'), now: NOW, random: () => 0.42, draw, drawMany, later: (p) => fills.push(p), user: 'u', notify: async (event, payload) => notes.push({ event, payload }), ...extra });
const call = (action, args, extra) => run(ctxFor(extra), action, args);
const filled = async () => { while (fills.length) await fills.shift(); };

await call('import');
await call('starter');
const spec = { kind: 'theme', themeId: 'animals', rarityId: null, cards: 5 };
const id = specId(spec);
await db.store('u').apply({ inventory: [{ spec_id: id, spec, delta: 20 }] });
let res = await call('ready', {});
check('ready answers at once and fills in the background', res.filling === true);
await filled();
res = await call('ready', {});
check('the reserve covers a big stack up to its cap', (res.ready[id]?.length ?? 0) === RESERVE_SPEC, String(res.ready[id]?.length));
check('drawn in batches, not one by one', manyCalls >= 1 && singles <= 3, `${manyCalls} batch draws, ${singles} single draws`);
const events = notes.filter((e) => e.event === 'ready');
check('the draws reach the phone in small live events', events.length >= 2 && events.every((e) => (e.payload.pulls?.length ?? 0) <= 8));
check('the last event says the fill is done', events.at(-1)?.payload.done === true);

await db.store('u').apply({ inventory: [{ spec_id: id, spec, delta: 10 }] });
manyCalls = 0;
singles = 0;
const spent = res.ready[id];
res = await call('prepareMany', { specId: id, count: 10, skip: spent });
check('prepareMany draws every missing booster in one go', res.pulls.length === 10 && manyCalls === 1 && singles === 0, `${res.pulls.length} pulls, ${manyCalls}/${singles}`);
check('and none of them is one the phone is opening', res.pulls.every((p) => !spent.includes(p.nonce)));

const plain = { kind: 'theme', themeId: 'space', rarityId: null, cards: 5 };
await db.store('u').apply({ inventory: [{ spec_id: specId(plain), spec: plain, delta: 70 }] });
manyCalls = 0;
singles = 0;
res = await call('prepareMany', { specId: specId(plain), count: 60 });
check('prepareMany of sixty comes back whole in one call, drawn in one batch', res.pulls.length === 60 && res.want === 60 && manyCalls === 1 && singles === 0 && !res.filling,
  `${res.pulls.length} pulls, ${manyCalls} batch draws`);
check('sixty distinct draws', new Set(res.pulls.map((p) => p.nonce)).size === 60);

let poolOnlyAsked = 0;
const shortPool = async (pack, count, options = {}) => {
  if (options.poolOnly) { poolOnlyAsked++; return Array.from({ length: Math.min(count, 4) }, () => Array.from({ length: pack.cards ?? 5 }, (_, i) => article(i))); }
  return drawMany(pack, count);
};
const streamed = [];
await db.store('u').apply({ inventory: [{ spec_id: specId(plain), spec: plain, delta: 10 }] });
res = await call('prepareMany', { specId: specId(plain), count: 20, skip: res.pulls.map((p) => p.nonce) }, { drawMany: shortPool, notify: async (event, payload) => streamed.push(payload) });
check('a short pool answers at once with what it holds', res.pulls.length === 4 && res.filling === true && poolOnlyAsked === 1, `${res.pulls.length} pulls`);
await filled();
check('and the rest streams in live events', streamed.flatMap((p) => p.pulls ?? []).length === 16 && streamed.at(-1)?.done === true, String(streamed.flatMap((p) => p.pulls ?? []).length));

const { runAsked } = await import('../../src/econ/engine.js');
const K = 'kicker';
await run({ ...ctxFor(), user: K, store: db.store(K) }, 'import', {});
await run({ ...ctxFor(), user: 'kicker2', store: db.store('kicker2') }, 'import', {});
fills.length = 0;
await runAsked({ ...ctxFor(), user: K, store: db.store(K) }, 'starter', {});
check('gaining boosters starts the fill at once, with no ready ask', fills.length === 1, String(fills.length));
await filled();
const kickedReady = await run({ ...ctxFor(), user: K, store: db.store(K) }, 'ready', {});
check('so their draws are waiting before the phone asks', Object.values(kickedReady.ready).flat().length >= 3, JSON.stringify(Object.fromEntries(Object.entries(kickedReady.ready).map(([k, v]) => [k, v.length]))));
await filled();
for (let i = 0; i < 3; i++) await runAsked({ ...ctxFor(), user: 'kicker2', store: db.store('kicker2') }, i ? 'grants' : 'starter', {}).catch(() => null);
check('and fills are coalesced, never one per action', fills.length === 2, `${fills.length} background jobs for 3 actions`);

const timed = { kind: 'timed', timedLevel: 1, cards: 9, timedSlots: 3 };
await db.store('u').apply({ inventory: [{ spec_id: specId(timed), spec: timed, delta: 1 }] });
manyCalls = 0;
res = await call('prepare', { specId: specId(timed) });
check('a merged free booster is drawn as its parts in one batch', res.cards.length === 9 && manyCalls === 1, `${res.cards.length} cards`);

done();
