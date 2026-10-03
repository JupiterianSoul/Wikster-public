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
const BASE = process.env.BASE_URL ?? 'http://127.0.0.1:4173/';
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
const profileAt = (level) => ({
  started: true, createdAt: now - 86400000, playMs: 0, boostersOpened: 40, rarityCounts: {},
  progress: { level, xp: 0 }, pendingLevels: [],
  daily: { v: 2, day: 1, weeks: 0, lastDay: day, shownDay: day },
  timed: { count: 0, stamp: now }, freeTaken: { window: 0, ids: [] }
});
const saveData = {
  'wikster.wallet.v1': '4321',
  'wikster.ink.v1': '12',
  'wikster.inventory.v1': JSON.stringify({ [SPEC_ID]: { spec: SPEC, count: 4 } }),
  'wikster.collection.v3': JSON.stringify({ entries: {} }),
  'wikster.profile.v1': JSON.stringify(profileAt(500)),
  'wikster.language': 'en'
};
const stamps = Object.fromEntries(Object.keys(saveData).map((k) => [k, now - 60000]));

const db = newDatabase();
db.users.set('max@example.test', { id: ID, password: 'hunter2hunter2', meta: { age_13_plus: true } });
db.profiles.set(ID, { id: ID, username: 'maxed', created_at: new Date(now - 86400000).toISOString(), level: 500,
  cards: 0, unique_cards: 0, boosters_opened: 40, collection_value: 0, play_ms: 0 });
db.saves.set(ID, { user_id: ID, data: { format: 'wikster-save', version: 2, at: now - 60000, data: saveData, stamps }, updated_at: new Date(now - 60000).toISOString() });

const econDb = createEconDb();
econDb.cutover = now + 86400000;
econDb.born.set(ID, now - 86400000);
const economy = economyStub(engine, econDb);
const server = () => econDb.users.get(ID);

async function device(name, { pc = false, local = null } = {}) {
  const ctx = await browser.newContext(pc
    ? { serviceWorkers: 'block', viewport: { width: 1600, height: 900 }, deviceScaleFactor: 1 }
    : { serviceWorkers: 'block', ...devices['Pixel 7'] });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(`${name}: ${e.message}`));
  installStubs(page);
  await installSupabase(page, { db, economy });
  await page.addInitScript(({ local, SPEC, SPEC_ID }) => {
    localStorage.setItem('wikster.language', 'en');
    if (local && !localStorage.getItem('wikster.profile.v1')) {
      localStorage.setItem('wikster.profile.v1', JSON.stringify(local));
      localStorage.setItem('wikster.wallet.v1', '3000');
      localStorage.setItem('wikster.inventory.v1', JSON.stringify({ [SPEC_ID]: { spec: SPEC, count: 4 } }));
    }
  }, { local, SPEC, SPEC_ID });
  await page.goto(BASE, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2200);
  await closeSheets(page);
  return { ctx, page };
}

async function closeSheets(page) {
  for (let i = 0; i < 8; i++) {
    if (!(await page.locator('#sheet').isVisible().catch(() => false))) break;
    await page.keyboard.press('Escape');
    await page.waitForTimeout(250);
  }
}

async function signIn(page) {
  await page.evaluate(() => document.querySelector('.appbar .icon-btn')?.click());
  await page.waitForTimeout(400);
  await page.locator('.drawer-link[data-link="account"], .drawer-link[data-link="friends"]').first().click().catch(() => 0);
  await page.waitForTimeout(900);
  if (await page.locator('#gate-seg .seg-option[data-value="in"]').count()) {
    await page.locator('#gate-seg .seg-option[data-value="in"]').click();
    await page.waitForTimeout(200);
  }
  await page.locator('#gate-form input[name="email"]').fill('max@example.test');
  await page.locator('#gate-form input[name="password"]').fill('hunter2hunter2');
  if (await page.locator('#gate-form input[name="age"]').count()) await page.locator('#gate-form input[name="age"]').fill('30');
  await page.locator('#gate-form button[type="submit"]').click();
  return until(() => page.evaluate(() => window.__wikster.serverEconomy()));
}

async function openOne(page) {
  await closeSheets(page);
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
  await page.evaluate(() => document.querySelector('#open-skip')?.click());
  await page.waitForTimeout(700);
  await page.evaluate(() => document.querySelector('#open-done')?.click());
  await page.waitForTimeout(1500);
  return revealed;
}

const levelState = (page) => page.evaluate(() => ({
  progress: window.__wikster.state.profile.progress,
  pending: window.__wikster.state.profile.pendingLevels,
  sheet: document.querySelector('#sheet')?.checkVisibility?.() ? document.querySelector('#sheet').textContent.replace(/\s+/g, ' ').slice(0, 120) : '',
  badge: document.querySelector('#level-badge .ring-label')?.textContent ?? null
}));

section('a level 500 guest, offline');
{
  const { ctx, page } = await device('guest', { local: profileAt(500) });
  const opened = await openOne(page);
  const s = await levelState(page);
  check('guest: the booster opens', opened);
  check('guest: still level 500', s.progress.level === 500, JSON.stringify(s.progress));
  check('guest: no level waiting', s.pending.length === 0, JSON.stringify(s.pending));
  check('guest: no level-up sheet', !/Level up/.test(s.sheet), s.sheet);
  await ctx.close();
}

