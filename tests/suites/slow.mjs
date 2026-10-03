import { chromium, devices } from 'playwright';
import { launchOptions } from '../lib/browser.mjs';
import { installStubs } from '../lib/stubs.mjs';
import { installSupabase, newDatabase } from '../lib/supastub.mjs';

let fails = 0;
const check = (l, c, e = '') => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${e ? '  ' + e : ''}`); };
const section = (s) => console.log(`\n== ${s}`);
const browser = await chromium.launch(launchOptions());
const errors = [];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 15000) => {
  const end = Date.now() + ms;
  for (;;) {
    let ok = false;
    try { ok = await fn(); } catch { ok = false; }
    if (ok || Date.now() > end) return ok;
    await sleep(150);
  }
};

const FAST = 300;
const ME = '00000000-0000-4000-8000-000000000001';
const FR = '00000000-0000-4000-8000-000000000002';
const PX = 'data:image/gif;base64,R0lGODlhAQABAAAAACw=';
const card = (key, title, rarityId, price, extra = {}) => ({
  key, title, rarityId, price, views: 400000, popularity: 0.7, count: 1, favorite: false,
  packId: 'theme|history', packName: 'History', lang: 'en', thumbnail: PX,
  firstPulledAt: 1, lastPulledAt: 1, description: 'A thing', extract: 'Some words.', ...extra
});
const MINE = {
  'en:Cat': card('en:Cat', 'Cat', 'rare', 300, { count: 3 }),
  'en:Dog': card('en:Dog', 'Dog', 'epic', 800, { count: 2 }),
  'en:Mars': card('en:Mars', 'Mars', 'common', 40)
};
const THEIRS = {
  'en:Ada_Lovelace': card('en:Ada_Lovelace', 'Ada Lovelace', 'epic', 900),
  'en:Alan_Turing': card('en:Alan_Turing', 'Alan Turing', 'legendary', 1600)
};
const now = Date.now();
const iso = (ms = 0) => new Date(now + ms).toISOString();

const db = newDatabase();
db.users.set('p@example.test', { id: ME, password: 'hunter2hunter2', meta: { age_13_plus: true } });
db.users.set('g@example.test', { id: FR, password: 'hunter2hunter2', meta: { age_13_plus: true } });
db.profiles.set(ME, { id: ME, username: 'player', created_at: iso(-86400000), level: 6, cards: 6, unique_cards: 3, boosters_opened: 4, collection_value: 1200, play_ms: 60000 });
db.profiles.set(FR, { id: FR, username: 'grace_h', created_at: iso(-86400000), level: 8, cards: 2, unique_cards: 2, boosters_opened: 9, collection_value: 2500, play_ms: 90000,
  showcase: [{ key: 'en:Alan_Turing', title: 'Alan Turing', rarityId: 'legendary', price: 1600, views: 400000, thumbnail: PX, lang: 'en' }] });
db.saves.set(FR, { user_id: FR, data: { format: 'wikster-save', version: 2, at: now - 60000, data: { 'wikster.collection.v3': JSON.stringify({ entries: THEIRS }) }, stamps: {} }, updated_at: iso(-60000) });
db.friendships.push({ id: 'f1', requester: ME, addressee: FR, status: 'accepted', created_at: iso(-3600000) });
db.auctions.push({
  id: '00000000-0000-4000-8000-00000000a001', seller: FR, seller_name: 'grace_h',
  card: { key: 'en:Ada_Lovelace', title: 'Ada Lovelace', rarityId: 'epic', price: 900, thumbnail: PX },
  start_price: 500, current_bid: null, bidder: null, bidder_name: null, bid_count: 0,
  ends_at: iso(3600000), status: 'open', created_at: iso(-60000)
});
for (const [i, title] of ['Ada Lovelace', 'Alan Turing', 'Grace Hopper', 'Marie Curie'].entries()) {
  const key = `en:${title.replace(/ /g, '_')}`;
  db.codex.set(key, { key, title, rarity: 'epic', price: 900, views: 300000, thumbnail: PX, lang: 'en', found_at: iso(-1000 * (i + 1)) });
}

const ctx = await browser.newContext({ serviceWorkers: 'block', ...devices['Pixel 7'] });
const page = await ctx.newPage();
page.on('pageerror', (e) => errors.push(`PAGE: ${e.message}`));
installStubs(page);
await installSupabase(page, { db });
let slowMs = 0;
await page.route(/stub\.supabase\.co\/rest\/v1\//, async (route) => {
  if (slowMs && route.request().method() !== 'OPTIONS') await sleep(slowMs);
  return route.fallback();
});
await page.addInitScript(({ cards }) => {
  if (localStorage.getItem('wikster.profile.v1')) return;
  const day = Math.floor(Date.now() / 86400000);
  localStorage.setItem('wikster.language', 'en');
  localStorage.setItem('wikster.profile.v1', JSON.stringify({
    started: true, createdAt: Date.now(), playMs: 60000, boostersOpened: 4, rarityCounts: {},
    progress: { level: 6, xp: 10 }, pendingLevels: [],
    daily: { v: 2, day: 1, weeks: 0, lastDay: day, shownDay: day },
    timed: { count: 0, stamp: Date.now() }, freeTaken: { window: 0, ids: [] }
  }));
  localStorage.setItem('wikster.wallet.v1', '50000');
  localStorage.setItem('wikster.collection.v3', JSON.stringify({ entries: cards }));
}, { cards: MINE });
await page.goto(process.env.BASE_URL ?? 'http://127.0.0.1:4173/', { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(2200);

const closeSheets = async () => {
  for (let i = 0; i < 8; i++) {
    if (!(await page.locator('#sheet').isVisible().catch(() => false))) break;
    await page.keyboard.press('Escape');
    await page.waitForTimeout(250);
  }
};
const viaDrawer = async (link) => {
  await page.evaluate(() => document.querySelector('.appbar .icon-btn')?.click());
  await page.waitForTimeout(400);
  await page.locator(`.drawer-link[data-link="${link}"]`).click();
  await page.waitForTimeout(500);
};
const tapAndSee = (tap, see, ms = FAST) => page.evaluate(async ({ tap, see, ms }) => {
  const node = typeof tap === 'string' ? document.querySelector(tap) : null;
  if (!node) return { ok: false, why: `no ${tap}` };
  const t0 = performance.now();
  node.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerType: 'touch' }));
  node.click();
  node.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerType: 'touch' }));
  while (performance.now() - t0 < ms) {
    if (document.querySelector(see)) return { ok: true, ms: Math.round(performance.now() - t0) };
    await new Promise((r) => setTimeout(r, 10));
  }
  return { ok: false, why: `nothing matched ${see} within ${ms} ms` };
}, { tap, see, ms });
const toastText = () => page.evaluate(() => (document.querySelector('#toast.is-showing')?.textContent ?? '').replace(/\s+/g, ' ').trim());

await closeSheets();
section('sign in while the server is quick');
if (!(await page.locator('#gate-form').isVisible().catch(() => false))) {
  await page.evaluate(() => document.querySelector('.appbar .icon-btn')?.click());
  await page.waitForTimeout(400);
  await page.locator('.drawer-link[data-link="account"], .drawer-link[data-link="friends"]').first().click();
  await page.waitForTimeout(900);
}
if (await page.locator('#gate-seg .seg-option[data-value="in"]').count()) {
  await page.locator('#gate-seg .seg-option[data-value="in"]').click();
  await page.waitForTimeout(200);
}
await page.locator('#gate-form input[name="email"]').fill('p@example.test');
await page.locator('#gate-form input[name="password"]').fill('hunter2hunter2');
if (await page.locator('#gate-form input[name="age"]').count()) await page.locator('#gate-form input[name="age"]').fill('30');
await page.locator('#gate-form button[type="submit"]').click();
check('signed in', await until(() => page.evaluate(() => Boolean(window.__wikster.state.account.session))));
await page.waitForTimeout(1500);
await closeSheets();
await viaDrawer('friends');
check('the friend is listed', await until(() => page.locator('#friends-list .person').count().then((n) => n > 0)));
await page.locator('#friends-list .person').first().click();
check('the friend screen is up', await until(() => page.locator('#screen-friend').isVisible()));
await page.waitForTimeout(800);
await page.locator('#friend-actions .btn-primary').click();
check('the chat is up', await until(() => page.locator('#screen-chat').isVisible()));
await page.waitForTimeout(800);

section('chat on a slow server');
slowMs = 3000;
await page.locator('#chat-input').fill('hello from a slow line');
let seen = await tapAndSee('#chat-send', '#chat-log .bubble.is-sending');
check('the message shows at once, marked as sending', seen.ok, JSON.stringify(seen));
check('with the words typed', /hello from a slow line/.test(await page.locator('#chat-log').textContent()));
check('the box is cleared for the next one', (await page.locator('#chat-input').inputValue()) === '');
check('it settles once the server answers', await until(() => page.evaluate(() =>
  !document.querySelector('#chat-log .bubble.is-sending') && /hello from a slow line/.test(document.querySelector('#chat-log').textContent)), 15000));
check('the server has it', db.messages.some((m) => m.body === 'hello from a slow line'));
check('one copy on screen', (await page.locator('#chat-log .bubble', { hasText: 'hello from a slow line' }).count()) === 1);

section('the trade sheet opens before the friend\'s cards arrive');
seen = await tapAndSee('#chat-tools .chat-tool:nth-child(2)', '#sheet [data-ask] .is-pending');
check('the sheet is up with a loading line', seen.ok, JSON.stringify(seen));
check('my side is already pickable', (await page.locator('#sheet [data-give] .pick-row').count()) === 3);
check('their cards fill in after', await until(() => page.locator('#sheet [data-ask] .pick-row').count().then((n) => n === 2), 12000));
await closeSheets();

section('a gift on a slow server');
await page.locator('#chat-tools .chat-tool').first().click();
await page.waitForTimeout(500);
await page.locator('#sheet .gift-choice').first().click();
await until(() => page.locator('#sheet .pick-row').count().then((n) => n > 0), 4000);
await page.waitForTimeout(400);
seen = await tapAndSee('#sheet .pick-row', '#sheet .pick-row.is-pending');
check('the pressed row shows it is sending', seen.ok, JSON.stringify(seen));
check('the other rows stay usable', (await page.locator('#sheet .pick-row:not(.is-pending):not([disabled])').count()) >= 1);
await page.evaluate(() => document.querySelector('#sheet .pick-row.is-pending')?.click());
await page.waitForTimeout(80);
check('a second tap says it is still sending', /still sending/i.test(await toastText()), await toastText());
check('the gift lands', await until(() => db.deliveries.length === 1, 12000), String(db.deliveries.length));
check('the sheet closes after', await until(() => page.locator('#sheet').isHidden(), 3000));

section('kudos answer the tap, not the server');
await page.locator('#chat-who').click();
check('the friend screen is up', await until(() => page.locator('#screen-friend').isVisible(), 4000));
check('the showcase heart is there before the server answers', await until(() => page.locator('.showcase-kudos').count().then((n) => n === 1), 1500));
seen = await tapAndSee('.showcase-kudos', '.showcase-kudos.is-on');
check('the heart fills at once', seen.ok, JSON.stringify(seen));
check('and counts it', (await page.locator('.showcase-kudos').textContent()).trim() === '1');
check('the server gets it', await until(() => db.kudos.length === 1, 12000), String(db.kudos.length));
check('the heart is still on', await page.locator('.showcase-kudos.is-on').count() === 1);

section('a lot on a slow market');
slowMs = 0;
await viaDrawer('market');
check('the lot is listed', await until(() => page.locator('.auction-tile').count().then((n) => n === 1), 6000));
await page.locator('.auction-tile .card').first().click();
await page.waitForTimeout(800);
await closeSheets();
slowMs = 3000;
seen = await tapAndSee('.auction-tile .card', '#sheet .ah-sheet .ah-lines .market-line');
check('the lot sheet opens from what is known', seen.ok, JSON.stringify(seen));
check('with the floor of the next bid ready', Number(await page.locator('#sheet [data-bid]').inputValue()) === 500);
await page.waitForTimeout(3500);
check('the bid history fills in once the server answers', /no bids yet/i.test(await page.locator('#sheet .ah-history').textContent()));
await closeSheets();
check('going back to the market shows the lot at once', await (async () => {
  await viaDrawer('friends');
  await page.waitForTimeout(300);
  await page.evaluate(() => document.querySelector('.appbar .icon-btn')?.click());
  await page.waitForTimeout(400);
  await page.locator('.drawer-link[data-link="market"]').click();
  await page.waitForTimeout(150);
  return (await page.locator('.auction-tile').count()) === 1;
})());
check('with a refresh mark while it asks', await page.locator('#market-list.is-refreshing').count() === 1);
await page.waitForTimeout(3500);

section('card index search while a page loads');
slowMs = 2000;
await viaDrawer('cardindex');
await page.locator('#index-search').fill('ada');
await page.waitForTimeout(600);
await page.locator('#index-search').fill('turing');
check('the latest search wins', await until(() => page.evaluate(() => {
  const titles = [...document.querySelectorAll('#index-list .card-title')].map((n) => n.textContent);
  return titles.length === 1 && /turing/i.test(titles[0]);
}), 12000), (await page.locator('#index-list .card-title').allTextContents()).join(', '));
await page.locator('#index-search').fill('');
await page.waitForTimeout(3000);

section('a button never stays stuck');
slowMs = 11500;
await viaDrawer('friends');
await page.locator('#friends-list .person').first().click();
await until(() => page.locator('#screen-friend').isVisible(), 4000);
await page.waitForTimeout(400);
await page.locator('#friend-actions .btn-primary').click();
await until(() => page.locator('#screen-chat').isVisible(), 4000);
await page.waitForTimeout(400);
await page.locator('#chat-tools .chat-tool').first().click();
await page.waitForTimeout(500);
await page.locator('#sheet .gift-choice').first().click();
await page.waitForTimeout(600);
seen = await tapAndSee('#sheet .pick-row', '#sheet .pick-row.is-pending');
check('pending at once', seen.ok, JSON.stringify(seen));
await page.waitForTimeout(10300);
check('after ten seconds the button lets go', await page.locator('#sheet .pick-row.is-pending').count() === 0);
check('and says the server is slow', /still sending/i.test(await toastText()), await toastText());
check('the gift still lands in the end', await until(() => db.deliveries.length === 2, 8000), String(db.deliveries.length));
slowMs = 0;
await closeSheets();

const real = errors.filter((e) => !/Target page, context or browser has been closed/.test(e));
check('no page errors', real.length === 0, real.join(' | '));
await browser.close();
console.log(fails ? `\n${fails} FAILED` : '\nALL PASS');
process.exit(fails ? 1 : 0);
