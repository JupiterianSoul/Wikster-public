import { chromium, devices } from 'playwright';
import { launchOptions } from '../lib/browser.mjs';
import { installStubs } from '../lib/stubs.mjs';
import { economyStub, installSupabase, newDatabase } from '../lib/supastub.mjs';
import { createEconDb } from '../lib/econdb.mjs';

let fails = 0;
const check = (l, c, e = '') => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${e ? '  ' + e : ''}`); };
const section = (s) => console.log(`\n== ${s}`);
const browser = await chromium.launch(launchOptions());
const shared = newDatabase();
const errors = [];
const BASE = process.env.BASE_URL ?? 'http://127.0.0.1:4173/';
const PX = 'data:image/gif;base64,R0lGODlhAQABAAAAACw=';
const COL = 'wikster.collection.v3';
const WALLET = 'wikster.wallet.v1';
const THEME = 'wikster.theme';
const card = (key, title, rarityId, price, pack) => ({
  key, title, rarityId, price, views: 400000, popularity: 0.7, count: 1, favorite: false,
  packId: `theme|${pack}`, packName: pack[0].toUpperCase() + pack.slice(1), lang: 'en',
  thumbnail: PX, firstPulledAt: 1, lastPulledAt: 1, description: 'A thing', extract: 'Some words about it.'
});
const MINE = {
  'en:Cat': card('en:Cat', 'Cat', 'rare', 300, 'animals'),
  'en:Dog': card('en:Dog', 'Dog', 'legendary', 1600, 'animals')
};
const keysOf = (page) => page.evaluate((k) => Object.keys(JSON.parse(localStorage.getItem(k) ?? '{"entries":{}}').entries), COL);
const local = (page, key) => page.evaluate((k) => localStorage.getItem(k), key);

async function device(label, { cards = {}, wallet = '50000', owner = null, extra = {}, db = shared, economy = null } = {}) {
  const ctx = await browser.newContext({ serviceWorkers: 'block', ...devices['Pixel 7'] });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(`${label} PAGE: ${e.message}`));
  installStubs(page);
  await installSupabase(page, { db, economy });
  await page.addInitScript(({ cards, wallet, owner, extra }) => {
    if (localStorage.getItem('wikster.test.seeded')) return;
    localStorage.setItem('wikster.test.seeded', '1');
    localStorage.setItem('wikster.language', 'en');
    localStorage.setItem('wikster.profile.v1', JSON.stringify({
      started: true, createdAt: Date.now(), playMs: 0, boostersOpened: 3,
      rarityCounts: {}, progress: { level: 5, xp: 0 }, pendingLevels: [],
      daily: { v: 2, day: 1, weeks: 0, lastDay: Math.floor(Date.now() / 86400000), shownDay: Math.floor(Date.now() / 86400000) },
      timed: { count: 0, stamp: Date.now() }, freeTaken: { window: 0, ids: [] }
    }));
    localStorage.setItem('wikster.wallet.v1', wallet);
    localStorage.setItem('wikster.collection.v3', JSON.stringify({ entries: cards }));
    if (owner) localStorage.setItem('wikster.syncedUser', owner);
    for (const [k, v] of Object.entries(extra)) localStorage.setItem(k, v);
  }, { cards, wallet, owner, extra });
  await page.goto(BASE, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2200);
  await closeSheets(page);
  return page;
}
async function closeSheets(page) {
  for (let i = 0; i < 6; i++) {
    if (!(await page.locator('#sheet').isVisible().catch(() => false))) break;
    if (await page.locator('#sheet-close').isVisible()) await page.locator('#sheet-close').click();
    else await page.locator('#sheet .btn-primary').click().catch(() => 0);
    await page.waitForTimeout(400);
  }
}
async function gate(page, mode, email, username) {
  await page.locator(`#gate-seg .seg-option[data-value="${mode}"]`).click();
  await page.waitForTimeout(200);
  await page.locator('#gate-form input[name="email"]').fill(email);
  await page.locator('#gate-form input[name="password"]').fill('hunter2hunter2');
  if (await page.locator('#gate-form input[name="age"]').count()) await page.locator('#gate-form input[name="age"]').fill('30');
  await page.locator('#gate-form button[type="submit"]').click();
  await page.waitForTimeout(1200);
  if (await page.locator('#gate-form input[name="username"]').count()) {
    await page.locator('#gate-form input[name="username"]').fill(username);
    await page.locator('#gate-form button[type="submit"]').click();
  }
  await page.waitForTimeout(2500);
  await closeSheets(page);
}
const viaDrawer = async (page, link) => {
  await page.evaluate(() => document.querySelector('.appbar .icon-btn')?.click());
  await page.waitForTimeout(400);
  await page.locator(`.drawer-link[data-link="${link}"]`).click();
  await page.waitForTimeout(800);
};

