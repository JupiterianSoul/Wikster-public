import { chromium, devices } from 'playwright';
import { launchOptions } from '../lib/browser.mjs';
import { installStubs } from '../lib/stubs.mjs';
import { economyStub, installSupabase, newDatabase } from '../lib/supastub.mjs';
import { createEconDb } from '../lib/econdb.mjs';
import { utcDayIndex } from '../../src/days.js';
import { pickOption } from '../lib/dropdown.mjs';

const engine = await import('../../supabase/functions/economy/engine.js');
const BASE = process.env.BASE_URL ?? 'http://127.0.0.1:4173/';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 12000, step = 150) => {
  const end = Date.now() + ms * (process.env.CI ? 2.5 : 1);
  for (;;) {
    let ok = false;
    try { ok = await fn(); } catch { ok = false; }
    if (ok || Date.now() > end) return ok;
    await sleep(step);
  }
};
let fails = 0;
const check = (label, ok, detail = '') => { if (!ok) fails++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? `  ${detail}` : ''}`); };
const section = (s) => console.log(`\n== ${s}`);

const PX = 'data:image/gif;base64,R0lGODlhAQABAAAAACw=';
const now = Date.now();
const iso = (ms = 0) => new Date(now + ms).toISOString();
const day = utcDayIndex(now);
const S = '00000000-0000-4000-8000-0000000000a1';
const B = '00000000-0000-4000-8000-0000000000b2';
const C = '00000000-0000-4000-8000-0000000000c3';
const X = '00000000-0000-4000-8000-0000000000d4';
const card = (key, title, rarityId, price, extra = {}) => ({
  key, title, rarityId, price, views: 400000, popularity: 0.7, count: 1, favorite: false, packId: 'theme|animals', packName: 'Animals',
  lang: 'en', thumbnail: PX, firstPulledAt: 1, lastPulledAt: 1, description: 'A thing', extract: 'Some words about it.', ...extra
});
const people = {
  [S]: { email: 's@example.test', name: 'seller_sam', wallet: 1000, cards: {
    'en:Cat': card('en:Cat', 'Cat', 'rare', 300, { count: 3, prints: { common: 1, rare: 2 } }),
    'en:Mars': card('en:Mars', 'Mars', 'epic', 800, { packId: 'theme|space' })
  } },
  [B]: { email: 'b@example.test', name: 'bidder_bea', wallet: 5000, cards: { 'en:Owl': card('en:Owl', 'Owl', 'common', 40) } },
  [C]: { email: 'c@example.test', name: 'bidder_cal', wallet: 5000, cards: { 'en:Fox': card('en:Fox', 'Fox', 'common', 40) } }
};

const db = newDatabase();
const econDb = createEconDb();
econDb.cutover = now + 86400000;
for (const [id, p] of Object.entries(people)) {
  db.users.set(p.email, { id, password: 'hunter2hunter2', meta: { age_13_plus: true } });
  db.profiles.set(id, { id, username: p.name, created_at: iso(-86400000), level: 6, cards: 3, unique_cards: 2, boosters_opened: 4, collection_value: 900, play_ms: 60000 });
  const profile = {
    started: true, createdAt: now - 86400000, playMs: 60000, boostersOpened: 4, rarityCounts: {}, progress: { level: 6, xp: 0 }, pendingLevels: [],
    daily: { v: 2, day: 1, weeks: 0, lastDay: day, shownDay: day }, timed: { count: 0, stamp: now }, freeTaken: { window: 0, ids: [] }
  };
  const data = {
    'wikster.wallet.v1': String(p.wallet), 'wikster.ink.v1': '0', 'wikster.inventory.v1': '{}',
    'wikster.collection.v3': JSON.stringify({ entries: p.cards }), 'wikster.profile.v1': JSON.stringify(profile), 'wikster.language': 'en'
  };
  db.saves.set(id, { user_id: id, data: { format: 'wikster-save', version: 2, at: now - 60000, data, stamps: Object.fromEntries(Object.keys(data).map((k) => [k, now - 60000])) }, updated_at: iso(-60000) });
  econDb.born.set(id, now - 86400000);
}
db.profiles.set(X, { id: X, username: 'xena_x', created_at: iso(-86400000) });
const lot = (n, title, rarityId, price, start, ms, extra = {}) => ({
  id: `00000000-0000-4000-9000-00000000000${n}`, seller: X, seller_name: 'xena_x',
  card: { key: `en:${title.replace(/ /g, '_')}`, title, rarityId, price, thumbnail: PX, packId: extra.packId ?? null, description: 'Someone', lang: 'en' },
  start_price: start, current_bid: null, bidder: null, bidder_name: null, bid_count: 0, buyout: extra.buyout ?? null,
  ends_at: iso(ms), status: 'open', created_at: iso(-60000 * n)
});
db.auctions.push(
  lot(1, 'Ada Lovelace', 'epic', 900, 500, 7200000, { packId: 'theme|history', buyout: 2000 }),
  lot(2, 'Alan Turing', 'legendary', 1600, 1500, 1800000, { packId: 'theme|technology' }),
  lot(3, 'Grace Hopper', 'common', 60, 50, 10800000)
);
const economy = economyStub(engine, econDb);

const browser = await chromium.launch(launchOptions());
const errors = [];

async function player(id, { pc = false } = {}) {
  const p = people[id];
  const ctx = await browser.newContext(pc ? { serviceWorkers: 'block', viewport: { width: 1600, height: 900 }, deviceScaleFactor: 1 } : { serviceWorkers: 'block', ...devices['Pixel 7'] });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(`${p.name}: ${e.message}`));
  installStubs(page);
  await installSupabase(page, { db, economy });
  await page.addInitScript(() => {
    localStorage.setItem('wikster.language', 'en');
    window.__toasts = [];
    document.addEventListener('DOMContentLoaded', () => {
      const node = document.querySelector('#toast');
      if (node) new MutationObserver(() => window.__toasts.push(node.textContent)).observe(node, { childList: true, subtree: true, characterData: true });
    });
  });
  await page.goto(BASE, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2200);
  await closeSheets(page);
  if (!(await page.locator('#gate-form').isVisible().catch(() => false))) {
    await page.evaluate(() => document.querySelector('.appbar .icon-btn')?.click());
    await page.waitForTimeout(400);
    await page.locator('.drawer-link[data-link="account"], .drawer-link[data-link="friends"]').first().click({ timeout: 4000 }).catch(() => 0);
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
  await page.waitForTimeout(1500);
  await closeSheets(page);
  return page;
}

async function closeSheets(page) {
  for (let i = 0; i < 8; i++) {
    if (!(await page.locator('#sheet').isVisible().catch(() => false))) break;
    if (await page.locator('#sheet-close').isVisible().catch(() => false)) await page.locator('#sheet-close').click().catch(() => 0);
    else await page.keyboard.press('Escape');
    await page.waitForTimeout(450);
  }
  if (await page.locator('.pc-menu').isVisible().catch(() => false)) {
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);
  }
}

async function toMarket(page) {
  await closeSheets(page);
  if (await page.locator('#screen-market').isVisible().catch(() => false)) return;
  if (await page.locator('#pc').isVisible().catch(() => false)) {
    await page.keyboard.press('4');
    await page.waitForTimeout(500);
    for (let i = 0; i < 3 && !(await page.locator('#screen-market').isVisible()); i++) {
      await page.keyboard.press('e');
      await page.waitForTimeout(600);
    }
  } else {
    await page.evaluate(() => document.querySelector('.appbar .icon-btn')?.click());
    await page.waitForTimeout(400);
    await page.locator('.drawer-link[data-link="market"]').click();
  }
  await until(() => page.locator('#screen-market').isVisible(), 5000);
  await page.waitForTimeout(700);
}

const tiles = (page) => page.locator('#market-list .ah-lot');
const titles = (page) => page.$$eval('#market-list .ah-lot .card', (n) => n.map((c) => c.querySelector('.card-title, h3, .title')?.textContent?.trim() ?? c.textContent.trim()));
const walletOf = (id) => econDb.users.get(id)?.wallet.coins ?? null;
const cardsOf = (id) => econDb.users.get(id)?.cards ?? new Map();
const toasts = (page) => page.evaluate(() => window.__toasts.join(' | '));
const feed = (page) => page.evaluate(() => (JSON.parse(localStorage.getItem('wikster.profile.v1') ?? '{}').notifFeed ?? []).map((n) => n.title).join(' | '));
const tab = (page, view) => page.locator(`#market-seg .ah-tab[data-view="${view}"]`).click().then(() => page.waitForTimeout(700));
const overflow = (page) => page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1
  || [...document.querySelectorAll('#screen-market *')].some((n) => { const r = n.getBoundingClientRect(); return r.width > 0 && r.right > window.innerWidth + 1 && !n.closest('.ah-chips, .ah-tabs, .market-views'); }));

