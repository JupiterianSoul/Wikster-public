import { readFileSync } from 'node:fs';
import { check, done } from './lib.mjs';
import { createEconDb } from '../lib/econdb.mjs';

const { run } = await import('../../src/econ/engine.js');
const { predict } = await import('../../src/econ/local.js');
const { generateShop, liveShelf } = await import('../../src/shop.js');
const { windowIndexAt, freeWindowAt, boosterPrice, sellPriceFor, cratePriceAt, todayPrice, TODAY_PRICE } = await import('../../src/economy.js');
const { TUNING, setLive, useLiveSource, tune, liveNow, cleanSpec: cleanSpecOf } = await import('../../src/live.js');
const { liveOddsFor, oddsFor, rollRarity } = await import('../../src/data/odds.js');
const { toDrawPack, specName } = await import('../../src/booster.js');
const { themeById } = await import('../../src/data/packs.js');
const { xpForCard } = await import('../../src/progression.js');
const { maxHeld, regenMs } = await import('../../src/timed.js');
const { weekLadder } = await import('../../src/daily.js');

const NOW = Date.UTC(2026, 8, 23, 12, 0, 0);
const iso = (ms) => new Date(ms).toISOString();
const DAY = 86400000;
let n = 0;
const drawn = [];
const draw = async (pack) => {
  drawn.push(pack);
  return Array.from({ length: pack.cards ?? 5 }, (_, i) => ({
    key: `en:L_${++n}`, title: `L ${n}`, thumbnail: 'https://img/x.jpg', lang: 'en', views: 900 * (i + 1), popularity: 0.3 + i * 0.1
  }));
};
const db = createEconDb();
const U = 'user-live';
const serverCall = (action, args = {}, user = U) => run({ store: db.store(user), now: NOW, random: () => 0.37, draw }, action, args);
useLiveSource(() => db.live);

async function view(user = U) {
  const snap = await serverCall('snapshot', {}, user);
  return { wallet: snap.wallet, state: snap.state, inventory: snap.inventory, custom: snap.custom, entries: snap.cards };
}
const shape = (r) => JSON.stringify({
  wallet: r.wallet, inventory: r.inventory, cards: r.cards,
  state: Object.fromEntries(Object.entries(r.state ?? {}).filter(([k]) => k !== 'rev' && k !== 'crateNext'))
});
async function same(label, action, args = {}) {
  const before = await view();
  const guess = await predict(run, action, args, before, null, NOW);
  const truth = await serverCall(action, args);
  check(`${label}: the phone and the server agree`, shape(guess) === shape(truth), `${shape(guess).slice(0, 200)} | ${shape(truth).slice(0, 200)}`);
  return truth;
}
async function serverOnly(label, action, args = {}) {
  const before = await view();
  let cannot = false;
  try { await predict(run, action, args, before, null, NOW); } catch (e) { cannot = Boolean(e.cannotPredict); }
  check(`${label}: the phone leaves it to the server`, cannot);
}
const live = (patch) => { db.live = { tuning: {}, events: [], packs: [], stock: {}, ...db.live, ...patch }; };

await serverCall('import');
await serverCall('starter');
await db.store(U).apply({ coins: 500000, ink: 5000 });
await serverCall('sync');

const base = generateShop(windowIndexAt(NOW), [], freeWindowAt(NOW), NOW);
live({ tuning: { 'shop.priceMult': 2 } });
const doubled = generateShop(windowIndexAt(NOW), [], freeWindowAt(NOW), NOW);
check('a price tuning doubles shop prices', doubled.subjects.every((it, i) => it.price === Math.max(5, Math.round((base.subjects[i].price * 2) / 5) * 5)));
check('the free shelf stays free', doubled.free.every((it) => it.price === 0));
const before = (await view()).wallet.coins;
await same('buying at the tuned price', 'buy', { section: 'subjects', id: doubled.subjects[0].id });
check('the server charged the tuned price', before - (await view()).wallet.coins === doubled.subjects[0].price);

