import { chromium, devices } from 'playwright';
import { launchOptions } from '../lib/browser.mjs';
import { installStubs } from '../lib/stubs.mjs';
import { economyStub, installSupabase, newDatabase } from '../lib/supastub.mjs';
import { createEconDb } from '../lib/econdb.mjs';
import { utcDayIndex } from '../../src/days.js';

const engine = await import('../../supabase/functions/economy/engine.js');
const BASE = process.env.BASE_URL ?? 'http://127.0.0.1:4173/';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 15000, step = 150) => {
  const end = Date.now() + ms;
  for (;;) {
    let ok = false;
    try { ok = await fn(); } catch { ok = false; }
    if (ok || Date.now() > end) return ok;
    await sleep(step);
  }
};

let fails = 0;
const check = (l, c, e = '') => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${e ? '  ' + e : ''}`); };
const section = (s) => console.log(`\n== ${s}`);

const ID = '00000000-0000-4000-8000-0000000000c1';
const SPEC = { kind: 'theme', themeId: 'animals', rarityId: null, cards: 5 };
const SPEC_ID = 'theme|animals|std|5';
const RACE = 'en:Race_card';
const MANY = 'en:Many_copies';
const now = Date.now();
const day = utcDayIndex(now);
const PX = 'data:image/gif;base64,R0lGODlhAQABAAAAACw=';
const card = (key, title, count) => ({
  key, title, rarityId: 'common', price: 40, views: 4000, popularity: 0.3, count, favorite: false,
  packId: 'theme|animals', packName: 'Animals', lang: 'en', thumbnail: PX,
  firstPulledAt: 1, lastPulledAt: 1, description: 'A thing', extract: 'Some words about a thing.'
});
const profile = {
  started: true, createdAt: now - 86400000, playMs: 0, boostersOpened: 4, rarityCounts: {},
  progress: { level: 3, xp: 0 }, pendingLevels: [],
  daily: { v: 2, day: 1, weeks: 0, lastDay: day, shownDay: day },
  timed: { count: 0, stamp: now, last: now, opened: 0 }, freeTaken: { window: 0, ids: [] },
  settings: { skipOpening: true }
};
const saveData = {
  'wikster.wallet.v1': '5000',
  'wikster.ink.v1': '0',
  'wikster.inventory.v1': JSON.stringify({ [SPEC_ID]: { spec: SPEC, count: 1 } }),
  'wikster.collection.v3': JSON.stringify({ entries: { [RACE]: card(RACE, 'Race card', 1), [MANY]: card(MANY, 'Many copies', 6) } }),
  'wikster.profile.v1': JSON.stringify(profile),
  'wikster.language': 'en'
};
const stamps = Object.fromEntries(Object.keys(saveData).map((k) => [k, now - 60000]));
const db = newDatabase();
db.users.set('s@example.test', { id: ID, password: 'hunter2hunter2', meta: { age_13_plus: true } });
db.profiles.set(ID, { id: ID, username: 'settler', created_at: new Date(now - 86400000).toISOString(), level: 3,
  cards: 7, unique_cards: 2, boosters_opened: 4, collection_value: 0, play_ms: 0 });
db.saves.set(ID, { user_id: ID, data: { format: 'wikster-save', version: 2, at: now - 60000, data: saveData, stamps }, updated_at: new Date(now - 60000).toISOString() });

const econDb = createEconDb();
econDb.cutover = now + 86400000;
econDb.born.set(ID, now - 86400000);
econDb.noTotals = true;
let drawn = 0;
const draw = async (pack) => Array.from({ length: pack.cards ?? 5 }, (_, i) => {
  const k = ++drawn;
  const key = i === 0 ? RACE : `en:Drawn_${k}`;
  return {
    key, title: key.slice(3).replace(/_/g, ' '), lang: 'en', description: 'A drawn card', extract: 'A card drawn for this test, with enough words to read.',
    thumbnail: PX, url: `https://en.wikipedia.org/wiki/${key.slice(3)}`, views: 1000 + k, popularity: 0.3
  };
});
const economy = economyStub(engine, econDb, { draw });
const handle = economy.handle.bind(economy);
const holds = { sell: 0, snapshot: 0 };
let gate = null;
economy.handle = async (userId, body, ua) => {
  const out = await handle(userId, body, ua);
  const actions = body.action === 'batch' ? (body.args?.items ?? []).map((i) => i.action) : [body.action];
  if (gate && actions.includes('sell')) await gate.promise;
  const hold = Math.max(...actions.map((a) => holds[a] ?? 0));
  if (hold) await sleep(hold);
  return out;
};
const openGate = () => { let open; const promise = new Promise((r) => { open = r; }); gate = { promise, open }; };
const server = () => econDb.users.get(ID);
const serverCopies = (key) => server()?.cards.get(key)?.copies ?? 0;
const localCopies = (page, key) => page.evaluate((k) => window.__wikster.state.collection.entries[k]?.count ?? 0, key);

