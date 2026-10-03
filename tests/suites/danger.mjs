import { chromium, devices } from 'playwright';
import { launchOptions } from '../lib/browser.mjs';
import { installStubs } from '../lib/stubs.mjs';
import { economyStub, installSupabase, newDatabase } from '../lib/supastub.mjs';
import { createEconDb } from '../lib/econdb.mjs';
import { RELEASES } from '../../src/data/releases.js';

const engine = await import('../../supabase/functions/economy/engine.js');

let fails = 0;
const check = (l, c, e = '') => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${e ? '  ' + e : ''}`); };
const section = (s) => console.log(`\n== ${s}`);
const browser = await chromium.launch(launchOptions());
const errors = [];
const BASE = process.env.BASE_URL ?? 'http://127.0.0.1:4173/';
const until = async (fn, ms = 15000) => {
  const end = Date.now() + ms;
  for (;;) {
    let ok = false;
    try { ok = await fn(); } catch { ok = false; }
    if (ok || Date.now() > end) return ok;
    await new Promise((r) => setTimeout(r, 250));
  }
};

const P = '00000000-0000-4000-8000-0000000000d1';
const F = '00000000-0000-4000-8000-0000000000d2';
const G = '00000000-0000-4000-8000-0000000000d3';
const B = '00000000-0000-4000-8000-0000000000d4';
const EMAIL = 'danger@example.test';
const now = Date.now();
const iso = (ms) => new Date(ms).toISOString();
const PX = 'data:image/gif;base64,R0lGODlhAQABAAAAACw=';
const SPEC = { kind: 'theme', themeId: 'animals', rarityId: null, cards: 5 };
const SPEC_ID = 'theme|animals|std|5';
const CODE = { kind: 'code', codeId: 'hello', cards: 3 };
const CODE_ID = 'code|hello';

const db = newDatabase();
const econDb = createEconDb();
econDb.cutover = now - 86400000;
const economy = economyStub(engine, econDb);

for (const [id, name, email] of [[P, 'danger_p', EMAIL], [F, 'danger_f', 'f@example.test'], [G, 'danger_g', 'g@example.test'], [B, 'danger_b', 'b@example.test']]) {
  db.users.set(email, { id, email, password: 'hunter2hunter2', meta: { age_13_plus: true } });
  db.profiles.set(id, { id, username: name, created_at: iso(now - 86400000 * 5), level: 5, cards: 3, unique_cards: 3,
    boosters_opened: 9, collection_value: 900, play_ms: 3600000, badges: { worn: ['x'] }, showcase: ['en:Cat'] });
  econDb.born.set(id, now - 86400000 * 5);
}
db.tokens.set(`tok-${P}`, P);

await econDb.store(P).apply({
  coins: 5000, ink: 30,
  add: [
    { key: 'en:Cat', title: 'Cat', rarityId: 'rare', price: 300, copies: 2, data: { thumbnail: PX } },
    { key: 'en:Dog', title: 'Dog', rarityId: 'epic', price: 900, data: { thumbnail: PX } },
    { key: 'en:Gift', title: 'Gift', rarityId: 'special', data: { special: 'hello', thumbnail: PX } }
  ],
  inventory: [{ spec_id: SPEC_ID, spec: SPEC, delta: 2 }, { spec_id: CODE_ID, spec: CODE, delta: 1 }],
  state: {
    imported: true, started: true, createdAt: now - 86400000 * 5, progress: { level: 5, xp: 10 }, pendingLevels: [],
    achievements: { 'pack-1': now - 1000 }, owned: { supporter: ['contributor'], themes: ['folio', 'noir'] }
  }
});
await econDb.store(F).apply({ coins: 1000 });

const seedSocial = () => {
  db.friendships.push({ id: 'fr-1', requester: P, addressee: F, status: 'accepted', created_at: iso(now - 9000) });
  db.messages.push({ id: 'm-1', sender: P, recipient: F, body: 'hello', created_at: iso(now - 8000), read_at: null },
    { id: 'm-2', sender: F, recipient: P, body: 'hi', created_at: iso(now - 7000), read_at: null });
  db.auctions.push(
    { id: 'au-p', seller: P, seller_name: 'danger_p', card: { key: 'en:Lot', title: 'Lot', rarityId: 'rare', price: 50 }, start_price: 50,
      current_bid: 100, bidder: B, bidder_name: 'danger_b', bid_count: 1, ends_at: iso(now + 3600000), status: 'open', created_at: iso(now - 6000) },
    { id: 'au-f', seller: F, seller_name: 'danger_f', card: { key: 'en:FLot', title: 'F lot', rarityId: 'common', price: 20 }, start_price: 20,
      current_bid: 40, bidder: P, bidder_name: 'danger_p', bid_count: 1, ends_at: iso(now + 3600000), status: 'open', created_at: iso(now - 5000) });
  db.auctionBids = [{ id: 1, auction: 'au-p', bidder: B, bidder_name: 'danger_b', amount: 100, buyout: false, at: iso(now - 6000) },
    { id: 2, auction: 'au-f', bidder: P, bidder_name: 'danger_p', amount: 40, buyout: false, at: iso(now - 5000) }];
  db.trades.push(
    { id: 'tr-in', proposer: F, recipient: P, offer: [{ key: 'en:FOffer', title: 'F offer', rarityId: 'rare', price: 50 }], ask: [], status: 'pending', created_at: iso(now - 4000) },
    { id: 'tr-out', proposer: P, recipient: F, offer: [{ key: 'en:POffer', title: 'P offer', rarityId: 'rare', price: 50 }], ask: [], status: 'pending', created_at: iso(now - 3000) });
  db.deliveries.push({ id: 'dl-in', sender: F, recipient: P, kind: 'card', payload: { key: 'en:Present', title: 'Present' }, created_at: iso(now - 2000), claimed_at: null });
  db.guilds.push({ id: 'gu-1', name: 'Erasers', tag: 'ERS', about: '', owner: P, members: 2, created_at: iso(now - 86400000) });
  db.guildMembers.push({ user_id: P, guild_id: 'gu-1', joined_at: iso(now - 86400000) }, { user_id: G, guild_id: 'gu-1', joined_at: iso(now - 3600000) });
};
seedSocial();

async function device(label, { pc = false, signedIn = true, extra = {} } = {}) {
  const ctx = await browser.newContext(pc
    ? { serviceWorkers: 'block', viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 1 }
    : { serviceWorkers: 'block', ...devices['Pixel 7'] });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(`${label} PAGE: ${e.message}`));
  installStubs(page);
  await installSupabase(page, { db, economy });
  await page.goto(BASE, { waitUntil: 'domcontentloaded' });
  await page.evaluate(({ signedIn, session, seen, extra }) => {
    localStorage.clear();
    localStorage.setItem('wikster.language', 'en');
    localStorage.setItem('wikster.seenRelease.v1', seen);
    if (signedIn) localStorage.setItem('wikster.auth', JSON.stringify(session));
    for (const [k, v] of Object.entries(extra)) localStorage.setItem(k, v);
  }, {
    signedIn,
    seen: RELEASES.at(-1).id,
    extra,
    session: {
      access_token: `tok-${P}`, token_type: 'bearer', expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600,
      refresh_token: `ref-${P}`,
      user: { id: P, aud: 'authenticated', role: 'authenticated', email: EMAIL, user_metadata: { age_13_plus: true }, app_metadata: {}, created_at: iso(now - 86400000 * 5) }
    }
  });
  await page.goto(BASE, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2400);
  await closeSheets(page);
  return page;
}

async function closeSheets(page) {
  for (let i = 0; i < 8; i++) {
    if (!(await page.locator('#sheet').isVisible().catch(() => false))) break;
    if (await page.locator('#sheet-close').isVisible().catch(() => false)) await page.locator('#sheet-close').click().catch(() => 0);
    else await page.keyboard.press('Escape');
    await page.waitForTimeout(350);
  }
}

async function settings(page) {
  await closeSheets(page);
  if (await page.locator('.pc-menu').count()) {
    const item = page.locator('.pc-menu-item[data-act="settings"]');
    for (let i = 0; i < 4 && !(await item.isVisible().catch(() => false)); i++) {
      await page.keyboard.press('Escape');
      await page.waitForTimeout(450);
    }
    await item.click();
  } else {
    await page.locator('#menu-btn').click();
    await page.waitForTimeout(450);
    await page.locator('.drawer-link[data-link="settings"]').click();
  }
  await page.waitForTimeout(700);
}

async function openDanger(page, which) {
  await settings(page);
  const group = await page.evaluate(() => document.querySelector('#data-list')?.closest('.pc-group')?.dataset.group ?? null);
  if (group) {
    await page.locator(`#screen-settings .pc-section-link[data-group="${group}"]`).click();
    await page.waitForTimeout(400);
  }
  await page.locator(`[data-danger="${which}"]`).scrollIntoViewIfNeeded();
  await page.locator(`[data-danger="${which}"]`).click();
  await page.waitForTimeout(500);
}

