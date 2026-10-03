import { chromium, devices } from 'playwright';
import { launchOptions } from '../lib/browser.mjs';
import { installStubs } from '../lib/stubs.mjs';
import { RELEASES } from '../../src/data/releases.js';

let fails = 0;
const check = (l, c, e = '') => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${e ? '  ' + e : ''}`); };
const section = (s) => console.log(`\n== ${s}`);
const BASE = process.env.BASE_URL ?? 'http://127.0.0.1:4173/';
const N = Number(process.env.TABS_CARDS) || 3000;
const ROUNDS = Number(process.env.TABS_ROUNDS) || 3;
const PAINT_MS = Number(process.env.TABS_PAINT_MS) || 100;
const TASK_MS = Number(process.env.TABS_TASK_MS) || 70;
const FIRST_MS = Number(process.env.TABS_FIRST_MS) || 600;

const TIERS = ['common', 'uncommon', 'rare', 'epic', 'legendary', 'mythic', 'exotic', 'prismatic'];
const THEMES = ['cars', 'f1', 'planes', 'video-games', 'books', 'movies', 'space', 'physics', 'nature', 'animals', 'plants', 'history', 'philosophy',
  'celebrities', 'quotes', 'art', 'cactus', 'sport', 'music', 'records', 'food', 'geography', 'technology', 'weapons', 'weird', 'memes'];
const entries = {};
for (let i = 0; i < N; i++) {
  const key = `en:Tab_${i}`;
  entries[key] = {
    key, title: `Tab card ${i}`, rarityId: TIERS[i % TIERS.length], price: 100 + (i % 400) * 13, views: 1000 + i,
    popularity: 0.6, count: 1 + (i % 7 === 0 ? 3 : 0), favorite: i % 97 === 0, packId: `theme|${THEMES[i % THEMES.length]}`,
    packName: THEMES[i % THEMES.length], lang: 'en', thumbnail: `https://upload.wikimedia.org/tabs/${i}.png`,
    firstPulledAt: i, lastPulledAt: 1e12 + i, description: 'A thing', extract: 'Some words about it, long enough to be read.'
  };
}
const inventory = {};
THEMES.forEach((id, i) => { inventory[`theme|${id}|std|5`] = { spec: { kind: 'theme', themeId: id, rarityId: null, cards: 5 }, count: 1 + (i % 4) }; });
TIERS.slice(1).forEach((r, i) => { inventory[`rarity||${r}|5`] = { spec: { kind: 'rarity', themeId: null, rarityId: r, cards: 5 }, count: 1 + i }; });
const customPacks = ['minecraft', 'zelda', 'pokemon', 'starwars'].map((w) => ({
  id: `custom-${w}`, name: w, tagline: `${w} Wiki`, icon: 'wand', accent: '#4ade80', accent2: '#14532d',
  wiki: { apiUrl: `https://${w}.fandom.com/api.php`, sitename: `${w} Wiki` }
}));
customPacks.forEach((p, i) => {
  inventory[`custom|${p.id}|std|5`] = { spec: { kind: 'custom', themeId: null, rarityId: null, cards: 5, customName: p.name, customId: p.id, wiki: p.wiki, icon: 'wand', accent: p.accent, accent2: p.accent2 }, count: 1 + i };
});

const browser = await chromium.launch(launchOptions());
const errors = [];

async function open(pc) {
  const ctx = await browser.newContext(pc
    ? { serviceWorkers: 'block', viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 }
    : { serviceWorkers: 'block', ...devices['Pixel 7'] });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(e.message));
  installStubs(page);
  await page.addInitScript(({ entries, inventory, customPacks, seen, pc }) => {
    if (localStorage.getItem('tabs.seeded')) return;
    localStorage.setItem('tabs.seeded', '1');
    localStorage.setItem('wikster.language', 'en');
    localStorage.setItem('wikster.layout.v1', pc ? 'pc' : 'mobile');
    const now = Date.now();
    localStorage.setItem('wikster.profile.v1', JSON.stringify({
      started: true, createdAt: now - 86400000 * 40, playMs: 7200000, boostersOpened: 600,
      rarityCounts: { common: 900 }, progress: { level: 30, xp: 20 }, pendingLevels: [],
      daily: { v: 2, day: 3, weeks: 2, lastDay: Math.floor(now / 86400000), shownDay: Math.floor(now / 86400000) },
      timed: { count: 3, stamp: now, last: now, opened: 40 }, freeTaken: { window: 0, ids: [] },
      settings: { hints: false }
    }));
    localStorage.setItem('wikster.wallet.v1', '100000');
    localStorage.setItem('wikster.collection.v3', JSON.stringify({ entries }));
    localStorage.setItem('wikster.inventory.v1', JSON.stringify(inventory));
    localStorage.setItem('wikster.customPacks.v2', JSON.stringify(customPacks));
    localStorage.setItem('wikster.seenRelease.v1', seen);
  }, { entries, inventory, customPacks, seen: RELEASES.at(-1).id, pc });
  await page.addInitScript(() => {
    window.__inp = [];
    try {
      new PerformanceObserver((list) => {
        for (const e of list.getEntries()) if (e.interactionId) window.__inp.push(e.duration);
      }).observe({ type: 'event', durationThreshold: 16, buffered: true });
    } catch {}
  });
  const cdp = await ctx.newCDPSession(page);
  await page.goto(BASE, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(3000);
  for (let i = 0; i < 6; i++) {
    if (!(await page.locator('#sheet').isVisible().catch(() => false))) break;
    await page.keyboard.press('Escape');
    await page.waitForTimeout(400);
  }
  await page.waitForTimeout(1200);
  return { page, cdp };
}

