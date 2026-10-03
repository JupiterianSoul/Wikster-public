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
const SPEC = { kind: 'theme', themeId: 'animals', rarityId: null, cards: 5 };
const SPEC_ID = 'theme|animals|std|5';
const now = Date.now();
const day = utcDayIndex(now);
const profile = {
  started: true, createdAt: now - 86400000, playMs: 0, boostersOpened: 4, rarityCounts: {},
  progress: { level: 3, xp: 0 }, pendingLevels: [],
  daily: { v: 2, day: 1, weeks: 0, lastDay: day, shownDay: day },
  timed: { count: 0, stamp: now }, freeTaken: { window: 0, ids: [] }
};
const saveData = {
  'wikster.wallet.v1': '4321',
  'wikster.ink.v1': '12',
  'wikster.inventory.v1': JSON.stringify({ [SPEC_ID]: { spec: SPEC, count: 2 } }),
  'wikster.collection.v3': JSON.stringify({ entries: { 'en:Tardigrade': {
    key: 'en:Tardigrade', title: 'Tardigrade', rarityId: 'rare', price: 300, count: 1, lang: 'en',
    thumbnail: 'https://upload.wikimedia.org/hero-3.jpg', views: 210000, popularity: 0.6
  } } }),
  'wikster.profile.v1': JSON.stringify(profile),
  'wikster.language': 'en'
};
const stamps = Object.fromEntries(Object.keys(saveData).map((k) => [k, now - 60000]));

const db = newDatabase();
db.users.set('p@example.test', { id: ID, password: 'hunter2hunter2', meta: { age_13_plus: true } });
db.profiles.set(ID, { id: ID, username: 'player', created_at: new Date(now - 86400000).toISOString(), level: 3,
  cards: 1, unique_cards: 1, boosters_opened: 4, collection_value: 300, play_ms: 0 });
db.saves.set(ID, { user_id: ID, data: { format: 'wikster-save', version: 2, at: now - 60000, data: saveData, stamps }, updated_at: new Date(now - 60000).toISOString() });

const econDb = createEconDb();
econDb.cutover = now + 86400000;
econDb.born.set(ID, now - 86400000);
const economy = economyStub(engine, econDb);

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

section('signing in hands the economy to the server');
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
const live = await until(() => page.evaluate(() => window.__wikster.serverEconomy()));
check('the game switches to the server', live);
check('it imported the existing save first', economy.calls.includes('import'), economy.calls.join(','));
const server = () => econDb.users.get(ID);
check('the server holds the coins from the save', server()?.wallet.coins === 4321, String(server()?.wallet.coins));
check('and its boosters and cards', server()?.inventory.get(SPEC_ID)?.count === 2 && server()?.cards.has('en:Tardigrade'));
check('the screen shows what the server holds', await page.evaluate(() => window.__wikster.state.wallet) === 4321);
await page.waitForTimeout(1500);
await closeSheets();

section('opening a booster: the server draws the cards');
await page.keyboard.press('Escape');
await page.evaluate(() => document.querySelector('.nav-item[data-tab="packs"]')?.click());
await page.waitForTimeout(800);
await page.evaluate(() => document.querySelector('#packs-open')?.click());
await page.waitForTimeout(900);
const zone = await page.locator('.rip-zone').boundingBox();
if (zone) {
  const y = zone.y + zone.height / 2;
  await page.locator('.rip-zone').dispatchEvent('pointerdown',
    { pointerId: 1, clientX: zone.x + 20, clientY: y, isPrimary: true, pointerType: 'touch', bubbles: true });
  for (let dx = 30; dx <= 240; dx += 26) {
    await page.evaluate(({ x, yy }) => window.dispatchEvent(new PointerEvent('pointermove',
      { pointerId: 1, clientX: x, clientY: yy, isPrimary: true, pointerType: 'touch', bubbles: true })), { x: zone.x + 20 + dx, yy: y });
  }
  await page.evaluate(({ x, yy }) => window.dispatchEvent(new PointerEvent('pointerup',
    { pointerId: 1, clientX: x, clientY: yy, isPrimary: true, pointerType: 'touch', bubbles: true })), { x: zone.x + 260, yy: y });
}
const revealed = await until(() => page.evaluate(() => document.querySelector('#screen-open').classList.contains('phase-reveal')), 20000);
check('the booster opens', revealed);
const pulled = await page.evaluate(() => window.__wikster.state.pulls.map((p) => p.article.title));
check('with the cards the server drew', pulled.length === 5 && pulled.every((t) => t.startsWith('Server card')), pulled.join(', '));
const askedDraws = economy.calls.includes('ready') || economy.calls.includes('prepare')
  || economy.bodies.some((b) => b.ready || b.args?.launch?.ready);
