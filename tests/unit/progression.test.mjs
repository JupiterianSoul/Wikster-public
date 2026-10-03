import { check, done } from './lib.mjs';
import { createEconDb } from '../lib/econdb.mjs';

const P = await import('../../src/progression.js');
const { MAX_LEVEL, addXp, xpForLevel, levelFraction, levelOf, clampLevel, cleanPending, normalizeProgress, xpToNext, atMaxLevel } = P;
const { run } = await import('../../src/econ/engine.js');
const { itemsOps } = await import('../../src/econ/liveops.js');
const { specId } = await import('../../src/booster.js');
const { normalizeProfile } = await import('../../src/collection.js');

const trip = (v) => JSON.parse(JSON.stringify(v));

{
  const p = { level: MAX_LEVEL, xp: 0 };
  const gained = addXp(p, 5000);
  check('at the top level, XP never levels up', gained.length === 0 && p.level === MAX_LEVEL && p.xp === 0, JSON.stringify(p));
  for (let i = 0; i < 50; i++) addXp(p, 1300);
  check('and fifty more gains change nothing', p.level === MAX_LEVEL && p.xp === 0);
  check('the ring is full', levelFraction(p) === 1 && atMaxLevel(p));
  check('there is no next amount to show', xpToNext(p) === null);
}
{
  const p = { level: MAX_LEVEL - 1, xp: 0 };
  const gained = addXp(p, xpForLevel(MAX_LEVEL - 1) * 3);
  check('the last level up lands on the top level once', JSON.stringify(gained) === JSON.stringify([MAX_LEVEL]) && p.level === MAX_LEVEL && p.xp === 0, JSON.stringify({ gained, p }));
  check('and the next gain is quiet', addXp(p, 999).length === 0 && p.level === MAX_LEVEL);
}
{
  const p = { level: 1, xp: 0 };
  const gained = addXp(p, 10000000);
  check('a huge grant climbs to the top and stops', p.level === MAX_LEVEL && p.xp === 0 && gained.length === MAX_LEVEL - 1 && gained.at(-1) === MAX_LEVEL && gained[0] === 2);
}
{
  const p = { level: 650, xp: 40 };
  const gained = addXp(p, 100);
  check('a level past the top is clamped, not restarted', gained.length === 0 && p.level === MAX_LEVEL && p.xp === 0, JSON.stringify(p));
  check('and reads as the top level everywhere', levelOf({ level: 650 }) === MAX_LEVEL && levelFraction({ level: 650, xp: 3 }) === 1 && atMaxLevel({ level: 9999 }));
}
{
  const bad = [{ level: '500', xp: 0 }, { level: Infinity, xp: 0 }, { level: 500.7, xp: 'x' }];
  for (const p of bad) {
    const shown = String(p.level);
    const gained = addXp(p, 2000);
    check(`a top level written oddly (${shown}) stays at the top`, gained.length === 0 && p.level === MAX_LEVEL && p.xp === 0, JSON.stringify(p));
  }
  const s = { level: '499', xp: 0 };
  addXp(s, 10);
  check('a level kept as text is read as a number, never concatenated', s.level === 499 && s.xp === 10, JSON.stringify(s));
}
{
  for (const level of [0, -3, null, undefined, NaN, 'abc']) {
    const p = { level, xp: 0 };
    const gained = addXp(p, 10);
    check(`a broken level (${String(level)}) never deals a level 1 level up`, !gained.includes(1) && p.level === 1, JSON.stringify({ gained, p }));
  }
  check('levels clamp between 1 and the top', clampLevel(0) === 1 && clampLevel(-5) === 1 && clampLevel(12.9) === 12 && clampLevel(501) === MAX_LEVEL && clampLevel('37') === 37);
}
{
  const p = { level: 12, xp: 30 };
  addXp(p, NaN);
  addXp(p, -50);
  addXp(p, Infinity);
  check('NaN, negative and infinite gains are ignored', p.level === 12 && p.xp === 30, JSON.stringify(p));
}
{
  const p = { level: MAX_LEVEL, xp: 0 };
  addXp(p, 5000);
  const back = trip(p);
  check('a top level survives a JSON round trip as numbers', back.level === MAX_LEVEL && back.xp === 0 && Number.isFinite(back.xp));
  check('no Infinity hides in the saved progress', !JSON.stringify(p).includes('null'));
  check('after the round trip XP still does not level up', addXp(back, 5000).length === 0 && back.level === MAX_LEVEL);
  const nulled = trip({ level: MAX_LEVEL, xp: Infinity });
  check('an Infinity that became null reads as no XP, at the top', addXp(nulled, 10).length === 0 && nulled.level === MAX_LEVEL && nulled.xp === 0, JSON.stringify(nulled));
  check('the amount to the next level is never Infinity on screen', xpToNext({ level: MAX_LEVEL }) === null && Number.isFinite(xpToNext({ level: 1 })));
}
{
  check('waiting levels keep only real level ups', JSON.stringify(cleanPending([2, 0, 1, 7, '9', null, 501, MAX_LEVEL, 3.5])) === JSON.stringify([2, 7, MAX_LEVEL]));
  check('and a broken list is empty', cleanPending(null).length === 0 && cleanPending({}).length === 0);
  const prof = normalizeProfile({ progress: { level: 650, xp: 12 }, pendingLevels: [1, 0, 600, 499] });
  check('a loaded profile is clamped to the top', prof.progress.level === MAX_LEVEL && prof.progress.xp === 0, JSON.stringify(prof.progress));
  check('and drops impossible level ups', JSON.stringify(prof.pendingLevels) === '[499]', JSON.stringify(prof.pendingLevels));
  const shared = { level: 650, xp: 3 };
  normalizeProfile({ progress: shared });
  check('normalising a profile leaves the object it came from alone', shared.level === 650 && shared.xp === 3);
  check('a fresh profile starts at level 1', JSON.stringify(normalizeProfile({}).progress) === JSON.stringify({ level: 1, xp: 0 }));
  check('normalizing is stable', JSON.stringify(normalizeProgress({ level: 37, xp: 12 })) === JSON.stringify({ level: 37, xp: 12 }));
}

