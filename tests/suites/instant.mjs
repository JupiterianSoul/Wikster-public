import { chromium, devices } from 'playwright';
import { createServer } from 'node:http';
import { launchOptions } from '../lib/browser.mjs';
import { installStubs } from '../lib/stubs.mjs';
import { economyStub, installSupabase, newDatabase, runEconomy } from '../lib/supastub.mjs';
import { createEconDb } from '../lib/econdb.mjs';
import { utcDayIndex } from '../../src/days.js';

const engine = await import('../../supabase/functions/economy/engine.js');
const BASE = process.env.BASE_URL ?? 'http://127.0.0.1:4173/';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 15000, step = 100) => {
  const end = Date.now() + ms;
  for (;;) {
    let ok = false;
    try { ok = await fn(); } catch { ok = false; }
    if (ok || Date.now() > end) return ok;
    await sleep(step);
  }
};

const failures = [];
const check = (name, ok, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  ${detail}` : ''}`);
  if (!ok) failures.push(name);
};

const ID = '00000000-0000-4000-8000-0000000000aa';
const SPEC = { kind: 'theme', themeId: 'animals', rarityId: null, cards: 5 };
const SPEC_ID = 'theme|animals|std|5';
const now = Date.now();
const day = utcDayIndex(now);
const profile = {
  started: true, createdAt: now - 86400000, playMs: 0, boostersOpened: 4, rarityCounts: {},
  progress: { level: 3, xp: 0 }, pendingLevels: [],
  daily: { v: 2, day: 1, weeks: 0, lastDay: day, shownDay: day },
  timed: { count: 0, stamp: now, last: now, opened: 0 }, freeTaken: { window: 0, ids: [] }
};
const saveData = {
  'wikster.wallet.v1': '50000',
  'wikster.ink.v1': '12',
  'wikster.inventory.v1': JSON.stringify({ [SPEC_ID]: { spec: SPEC, count: 6 } }),
  'wikster.collection.v3': JSON.stringify({ entries: {} }),
  'wikster.profile.v1': JSON.stringify(profile),
  'wikster.language': 'en'
};
const stamps = Object.fromEntries(Object.keys(saveData).map((k) => [k, now - 60000]));
const db = newDatabase();
db.users.set('p@example.test', { id: ID, password: 'hunter2hunter2', meta: { age_13_plus: true } });
db.profiles.set(ID, { id: ID, username: 'player', created_at: new Date(now - 86400000).toISOString(), level: 3,
  cards: 0, unique_cards: 0, boosters_opened: 4, collection_value: 0, play_ms: 0 });
db.saves.set(ID, { user_id: ID, data: { format: 'wikster-save', version: 2, at: now - 60000, data: saveData, stamps }, updated_at: new Date(now - 60000).toISOString() });
const econDb = createEconDb();
econDb.cutover = now + 86400000;
econDb.born.set(ID, now - 86400000);

const IMG_MS = 1500;
const imgServer = createServer(async (req, res) => {
  await sleep(IMG_MS);
  res.writeHead(200, { 'content-type': 'image/svg+xml', 'cache-control': 'public, max-age=3600', 'access-control-allow-origin': '*' });
  res.end('<svg xmlns="http://www.w3.org/2000/svg" width="320" height="320"><rect width="320" height="320" fill="teal"/></svg>');
});
await new Promise((resolve) => imgServer.listen(0, '127.0.0.1', resolve));
const IMG = `http://127.0.0.1:${imgServer.address().port}`;

const economy = economyStub(engine, econDb);
let drawN = 0;
const DRAW_MS = 3000;
const opens = [];
let hangReady = false;
let manyMs = 3000;
const hung = [];
economy.handle = async function (userId, body) {
  this.calls.push(body.action);
  const draw = async (pack, { quick = false } = {}) => {
    if (!quick) await sleep(DRAW_MS);
    return Array.from({ length: pack.cards ?? 5 }, (_, i) => {
      const k = ++drawN;
      return { key: `en:Server_card_${k}`, title: `Server card ${k}`, lang: 'en', description: 'd', extract: 'A card the server drew for this test, with enough words to read.',
        thumbnail: `${IMG}/hero-${k}.svg`, url: `https://en.wikipedia.org/wiki/Server_card_${k}`, views: 1000 * (i + 1) + k, popularity: Math.min(0.95, 0.2 + i * 0.12) };
    });
  };
  const drawMany = async (pack, count) => {
    if (hangReady && body.action !== 'prepareMany') await new Promise((resolve) => { hung.push(resolve); });
    await sleep(manyMs);
    const sets = [];
    for (let i = 0; i < count; i++) sets.push(await draw(pack, { quick: true }));
    return sets;
  };
  const ctx = { user: userId, store: econDb.store(userId), draw, drawMany, writeQuiz: async () => [], articleText: async () => 'text' };
  const out = await runEconomy(engine, econDb, ctx, body, this.notify);
  if (body.action === 'open') opens.push({ nonce: body.args?.nonce, outcome: out.outcome });
  return out;
};