section('a level 500 player on the server economy');
{
  const { ctx, page } = await device('phone');
  check('phone: signed in on the server economy', await signIn(page));
  await page.waitForTimeout(1500);
  await closeSheets(page);
  check('phone: the server holds level 500', server()?.state?.progress?.level === 500, JSON.stringify(server()?.state?.progress));
  for (let i = 0; i < 2; i++) {
    const opened = await openOne(page);
    const s = await levelState(page);
    check(`phone: booster ${i + 1} opens`, opened);
    check(`phone: still level 500 after booster ${i + 1}`, s.progress.level === 500 && server().state.progress.level === 500, JSON.stringify(s.progress));
    check(`phone: no level waiting after booster ${i + 1}`, s.pending.length === 0 && !(server().state.pendingLevels ?? []).length, JSON.stringify(s.pending));
    check(`phone: no level-up sheet after booster ${i + 1}`, !/Level up/.test(s.sheet), s.sheet);
  }
  check('phone: the badge reads 500 with a full ring', await page.evaluate(() => {
    const badge = document.querySelector('#level-badge');
    return badge.classList.contains('is-max') && badge.querySelector('.ring-label').textContent === '500'
      && Number(badge.querySelector('.ring-fill').style.strokeDashoffset) === 0;
  }));

  econDb.grants.push({ id: 7001, user: ID, kind: 'profile', payload: { patch: { 'progress.level': 900, 'progress.xp': 30 } } },
    { id: 7002, user: ID, kind: 'xp', payload: { amount: 40000 } });
  await page.evaluate(() => window.__wikster.econ('grants', {}, { quiet: true }).catch(() => null));
  await page.waitForTimeout(1200);
  await closeSheets(page);
  check('phone: a creator level past the top lands as 500', server().state.progress.level === 500 && server().state.progress.xp === 0, JSON.stringify(server().state.progress));
  check('phone: XP given at the top deals no level up', !(server().state.pendingLevels ?? []).length
    && (await page.evaluate(() => window.__wikster.state.profile.pendingLevels.length)) === 0);

  server().state.progress = { level: 720, xp: 15 };
  await page.evaluate(() => window.__wikster.econ('snapshot', {}, { quiet: true }).catch(() => null));
  await page.waitForTimeout(600);
  const shown = await levelState(page);
  check('phone: a level past the top held on the server shows as 500', shown.progress.level === 500 && shown.badge === '500', JSON.stringify(shown));
  const opened = await openOne(page);
  const after = await levelState(page);
  check('phone: and opening from there deals no level up', opened && after.pending.length === 0 && !/Level up/.test(after.sheet)
    && server().state.progress.level === 500 && !(server().state.pendingLevels ?? []).length, JSON.stringify({ after, server: server().state.progress }));

  await page.evaluate(() => document.querySelector('.nav-item[data-tab="profile"]')?.click());
  await page.waitForTimeout(900);
  const prof = await page.evaluate(() => ({
    level: document.querySelector('#profile-level')?.textContent, xp: document.querySelector('#xp-line')?.textContent,
    max: document.querySelector('#profile-ring')?.classList.contains('is-max') ?? null
  }));
  check('phone: the profile says Max level, with no XP target', prof.level === 'Max level' && prof.xp === 'Level 500, the highest there is' && prof.max && !/\u221e|Infinity|NaN/.test(prof.xp), JSON.stringify(prof));
  await ctx.close();
}

section('a guest past the top on PC');
{
  const { ctx, page } = await device('pc', { pc: true, local: { ...profileAt(500), progress: { level: 900, xp: 77 }, pendingLevels: [0, 1, 501] } });
  await closeSheets(page);
  const before = await levelState(page);
  check('pc: the level is clamped to 500 and impossible level ups are dropped', before.progress.level === 500 && before.progress.xp === 0 && before.pending.length === 0, JSON.stringify(before));
  check('pc: no level-up sheet at launch', !/Level up/.test(before.sheet), before.sheet);
  await page.evaluate(() => window.__wikster.addXp(80000));
  await page.waitForTimeout(1200);
  const s = await levelState(page);
  check('pc: XP at the top deals no level up', s.progress.level === 500 && s.pending.length === 0 && !/Level up/.test(s.sheet), JSON.stringify(s));
  const plate = await page.evaluate(() => ({
    rank: document.querySelector('.pc-plate-rank')?.textContent,
    max: document.querySelector('.pc-plate-ring')?.classList.contains('is-max'),
    label: document.querySelector('.pc-plate-ring .ring-label')?.textContent
  }));
  check('pc: the plate shows the max state', /^Max level/.test(plate.rank ?? '') && plate.max && plate.label === '500', JSON.stringify(plate));
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('wikster.profile.v1')).progress);
  check('pc: the save holds 500 as a number', stored.level === 500 && stored.xp === 0, JSON.stringify(stored));
  await ctx.close();
}

console.log(errors.length ? `\nERRORS\n${errors.join('\n')}` : '');
await browser.close();
process.exit(fails || errors.length ? 1 : 0);