live({ tuning: {}, events: [{ id: 'ev-sale', name: 'Sale', kind: 'price', params: { mult: 0.5, sections: ['subjects'] }, starts_at: iso(NOW - DAY), ends_at: iso(NOW + DAY) }] });
const sale = generateShop(windowIndexAt(NOW), [], freeWindowAt(NOW), NOW);
check('a price event halves the sections it names', sale.subjects[1].price === Math.max(5, Math.round((base.subjects[1].price * 0.5) / 5) * 5));
check('and leaves the others alone', sale.press.every((it, i) => it.price === base.press[i].price));
await same('buying in a sale', 'buy', { section: 'subjects', id: sale.subjects[1].id });
live({ events: [{ id: 'ev-old', name: 'Old', kind: 'price', params: { mult: 0.5 }, starts_at: iso(NOW - 3 * DAY), ends_at: iso(NOW - DAY) }] });
check('an event that is over changes nothing', generateShop(windowIndexAt(NOW), [], freeWindowAt(NOW), NOW).subjects[0].price === base.subjects[0].price);
live({ events: [] });

live({ tuning: { 'sell.mult': 2, 'stipend.amount': 900, 'fuse.copies': 2, 'crate.basePrice': 2000, 'xp.mult': 3, 'timed.capBonus': 5, 'timed.regenMult': 0.5, 'daily.coinsMult': 2 } });
check('sell, crate and stipend read the tuning', sellPriceFor(100) === 60 && cratePriceAt(0, NOW) === 2000 && tune('stipend.amount') === 900);
check('timed packs and the daily gift read it too', maxHeld(1) === 12 && regenMs(1) === 300000 && weekLadder(0)[0].coins === 500);
check('xp per card reads it', xpForCard('common', NOW) === 36);
db.users.get(U).state.stipendHour = windowIndexAt(NOW) - 2;
const paid = await same('the stipend', 'stipend');
check('pays the tuned amount', paid.paid === 1800, String(paid.paid));
await same('the daily gift', 'daily');
live({ tuning: { 'shop.priceMult': 7, 'xp.mult': -3, 'odds.table': { rare: [1, 2] } } });
check('tuning outside its range is clamped or dropped', tune('shop.priceMult') === 5 && tune('xp.mult') === 0 && !tune('odds.table').rare);
live({ tuning: {} });

live({ events: [{ id: 'ev-drop', name: 'Lucky', kind: 'drop_rate', params: { mult: { prismatic: 50, exotic: 10 } }, starts_at: iso(NOW - DAY), ends_at: iso(Date.now() + DAY) }] });
const lucky = liveOddsFor(null, { kind: 'open' }, NOW);
const plain = oddsFor(null);
check('a drop rate event raises the odds it names', lucky[7] > plain[7] * 10 && lucky[6] > plain[6] * 5, lucky.map((x) => x.toFixed(2)).join(' '));
check('the odds still add up to a hundred', Math.abs(lucky.reduce((a, b) => a + b, 0) - 100) < 1e-9);
const pack = toDrawPack({ kind: 'open', themeId: null, rarityId: null, cards: 5 });
check('the server draw gets the boosted odds', Array.isArray(pack.odds) && Math.abs(pack.odds[7] - lucky[7]) < 1e-9);
let top = 0;
for (let i = 0; i < 4000; i++) if (rollRarity(pack.odds) === 'prismatic') top++;
check('and rolls with them', top > 40, String(top));
live({ events: [] });
check('without the event the odds are back', Math.abs(toDrawPack({ kind: 'open', themeId: null, rarityId: null, cards: 5 }).odds[7] - plain[7]) < 1e-9);
live({ tuning: { 'odds.table': { none: [10, 10, 10, 10, 10, 10, 10, 30] } } });
check('the odds table tuning feeds the draw', Math.abs(toDrawPack({ kind: 'open', themeId: null, rarityId: null, cards: 3 }).odds[7] - 30) < 1e-9);
live({ tuning: {} });

