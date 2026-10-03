import { chromium, devices } from 'playwright';
import { launchOptions } from '../lib/browser.mjs';
import { installStubs } from '../lib/stubs.mjs';
import { RELEASES } from '../../src/data/releases.js';

let fails = 0;
const check = (l, c, e = '') => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${e ? '  ' + e : ''}`); };
const section = (s) => console.log(`\n== ${s}`);
const BASE = process.env.BASE_URL ?? 'http://127.0.0.1:4173/';
const PX = 'data:image/gif;base64,R0lGODlhAQABAAAAACw=';
const browser = await chromium.launch(launchOptions());
const errors = [];

const card = (key, title, rarityId, price, pack, extra = {}) => ({
  key, title, rarityId, price, views: 400000, popularity: 0.7, count: 1, favorite: false,
  packId: `theme|${pack}`, packName: pack, lang: 'en', thumbnail: PX, firstPulledAt: 1, lastPulledAt: 1,
  description: 'A thing', extract: 'Some words about it.', ...extra
});
const entries = {};
for (let i = 0; i < 40; i++) entries[`en:Common_${i}`] = card(`en:Common_${i}`, `Common card ${String(i).padStart(2, '0')}`, 'common', 100, 'animals', { count: i % 4 === 0 ? 3 : 1, favorite: i === 7 || i === 8 });
entries['en:Bee'] = card('en:Bee', 'Bee', 'rare', 400, 'animals', { count: 3, prints: { rare: 1, common: 2 } });
entries['en:Cow'] = card('en:Cow', 'Cow', 'epic', 900, 'animals', { count: 4 });
entries['en:Zebra'] = card('en:Zebra', 'Zebra', 'legendary', 3000, 'animals', { favorite: true });
entries['en:Moon'] = card('en:Moon', 'Moon', 'mythic', 5000, 'space', { count: 2, lastPulledAt: Date.now() });
const wiki = { apiUrl: 'https://tiny.example.org/api.php', sitename: 'Tiny' };
for (let i = 0; i < 3; i++) entries[`tiny:${i}`] = card(`tiny:${i}`, `Tiny ${i}`, 'uncommon', 200, 'x', { packId: 'custom|tiny.example.org', packName: 'Tiny', count: i === 0 ? 2 : 1 });

async function open({ pc = false, simple = false } = {}) {
  const ctx = await browser.newContext(pc
    ? { serviceWorkers: 'block', viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 }
    : { serviceWorkers: 'block', ...devices['Pixel 7'] });
  const p = await ctx.newPage();
  p.on('pageerror', (e) => errors.push(e.message));
  installStubs(p);
  await p.addInitScript(({ entries, seen, pc, wiki, simple }) => {
    if (localStorage.getItem('col.seeded')) return;
    localStorage.setItem('col.seeded', '1');
    localStorage.setItem('wikster.language', 'en');
    if (pc) localStorage.setItem('wikster.layout.v1', 'pc');
    if (simple) localStorage.setItem('wikster.binderSimple.v1', '1');
    const now = Date.now();
    localStorage.setItem('wikster.profile.v1', JSON.stringify({
      started: true, createdAt: now - 86400000 * 40, playMs: 7200000, boostersOpened: 40,
      rarityCounts: { common: 40 }, progress: { level: 12, xp: 20 }, pendingLevels: [],
      daily: { v: 2, day: 3, weeks: 2, lastDay: Math.floor(now / 86400000), shownDay: Math.floor(now / 86400000) },
      timed: { count: 0, stamp: now, last: now, opened: 4 }, freeTaken: { window: 0, ids: [] }, settings: { hints: false },
      albumTiers: { 'custom:tiny-example-org': 5 }
    }));
    localStorage.setItem('wikster.wallet.v1', '1000');
    localStorage.setItem('wikster.collection.v3', JSON.stringify({ entries }));
    localStorage.setItem('wikster.customPacks.v2', JSON.stringify([{ id: 'custom-tiny', name: 'Tiny', icon: 'wand', accent: '#4ade80', accent2: '#14532d', wiki }]));
    localStorage.setItem('wikster.albumTotals.v1', JSON.stringify({ 'en|custom:tiny-example-org': { total: 3, at: now } }));
    localStorage.setItem('wikster.seenRelease.v1', seen);
  }, { entries, seen: RELEASES.at(-1).id, pc, wiki, simple });
  await p.goto(BASE, { waitUntil: 'domcontentloaded' });
  await p.waitForTimeout(2500);
  for (let i = 0; i < 6; i++) {
    if (!(await p.locator('#sheet').isVisible().catch(() => false))) break;
    await p.keyboard.press('Escape');
    await p.waitForTimeout(400);
  }
  return p;
}

const saved = (p) => p.evaluate(() => JSON.parse(localStorage.getItem('wikster.collection.v3')).entries);
const wallet = (p) => p.evaluate(() => Number(localStorage.getItem('wikster.wallet.v1')));

section('phone: the album shelf shows totals and the Complete Edition');
const p = await open();
await p.locator('.nav-item[data-tab="binder"]').click();
await p.waitForTimeout(800);
const tiny = p.locator('.album-cover', { hasText: 'Tiny' });
check('a complete custom album shows its count and total', /3\s*\/\s*3/.test(await tiny.locator('.album-cover-count').textContent()), await tiny.locator('.album-cover-count').textContent());
check('and wears the Complete Edition medal', await tiny.locator('.album-cover-medal[data-tier="complete"]').count() === 1);
check('with every tier dot lit', await tiny.locator('.album-cover-medals i.is-on').count() === 5);
await tiny.click();
await p.waitForTimeout(700);
check('the open album says Complete Edition', /Complete Edition/.test(await p.locator('#album-progress').textContent()));
check('with a progress bar', await p.locator('#album-progress .album-progress-bar').count() === 1);
await p.evaluate(() => document.querySelector('#album-back').click());
await p.waitForTimeout(600);

section('phone: all cards, favourites first');
await p.locator('#binder-seg .seg-option[data-value="all"]').click();
await p.waitForTimeout(800);
const titles = await p.evaluate(() => [...document.querySelectorAll('#classic-view .card .card-title')].slice(0, 6).map((n) => n.textContent));
check('favourites come first', titles[0] === 'Zebra' && titles[1] === 'Common card 07' && titles[2] === 'Common card 08', titles.join(' | '));
check('then by rarity', titles[3] === 'Moon' && titles[4] === 'Cow', titles.join(' | '));
check('no album headings in this view', await p.locator('#classic-view .classic-group').count() === 0);

section('phone: multi-select');
await p.locator('#classic-pick').click();
await p.waitForTimeout(300);
check('Select turns on selection mode', await p.locator('#classic-view.is-picking').count() === 1 && await p.locator('.pick-bar:not([hidden])').count() === 1);
await p.evaluate(() => document.querySelector('#classic-view [data-key="en:Cow"]').click());
await p.evaluate(() => document.querySelector('#classic-view [data-key="en:Bee"]').click());
await p.waitForTimeout(200);
check('a tap picks a card instead of opening it', !(await p.locator('#sheet').isVisible()) && /2 selected/.test(await p.locator('.pick-count').textContent()));
await p.screenshot({ path: 'collection-pick.png' });
check('fusing is offered when spares allow it', await p.locator('.pick-act[data-act="fuse"]').count() === 1);
await p.locator('.pick-chip', { hasText: 'All' }).click();
await p.waitForTimeout(200);
const shownN = Number((await p.locator('#classic-count').textContent()).match(/\d+/)[0]);
check('All picks every card shown', new RegExp(`^${shownN} selected`).test(await p.locator('.pick-count').textContent()), `${await p.locator('.pick-count').textContent()} of ${shownN}`);
await p.locator('.pick-chip', { hasText: 'Invert' }).click();
await p.waitForTimeout(200);
check('Invert empties a full selection', /^0 selected/.test(await p.locator('.pick-count').textContent()));
await p.evaluate(() => { for (const k of ['en:Common_1', 'en:Common_2']) document.querySelector(`#classic-view [data-key="${k}"]`).click(); });
await p.waitForTimeout(200);
await p.locator('.pick-act[data-act="fav"]').click();
await p.waitForTimeout(500);
let col = await saved(p);
check('a batch favourite marks every picked card', col['en:Common_1'].favorite && col['en:Common_2'].favorite);
await p.locator('.pick-chip', { hasText: 'None' }).click();
await p.evaluate(() => { for (const k of ['en:Bee', 'en:Common_0']) document.querySelector(`#classic-view [data-key="${k}"]`).click(); });
await p.waitForTimeout(200);
const before = await wallet(p);
await p.locator('.pick-act[data-act="sell"]').click();
await p.waitForTimeout(500);
check('selling asks first, spares or everything', await p.locator('#sheet [data-act="spares"]').isVisible() && await p.locator('#sheet [data-act="all"]').isVisible());
await p.locator('#sheet [data-act="spares"]').click();
await p.waitForTimeout(900);
col = await saved(p);
check('spares go, the best print stays', col['en:Bee'].count === 1 && col['en:Bee'].rarityId === 'rare' && col['en:Common_0'].count === 1);
check('and the coins came in one go', (await wallet(p)) > before, `${before} -> ${await wallet(p)}`);
check('selection mode ends after a sale', await p.locator('#classic-view.is-picking').count() === 0);

