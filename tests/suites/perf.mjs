import { chromium, devices } from 'playwright';
import { launchOptions } from '../lib/browser.mjs';
import { installStubs } from '../lib/stubs.mjs';
import { RELEASES } from '../../src/data/releases.js';

let fails = 0;
const check = (l, c, e = '') => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${e ? '  ' + e : ''}`); };
const section = (s) => console.log(`\n== ${s}`);
const BASE = process.env.BASE_URL ?? 'http://127.0.0.1:4173/';
const N = Number(process.env.PERF_CARDS) || 3000;
const SWITCH_MS = Number(process.env.PERF_SWITCH_MS) || 600;
const PC_SWITCH_MS = Number(process.env.PERF_PC_SWITCH_MS) || 900;

const TIERS = ['common', 'uncommon', 'rare', 'epic', 'legendary', 'mythic', 'exotic', 'prismatic'];
const PACKS = ['animals', 'space', 'history', 'art', 'food', 'music', 'cars', 'planes', 'sports', 'science'];
const entries = {};
for (let i = 0; i < N; i++) {
  const key = `en:Perf_${i}`;
  entries[key] = {
    key, title: `Perf card ${i}`, rarityId: TIERS[i % TIERS.length], price: 100 + (i % 400) * 13, views: 1000 + i,
    popularity: 0.6, count: 1 + (i % 7 === 0 ? 3 : 0), favorite: i % 97 === 0, packId: `theme|${PACKS[i % PACKS.length]}`,
    packName: PACKS[i % PACKS.length], lang: 'en', thumbnail: `https://upload.wikimedia.org/perf/${i}.png`,
    firstPulledAt: i, lastPulledAt: 1e12 + i, description: 'A thing', extract: 'Some words about it, long enough to be read.'
  };
}

const browser = await chromium.launch(launchOptions());
const errors = [];

async function open({ view = 'classic', pc = false } = {}) {
  const ctx = await browser.newContext(pc
    ? { serviceWorkers: 'block', viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 }
    : { serviceWorkers: 'block', ...devices['Pixel 7'] });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(e.message));
  const pictures = new Set();
  page.on('request', (r) => { if (/upload\.wikimedia\.org\/perf\//.test(r.url())) pictures.add(r.url()); });
  installStubs(page);
  await page.addInitScript(({ entries, seen, view, pc }) => {
    if (localStorage.getItem('perf.seeded')) return;
    localStorage.setItem('perf.seeded', '1');
    localStorage.setItem('wikster.language', 'en');
    if (pc) localStorage.setItem('wikster.layout.v1', 'pc');
    const now = Date.now();
    localStorage.setItem('wikster.profile.v1', JSON.stringify({
      started: true, createdAt: now - 86400000 * 40, playMs: 7200000, boostersOpened: 600,
      rarityCounts: { common: 900 }, progress: { level: 30, xp: 20 }, pendingLevels: [],
      daily: { v: 2, day: 3, weeks: 2, lastDay: Math.floor(now / 86400000), shownDay: Math.floor(now / 86400000) },
      timed: { count: 0, stamp: now, last: now, opened: 4 }, freeTaken: { window: 0, ids: [] },
      settings: { hints: false }
    }));
    localStorage.setItem('wikster.wallet.v1', '1000');
    localStorage.setItem('wikster.collection.v3', JSON.stringify({ entries }));
    localStorage.setItem('wikster.binderView.v1', view);
    localStorage.setItem('wikster.seenRelease.v1', seen);
  }, { entries, seen: RELEASES.at(-1).id, view, pc });
  await page.goto(BASE, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2500);
  for (let i = 0; i < 6; i++) {
    if (!(await page.locator('#sheet').isVisible().catch(() => false))) break;
    await page.keyboard.press('Escape');
    await page.waitForTimeout(400);
  }
  return { page, pictures };
}

const settle = (page) => page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(r, 0)))));