live({ events: [{ id: 'ev-xp', name: 'XP', kind: 'xp', params: { mult: 2 }, starts_at: iso(NOW - DAY), ends_at: iso(NOW + DAY) }] });
const held = Object.keys((await serverCall('snapshot')).inventory).find((id) => id.startsWith('theme|'));
const pull = await serverCall('prepare', { specId: held });
const opened = await serverCall('open', { nonce: pull.nonce });
const plainXp = pull.cards.reduce((sum, c) => sum + Math.round(xpForCard(c.rarityId, NOW - 2 * DAY)), 0);
check('an xp event doubles the xp of an opening', opened.xp === plainXp * 2, `${opened.xp} vs ${plainXp}`);
live({ events: [] });

const PACK = {
  id: 'pack-ocean', name: { en: 'Ocean', fr: 'Océan' }, tagline: { en: 'Waves', fr: 'Vagues' }, icon: 'globe', accent: '#0ea5e9', accent2: '#082f49',
  source: { type: 'category', value: { en: 'Oceans', fr: 'Océan' } }, default_cards: 4, price: 350, visible: true,
  available_from: iso(NOW - DAY), available_until: iso(NOW + DAY), limited_stock: null, per_player: 2
};
live({ packs: [PACK] });
check('an admin pack reads like a theme', specName({ kind: 'theme', themeId: 'pack-ocean', rarityId: null, cards: 4 }) === 'Ocean' && themeById('pack-ocean')?.accent === '#0ea5e9');
check('it draws from its category', toDrawPack({ kind: 'theme', themeId: 'pack-ocean', rarityId: null, cards: 4 }).queries[0] === 'incategory:"Oceans"');
const shelf = liveShelf(NOW);
check('a visible pack in its window is on the shelf', shelf.length === 1 && shelf[0].id === 'live|pack-ocean' && shelf[0].price === 350 && shelf[0].spec.cards === 4);
check('not before its window', liveShelf(NOW - 2 * DAY).length === 0);
check('nor after', liveShelf(NOW + 2 * DAY).length === 0);
await same('buying an admin pack', 'buy', { section: 'live', id: 'live|pack-ocean' });
await same('buying it again', 'buy', { section: 'live', id: 'live|pack-ocean' });
let capped = null;
try { await serverCall('buy', { section: 'live', id: 'live|pack-ocean' }); } catch (e) { capped = e.code; }
check('a player cap holds', capped === 'SOLD_OUT', String(capped));
live({ packs: [{ ...PACK, id: 'pack-theme', source: { type: 'theme', value: 'space' }, per_player: null, limited_stock: 1 }] });
check('a pack can borrow a theme', toDrawPack({ kind: 'theme', themeId: 'pack-theme', rarityId: null, cards: 4 }).queries.length > 0);
await serverOnly('a pack with limited stock', 'buy', { section: 'live', id: 'live|pack-theme' });
await serverCall('buy', { section: 'live', id: 'live|pack-theme' });
check('the stock is counted', db.stock.get('live|pack-theme') === 1 && db.live.stock['live|pack-theme'] === 1);
let gone = null;
try { await serverCall('buy', { section: 'live', id: 'live|pack-theme' }, U); } catch (e) { gone = e.code; }
check('and runs out for everyone', gone === 'SOLD_OUT', String(gone));
db.users.get(U).wallet.coins = 0;
let broke = null;
live({ packs: [{ ...PACK, id: 'pack-dear', limited_stock: 5, price: 999999 }] });
try { await serverCall('buy', { section: 'live', id: 'live|pack-dear' }); } catch (e) { broke = e.code; }
check('a sale that cannot be paid gives the stock back', broke === 'INSUFFICIENT_FUNDS' && (db.stock.get('live|pack-dear') ?? 0) === 0, `${broke} ${db.stock.get('live|pack-dear')}`);
await db.store(U).apply({ coins: 500000 });
live({ packs: [PACK] });