const DELAY = { ready: 1500, prepare: 1500, open: 12000, '*': 600 };
let restMs = 0;

const browser = await chromium.launch(launchOptions());
const pageErrors = [];

async function device(name) {
  const ctx = await browser.newContext({ serviceWorkers: 'allow', ...devices['Pixel 7'] });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => pageErrors.push(`${name}: ${e.message}`));
  installStubs(page);
  await installSupabase(page, { db, economy });
  await page.route(/^https:\/\/stub\.supabase\.co\/rest\/v1\//, async (route) => {
    if (restMs && route.request().method() !== 'OPTIONS') await sleep(restMs);
    return route.fallback();
  });
  await page.route(/^https:\/\/stub\.supabase\.co\/functions\/v1\/economy(\?.*)?$/, async (route) => {
    if (route.request().method() === 'OPTIONS') return route.fallback();
    let body = {};
    try { body = JSON.parse(route.request().postData() ?? '{}'); } catch {}
    await sleep(DELAY[body.action] ?? DELAY['*']);
    return route.fallback();
  });
  await page.addInitScript(() => {
    localStorage.setItem('wikster.language', 'en');
    window.__errorToasts = [];
    window.__xpShown = [];
    document.addEventListener('DOMContentLoaded', () => {
      const pop = document.querySelector('#xp-pop');
      if (!pop) return;
      new MutationObserver(() => {
        if (pop.hidden) return;
        const scr = document.querySelector('#screen-open');
        const st = window.__wikster?.state;
        window.__xpShown.push({ at: performance.now(), phase: scr?.className ?? '', seen: st?.seen?.size ?? 0, pulls: st?.pulls?.length ?? 0, growing: Boolean(st?.growing) });
      }).observe(pop, { attributes: true, attributeFilter: ['hidden', 'class'] });
    });
    document.addEventListener('DOMContentLoaded', () => {
      const node = document.querySelector('#toast');
      if (!node) return;
      new MutationObserver(() => {
        if (node.classList.contains('is-error') && node.classList.contains('is-showing')) window.__errorToasts.push(node.textContent.trim());
      }).observe(node, { attributes: true, attributeFilter: ['class'] });
    });
  });
  await page.goto(BASE, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2200);
  await closeSheets(page);
  await page.evaluate(() => document.querySelector('.appbar .icon-btn')?.click());
  await page.waitForTimeout(400);
  await page.locator('.drawer-link[data-link="account"], .drawer-link[data-link="friends"]').first().click().catch(() => 0);
  await page.waitForTimeout(900);
  if (await page.locator('#gate-seg .seg-option[data-value="in"]').count()) {
    await page.locator('#gate-seg .seg-option[data-value="in"]').click();
    await page.waitForTimeout(200);
  }
  await page.locator('#gate-form input[name="email"]').fill('p@example.test');
  await page.locator('#gate-form input[name="password"]').fill('hunter2hunter2');
  if (await page.locator('#gate-form input[name="age"]').count()) await page.locator('#gate-form input[name="age"]').fill('30');
  await page.locator('#gate-form button[type="submit"]').click();
  await until(() => page.evaluate(() => window.__wikster.serverEconomy()), 20000);
  await page.waitForTimeout(1500);
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

const readyOf = (page, id) => page.evaluate((spec) => window.__wikster.boosters.readyCount(spec), id);

async function toOpenScreen(page, label = null) {
  await page.evaluate(() => document.querySelector('.nav-item[data-tab="packs"]')?.click());
  await page.waitForTimeout(label ? 100 : 350);
  if (label) {
    await page.evaluate((name) => {
      const items = [...document.querySelectorAll('#packs-rail .rail-item')];
      items.find((n) => (n.getAttribute('aria-label') ?? '').includes(name))?.click();
    }, label);
    await page.waitForTimeout(150);
  }
  await page.evaluate(() => document.querySelector('#packs-open')?.click());
  return until(() => page.evaluate(() => document.querySelector('#screen-open')?.classList.contains('phase-idle')), 4000);
}