const bea = await player(B);
const sam = await player(S);
const cal = await player(C, { pc: true });
check('everyone is on the server economy', await bea.evaluate(() => window.__wikster.serverEconomy()) && await sam.evaluate(() => window.__wikster.serverEconomy()) && await cal.evaluate(() => window.__wikster.serverEconomy()));
check('the seller cards reached the server with their prints', cardsOf(S).get('en:Cat')?.copies === 3, JSON.stringify(cardsOf(S).get('en:Cat')?.prints));

section('browse and filter');
await toMarket(bea);
check('the floor lists the open lots', await until(() => tiles(bea).count().then((n) => n === 3)), String(await tiles(bea).count()));
check('each lot shows a live countdown', await bea.locator('#market-list [data-ends]').count() === 3);
const t1 = await bea.locator('#market-list [data-ends]').first().textContent();
await bea.waitForTimeout(1300);
check('that ticks', (await bea.locator('#market-list [data-ends]').first().textContent()) !== t1);
check('a buy now price is shown on the tile', /now/i.test(await bea.locator('#market-list .ah-buy').first().textContent()));
check('the phone layout does not spill sideways', !(await overflow(bea)));
await bea.locator('#market-tools .ah-search').fill('turing');
check('search by title asks the server', await until(() => tiles(bea).count().then((n) => n === 1)));
await bea.locator('#market-tools .ah-search').fill('');
await until(() => tiles(bea).count().then((n) => n === 3));
await bea.locator('#market-tools [data-toggle="buyout"]').click();
check('buy now only', await until(() => tiles(bea).count().then((n) => n === 1)));
await bea.locator('#market-tools [data-toggle="buyout"]').click();
await bea.locator('#market-tools [data-toggle="soon"]').click();
check('ending within the hour', await until(() => tiles(bea).count().then((n) => n === 1)) && /Alan Turing/.test(await tiles(bea).first().textContent()));
await bea.locator('#market-tools [data-toggle="soon"]').click();
await until(() => tiles(bea).count().then((n) => n === 3));
await bea.locator('#market-tools [data-filters]').click();
await bea.waitForTimeout(400);
await bea.locator('#sheet .ah-rarity[data-rarity="epic"]').click();
await pickOption(bea, bea.locator('#sheet [data-album]'), 'history');
await bea.locator('#sheet [data-apply]').click();
check('the filter sheet narrows by rarity and album', await until(() => tiles(bea).count().then((n) => n === 1)) && /Ada Lovelace/.test(await tiles(bea).first().textContent()));
check('and says how many filters are on', /\(2\)/.test(await bea.locator('#market-tools [data-filters]').textContent()));
await bea.locator('#market-tools [data-filters]').click();
await bea.waitForTimeout(400);
await bea.locator('#sheet .btn-ghost', { hasText: /clear/i }).click();
await until(() => tiles(bea).count().then((n) => n === 3));
await pickOption(bea, bea.locator('#market-tools [data-sort]'), 'price_desc');
check('sorting by price puts the dearest first', await until(async () => /Alan Turing/.test(await tiles(bea).first().textContent())));
await pickOption(bea, bea.locator('#market-tools [data-sort]'), 'ending');
await bea.waitForTimeout(600);

