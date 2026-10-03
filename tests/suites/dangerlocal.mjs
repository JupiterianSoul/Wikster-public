import { chromium, devices } from 'playwright';
import { launchOptions } from '../lib/browser.mjs';
import { installStubs } from '../lib/stubs.mjs';
import { RELEASES } from '../../src/data/releases.js';

let fails = 0;
const check = (l, c, e = '') => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${e ? '  ' + e : ''}`); };
const section = (s) => console.log(`\n== ${s}`);
const BASE = process.env.BASE_URL ?? 'http://127.0.0.1:4173/';
const browser = await chromium.launch(launchOptions());
const errors = [];
const PX = 'data:image/gif;base64,R0lGODlhAQABAAAAACw=';
const until = async (fn, ms = 10000) => {
  const end = Date.now() + ms;
  for (;;) {
    let ok = false;
    try { ok = await fn(); } catch { ok = false; }
    if (ok || Date.now() > end) return ok;
    await new Promise((r) => setTimeout(r, 250));
  }
};

async function device({ pc = false } = {}) {
  const ctx = await browser.newContext(pc
    ? { serviceWorkers: 'block', viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 1 }
    : { serviceWorkers: 'block', ...devices['Pixel 7'] });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(`PAGE: ${e.message}`));
  installStubs(page);
  await page.addInitScript(({ PX, seen }) => {
    if (localStorage.getItem('wikster.authTries')) return;
    localStorage.setItem('wikster.authTries', '{}');
    const now = Date.now();
    localStorage.setItem('wikster.language', 'en');
    localStorage.setItem('wikster.seenRelease.v1', seen);
    localStorage.setItem('wikster.agelock.v1', '0');
    localStorage.setItem('wikster.wallet.v1', '9000');
    localStorage.setItem('wikster.collection.v3', JSON.stringify({ entries: {
      'en:Owl': { key: 'en:Owl', title: 'Owl', rarityId: 'rare', price: 300, count: 1, lang: 'en', thumbnail: PX },
      'en:Code': { key: 'en:Code', title: 'Code', rarityId: 'special', special: 'hello', price: 0, count: 1, lang: 'en', thumbnail: PX }
    } }));
    localStorage.setItem('wikster.inventory.v1', JSON.stringify({
      'theme|animals|std|5': { spec: { kind: 'theme', themeId: 'animals', rarityId: null, cards: 5 }, count: 2 },
      'code|hello': { spec: { kind: 'code', codeId: 'hello', cards: 3 }, count: 1 }
    }));
    localStorage.setItem('wikster.profile.v1', JSON.stringify({ started: true, createdAt: now, playMs: 0, boostersOpened: 1, rarityCounts: {},
      progress: { level: 4, xp: 0 }, pendingLevels: [], daily: { v: 2, day: 1, weeks: 0, lastDay: Math.floor(now / 86400000), shownDay: Math.floor(now / 86400000) },
      timed: { count: 0, stamp: now }, freeTaken: { window: 0, ids: [] } }));
  }, { PX, seen: RELEASES.at(-1).id });
  await page.goto(BASE, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2200);
  await closeSheets(page);
  return page;
}

async function closeSheets(page) {
  for (let i = 0; i < 6; i++) {
    if (!(await page.locator('#sheet').isVisible().catch(() => false))) break;
    await page.keyboard.press('Escape');
    await page.waitForTimeout(350);
  }
}

async function openDanger(page, which) {
  await closeSheets(page);
  if (await page.locator('.pc-menu').count()) {
    const item = page.locator('.pc-menu-item[data-act="settings"]');
    for (let i = 0; i < 4 && !(await item.isVisible().catch(() => false)); i++) {
      await page.keyboard.press('Escape');
      await page.waitForTimeout(450);
    }
    await item.click();
    await page.waitForTimeout(600);
    const group = await page.evaluate(() => document.querySelector('#data-list')?.closest('.pc-group')?.dataset.group ?? null);
    if (group) await page.locator(`#screen-settings .pc-section-link[data-group="${group}"]`).click();
  } else {
    await page.locator('#menu-btn').click();
    await page.waitForTimeout(450);
    await page.locator('.drawer-link[data-link="settings"]').click();
  }
  await page.waitForTimeout(600);
  await page.locator(`[data-danger="${which}"]`).click();
  await page.waitForTimeout(500);
}

const keysOf = (page) => page.evaluate(() => Object.keys(window.__wikster.state.collection.entries));

section('without an account, remove all cards works on this device');
const phone = await device();
check('there is no delete account button without an account', (await phone.locator('[data-danger="account"]').count()) === 0);
await openDanger(phone, 'cards');
const text = await phone.locator('#sheet').textContent();
check('the dialog lists only what this device holds', /Every card, except the special cards/.test(text) && !/auction house|Trades|once a month/.test(text));
check('and waits for the typed word', await phone.locator('#sheet [data-danger-go]').isDisabled());
await phone.locator('#sheet [data-danger-word]').fill('REMOVE');
await phone.locator('#sheet [data-danger-go]').click();
check('only the special card stays', await until(async () => (await keysOf(phone)).join() === 'en:Code'));
check('only the code booster stays', JSON.stringify(Object.keys(await phone.evaluate(() => window.__wikster.state.inventory))) === '["code|hello"]');
check('the Buckarooz go back to the start', await phone.evaluate(() => window.__wikster.state.wallet) === 1500);
check('the level stays', await phone.evaluate(() => window.__wikster.state.profile.progress.level) === 4);
check('it says so', /Collection emptied/.test(await phone.locator('#toast').textContent()));

section('without an account, erase everything starts this device over');
const pc = await device({ pc: true });
await openDanger(pc, 'all');
check('the computer dialog is the device one', /Everything this device saved is erased/.test(await pc.locator('#sheet').textContent()));
await pc.locator('#sheet [data-danger-word]').fill('erase');
await pc.locator('#sheet [data-danger-go]').click();
check('the computer starts over', await until(async () => (await keysOf(pc)).length === 0 && await pc.evaluate(() => !window.__wikster.state.profile.started), 15000));
check('the language and age check stay', await pc.evaluate(() => localStorage.getItem('wikster.language') === 'en' && localStorage.getItem('wikster.agelock.v1') === '0'));
check('the new player is welcomed', await until(() => pc.locator('#welcome').isVisible(), 6000));

for (const page of [phone, pc]) await page.context().close().catch(() => {});
await browser.close();
const real = errors.filter((e) => !/Target page, context or browser has been closed/.test(e));
if (real.length) { console.log('ERRORS'); for (const e of real) console.log(`  ${e}`); fails += real.length; }
console.log(fails ? `\n${fails} check(s) failed` : '\nALL PASS');
process.exit(fails ? 1 : 0);