live({ events: [{ id: 'ev-limited', name: 'Rare drop', kind: 'limited_booster', params: { spec: { kind: 'open', rarityId: 'epic', cards: 2 }, price: 120, perPlayer: 1, title: { en: 'Epic pair', fr: 'Paire épique' } }, starts_at: iso(NOW - DAY), ends_at: iso(NOW + DAY) }] });
check('a limited booster event is on the shelf', liveShelf(NOW).some((it) => it.id === 'live|event:ev-limited' && it.price === 120));
await same('buying the event booster', 'buy', { section: 'live', id: 'live|event:ev-limited' });

live({ events: [{ id: 'ev-gift', name: 'Gift', kind: 'free_packs', params: { spec: { kind: 'theme', themeId: 'space', cards: 3 }, count: 2, timed: 3 }, starts_at: iso(NOW - DAY), ends_at: iso(NOW + DAY) }] });
const gift = await same('claiming an event gift', 'eventGift', { id: 'ev-gift' });
check('the gift lands', gift.inventory['theme|space|std|3']?.count >= 2 && gift.state.eventsClaimed?.['ev-gift'] === 1);
let twice = null;
try { await serverCall('eventGift', { id: 'ev-gift' }); } catch (e) { twice = e.code; }
check('once per player', twice === 'ALREADY_CLAIMED', String(twice));
let late = null;
live({ events: [{ id: 'ev-late', name: 'Late', kind: 'free_packs', params: { spec: { kind: 'open', cards: 3 } }, starts_at: iso(NOW - 3 * DAY), ends_at: iso(NOW - DAY) }] });
try { await serverCall('eventGift', { id: 'ev-late' }); } catch (e) { late = e.code; }
check('only while the event is on', late === 'NOT_ACTIVE', String(late));
live({ events: [] });

db.codes.set('ONECARD', { code: 'ONECARD', items: [{ kind: 'booster', spec: { kind: 'open', rarityId: 'rare', cards: 1 }, count: 1 }, { kind: 'coins', amount: 250 }, { kind: 'xp', amount: 50 }], max_uses: 2, per_user: 1 });
db.codes.set('OLD', { code: 'OLD', items: [{ kind: 'coins', amount: 5 }], expires_at: iso(Date.now() - DAY) });
await serverOnly('a code from the book', 'redeem', { code: 'one-card' });
const coinsBefore = (await view()).wallet.coins;
const progressBefore = JSON.stringify((await view()).state.progress);
const redeemed = await serverCall('redeem', { code: 'one-card' });
check('a book code pays its coins', redeemed.wallet.coins === coinsBefore + 250);
check('and hands over a one card booster', redeemed.inventory['open|any|rare|1']?.count === 1 && redeemed.dbCode?.code === 'ONECARD');
check('and its xp', JSON.stringify(redeemed.state.progress) !== progressBefore, `${progressBefore} ${JSON.stringify(redeemed.state.progress)}`);
const one = await serverCall('prepare', { specId: 'open|any|rare|1' });
check('the one card booster draws one card', one.cards.length === 1 && drawn.at(-1).cards === 1);
const oneOpen = await serverCall('open', { nonce: one.nonce });
check('and opens with one card', oneOpen.pulls.length === 1);
const fail = async (args, user = U) => { try { await serverCall('redeem', args, user); return null; } catch (e) { return e.code; } };
check('a second use by the same player is refused', (await fail({ code: 'ONECARD' })) === 'ALREADY_CLAIMED');
await serverCall('import', {}, 'user-two');
await serverCall('redeem', { code: 'ONECARD' }, 'user-two');
await serverCall('import', {}, 'user-three');
check('max uses hold across players', (await fail({ code: 'ONECARD' }, 'user-three')) === 'CODE_USED_UP');
check('an expired code says so', (await fail({ code: 'OLD' })) === 'CODE_EXPIRED');
check('an unknown code says so', (await fail({ code: 'NOTACODE' })) === 'UNKNOWN_CODE');
const { LEGACY_CODES, PLAIN, seedLegacyCodes } = await import('../lib/codefixtures.mjs');
seedLegacyCodes(db);
const legacy = await serverCall('redeem', { code: 'pl41n t3st' });
check('a special code from the table still works', legacy.codeId === PLAIN.id && legacy.code?.message?.en === PLAIN.message.en && legacy.inventory[`code|${PLAIN.id}|std|6`]?.count === 1);
check('and keeps its definition in the player state', legacy.state.codesRedeemed?.[PLAIN.id] === 1 && legacy.state.codeDefs?.[PLAIN.id]?.theme === 'rire');
check('a special code is taken once', (await fail({ code: 'PL41NT3ST' })) === 'ALREADY_CLAIMED' && db.codeUses.filter((u) => u.code === 'PL41NT3ST').length === 1);
check('the table holds the codes, the game does not', Object.keys(LEGACY_CODES).every((code) => !readFileSync('src/econ/engine.js', 'utf8').includes(code)));