section('listing a print');
await toMarket(sam);
await sam.locator('#market-sell').click();
await sam.waitForTimeout(500);
check('the picker lists my cards', await sam.locator('#sheet .ah-cell').count() === 2);
await sam.locator('#sheet .ah-cell[data-key="en:Cat"]').click();
await sam.waitForTimeout(500);
check('only spare prints are offered', await sam.locator('#sheet .ah-rarity[data-print]').count() === 2);
check('the lowest spare is picked first', await sam.locator('#sheet .ah-rarity.is-on[data-print="common"]').count() === 1);
await sam.locator('#sheet .ah-rarity[data-print="rare"]').click();
await sam.waitForTimeout(300);
check('the price follows the print value', Number(await sam.locator('#sheet [data-price]').inputValue()) === 300);
check('the fee is spelled out', /keeps 5%/.test(await sam.locator('#sheet .ah-note').textContent()));
await sam.locator('#sheet [data-price]').fill('100');
await sam.locator('#sheet [data-buyout]').fill('400');
await sam.locator('#sheet .market-duration[data-minutes="60"]').click();
await sam.locator('#sheet [data-go]').click();
check('the lot is listed on the server with that print', await until(() => db.auctions.some((a) => a.seller === S && a.rarity === 'rare' && a.buyout === 400)));
const catLot = db.auctions.find((a) => a.seller === S && a.card.key === 'en:Cat');
check('the rare spare left the collection', cardsOf(S).get('en:Cat')?.copies === 2 && JSON.stringify(cardsOf(S).get('en:Cat')?.prints) === JSON.stringify({ common: 1, rare: 1 }), JSON.stringify(cardsOf(S).get('en:Cat')));
check('the selling tab opens with the new lot', await until(() => sam.locator('#market-seg .ah-tab.is-on[data-view="selling"]').count().then((n) => n === 1)) && await until(() => tiles(sam).count().then((n) => n === 1)));
check('and counts it', /1/.test(await sam.locator('#market-seg .ah-tab[data-view="selling"]').textContent()));