section('phone: long press starts a selection');
await p.locator('#classic-view [data-key="en:Common_3"]').scrollIntoViewIfNeeded();
await p.waitForTimeout(300);
const target = await p.locator('#classic-view [data-key="en:Common_3"]').boundingBox();
await p.mouse.move(target.x + target.width / 2, target.y + target.height / 2);
await p.mouse.down();
await p.waitForTimeout(700);
await p.mouse.up();
await p.waitForTimeout(300);
check('holding a card picks it', await p.locator('#classic-view.is-picking').count() === 1 && /1 selected/.test(await p.locator('.pick-count').textContent()));
check('without opening its sheet', !(await p.locator('#sheet').isVisible()));
await p.locator('.pick-close').click();
await p.waitForTimeout(300);

section('phone: Simple mode');
await p.locator('#binder-simple').click();
await p.waitForTimeout(700);
await p.evaluate(() => document.getElementById('app').scrollTo(0, 0));
await p.screenshot({ path: 'collection-simple.png' });
check('Simple shows big plain cards', await p.locator('#classic-view .simple-card').count() > 10 && await p.locator('#classic-view .card').count() === 0);
check('plain labels on top', /Your cards?/.test(await p.locator('#binder-stats').textContent()) && /Spares?/.test(await p.locator('#binder-stats').textContent()) && /Complete albums?/.test(await p.locator('#binder-stats').textContent()));
check('one row: search, sort and rarity', await p.locator('#classic-sort').isVisible() && await p.locator('#classic-rarity').isVisible() && !(await p.locator('#classic-filter').isVisible()));
check('albums as progress bars', await p.locator('.simple-album').count() >= 2 && /\d+ \/ /.test(await p.locator('.simple-album').first().textContent()));
check('remembered on this device only', await p.evaluate(() => localStorage.getItem('wikster.binderSimple.v1') === '1'));
const firstSimple = await p.locator('#classic-view .simple-card .simple-name').first().textContent();
check('favourites first there too', firstSimple === 'Zebra', firstSimple);
await p.locator('#classic-rarity').selectOption('mythic');
await p.waitForTimeout(500);
check('the rarity filter works', await p.locator('#classic-view .simple-card').count() === 1);
await p.locator('#classic-rarity').selectOption('');
await p.locator('#binder-simple').click();
await p.waitForTimeout(500);
check('turning Simple off brings the full view back', await p.locator('#classic-view .card').count() > 0);

