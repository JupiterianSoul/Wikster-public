import { localTime, resolveNow, useClock } from '../lib/clock.mjs';
import { chromium, devices } from 'playwright';
import { launchOptions } from '../lib/browser.mjs';
import { installStubs } from '../lib/stubs.mjs';
import { dealQuests, economyStub, installSupabase, newDatabase } from '../lib/supastub.mjs';
import { createEconDb } from '../lib/econdb.mjs';
import { RELEASES } from '../../src/data/releases.js';
import { seasonAt } from '../../src/season.js';
import { msUntilNextUtcDay, utcDateText, utcDay, utcDayIndex } from '../../src/days.js';

const engine = await import('../../supabase/functions/economy/engine.js');

let fails = 0;
const check = (l, c, e = '') => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${e ? '  ' + e : ''}`); };
const section = (s) => console.log(`\n== ${s}`);
const BASE = process.env.BASE_URL ?? 'http://127.0.0.1:4173/';
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

const PC = { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 };
const MATRIX = [
  { tz: 'Europe/Paris', at: [2026, 10, 3, 0, 30], device: devices['Pixel 7'], layout: 'phone' },
  { tz: 'America/Los_Angeles', at: [2026, 10, 2, 20, 0], device: devices['Pixel 7'], layout: 'phone' },
  { tz: 'Pacific/Kiritimati', at: [2026, 10, 3, 1, 0], device: PC, layout: 'pc' },
  { tz: 'Pacific/Pago_Pago', at: [2026, 12, 31, 23, 30], device: devices['Pixel 7'], layout: 'phone' }
];
const picked = process.env.WIKSTER_TZ
  ? [{ tz: process.env.WIKSTER_TZ, now: resolveNow(process.env.WIKSTER_NOW || '00:30', process.env.WIKSTER_TZ), device: devices['Pixel 7'], layout: 'phone' }]
  : MATRIX.map((c) => ({ ...c, now: localTime(c.tz, ...c.at) }));

const ID = '00000000-0000-4000-8000-000000000001';
const LATEST = RELEASES.at(-1).id;
const hm = (text) => {
  const h = /(\d+)h (\d+)m/.exec(text ?? '');
  if (h) return Number(h[1]) * 60 + Number(h[2]);
  const m = /(\d+)m \d+s/.exec(text ?? '');
  if (m) return Number(m[1]);
  return /\d+s/.test(text ?? '') ? 0 : null;
};

async function closeSheets(page) {
  for (let i = 0; i < 8; i++) {
    if (!(await page.locator('#sheet').isVisible().catch(() => false)) && !(await page.locator('.pc-menu').isVisible().catch(() => false))) break;
    await page.keyboard.press('Escape');
    await page.waitForTimeout(250);
  }
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
const viaPc = async (page, dest, screen = null) => {
  await closeSheets(page);
  await page.locator(`.pc-tab[data-dest="${dest}"]`).click();
  await page.waitForTimeout(400);
  if (screen) {
    await page.locator(`.pc-subtab[data-screen="${screen}"]`).click();
    await page.waitForTimeout(700);
  }
};

const browser = await chromium.launch(launchOptions());

for (const tcase of picked) {
  const clock = useClock({ tz: tcase.tz, now: tcase.now });
  const now = Date.now();
  const today = utcDay(now);
  const dayN = utcDayIndex(now);
  const localDate = new Intl.DateTimeFormat('en-CA', { timeZone: tcase.tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(now));
  section(`${tcase.tz}, local ${localDate} ${new Intl.DateTimeFormat('en-GB', { timeZone: tcase.tz, hour: '2-digit', minute: '2-digit' }).format(new Date(now))}, UTC ${new Date(now).toISOString().slice(0, 16)} (${tcase.layout})`);
  check('the case sits where the local date and the UTC date differ', !process.env.WIKSTER_TZ ? localDate !== today : true, `${localDate} vs ${today}`);

  const profile = {
    started: true, createdAt: now - 3 * 86400000, playMs: 0, boostersOpened: 0, rarityCounts: {},
    progress: { level: 3, xp: 0 }, pendingLevels: [],
    daily: { v: 2, day: 2, weeks: 0, lastDay: dayN - 1, shownDay: dayN },
    timed: { count: 0, stamp: now }, freeTaken: { window: 0, ids: [] }, achievements: { redeemed: [] }
  };
  const saveData = {
    'wikster.wallet.v1': '1000', 'wikster.ink.v1': '0', 'wikster.inventory.v1': '{}',
    'wikster.collection.v3': JSON.stringify({ entries: {} }),
    'wikster.profile.v1': JSON.stringify(profile), 'wikster.language': 'en'
  };
  const db = newDatabase();
  db.users.set('d@example.test', { id: ID, password: 'hunter2hunter2', meta: { age_13_plus: true } });
  db.profiles.set(ID, { id: ID, username: 'dayplayer', created_at: new Date(now - 3 * 86400000).toISOString(), level: 3, cards: 0, unique_cards: 0, boosters_opened: 0, collection_value: 0, play_ms: 0 });
  db.saves.set(ID, { user_id: ID, data: { format: 'wikster-save', version: 2, at: now - 60000, data: saveData, stamps: Object.fromEntries(Object.keys(saveData).map((k) => [k, now - 60000])) }, updated_at: new Date(now - 60000).toISOString() });
  const iso = (ms) => new Date(now + ms).toISOString();
  db.announcements.push(
    { id: 1, title_en: 'Live now', body_en: 'This one is on.', kind: 'note', starts_at: iso(-10 * 60000), ends_at: iso(60 * 60000), target_user: null },
    { id: 2, title_en: 'Later tonight', body_en: 'Not yet.', kind: 'note', starts_at: iso(30 * 60000), ends_at: null, target_user: null },
    { id: 3, title_en: 'Just over', body_en: 'Finished.', kind: 'note', starts_at: iso(-3 * 3600000), ends_at: iso(-10 * 60000), target_user: null }
  );
  const econDb = createEconDb();
  econDb.cutover = now + 86400000;
  econDb.born.set(ID, now - 3 * 86400000);
  const economy = economyStub(engine, econDb);
  const dealt = dealQuests(ID, today);
  for (const q of dealt) econDb.quests.set(`${ID}|${today}|${q.id}`, { progress: q.target, target: q.target, claimed: false });
  const server = () => econDb.users.get(ID);

  const ctx = await browser.newContext({ serviceWorkers: 'block', ...tcase.device });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(`${tcase.tz}: ${e.message}`));
  installStubs(page);
  await installSupabase(page, { db, economy, quests: { delay: 0 } });
  await page.addInitScript(({ latest, seeded }) => {
    if (localStorage.getItem('wikster.profile.v1')) return;
    for (const [k, v] of Object.entries(seeded)) localStorage.setItem(k, v);
    localStorage.setItem('wikster.seenRelease.v1', latest);
  }, { latest: LATEST, seeded: saveData });
  await page.goto(BASE, { waitUntil: 'domcontentloaded' });

  const seen = await page.evaluate(() => ({ now: Date.now(), offset: new Date().getTimezoneOffset(), zone: Intl.DateTimeFormat().resolvedOptions().timeZone }));
  check('the page runs in that zone, at that time', seen.zone === tcase.tz && Math.abs(seen.now - now) < 120000, JSON.stringify(seen));

  const noticed = await until(async () => (await page.locator('.notice-sheet').count()) > 0 && /Live now/.test(await page.locator('#sheet').textContent()));
  check('a notice inside its window shows', noticed);
  await closeSheets(page);
  await page.waitForTimeout(1500);
  const sheetText = await page.locator('#sheet').textContent().catch(() => '');
  check('the one not started and the one just over stay away', !/Later tonight|Just over/.test(sheetText ?? ''));
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
  await page.locator('#gate-form input[name="email"]').fill('d@example.test');
  await page.locator('#gate-form input[name="password"]').fill('hunter2hunter2');
  if (await page.locator('#gate-form input[name="age"]').count()) await page.locator('#gate-form input[name="age"]').fill('30');
  await page.locator('#gate-form button[type="submit"]').click();
  check('signed in on the server economy', await until(() => page.evaluate(() => window.__wikster.serverEconomy())));
  await page.waitForTimeout(1200);
  await closeSheets(page);

  const giftLeft = msUntilNextUtcDay(Date.now());
  if (tcase.layout === 'pc') {
    await viaPc(page, 'home');
    check('the home gift waits for its UTC day', await until(async () => (await page.locator('.pch-daily.is-ready').count()) === 1));
    await page.locator('.pch-daily .pcx-btn').click();
  } else {
    await viaDrawer(page, 'daily');
  }
  check('the gift sheet offers today\'s gift', await until(async () => (await page.locator('#sheet .daily-hero.is-ready').count()) === 1));
  const reset = await page.locator('#sheet [data-reset]').textContent();
  const shownLeft = hm(reset);
  check('its clock counts to the next 00:00 UTC', shownLeft != null && Math.abs(shownLeft - Math.floor(giftLeft / 60000)) <= 1, `${reset} vs ${Math.floor(giftLeft / 60000)} min`);
  await page.locator('#sheet .present').click();
  check('the server pays it for the UTC day', await until(() => server()?.state?.daily?.lastDay === dayN), JSON.stringify(server()?.state?.daily));
  check('the device agrees on the day', await until(() => page.evaluate((d) => JSON.parse(localStorage.getItem('wikster.profile.v1')).daily.lastDay === d, dayN)));
  const again = await page.evaluate(() => window.__wikster.econ('daily', {}).then(() => 'PAID', (e) => String(e?.message ?? e)));
  check('a second gift the same UTC day is refused', again === 'ALREADY_CLAIMED', again);
  await closeSheets(page);

  if (tcase.layout === 'pc') await viaPc(page, 'play', 'quests');
  else await viaDrawer(page, 'quests');
  check('the quests of the UTC day are ready', await until(async () => (await page.locator('#screen-quests .quest .quest-claim').count()) === 3));
  const questReset = hm(await page.locator('#quests-body [data-reset]').textContent().catch(() => ''));
  check('the quest clock counts to the same midnight', questReset != null && Math.abs(questReset - Math.floor(msUntilNextUtcDay(Date.now()) / 60000)) <= 1, String(questReset));
  await page.locator('#screen-quests .quest .quest-claim').first().click();
  check('a quest claim lands on the UTC day', await until(() => server()?.state?.questDay?.day === today), JSON.stringify(server()?.state?.questDay));

  check('the Wikdle word is the UTC day\'s', await page.evaluate(() => window.__wikster.wikdle.utcDay()) === today);

  if (tcase.layout === 'pc') await viaPc(page, 'play', 'season');
  else await viaDrawer(page, 'season');
  const season = seasonAt(now);
  const span = await page.locator('#season-dates').textContent().catch(() => '');
  const from = utcDateText(season.startsAt, 'en', { day: 'numeric', month: 'long' });
  const to = utcDateText(season.endsAt - 1, 'en', { day: 'numeric', month: 'long' });
  check('the season shows its UTC calendar dates', span.includes(from) && span.includes(to), `${span} / ${from} to ${to}`);

  await ctx.close();
  console.log(`clock: ${clock.tz} ${new Date(clock.now).toISOString()}`);
}

section('no page errors');
check('none', errors.length === 0, errors.slice(0, 5).join(' | '));
await browser.close();
console.log(fails ? `\n${fails} FAILURES` : '\nALL PASS');
process.exit(fails ? 1 : 0);