section('first sign-in');
const a = await device('A', { cards: MINE });
await gate(a, 'signup', 'ada@example.com', 'ada_lovelace');
const idA = [...shared.profiles.values()].find((p) => p.username === 'ada_lovelace')?.id;
check('the account exists', Boolean(idA));
const first = shared.saves.get(idA);
check('the save went up', Boolean(first?.data?.data?.[COL]));
check('as a version 2 envelope', first?.data?.version === 2, String(first?.data?.version));
check('with a stamp per key', typeof first?.data?.stamps === 'object' && COL in first.data.stamps);
check('the device remembers whose save it holds', (await local(a, 'wikster.syncedUser')) === idA);

await a.evaluate(() => window.__wikster?.flushSync?.()).catch(() => {});
await a.waitForTimeout(2500);
const shelf = shared.profiles.get(idA)?.badges;
check('the badge shelf is published with the stats', shelf && typeof shelf === 'object' && !Array.isArray(shelf),
  JSON.stringify(shelf));
check('carrying what is worn and what is earned',
  Array.isArray(shelf?.worn) && Array.isArray(shelf?.earned));
check('and how many achievements are unlocked, as a number not an ellipsis',
  Number.isFinite(shelf?.ach), String(shelf?.ach));

section('a push merges');
await a.evaluate(() => window.__wikster.store.saveWallet(60000));
await a.waitForTimeout(300);
{
  const row = shared.saves.get(idA);
  row.data.data[THEME] = 'noir';
  row.data.stamps[THEME] = Date.now() + 60000;
  row.data.data[WALLET] = '1';
  row.data.stamps[WALLET] = 1;
  row.updated_at = new Date(Date.now() + 1000).toISOString();
}
await a.evaluate(() => window.__wikster?.flushSync?.()).catch(() => {});
await a.waitForTimeout(1500);
const merged = shared.saves.get(idA);
check('the other device\'s newer theme is kept', merged?.data?.data?.[THEME] === 'noir', String(merged?.data?.data?.[THEME]));
check('this device\'s newer wallet is kept', merged?.data?.data?.[WALLET] === '60000', String(merged?.data?.data?.[WALLET]));
check('the newer theme came down to this device', (await local(a, THEME)) === 'noir', String(await local(a, THEME)));
check('and the wallet stayed', (await local(a, WALLET)) === '60000');
check('the merge is said on screen', /merged|fusionn/i.test(await a.locator('#toast').textContent().catch(() => '')));

section('sign-in merges on a known device');
const later = Date.now() + 120000;
const b = await device('B', {
  cards: { ...MINE, 'en:Mars': card('en:Mars', 'Mars', 'epic', 800, 'space') }, wallet: '70000', owner: idA,
  extra: { 'wikster.stamps.v1': JSON.stringify({ [COL]: later, [WALLET]: later }) }
});
await gate(b, 'signin', 'ada@example.com', 'ada_lovelace');
check('the local newer collection is kept', (await keysOf(b)).includes('en:Mars'));
check('the local newer wallet is kept', (await local(b, WALLET)) === '70000');
check('the account\'s newer theme comes down', (await local(b, THEME)) === 'noir');
const pushedB = shared.saves.get(idA);
check('and the merged save went up', JSON.parse(pushedB.data.data[COL]).entries['en:Mars'] !== undefined && pushedB.data.data[THEME] === 'noir');

section('a fresh device');
const c = await device('C', { cards: { 'en:Zebra': card('en:Zebra', 'Zebra', 'rare', 300, 'animals') }, wallet: '5' });
await gate(c, 'signin', 'ada@example.com', 'ada_lovelace');
const keysC = await keysOf(c);
check('the account\'s cards replace the device\'s', keysC.includes('en:Mars') && keysC.includes('en:Cat'), keysC.join(','));
check('the device\'s pre-account card is gone', !keysC.includes('en:Zebra'));
check('the wallet is the account\'s', (await local(c, WALLET)) === '70000');
check('the device now belongs to the account', (await local(c, 'wikster.syncedUser')) === idA);

