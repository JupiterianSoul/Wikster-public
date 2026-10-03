import { chromium, devices } from 'playwright';
import { launchOptions } from '../lib/browser.mjs';
import { installStubs } from '../lib/stubs.mjs';
import { economyStub, installSupabase, newDatabase } from '../lib/supastub.mjs';
import { createEconDb } from '../lib/econdb.mjs';
import { utcDayIndex } from '../../src/days.js';

const engine = await import('../../supabase/functions/economy/engine.js');

let fails = 0;
const check = (l, c, e = '') => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${e ? '  ' + e : ''}`); };
const section = (s) => console.log(`\n== ${s}`);
const browser = await chromium.launch(launchOptions());
const errors = [];
const until = async (fn, ms = 15000) => {
  const end = Date.now() + ms;
  for (;;) {
    let ok = false;
    try { ok = await fn(); } catch { ok = false; }
    if (ok || Date.now() > end) return ok;
    await new Promise((r) => setTimeout(r, 250));
  }
};

const ID = '00000000-0000-4000-8000-000000000001';
const RANKS = ['common', 'uncommon', 'rare', 'epic', 'legendary', 'mythic', 'exotic', 'prismatic'];
const now = Date.now();
const iso = (ms) => new Date(ms).toISOString();
const HOUR = 3600000;
const day = utcDayIndex(now);
const profile = {
  started: true, createdAt: now - 86400000, playMs: 0, boostersOpened: 4, rarityCounts: {},
  progress: { level: 3, xp: 0 }, pendingLevels: [],
  daily: { v: 2, day: 1, weeks: 0, lastDay: day, shownDay: day },
  timed: { count: 0, stamp: now }, freeTaken: { window: 0, ids: [] }
};
const saveData = {
  'wikster.wallet.v1': '60000',
  'wikster.ink.v1': '12',
  'wikster.inventory.v1': '{}',
  'wikster.collection.v3': JSON.stringify({ entries: {} }),
  'wikster.profile.v1': JSON.stringify(profile),
  'wikster.language': 'en'
};
const stamps = Object.fromEntries(Object.keys(saveData).map((k) => [k, now - 60000]));

const db = newDatabase();
db.users.set('p@example.test', { id: ID, password: 'hunter2hunter2', meta: { age_13_plus: true } });
db.profiles.set(ID, { id: ID, username: 'player', created_at: new Date(now - 86400000).toISOString(), level: 3,
  cards: 0, unique_cards: 0, boosters_opened: 4, collection_value: 0, play_ms: 0 });
db.saves.set(ID, { user_id: ID, data: { format: 'wikster-save', version: 2, at: now - 60000, data: saveData, stamps }, updated_at: new Date(now - 60000).toISOString() });

const econDb = createEconDb();
econDb.cutover = now + 86400000;
econDb.born.set(ID, now - 86400000);
let k = 0;
const draw = async (pack) => Array.from({ length: pack.cards ?? 5 }, (_, i) => {
  const at = Array.isArray(pack.odds) ? pack.odds.indexOf(Math.max(...pack.odds)) : 0;
  k++;
  return {
    key: `en:Live_card_${k}`, title: `Live card ${k}`, lang: 'en', description: 'A card drawn for the live ops test',
    extract: 'A card the server drew for the live ops test, with enough words to read.',
    thumbnail: `https://upload.wikimedia.org/hero-${(k % 5) + 1}.jpg`, url: `https://en.wikipedia.org/wiki/Live_card_${k}`,
    views: 1000 * (i + 1), popularity: 0.3, rarityId: RANKS[at]
  };
});
const economy = economyStub(engine, econDb, { draw });
const setLive = (patch, event) => {
  econDb.live = { ...econDb.live, ...patch };
  db.liveSend('world', event, { type: 'UPDATE' });
};

