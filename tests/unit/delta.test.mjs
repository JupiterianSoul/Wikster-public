import { check, done } from './lib.mjs';
import { createEconDb } from '../lib/econdb.mjs';
import { seedLegacyCodes } from '../lib/codefixtures.mjs';

const { runAsked, EconError } = await import('../../src/econ/engine.js');
const { canon, deltaReply, diffDoc, firstLoad, mendReply, patchDoc, partVersion, readVersion } = await import('../../src/econ/delta.js');
const { generateShop } = await import('../../src/shop.js');
const { windowIndexAt, freeWindowAt, REFRESH_MS } = await import('../../src/economy.js');
const MIRROR_EXTRA = ['seasonDay', 'wikdleStats', 'games', 'quiz', 'versusDay', 'questDay'];
const { ECON_KEYS } = await import('../../src/econ/core.js');

const NOW = Date.UTC(2026, 8, 23, 12, 0, 0);
let drawn = 0;
const fakeDraw = async (pack) => {
  drawn++;
  const n = pack.cards ?? 5;
  return Array.from({ length: n }, (_, i) => ({
    key: `en:Delta_${drawn}_${i}`, title: `Delta ${drawn} ${i}`, thumbnail: 'https://img/x.jpg', lang: 'en',
    views: 1000 * (i + 1), popularity: 0.4 + i * 0.05, rarityId: i === 0 && pack.guarantee ? pack.guarantee : 'common'
  }));
};

const db = seedLegacyCodes(createEconDb());
const fills = [];
let clock = NOW;
let titleSource = null;
const ctxFor = (id, store) => ({ store, now: clock, random: () => 0.42, draw: fakeDraw, later: (p) => fills.push(p), user: id, ...(titleSource ? { titleCards: titleSource } : {}) });
const filled = async () => { while (fills.length) await fills.shift(); };

const MIRRORED = [...ECON_KEYS, ...MIRROR_EXTRA];

function phone() {
  return { state: {}, inventory: {}, wallet: null, profile: {}, entries: {}, held: null };
}

function applyTo(p, res) {
  if (res.state && typeof res.state === 'object') {
    p.state = res.state;
    for (const key of MIRRORED) {
      if (res.state[key] === undefined) delete p.profile[key];
      else p.profile[key] = res.state[key];
    }
  }
  if (res.wallet) p.wallet = { coins: Number(res.wallet.coins) || 0, ink: Number(res.wallet.ink) || 0 };
  if (res.inventory && typeof res.inventory === 'object') {
    p.inventory = Object.fromEntries(Object.entries(res.inventory).filter(([, s]) => s?.spec && s.count > 0).map(([k, s]) => [k, { spec: s.spec, count: s.count }]));
  }
  if (res.cards && typeof res.cards === 'object') {
    if (res.replace) p.entries = {};
    for (const [k, e] of Object.entries(res.cards)) { if (e) p.entries[k] = e; else delete p.entries[k]; }
  }
}

const full = phone();
const thin = phone();
let bytesFull = 0;
let bytesThin = 0;
let deltas = 0;
let fallbacks = 0;
let mismatches = 0;
let steps = 0;

async function both(id, action, args = {}) {
  const watched = firstLoad(db.store(id));
  let result;
  try {
    result = await runAsked(ctxFor(id, watched.store), action, args);
  } catch (error) {
    if (error instanceof EconError) return { error: error.code };
    throw error;
  }
  await filled();
  const plain = JSON.parse(JSON.stringify(result));
  const sent = thin.held?.sv ?? '';
  const wire = JSON.parse(JSON.stringify(deltaReply(result, watched.first(), sent)));
  bytesFull += JSON.stringify(plain).length;
  bytesThin += JSON.stringify(wire).length;
  if (wire.state) fallbacks++;
  else if (wire.delta) deltas++;
  const mended = mendReply(wire, thin.held);
  if (!mended.ok) mismatches++;
  if (mended.held) thin.held = mended.held;
  applyTo(full, plain);
  applyTo(thin, mended.reply);
  steps++;
  const same = canon(full.state) === canon(thin.state) && canon(full.inventory) === canon(thin.inventory)
    && canon(full.profile) === canon(thin.profile) && canon(full.wallet) === canon(thin.wallet) && canon(full.entries) === canon(thin.entries);
  check(`after ${action} the phone holds the same state as with full replies`, same);
  check(`and the mended ${action} reply equals the full one`, canon(mended.reply) === canon(plain));
  return plain;
}

