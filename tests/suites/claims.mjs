import { chromium, devices } from 'playwright';
import { launchOptions } from '../lib/browser.mjs';
import { installStubs } from '../lib/stubs.mjs';
import { dealQuests, economyStub, installSupabase, newDatabase } from '../lib/supastub.mjs';
import { createEconDb } from '../lib/econdb.mjs';
import { questById } from '../../src/data/quests.js';
import { seasonAt } from '../../src/season.js';
import { TRACK } from '../../src/data/seasons.js';
import { rewardForLevel } from '../../src/progression.js';
import { utcDay, utcDayIndex } from '../../src/days.js';

const engine = await import('../../supabase/functions/economy/engine.js');

let fails = 0;
const check = (l, c, e = '') => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${e ? '  ' + e : ''}`); };
const section = (s) => console.log(`\n== ${s}`);
const BASE = process.env.BASE_URL ?? 'http://127.0.0.1:4173/';
const browser = await chromium.launch(launchOptions());
const errors = [];
const until = async (fn, ms = 15000) => {
  const end = Date.now() + ms;
  for (;;) {
    let ok = false;
    try { ok = await fn(); } catch { ok = false; }
    if (ok || Date.now() > end) return ok;
    await new Promise((r) => setTimeout(r, 200));
  }
};

const ID = '00000000-0000-4000-8000-000000000001';
const now = Date.now();
const today = utcDay(now);
const dayN = utcDayIndex(now);
const profile = {
  started: true, createdAt: now - 86400000, playMs: 0, boostersOpened: 0, rarityCounts: {},
  progress: { level: 3, xp: 0 }, pendingLevels: [],
  daily: { v: 2, day: 1, weeks: 0, lastDay: dayN, shownDay: dayN },
  timed: { count: 0, stamp: now }, freeTaken: { window: 0, ids: [] }, achievements: { redeemed: [] }
};
const saveData = {
  'wikster.wallet.v1': '1000',
  'wikster.ink.v1': '0',
  'wikster.inventory.v1': '{}',
  'wikster.collection.v3': JSON.stringify({ entries: {} }),
  'wikster.profile.v1': JSON.stringify(profile),
  'wikster.language': 'en'
};
const stamps = Object.fromEntries(Object.keys(saveData).map((k) => [k, now - 60000]));

const db = newDatabase();
db.users.set('c@example.test', { id: ID, password: 'hunter2hunter2', meta: { age_13_plus: true } });
db.profiles.set(ID, { id: ID, username: 'claimer', created_at: new Date(now - 86400000).toISOString(), level: 3, cards: 0, unique_cards: 0, boosters_opened: 0, collection_value: 0, play_ms: 0 });
db.saves.set(ID, { user_id: ID, data: { format: 'wikster-save', version: 2, at: now - 60000, data: saveData, stamps }, updated_at: new Date(now - 60000).toISOString() });

const econDb = createEconDb();
econDb.cutover = now + 86400000;
econDb.born.set(ID, now - 86400000);
const economy = economyStub(engine, econDb);
const questStub = { delay: 0 };
const dealt = dealQuests(ID, today);
for (const q of dealt) econDb.quests.set(`${ID}|${today}|${q.id}`, { progress: q.target, target: q.target, claimed: false });
const server = () => econDb.users.get(ID);
const paidQuests = () => (server()?.ledger ?? []).filter((l) => l.kind === 'quest').length;

async function closeSheets(page) {
  for (let i = 0; i < 8; i++) {
    if (!(await page.locator('#sheet').isVisible().catch(() => false))) break;
    await page.keyboard.press('Escape');
    await page.locator('#sheet').waitFor({ state: 'hidden', timeout: 1500 }).catch(() => {});
    await page.waitForTimeout(250);
  }
}

async function device(name, opts) {
  const ctx = await browser.newContext({ serviceWorkers: 'block', ...opts });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(`${name}: ${e.message}`));
  installStubs(page);
  await installSupabase(page, { db, economy, quests: questStub });
  await page.addInitScript(() => { localStorage.setItem('wikster.language', 'en'); });
  await page.goto(BASE, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2200);
  await closeSheets(page);
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
  await page.locator('#gate-form input[name="email"]').fill('c@example.test');
  await page.locator('#gate-form input[name="password"]').fill('hunter2hunter2');
  if (await page.locator('#gate-form input[name="age"]').count()) await page.locator('#gate-form input[name="age"]').fill('30');
  await page.locator('#gate-form button[type="submit"]').click();
  const live = await until(() => page.evaluate(() => window.__wikster.serverEconomy()));
  check(`${name}: signed in on the server economy`, live);
  await page.waitForTimeout(1200);
  await closeSheets(page);
  return { ctx, page };
}

const viaDrawer = async (page, link) => {
  await closeSheets(page);
  for (let i = 0; i < 5; i++) {
    if (await page.locator('#drawer.is-open').count()) break;
    await page.evaluate(() => document.querySelector('.appbar .icon-btn')?.click());
    await page.waitForTimeout(400);
  }
  await page.locator(`.drawer-link[data-link="${link}"]`).click();
  await page.waitForTimeout(700);
};
const viaPc = async (page, dest, screen) => {
  await closeSheets(page);
  await page.locator(`.pc-tab[data-dest="${dest}"]`).click();
  await page.waitForTimeout(400);
  await page.locator(`.pc-subtab[data-screen="${screen}"]`).click();
  await page.waitForTimeout(700);
};
const shown = (page) => page.evaluate(() => ({
  claimed: document.querySelectorAll('#screen-quests .quest.is-claimed').length,
  ready: document.querySelectorAll('#screen-quests .quest .quest-claim').length,
  all: [...document.querySelectorAll('#screen-quests .claim-all')].filter((b) => b.offsetParent !== null).length
}));
const batches = (from) => economy.bodies.slice(from).filter((b) => b.action === 'batch');

section('a daily quest claimed once stays claimed');
const a = await device('phone', devices['Pixel 7']);
await viaDrawer(a.page, 'quests');
check('the three finished quests wait to be claimed', await until(async () => (await shown(a.page)).ready === 3), JSON.stringify(await shown(a.page)));
check('with a claim all button', (await shown(a.page)).all === 1 && /Claim all \(3\)/.test(await a.page.locator('#screen-quests .claim-all').textContent()));
const first = await a.page.locator('#screen-quests .quest:has(.quest-claim)').first().getAttribute('data-quest');
await a.page.locator(`#screen-quests .quest[data-quest="${first}"] .quest-claim`).click();
check('the server pays the quest', await until(() => paidQuests() === 1), String(paidQuests()));
const paidOnce = server().wallet.coins;
check('for its reward', paidOnce === 1000 + questById(first).reward.money, `${paidOnce}`);
check('and keeps it in the economy state', server().state.questDay?.day === today && server().state.questDay.ids.includes(first), JSON.stringify(server().state.questDay));
check('the claim all now counts two', await until(async () => /\(2\)/.test(await a.page.locator('#screen-quests .claim-all').textContent())));