check('it was drawn, then opened, on the server', askedDraws && economy.calls.includes('open'), economy.calls.join(','));
check('the server took the booster', server().inventory.get(SPEC_ID)?.count === 1);
check('and holds the new cards', pulled.every((t) => server().cards.has(`en:${t.replace(/ /g, '_')}`)));
check('the collection on screen matches', await page.evaluate((titles) => titles.every((t) =>
  Boolean(window.__wikster.state.collection.entries[`en:${t.replace(/ /g, '_')}`])), pulled));
check('the server counted the opening', Number(server().state.boostersOpened) === 5, String(server().state.boostersOpened));
await page.evaluate(() => document.querySelector('#open-skip')?.click());
await page.waitForTimeout(600);
await page.evaluate(() => document.querySelector('#open-done')?.click());
await page.waitForTimeout(800);
await closeSheets();

section('the shop charges the server wallet, and the server can say no');
await page.evaluate(() => document.querySelector('.nav-item[data-tab="shop"]')?.click());
await page.waitForTimeout(900);
const tile = page.locator('.shop-feature .buy, .shop-tile:not(.is-bundle):not(.is-sized) .buy:not(.is-free)').first();
const priceText = await tile.textContent();
const coinsBefore = server().wallet.coins;
await tile.evaluate((node) => node.click());
await until(() => server().wallet.coins < coinsBefore, 8000);
const spent = coinsBefore - server().wallet.coins;
check('a purchase takes coins on the server', spent > 0, `${priceText} -> ${spent}`);
check('and the screen follows the server', await page.evaluate(() => window.__wikster.state.wallet) === server().wallet.coins);
await econDb.store(ID).apply({ coins: -server().wallet.coins });
const shelf = await page.evaluate(() => JSON.stringify(window.__wikster.state.inventory));
await page.evaluate(() => {
  window.__toasts = [];
  const node = document.querySelector('#toast') ?? document.querySelector('.toast');
  new MutationObserver(() => window.__toasts.push(node.textContent)).observe(node, { childList: true, subtree: true, characterData: true });
});
const again = page.locator('.shop-tile:not(.is-bundle):not(.is-sized) .buy:not(.is-free):not([disabled])').first();
check('there is still something to buy', (await again.count()) === 1);
await again.evaluate((node) => node.click());
await page.waitForTimeout(1500);
check('with an empty server wallet the purchase is refused', server().wallet.coins === 0);
check('and nothing lands on the shelf', await page.evaluate(() => JSON.stringify(window.__wikster.state.inventory)) === shelf);
const told = await page.evaluate(() => window.__toasts ?? []);
check('the screen is told so', told.some((text) => /not enough/i.test(text)), told.join(' | '));

section('a slow server does not slow the screen');
await econDb.store(ID).apply({ coins: 50000 });
await page.evaluate(() => window.__wikster.store.saveWallet(50000));
const startedAt = economy.calls.length;
await page.reload({ waitUntil: 'networkidle' });
await page.waitForTimeout(1500);
await closeSheets();
const startup = economy.bodies.slice(startedAt);
const importBody = startup.find((b) => b.action === 'import');
check('a second start asks only for what changed since the last one', Number.isFinite(importBody?.args?.since) && importBody.args.sync === true, JSON.stringify(importBody?.args));
check('and needs no separate sync', !startup.some((b) => b.action === 'sync' || b.action === 'snapshot'), startup.map((b) => b.action).join(','));
check('the collection on screen still matches the server', await until(() => page.evaluate((n) => Object.keys(window.__wikster.state.collection.entries).length === n, server().cards.size), 4000));
await page.evaluate(() => document.querySelector('.nav-item[data-tab="shop"]')?.click());
await page.waitForTimeout(900);
economy.delay = 2500;
const slowTile = page.locator('.shop-tile:not(.is-bundle):not(.is-sized) .buy:not(.is-free):not([disabled])').first();
const walletBefore = await page.evaluate(() => window.__wikster.state.wallet);
const serverBefore = server().wallet.coins;
await slowTile.evaluate((node) => node.click());
await page.waitForTimeout(300);
check('a purchase shows on screen at once', await page.evaluate(() => window.__wikster.state.wallet) < walletBefore);
check('with no loading bar, since nothing waits', await page.locator('.econ-busy.is-on').count() === 0);
check('while the server has not answered yet', server().wallet.coins === serverBefore);
check('then the server agrees', await until(() => server().wallet.coins < serverBefore, 8000));
check('and the screen still matches it', await until(async () => (await page.evaluate(() => window.__wikster.state.wallet)) === server().wallet.coins, 4000));