const browser = await chromium.launch(launchOptions());
const errors = [];
const ctx = await browser.newContext({ serviceWorkers: 'block', ...devices['Pixel 7'] });
const page = await ctx.newPage();
page.on('pageerror', (e) => errors.push(e.message));
const aborted = [];
page.on('requestfailed', (req) => { if (/functions\/v1\/economy/.test(req.url())) aborted.push(req.failure()?.errorText ?? ''); });
installStubs(page);
await installSupabase(page, { db, economy });
await page.addInitScript(() => { localStorage.setItem('wikster.language', 'en'); });

async function closeSheets() {
  for (let i = 0; i < 8; i++) {
    if (!(await page.locator('#sheet').isVisible().catch(() => false))) break;
    await page.keyboard.press('Escape');
    await page.waitForTimeout(250);
  }
}

await page.goto(BASE, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(2200);
await closeSheets();
if (!(await page.locator('#gate-form input[name="email"]').isVisible().catch(() => false))) {
  await page.evaluate(() => document.querySelector('.appbar .icon-btn')?.click());
  await page.waitForTimeout(400);
  await page.locator('.drawer-link[data-link="account"], .drawer-link[data-link="friends"]').first().click({ timeout: 3000 }).catch(() => 0);
  await page.waitForTimeout(900);
}
if (await page.locator('#gate-seg .seg-option[data-value="in"]').count()) {
  await page.locator('#gate-seg .seg-option[data-value="in"]').click().catch(() => {});
  await page.waitForTimeout(200);
}
await page.locator('#gate-form input[name="email"]').fill('s@example.test');
await page.locator('#gate-form input[name="password"]').fill('hunter2hunter2');
if (await page.locator('#gate-form input[name="age"]').count()) await page.locator('#gate-form input[name="age"]').fill('30');
await page.locator('#gate-form button[type="submit"]').click();
check('signed in on the server economy', await until(() => page.evaluate(() => window.__wikster.serverEconomy())));
await page.waitForTimeout(1200);
await closeSheets();

section('a late reply never takes back a card a newer reply gave');
check('the server and the phone both hold the race card once', await until(async () => serverCopies(RACE) === 1 && (await localCopies(page, RACE)) === 1), `${serverCopies(RACE)} / ${await localCopies(page, RACE)}`);
check('a draw of the booster waits on the phone', await until(() => page.evaluate((id) => window.__wikster.boosters.readyCount(id) > 0, SPEC_ID), 20000));
await page.evaluate(() => window.__wikster.economyIdle());
openGate();
await page.evaluate((key) => { window.__wikster.econ('sell', { key }).catch(() => {}); }, RACE);
check('the sale is predicted at once', await until(async () => (await localCopies(page, RACE)) === 0, 3000));
check('the server sold it and holds the reply', await until(() => serverCopies(RACE) === 0, 8000));
await page.evaluate(() => document.querySelector('.nav-item[data-tab="packs"]')?.click());
await page.waitForTimeout(400);
await page.evaluate((id) => {
  const index = (window.__wikster.state.packSlots ?? []).findIndex((slot) => window.__wikster.specId(slot.spec) === id);
  document.querySelector(`#packs-rail .rail-item[data-index="${index}"]`)?.click();
}, SPEC_ID);
await page.waitForTimeout(300);
await page.evaluate(() => document.querySelector('#packs-open')?.click());
await until(() => page.evaluate(() => document.querySelector('#screen-open')?.classList.contains('phase-idle')), 4000);
await page.evaluate(() => document.querySelector('#screen-open .rip-zone')?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })));
check('the server opened the booster with the race card in it', await until(() => serverCopies(RACE) === 1 && !server().inventory.get(SPEC_ID), 15000), `copies ${serverCopies(RACE)}`);
check('the opening is confirmed while the sale reply still waits', await until(() => page.evaluate(() => window.__wikster.boosters.pending() === 0), 15000));
gate.open();
gate = null;
await until(() => page.evaluate(() => !window.__wikster.economyBusy()), 15000);
await page.evaluate(() => window.__wikster.economyIdle());
await page.waitForTimeout(600);
check('the late sale reply leaves the newer card in place', (await localCopies(page, RACE)) === serverCopies(RACE), `phone ${await localCopies(page, RACE)}, server ${serverCopies(RACE)}`);
await page.evaluate(() => document.querySelector('.nav-item[data-tab="packs"]')?.click());
await page.waitForTimeout(400);
await closeSheets();

