import { chromium, devices } from 'playwright';
import { launchOptions } from '../lib/browser.mjs';
import { installStubs } from '../lib/stubs.mjs';
import { economyStub, installSupabase, newDatabase } from '../lib/supastub.mjs';
import { createEconDb } from '../lib/econdb.mjs';
import { RELEASES } from '../../src/data/releases.js';

const engine = await import('../../supabase/functions/economy/engine.js');

let fails = 0;
const check = (label, ok, detail = '') => { if (!ok) fails++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? `  ${detail}` : ''}`); };
const section = (s) => console.log(`\n== ${s}`);
const BASE = process.env.BASE_URL ?? 'http://127.0.0.1:4173/';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 10000) => {
  const end = Date.now() + ms;
  for (;;) {
    let ok = false;
    try { ok = await fn(); } catch { ok = false; }
    if (ok || Date.now() > end) return ok;
    await sleep(200);
  }
};

const now = Date.now();
const iso = (ms = 0) => new Date(now + ms).toISOString();
const day = Math.floor(now / 86400000);
const ROBIN = '00000000-0000-4000-8000-0000000000f1';
const VIEW = '00000000-0000-4000-8000-0000000000f2';
const GREEN = '#22c55e';
const PIC = 'https://friendpics.supabase.co/storage/v1/object/public/friend-pictures/ROBINFC/laugh.svg';
const SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40" width="400" height="400"><rect width="40" height="40" fill="#22c55e"/></svg>';
const people = {
  [ROBIN]: { email: 'robin@example.test', name: 'robin_s', theme: 'paper' },
  [VIEW]: { email: 'viewer@example.test', name: 'viewer_v', theme: 'paper' }
};

const db = newDatabase();
const econDb = createEconDb();
econDb.cutover = now + 86400000;
for (const [id, p] of Object.entries(people)) {
  db.users.set(p.email, { id, password: 'hunter2hunter2', meta: { age_13_plus: true } });
  db.profiles.set(id, { id, username: p.name, created_at: iso(-86400000), level: 6, cards: 0, unique_cards: 0, boosters_opened: 4, collection_value: 0, play_ms: 60000 });
  const profile = {
    started: true, createdAt: now - 86400000, playMs: 60000, boostersOpened: 4, rarityCounts: {}, progress: { level: 6, xp: 0 }, pendingLevels: [],
    daily: { lastDay: day, shownDay: day, claimed: 1, board: 0 }, timed: { count: 0, stamp: now }, freeTaken: { window: 0, ids: [] },
    owned: { themes: ['paper'], frames: [], fx: [] }
  };
  const data = {
    'wikster.wallet.v1': '3000', 'wikster.ink.v1': '0', 'wikster.inventory.v1': '{}', 'wikster.theme': p.theme,
    'wikster.collection.v3': JSON.stringify({ entries: {} }), 'wikster.profile.v1': JSON.stringify(profile), 'wikster.language': 'en'
  };
  db.saves.set(id, { user_id: id, data: { format: 'wikster-save', version: 2, at: now - 60000, data, stamps: Object.fromEntries(Object.keys(data).map((k) => [k, now - 60000])) }, updated_at: iso(-60000) });
  econDb.born.set(id, now - 86400000);
}
db.friendships.push({ id: 'f-robin', requester: VIEW, addressee: ROBIN, status: 'accepted', created_at: iso(-3600000) });

econDb.codes.set('ROBINFC', {
  code: 'ROBINFC', per_user: 1, allowed: [ROBIN], items: [{ kind: 'coins', amount: 75 }],
  special: {
    name: 'Robin', message: 'Robin. Five things you love and one that laughs back. Made for you.',
    cards: [
      { article: { key: 'en:Tetris', title: 'Tetris', lang: 'en', description: 'A video game', extract: 'Tetris is a game about bugs and grief.',
        url: 'https://en.wikipedia.org/wiki/Tetris', thumbnail: 'https://upload.wikimedia.org/hero-1.svg' }, rarityId: 'legendary' },
      { article: { key: 'special:robinfc:the-laugh', title: 'The Laugh', lang: 'en', description: 'Only Robin', extract: 'Nobody laughs quite like Robin, and now it is a card.',
        picture: { url: PIC, credit: 'Gabriel Quart', license: 'CC BY 4.0', link: 'https://example.org/laugh' } }, rarityId: 'special' }
    ],
    booster: { name: 'Robin’s Booster', accent: GREEN, accent2: '#14532d', cards: [
      { article: { key: 'en:Ada_Lovelace', title: 'Ada Lovelace', lang: 'en', thumbnail: 'https://upload.wikimedia.org/hero-2.svg' }, rarityId: 'epic' },
      { article: { key: 'en:Alan_Turing', title: 'Alan Turing', lang: 'en', thumbnail: 'https://upload.wikimedia.org/hero-3.svg' }, rarityId: 'rare' },
      { article: { key: 'en:Concorde', title: 'Concorde', lang: 'en', thumbnail: 'https://upload.wikimedia.org/hero-4.svg' }, rarityId: 'common' }
    ] },
    theme: { name: 'Robin Green', base: 'rire', accent: GREEN },
    badge: { name: 'Robin’s Badge', emblem: 'laugh', color: GREEN }
  }
});
econDb.codes.set('NOTYOURS', { code: 'NOTYOURS', allowed: [VIEW], items: [], special: { name: 'Vee', message: 'For the viewer', badge: { name: 'Vee', emblem: 'seal', color: '#ffffff' } } });
const economy = economyStub(engine, econDb);

const browser = await chromium.launch(launchOptions());
const errors = [];

async function closeSheets(page) {
  for (let i = 0; i < 8; i++) {
    if (!(await page.locator('#sheet').isVisible().catch(() => false))) break;
    if (await page.locator('#sheet-close').isVisible().catch(() => false)) await page.locator('#sheet-close').click().catch(() => 0);
    else await page.keyboard.press('Escape');
    await page.waitForTimeout(450);
  }
}

async function player(id, { pc = false } = {}) {
  const p = people[id];
  const ctx = await browser.newContext(pc ? { serviceWorkers: 'block', viewport: { width: 1600, height: 900 }, deviceScaleFactor: 1 } : { serviceWorkers: 'block', ...devices['Pixel 7'] });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(`${p.name}: ${e.message}`));
  installStubs(page);
  await page.route(/friend-pictures/, (r) => r.fulfill({ status: 200, contentType: 'image/svg+xml', body: SVG, headers: { 'access-control-allow-origin': '*' } }));
  await installSupabase(page, { db, economy });
  await page.addInitScript(({ seen, pc }) => {
    if (localStorage.getItem('wikster.test.seeded')) return;
    localStorage.setItem('wikster.test.seeded', '1');
    localStorage.setItem('wikster.language', 'en');
    localStorage.setItem('wikster.seenRelease.v1', seen);
    if (pc) localStorage.setItem('wikster.layout.v1', 'pc');
  }, { seen: RELEASES.at(-1).id, pc });
  await page.goto(BASE, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2200);
  await closeSheets(page);
  if (!(await page.locator('#gate-form').isVisible().catch(() => false))) {
    if (pc) await page.locator('.pc-tab[data-dest="social"]').click().catch(() => 0);
    else {
      await page.evaluate(() => document.querySelector('.appbar .icon-btn')?.click());
      await page.waitForTimeout(400);
      await page.locator('.drawer-link[data-link="account"], .drawer-link[data-link="friends"]').first().click({ timeout: 4000 }).catch(() => 0);
    }
    await page.waitForTimeout(900);
  }
  if (await page.locator('#gate-seg .seg-option[data-value="in"]').count()) {
    await page.locator('#gate-seg .seg-option[data-value="in"]').click();
    await page.waitForTimeout(200);
  }
  await page.locator('#gate-form input[name="email"]').fill(p.email);
  await page.locator('#gate-form input[name="password"]').fill('hunter2hunter2');
  if (await page.locator('#gate-form input[name="age"]').count()) await page.locator('#gate-form input[name="age"]').fill('30');
  await page.locator('#gate-form button[type="submit"]').click();
  await until(() => page.evaluate(() => window.__wikster.serverEconomy()), 20000);
  await page.waitForTimeout(1800);
  await closeSheets(page);
  return page;
}

const drawer = async (page, link) => {
  await closeSheets(page);
  for (let i = 0; i < 5; i++) {
    if (await page.locator('#drawer.is-open').count()) break;
    await page.evaluate(() => document.querySelector('.appbar .icon-btn')?.click());
    await page.waitForTimeout(420);
  }
  await page.locator(`.drawer-link[data-link="${link}"]`).click();
  await page.waitForTimeout(900);
};
const flush = async (page) => { await page.evaluate(() => window.__wikster.flushSync()).catch(() => {}); await page.waitForTimeout(500); };
const redeem = async (page, code) => {
  await page.locator('#redeem-list [data-code]').scrollIntoViewIfNeeded();
  await page.locator('#redeem-list [data-status]').evaluate((n) => { n.textContent = ''; });
  await page.locator('#redeem-list [data-code]').fill(code);
  await page.locator('#redeem-list button[type="submit"]').click();
  await until(async () => ((await page.locator('#redeem-list [data-status]').textContent()) ?? '').length > 0, 8000);
  await page.waitForTimeout(600);
  return (await page.locator('#redeem-list [data-status]').textContent()) ?? '';
};

section('Robin redeems the code made for him');
const robin = await player(ROBIN);
await drawer(robin, 'settings');
check('a code made for someone else does not exist for him', /does not open anything/i.test(await redeem(robin, 'NOTYOURS')));
await closeSheets(robin);
await drawer(robin, 'settings');
const said = await redeem(robin, 'robin-fc');
check('his code redeems', /redeemed/i.test(said), said);
check('the reveal opens with his message', await until(() => robin.locator('.reveal.is-friend').isVisible())
  && /Five things you love/.test(await robin.locator('.reveal.is-friend [data-friend-message]').textContent()));
check('it shows the booster, the cards, the theme and the badge', await robin.locator('.reveal.is-friend [data-friend-booster]:not([hidden]) .booster').count() === 1
  && await robin.locator('.reveal.is-friend [data-friend-cards] li').count() === 2
  && /Robin Green/.test(await robin.locator('.reveal.is-friend [data-theme-grant]').textContent())
  && await robin.locator('.reveal.is-friend [data-badge-grant] svg').count() === 1);
check('the server gave the items too', econDb.users.get(ROBIN)?.wallet.coins === 3075, String(econDb.users.get(ROBIN)?.wallet.coins));
const worn = await robin.evaluate(() => ({ theme: document.documentElement.dataset.theme, accent: document.documentElement.style.getPropertyValue('--accent').trim(),
  stored: localStorage.getItem('wikster.theme'), badges: window.__wikster.store.loadBadgeLoadout() }));
check('his theme is on: the base theme with his colour', worn.theme === 'rire' && worn.accent === GREEN && worn.stored === 'fc-robinfc', JSON.stringify(worn));
check('his badge is worn', (worn.badges ?? []).includes('fc-robinfc'), JSON.stringify(worn.badges));
await closeSheets(robin);

section('the cards are in the binder with their picture credit');
await robin.locator('.nav-item[data-tab="binder"]').click();
await robin.waitForTimeout(900);
const cover = robin.locator('.album-cover').filter({ hasText: /Robin’s Album/ }).first();
check('his album is in the binder', (await cover.count()) === 1);
await cover.click();
await robin.waitForTimeout(1200);
const titles = await robin.evaluate(() => [...document.querySelectorAll('#page-slots .card .card-title')].map((n) => n.textContent.trim()));
check('with both cards', titles.includes('Tetris') && titles.includes('The Laugh'), titles.join(' | '));
const laughCard = robin.locator('#page-slots .card').filter({ hasText: 'The Laugh' }).first();
check('the uploaded picture is on the card', /friend-pictures/.test((await laughCard.locator('.card-art img').getAttribute('src').catch(() => '')) ?? ''));
await laughCard.click();
await robin.waitForTimeout(1200);
const credit = (await robin.locator('#sheet .card-credit-picture').textContent().catch(() => '')) ?? '';
check('its detail credits the picture', /Gabriel Quart/.test(credit) && /CC BY 4.0/.test(credit), credit);
const entry = await robin.evaluate(() => window.__wikster.state.collection.entries['special:db:ROBINFC:special:robinfc:the-laugh']);
check('the card keeps its rarity and is locked', entry?.rarityId === 'special' && entry.special === 'db:ROBINFC');
const hk = await robin.evaluate(() => window.__wikster.state.collection.entries['special:db:ROBINFC:en:Tetris']);
check('a regrade keeps the rarity Gabriel chose', await robin.evaluate(() => { window.__wikster.regrade(); return window.__wikster.state.collection.entries['special:db:ROBINFC:en:Tetris'].rarityId; }) === 'legendary' && hk?.rarityId === 'legendary');
await closeSheets(robin);

section('the booster opens to exactly its cards');
await robin.locator('.nav-item[data-tab="packs"]').click();
await robin.waitForTimeout(800);
await robin.locator('.seg-option').filter({ hasText: /Custom/ }).first().click().catch(() => 0);
await robin.waitForTimeout(900);
const tile = robin.locator('.booster[data-spec^="code|db:ROBINFC"]').first();
check('the booster waits on the custom shelf, under its name', (await tile.count()) === 1 && /Robin’s Booster/.test((await robin.locator('#screen-packs').textContent()) ?? ''));
await tile.click();
await robin.waitForTimeout(900);
await robin.evaluate(() => document.querySelector('#packs-open')?.click());
check('the opening screen is up', await until(() => robin.evaluate(() => document.querySelector('#screen-open')?.classList.contains('phase-idle')), 8000));
const opened = await robin.evaluate(async () => {
  document.querySelector('#screen-open .rip-zone').dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  const s = performance.now();
  while (performance.now() - s < 30000) {
    if (document.querySelector('#screen-open').classList.contains('phase-reveal')) break;
    await new Promise((r) => setTimeout(r, 50));
  }
  return window.__wikster.state.pulls.map((p) => ({ key: p.article.key, rarityId: p.rarity?.id ?? p.rarityId }));
});
check('it deals the three cards in order', opened.map((c) => c.key).join() === 'special:db:ROBINFC:en:Ada_Lovelace,special:db:ROBINFC:en:Alan_Turing,special:db:ROBINFC:en:Concorde', JSON.stringify(opened));
check('with their rarities', opened.map((c) => c.rarityId).join() === 'epic,rare,common', opened.map((c) => c.rarityId).join());
await robin.evaluate(() => document.querySelector('#open-skip')?.click());
await robin.waitForTimeout(300);
await robin.evaluate(() => document.querySelector('#open-done')?.click());
await robin.waitForTimeout(600);
check('the server agrees: the booster is gone and the cards are in', await until(() => !econDb.users.get(ROBIN).inventory.size
  && econDb.users.get(ROBIN).cards.has('special:db:ROBINFC:en:Concorde'), 15000));

section('the theme is in his list and goes out with his profile');
await drawer(robin, 'customize').catch(async () => { await robin.evaluate(() => window.__wikster.setTheme('fc-robinfc')); });
const card = robin.locator('.theme-card[data-theme="fc-robinfc"]');
check('the theme list shows his theme, worn', await until(() => card.count().then((n) => n === 1), 4000) && /Robin Green/.test(await card.textContent()) && await card.evaluate((n) => n.classList.contains('is-on')));
await robin.evaluate(() => window.__wikster.setTheme('paper'));
await robin.waitForTimeout(300);
await card.click().catch(async () => { await robin.evaluate(() => window.__wikster.setTheme('fc-robinfc')); });
check('he can put it back on after another', await until(() => robin.evaluate(() => localStorage.getItem('wikster.theme') === 'fc-robinfc'
  && document.documentElement.style.getPropertyValue('--accent').trim() === '#22c55e')));
await flush(robin);
await flush(robin);
const look = db.profiles.get(ROBIN)?.appearance;
check('his look is published with the theme Gabriel made', look?.theme === 'fc-robinfc' && look.friend?.base === 'rire' && look.friend.accent === GREEN, JSON.stringify(look));
const shelf = db.profiles.get(ROBIN)?.badges;
check('his badge goes out with its look', shelf?.earned?.some((b) => b.id === 'fc-robinfc' && b.look?.emblem === 'laugh' && b.look.color === GREEN)
  && shelf.worn?.includes('fc-robinfc'), JSON.stringify(shelf?.earned?.filter((b) => b.id.startsWith('fc-'))));

section('a friend sees them');
const viewer = await player(VIEW);
await drawer(viewer, 'friends');
await until(() => viewer.locator('#friends-list .person').count().then((n) => n >= 1));
await viewer.locator('#friends-list .person', { hasText: 'robin_s' }).click();
await until(() => viewer.locator('#screen-friend').isVisible());
await viewer.waitForTimeout(1200);
const seen = await viewer.evaluate(() => {
  const screen = document.getElementById('screen-friend');
  return { worn: screen.dataset.worn, theme: screen.dataset.theme, accent: getComputedStyle(screen).getPropertyValue('--accent').trim(),
    root: document.documentElement.dataset.theme, badges: [...document.querySelectorAll('#friend-badges svg')].map((s) => s.outerHTML).join('') };
});
check('his profile wears his theme for the viewer', seen.worn === 'fc-robinfc' && seen.theme === 'rire' && seen.accent === GREEN, JSON.stringify({ ...seen, badges: seen.badges.length }));
check('while the viewer keeps their own', seen.root === 'paper');
check('his badge shows with its emblem and colour', /--e2:#22c55e/.test(seen.badges));
const names = await viewer.evaluate(() => document.getElementById('friend-badges').textContent);
check('under its name', /Robin’s Badge/.test(names) || /Robin’s Badge/.test(await viewer.evaluate(() => [...document.querySelectorAll('#friend-badges [aria-label], #friend-badges [title]')].map((n) => n.getAttribute('aria-label') ?? n.getAttribute('title')).join('|'))), names);

section('the PC layout');
const desk = await player(ROBIN, { pc: true });
check('the PC layout wears his theme too', await until(() => desk.evaluate(() => document.documentElement.dataset.theme === 'rire'
  && document.documentElement.style.getPropertyValue('--accent').trim() === '#22c55e'), 10000));

check('no page errors', errors.length === 0, errors.join(' | '));
await browser.close();
console.log(fails ? `\n${fails} FAILURES` : '\nALL PASS');
process.exit(fails ? 1 : 0);