const A = 'delta-a';
await both(A, 'import');
check('the first reply is full because the phone had no base', fallbacks === 1 && deltas === 0);
await both(A, 'starter');
check('the next one is a delta', deltas === 1);
clock += 6 * REFRESH_MS;
await both(A, 'stipend');
await both(A, 'sync');
await both(A, 'daily');
const shop = generateShop(windowIndexAt(clock), [], freeWindowAt(clock));
const subject = shop.subjects[0];
await db.store(A).apply({ coins: subject.price * 3 });
await both(A, 'snapshot');
await both(A, 'buy', { section: 'subjects', id: subject.id });
await both(A, 'buy', { section: 'free', id: generateShop(windowIndexAt(clock), [], freeWindowAt(clock)).free?.[0]?.id ?? 'none' });
const held = Object.keys(thin.inventory);
for (const specId of held.slice(0, 3)) {
  const got = await both(A, 'prepare', { specId });
  if (got?.nonce) await both(A, 'open', { nonce: got.nonce });
}
const keys = Object.keys(thin.entries);
check('the opened boosters gave cards', keys.length > 0, String(keys.length));
await both(A, 'favorite', { key: keys[0], on: true });
await both(A, 'sell', { key: keys[1] });
await both(A, 'sellMany', { items: keys.slice(2, 4).map((key) => ({ key, copies: 1 })) });
for (const level of [...(thin.state.pendingLevels ?? [])]) await both(A, 'level', { level });
await both(A, 'batch', { items: [
  { action: 'favorite', args: { key: keys[0], on: false } },
  { action: 'exchange', args: { ink: 1 } },
  { action: 'buy', args: { section: 'subjects', id: subject.id } }
] });

const before = fallbacks;
await db.store(A).apply({ coins: 5, state: { cardsSold: 999 } });
await both(A, 'sync');
check('a change made elsewhere makes the next reply full again', fallbacks === before + 1);
await both(A, 'sync');
check('and the one after is a delta again', fallbacks === before + 1);
await db.store(A).apply({ inventory: [{ spec_id: 'theme|elsewhere|std|5', spec: { kind: 'theme', themeId: 'elsewhere', cards: 5 }, delta: 1 }] });
const deltasNow = deltas;
const mixed = await both(A, 'snapshot');
check('an inventory changed elsewhere still lets the state come as a delta', deltas === deltasNow + 1 && Boolean(mixed.inventory));
{
  const { titleCards } = await import('../../src/wiki/translate.js');
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    const u = new URL(String(url));
    const json = (body) => ({ ok: true, status: 200, json: async () => body, headers: { get: () => null } });
    if (!u.pathname.endsWith('/w/api.php') || u.searchParams.get('generator') === 'images') return json({ items: [], query: { pages: {} } });
    const pages = {};
    for (const [i, title] of (u.searchParams.get('titles') ?? '').split('|').entries()) {
      pages[7000 + i] = { pageid: 7000 + i, title, extract: `${title} is an article long enough for the face of a card, with words.`, thumbnail: { source: `https://upload.wikimedia.org/${i}.jpg` }, pageviews: { d: 900 } };
    }
    return json({ query: { pages } });
  };
  const plate = 'data:image/svg+xml,plate';
  const broken = (title) => ({ key: `special:treetest:wikipedia:en:${title}`, title, rarityId: 'special', price: 900, copies: 1, lang: 'en', packId: 'code|treetest|std|6',
    data: { extract: title, thumbnail: plate, sourceId: 'wikipedia:en', special: 'treetest', creator: false, firstPulledAt: 1 } });
  await db.store(A).apply({ add: [broken('Chess'), broken('Backgammon')], state: { cardFix: 0, codesRedeemed: { treetest: 1 } } });
  await both(A, 'snapshot');
  titleSource = titleCards;
  const deltasBefore = deltas;
  const fixedReply = await both(A, 'snapshot');
  titleSource = null;
  globalThis.fetch = realFetch;
  const moved = fixedReply.renamed ?? {};
  check('a repair that renames cards comes through a delta reply', deltas === deltasBefore + 1 && Object.keys(moved).length === 2, JSON.stringify(moved));
  check('the phone drops the title keys and holds the page id keys', Object.keys(moved).every((k) => !thin.entries[k] && thin.entries[moved[k]]?.thumbnail?.startsWith('https://')));
  check('and the renamed map survives the delta rebuild', canon(fixedReply.renamed) === canon(moved) && thin.state.cardFix === 1 && thin.state.codeDefs?.treetest?.id === 'treetest');
}
await both(A, 'wipe', { scope: 'cards', confirm: 'DELETE' });
await both(A, 'snapshot');