const { checkItems, checkItem, checkSpec } = await import('../../src/econ/items.js');
const SHAPES = [
  { kind: 'booster', spec: { kind: 'theme', themeId: 'cars', cards: 1 }, count: 2 },
  { kind: 'booster', spec: { kind: 'open', rarityId: 'epic', cards: 12 } },
  { kind: 'booster', spec: { kind: 'custom', cards: 5, wiki: { apiUrl: 'https://starwars.fandom.com/api.php', sitename: 'SW' }, customName: 'Star Wars' }, count: 1 },
  { kind: 'booster', spec: { kind: 'theme', themeId: 'pack-polish', rarityId: 'rare', cards: 3 } },
  { kind: 'booster', spec: { kind: 'today', day: '2026-10-02', cards: 5 } },
  { kind: 'card', card: { article: { key: 'en:Otter', title: 'Otter' }, rarityId: 'rare', count: 2 } },
  { kind: 'card', article: { key: 'en:Stoat', title: 'Stoat' }, rarityId: 'rare', count: 2 },
  { kind: 'owned', bucket: 'frames', id: 'metal' },
  { kind: 'owned', bucket: 'themes', ids: ['aurora', 'noir', 'aurora'] },
  { kind: 'coins', amount: 250 },
  { kind: 'ink', amount: 7 },
  { kind: 'xp', amount: 90 },
  { kind: 'level', value: 7 },
  { kind: 'boostersOpened', value: 12 }
];
const why = (fn) => { try { fn(); return null; } catch (e) { return e.code; } };
check('every item shape passes the shared check', checkItems(SHAPES, 'code').length === SHAPES.length && checkItems(SHAPES, 'grant').length === SHAPES.length);
check('a nested card and a flat card come out the same', JSON.stringify(checkItem({ kind: 'card', card: { article: { key: 'en:Otter', title: 'Otter' }, rarityId: 'rare', count: 2 } }, 'grant'))
  === JSON.stringify(checkItem({ kind: 'card', article: { key: 'en:Otter', title: 'Otter' }, rarityId: 'rare', count: 2 }, 'code')));
check('a spec is filled in as the database fills it', JSON.stringify(checkSpec(SHAPES[0].spec)) === JSON.stringify({ kind: 'theme', themeId: 'cars', rarityId: null, cards: 1 }));
check('a custom booster keeps its wiki and name', JSON.stringify(checkSpec(SHAPES[2].spec)) === JSON.stringify({ kind: 'custom', themeId: null, rarityId: null, cards: 5,
  wiki: { apiUrl: 'https://starwars.fandom.com/api.php', sitename: 'SW' }, customName: 'Star Wars' }));