section('phone: the Selling tab');
await p.locator('#binder-sell').click();
await p.waitForTimeout(900);
check('the Selling screen opens', await p.locator('#screen-selling.is-active').count() === 1);
check('it lists the cards', await p.locator('#screen-selling .sell-item').count() > 20);
check('favourites are locked by default', await p.locator('#screen-selling .sell-item[data-key="en:Zebra"].is-locked').count() === 1);
check('last copies too', await p.locator('#screen-selling .sell-item[data-key="en:Common_5"].is-locked').count() === 1);
await p.locator('#screen-selling .sell-chip[data-act="r-common"]').click();
await p.waitForTimeout(300);
const commons = await p.locator('body > .sell-bar:not([hidden]) .sell-total span').textContent();
await p.screenshot({ path: 'collection-sell-top.png' });
check('Commons picks only common spares', /copies from/.test(commons) && await p.locator('#screen-selling .sell-item.is-picked[data-key="en:Cow"]').count() === 0, commons);
check('quick picks are grouped in tabs', await p.locator('#screen-selling .sell-tab').count() === 5 && await p.locator('#screen-selling .sell-tab.is-on[data-group="rarity"]').count() === 1);
check('an applied pick shows as active and removable', await p.locator('#screen-selling .sell-chip.is-on[data-act="r-common"]').count() === 1 && await p.locator('#screen-selling .sell-tag[data-remove="r-common"]').count() === 1);
await p.locator('#screen-selling .sell-tab[data-group="recent"]').click();
await p.locator('#screen-selling .sell-chip[data-act="today"]').click();
await p.waitForTimeout(300);
check('quick picks stack: pulled today adds the Moon spare', await p.locator('#screen-selling .sell-item.is-picked[data-key="en:Moon"]').count() === 1);
await p.locator('#screen-selling .sell-tag[data-remove="today"]').click();
await p.waitForTimeout(300);
check('removing a pick takes its cards back out', await p.locator('#screen-selling .sell-item.is-picked[data-key="en:Moon"]').count() === 0 && await p.locator('#screen-selling .sell-item.is-picked').count() > 0);
await p.locator('#screen-selling .sell-search').fill('zzzz nothing');
await p.waitForTimeout(500);
check('an empty state when nothing matches', await p.locator('#screen-selling .sell-empty').isVisible() && await p.locator('#screen-selling .sell-reset').isVisible());
await p.locator('#screen-selling .sell-reset').click();
await p.waitForTimeout(300);
await p.locator('#screen-selling .sell-chip[data-act="none"]').click();
await p.locator('#screen-selling .sell-chip[data-act="keep0"]').click();
await p.waitForTimeout(300);
check('selling last copies is an explicit choice', await p.locator('#screen-selling .sell-item[data-key="en:Common_5"].is-locked').count() === 0);
await p.locator('#screen-selling .sell-tab[data-group="albums"]').click();
await p.locator('#screen-selling .sell-chip[data-act="edition"]').click();
await p.waitForTimeout(300);
check('nothing extra for Complete Edition spares beyond what is there', await p.locator('#screen-selling .sell-item.is-picked').count() >= 1);
await p.locator('#screen-selling .sell-chip[data-act="none"]').click();
await p.evaluate(() => document.querySelector('#screen-selling .sell-item[data-key="tiny:1"]').click());
await p.waitForTimeout(300);
const coinsBefore = await wallet(p);
await p.locator('body > .sell-bar:not([hidden]) .sell-go').click();
await p.waitForTimeout(600);
check('the summary warns before breaking a Complete Edition', /complete album/i.test(await p.locator('#sheet').textContent()));
await p.locator('#sheet .sell-confirm-go').click();
await p.waitForTimeout(900);
col = await saved(p);
check('the sale went through', !col['tiny:1'] && (await wallet(p)) > coinsBefore);
await p.locator('#screen-selling .sell-chip[data-act="keep1"]').click();
await p.locator('#screen-selling .sell-tab[data-group="spares"]').click();
await p.locator('#screen-selling .sell-chip[data-act="spares"]').click();
await p.waitForTimeout(300);
const plan = await p.locator('body > .sell-bar:not([hidden]) .sell-total span').textContent();
await p.locator('body > .sell-bar:not([hidden]) .sell-go').click();
await p.waitForTimeout(500);
await p.locator('#sheet .sell-confirm-go').click();
await p.waitForTimeout(900);
col = await saved(p);
check('all spares sold in one sale, one copy of each kept', Object.values(col).every((e) => e.count === 1 || e.favorite), plan);
check('favourites kept their spares', col['en:Common_8'].count === 3);
check('a summary line says what was sold', await p.locator('#screen-selling .sell-done').count() === 1);
await p.screenshot({ path: 'collection-selling.png' });