check('every step ended with the same phone', steps > 15 && mismatches === 0, `${steps} steps`);
check('deltas made the replies smaller', bytesThin < bytesFull, `${bytesThin} vs ${bytesFull} bytes`);
console.log(`  ${steps} replies, ${deltas} deltas, ${fallbacks} full, ${bytesFull} -> ${bytesThin} bytes`);

{
  const OLD = 'delta-old';
  await runAsked(ctxFor(OLD, db.store(OLD)), 'import', {});
  const watched = firstLoad(db.store(OLD));
  const res = await runAsked(ctxFor(OLD, watched.store), 'starter', {});
  check('an old app that sends no version gets the very same reply', deltaReply(res, watched.first(), undefined) === res);
  const fresh = deltaReply(res, watched.first(), '');
  check('a new app with no base gets the full state and a version', Boolean(fresh.state) && Boolean(fresh.inventory) && !fresh.delta && typeof fresh.sv === 'string');
  const wrong = deltaReply(res, watched.first(), 'nope.nope');
  check('a version the server cannot match gets the full state', Boolean(wrong.state) && !wrong.delta);
}

{
  const base = { state: { a: 1, b: { c: [1, 2] }, gone: true }, inventory: { x: { spec: { k: 1 }, count: 2 } } };
  const next = { state: { b: { c: [1, 2] }, a: 2, n: null }, inventory: { x: { spec: { k: 1 }, count: 1 }, y: { spec: { k: 2 }, count: 1 } } };
  const sv = `${partVersion(base.state)}.${partVersion(base.inventory)}`;
  const wire = deltaReply({ wallet: { coins: 1 }, ...next }, base, sv);
  check('the delta lists only the keys that changed or went', canon(wire.delta.state) === canon({ set: { a: 2, n: null }, gone: ['gone'] }));
  const mended = mendReply(JSON.parse(JSON.stringify(wire)), { ...base, sv });
  check('mending it gives the next state', mended.ok && canon(mended.reply.state) === canon(next.state) && canon(mended.reply.inventory) === canon(next.inventory));
  const spoiled = mendReply(JSON.parse(JSON.stringify(wire)), { ...JSON.parse(JSON.stringify(base)), state: { ...base.state, b: { c: [3] } }, sv });
  check('a spoiled base is caught instead of applied', !spoiled.ok && !('state' in spoiled.reply));
  check('key order does not change the version', partVersion({ a: 1, b: 2 }) === partVersion({ b: 2, a: 1 }));
  check('patching with nothing changes nothing', canon(patchDoc(base.state, diffDoc(base.state, base.state))) === canon(base.state));
  check('a version has one part per document', Object.keys(readVersion('a.b')).length === 2 && readVersion('a.b').inventory === 'b');
}

done();