async function tapOpen(page) {
  return page.evaluate(async () => {
    const zone = document.querySelector('#screen-open .rip-zone');
    const s = performance.now();
    zone.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    let reveal = null;
    let pics = null;
    let error = null;
    let shuffled = false;
    while (performance.now() - s < 30000) {
      const scr = document.querySelector('#screen-open');
      const hint = document.querySelector('#open-hint');
      if (hint.classList.contains('is-error')) { error = hint.textContent; break; }
      if (hint.classList.contains('is-shuffling')) shuffled = true;
      if (reveal == null && scr.classList.contains('phase-reveal')) reveal = performance.now();
      if (reveal != null) {
        const imgs = [...document.querySelectorAll('#card-stack .card-art img')];
        const settled = !window.__wikster.state.growing && !document.querySelector('#card-stack .is-arriving');
        if (settled && imgs.length && imgs.every((i) => i.complete && i.naturalWidth > 0)) { pics = performance.now() - reveal; break; }
      }
      await new Promise((r) => setTimeout(r, 10));
    }
    const keys = window.__wikster.state.pulls.map((p) => p.article.key);
    return { reveal: reveal && Math.round(reveal - s), pics: pics == null ? null : Math.round(pics), error, shuffled, keys };
  });
}

async function leaveOpen(page) {
  await page.evaluate(() => document.querySelector('#open-skip')?.click());
  await page.waitForTimeout(250);
  await page.evaluate(() => document.querySelector('#open-done')?.click());
  await page.waitForTimeout(250);
}

const errorToasts = (page) => page.evaluate(() => window.__errorToasts.splice(0));

async function sameAsServer(page, ms = 90000) {
  let last = '';
  const ok = await until(async () => {
    const c = await page.evaluate(() => ({
      pending: window.__wikster.boosters.pending(),
      inv: Object.fromEntries(Object.entries(window.__wikster.state.inventory).map(([k, v]) => [k, v.count])),
      cards: Object.fromEntries(Object.entries(window.__wikster.state.collection.entries).map(([k, v]) => [k, v.count]))
    }));
    const u = econDb.users.get(ID);
    const inv = Object.fromEntries([...u.inventory].map(([k, v]) => [k, v.count]));
    const cards = Object.fromEntries([...u.cards].map(([k, v]) => [k, v.copies]));
    const sort = (o) => JSON.stringify(Object.entries(o).sort());
    last = `pending=${c.pending} client inv ${sort(c.inv)} server inv ${sort(inv)} client cards ${Object.keys(c.cards).length} server cards ${Object.keys(cards).length}`;
    if (c.pending) return false;
    if (sort(c.inv) !== sort(inv) || sort(c.cards) !== sort(cards)) {
      await page.evaluate(() => window.__wikster.econ('snapshot', {}).catch(() => null));
      return false;
    }
    return true;
  }, ms, 500);
  return { ok, last };
}

const A = await device('A');
const page = A.page;
check('the service worker controls the page', await until(() => page.evaluate(() => Boolean(navigator.serviceWorker?.controller)), 15000));

await toOpenScreen(page);
const stocked = await until(async () => (await readyOf(page, SPEC_ID)) >= 5, 40000, 250);
check('the booster on screen gets five draws ready', stocked, String(await readyOf(page, SPEC_ID)));
await page.waitForTimeout(IMG_MS + 1500);

const readyBeforeOpens = economy.calls.filter((c) => c === 'ready').length;
for (let i = 1; i <= 5; i++) {
  if (i > 1) await toOpenScreen(page);
  await page.waitForTimeout(300);
  const before = economy.calls.length;
  const r = await tapOpen(page);
  const after = economy.calls.slice(before);
  check(`open #${i}: every picture is there within 300 ms of the reveal`, r.reveal != null && r.pics != null && r.pics <= 300, JSON.stringify({ reveal: r.reveal, pics: r.pics }));
  check(`open #${i}: no draw is asked for after the tap`, !after.includes('prepare') && !r.shuffled, after.join(','));
  check(`open #${i}: no error`, !r.error, r.error ?? '');
  await leaveOpen(page);
  await page.waitForTimeout(500);
}
check('no error toast during the run', (await errorToasts(page)).length === 0);
const readyInOpens = economy.calls.filter((c) => c === 'ready').length - readyBeforeOpens;
check('five opens ask for draws without polling ready', readyInOpens <= 1, `${readyInOpens} ready calls for 5 opens`);