const server = () => econDb.users.get(P);
const local = (page, fn) => page.evaluate(fn);
const keysOf = (page) => local(page, () => Object.keys(window.__wikster.state.collection.entries));
const sheetText = (page) => page.locator('#sheet').textContent();
const toastText = (page) => page.locator('#toast').textContent().catch(() => '');
const goDisabled = (page) => page.locator('#sheet [data-danger-go]').isDisabled();

section('two devices signed into the same live account');
const phone = await device('phone');
const pc = await device('pc', { pc: true, extra: { 'wikster.uiScale.v1': '1', 'wikster.memo.guild': '{"owner":"x","value":1}' } });
check('the phone runs on the server economy', await until(() => local(phone, () => window.__wikster.serverEconomy())));
check('so does the computer', await until(() => local(pc, () => window.__wikster.serverEconomy())));
check('the computer has the PC layout', (await pc.locator('.pc-menu').count()) === 1);
check('both show the cards the server holds', await until(async () => (await keysOf(phone)).includes('en:Cat') && (await keysOf(pc)).includes('en:Dog')));

section('remove all cards: the dialog');
await openDanger(phone, 'cards');
const cardsSheet = await sheetText(phone);
check('a dialog says what goes', /Every card, except the special cards/.test(cardsSheet) && /auction house/.test(cardsSheet) && /1,500 Buckarooz|1 500 Buckarooz/.test(cardsSheet), cardsSheet.slice(0, 160));
check('and what stays', /What stays/.test(cardsSheet) && /level, experience and achievements/.test(cardsSheet) && /Ink/.test(cardsSheet));
check('and that it is once a month', /once a month/.test(cardsSheet));
check('the button waits for the typed word', await goDisabled(phone));
await phone.locator('#sheet [data-danger-word]').fill('remov');
check('a wrong word does not arm it', await goDisabled(phone));
await phone.locator('#sheet [data-danger-word]').fill('remove');
check('the right word arms it, in any case', !(await goDisabled(phone)));
await phone.locator('#sheet [data-danger-go]').click();

