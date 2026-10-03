import { chromium, devices } from 'playwright';
import { launchOptions } from '../lib/browser.mjs';
import { installStubs } from '../lib/stubs.mjs';
import { economyStub, installSupabase, newDatabase } from '../lib/supastub.mjs';
import { createEconDb } from '../lib/econdb.mjs';
import { RELEASES } from '../../src/data/releases.js';
import { utcDayIndex } from '../../src/days.js';

const engine = await import('../../supabase/functions/economy/engine.js');

let fails = 0;
const check = (l, c, e = '') => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${e ? '  ' + e : ''}`); };
const section = (s) => console.log(`\n== ${s}`);
const browser = await chromium.launch(launchOptions());
const errors = [];
const until = async (fn, ms = 12000) => {
  const end = Date.now() + ms;
  for (;;) {
    let ok = false;
    try { ok = await fn(); } catch { ok = false; }
    if (ok || Date.now() > end) return ok;
    await new Promise((r) => setTimeout(r, 200));
  }
};

const A = '00000000-0000-4000-8000-0000000000a1';
const B = '00000000-0000-4000-8000-0000000000b2';
const G = '00000000-0000-4000-8000-00000000006f';
const now = Date.now();
const day = utcDayIndex(now);
const db = newDatabase();
const econDb = createEconDb();
econDb.cutover = now + 86400000;
const economy = economyStub(engine, econDb);

for (const [id, email, name] of [[A, 'a@example.test', 'ada_live'], [B, 'b@example.test', 'bob_live']]) {
  db.users.set(email, { id, password: 'hunter2hunter2', meta: { age_13_plus: true } });
  db.profiles.set(id, { id, username: name, created_at: new Date(now - 86400000).toISOString(), level: 4,
    cards: 0, unique_cards: 0, boosters_opened: 2, collection_value: 0, play_ms: 0 });
  const profile = {
    started: true, createdAt: now - 86400000, playMs: 0, boostersOpened: 2, rarityCounts: {},
    progress: { level: 4, xp: 0 }, pendingLevels: [],
    daily: { v: 2, day: 1, weeks: 0, lastDay: day, shownDay: day },
    timed: { count: 0, stamp: now }, freeTaken: { window: 0, ids: [] }
  };
  const data = {
    'wikster.wallet.v1': '1000', 'wikster.ink.v1': '5', 'wikster.inventory.v1': '{}',
    'wikster.collection.v3': JSON.stringify({ entries: {} }), 'wikster.profile.v1': JSON.stringify(profile), 'wikster.language': 'en'
  };
  db.saves.set(id, { user_id: id, data: { format: 'wikster-save', version: 2, at: now - 60000, data,
    stamps: Object.fromEntries(Object.keys(data).map((k) => [k, now - 60000])) }, updated_at: new Date(now - 60000).toISOString() });
  econDb.born.set(id, now - 86400000);
}
db.guilds.push({ id: G, name: 'Live Owls', tag: 'OWLS', about: '', owner: A, members: 1, created_at: new Date(now).toISOString() });
db.guildMembers.push({ user_id: A, guild_id: G, joined_at: new Date(now).toISOString() });

async function launch(label, email) {
  const ctx = await browser.newContext({ serviceWorkers: 'block', ...devices['Pixel 7'] });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(`${label} PAGE: ${e.message}`));
  installStubs(page);
  await installSupabase(page, { db, economy });
  await page.addInitScript((latest) => {
    localStorage.setItem('wikster.language', 'en');
    localStorage.setItem('wikster.seenRelease.v1', latest);
  }, RELEASES.at(-1).id);
  await page.goto(process.env.BASE_URL ?? 'http://127.0.0.1:4173/', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2000);
  await closeSheets(page);
  await page.evaluate(() => document.querySelector('.appbar .icon-btn')?.click());
  await page.waitForTimeout(400);
  await page.locator('.drawer-link[data-link="account"], .drawer-link[data-link="friends"]').first().click({ timeout: 5000 }).catch(() => 0);
  await page.waitForTimeout(900);
  if (await page.locator('#gate-seg .seg-option[data-value="in"]').count()) {
    await page.locator('#gate-seg .seg-option[data-value="in"]').click();
    await page.waitForTimeout(200);
  }
  await page.locator('#gate-form input[name="email"]').fill(email);
  await page.locator('#gate-form input[name="password"]').fill('hunter2hunter2');
  if (await page.locator('#gate-form input[name="age"]').count()) await page.locator('#gate-form input[name="age"]').fill('30');
  await page.locator('#gate-form button[type="submit"]').click();
  await until(() => page.evaluate(() => window.__wikster.serverEconomy()), 15000);
  await page.waitForTimeout(2500);
  await closeSheets(page);
  return page;
}

async function closeSheets(page) {
  for (let i = 0; i < 8; i++) {
    if (!(await page.locator('#sheet').isVisible().catch(() => false))) break;
    await page.keyboard.press('Escape');
    await page.waitForTimeout(250);
  }
}

const wires = (id) => [...db.realtime.sockets].filter((s) => s.user === id).flatMap((s) => [...s.joins.keys()]);
const sheetText = (page) => page.locator('#sheet').textContent().catch(() => '');
const sheetOpen = (page) => page.locator('#sheet').isVisible().catch(() => false);
let grantSeq = 0;
const grant = (user, kind, payload, note = '') => {
  const id = 9000 + ++grantSeq;
  econDb.grants.push({ id, user, kind, payload, note_en: note, note_fr: note });
  db.liveSend(`user:${user}`, 'grant', {});
  return id;
};
const asks = (user, action) => economy.who.filter((w) => w.user === user && w.action === action).length;

const pa = await launch('A', 'a@example.test');
const pb = await launch('B', 'b@example.test');

section('the wires');
check('both players are live on the server', await pa.evaluate(() => window.__wikster.serverEconomy()) && await pb.evaluate(() => window.__wikster.serverEconomy()));
check('each joins their own topic and the world topic', wires(A).includes(`realtime:user:${A}`) && wires(A).includes('realtime:world')
  && wires(B).includes(`realtime:user:${B}`) && wires(B).includes('realtime:world'), JSON.stringify(wires(A)));

section('a grant arrives without a refresh');
const coinsA = econDb.users.get(A).wallet.coins;
const coinsB = econDb.users.get(B).wallet.coins;
const askedB = asks(B, 'grants');
grant(A, 'coins', { amount: 1234, mode: 'add' }, 'For the outage.');
check('A is paid within seconds', await until(async () => (await pa.evaluate(() => window.__wikster.state.wallet)) === coinsA + 1234), String(await pa.evaluate(() => window.__wikster.state.wallet)));
check('the server row is claimed', econDb.grants.every((g) => g.claimedAt));
check('the gift sheet shows the note', await until(async () => /For the outage/.test(await sheetText(pa))));
await closeSheets(pa);
await pb.waitForTimeout(1200);
check('B is not paid', econDb.users.get(B).wallet.coins === coinsB && (await pb.evaluate(() => window.__wikster.state.wallet)) === coinsB);
check('and B never even asked', asks(B, 'grants') === askedB);

section('exact boosters');
const ONE = { kind: 'theme', themeId: 'animals', rarityId: null, cards: 1 };
const TWO = { kind: 'open', themeId: null, rarityId: 'epic', cards: 2 };
async function openHeld(page, spec) {
  const id = await page.evaluate((s) => window.__wikster.specId(s), spec);
  await page.evaluate(() => document.querySelector('.nav-item[data-tab="packs"]')?.click());
  await page.waitForTimeout(700);
  await page.evaluate((sid) => {
    const item = [...document.querySelectorAll('#packs-rail .rail-item')].find((n) => n.dataset.id === sid || n.dataset.spec === sid);
    item?.click();
  }, id);
  await page.waitForTimeout(400);
  await page.evaluate(() => document.querySelector('#packs-open')?.click());
  await page.waitForTimeout(900);
  const zone = await page.locator('.rip-zone').boundingBox();
  if (zone) {
    const y = zone.y + zone.height / 2;
    await page.locator('.rip-zone').dispatchEvent('pointerdown', { pointerId: 1, clientX: zone.x + 20, clientY: y, isPrimary: true, pointerType: 'touch', bubbles: true });
    for (let dx = 30; dx <= 240; dx += 26) {
      await page.evaluate(({ x, yy }) => window.dispatchEvent(new PointerEvent('pointermove',
        { pointerId: 1, clientX: x, clientY: yy, isPrimary: true, pointerType: 'touch', bubbles: true })), { x: zone.x + 20 + dx, yy: y });
    }
    await page.evaluate(({ x, yy }) => window.dispatchEvent(new PointerEvent('pointerup',
      { pointerId: 1, clientX: x, clientY: yy, isPrimary: true, pointerType: 'touch', bubbles: true })), { x: zone.x + 260, yy: y });
  }
  const revealed = await until(() => page.evaluate(() => document.querySelector('#screen-open').classList.contains('phase-reveal')), 20000);
  const pulled = await page.evaluate(() => window.__wikster.state.pulls.length);
  await page.evaluate(() => document.querySelector('#open-skip')?.click());
  await page.waitForTimeout(500);
  await page.evaluate(() => document.querySelector('#open-done')?.click());
  await page.waitForTimeout(700);
  await closeSheets(page);
  return { revealed, pulled };
}
grant(A, 'booster', { spec: ONE, count: 1 });
check('a 1 card booster lands as it was given', await until(async () => (await pa.evaluate((s) => {
  const slot = window.__wikster.state.inventory[window.__wikster.specId(s)];
  return slot?.count === 1 && slot.spec.cards === 1;
}, ONE))));
await closeSheets(pa);
let opened = await openHeld(pa, ONE);
check('and opens with exactly one card', opened.revealed && opened.pulled === 1, JSON.stringify(opened));
check('the server agrees', !econDb.users.get(A).inventory.get(await pa.evaluate((s) => window.__wikster.specId(s), ONE)));
grant(A, 'booster', { spec: TWO, count: 1 });
check('a 2 card booster lands as it was given', await until(async () => (await pa.evaluate((s) => window.__wikster.state.inventory[window.__wikster.specId(s)]?.spec.cards === 2, TWO))));
await closeSheets(pa);
opened = await openHeld(pa, TWO);
check('and opens with exactly two', opened.revealed && opened.pulled === 2, JSON.stringify(opened));

section('a grant that cannot land does not block the next');
grant(A, 'mystery', {});
const later = grant(A, 'ink', { amount: 11, mode: 'add' });
check('the next grant still lands', await until(() => econDb.grants.find((g) => g.id === later)?.claimedAt != null));
check('the unknown one is marked failed', econDb.grants.some((g) => g.kind === 'mystery' && g.failedAt != null));
await closeSheets(pa);

section('the economy changes under the player');
await econDb.store(A).apply({ add: [{ key: 'en:Returned', title: 'Returned', rarityId: 'rare', price: 300 }] });
db.liveSend(`user:${A}`, 'econ', { scope: 'cards' });
check('a card given back on the server shows at once', await until(() => pa.evaluate(() => Boolean(window.__wikster.state.collection.entries['en:Returned']))));

section('standing, live');
db.suspensions.push({ user_id: A, reason: 'Please keep it kind.', until: null, muted: true });
db.standingLive(A);
check('the mute shows at once', await until(async () => /cannot post/i.test(await sheetText(pa)) && /keep it kind/.test(await sheetText(pa))));
check('and the composers are off', await pa.evaluate(() => document.querySelector('#chat-input').disabled && document.querySelector('#guild-chat-send').disabled));
await pb.waitForTimeout(800);
check('B is not told', !(await sheetOpen(pb)));
await closeSheets(pa);
db.suspensions.splice(db.suspensions.findIndex((x) => x.user_id === A), 1);
db.standingLive(A);
check('lifting it says so', await until(() => pa.evaluate(() => /back to normal/i.test(document.body.textContent))));
check('and turns the composers back on', await pa.evaluate(() => !document.querySelector('#chat-input').disabled));

section('announcements, live');
const at = new Date(Date.now() - 1000).toISOString();
const toA = { id: 801, title_en: 'For Ada', title_fr: 'Pour Ada', body_en: 'A note for Ada alone.', body_fr: '', kind: 'note', starts_at: at, ends_at: null, target_user: A, target_guild: null };
db.announcements.push(toA);
db.noticeLive(toA);
check('a note for one player shows to them', await until(async () => /for Ada alone/.test(await sheetText(pa))));
await pb.waitForTimeout(800);
check('and not to anyone else', !/for Ada alone/.test(await sheetText(pb)));
await closeSheets(pa);
const owls = { id: 802, title_en: 'Owls', title_fr: '', body_en: 'Only the owls hear this.', body_fr: '', kind: 'note', starts_at: at, ends_at: null, target_user: null, target_guild: G };
db.announcements.push(owls);
db.noticeLive(owls);
check('a guild note reaches the members', await until(async () => /owls hear this/.test(await sheetText(pa))));
db.liveSend(`user:${B}`, 'notice', { id: 802, retired: false });
await pb.waitForTimeout(1500);
check('a player outside the guild cannot read it even when told', !/owls hear this/.test(await sheetText(pb)));
await closeSheets(pa);
const world = { id: 803, title_en: 'Hello all', title_fr: '', body_en: 'A note for everyone.', body_fr: '', kind: 'note', starts_at: at, ends_at: null, target_user: null, target_guild: null };
db.announcements.push(world);
db.noticeLive(world);
check('a world note reaches every signed-in player', await until(async () => /for everyone/.test(await sheetText(pa)) && /for everyone/.test(await sheetText(pb))));
world.ends_at = new Date().toISOString();
db.noticeLive(world, true);
check('retiring it closes it', await until(async () => !(await sheetOpen(pa)) && !(await sheetOpen(pb))));

section('profile, guild and save');
db.profiles.get(A).username = 'ada_renamed';
db.liveSend(`user:${A}`, 'profile', {});
check('a rename repaints the name', await until(() => pa.evaluate(() => window.__wikster.state.account.profile?.username === 'ada_renamed')));
db.guildMembers.splice(db.guildMembers.findIndex((m) => m.user_id === A), 1);
db.liveSend(`user:${A}`, 'guild', { type: 'removed', guild: G });
check('leaving a guild by the creator\'s hand is seen', await until(() => pa.evaluate(() => window.__wikster.state.guild === null)));

const stamp = Date.now();
const keyed = db.saveKeys.find((r) => r.user_id === A && r.key === 'wikster.theme');
if (keyed) Object.assign(keyed, { value: 'paper', stamp, updated_at: new Date().toISOString() });
else db.saveKeys.push({ user_id: A, key: 'wikster.theme', value: 'paper', stamp, updated_at: new Date().toISOString() });
db.liveSend(`user:${A}`, 'save', { keys: ['wikster.theme'] });
check('a setting written by the creator reaches the device', await until(() => pa.evaluate(() => localStorage.getItem('wikster.theme') === 'paper')),
  String(await pa.evaluate(() => localStorage.getItem('wikster.theme'))));

check('no page errors', errors.length === 0, errors.slice(0, 3).join(' | '));
await browser.close();
console.log(fails ? `\n${fails} FAILURES` : '\nALL PASS');
process.exit(fails ? 1 : 0);