section(`startup with ${N} cards does not build the binder`);
const { page, pictures } = await open();
await page.waitForTimeout(800);
const boot = await page.evaluate(() => ({
  nodes: document.getElementsByTagName('*').length,
  binderCards: document.querySelectorAll('#screen-binder .card').length,
  tab: window.__wikster?.state?.tab ?? null
}));
console.log(`      startup: ${boot.nodes} nodes, ${boot.binderCards} binder cards, ${pictures.size} card pictures asked`);
check('no binder card is built while another tab is open', boot.binderCards === 0, String(boot.binderCards));
check('the page stays small at startup', boot.nodes < 20000, String(boot.nodes));
check('card pictures are not all fetched at startup', pictures.size < 100, String(pictures.size));

section('switching to the collection is quick');
let builtAtSwitch = 0;
const timeSwitch = (tab) => page.evaluate((tab) => new Promise((resolve) => {
  const t0 = performance.now();
  document.querySelector(`.nav-item[data-tab="${tab}"]`).click();
  const built = document.querySelectorAll('#classic-view .card').length;
  requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(() => resolve({ ms: performance.now() - t0, built }), 0)));
}), tab).then(({ ms, built }) => { builtAtSwitch = built; return ms; });
let first = await timeSwitch('binder');
await settle(page);
let cardsShown = builtAtSwitch;
if (first >= SWITCH_MS) {
  console.log(`      a busy machine? the cold switch took ${Math.round(first)} ms, trying a fresh load once more`);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(3000);
  first = Math.min(first, await timeSwitch('binder'));
  await settle(page);
  cardsShown = builtAtSwitch;
}
await page.waitForTimeout(600);
const again = [];
for (let i = 0; i < 3; i++) {
  await timeSwitch('packs');
  await page.waitForTimeout(400);
  again.push(await timeSwitch('binder'));
  await page.waitForTimeout(400);
}
const median = [...again].sort((a, b) => a - b)[1];
console.log(`      tab switch: first ${Math.round(first)} ms, then ${again.map(Math.round).join(' / ')} ms, ${cardsShown} cards built at first`);
check(`the first switch takes under ${SWITCH_MS} ms`, first < SWITCH_MS, `${Math.round(first)} ms`);
check(`switching back takes under ${SWITCH_MS} ms`, median < SWITCH_MS, `${Math.round(median)} ms`);
check('only a first chunk of cards is built', cardsShown > 0 && cardsShown <= 60, String(cardsShown));
await page.waitForTimeout(1500);
const settled = await page.locator('#classic-view .card').count();
check('idle time fills a few hundred more, not thousands', settled >= cardsShown && settled <= 400, String(settled));
const nodes = await page.evaluate(() => document.getElementsByTagName('*').length);
check('the DOM stays far from a hundred thousand nodes', nodes < 40000, String(nodes));
check('only nearby card pictures load', pictures.size < 300, String(pictures.size));

section('more cards come in while scrolling');
for (let i = 0; i < 6; i++) {
  await page.evaluate(() => { const box = document.getElementById('app'); box.scrollTop = box.scrollHeight; window.scrollTo(0, document.body.scrollHeight); });
  await page.waitForTimeout(300);
}
const after = await page.locator('#classic-view .card').count();
check('scrolling down builds more cards', after > cardsShown, `${cardsShown} -> ${after}`);

section('searching does not rebuild on every key');
const typed = await page.evaluate(() => new Promise((resolve) => {
  const input = document.getElementById('classic-search');
  const t0 = performance.now();
  for (const ch of 'Perf card 12') {
    input.value += ch;
    input.dispatchEvent(new Event('input', { bubbles: true }));
  }
  resolve(performance.now() - t0);
}));
await page.waitForTimeout(500);
const found = await page.locator('#classic-view .card').count();
console.log(`      12 keystrokes handled in ${Math.round(typed)} ms`);
check('typing a search stays fast', typed < 150, `${Math.round(typed)} ms`);
check('the search still filters after the pause', found > 0 && found < 200, String(found));

