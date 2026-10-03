import { chromium, devices } from 'playwright';
import { launchOptions } from './browser.mjs';
import { installStubs } from './stubs.mjs';
import { economyStub, installSupabase, newDatabase } from './supastub.mjs';
import { createEconDb } from './econdb.mjs';
import { seedLegacyCodes } from './codefixtures.mjs';
import { RELEASES } from '../../src/data/releases.js';

const PHOTO = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40" width="400" height="400"><rect width="40" height="40" fill="#6b7280"/><circle cx="20" cy="16" r="8" fill="#e5e7eb"/></svg>';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export const until = async (fn, ms = 10000) => {
  const end = Date.now() + ms;
  for (;;) {
    let ok = false;
    try { ok = await fn(); } catch { ok = false; }
    if (ok || Date.now() > end) return ok;
    await sleep(200);
  }
};

let pageId = 4000;
function wikiFetch() {
  const json = (body) => ({ ok: true, status: 200, json: async () => body, headers: { get: () => null } });
  globalThis.fetch = async (url) => {
    const u = new URL(String(url));
    if (!/wikipedia\.org$|wikimedia\.org$/.test(u.hostname)) return json({});
    if (u.pathname.includes('/rest_v1/page/summary/')) return json({});
    if (u.pathname.includes('/metrics/pageviews')) return json({ items: [{ views: 4000 }, { views: 3600 }] });
    if (!u.pathname.endsWith('/w/api.php')) return json({ items: [] });
    if (u.searchParams.get('generator') === 'images') return json({ query: { pages: {} } });
    const titles = (u.searchParams.get('titles') ?? '').split('|').filter(Boolean);
    const pages = {};
    for (const title of titles) {
      const id = pageId++;
      pages[id] = {
        pageid: id, ns: 0, title,
        extract: `${title} is the subject of this article, written at length for the stub so that every card has an opening paragraph to show on its face.`,
        description: 'stub article',
        thumbnail: { source: `https://upload.wikimedia.org/hero-${id % 40}.svg`, width: 640, height: 480 },
        pageviews: { '2026-09-01': 4000, '2026-09-02': 3600 },
        fullurl: `https://${u.hostname}/wiki/${encodeURIComponent(title)}`, length: 12000
      };
    }
    return json({ query: { pages } });
  };
}