questStub.delay = 6000;
await a.page.reload({ waitUntil: 'domcontentloaded' });
await until(() => a.page.evaluate(() => window.__wikster.serverEconomy()));
await a.page.waitForTimeout(1500);
const callsAtReload = db.questCalls ?? 0;
await viaDrawer(a.page, 'quests');
const afterReload = await shown(a.page);
check('after a refresh, before the quest server answers, it is still claimed', afterReload.claimed === 1 && afterReload.ready === 2, JSON.stringify(afterReload));
check('and the quest screen did not wait for the server to say so', (db.questCalls ?? 0) <= callsAtReload + 1);
const said = await a.page.evaluate(({ id, target }) => window.__wikster.econ('quest', { id }, { facts: { quest: { progress: target, target, claimed: false } } })
  .then(() => 'PAID', (e) => String(e?.message ?? e)), { id: first, target: questById(first).target });
check('a forced second claim is refused on the phone', said === 'ALREADY_CLAIMED', said);
let replay = null;
try { await economy.handle(ID, { action: 'quest', args: { id: first } }); replay = 'PAID'; } catch (e) { replay = e.code; }
check('a replayed request is refused by the server', replay === 'ALREADY_CLAIMED', String(replay));
await a.page.evaluate(() => { localStorage.removeItem('wikster.quests.v1'); localStorage.removeItem('wikster.questClaims.v1'); });
questStub.delay = 0;
await a.page.reload({ waitUntil: 'domcontentloaded' });
await until(() => a.page.evaluate(() => window.__wikster.serverEconomy()));
await a.page.waitForTimeout(1500);
await viaDrawer(a.page, 'quests');
const wiped = await shown(a.page);
check('even with the quest board wiped from the phone, the server state keeps it claimed', wiped.claimed === 1 && wiped.ready === 2, JSON.stringify(wiped));
check('the wallet never moved past the one payment', server().wallet.coins === paidOnce && paidQuests() === 1, `${server().wallet.coins}`);

