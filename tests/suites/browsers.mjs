import { chromium, firefox, webkit, devices } from 'playwright';
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
const ENGINES = (process.env.ENGINES ?? 'chromium').split(',').map((s) => s.trim()).filter(Boolean);
const TYPES = { chromium, firefox, webkit };
const RUN = process.env.BROWSER_RUN ?? 'signed';

const PHONE_TABS = ['shop', 'timed', 'packs', 'binder', 'profile'];
const PC_TABS = ['home', 'boosters', 'collection', 'shop', 'play', 'social'];

const LAYOUTS = {
  chromium: [['android phone', { ...devices['Pixel 7'] }], ['desktop', { viewport: { width: 1440, height: 900 } }]],
  firefox: [['linux desktop', { viewport: { width: 1440, height: 900 } }], ['linux laptop', { viewport: { width: 1280, height: 720 } }]],
  webkit: [['iphone', { ...devices['iPhone 13'] }], ['iphone landscape', { ...devices['iPhone 13 landscape'] }], ['mac safari', { viewport: { width: 1440, height: 900 } }]]
};

const PX = 'data:image/gif;base64,R0lGODlhAQABAAAAACw=';
const now = Date.now();
const day = utcDayIndex(now);
const entries = {};
for (let i = 0; i < 24; i++) {
  const k = `en:Card_${i}`;
  entries[k] = { key: k, title: `Article number ${i}`, rarityId: ['common', 'uncommon', 'rare', 'epic'][i % 4], price: 100 + i * 40, views: 300000,
    popularity: 0.6, count: 1, favorite: false, packId: 'theme|animals', packName: 'Animals', lang: 'en', thumbnail: PX,
    firstPulledAt: i, lastPulledAt: i, description: 'A thing', extract: 'Some words about it, long enough to be read as a card.' };
}
const profile = {
  started: true, createdAt: now - 86400000, playMs: 0, boostersOpened: 6, rarityCounts: { common: 6 },
  progress: { level: 4, xp: 0 }, pendingLevels: [],
  daily: { v: 2, day: 1, weeks: 0, lastDay: day, shownDay: day },
  timed: { count: 0, stamp: now }, freeTaken: { window: 0, ids: [] }
};

async function visibleText(page) {
  return page.evaluate(() => {
    const vw = innerWidth;
    const skip = (el) => el.closest('.navbar, .appbar, .pc-top, .pc-tabs, .pc-subtabs, .pc-foot, .drawer, #intro, .toast, .toasts');
    const seen = (el) => {
      for (let n = el; n && n !== document.documentElement; n = n.parentElement) {
        const cs = getComputedStyle(n);
        if (cs.display === 'none' || cs.visibility === 'hidden' || Number(cs.opacity) < 0.1) return false;
      }
      return true;
    };
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    let chars = 0;
    const range = document.createRange();
    while (walker.nextNode()) {
      const node = walker.currentNode;
      const text = node.textContent.trim();
      if (!text || !node.parentElement || skip(node.parentElement)) continue;
      range.selectNodeContents(node);
      const r = range.getBoundingClientRect();
      if (r.width < 1 || r.height < 1 || r.right < 0 || r.left > vw) continue;
      if (!seen(node.parentElement)) continue;
      chars += text.length;
    }
    const buys = [...document.querySelectorAll('.buy, .shop-tile, .pcs-tile')].filter((b) => {
      const r = b.getBoundingClientRect();
      return r.width > 0 && r.height > 0 && seen(b);
    }).length;
    return { chars, buys, pc: document.documentElement.classList.contains('is-pc') || document.body.classList.contains('is-pc') };
  });
}

async function closeSheets(page) {
  for (let i = 0; i < 8; i++) {
    if (!(await page.locator('#sheet').isVisible().catch(() => false))) break;
    const primary = page.locator('#sheet .btn-primary:visible').first();
    if (await primary.count()) await primary.click({ timeout: 2000 }).catch(() => {});
    else await page.keyboard.press('Escape');
    await page.waitForTimeout(300);
  }
}

async function goTab(page, id, pc) {
  if (pc) {
    const tab = page.locator(`.pc-tab[data-dest="${id}"]`);
    if (await tab.count()) { await tab.first().click({ timeout: 5000 }); return true; }
    return false;
  }
  const tab = page.locator(`.nav-item[data-tab="${id}"]`);
  if (!(await tab.count())) return false;
  await tab.first().click({ timeout: 5000 });
  return true;
}

async function closeDrawer(page) {
  for (let i = 0; i < 3; i++) {
    if (await page.locator('.pc-menu:not([hidden])').count()) {
      await page.keyboard.press('Escape');
      await page.waitForTimeout(300);
      continue;
    }
    if (!(await page.locator('.drawer.is-open, #drawer.is-open, .drawer[open]').count())) return;
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);
  }
}

async function walk(page, label, errors) {
  await closeSheets(page);
  await closeDrawer(page);
  const { pc } = await visibleText(page);
  for (const id of pc ? PC_TABS : PHONE_TABS) {
    const before = errors.length;
    let went = false;
    await closeDrawer(page);
    try { went = await goTab(page, id, pc); } catch (e) { errors.push(`click ${id}: ${e.message.split('\n')[0]}`); }
    await page.waitForTimeout(1300);
    await closeSheets(page);
    await closeDrawer(page);
    const seen = await visibleText(page);
    const fresh = errors.slice(before);
    check(`${label}: ${id} draws something`, went && seen.chars > 40, `chars=${seen.chars}${fresh.length ? ' errors: ' + fresh.join(' | ') : ''}`);
    if (id === 'shop') check(`${label}: the shop shows boosters to buy`, seen.buys > 0, `tiles=${seen.buys}`);
    await page.screenshot({ path: `browsers-${label.replace(/[^a-z0-9]+/gi, '-')}-${id}.png` }).catch(() => {});
  }
}