section('bidding, outbid live');
await pickOption(bea, bea.locator('#market-tools [data-sort]'), 'newest');
check('the new lot reaches the other player', await until(() => bea.locator(`#market-list .ah-lot[data-id="${catLot.id}"]`).count().then((n) => n === 1)));
await bea.locator(`#market-list .ah-lot[data-id="${catLot.id}"] .card`).click();
await bea.waitForTimeout(800);
check('the lot sheet shows the print', /rare/i.test(await bea.locator('#sheet .ah-lines').textContent()));
check('quick bids are offered', await bea.locator('#sheet .ah-step').count() === 3);
check('and the buyout', /400/.test(await bea.locator('#sheet [data-buy]').textContent()));
await bea.locator('#sheet [data-go]').click();
check('the bid button shows it is sending', await bea.locator('#sheet [data-go].is-pending, #sheet .ah-note.is-good').count() >= 1);
check('the bid lands on the server', await until(() => catLot.bidder === B && catLot.current_bid === 100));
check('the coins are held', await until(() => walletOf(B) === 4900));
check('the sheet says I lead', await until(() => bea.locator('#sheet .ah-note.is-good').count().then((n) => n === 1)));
check('my bid is in the history', await until(async () => /you/i.test(await bea.locator('#sheet .ah-bid.is-me').first().textContent())));
check('the seller sees the bid come in live', await until(async () => /bids are in/i.test(await tiles(sam).first().textContent())));
await closeSheets(bea);

await toMarket(cal);
check('the PC layout shows the floor', await until(() => tiles(cal).count().then((n) => n === 4)));
check('with the tools on one row', await cal.evaluate(() => {
  const s = document.querySelector('#market-tools .ah-search').getBoundingClientRect();
  const c = document.querySelector('#market-tools .ah-chips').getBoundingClientRect();
  return Math.abs(s.top - c.top) < 30;
}));
await cal.locator(`#market-list .ah-lot[data-id="${catLot.id}"] .card`).click();
await cal.waitForTimeout(800);
check('the floor for the next bid is the step over the current one', Number(await cal.locator('#sheet [data-bid]').inputValue()) === 105);
await cal.locator('#sheet [data-bid]').fill('104');
await cal.locator('#sheet [data-go]').click();
await cal.waitForTimeout(500);
check('a bid under the floor is refused at once', catLot.current_bid === 100 && /too low/i.test(await toasts(cal)));
await cal.locator('#sheet .ah-step').nth(1).click();
const raised = Number(await cal.locator('#sheet [data-bid]').inputValue());
await cal.locator('#sheet [data-go]').click();
check('the +10% bid lands', await until(() => catLot.bidder === C && catLot.current_bid === raised), String(raised));
check('the outbid bidder gets the coins back at once', await until(() => walletOf(B) === 5000));
check('and hears about it', await until(async () => /outbid on cat/i.test(await feed(bea))), await feed(bea));
check('the wallet on screen follows', await until(() => bea.evaluate(() => window.__wikster.state.wallet === 5000)));
await toMarket(bea);
await tab(bea, 'bidding');
check('my bids show the lot as outbid', await until(async () => /outbid/i.test(await tiles(bea).first().textContent())));
check('with an alert on the tab', await bea.locator('#market-seg .ah-tab.is-alert[data-view="bidding"]').count() === 1);
await closeSheets(cal);