section('the phone checks its card count against the server once the openings settle');
econDb.noTotals = false;
await econDb.store(ID).apply({ add: [{ key: 'en:Ghost_card', title: 'Ghost card', rarityId: 'common', price: 40, lang: 'en', packId: 'theme|animals', data: { thumbnail: PX } }] });
const fromHeal = economy.bodies.length;
await page.evaluate((key) => window.__wikster.econ('favorite', { key, on: true }).catch(() => {}), MANY);
check('a card the phone missed comes back with one quiet snapshot', await until(async () => (await localCopies(page, 'en:Ghost_card')) === 1, 10000));
const snaps = economy.bodies.slice(fromHeal).filter((b) => b.action === 'snapshot');
check('in exactly one snapshot', snaps.length === 1, JSON.stringify(economy.bodies.slice(fromHeal).map((b) => b.action)));
const totals = await page.evaluate(() => window.__wikster.localTotals());
const want = econDb.totals(ID);
check('and the totals agree after it', totals.cards === want.cards && totals.unique === want.unique, `${JSON.stringify(totals)} vs ${JSON.stringify(want)}`);

section('a request past the timeout is aborted and settled by one quiet snapshot');
await page.evaluate(() => {
  window.__toasts = [];
  const node = document.querySelector('#toast');
  new MutationObserver(() => {
    if (node.classList.contains('is-error') && node.classList.contains('is-showing')) window.__toasts.push(node.querySelector('.toast-text')?.textContent ?? '');
  }).observe(node, { attributes: true, attributeFilter: ['class'] });
});
holds.sell = 11500;
holds.snapshot = 5000;
const fromSlow = economy.bodies.length;
const abortedBefore = aborted.length;
const coinsBefore = server().wallet.coins;
await page.evaluate(async (key) => {
  window.__idle = false;
  window.__wikster.econ('sell', { key }).catch(() => {});
  for (let i = 0; i < 100 && !window.__wikster.economyBusy(); i++) await new Promise((r) => setTimeout(r, 20));
  window.__wikster.economyIdle().then(() => { window.__idle = true; });
}, MANY);
check('the first slow sale settles and the idle promise taken during it resolves', await until(() => page.evaluate(() => window.__idle && !window.__wikster.economySettling() && !window.__wikster.economyBusy()), 30000));
await page.evaluate(async (key) => {
  window.__idle = false;
  window.__wikster.econ('sell', { key }).catch(() => {});
  for (let i = 0; i < 100 && !window.__wikster.economyBusy(); i++) await new Promise((r) => setTimeout(r, 20));
  window.__wikster.economyIdle().then(() => { window.__idle = true; });
}, MANY);
check('so does the second', await until(() => page.evaluate(() => window.__idle && !window.__wikster.economySettling() && !window.__wikster.economyBusy()), 30000));
const slowCalls = economy.bodies.slice(fromSlow).map((b) => b.action);
check('each sale was sent once, never resent', slowCalls.filter((a) => a === 'sell').length === 2, JSON.stringify(slowCalls));
check('each timeout was settled by one snapshot', slowCalls.filter((a) => a === 'snapshot').length === 2, JSON.stringify(slowCalls));
check('the timed out requests were aborted', aborted.length - abortedBefore >= 2, JSON.stringify(aborted.slice(abortedBefore)));
const slowToasts = await page.evaluate(() => window.__toasts);
check('the player is told once for the whole outage', slowToasts.length === 1, JSON.stringify(slowToasts));
check('the phone matches the server after it', (await localCopies(page, MANY)) === serverCopies(MANY) && serverCopies(MANY) === 4, `phone ${await localCopies(page, MANY)}, server ${serverCopies(MANY)}`);
check('the coins match too', await page.evaluate(() => window.__wikster.state.wallet) === server().wallet.coins && server().wallet.coins > coinsBefore);
holds.sell = 0;
holds.snapshot = 0;

section('page errors');
check('no page errors', errors.length === 0, errors.slice(0, 3).join(' | '));

await browser.close();
console.log(fails ? `\n${fails} FAILED` : '\nALL PASS');
process.exit(fails ? 1 : 0);