function cpuOf(raw) {
  const events = raw.traceEvents ?? raw;
  const names = {};
  for (const e of events) if (e.ph === 'M' && e.name === 'thread_name') names[`${e.pid}:${e.tid}`] = e.args.name;
  const main = new Set(Object.entries(names).filter(([, n]) => n === 'CrRendererMain').map(([k]) => k));
  const on = events.filter((e) => main.has(`${e.pid}:${e.tid}`));
  const tasks = on.filter((e) => e.ph === 'X' && e.name === 'RunTask').sort((a, b) => a.ts - b.ts);
  const input = on.find((e) => e.name === 'EventDispatch' && e.args?.data?.type === 'pointerdown');
  if (!input) return null;
  const cpu = (t) => (t.tdur ?? t.dur ?? 0) / 1000;
  const first = tasks.find((t) => t.ts <= input.ts && t.ts + t.dur >= input.ts) ?? tasks.find((t) => t.ts >= input.ts);
  const click = on.find((e) => e.name === 'EventDispatch' && e.args?.data?.type === 'click');
  const after = click ?? input;
  const commit = on.find((e) => e.ts > after.ts && e.name === 'Commit');
  let toPaint = 0;
  for (const t of tasks) if (first && t.ts >= first.ts && t.ts <= (commit?.ts ?? after.ts)) toPaint += cpu(t);
  const later = tasks.filter((t) => first && t.ts >= first.ts);
  return { toPaint, longest: Math.max(0, ...later.map(cpu)) };
}

async function sw(page, cdp, selector) {
  const target = page.locator(selector).first();
  if (!(await target.count())) return null;
  const box = await target.boundingBox();
  if (!box) return null;
  await page.evaluate(() => { window.__inp.length = 0; });
  await cdp.send('Tracing.start', { categories: 'devtools.timeline,disabled-by-default-devtools.timeline', transferMode: 'ReturnAsStream' });
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await page.waitForTimeout(700);
  const done = new Promise((resolve) => cdp.once('Tracing.tracingComplete', resolve));
  await cdp.send('Tracing.end');
  const { stream } = await done;
  let data = '';
  for (;;) { const c = await cdp.send('IO.read', { handle: stream }); data += c.data; if (c.eof) break; }
  await cdp.send('IO.close', { handle: stream }).catch(() => {});
  const cpu = cpuOf(JSON.parse(data));
  const wall = await page.evaluate(() => Math.max(0, ...window.__inp));
  await page.waitForTimeout(300);
  return cpu && { ...cpu, wall };
}

async function tour(label, page, cdp, steps) {
  const runs = new Map();
  for (let round = 0; round < ROUNDS; round++) {
    for (const [name, selector] of steps) {
      const m = await sw(page, cdp, selector);
      if (!m) continue;
      if (!runs.has(name)) runs.set(name, []);
      runs.get(name).push(m);
    }
  }
  const r = (n) => String(Math.round(n)).padStart(4);
  for (const [name, list] of runs) {
    const [first, ...again] = list;
    const best = again.length ? {
      toPaint: Math.min(...again.map((m) => m.toPaint)),
      longest: Math.min(...again.map((m) => m.longest)),
      wall: Math.min(...again.map((m) => m.wall))
    } : null;
    console.log(`      ${label} ${name.padEnd(22)} first: paint ${r(first.toPaint)} task ${r(first.longest)} wall ${r(first.wall)}`
      + (best ? `   again (best of ${again.length}): paint ${r(best.toPaint)} task ${r(best.longest)} wall ${r(best.wall)}` : ''));
    check(`${label} ${name}: the first visit paints within ${FIRST_MS} ms of CPU`, first.toPaint < FIRST_MS && first.longest < FIRST_MS,
      `${Math.round(first.toPaint)} / ${Math.round(first.longest)} ms`);
    if (best) {
      check(`${label} ${name}: coming back paints within ${PAINT_MS} ms`, best.toPaint < PAINT_MS, `${Math.round(best.toPaint)} ms`);
      check(`${label} ${name}: coming back has no task over ${TASK_MS} ms`, best.longest < TASK_MS, `${Math.round(best.longest)} ms`);
    }
  }
}

const tab = (dest) => [dest, `.pc-tab[data-dest="${dest}"]`];
const sub = (dest, screen) => [`${dest}/${screen}`, `.pc-subtab[data-screen="${screen}"]`];

section(`PC tabs with ${N} cards at 1920x1080`);
{
  const { page, cdp } = await open(true);
  await tour('pc', page, cdp, [
    tab('boosters'), sub('boosters', 'custom'), sub('boosters', 'timed'),
    tab('home'),
    tab('collection'), sub('collection', 'albums'), sub('collection', 'classic'), sub('collection', 'selling'), sub('collection', 'glossary'),
    tab('home'),
    tab('shop'), sub('shop', 'atelier'), sub('shop', 'market'),
    tab('play'), sub('play', 'quests'), sub('play', 'season'), sub('play', 'leaderboard'),
    tab('social'),
    tab('home')
  ]);
  await page.context().close();
}

section(`phone tabs with ${N} cards on a Pixel 7`);
{
  const { page, cdp } = await open(false);
  await tour('phone', page, cdp, ['shop', 'timed', 'binder', 'profile', 'packs'].map((id) => [id, `.nav-item[data-tab="${id}"]`]));
  await page.context().close();
}

section('errors');
check('no page errors', errors.length === 0, errors.slice(0, 3).join(' | '));
await browser.close();
console.log(fails ? `\n${fails} check(s) failed` : '\nall tab checks passed');
process.exit(fails ? 1 : 0);