section('buy now');
await tiles(bea).first().locator('.card').click();
await bea.waitForTimeout(800);
await bea.locator('#sheet [data-buy]').click();
check('buying out closes the lot', await until(() => catLot.outcome === 'bought'));
check('the buyer pays the buyout', await until(() => walletOf(B) === 4600));
check('the rare print lands in the collection', await until(() => cardsOf(B).get('en:Cat')?.rarity_id === 'rare'));
check('and on the phone', await until(() => bea.evaluate(() => Boolean(window.__wikster.state.collection.entries['en:Cat']))));
check('the seller is paid less the fee', await until(() => walletOf(S) === 1000 + 380));
check('the seller hears it sold', await until(async () => /cat sold for 400/i.test(await feed(sam))), await feed(sam));
check('the other bidder is refunded', await until(() => walletOf(C) === 5000));
await closeSheets(bea);

section('expiry');
await toMarket(sam);
await sam.locator('#market-sell').click();
await sam.waitForTimeout(500);
await sam.locator('#sheet .ah-cell[data-key="en:Mars"]').click();
await sam.waitForTimeout(400);
check('a single copy offers its only print', await sam.locator('#sheet .ah-rarity[data-print="epic"]').count() === 1);
await sam.locator('#sheet [data-price]').fill('50');
await sam.locator('#sheet [data-go]').click();
check('the single copy is listed', await until(() => db.auctions.some((a) => a.card.key === 'en:Mars' && a.status === 'open')));
const marsLot = db.auctions.find((a) => a.card.key === 'en:Mars');
await sam.locator('#market-sell').click();
await sam.waitForTimeout(500);
await sam.locator('#sheet .ah-cell[data-key="en:Cat"]').click();
await sam.waitForTimeout(400);
await sam.locator('#sheet [data-price]').fill('10');
await sam.locator('#sheet [data-go]').click();
check('a second lot is listed', await until(() => db.auctions.some((a) => a.card.key === 'en:Cat' && a.status === 'open' && a.rarity === 'common')));
const unsoldLot = db.auctions.find((a) => a.card.key === 'en:Cat' && a.status === 'open');
const marsRes = await db.market.p2p(C, 'market_bid', { p_id: marsLot.id, p_amount: 50 });
check('a bid from another device', marsRes.ok && walletOf(C) === 4950);
marsLot.ends_at = new Date(Date.now() + 2500).toISOString();
unsoldLot.ends_at = new Date(Date.now() + 2500).toISOString();
await tab(sam, 'selling');
check('the countdown reaches the end on screen', await until(async () => /ended/i.test(await sam.locator('#market-list').textContent()), 8000));
check('the lots settle by themselves', await until(() => marsLot.outcome === 'sold' && unsoldLot.outcome === 'unsold', 10000), `${marsLot.outcome} ${unsoldLot.outcome}`);
check('the winner gets the card', cardsOf(C).has('en:Mars'));
check('the seller is paid 47 of 50', walletOf(S) === 1380 + 47);
check('the unsold spare comes home', await until(() => cardsOf(S).get('en:Cat')?.copies === 2), JSON.stringify(cardsOf(S).get('en:Cat')));
check('the seller hears both', await until(async () => /mars sold/i.test(await feed(sam)) && /did not sell/i.test(await feed(sam))), await feed(sam));
check('the winner hears it on the PC', await until(async () => /you won mars/i.test(await feed(cal))), await feed(cal));