check('several cosmetics are kept once each', JSON.stringify(checkItem(SHAPES[8], 'code')) === JSON.stringify({ kind: 'owned', bucket: 'themes', ids: ['aurora', 'noir'] }));
const refusals = [
  [[{ kind: 'card', card: { article: { title: 'No key' } } }], 'grant', 'BAD_CARD'],
  [[{ kind: 'card', article: { title: 'No key' } }], 'code', 'BAD_CARD'],
  [[{ kind: 'booster', spec: { kind: 'custom', cards: 3 } }], 'grant', 'BAD_SPEC'],
  [[{ kind: 'booster', spec: { kind: 'custom', cards: 3, wiki: { apiUrl: 'ftp://x' } } }], 'code', 'BAD_SPEC'],
  [[{ kind: 'booster', spec: { kind: 'open', cards: '3' } }], 'code', 'BAD_SPEC'],
  [[{ kind: 'booster', spec: { kind: 'open', cards: 13 } }], 'code', 'BAD_SPEC'],
  [[{ kind: 'booster', spec: { kind: 'timed', cards: 3 } }], 'grant', 'BAD_SPEC'],
  [[{ kind: 'coins', amount: -5 }], 'code', 'BAD_AMOUNT'],
  [[{ kind: 'takeCard', key: 'en:Otter' }], 'code', 'BAD_KIND'],
  [[{ kind: 'revokeOwned', bucket: 'frames', id: 'metal' }], 'code', 'BAD_KIND'],
  [[{ kind: 'level', value: 501 }], 'grant', 'BAD_LEVEL'],
  [[{ kind: 'level', value: 0 }], 'code', 'BAD_LEVEL'],
  [[{ kind: 'owned', bucket: 'frames', ids: [] }], 'grant', 'BAD_OWNED'],
  [[{ kind: 'booster', spec: { kind: 'open', cards: 2 }, count: 101 }], 'code', 'BAD_COUNT'],
  [[{ kind: 'card', article: { key: 'en:Otter' }, rarityId: 'golden' }], 'grant', 'BAD_CARD'],
  [[{ kind: 'diamonds', amount: 5 }], 'code', 'BAD_KIND'],
  [[], 'code', 'BAD_ITEMS']
];
const wrong = refusals.filter(([items, ctx, code]) => why(() => checkItems(items, ctx)) !== code);
check('the shared check refuses what the database refuses, with the same codes', !wrong.length, wrong.map(([items, ctx]) => `${ctx} ${JSON.stringify(items)}`).join(' / '));
check('a grant may still take things away', checkItems([{ kind: 'coins', amount: -40 }, { kind: 'takeCard', key: 'en:Otter' }, { kind: 'revokeOwned', bucket: 'frames', id: 'metal' }], 'grant').length === 3);
check('an event spec goes through the same rules', cleanSpecOf({ kind: 'custom', cards: 4, customId: 'custom-x' })?.customId === 'custom-x' && cleanSpecOf({ kind: 'open', cards: 13 }) === null);

db.codes.set('ALLSHAPES', { code: 'ALLSHAPES', items: checkItems(SHAPES, 'code'), per_user: 1 });
const shapesBefore = await view();
const shaped = await serverCall('redeem', { code: 'all shapes' });
check('a code pays out every item shape', shaped.wallet.coins === shapesBefore.wallet.coins + 250 && shaped.wallet.ink === shapesBefore.wallet.ink + 7);
check('its boosters land with their sizes', ['theme|cars|std|1', 'open|any|epic|12', 'custom|starwars.fandom.com|std|5', 'theme|pack-polish|rare|3', 'today|2026-10-02|std|5']
  .every((id) => (shaped.inventory[id]?.count ?? 0) >= (shapesBefore.inventory[id]?.count ?? 0) + (id === 'theme|cars|std|1' ? 2 : 1)), Object.keys(shaped.inventory).join(','));