section('backups');
const history = shared.savesHistory.filter((h) => h.user_id === idA);
check('the server filed earlier versions', history.length >= 2, String(history.length));
check('with what each held', history.every((h) => typeof h.cards === 'number' && typeof h.coins === 'number'));
await viaDrawer(c, 'settings');
const backupsRow = c.locator('#data-list .row', { hasText: /backups|sauvegardes/i });
check('settings offers the backups', (await backupsRow.count()) === 1);
await backupsRow.locator('button').click();
await c.waitForTimeout(1500);
const rowsShown = c.locator('#sheet-body .press .row');
check('the sheet lists them', (await rowsShown.count()) >= 2, String(await rowsShown.count()));
check('each says how many cards it held', /cards|cartes/.test(await rowsShown.first().textContent()));
await c.screenshot({ path: 'sync-backups.png' });
const oldest = rowsShown.last();
const restore = oldest.locator('button');
await restore.click(); await c.waitForTimeout(300);
check('restoring asks twice', /again|encore/i.test(await restore.textContent()));
await restore.click();
await c.waitForTimeout(4500);
await closeSheets(c);
const keysAfter = await keysOf(c);
check('the restored save is the old one', keysAfter.includes('en:Cat') && !keysAfter.includes('en:Mars'), keysAfter.join(','));
check('and it is the account\'s save now', JSON.parse(shared.saves.get(idA).data.data[COL]).entries['en:Mars'] === undefined);
check('the save it replaced was filed first', shared.savesHistory.some((h) => h.user_id === idA && h.reason === 'before-restore'));

section('a live account syncs four small keys');
const engine = await import('../../supabase/functions/economy/engine.js');
const until = async (fn, ms = 15000) => {
  const end = Date.now() + ms;
  for (;;) {
    let ok = false;
    try { ok = await fn(); } catch { ok = false; }
    if (ok || Date.now() > end) return ok;
    await new Promise((r) => setTimeout(r, 250));
  }
};
const PROFILE = 'wikster.profile.v1';
const LID = '00000000-0000-4000-8000-0000000000aa';
const born = Date.now();
const liveDb = newDatabase();
const liveDay = Math.floor(born / 86400000);
const oldProfile = {
  started: true, createdAt: born - 86400000, playMs: 0, boostersOpened: 2, rarityCounts: {},
  progress: { level: 4, xp: 0 }, pendingLevels: [],
  daily: { v: 2, day: 1, weeks: 0, lastDay: liveDay, shownDay: liveDay },
  timed: { count: 0, stamp: born }, freeTaken: { window: 0, ids: [] }, motto: 'from the old save'
};
const oldData = {
  [COL]: JSON.stringify({ entries: { 'en:Cat': MINE['en:Cat'] } }), [WALLET]: '900',
  [PROFILE]: JSON.stringify(oldProfile), [THEME]: 'paper', 'wikster.language': 'en'
};
liveDb.users.set('lena@example.com', { id: LID, password: 'hunter2hunter2', meta: { age_13_plus: true } });
liveDb.profiles.set(LID, { id: LID, username: 'lena', created_at: new Date(born - 86400000).toISOString(), level: 4,
  cards: 1, unique_cards: 1, boosters_opened: 2, collection_value: 300, play_ms: 0, last_seen_at: new Date(0).toISOString() });
liveDb.saves.set(LID, { user_id: LID, updated_at: new Date(born - 60000).toISOString(), data: {
  format: 'wikster-save', version: 2, at: born - 60000, build: { sha: 'older', at: 1 }, data: oldData,
  stamps: Object.fromEntries(Object.keys(oldData).map((k) => [k, born - 60000])) } });
const econDb = createEconDb();
econDb.cutover = born + 86400000;
econDb.born.set(LID, born - 86400000);
const economy = economyStub(engine, econDb);
const serverKey = (key) => liveDb.saveKeys.find((r) => r.user_id === LID && r.key === key);
const serverProfile = () => { try { return JSON.parse(serverKey(PROFILE)?.value ?? 'null'); } catch { return null; } };
const flush = async (page) => { await page.evaluate(() => window.__wikster.flushSync()).catch(() => {}); await page.waitForTimeout(400); };
const editProfile = (page, field, value) => page.evaluate(([f, v]) => {
  const w = window.__wikster;
  w.state.profile[f] = v;
  w.store.saveProfile(w.state.profile);
}, [field, value]);

const l1 = await device('L1', { db: liveDb, economy });
await gate(l1, 'signin', 'lena@example.com', 'lena');
check('the account goes live', await until(() => l1.evaluate(() => window.__wikster.serverEconomy())));
const blobBefore = liveDb.saves.get(LID).data.data;
await flush(l1);
await flush(l1);
check('the first live sync seeds the keys from the old save', liveDb.saveMeta.has(LID) && serverKey('wikster.language')?.value === 'en' && serverKey(THEME)?.value === 'paper');
check('the profile reaches the keys', serverProfile()?.motto === 'from the old save', JSON.stringify(serverProfile()));
check('without what the economy owns', serverProfile() && !('progress' in serverProfile()) && !('started' in serverProfile()) && !('boostersOpened' in serverProfile()));
check('the old save is left alone', liveDb.saves.get(LID).data.data === blobBefore && JSON.parse(blobBefore[PROFILE]).progress.level === 4);
check('the cards stay out of the keys', !serverKey(COL) && !liveDb.saveKeys.some((r) => r.key === WALLET));
check('the same call says the player was here', Date.parse(liveDb.profiles.get(LID).last_seen_at) > born - 1000);
check('and carries the badge shelf', typeof liveDb.profiles.get(LID).badges === 'object' && Array.isArray(liveDb.profiles.get(LID).badges?.worn));
check('a backup of the keys is filed', liveDb.savesHistory.some((h) => h.user_id === LID && h.data?.format === 'wikster-save' && typeof h.data.data?.[THEME] === 'string'));