const pendingNow = await page.evaluate(() => window.__wikster.boosters.pending());
check('confirmations are still on their way', pendingNow > 0, String(pendingNow));
const bought = await page.evaluate(() => window.__wikster.econ('buy', { section: 'today' }).then(() => true, (e) => String(e)));
check('a booster is bought while confirmations are pending', bought === true, String(bought));
const t0 = Date.now();
await toOpenScreen(page, 'Wikipedia');
const tapAt = Date.now() - t0;
const fresh = await tapOpen(page);
check('the new booster is opened within 500 ms of buying', tapAt <= 500, `${tapAt} ms`);
check('it opens without an error, shuffling until its draw lands', fresh.reveal != null && !fresh.error, JSON.stringify(fresh));
check('no error toast after buying and opening', (await errorToasts(page)).length === 0);
await leaveOpen(page);

DELAY.open = 2500;
await until(async () => (await readyOf(page, SPEC_ID)) >= 1, 30000, 250);
await toOpenScreen(page);
await page.waitForTimeout(300);
const beforeReload = await tapOpen(page);
check('the last booster of the stack opens', beforeReload.reveal != null && !beforeReload.error);
await page.waitForTimeout(500);
const launchSeen = [];
const watchLaunch = (req) => {
  if (!req.url().startsWith('https://stub.supabase.co/') || req.method() === 'OPTIONS' || req.url().includes('/realtime/')) return;
  let action = null;
  try { action = req.url().includes('/functions/v1/economy') ? JSON.parse(req.postData() ?? '{}').action ?? null : null; } catch {}
  launchSeen.push({ path: new URL(req.url()).pathname.replace(/^\/(rest|auth|functions)\/v1\//, ''), action });
};
await page.reload({ waitUntil: 'domcontentloaded' });
page.on('request', watchLaunch);
await page.waitForTimeout(2500);
await closeSheets(page);
const afterReload = await sameAsServer(page);
await page.waitForTimeout(3000);
page.off('request', watchLaunch);
const launchCalls = launchSeen.filter((r) => r.action !== 'open' && r.action !== 'snapshot');
check('a returning player launches in about four requests', launchCalls.length <= 5, launchCalls.map((r) => r.action ?? r.path).join(', '));
check('with one economy call', launchCalls.filter((r) => r.action).length <= 1, launchCalls.filter((r) => r.action).map((r) => r.action).join(', '));
check('after a reload, client and server agree on boosters and cards', afterReload.ok, afterReload.last);
const shownKeys = beforeReload.keys;
const copies = shownKeys.map((k) => econDb.users.get(ID).cards.get(k)?.copies ?? 0);
check('the cards shown before the reload are filed exactly once', copies.every((n) => n === 1), JSON.stringify(copies));
const claimed = opens.filter((o) => o.outcome === 'opened');
check('every draw is claimed once', new Set(claimed.map((o) => o.nonce)).size === claimed.length);
check('no error toast after the reload', (await errorToasts(page)).length === 0);

await econDb.store(ID).apply({ inventory: [{ spec_id: SPEC_ID, spec: SPEC, delta: 3 }] });
await page.evaluate(() => window.__wikster.econ('snapshot', {}));
await toOpenScreen(page);
check('new boosters get their draws', await until(async () => (await readyOf(page, SPEC_ID)) >= 3, 40000, 250));
await page.waitForTimeout(IMG_MS + 1000);
await leaveOpen(page);
await page.keyboard.press('Escape');
DELAY.ready = 15000;
await page.reload({ waitUntil: 'domcontentloaded' });
await page.waitForTimeout(2000);
await closeSheets(page);
const readyCalls = economy.calls.filter((c) => c === 'ready').length;
await toOpenScreen(page);
const cold = await tapOpen(page);
check('a cold start opens from the draws kept on the device', cold.reveal != null && !cold.shuffled && !cold.error && cold.reveal < 3000, JSON.stringify({ reveal: cold.reveal, shuffled: cold.shuffled }));
check('without waiting for the server to answer ready', economy.calls.filter((c) => c === 'ready').length - readyCalls <= 1);
await leaveOpen(page);
DELAY.ready = 1500;

await A.ctx.setOffline(true);
await toOpenScreen(page);
const offline = await tapOpen(page);
check('offline, a kept draw still opens', offline.reveal != null && !offline.error, JSON.stringify({ reveal: offline.reveal, error: offline.error }));
await leaveOpen(page);
const offlineNonce = await page.evaluate(() => JSON.parse(localStorage.getItem('wikster.opening.v1') ?? '{}').entries?.at(-1)?.nonce ?? null);
await A.ctx.setOffline(false);
await page.evaluate(() => window.dispatchEvent(new Event('online')));
const settledOffline = await sameAsServer(page);
check('back online, the offline opening is confirmed and both sides agree', settledOffline.ok, settledOffline.last);
check('the server claimed the offline draw once', opens.filter((o) => o.nonce === offlineNonce && o.outcome === 'opened').length === 1);
check('no error toast around the offline opening', (await errorToasts(page)).length === 0);

await econDb.store(ID).apply({ inventory: [{ spec_id: SPEC_ID, spec: SPEC, delta: 2 }] });
await page.evaluate(() => window.__wikster.econ('snapshot', {}));
const B = await device('B');
const pageB = B.page;
await toOpenScreen(page);
await toOpenScreen(pageB);
await until(async () => (await readyOf(page, SPEC_ID)) >= 1 && (await readyOf(pageB, SPEC_ID)) >= 1, 40000, 250);
await pageB.waitForTimeout(IMG_MS + 500);
const [r1, r2] = await Promise.all([tapOpen(page), tapOpen(pageB)]);
check('two devices open at the same time without an error', r1.reveal != null && r2.reveal != null && !r1.error && !r2.error);
await leaveOpen(page);
await leaveOpen(pageB);
const agreeA = await sameAsServer(page);
const agreeB = await sameAsServer(pageB);
check('both devices end up agreeing with the server', agreeA.ok && agreeB.ok, `${agreeA.last} | ${agreeB.last}`);
check('no error toast on either device', (await errorToasts(page)).length === 0 && (await errorToasts(pageB)).length === 0);
await B.ctx.close();

const u = econDb.users.get(ID);
u.state = { ...u.state, timed: { count: 3, last: Date.now(), opened: 0 } };
await page.evaluate(() => window.__wikster.econ('snapshot', {}));
await page.evaluate(() => document.querySelector('.nav-item[data-tab="packs"]')?.click());
const timedId = 'timed|1|std|3';
check('free boosters get their draws ready', await until(async () => (await readyOf(page, timedId)) >= 3, 40000, 250), String(await readyOf(page, timedId)));
await page.waitForTimeout(IMG_MS + 1000);
await page.evaluate(() => window.__wikster.boosters.openAllTimed());
await until(() => page.evaluate(() => document.querySelector('#screen-open')?.classList.contains('phase-idle')), 4000);
await page.evaluate(() => {
  window.__early = [];
  const stack = document.querySelector('#card-stack');
  new MutationObserver((list) => {
    for (const m of list) {
      const card = m.target;
      if (!(card instanceof HTMLElement) || !card.classList.contains('is-revealed')) continue;
      const busy = [...stack.querySelectorAll('.card')].some((c) => c.classList.contains('is-emerging')
        || c.getAnimations().some((a) => a.animationName === 'card-emerge' && a.playState === 'running'));
      if (busy) window.__early.push(card.className);
    }
  }).observe(stack, { attributes: true, attributeFilter: ['class'], subtree: true });
});
const before = economy.calls.length;
const all = await tapOpen(page);
check('opening every free booster at once is instant', all.reveal != null && !all.shuffled && !all.error && !economy.calls.slice(before).includes('prepare'), JSON.stringify({ reveal: all.reveal, shuffled: all.shuffled }));
check('and shows the cards of the three draws', all.keys.length === 9, String(all.keys.length));
check('no card is revealed while the cards are still arriving', (await page.evaluate(() => window.__early.length)) === 0, String(await page.evaluate(() => window.__early.length)));
await leaveOpen(page);
const timedDone = await sameAsServer(page);
check('the free boosters settle on both sides', timedDone.ok, timedDone.last);
check('the server counts three free boosters opened', (econDb.users.get(ID).state.timed?.opened ?? 0) === 3);

await econDb.store(ID).apply({ inventory: [{ spec_id: SPEC_ID, spec: SPEC, delta: 7 }] });
await page.evaluate(() => window.__wikster.econ('snapshot', {}));
await page.evaluate(() => { window.__wikster.state.profile.settings.skipOpening = true; window.__wikster.store.saveProfile(window.__wikster.state.profile); });
const heldBefore = econDb.users.get(ID).inventory.get(SPEC_ID)?.count ?? 0;
const openedBefore = econDb.users.get(ID).state.boostersOpened ?? 0;
await page.evaluate(() => document.querySelector('.nav-item[data-tab="packs"]')?.click());
await page.waitForTimeout(400);
await page.evaluate(() => {
  const items = [...document.querySelectorAll('#packs-rail .rail-item')];
  items.find((n) => (n.getAttribute('aria-label') ?? '').includes('Animals'))?.click();
});
await page.waitForTimeout(300);
const allLabel = await page.evaluate(() => { const b = document.querySelector('#packs-open-all'); return b && !b.hidden ? b.textContent : null; });
check('the shelf offers to open every booster of the kind at once', allLabel === `Open all ${heldBefore}`, String(allLabel));
await page.evaluate(() => document.querySelector('#packs-open-all')?.click());
await until(() => page.evaluate(() => document.querySelector('#screen-open')?.classList.contains('phase-idle')), 4000);
check('the opening screen says how many open together', (await page.locator('#open-title').textContent()).includes(`×${heldBefore}`), await page.locator('#open-title').textContent());
await page.evaluate(() => {
  window.__motion = { scraps: 0, emerging: 0 };
  new MutationObserver((list) => {
    for (const m of list) {
      for (const n of m.addedNodes) if (n instanceof HTMLElement && n.classList.contains('tear-scrap')) window.__motion.scraps++;
      if (m.type === 'attributes' && m.target instanceof HTMLElement && /is-emerging|is-dealt/.test(m.target.className)) window.__motion.emerging++;
    }
  }).observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] });
});
const callsBefore = economy.calls.length;
const opensBefore = opens.length;
const batch = await tapOpen(page);
const batchCalls = economy.calls.slice(callsBefore);
check('open all reveals every card of every booster', batch.reveal != null && !batch.error && batch.keys.length === heldBefore * 5, JSON.stringify({ reveal: batch.reveal, n: batch.keys.length, error: batch.error }));
check('with the animation skipped, no tear and no dealing', await page.evaluate(() => window.__motion.scraps === 0 && window.__motion.emerging === 0), await page.evaluate(() => JSON.stringify(window.__motion)));
check('the cards wait face down to be turned', await page.evaluate(() => document.querySelectorAll('#card-stack .stack-card.is-revealed').length === 0));
check('the journal holds the whole batch before the reveal', await page.evaluate(() => (JSON.parse(localStorage.getItem('wikster.opening.v1') ?? '{}').entries ?? []).some((e) => e.batch >= 2) || window.__wikster.boosters.pending() === 0));
await page.evaluate(() => document.querySelectorAll('#card-stack .stack-card')[3]?.click());
await page.waitForTimeout(300);
check('a tap turns one card over', await page.evaluate(() => document.querySelectorAll('#card-stack .stack-card.is-revealed').length === 1));
await leaveOpen(page);
const batchDone = await sameAsServer(page);
check('the batch settles on both sides', batchDone.ok, batchDone.last);
const batchOpens = opens.slice(opensBefore).filter((o) => o.outcome === 'opened');
check('the server opened them in one request', batchOpens.length === 1 && batchCalls.filter((c) => c === 'prepareMany').length <= 1, `${batchOpens.length} opens, calls ${batchCalls.join(',')}`);
check('it counts every booster opened and none is left', (econDb.users.get(ID).state.boostersOpened ?? 0) === openedBefore + heldBefore && !econDb.users.get(ID).inventory.get(SPEC_ID), String(econDb.users.get(ID).state.boostersOpened));
check('no error toast around open all', (await errorToasts(page)).length === 0);
{
await econDb.store(ID).apply({ add: [
  { key: 'en:Bulk_a', title: 'Bulk a', rarityId: 'common', price: 120, copies: 4, data: { thumbnail: `${IMG}/hero-a.svg` } },
  { key: 'en:Bulk_b', title: 'Bulk b', rarityId: 'rare', price: 300, copies: 3, data: { thumbnail: `${IMG}/hero-b.svg` } }
] });
await page.evaluate(() => window.__wikster.econ('snapshot', {}));
await until(() => page.evaluate(() => (window.__wikster.state.collection.entries['en:Bulk_a']?.count ?? 0) === 4), 15000);
for (let i = 0; i < 8 && await page.locator('#sheet').isVisible().catch(() => false); i++) {
  if (await page.locator('#sheet-close').isVisible().catch(() => false)) await page.locator('#sheet-close').click().catch(() => 0);
  else await page.locator('#sheet .btn-primary').first().click({ timeout: 3000 }).catch(() => page.keyboard.press('Escape'));
  await page.waitForTimeout(500);
}
await page.evaluate(() => document.querySelector('.nav-item[data-tab="binder"]')?.click());
await page.waitForTimeout(800);
await page.locator('#binder-sell').click();
await page.waitForTimeout(900);
await page.locator('#screen-selling .sell-tab[data-group="spares"]').click();
await page.locator('#screen-selling .sell-chip[data-act="spares"]').click();
await page.waitForTimeout(300);
const coinsBefore = econDb.users.get(ID).wallet?.coins ?? null;
const callsBefore = economy.calls.length;
await page.locator('body > .sell-bar:not([hidden]) .sell-go').click();
await page.waitForTimeout(500);
await page.locator('#sheet .sell-confirm-go').click();
const sold = await until(() => economy.calls.slice(callsBefore).some((a) => a === 'sellMany' || a === 'batch'), 20000);
await page.waitForTimeout(2500);
const sent = economy.calls.slice(callsBefore).filter((a) => a !== 'ping' && a !== 'ready' && a !== 'snapshot');
check('a bulk sale is one request to the server', sold && sent.filter((a) => a === 'sellMany').length === 1 && !sent.includes('sell'), sent.join(','));
const su = econDb.users.get(ID);
check('the server keeps one copy of each and pays for the rest', su.cards.get('en:Bulk_a')?.copies === 1 && su.cards.get('en:Bulk_b')?.copies === 1
  && (coinsBefore == null || (su.wallet?.coins ?? 0) > coinsBefore), `${su.cards.get('en:Bulk_a')?.copies}/${su.cards.get('en:Bulk_b')?.copies}`);
const bulkDone = await sameAsServer(page);
check('and the phone agrees with the server after the sale', bulkDone.ok, bulkDone.last);
}