const NOW = Date.UTC(2026, 8, 23, 12, 0, 0);
const SPEC = { kind: 'theme', themeId: 'animals', rarityId: null, cards: 5 };
const ID = specId(SPEC);
let seed = 11;
const random = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
let drawn = 0;
const draw = async (pack) => {
  drawn++;
  return Array.from({ length: pack.cards ?? 5 }, (_, i) => ({
    key: `en:Max_${drawn}_${i}`, title: `Max ${drawn} ${i}`, thumbnail: 'https://img/x.jpg', lang: 'en', views: 1000, popularity: 0.4
  }));
};
const db = createEconDb();
const call = (id, action, args) => run({ store: db.store(id), now: NOW, random, draw, later: () => {}, user: id }, action, args);
const openOne = async (id) => {
  const p = await call(id, 'prepare', { specId: ID });
  return call(id, 'open', { nonce: p.nonce });
};

for (const [name, start] of [['top', { level: MAX_LEVEL, xp: 0 }], ['past', { level: 720, xp: 55 }], ['text', { level: '500', xp: 0 }]]) {
  const U = `user-${name}`;
  await db.store(U).apply({ state: { imported: true, progress: start, pendingLevels: [] }, inventory: [{ spec_id: ID, spec: SPEC, delta: 4 }] });
  let levels = [];
  let last = null;
  for (let i = 0; i < 3; i++) {
    const r = await openOne(U);
    levels = levels.concat(r.levels);
    last = r;
  }
  const held = db.users.get(U).state;
  check(`server (${name}): opening boosters at the top deals no level up`, levels.length === 0 && (held.pendingLevels ?? []).length === 0, JSON.stringify(levels));
  check(`server (${name}): the level stays at the top`, held.progress.level === MAX_LEVEL && held.progress.xp === 0, JSON.stringify(held.progress));
  check(`server (${name}): the XP gained is still reported`, last.xp > 0);
}

{
  const U = 'user-almost';
  await db.store(U).apply({ state: { imported: true, progress: { level: MAX_LEVEL - 1, xp: xpForLevel(MAX_LEVEL - 1) - 1 }, pendingLevels: [] }, inventory: [{ spec_id: ID, spec: SPEC, delta: 4 }] });
  const r = await openOne(U);
  check('server: the last level up is dealt once', JSON.stringify(r.levels) === JSON.stringify([MAX_LEVEL]));
  const again = await openOne(U);
  check('server: and never again', again.levels.length === 0 && JSON.stringify(db.users.get(U).state.pendingLevels) === JSON.stringify([MAX_LEVEL]));
  const claimed = await call(U, 'level', { level: MAX_LEVEL });
  check('server: the top level reward can be claimed', claimed.state.pendingLevels.length === 0);
}

{
  const U = 'user-grant-top';
  await db.store(U).apply({ state: { imported: true, progress: { level: 40, xp: 0 }, pendingLevels: [] } });
  db.grants.push(
    { id: 901, user: U, kind: 'profile', payload: { patch: { 'progress.level': 900, 'progress.xp': 12 } } },
    { id: 902, user: U, kind: 'xp', payload: { amount: 50000 } }
  );
  const r = await call(U, 'grants');
  check('server: a creator level past the top lands as the top level', r.state.progress.level === MAX_LEVEL && r.state.progress.xp === 0, JSON.stringify(r.state.progress));
  check('server: and XP given at the top deals no level up', (r.state.pendingLevels ?? []).length === 0, JSON.stringify(r.state.pendingLevels));
}

{
  const loaded = { state: { progress: { level: MAX_LEVEL, xp: 0 }, pendingLevels: [] } };
  const out = itemsOps([{ kind: 'xp', amount: 90000 }], loaded, NOW);
  check('a code or event giving XP at the top deals no level up', out.levels.length === 0 && out.ops.state.progress.level === MAX_LEVEL && out.ops.state.progress.xp === 0);
  const set = itemsOps([{ kind: 'level', value: MAX_LEVEL }, { kind: 'xp', amount: 5 }], { state: { progress: { level: 3, xp: 9 } } }, NOW);
  check('setting the top level then giving XP stays at the top', set.levels.length === 0 && set.ops.state.progress.level === MAX_LEVEL);
}

done();