const swapped = await page.evaluate(async () => {
  const at = performance.now();
  const res = await window.__wikster.econ('exchange', { ink: 2 });
  return { took: performance.now() - at, coins: res?.wallet?.coins, ink: res?.wallet?.ink, shown: window.__wikster.state.wallet };
});
check('trading for ink answers at once on a slow server', swapped.took < 300 && swapped.shown === swapped.coins, `${Math.round(swapped.took)} ms`);
check('and the server lands on the same wallet', await until(async () => server().wallet.coins === swapped.coins && server().wallet.ink === swapped.ink, 8000), `${server().wallet.coins} vs ${swapped.coins}`);
const refusedFast = await page.evaluate(async () => {
  const at = performance.now();
  try { await window.__wikster.econ('redeem', { code: 'not-a-real-code' }); return { took: performance.now() - at, code: null }; } catch (e) { return { took: performance.now() - at, code: e.message }; }
});
check('a code the phone does not know is checked against the server book and refused', refusedFast.code === 'UNKNOWN_CODE' && economy.calls.includes('redeem'), `${refusedFast.code} ${Math.round(refusedFast.took)} ms`);
const walletShown = await page.evaluate(() => window.__wikster.state.wallet);
await econDb.store(ID).apply({ coins: -1000 });
await page.evaluate(() => window.__wikster.econ('exchange', { ink: 1 }).catch(() => null));
check('when the server disagrees, the screen is put right', await until(async () => (await page.evaluate(() => window.__wikster.state.wallet)) === server().wallet.coins, 10000),
  `${walletShown} -> ${await page.evaluate(() => window.__wikster.state.wallet)} vs ${server().wallet.coins}`);
economy.delay = 1500;
const batchFrom = economy.calls.length;
const inkBefore = server().wallet.ink;
await page.evaluate(() => { for (let i = 0; i < 3; i++) window.__wikster.econ('exchange', { ink: 1 }).catch(() => null); });
check('taps that wait behind a slow answer reach the server together', await until(() => server().wallet.ink === inkBefore + 3, 10000)
  && economy.calls.slice(batchFrom).filter((c) => c !== 'ready').join(',') === 'exchange,batch', economy.calls.slice(batchFrom).join(','));
check('and the screen lands on the same wallet', await until(async () => (await page.evaluate(() => window.__wikster.state.ink)) === server().wallet.ink, 4000));
economy.delay = 0;
const drawnAhead = await until(() => [...economy.db.pulls.values()].filter((p) => !p.claimedAt).length >= Object.keys(server().inventory ? Object.fromEntries(server().inventory) : {}).length, 8000);
check('every booster held is drawn ahead on the server', drawnAhead);
const callsBefore = economy.calls.length;
await page.evaluate(() => document.querySelector('.nav-item[data-tab="packs"]')?.click());
await page.waitForTimeout(800);
await page.evaluate(() => document.querySelector('#packs-open')?.click());
await until(() => page.evaluate(() => Boolean(window.__wikster.state.prefetch?.settled)), 8000);
check('the open screen needs no server call to be ready', !economy.calls.slice(callsBefore).includes('prepare'), economy.calls.slice(callsBefore).join(','));
economy.delay = 2500;
const zone2 = await page.locator('.rip-zone').boundingBox();
const ripAt = Date.now();
if (zone2) {
  const y = zone2.y + zone2.height / 2;
  await page.locator('.rip-zone').dispatchEvent('pointerdown',
    { pointerId: 1, clientX: zone2.x + 20, clientY: y, isPrimary: true, pointerType: 'touch', bubbles: true });
  for (let dx = 30; dx <= 240; dx += 26) {
    await page.evaluate(({ x, yy }) => window.dispatchEvent(new PointerEvent('pointermove',
      { pointerId: 1, clientX: x, clientY: yy, isPrimary: true, pointerType: 'touch', bubbles: true })), { x: zone2.x + 20 + dx, yy: y });
  }
  await page.evaluate(({ x, yy }) => window.dispatchEvent(new PointerEvent('pointerup',
    { pointerId: 1, clientX: x, clientY: yy, isPrimary: true, pointerType: 'touch', bubbles: true })), { x: zone2.x + 260, yy: y });
}
const quick = await until(() => page.evaluate(() => document.querySelector('#screen-open').classList.contains('phase-reveal')), 2400);
const took = Date.now() - ripAt;
check('a prepared booster reveals its cards without waiting for the server', quick && took < 2400, `${took} ms`);
const openedCards = await page.evaluate(() => window.__wikster.state.pulls.map((p) => p.article.key));
check('and the server then records them', await until(() => openedCards.every((k) => server().cards.has(k)), 8000));
check('and the collection on screen follows', await until(() => page.evaluate((keys) => keys.every((k) => Boolean(window.__wikster.state.collection.entries[k])), openedCards), 4000));
economy.delay = 0;

section('page errors');
check('no page errors', errors.length === 0, errors.slice(0, 3).join(' | '));

await browser.close();
console.log(fails ? `\n${fails} FAILED` : '\nALL PASS');
process.exit(fails ? 1 : 0);