section('pc: classic and selling tabs');
const d = await open({ pc: true });
await d.keyboard.press('3');
await d.waitForTimeout(900);
check('the collection section has Classic and Selling tabs', await d.locator('.pc-subtab[data-screen="classic"]').count() === 1 && await d.locator('.pc-subtab[data-screen="selling"]').count() === 1);
await d.locator('.pc-subtab[data-screen="classic"]').click();
await d.waitForTimeout(900);
check('Classic shows the grid by album', await d.locator('.pccl .classic-group').count() >= 2 && await d.locator('.pccl .card').count() > 10);
await d.screenshot({ path: 'collection-pc-classic.png' });
await d.locator('.pccl .pcx-seg-item[data-value="all"]').click();
await d.waitForTimeout(600);
const pcFirst = await d.evaluate(() => document.querySelector('.pccl .card .card-title')?.textContent);
check('All cards puts favourites first on PC too', pcFirst === 'Zebra', pcFirst);
await d.keyboard.press('ArrowRight');
await d.keyboard.press('ArrowRight');
await d.waitForTimeout(200);
check('the arrow keys move between cards', await d.evaluate(() => document.activeElement?.closest?.('.pccl [data-key]') != null));
await d.keyboard.press('x');
await d.waitForTimeout(200);
await d.keyboard.press('Enter');
await d.waitForTimeout(300);
check('X then Enter picks the focused card', /1 selected/.test(await d.locator('.pccl .pick-count').textContent()));
await d.keyboard.press('Escape');
await d.waitForTimeout(300);
check('Esc leaves selection mode', await d.locator('.pccl .pick-bar:not([hidden])').count() === 0);
await d.locator('.pc-subtab[data-screen="selling"]').click();
await d.waitForTimeout(900);
check('Selling opens as a PC screen', await d.locator('.pcsell .sell-item').count() > 10 && await d.locator('.pcsell .sell-bar').isVisible());
const noBars = await d.evaluate(() => [...document.querySelectorAll('#pc *')].every((n) => {
  const st = getComputedStyle(n);
  if (!/(auto|scroll)/.test(st.overflowY + st.overflowX)) return true;
  return n.offsetWidth - n.clientWidth - parseFloat(st.borderLeftWidth) - parseFloat(st.borderRightWidth) <= 0.5;
}));
check('no scrollbar is drawn', noBars);
await d.screenshot({ path: 'collection-pc-selling.png' });

section('errors');
check('no page errors', errors.length === 0, errors.slice(0, 3).join(' | '));
await browser.close();
console.log(fails ? `\n${fails} FAILURES` : '\nALL PASS');
process.exit(fails ? 1 : 0);