section('remove all cards: the server');
check('the server keeps only the special card', await until(() => [...server().cards.keys()].join() === 'en:Gift'), [...server().cards.keys()].join());
check('and only the code booster', [...server().inventory.keys()].join() === CODE_ID);
check('the Buckarooz go back to the start and the Ink stays', server().wallet.coins === 1500 && server().wallet.ink === 30, JSON.stringify(server().wallet));
check('the level and achievements stay', server().state.progress?.level === 5 && Boolean(server().state.achievements?.['pack-1']));
check('the lot is pulled and its bidder refunded straight into the wallet', db.auctions.find((a) => a.id === 'au-p').status === 'cancelled'
  && econDb.users.get(B)?.wallet.coins === 100 && !db.deliveries.some((d) => d.recipient === B));
check('the player\'s bid on another lot is withdrawn', db.auctions.find((a) => a.id === 'au-f').bidder === null && !db.auctionBids.some((b) => b.bidder === P));
check('a trade offered to the player is declined and the cards go home', db.trades.find((t) => t.id === 'tr-in').status === 'declined'
  && econDb.users.get(F).cards.has('en:FOffer'));
check('the player\'s own trade is cancelled', db.trades.find((t) => t.id === 'tr-out').status === 'cancelled');
check('gifts waiting for the player are dropped', !db.deliveries.some((d) => d.recipient === P && !d.claimed_at));
check('the theme is reset in the cloud too', db.saveKeys.find((r) => r.user_id === P && r.key === 'wikster.theme')?.value === 'aurora');
check('friends, messages and guild are untouched', db.friendships.length === 1 && db.messages.length === 2 && db.guilds[0].owner === P);

section('remove all cards: this device');
check('the collection shows only the special card', await until(async () => (await keysOf(phone)).join() === 'en:Gift'));
check('the wallet shows the starting amount', await local(phone, () => window.__wikster.state.wallet) === 1500);
check('the boosters show only the code one', JSON.stringify(Object.keys(await local(phone, () => window.__wikster.state.inventory))) === JSON.stringify([CODE_ID]));
check('the dialog closes', await until(async () => !(await phone.locator('#sheet').isVisible()), 4000));
check('with a clear message', await until(async () => /Collection emptied/.test(await toastText(phone)), 4000), await toastText(phone));
check('stale draws are forgotten', await local(phone, () => !JSON.parse(localStorage.getItem('wikster.ready.v1') ?? 'null')?.pulls?.some((p) => p.id === 'theme|animals|std|5')));
check('the theme is back to the default', await local(phone, () => localStorage.getItem('wikster.theme')) === 'aurora');