await flush(l1);
const quietCalls = liveDb.syncCalls.length;
await l1.evaluate(() => {
  const w = window.__wikster;
  w.state.profile.playMs = (w.state.profile.playMs ?? 0) + 60000;
  w.store.saveProfile(w.state.profile);
});
await flush(l1);
check('a minute of play time sends nothing', liveDb.syncCalls.length === quietCalls, `${liveDb.syncCalls.length - quietCalls} call(s)`);

await editProfile(l1, 'motto', 'changed on the phone');
await flush(l1);
const sent = liveDb.syncCalls.at(-1);
check('a real change goes up', serverProfile()?.motto === 'changed on the phone');
check('in one call that carries only what changed', sent && typeof sent.patch[PROFILE]?.value === 'string'
  && Object.entries(sent.patch).filter(([, v]) => typeof v?.value === 'string').length === 1, JSON.stringify(Object.keys(sent?.patch ?? {})));
check('and the old save still is not written', liveDb.saves.get(LID).data.data === blobBefore);

{
  const row = serverKey(THEME);
  Object.assign(row, { value: 'noir', stamp: Date.now() + 60000, updated_at: new Date(Date.now() + 1000).toISOString() });
}
await editProfile(l1, 'motto', 'changed again');
await flush(l1);
check('a newer theme from another device comes down', (await local(l1, THEME)) === 'noir', String(await local(l1, THEME)));
check('and this device\'s change still went up', serverProfile()?.motto === 'changed again');
check('the device keeps its economy fields', await l1.evaluate(() => JSON.parse(localStorage.getItem('wikster.profile.v1')).progress?.level >= 4));

const l2 = await device('L2', { db: liveDb, economy, cards: { 'en:Zebra': card('en:Zebra', 'Zebra', 'rare', 300, 'animals') }, wallet: '5' });
await gate(l2, 'signin', 'lena@example.com', 'lena');
await until(() => l2.evaluate(() => window.__wikster.serverEconomy()));
await until(async () => (await keysOf(l2)).includes('en:Cat'));
check('a new device takes the keys', (await local(l2, THEME)) === 'noir' && /changed again/.test(await local(l2, PROFILE) ?? ''));
const keysL2 = await keysOf(l2);
check('and the cards from the economy, not its own', keysL2.includes('en:Cat') && !keysL2.includes('en:Zebra'), keysL2.join(','));

liveDb.saves.get(LID).data.data[COL] = JSON.stringify({ entries: { 'en:Ghost': card('en:Ghost', 'Ghost', 'rare', 300, 'animals') } });
const shown = await l2.evaluate(async (id) => {
  const r = await fetch('https://stub.supabase.co/rest/v1/rpc/friend_cards', {
    method: 'POST',
    headers: { 'content-type': 'application/json', apikey: 'stub-anon-key', authorization: `Bearer tok-${id}` },
    body: JSON.stringify({ target: id })
  });
  return r.json();
}, LID);
const shownKeys = Object.keys(JSON.parse(shown?.cards ?? '{}').entries ?? {});
check('friends see the cards the economy holds', shownKeys.includes('en:Cat') && !shownKeys.includes('en:Ghost'), shownKeys.join(','));

await l2.evaluate(async (id) => {
  await fetch('https://stub.supabase.co/rest/v1/saves?on_conflict=user_id', {
    method: 'POST',
    headers: { 'content-type': 'application/json', apikey: 'stub-anon-key', authorization: `Bearer tok-${id}`, prefer: 'resolution=merge-duplicates' },
    body: JSON.stringify({ user_id: id, data: { format: 'wikster-save', version: 2, at: Date.now(), data: { 'wikster.theme': 'mint' }, stamps: { 'wikster.theme': Date.now() + 120000 } } })
  });
}, LID);
check('an old app writing the whole save still reaches the keys', serverKey(THEME)?.value === 'mint');

console.log(errors.length ? `\npage errors:\n${errors.join('\n')}` : '\nno page errors');
console.log(fails ? `\n${fails} FAILURES` : '\nALL PASS');
await browser.close();
process.exit(fails || errors.length ? 1 : 0);