section('the PC collection with the same cards');
const pc = await open({ pc: true });
await pc.page.keyboard.press('3');
await pc.page.waitForTimeout(900);
const pcTime = (screen) => pc.page.evaluate((screen) => new Promise((resolve) => {
  const tab = [...document.querySelectorAll('.pc-subtab')].find((b) => b.dataset.screen === screen);
  if (!tab) { resolve(-1); return; }
  const t0 = performance.now();
  tab.click();
  requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(() => resolve(performance.now() - t0), 0)));
}), screen);
const pcTimes = [];
for (let i = 0; i < 3; i++) {
  pcTimes.push(await pcTime('classic'));
  await pc.page.waitForTimeout(500);
  await pcTime('albums');
  await pc.page.waitForTimeout(400);
}
const pcSwitch = Math.min(...pcTimes);
console.log(`      PC classic opens in ${pcTimes.map(Math.round).join(' / ')} ms`);
check(`the PC classic view at 1920x1080 opens under ${PC_SWITCH_MS} ms, best of three`, pcSwitch >= 0 && pcSwitch < PC_SWITCH_MS, `${Math.round(pcSwitch)} ms`);

section('opening boosters again and again leaves nothing behind');
{
  const SPEC = { kind: 'theme', themeId: 'animals', rarityId: null, cards: 5 };
  const ctx = await browser.newContext({ serviceWorkers: 'block', ...devices['Pixel 7'] });
  const p = await ctx.newPage();
  p.on('pageerror', (e) => errors.push(e.message));
  installStubs(p);
  await p.addInitScript(({ spec, seen }) => {
    if (sessionStorage.getItem('seeded')) return;
    sessionStorage.setItem('seeded', '1');
    localStorage.setItem('wikster.language', 'en');
    localStorage.setItem('wikster.seenRelease.v1', seen);
    const now = Date.now();
    localStorage.setItem('wikster.profile.v1', JSON.stringify({
      started: true, tourDone: true, createdAt: now, playMs: 0, boostersOpened: 6, rarityCounts: {}, progress: { level: 12, xp: 0 }, pendingLevels: [],
      daily: { v: 2, day: 3, weeks: 2, lastDay: Math.floor(now / 86400000), shownDay: Math.floor(now / 86400000) },
      timed: { count: 0, stamp: now }, freeTaken: { window: 0, ids: [] }, settings: { hints: false }
    }));
    localStorage.setItem('wikster.wallet.v1', '20000');
    localStorage.setItem('wikster.inventory.v1', JSON.stringify({ 'theme|animals|std|5': { spec, count: 4 } }));
  }, { spec: SPEC, seen: RELEASES.at(-1).id });
  await p.goto(BASE, { waitUntil: 'domcontentloaded' });
  await p.waitForTimeout(2500);
  const sheets = async () => {
    for (let i = 0; i < 6 && await p.locator('#sheet.is-open').count(); i++) {
      await p.keyboard.press('Escape');
      await p.waitForTimeout(300);
      if (await p.locator('#sheet.is-open.is-locked').count()) {
        await p.locator('#sheet .btn').last().click({ timeout: 2000 }).catch(() => {});
        await p.waitForTimeout(300);
      }
    }
  };
  await sheets();
  const tap = async (selector) => {
    for (let i = 0; i < 6; i++) {
      if (await p.locator(selector).click({ timeout: 3000 }).then(() => true, () => false)) return;
      await sheets();
    }
    await p.locator(selector).click({ timeout: 5000 });
  };
  const cdp = await ctx.newCDPSession(p);
  await cdp.send('HeapProfiler.enable');
  const detached = async () => {
    const chunks = [];
    const take = (e) => chunks.push(e.chunk);
    cdp.on('HeapProfiler.addHeapSnapshotChunk', take);
    await cdp.send('HeapProfiler.takeHeapSnapshot', { reportProgress: false });
    cdp.off('HeapProfiler.addHeapSnapshotChunk', take);
    const snap = JSON.parse(chunks.join(''));
    const fields = snap.snapshot.meta.node_fields;
    const name = fields.indexOf('name');
    const flag = fields.indexOf('detachedness');
    let n = 0;
    for (let i = 0; i < snap.nodes.length; i += fields.length) {
      if (snap.nodes[i + flag] !== 2) continue;
      const label = snap.strings[snap.nodes[i + name]];
      if (label.startsWith('<') || /Element$|^Text$/.test(label)) n++;
    }
    return n;
  };
  const measure = async () => {
    await cdp.send('HeapProfiler.collectGarbage');
    await cdp.send('HeapProfiler.collectGarbage');
    const counters = await cdp.send('Memory.getDOMCounters');
    return { nodes: counters.nodes, listeners: counters.jsEventListeners, documents: counters.documents, detached: await detached(), live: await p.evaluate(() => document.getElementsByTagName('*').length) };
  };
  const shelf = async () => { await p.evaluate(() => document.querySelector('.nav-item[data-tab="packs"]')?.click()); await p.waitForTimeout(400); };
  const fast = async (on) => {
    if (await p.locator('#open-fast').isVisible() && ((await p.locator('#open-fast').getAttribute('aria-checked')) === 'true') !== on) {
      await tap('#open-fast');
      await p.waitForTimeout(150);
    }
  };
  const openOnce = async ({ all = false, skip = false } = {}) => {
    await sheets();
    await tap(all ? '#packs-open-all' : '#packs-open');
    await p.waitForFunction(() => document.querySelector('#screen-open')?.classList.contains('phase-idle'), null, { timeout: 8000 });
    await fast(skip);
    await p.evaluate(() => document.querySelector('#screen-open .rip-zone').dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })));
    await p.waitForFunction(() => document.querySelector('#screen-open')?.classList.contains('phase-reveal'), null, { timeout: 30000 });
    await p.waitForTimeout(skip ? 200 : 1200);
    await tap('#open-skip');
    await p.waitForFunction(() => document.querySelector('#screen-open.phase-summary'), null, { timeout: 10000 });
    await p.waitForTimeout(400);
    await tap('#open-done');
    await p.waitForTimeout(400);
    await sheets();
    await p.evaluate((spec) => {
      const have = window.__wikster.state.inventory['theme|animals|std|5']?.count ?? 0;
      for (let i = have; i < 4; i++) window.__wikster.giveBooster(spec);
    }, SPEC);
  };
  await shelf();
  await openOnce();
  await openOnce({ skip: true });
  await openOnce({ all: true });
  await shelf();
  const before = await measure();
  const plan = [
    ...Array.from({ length: 8 }, () => ({})),
    ...Array.from({ length: 4 }, () => ({ skip: true })),
    ...Array.from({ length: 2 }, () => ({ all: true }))
  ];
  for (const step of plan) await openOnce(step);
  await shelf();
  const after = await measure();
  const per = (k) => (after[k] - before[k]) / plan.length;
  console.log(`      ${plan.length} openings: nodes ${before.nodes} -> ${after.nodes}, live elements ${before.live} -> ${after.live}, listeners ${before.listeners} -> ${after.listeners}, documents ${before.documents} -> ${after.documents}, detached ${before.detached} -> ${after.detached}`);
  check('detached DOM nodes stay flat after GC', per('detached') <= 2, `${per('detached').toFixed(1)} per opening`);
  check('DOM nodes do not pile up per opening', per('nodes') <= 40, `${per('nodes').toFixed(1)} per opening`);
  check('event listeners do not pile up per opening', per('listeners') <= 8, `${per('listeners').toFixed(1)} per opening`);
  check('no document is left behind per opening', after.documents - before.documents <= 2, `${before.documents} -> ${after.documents}`);
  await ctx.close();
}

section('errors');
check('no page errors', errors.length === 0, errors.slice(0, 3).join(' | '));
await browser.close();
console.log(fails ? `\n${fails} check(s) failed` : '\nall perf checks passed');
process.exit(fails ? 1 : 0);