section('claim all on a second device, on the PC layout');
const c = await device('pc', { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
check('the PC layout is up', await c.page.evaluate(() => document.documentElement.classList.contains('is-pc') || document.body.classList.contains('is-pc')));
await viaPc(c.page, 'play', 'quests');
check('the PC sees the claimed quest as claimed', await until(async () => { const s = await shown(c.page); return s.claimed === 1 && s.ready === 2; }), JSON.stringify(await shown(c.page)));
const pcBatch = economy.bodies.length;
const coinsBefore = server().wallet.coins;
const rest = dealt.filter((q) => q.id !== first);
await c.page.locator('#screen-quests .claim-all').click();
check('claim all pays both remaining quests', await until(() => paidQuests() === 3), String(paidQuests()));
check('in one request', batches(pcBatch).length === 1 && batches(pcBatch)[0].args.items.length === 2 && batches(pcBatch)[0].args.items.every((i) => i.action === 'quest'),
  JSON.stringify(economy.bodies.slice(pcBatch).map((b) => b.action)));
check('for exactly their rewards', server().wallet.coins === coinsBefore + rest.reduce((s, q) => s + questById(q.id).reward.money, 0), `${coinsBefore} -> ${server().wallet.coins}`);
check('one summary toast', await until(async () => /2 rewards claimed/.test(await c.page.locator('#toast').textContent())), await c.page.locator('#toast').textContent());
check('and the button goes away', await until(async () => { const s = await shown(c.page); return s.all === 0 && s.claimed === 3 && s.ready === 0; }), JSON.stringify(await shown(c.page)));
await c.ctx.close();

section('a third device sees everything claimed');
const b = await device('second phone', devices['Pixel 7']);
await viaDrawer(b.page, 'quests');
check('all three quests show claimed, nothing to claim', await until(async () => { const s = await shown(b.page); return s.claimed === 3 && s.ready === 0 && s.all === 0; }), JSON.stringify(await shown(b.page)));

section('claim all: achievements');
server().state.boostersOpened = 60;
await b.page.evaluate(() => window.__wikster.econ('snapshot', {}));
await viaDrawer(b.page, 'ach');
const ready = await b.page.locator('#ach-list .ach.is-ready').count();
check('several achievements are ready', ready >= 2, String(ready));
check('the claim all button counts them', await b.page.locator('#ach-all .claim-all').isVisible() && new RegExp(`\\(${ready}\\)`).test(await b.page.locator('#ach-all .claim-all').textContent()));
const achFrom = economy.bodies.length;
const achBefore = (server().state.achievements?.redeemed ?? []).length;
await b.page.locator('#ach-all .claim-all').click();
check('the server records every one', await until(() => (server().state.achievements?.redeemed ?? []).length === achBefore + ready), String((server().state.achievements?.redeemed ?? []).length));
check('in as few requests as the batch allows', batches(achFrom).length === Math.ceil(ready / 12), String(batches(achFrom).length));
check('nothing is left to claim', await until(async () => (await b.page.locator('#ach-list .ach.is-ready').count()) === 0 && !(await b.page.locator('#ach-all .claim-all').isVisible().catch(() => false))));
let again = null;
try { await economy.handle(ID, { action: 'achievement', args: { id: server().state.achievements.redeemed[0] } }); again = 'PAID'; } catch (e) { again = e.code; }
check('and a second claim of one is refused', again === 'ALREADY_CLAIMED', String(again));

section('claim all: the season');
const { key } = seasonAt();
server().state.seasons = { ...(server().state.seasons ?? {}), [key]: { points: TRACK[2], claimed: [], quests: {} } };
await b.page.evaluate(() => window.__wikster.econ('snapshot', {}));
await viaDrawer(b.page, 'season');
check('three rungs offer a claim all', await until(async () => /\(3\)/.test(await b.page.locator('#screen-season .season-all .claim-all').textContent())));
const seasonFrom = economy.bodies.length;
await b.page.locator('#screen-season .season-all .claim-all').click();
check('the server claims all three rungs', await until(() => (server().state.seasons[key].claimed ?? []).length === 3), JSON.stringify(server().state.seasons[key]));
check('in one request', batches(seasonFrom).length === 1, JSON.stringify(economy.bodies.slice(seasonFrom).map((x) => x.action)));
check('and the track shows them claimed', await until(async () => (await b.page.locator('#season-track .season-rung.is-claimed').count()) === 3));

section('claim all: level rewards');
server().state.pendingLevels = [4, 5, 6];
server().state.progress = { level: 6, xp: 0 };
await b.page.evaluate(() => window.__wikster.econ('snapshot', {}));
await closeSheets(b.page);
await b.page.evaluate(() => window.__wikster.levelUp(4));
check('the level up sheet offers to claim all three', await until(async () => /\(3\)/.test(await b.page.locator('#sheet .claim-all').textContent())));
const levelCoins = server().wallet.coins;
const levelFrom = economy.bodies.length;
await b.page.locator('#sheet .claim-all').click();
check('the server pays every level once', await until(() => (server().state.pendingLevels ?? []).length === 0), JSON.stringify(server().state.pendingLevels));
check('for their coins', server().wallet.coins === levelCoins + [4, 5, 6].reduce((s, l) => s + (rewardForLevel(l).coins ?? 0), 0), `${levelCoins} -> ${server().wallet.coins}`);
check('in one request', batches(levelFrom).length === 1, JSON.stringify(economy.bodies.slice(levelFrom).map((x) => x.action)));
check('and the sheet closes', await until(async () => !(await b.page.locator('#sheet').isVisible())));

section('page errors');
check('no page errors', errors.length === 0, errors.slice(0, 3).join(' | '));

await browser.close();
console.log(fails ? `\n${fails} FAILED` : '\nALL PASS');
process.exit(fails ? 1 : 0);