{
const BULK = 32;
const u0 = econDb.users.get(ID);
const heldNow = u0.inventory.get(SPEC_ID)?.count ?? 0;
await econDb.store(ID).apply({ inventory: [{ spec_id: SPEC_ID, spec: SPEC, delta: BULK - heldNow }] });
const early = await runEconomy(engine, econDb, {
  user: ID, store: econDb.store(ID),
  draw: async (pack) => Array.from({ length: pack.cards ?? 5 }, (_, i) => ({ key: `en:Early_${i}_${Math.random().toString(36).slice(2)}`, title: `Early ${i}`, lang: 'en', description: 'd', extract: 'A card drawn early for this test, with enough words to read.', thumbnail: `${IMG}/early-${i}.svg`, views: 2000, popularity: 0.4 })),
  writeQuiz: async () => [], articleText: async () => 'text'
}, { action: 'prepareMany', args: { specId: SPEC_ID, count: 6, skip: [] } });
hangReady = true;
manyMs = 600;
Object.assign(DELAY, { ready: 3000, prepare: 3000, prepareMany: 3000, open: 3000, '*': 3000 });
restMs = 3000;
await page.evaluate(() => window.__wikster.econ('snapshot', {}).catch(() => null));
await page.evaluate(() => { window.__wikster.state.profile.settings.skipOpening = true; });
const readyBulk = await until(async () => (await readyOf(page, SPEC_ID)) >= Math.min(6, early.pulls.length), 40000, 250);
const readyAtTap = await readyOf(page, SPEC_ID);
check('some draws of a big stack wait on the phone, most do not', readyBulk && readyAtTap < 30, `${readyAtTap} ready of ${BULK}`);
await page.evaluate(() => document.querySelector('.nav-item[data-tab="packs"]')?.click());
await page.waitForTimeout(400);
await page.evaluate((id) => {
  const index = (window.__wikster.state.packSlots ?? []).findIndex((slot) => window.__wikster.specId(slot.spec) === id);
  document.querySelector(`#packs-rail .rail-item[data-index="${index}"]`)?.click();
}, SPEC_ID);
await page.waitForTimeout(700);
await page.evaluate(() => {
  if (document.querySelector('#screen-open')?.classList.contains('is-active')) document.querySelector('#open-all')?.click();
  else document.querySelector('#packs-open-all')?.click();
});
await until(() => page.evaluate(() => document.querySelector('#screen-open')?.classList.contains('phase-idle')), 4000);
const bulkN = await page.evaluate(() => window.__wikster.state.batch);
check('Open all takes thirty boosters at once', bulkN === 30, String(bulkN));
const xpBefore = await page.evaluate(() => window.__xpShown.filter((x) => /phase-(opening|reveal)/.test(x.phase) && /is-active/.test(x.phase) && (x.seen < x.pulls || x.growing)).length);
check('in every opening so far, XP never showed before the last card', xpBefore === 0, String(xpBefore));
await page.evaluate(() => { window.__xpShown.length = 0; });
const callsAt = economy.calls.length;
const bulk = await page.evaluate(async () => {
  const zone = document.querySelector('#screen-open .rip-zone');
  const s = performance.now();
  zone.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  let first = null;
  let all = null;
  let spinner = false;
  let pics = null;
  while (performance.now() - s < 40000) {
    const now = performance.now();
    if (document.querySelector('.shuffle-ring, .booster.is-shuffling, #open-hint.is-shuffling')) spinner = true;
    const titled = [...document.querySelectorAll('#card-stack .card')].filter((c) => (c.querySelector('.card-title')?.textContent ?? '').trim());
    if (first == null && titled.length) first = now - s;
    if (first != null && window.__wikster.state.pulls.length >= 150 && !document.querySelector('#card-stack .is-arriving') && !window.__wikster.state.growing) {
      all = now - s;
      pics = [...document.querySelectorAll('#card-stack .card-art img')].some((i) => !i.complete);
      break;
    }
    await new Promise((r) => setTimeout(r, 10));
  }
  return { first: first && Math.round(first), all: all && Math.round(all), spinner, picsPending: pics, n: window.__wikster.state.pulls.length, cards: document.querySelectorAll('#card-stack .card').length };
});
check('Open all of thirty shows its first card within 300 ms with every call held 3 s', bulk.first != null && bulk.first <= 300, JSON.stringify(bulk));
check('cards show before their pictures load: pictures never block', bulk.picsPending === true);
check('no spinner and no shuffling booster', !bulk.spinner);
check('the missing draws land in the same reveal', bulk.all != null && bulk.n === 150 && bulk.cards === 150, JSON.stringify(bulk));
const xpEarly = await page.evaluate(() => window.__xpShown.filter((x) => /phase-(opening|reveal)/.test(x.phase) && /is-active/.test(x.phase) && (x.seen < x.pulls || x.growing)).length);
await page.waitForTimeout(3500);
const xpEarlyLate = await page.evaluate(() => window.__xpShown.filter((x) => /phase-(opening|reveal)/.test(x.phase) && /is-active/.test(x.phase) && (x.seen < x.pulls || x.growing)).length);
check('no XP shows while cards are still face down', xpEarly === 0 && xpEarlyLate === 0, String(xpEarlyLate));
await page.evaluate(() => document.querySelector('#open-skip')?.click());
const xpEnd = await until(() => page.evaluate(() => window.__xpShown.some((x) => /phase-summary/.test(x.phase))), 8000);
check('the XP shows with the summary', xpEnd, await page.evaluate(() => JSON.stringify(window.__xpShown.slice(0, 3))));
const bulkCalls = economy.calls.slice(callsAt).filter((c) => ['prepare', 'prepareMany', 'open', 'batch'].includes(c));
check('Open all of thirty is at most two requests', bulkCalls.length <= 2, bulkCalls.join(','));
await page.evaluate(() => document.querySelector('#open-done')?.click());
Object.assign(DELAY, { ready: 1500, prepare: 1500, prepareMany: 600, open: 2500, '*': 600 });
restMs = 0;
hangReady = false;
for (const go of hung.splice(0)) go();
const bulkDone = await sameAsServer(page);
check('the big Open all settles on both sides', bulkDone.ok, bulkDone.last);
check('every booster of it was opened once', (econDb.users.get(ID).inventory.get(SPEC_ID)?.count ?? 0) === BULK - 30);
check('no error toast around the big Open all', (await errorToasts(page)).length === 0);
}

check('no page errors', pageErrors.length === 0, pageErrors.slice(0, 3).join(' | '));
await browser.close();
imgServer.close();
if (failures.length) {
  console.log(`FAIL ${failures.length}: ${failures.join('; ')}`);
  process.exit(1);
}
console.log('ALL PASS');
process.exit(0);