section('remove all cards: the other device hears it live');
check('the computer drops the cards too', await until(async () => (await keysOf(pc)).join() === 'en:Gift'), (await keysOf(pc)).join());
check('and its wallet', await until(() => local(pc, () => window.__wikster.state.wallet === 1500)));
check('and says why', await until(async () => /another device/.test(await toastText(pc)), 5000));

section('once a month');
await openDanger(phone, 'cards');
check('the dialog says when it can be done again', /You already did this this month/.test(await sheetText(phone)));
await phone.locator('#sheet [data-danger-word]').fill('REMOVE');
check('and keeps the button off', await goDisabled(phone));
await closeSheets(phone);

section('offline: refused, nothing changed');
const erasedBefore = db.erased.length;
await phone.context().setOffline(true);
await openDanger(phone, 'all');
await phone.locator('#sheet [data-danger-word]').fill('ERASE');
await phone.locator('#sheet [data-danger-go]').click();
await phone.waitForTimeout(600);
check('the dialog says it is offline and nothing changed', /offline, so nothing was changed/.test(await sheetText(phone)));
check('the server was not touched', db.erased.length === erasedBefore && server().wallet.coins === 1500);
await phone.context().setOffline(false);
await closeSheets(phone);
await phone.waitForTimeout(1200);

section('erase everything, from the computer');
await openDanger(pc, 'all');
const allSheet = await sheetText(pc);
check('the dialog lists friends, guild and backups as going', /friends, messages, challenges and wishlist/.test(allSheet) && /guild/.test(allSheet) && /cloud backups/.test(allSheet));
check('and the account, supporter perks and blocks as staying', /account, email and player name/.test(allSheet) && /Supporter badges/.test(allSheet) && /blocked/.test(allSheet));
const box = await pc.locator('#sheet [data-danger-go]').boundingBox();
check('the PC dialog fits the screen', Boolean(box) && box.y + box.height <= 1000 + 400);
await pc.locator('#sheet [data-danger-word]').fill('ERASE');
await pc.locator('#sheet [data-danger-go]').click();
check('the server empties the account', await until(() => server().cards.size === 0 && server().inventory.size === 0 && server().wallet.coins === 0 && server().wallet.ink === 0));
check('the progress goes, the paid supporter perks stay', !server().state.progress && JSON.stringify(server().state.owned) === JSON.stringify({ supporter: ['contributor'], themes: ['folio'] }));
check('the guild passes to the other member', db.guilds[0].owner === G && !db.guildMembers.some((m) => m.user_id === P));
check('friends and messages are gone', !db.friendships.some((f) => f.requester === P || f.addressee === P) && !db.messages.some((m) => m.sender === P || m.recipient === P));
check('the friend\'s chat is told to drop them', db.liveLog.some((l) => l.topic === `user:${F}` && l.event === 'removed'));
check('the new guild owner is told', db.liveLog.some((l) => l.topic === `user:${G}` && l.event === 'guild'));
check('the profile and theme keys are gone from the cloud', !db.saveKeys.some((r) => r.user_id === P && ['wikster.profile.v1', 'wikster.theme'].includes(r.key)) || db.saveKeys
  .filter((r) => r.user_id === P && r.key === 'wikster.profile.v1').every((r) => r.stamp > db.saveMeta.get(P).wipedAt));
check('the public profile starts over', db.profiles.get(P).level === 1 && db.profiles.get(P).play_ms === 0 && db.profiles.get(P).username === 'danger_p');
check('the account itself stays', [...db.users.values()].some((u) => u.id === P));

section('erase everything: both devices start over, still signed in');
for (const [label, page] of [['computer', pc], ['phone', phone]]) {
  check(`the ${label} reloads with an empty collection`, await until(async () => (await keysOf(page)).length === 0 && await local(page, () => window.__wikster.state.wallet === 0), 20000));
  check(`the ${label} is still signed in`, await until(() => local(page, () => Boolean(window.__wikster.state.account.session)), 8000));
  check(`the ${label} kept its language`, await local(page, () => localStorage.getItem('wikster.language')) === 'en');
}
check('the computer kept its display size but not the old caches', await local(pc, () => localStorage.getItem('wikster.uiScale.v1') === '1' && (JSON.parse(localStorage.getItem('wikster.memo.guild') ?? 'null')?.value ?? null) === null));
check('the stale ready draws and journal are gone', await local(pc, () => !localStorage.getItem('wikster.opening.v1')));

