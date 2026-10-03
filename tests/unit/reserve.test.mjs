import { check, done } from './lib.mjs';
import { createEconDb } from '../lib/econdb.mjs';

const { RESERVE_FLOOR, RESERVE_FOCUS, RESERVE_SPEC, RESERVE_TOTAL, reservePlan } = await import('../../src/econ/rules.js');
const { run } = await import('../../src/econ/engine.js');
const { specId } = await import('../../src/booster.js');

let plan = reservePlan([{ id: 'a', left: 1 }]);
check('one booster held keeps one draw', plan.get('a') === 1);
plan = reservePlan([{ id: 'a', left: 12 }]);
check('every booster held gets its draw', plan.get('a') === 12);
plan = reservePlan([{ id: 'a', left: 60 }]);
check('a big stack is capped at what one Open all takes', plan.get('a') === RESERVE_SPEC);
plan = reservePlan([{ id: 'a', left: 60 }, { id: 'b', left: 60 }]);
check('the whole reserve never goes over the total', [...plan.values()].reduce((s, n) => s + n, 0) === RESERVE_TOTAL);
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
check('the reserve covers every booster of a big stack', (res.ready[id]?.length ?? 0) === 20, String(res.ready[id]?.length));
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

const timed = { kind: 'timed', timedLevel: 1, cards: 9, timedSlots: 3 };
await db.store('u').apply({ inventory: [{ spec_id: specId(timed), spec: timed, delta: 1 }] });
manyCalls = 0;
res = await call('prepare', { specId: specId(timed) });
check('a merged free booster is drawn as its parts in one batch', res.cards.length === 9 && manyCalls === 1, `${res.cards.length} cards`);

done();