const ctx = await browser.newContext({ serviceWorkers: 'block', ...devices['Pixel 7'] });
const page = await ctx.newPage();
page.on('pageerror', (e) => errors.push(`PAGE: ${e.message}`));
installStubs(page);
await installSupabase(page, { db, economy });
await page.addInitScript(() => { localStorage.setItem('wikster.language', 'en'); });
await page.goto(process.env.BASE_URL ?? 'http://127.0.0.1:4173/', { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(2200);

const closeSheets = async () => {
  for (let i = 0; i < 8; i++) {
    if (!(await page.locator('#sheet').isVisible().catch(() => false))) break;
    await page.keyboard.press('Escape');
    await page.waitForTimeout(250);
  }
};
await closeSheets();

section('signing in');
check('the live state is read at startup, before signing in', (db.liveCalls ?? 0) >= 1, String(db.liveCalls));
await page.evaluate(() => document.querySelector('.appbar .icon-btn')?.click());
await page.waitForTimeout(400);
await page.locator('.drawer-link[data-link="account"], .drawer-link[data-link="friends"]').first().click().catch(() => 0);
await page.waitForTimeout(900);
if (await page.locator('#gate-seg .seg-option[data-value="in"]').count()) {
  await page.locator('#gate-seg .seg-option[data-value="in"]').click();
  await page.waitForTimeout(200);
}
await page.locator('#gate-form input[name="email"]').fill('p@example.test');
await page.locator('#gate-form input[name="password"]').fill('hunter2hunter2');
if (await page.locator('#gate-form input[name="age"]').count()) await page.locator('#gate-form input[name="age"]').fill('30');
await page.locator('#gate-form button[type="submit"]').click();
check('the game switches to the server', await until(() => page.evaluate(() => window.__wikster.serverEconomy())));
check('it listens on the world topic', await until(() => [...db.realtime.sockets].some((s) => s.joins.has('realtime:world'))));
await page.waitForTimeout(1500);
await closeSheets();
const server = () => econDb.users.get(ID);
const give = (spec) => econDb.store(ID).apply({ inventory: [{ spec_id: `open|any|std|${spec.cards}`, spec, delta: 1 }] });
const prepare = (specId) => page.evaluate((id) => window.__wikster.econ('prepare', { specId: id }), specId);
const clientTop = () => page.evaluate(() => window.__wikster.drawPack({ kind: 'open', themeId: null, rarityId: null, cards: 3 }).odds[7]);

section('a drop rate event changes pulls on both sides');
await give({ kind: 'open', themeId: null, rarityId: null, cards: 4 });
const plain = await prepare('open|any|std|4');
check('without an event the server deals commons, and the last card is the hit', plain?.cards?.length === 4 && plain.cards.slice(0, 3).every((c) => c.rarityId === 'common')
  && plain.cards[3].rarityId !== 'common', plain?.cards?.map((c) => c.rarityId).join(','));
const plainTop = await clientTop();
check('and the phone shows the usual odds', plainTop < 1, String(plainTop));
setLive({ events: [{ id: 'ev-drop', name: 'Prism rain', kind: 'drop_rate', params: { mult: { common: 0, uncommon: 0, rare: 0, epic: 0, legendary: 0, mythic: 0, exotic: 0, prismatic: 2 }, title: { en: 'Prism rain', fr: 'Pluie de prismes' } }, starts_at: iso(now - HOUR), ends_at: iso(now + 6 * HOUR) }] }, 'events');
check('the phone picks up the event without a reload', await until(async () => (await clientTop()) > 50), String(await clientTop()));
await give({ kind: 'open', themeId: null, rarityId: null, cards: 2 });
const lucky = await prepare('open|any|std|2');
check('and the server deals from the boosted odds', lucky?.cards?.length === 2 && lucky.cards.every((c) => c.rarityId === 'prismatic'), lucky?.cards?.map((c) => c.rarityId).join(','));
setLive({ events: [] }, 'events');
check('when the event goes, the odds come back', await until(async () => (await clientTop()) < 1));

section('a tuning change applies live');
await page.evaluate(() => { window.__stayed = true; document.querySelector('.nav-item[data-tab="shop"]')?.click(); });
await page.waitForTimeout(900);
const tiles = page.locator('.shop-tile:not(.is-bundle):not(.is-sized):not(.is-live):not(.is-event-gift)').filter({ has: page.locator('.buy:not(.is-free)') });
const id = await tiles.nth(0).getAttribute('data-spec');
const other = await tiles.nth(1).getAttribute('data-spec');
const priceOf = async (spec = id) => Number(((await page.locator(`.shop-tile[data-spec="${spec}"] .buy-price`).first().textContent()) ?? '').replace(/[^0-9]/g, ''));
const before = await priceOf();
const otherBefore = await priceOf(other);
check('a shop tile has a price', before > 0, `${id} ${before}`);
setLive({ tuning: { 'shop.priceMult': 2 } }, 'tuning');
const doubled = Math.max(5, Math.round((before * 2) / 5) * 5);
check('the shop repaints with the tuned price', await until(async () => (await priceOf()) === doubled), `${await priceOf()} vs ${doubled}`);
check('without a reload', await page.evaluate(() => window.__stayed === true));
const coinsBefore = server().wallet.coins;
const walletBefore = await page.evaluate(() => window.__wikster.state.wallet);
await page.locator(`.shop-tile[data-spec="${id}"] .buy`).first().evaluate((node) => node.click());
check('the phone charges the tuned price at once', await until(() => page.evaluate((w) => window.__wikster.state.wallet === w, walletBefore - doubled), 4000));
check('and the server charges the same', await until(() => coinsBefore - server().wallet.coins === doubled, 8000), String(coinsBefore - server().wallet.coins));
setLive({ tuning: {} }, 'tuning');
check('a reset brings the price back', await until(async () => (await priceOf(other)) === otherBefore), `${await priceOf(other)} vs ${otherBefore}`);

section('a limited admin pack shows only in its window');
const PACK = {
  id: 'pack-ocean', name: { en: 'Ocean Deep', fr: 'Océan profond' }, tagline: { en: 'Waves', fr: 'Vagues' }, icon: 'globe',
  accent: '#0ea5e9', accent2: '#082f49', source: { type: 'search', value: 'ocean' }, default_cards: 4, price: 450, visible: true,
  available_from: iso(now + 2 * HOUR), available_until: iso(now + 6 * HOUR), limited_stock: 3, per_player: null
};
const packTile = () => page.locator('.shop-tile[data-spec="live|pack-ocean"]');
setLive({ packs: [PACK] }, 'packs');
await page.waitForTimeout(3800);
check('not before it opens', (await packTile().count()) === 0);
setLive({ packs: [{ ...PACK, available_from: iso(now - HOUR) }] }, 'packs');
check('on the shelf while it is open', await until(async () => (await packTile().count()) === 1));
check('under its own name', /Ocean Deep/.test((await packTile().textContent()) ?? ''));
check('with its stock', /3 left|only one/i.test((await packTile().textContent()) ?? ''), (await packTile().textContent()) ?? '');
await packTile().locator('.buy').evaluate((node) => node.click());
check('it can be bought', await until(() => server().inventory.get('theme|pack-ocean|std|4')?.count === 1, 8000));
check('from the stock everyone shares', econDb.stock.get('live|pack-ocean') === 1);
setLive({ packs: [{ ...PACK, available_from: iso(now - 3 * HOUR), available_until: iso(now - 60000) }] }, 'packs');
check('and gone once it closes', await until(async () => (await packTile().count()) === 0));
check('the booster still has its name in the packs', await page.evaluate(() => {
  const slot = window.__wikster.state.inventory['theme|pack-ocean|std|4'];
  return Boolean(slot) && window.__wikster.THEME_PACKS.every((p) => p.id !== 'pack-ocean');
}));

section('an event gift is claimed once');
setLive({ events: [{ id: 'ev-gift', name: 'Gift', kind: 'free_packs', params: { spec: { kind: 'theme', themeId: 'space', cards: 3 }, count: 2 }, starts_at: iso(now - HOUR), ends_at: iso(now + HOUR) }] }, 'events');
const giftTile = page.locator('.shop-tile.is-event-gift[data-event="ev-gift"]');
check('the gift shows in the shop', await until(async () => (await giftTile.count()) === 1));
await giftTile.locator('.buy').evaluate((node) => node.click());
check('claiming it adds the boosters', await until(() => server().inventory.get('theme|space|std|3')?.count === 2, 8000));
check('and the button says so', await until(async () => (await giftTile.locator('.buy').isDisabled())));
setLive({ events: [] }, 'events');

section('a code from the book');
econDb.codes.set('LIVECODE', { code: 'LIVECODE', items: [{ kind: 'booster', spec: { kind: 'open', rarityId: 'rare', cards: 1 }, count: 1 }, { kind: 'coins', amount: 250 }], max_uses: 5, per_user: 1 });
econDb.codes.set('OLDLIVE', { code: 'OLDLIVE', items: [{ kind: 'coins', amount: 5 }], expires_at: iso(now - HOUR) });
econDb.codes.set('ONEUSE', { code: 'ONEUSE', items: [{ kind: 'coins', amount: 5 }], max_uses: 1 });
econDb.codeUses.push({ id: 999, code: 'ONEUSE', user: 'someone-else', at: now });
for (let i = 0; i < 5; i++) {
  if (await page.locator('#drawer.is-open').count()) break;
  await page.evaluate(() => (document.querySelector('#menu-btn') ?? document.querySelector('.appbar .icon-btn'))?.click());
  await page.waitForTimeout(420);
}
await page.locator('.drawer-link[data-link="settings"]').click();
await page.waitForTimeout(900);
const redeem = async (code) => {
  await page.locator('#redeem-list [data-code]').scrollIntoViewIfNeeded();
  await page.locator('#redeem-list [data-code]').fill(code);
  await page.locator('#redeem-list button[type="submit"]').click();
  await until(async () => ((await page.locator('#redeem-list [data-status]').textContent()) ?? '').length > 0, 6000);
  await page.waitForTimeout(400);
  return (await page.locator('#redeem-list [data-status]').textContent()) ?? '';
};
const coinsAt = server().wallet.coins;
const said = await redeem('live-code');
check('a book code redeems', /redeemed/i.test(said), said);
check('with its coins', server().wallet.coins === coinsAt + 250, String(server().wallet.coins - coinsAt));
check('and its one card booster', server().inventory.get('open|any|rare|1')?.count === 1);
check('which the phone shows too', await until(() => page.evaluate(() => window.__wikster.state.inventory['open|any|rare|1']?.count === 1)));
check('a second try is refused', /already been redeemed/i.test(await redeem('LIVECODE')));
check('an expired code says so', /expired/i.test(await redeem('OLDLIVE')));
check('a used up code says so', /used up/i.test(await redeem('ONEUSE')));
check('an unknown code says so', /does not open anything/i.test(await redeem('NOPENOPE')));
check('the code was used once', econDb.codeUses.filter((u) => u.code === 'LIVECODE').length === 1);

section('a one card code booster opens with one card');
const one = await prepare('open|any|rare|1');
check('the server draws one card', one?.cards?.length === 1, String(one?.cards?.length));
const opened = await page.evaluate((nonce) => window.__wikster.econ('open', { nonce }), one.nonce);
check('and the opening holds one card', opened?.pulls?.length === 1 && opened.results?.length === 1);
check('the booster is used up', await until(() => !server().inventory.get('open|any|rare|1')));

section('the PC layout reads the live state too');
setLive({ packs: [{ ...PACK, id: 'pack-pc', name: { en: 'Desk Pack', fr: 'Paquet bureau' }, available_from: iso(now - HOUR), available_until: iso(now + HOUR) }] }, 'packs');
const pc = await browser.newContext({ serviceWorkers: 'block', viewport: { width: 1920, height: 1080 } });
const pcPage = await pc.newPage();
pcPage.on('pageerror', (e) => errors.push(`PC PAGE: ${e.message}`));
installStubs(pcPage);
await installSupabase(pcPage, { db, economy });
await pcPage.addInitScript(() => { localStorage.setItem('wikster.language', 'en'); localStorage.setItem('wikster.layout.v1', 'pc'); });
await pcPage.goto(process.env.BASE_URL ?? 'http://127.0.0.1:4173/', { waitUntil: 'domcontentloaded' });
await pcPage.waitForTimeout(2500);
check('the PC layout reads the same live state', await until(() => pcPage.evaluate(() => window.__wikster.drawPack({ kind: 'theme', themeId: 'pack-pc', rarityId: null, cards: 4 }).name === 'Desk Pack')));
await pc.close();

check('no page errors', errors.length === 0, errors.join(' | '));
await browser.close();
console.log(fails ? `\n${fails} FAILURES` : '\nALL PASS');
process.exit(fails ? 1 : 0);