check('both card shapes become cards', ['en:Otter', 'en:Stoat'].every((k) => Object.values(shaped.cards ?? {}).some((c) => (c.key ?? c.article?.key) === k)), Object.keys(shaped.cards ?? {}).join(','));
check('cosmetics, level and boosters opened are set', shaped.state.owned.frames.includes('metal') && shaped.state.owned.themes.includes('noir')
  && shaped.state.progress.level === 7 && shaped.state.progress.xp === 0 && shaped.state.boostersOpened === 12);
db.codes.set('BADSHAPE', { code: 'BADSHAPE', items: [{ kind: 'booster', spec: { kind: 'open', cards: 13 } }], per_user: 1 });
check('a code with a broken item is refused with the same code', (await fail({ code: 'BADSHAPE' })) === 'BAD_SPEC');
check('and its use is given back', !db.codeUses.some((u) => u.code === 'BADSHAPE'));

db.overrides.set('en:L_hidden', { article_key: 'en:L_hidden', hidden: true });
const before2 = n;
db.overrides.set(`en:L_${before2 + 1}`, { article_key: `en:L_${before2 + 1}`, title_override: 'Renamed', image_url: 'https://img/new.jpg', rarity_override: 'mythic', price_override: 4321 });
db.overrides.set(`en:L_${before2 + 2}`, { article_key: `en:L_${before2 + 2}`, hidden: true });
await db.store(U).apply({ inventory: [{ spec_id: 'open|any|std|3', spec: { kind: 'open', themeId: null, rarityId: null, cards: 3 }, delta: 1 }] });
const over = await serverCall('prepare', { specId: 'open|any|std|3' });
const renamed = over.cards.find((c) => c.article.key === `en:L_${before2 + 1}`);
check('an override renames a drawn card', renamed?.article.title === 'Renamed' && renamed.article.thumbnail === 'https://img/new.jpg');
check('and sets its rarity and price', renamed?.rarityId === 'mythic' && renamed.price === 4321);
check('a hidden card is never dealt', !over.cards.some((c) => c.article.key === `en:L_${before2 + 2}`) && over.cards.length === 3, over.cards.map((c) => c.article.key).join(','));

const edge = {};
useLiveSource(() => edge.conf);
edge.conf = { tuning: { 'stipend.amount': 42 } };
check('the edge function reads the live state of its request', tune('stipend.amount') === 42);
const prepared = liveNow();
check('and prepares it once', liveNow() === prepared);
edge.conf = null;
setLive({ tuning: { 'stipend.amount': 7 } });
check('without one it falls back to the last state set', tune('stipend.amount') === 7);
setLive(null);
check('and to the defaults', tune('stipend.amount') === 250 && todayPrice(NOW) === TODAY_PRICE);
useLiveSource(null);

const schema = readFileSync('supabase/schema.sql', 'utf8');
const block = schema.slice(schema.indexOf('\n-- live ops'));
const rows = [...block.matchAll(/^\s+\('([a-z]+\.[A-Za-z]+)', '(\w+)', '([^']*)', (-?[\d.]+), (-?[\d.]+),/gm)];
const sql = Object.fromEntries(rows.map((m) => [m[1], { kind: m[2], def: JSON.parse(m[3]), min: Number(m[4]), max: Number(m[5]) }]));
check('the database knows every tuning key the game reads', Object.keys(TUNING).every((k) => sql[k]) && Object.keys(sql).length === Object.keys(TUNING).length,
  `${Object.keys(sql).length} vs ${Object.keys(TUNING).length}`);
check('with the same kind, default and range', Object.entries(TUNING).every(([k, d]) => sql[k] && sql[k].kind === d.kind
  && JSON.stringify(sql[k].def) === JSON.stringify(d.def) && sql[k].min === d.min && sql[k].max === d.max));
check('a booster price is never below five', boosterPrice({ kind: 'open', cards: 1 }) >= 5);

done();