section('history');
await tab(sam, 'history');
check('the seller history has the sales and the unsold lot', await until(async () => {
  const text = await sam.locator('#market-list').textContent();
  return await sam.locator('#market-list .ah-band.is-good').count() === 2 && /not sold/i.test(text);
}), JSON.stringify((await db.market.mine(S, 'history')).rows.map((r) => [r.title, r.role])));
await tab(bea, 'history');
check('the buyer history shows the win', await until(async () => /won for/i.test(await bea.locator('#market-list').textContent())));
await toMarket(cal);
await cal.locator('#market-seg .ah-tab[data-view="history"]').click();
check('the PC history shows the lost and the won lot', await until(async () => {
  const text = await cal.locator('#market-list').textContent();
  return /lost at/i.test(text) && /won for/i.test(text);
}), await cal.locator('#market-list').textContent());

section('withdrawing');
await tab(sam, 'browse');
await sam.locator('#market-sell').click();
await sam.waitForTimeout(500);
await sam.locator('#sheet .ah-cell[data-key="en:Cat"]').click();
await sam.waitForTimeout(400);
await sam.locator('#sheet [data-go]').click();
check('a copy is listed', await until(() => cardsOf(S).get('en:Cat')?.copies === 1));
await until(() => tiles(sam).count().then((n) => n >= 1));
await tiles(sam).first().locator('.card').click();
await sam.waitForTimeout(800);
check('a lot without bids offers to withdraw', await sam.locator('#sheet [data-cancel]').count() === 1);
await sam.locator('#sheet [data-cancel]').click();
check('withdrawing brings the card back', await until(() => cardsOf(S).get('en:Cat')?.copies === 2));
check('and empties the selling tab', await until(() => tiles(sam).count().then((n) => n === 0)));

section('pending and last known data');
await closeSheets(bea);
await tab(bea, 'browse');
await until(() => tiles(bea).count().then((n) => n >= 3));
await bea.route('https://stub.supabase.co/rest/v1/rpc/market_browse', async (route) => { await sleep(2500); return route.fallback(); });
await bea.evaluate(() => document.querySelector('.nav-item[data-tab="packs"]')?.click());
await bea.waitForTimeout(400);
await toMarket(bea);
check('going back to the market shows the last lots at once', (await tiles(bea).count()) >= 3);
check('with a refresh mark while it asks', await bea.locator('#market-list.is-refreshing').count() === 1);
await bea.waitForTimeout(3000);
await bea.unroute('https://stub.supabase.co/rest/v1/rpc/market_browse');
const ECON_URL = /^https:\/\/stub\.supabase\.co\/functions\/v1\/economy(\?.*)?$/;
await bea.route(ECON_URL, async (route) => { await sleep(1800); return route.fallback(); });
await tiles(bea).filter({ hasText: 'Grace Hopper' }).first().locator('.card').click();
await bea.waitForTimeout(800);
await bea.locator('#sheet [data-go]').click();
await bea.waitForTimeout(150);
check('a slow bid marks its button at once', await bea.locator('#sheet [data-go].is-pending').count() === 1);
check('and shows the lot as mine already', /you lead/i.test(await tiles(bea).filter({ hasText: 'Grace Hopper' }).first().textContent()));
check('the bid still lands', await until(() => db.auctions.find((a) => a.card.title === 'Grace Hopper')?.bidder === B, 8000));
await bea.unroute(ECON_URL);
await closeSheets(bea);

section('PC layout');
await closeSheets(cal);
await cal.locator('#market-seg .ah-tab[data-view="browse"]').click();
await cal.waitForTimeout(800);
check('no horizontal spill on PC', !(await overflow(cal)));
await sam.screenshot({ path: 'market-phone.png' });
await cal.screenshot({ path: 'market-pc.png' });

check('no page errors', errors.length === 0, errors.join(' | '));
await browser.close();
console.log(fails ? `\n${fails} FAILED` : '\nALL PASS');
process.exit(fails ? 1 : 0);