section('erase everything: the fresh start');
check('the phone greets a new player again', await until(() => phone.locator('#welcome').isVisible(), 8000));
await phone.locator('.lang-choice[data-lang="en"]').click();
await until(() => phone.locator('#starter-go').isVisible(), 8000);
await phone.locator('#starter-go').click();
check('and the starter kit can be claimed again on the server', await until(() => server().wallet.coins > 0 && server().state.started === true), JSON.stringify(server().wallet));
await until(async () => (await phone.locator('.tour').count()) > 0, 5000);
for (let i = 0; i < 12 && (await phone.locator('.tour').count()); i++) {
  if (await phone.locator('.tour [data-skip]').isVisible().catch(() => false)) await phone.locator('.tour [data-skip]').click();
  else await phone.locator('.tour [data-next]').click().catch(() => 0);
  await phone.waitForTimeout(350);
}
await closeSheets(phone);

section('delete account: refused while the server fails');
db.guilds.push({ id: 'gu-2', name: 'Leavers', tag: 'LVR', about: '', owner: P, members: 2, created_at: iso(now) });
db.guildMembers.push({ user_id: P, guild_id: 'gu-2', joined_at: iso(now - 7200000) }, { user_id: G, guild_id: 'gu-2', joined_at: iso(now - 3600000) });
db.guildMembers = db.guildMembers.filter((m) => !(m.user_id === G && m.guild_id === 'gu-1'));
db.deliveries.push({ id: 'dl-out', sender: P, recipient: F, kind: 'card', payload: { key: 'en:Bye', title: 'Bye' }, created_at: iso(now), claimed_at: null });
db.auctions.push({ id: 'au-p2', seller: P, seller_name: 'danger_p', card: { key: 'en:Lot2', title: 'Lot 2', rarityId: 'rare', price: 50 }, start_price: 50,
  current_bid: 70, bidder: B, bidder_name: 'danger_b', bid_count: 1, ends_at: iso(now + 3600000), status: 'open', created_at: iso(now) });
await closeSheets(phone);
await openDanger(phone, 'account');
const accountSheet = await sheetText(phone);
check('the dialog says it cannot be undone', /cannot be undone/.test(accountSheet) && /Gifts you already sent stay/.test(accountSheet));
await phone.locator('#sheet [data-danger-word]').fill('DELETE');
db.deleteFails = true;
await phone.locator('#sheet [data-danger-go]').click();
check('a failed delete says so', await until(async () => /account was not deleted/.test(await sheetText(phone)), 8000));
check('and the account is still there', [...db.users.values()].some((u) => u.id === P) && await local(phone, () => Boolean(window.__wikster.state.account.session)));

section('delete account');
db.deleteFails = false;
await phone.locator('#sheet [data-danger-go]').click();
check('the account is deleted on the server', await until(() => (db.deletedAccounts ?? []).includes(P)));
check('with nothing of it left', !db.profiles.has(P) && !econDb.users.has(P) && ![...db.users.values()].some((u) => u.id === P)
  && !db.saveKeys.some((r) => r.user_id === P) && !db.saveMeta.has(P));
check('its guild passes on', db.guilds.find((g) => g.id === 'gu-2')?.owner === G);
check('the bidder on its lot is refunded', econDb.users.get(B)?.wallet.coins === 170);
check('the gift it sent still waits for the friend', db.deliveries.some((d) => d.id === 'dl-out' && d.recipient === F && d.sender === F));
check('every device is told', db.liveLog.some((l) => l.topic === `user:${P}` && l.event === 'gone'));
for (const [label, page] of [['phone', phone], ['computer', pc]]) {
  check(`the ${label} lands signed out at the gate`, await until(async () => await page.locator('#gate-form').isVisible().catch(() => false)
    && !(await local(page, () => localStorage.getItem('wikster.auth'))), 20000));
  check(`the ${label} holds none of the old save`, await local(page, () => !localStorage.getItem('wikster.collection.v3') || Object.keys(JSON.parse(localStorage.getItem('wikster.collection.v3')).entries ?? {}).length === 0));
}
check('the phone says the account was deleted', await until(async () => /account was deleted/.test(await toastText(phone)), 6000));

for (const page of [phone, pc]) await page.context().close().catch(() => {});
await browser.close();
const real = errors.filter((e) => !/Target page, context or browser has been closed/.test(e));
if (real.length) { console.log('ERRORS'); for (const e of real) console.log(`  ${e}`); fails += real.length; }
console.log(fails ? `\n${fails} check(s) failed` : '\nALL PASS');
process.exit(fails ? 1 : 0);