async function guest(browser, name, layout, opts) {
  const ctx = await browser.newContext({ serviceWorkers: 'block', ...opts });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(`${e.message}${e.stack ? ' @ ' + e.stack.split('\n').slice(0, 3).join(' < ') : ''}`));
  installStubs(page);
  await page.addInitScript(({ entries, profile }) => {
    if (localStorage.getItem('wikster.test.seeded')) return;
    localStorage.setItem('wikster.test.seeded', '1');
    localStorage.setItem('wikster.language', 'en');
    localStorage.setItem('wikster.profile.v1', JSON.stringify(profile));
    localStorage.setItem('wikster.wallet.v1', '5000');
    localStorage.setItem('wikster.collection.v3', JSON.stringify({ entries }));
  }, { entries, profile });
  await page.goto(BASE, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(3000);
  if (await page.locator('#gate-form').isVisible().catch(() => false)) {
    console.log(`skip  ${name} ${layout} guest: this build asks for an account first`);
    await ctx.close();
    return;
  }
  await walk(page, `${name} ${layout} guest`, errors);
  check(`${name} ${layout} guest: no page errors`, errors.length === 0, errors.slice(0, 5).join(' || '));
  await ctx.close();
}

async function signedIn(browser, name, layout, opts) {
  const ID = '00000000-0000-4000-8000-0000000000b1';
  const bare = { started: true, createdAt: now - 86400000, playMs: 0, boostersOpened: 6, progress: { level: 4, xp: 0 } };
  const saveData = {
    'wikster.wallet.v1': '4321', 'wikster.ink.v1': '12',
    'wikster.collection.v3': JSON.stringify({ entries }),
    'wikster.profile.v1': JSON.stringify(bare), 'wikster.language': 'en'
  };
  const stamps = Object.fromEntries(Object.keys(saveData).map((k) => [k, now - 60000]));
  const db = newDatabase();
  db.users.set('b@example.test', { id: ID, password: 'hunter2hunter2', meta: { age_13_plus: true } });
  db.profiles.set(ID, { id: ID, username: 'browser', created_at: new Date(now - 86400000).toISOString(), level: 4,
    cards: 24, unique_cards: 24, boosters_opened: 6, collection_value: 3000, play_ms: 0 });
  db.saves.set(ID, { user_id: ID, data: { format: 'wikster-save', version: 2, at: now - 60000, data: saveData, stamps }, updated_at: new Date(now - 60000).toISOString() });
  const econDb = createEconDb();
  econDb.cutover = now + 86400000;
  econDb.born.set(ID, now - 86400000);
  const economy = economyStub(engine, econDb);

  const ctx = await browser.newContext({ serviceWorkers: 'block', ...opts });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(`${e.message}${e.stack ? ' @ ' + e.stack.split('\n').slice(0, 3).join(' < ') : ''}`));
  installStubs(page);
  await installSupabase(page, { db, economy });
  await page.addInitScript(() => { localStorage.setItem('wikster.language', 'en'); });
  await page.goto(BASE, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2500);
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
  await page.locator('#gate-form input[name="email"]').fill('b@example.test').catch(() => {});
  await page.locator('#gate-form input[name="password"]').fill('hunter2hunter2').catch(() => {});
  if (await page.locator('#gate-form input[name="age"]').count()) await page.locator('#gate-form input[name="age"]').fill('30').catch(() => {});
  await page.locator('#gate-form button[type="submit"]').click({ timeout: 3000 }).catch(() => {});
  let live = false;
  for (let i = 0; i < 60 && !live; i++) {
    live = await page.evaluate(() => Boolean(window.__wikster?.serverEconomy?.())).catch(() => false);
    if (!live) await page.waitForTimeout(250);
  }
  check(`${name} ${layout} signed in: the server economy is on`, live);
  await page.waitForTimeout(1500);
  await closeSheets(page);
  await walk(page, `${name} ${layout} signed in`, errors);
  check(`${name} ${layout} signed in: no page errors`, errors.length === 0, errors.slice(0, 5).join(' || '));
  await ctx.close();
}

for (const name of ENGINES) {
  const type = TYPES[name];
  if (!type) { check(`engine ${name} exists`, false); continue; }
  let browser;
  try {
    browser = await type.launch(name === 'chromium' ? launchOptions() : {});
  } catch (e) {
    check(`${name} launches`, false, e.message.split('\n')[0]);
    continue;
  }
  for (const [layout, opts] of LAYOUTS[name]) {
    const o = { ...opts };
    if (name === 'firefox') delete o.isMobile;
    section(`${name}: ${layout}`);
    if (RUN === 'guest') await guest(browser, name, layout, o).catch((e) => check(`${name} ${layout} guest run`, false, e.message.split('\n')[0]));
    else await signedIn(browser, name, layout, o).catch((e) => check(`${name} ${layout} signed-in run`, false, e.message.split('\n')[0]));
  }
  await browser.close();
}

console.log(`\n${fails ? `${fails} FAILED` : 'all passed'}`);
process.exit(fails ? 1 : 0);