export async function codeWorld() {
  const engine = await import('../../supabase/functions/economy/engine.js');
  wikiFetch();
  const now = Date.now();
  const iso = (ms = 0) => new Date(now + ms).toISOString();
  const db = newDatabase();
  const econDb = seedLegacyCodes(createEconDb());
  econDb.cutover = now - 86400000;
  const economy = economyStub(engine, econDb, { draw: (pack, options) => engine.drawArticles(pack, options) });
  const browser = await chromium.launch(launchOptions());
  const errors = [];
  let n = 0;

  async function person({ level = 5, state = null, cards = [] } = {}) {
    const id = `00000000-0000-4000-8000-0000000000${String(++n).padStart(2, '0')}`;
    const email = `codes${n}@example.test`;
    db.users.set(email, { id, password: 'hunter2hunter2', meta: { age_13_plus: true } });
    db.profiles.set(id, { id, username: `codes_${n}`, created_at: iso(-86400000), level, cards: 0, unique_cards: 0, boosters_opened: 4, collection_value: 0, play_ms: 60000 });
    econDb.born.set(id, now);
    const store = econDb.store(id);
    await store.apply({
      coins: 5000,
      state: {
        started: true, imported: true, cardFix: 1, createdAt: now - 86400000, boostersOpened: 5, rarityCounts: {}, progress: { level, xp: 0 }, pendingLevels: [],
        daily: { lastDay: Math.floor(now / 86400000), shownDay: Math.floor(now / 86400000), claimed: 1, board: 0 }, timed: { count: 0, stamp: now },
        ...(state ?? {})
      },
      ...(cards.length ? { add: cards } : {})
    });
    return { id, email };
  }

  async function open(who, { pc = false, seed = null } = {}) {
    const ctx = await browser.newContext(pc
      ? { serviceWorkers: 'block', viewport: { width: 1600, height: 900 }, deviceScaleFactor: 1 }
      : { serviceWorkers: 'block', ...devices['Pixel 7'] });
    const page = await ctx.newPage();
    page.setDefaultTimeout(9000);
    page.on('pageerror', (e) => errors.push(`${who.email}: ${e.message}`));
    installStubs(page);
    await page.route(/friend-pictures/, (r) => r.fulfill({ status: 200, contentType: 'image/svg+xml', body: PHOTO, headers: { 'access-control-allow-origin': '*' } }));
    await installSupabase(page, { db, economy });
    await page.addInitScript(({ seen, pc, extra }) => {
      if (localStorage.getItem('wikster.test.seeded')) return;
      localStorage.setItem('wikster.test.seeded', '1');
      localStorage.setItem('wikster.language', 'en');
      localStorage.setItem('wikster.seenRelease.v1', seen);
      if (pc) localStorage.setItem('wikster.layout.v1', 'pc');
      for (const [k, v] of Object.entries(extra ?? {})) localStorage.setItem(k, v);
    }, { seen: RELEASES.at(-1).id, pc, extra: seed });
    await page.goto(process.env.BASE_URL ?? 'http://127.0.0.1:4173/', { waitUntil: 'domcontentloaded' });
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
    await page.locator('#gate-form input[name="email"]').fill(who.email);
    await page.locator('#gate-form input[name="password"]').fill('hunter2hunter2');
    if (await page.locator('#gate-form input[name="age"]').count()) await page.locator('#gate-form input[name="age"]').fill('30');
    await page.locator('#gate-form button[type="submit"]').click();
    await until(() => page.evaluate(() => window.__wikster.serverEconomy()), 20000);
    await page.waitForTimeout(1800);
    await closeSheets(page);
    if (pc) await page.keyboard.press('Escape').catch(() => 0);
    return page;
  }

  async function closeSheets(page) {
    for (let i = 0; i < 8; i++) {
      if (!(await page.locator('#sheet').isVisible().catch(() => false))) break;
      if (await page.locator('#sheet-close').isVisible().catch(() => false)) await page.locator('#sheet-close').click({ timeout: 2000 }).catch(() => 0);
      else await page.keyboard.press('Escape');
      await page.waitForTimeout(400);
    }
  }

  async function drawer(page, link) {
    await closeSheets(page);
    for (let i = 0; i < 5; i++) {
      if (await page.locator('#drawer.is-open').count()) break;
      await page.evaluate(() => (document.querySelector('#menu-btn') ?? document.querySelector('.appbar .icon-btn'))?.click());
      await page.waitForTimeout(420);
    }
    await page.locator(`.drawer-link[data-link="${link}"]`).click();
    await page.waitForTimeout(900);
  }

  async function redeem(page, code) {
    await drawer(page, 'settings');
    await page.locator('#redeem-list [data-code]').scrollIntoViewIfNeeded();
    await page.locator('#redeem-list [data-status]').evaluate((node) => { node.textContent = ''; });
    await page.locator('#redeem-list [data-code]').fill(code);
    await page.locator('#redeem-list button[type="submit"]').click();
    await until(async () => ((await page.locator('#redeem-list [data-status]').textContent()) ?? '').length > 0, 10000);
    await page.waitForTimeout(900);
    return (await page.locator('#redeem-list [data-status]').textContent()) ?? '';
  }

  async function openBooster(page, prefix) {
    await closeSheets(page);
    await page.locator('.nav-item[data-tab="packs"]').click();
    await page.waitForTimeout(800);
    await page.locator('.seg-option').filter({ hasText: /Custom/ }).first().click().catch(() => 0);
    await page.waitForTimeout(900);
    const tile = page.locator(`.booster[data-spec^="${prefix}"]`).first();
    if (!(await tile.count())) return null;
    await tile.click();
    await page.waitForTimeout(900);
    await page.evaluate(() => document.querySelector('#packs-open')?.click());
    await until(() => page.evaluate(() => document.querySelector('#screen-open')?.classList.contains('phase-idle')), 15000);
    await page.evaluate(() => document.querySelector('#screen-open .rip-zone')?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })));
    await until(() => page.evaluate(() => document.querySelector('#screen-open')?.classList.contains('phase-reveal')), 40000);
    await page.waitForTimeout(1500);
    return page.evaluate(() => [...document.querySelectorAll('#screen-open .card, #screen-open [data-special]')]
      .map((c) => ({ special: c.dataset.special, title: c.querySelector('.card-title')?.textContent?.trim(), art: c.querySelector('.card-art img')?.getAttribute('src') ?? '' }))
      .filter((c) => c.title));
  }

  async function leaveOpening(page) {
    await page.evaluate(() => document.querySelector('#open-back')?.click());
    await page.waitForTimeout(900);
    if (await page.locator('#screen-open.is-active').count()) { await page.evaluate(() => document.querySelector('#open-done')?.click()); await page.waitForTimeout(900); }
  }

  return { db, econDb, economy, browser, errors, now, person, open, closeSheets, drawer, redeem, openBooster, leaveOpening, until };
}
