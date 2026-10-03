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
async function newPlayer(label, { language = 'en' } = {}) {
  const ctx = await browser.newContext({ serviceWorkers: 'block', ...devices['Pixel 7'] });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(`${label} PAGE: ${e.message}`));
  installStubs(page);
  await installSupabase(page, { db: shared });
  await page.addInitScript(({ language }) => {
    localStorage.setItem('wikster.language', language);
    localStorage.setItem('wikster.profile.v1', JSON.stringify({
      started: true, createdAt: Date.now(), playMs: 0, boostersOpened: 3,
      rarityCounts: {}, progress: { level: 5, xp: 0 }, pendingLevels: [],
      daily: { v: 2, day: 1, weeks: 0, lastDay: Math.floor(Date.now() / 86400000), shownDay: Math.floor(Date.now() / 86400000) },
      timed: { count: 0, stamp: Date.now() }, freeTaken: { window: 0, ids: [] }
    }));
    localStorage.setItem('wikster.wallet.v1', '50000');
  }, { language });
  await page.goto((process.env.BASE_URL ?? 'http://127.0.0.1:4173/'), { waitUntil: 'domcontentloaded' });
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
async function gate(page, email, username) {
  await page.locator('#gate-seg .seg-option[data-value="signup"]').click();
  await page.waitForTimeout(250);
  await page.locator('#gate-form input[name="email"]').fill(email);
  await page.locator('#gate-form input[name="password"]').fill('hunter2hunter2');
  if (await page.locator('#gate-form input[name="age"]').count()) await page.locator('#gate-form input[name="age"]').fill('30');
  await page.locator('#gate-form button[type="submit"]').click();
  await page.waitForTimeout(1000);
  if (await page.locator('#gate-form input[name="username"]').count()) {
    await page.locator('#gate-form input[name="username"]').fill(username);
    await page.locator('#gate-form button[type="submit"]').click();
    await page.waitForTimeout(1100);
  }
  await closeSheets(page);
}
const viaDrawer = async (page, link) => {
  await page.evaluate(() => document.querySelector('.appbar .icon-btn')?.click());
  await page.waitForTimeout(400);
  await page.locator(`.drawer-link[data-link="${link}"]`).click();
  await page.waitForTimeout(900);
};
const until = async (fn, ms = 6000) => {
  const end = Date.now() + ms;
  for (;;) {
    let ok = false;
    try { ok = await fn(); } catch { ok = false; }
    if (ok || Date.now() > end) return ok;
    await new Promise((r) => setTimeout(r, 200));
  }
};
const userIdOf = (email) => shared.users.get(email)?.id;
const wiresOf = (id) => [...shared.realtime.sockets].filter((s) => s.user === id).flatMap((s) => [...s.joins.keys()]);

const toasts = async (page) => page.evaluate(() => window.__toasts ?? []);
const watchToasts = (page) => page.evaluate(() => {
  window.__toasts = [];
  new MutationObserver(() => {
    for (const n of document.querySelectorAll('.toast')) {
      const text = n.textContent.trim();
      if (text && !window.__toasts.includes(text)) window.__toasts.push(text);
    }
  }).observe(document.body, { childList: true, subtree: true, characterData: true });
});

section('two friends');
const a = await newPlayer('A');
await gate(a, 'ada@example.com', 'ada_lovelace');
const b = await newPlayer('B');
await gate(b, 'grace@example.com', 'grace_h');
const idA = userIdOf('ada@example.com');
const idB = userIdOf('grace@example.com');
shared.friendships.push({ id: 'f1', requester: idA, addressee: idB, status: 'accepted', created_at: new Date().toISOString() });
await a.waitForTimeout(1000);
await watchToasts(a);
await watchToasts(b);

section('the chat filter');
await viaDrawer(a, 'friends');
await a.locator('#friends-list .person').first().click();
await a.waitForTimeout(900);
await a.locator('#friend-actions .btn-primary').click();
await a.waitForTimeout(900);
await a.locator('#chat-input').fill('add me on snapchat');
await a.locator('#chat-send').click();
await a.waitForTimeout(700);
check('a contact handle is refused', shared.messages.length === 0, JSON.stringify(shared.messages));
check('with a toast that says why', (await toasts(a)).some((m) => /other apps/i.test(m)), JSON.stringify(await toasts(a)));
check('and the hit is logged on the server', await until(async () => shared.filterHits.some((h) => h.user_id === idA && h.scope === 'chat')));
await a.locator('#chat-input').fill('go to www.example.com');
await a.locator('#chat-send').click();
await a.waitForTimeout(500);
check('a link is refused', shared.messages.length === 0);
await a.locator('#chat-input').fill('hello grace');
await a.locator('#chat-send').click();
check('a clean message goes through', await until(async () => shared.messages.length === 1));

section('reporting a message');
await viaDrawer(b, 'friends');
await b.locator('#friends-list .person').first().click();
await b.waitForTimeout(900);
await b.locator('#friend-actions .btn-primary').click();
check('B sees the message', await until(async () => /hello grace/.test(await b.locator('#chat-log').textContent())));
const theirs = b.locator('#chat-log .bubble:not(.is-mine)').first();
await theirs.dispatchEvent('contextmenu');
await b.waitForTimeout(500);
check('a long press opens the report sheet', await b.locator('#sheet .report-sheet').isVisible());
check('the send button waits for a reason', await b.locator('#sheet .report-sheet .btn-primary').isDisabled());
check('no name reason on a message', (await b.locator('#sheet .report-reason').count()) === 8);
await b.locator('#sheet .report-reason', { hasText: /spam/i }).click();
await b.locator('#sheet .report-note').fill('keeps sending this');
await b.locator('#sheet .report-sheet .btn-primary').click();
check('the report reaches the server', await until(async () => shared.reports.length === 1));
const filed = shared.reports[0] ?? {};
check('as a message report about A, pointing at the message', filed.kind === 'message' && filed.target === idA && filed.ref === shared.messages[0]?.id && filed.reason === 'spam', JSON.stringify(filed));
check('with the note', filed.note === 'keeps sending this');
check('and the sheet closes on a thank-you', await until(async () => !(await b.locator('#sheet').isVisible())) && (await toasts(b)).some((m) => /report/i.test(m)), JSON.stringify(await toasts(b)));

section('the answer comes back');
filed.status = 'actioned';
shared.emitChange('friendships', 'UPDATE', shared.friendships[0], { ...shared.friendships[0] });
check('B is told the report was acted on', await until(async () => b.evaluate(() => (JSON.parse(localStorage.getItem('wikster.profile.v1')).notifFeed ?? []).some((n) => /action was taken/i.test(n.title)))), 'feed');
check('and it is marked seen', await until(async () => Boolean(filed.seen_at)));

section('reporting and blocking the player');
await viaDrawer(b, 'friends');
await b.locator('#friends-list .person').first().click();
await b.waitForTimeout(900);
await b.locator('#friend-actions .btn', { hasText: /^report$/i }).click();
await b.waitForTimeout(400);
check('the player sheet offers the name reason', (await b.locator('#sheet .report-reason').count()) === 9);
await b.locator('#sheet .report-reason', { hasText: /harass/i }).click();
await b.locator('#sheet .report-sheet .btn-primary').click();
check('a player report is filed', await until(async () => shared.reports.some((r) => r.kind === 'player' && r.target === idA && r.reason === 'harassment')));
await until(async () => !(await b.locator('#sheet').isVisible()));
await b.locator('#friend-actions .btn', { hasText: /^block$/i }).click();
await b.waitForTimeout(400);
await b.locator('#sheet .btn-danger').click();
check('the block is stored', await until(async () => shared.blocks.some((r) => r.blocker === idB && r.blocked === idA)));
check('the friendship is gone both ways', shared.friendships.length === 0);
check('B is back on the friends screen', await until(async () => b.locator('#screen-friends').isVisible()));
check('and A is not in the list', await until(async () => !/ada_lovelace/.test(await b.locator('#friends-list').textContent())));
check('A cannot write to B any more', await a.evaluate(async () => {
  const input = document.querySelector('#chat-input');
  if (!input) return true;
  input.value = 'still there?';
  document.querySelector('#chat-send')?.click();
  await new Promise((r) => setTimeout(r, 900));
  return true;
}) && !shared.messages.some((m) => m.body === 'still there?'));

section('the blocked list');
await viaDrawer(b, 'customize');
await b.waitForTimeout(500);
await b.evaluate(() => {
  const row = [...document.querySelectorAll('#identity-list .row')].find((r) => /blocked players/i.test(r.textContent));
  row?.querySelector('.row-action')?.click();
});
check('it lists A', await until(async () => /ada_lovelace/.test(await b.locator('#sheet').textContent())));
await b.locator('#sheet .row-action', { hasText: /unblock/i }).click();
check('unblocking clears it on the server', await until(async () => shared.blocks.length === 0));
check('and takes the row away', await until(async () => (await b.locator('#sheet .row-action').count()) === 0));
await closeSheets(b);

section('names');
const c = await newPlayer('C');
await c.locator('#gate-seg .seg-option[data-value="signup"]').click();
await c.waitForTimeout(250);
check('signup links the terms and the privacy policy', (await c.locator('#gate-form .gate-legal button').count()) === 2);
await c.locator('#gate-form .gate-legal button').first().click();
await c.waitForTimeout(500);
check('and opens them above the signup form', await c.locator('#sheet.is-over-gate .page-frame').isVisible());
await c.keyboard.press('Escape');
await c.waitForTimeout(400);
if (await c.locator('#sheet').isVisible()) await c.locator('#sheet-close').click();
await c.waitForTimeout(300);
await c.locator('#gate-form input[name="email"]').fill('carol@example.com');
await c.locator('#gate-form input[name="password"]').fill('hunter2hunter2');
if (await c.locator('#gate-form input[name="age"]').count()) await c.locator('#gate-form input[name="age"]').fill('30');
await c.locator('#gate-form button[type="submit"]').click();
await c.waitForTimeout(1000);
await c.locator('#gate-form input[name="username"]').fill('admin_boss');
await c.locator('#gate-form button[type="submit"]').click();
await c.waitForTimeout(700);
const idC = userIdOf('carol@example.com');
check('a reserved name is refused at signup', !shared.profiles.has(idC));
check('with the reason', /reserved/i.test(await c.locator('#gate').textContent()), (await c.locator('#gate').textContent()).slice(0, 200));
await c.locator('#gate-form input[name="username"]').fill('carol_c');
await c.locator('#gate-form button[type="submit"]').click();
check('a clean one is taken', await until(async () => shared.profiles.get(idC)?.username === 'carol_c'));

section('mature wikis need an adult account that turned them on');
{
  const engine = await import('../../supabase/functions/economy/engine.js');
  const econDb = createEconDb();
  econDb.cutover = Date.now() + 86400000;
  let drawn = 0;
  const draw = async (pack) => Array.from({ length: pack.cards ?? 5 }, (_, i) => {
    const k = ++drawn;
    const risky = i === 1;
    return {
      key: `en:${risky ? 'Brothel' : 'Castle'}_${k}`, title: risky ? `Brothel ${k}` : `Castle ${k}`, lang: 'en',
      extract: risky ? 'A brothel is a place where people engage in sexual activity with a prostitute, in many towns.' : 'A castle with long walls and towers, built on a hill long ago.',
      thumbnail: `https://upload.wikimedia.org/hero-${k}.jpg`, url: `https://en.wikipedia.org/wiki/Card_${k}`, views: 1000 + k, popularity: 0.4,
      ...(pack.wiki?.mature ? { mature: true } : {})
    };
  });
  const economy = economyStub(engine, econDb, { draw });
  const people = [
    ['00000000-0000-4000-8000-00000000a016', 'kid@example.com', { age_13_plus: true }, 'kiddo'],
    ['00000000-0000-4000-8000-00000000a030', 'grown@example.com', { age_13_plus: true, age_18_plus: true }, 'grownup'],
    ['00000000-0000-4000-8000-00000000a031', 'droid@example.com', { age_13_plus: true, age_18_plus: true, mature_wikis: true }, 'droidie'],
    ['00000000-0000-4000-8000-00000000a032', 'calm@example.com', { age_13_plus: true, age_18_plus: true, mature_wikis: true }, 'calmone']
  ];
  for (const [id, email, meta, username] of people) {
    shared.users.set(email, { id, email, password: 'hunter2hunter2', meta });
    shared.profiles.set(id, { id, username, created_at: new Date().toISOString(), level: 1 });
    econDb.born.set(id, Date.now() - 86400000);
  }
  const adultPack = { id: 'custom-adult-example-org', name: 'Adult', tagline: 'Adult Wiki', icon: 'wand', wiki: { apiUrl: 'https://adult.example.org/api.php', sitename: 'Adult Wiki', mature: true } };
  const saveAdult = (page) => page.evaluate(async (pack) => {
    try { await window.__wikster.econ('customSave', { pack }); return 'saved'; } catch (e) { return e.message; }
  }, adultPack);
  const enter = async (email, { android = false } = {}) => {
    const ctx = await browser.newContext({ serviceWorkers: 'block', ...devices['Pixel 7'], ...(android ? { userAgent: `${devices['Pixel 7'].userAgent} WiksterAndroid/1` } : {}) });
    const page = await ctx.newPage();
    page.on('pageerror', (e) => errors.push(`${email} PAGE: ${e.message}`));
    installStubs(page);
    await installSupabase(page, { db: shared, economy });
    await page.addInitScript(() => {
      localStorage.setItem('wikster.language', 'en');
      localStorage.setItem('wikster.profile.v1', JSON.stringify({
        started: true, createdAt: Date.now(), playMs: 0, boostersOpened: 3, rarityCounts: {}, progress: { level: 5, xp: 0 }, pendingLevels: [],
        daily: { v: 2, day: 1, weeks: 0, lastDay: Math.floor(Date.now() / 86400000), shownDay: Math.floor(Date.now() / 86400000) },
        timed: { count: 0, stamp: Date.now() }, freeTaken: { window: 0, ids: [] }
      }));
    });
    await page.goto((process.env.BASE_URL ?? 'http://127.0.0.1:4173/'), { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2200);
    if (await page.locator('#gate-seg .seg-option[data-value="in"]').count()) {
      await page.locator('#gate-seg .seg-option[data-value="in"]').click();
      await page.waitForTimeout(200);
    }
    await page.locator('#gate-form input[name="email"]').fill(email);
    await page.locator('#gate-form input[name="password"]').fill('hunter2hunter2');
    await page.locator('#gate-form button[type="submit"]').click();
    await until(() => page.evaluate(() => window.__wikster.serverEconomy()), 9000);
    await page.waitForTimeout(1200);
    await closeSheets(page);
    return page;
  };
  const lock = (page) => page.evaluate(() => document.documentElement.dataset.matureLock);
  const finder = async (page, q) => {
    await page.locator('.nav-item[data-tab="packs"]').click();
    await page.waitForTimeout(500);
    await page.locator('.seg-option[data-value="custom"]').click();
    await page.waitForTimeout(500);
    await page.locator('#creator-input').fill(q);
    await until(() => page.locator('.forge-hit').count().then((n) => n > 0), 8000);
    return page.locator('#forge-results').innerText();
  };

  const kid = await enter('kid@example.com');
  check('a signed in account under 18 stays locked', await lock(kid) === '1');
  await viaDrawer(kid, 'settings');
  await kid.locator('.mature-row .switch').click();
  await kid.waitForTimeout(500);
  check('turning mature wikis on asks for the age first', await kid.locator('.mature-age-field').isVisible());
  await kid.locator('.mature-age-field input').fill('16');
  await kid.locator('.mature-age-go').click();
  await kid.waitForTimeout(800);
  check('a player under 18 is turned away', await lock(kid) === '1' && shared.users.get('kid@example.com').meta.mature_wikis !== true
    && (await kid.locator('.mature-row .switch').getAttribute('aria-checked')) === 'false');
  check('the server refuses a mature booster for that account', await saveAdult(kid) === 'MATURE_LOCKED');
  const kidSees = await finder(kid, 'zelda');
  check('and the finder hides mature wikis from it', !/NSFW/.test(kidSees) && /hidden: 1/i.test(kidSees), kidSees.replace(/\n/g, ' | '));

  const grown = await enter('grown@example.com');
  check('an adult account starts locked too', await lock(grown) === '1');
  await viaDrawer(grown, 'settings');
  await grown.locator('.mature-row .switch').click();
  check('an adult who confirmed the age turns it on in one tap', await until(() => lock(grown).then((v) => v === '0'))
    && shared.users.get('grown@example.com').meta.mature_wikis === true);
  check('the server then takes the mature booster', await saveAdult(grown) === 'saved' && [...(econDb.users.get(people[1][0])?.custom.values() ?? [])].some((row) => row.def.wiki.mature === true));
  const grownSees = await finder(grown, 'zelda');
  check('and the finder shows the mature wiki, marked as such', /Zelda NSFW Wiki\s*Mature/i.test(grownSees), grownSees.replace(/\n/g, ' | '));
  check('but never picks it by default', !(await grown.locator('.forge-hit').first().innerText()).includes('NSFW'));
  await viaDrawer(grown, 'settings');
  await grown.locator('.mature-row .switch').click();
  check('turning it off locks again', await until(() => lock(grown).then((v) => v === '1')) && shared.users.get('grown@example.com').meta.mature_wikis === false);
  check('and the server refuses again', await saveAdult(grown) === 'MATURE_LOCKED');

  section('several custom boosters in one server request');
  const zeldaPack = { id: 'custom-zelda-fandom-com', name: 'Zelda', tagline: 'Zelda Wiki', icon: 'wand', wiki: { apiUrl: 'https://zelda.fandom.com/api.php', sitename: 'Zelda Wiki' } };
  const grownId = people[1][0];
  await econDb.store(grownId).apply({ coins: 200000 });
  await grown.evaluate(async (pack) => { await window.__wikster.econ('customSave', { pack }); await window.__wikster.econ('snapshot', {}); }, zeldaPack);
  await grown.evaluate(() => document.querySelector('.nav-item[data-tab="shop"]')?.click());
  await grown.waitForTimeout(800);
  const zTile = grown.locator('.shop-tile.is-sized', { hasText: 'Zelda' }).first();
  await zTile.locator('[data-qty="1"]').click();
  await zTile.locator('[data-qty="1"]').click();
  const zPrice = Number(await zTile.locator('.buy').getAttribute('data-price'));
  const held = () => [...(econDb.users.get(grownId)?.inventory.values() ?? [])].filter((x) => x.spec.kind === 'custom' && x.spec.customId === zeldaPack.id).reduce((n, x) => n + x.count, 0);
  const coinsBefore = econDb.users.get(grownId).wallet.coins;
  const buysBefore = economy.bodies.filter((b) => b.action === 'buy').length;
  await zTile.locator('.buy').click();
  check('three boosters land on the server', await until(() => held() === 3), String(held()));
  const buys = economy.bodies.filter((b) => b.action === 'buy').slice(buysBefore);
  check('from a single request carrying the quantity and a request id', buys.length === 1 && buys[0].args.count === 3 && typeof buys[0].args.req === 'string', JSON.stringify(buys.map((b) => b.args)));
  check('charged once for all three', coinsBefore - econDb.users.get(grownId).wallet.coins === zPrice);
  const replay = await economy.handle(grownId, buys[0]);
  check('a replay of that request is not charged again', replay.already === true && held() === 3 && coinsBefore - econDb.users.get(grownId).wallet.coins === zPrice);

  section('the Android app never deals in adult wikis');
  const droid = await enter('droid@example.com', { android: true });
  check('the app sends its marker', economy.bodies.some((b) => b.client === 'android'));
  check('it keeps adult content locked and hidden even for an opted in adult', await lock(droid) === '1' && await droid.evaluate(() => document.documentElement.dataset.nsfwHide === '1'));
  await viaDrawer(droid, 'settings');
  check('and offers no Mature wikis switch', await droid.locator('.mature-row').count() === 0 && await droid.locator('.no-nsfw-row').count() === 1);
  check('the server refuses an adult booster from the app', await saveAdult(droid) === 'MATURE_LOCKED');
  const droidSees = await finder(droid, 'zelda');
  check('and its finder neither shows nor mentions adult wikis', !/NSFW/.test(droidSees) && !/hidden/i.test(droidSees), droidSees.replace(/\n/g, ' | '));
  const web = await enter('droid@example.com');
  check('the same account on the web may build it', await lock(web) === '0' && await saveAdult(web) === 'saved');
  const fromApp = await economy.handle(people[2][0], { action: 'customSave', args: { pack: adultPack } }, 'Mozilla/5.0 (Linux; Android 14; wv) WiksterAndroid/1').then(() => 'saved', (e) => e.code);
  check('the user agent alone is enough for the server to refuse', fromApp === 'MATURE_LOCKED');

  section('minors are refused to everyone');
  const minorsPack = { id: 'custom-loli-example-org', name: 'Art', tagline: 'Art', icon: 'wand', wiki: { apiUrl: 'https://l0li.example.org/api.php', sitename: 'L0li Art', mature: true } };
  const saveMinors = (page) => page.evaluate(async (pack) => {
    try { await window.__wikster.econ('customSave', { pack }); return 'saved'; } catch (e) { return e.message; }
  }, minorsPack);
  check('even an opted in adult on the web is refused', await saveMinors(web) === 'CONTENT_REFUSED');
  check('and so is everyone else', await saveMinors(kid) === 'CONTENT_REFUSED' && await saveMinors(droid) === 'CONTENT_REFUSED');
  await web.locator('.nav-item[data-tab="packs"]').click();
  await web.waitForTimeout(400);
  await web.locator('.seg-option[data-value="custom"]').click();
  await web.locator('#creator-input').fill('sh0tacon');
  await web.waitForTimeout(1500);
  check('the finder finds nothing for it', await web.locator('.forge-hit').count() === 0);

  section('custom boosters ride out a server hiccup and explain a full shelf');
  const webId = people[2][0];
  let hiccups = 0;
  await web.route(/functions\/v1\/economy/, async (route) => {
    let body = {};
    try { body = JSON.parse(route.request().postData() ?? '{}'); } catch {}
    if (route.request().method() === 'POST' && body.action === 'customSave' && hiccups < 1) {
      hiccups++;
      return route.fulfill({ status: 503, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'content-type': 'text/html' }, body: '<html>Service Unavailable</html>' });
    }
    return route.fallback();
  });
  const forge = async (page, q, pick = null) => {
    await finder(page, q);
    if (pick) await page.locator('.forge-hit', { hasText: pick }).first().click();
    const saves = economy.bodies.filter((b) => b.action === 'customSave').length;
    await page.locator('#creator-go').click();
    await until(() => page.locator('#creator-status.is-ok, #creator-status.is-error').count().then((n) => n > 0), 12000);
    return { text: await page.locator('#creator-status').innerText(), saves: economy.bodies.filter((b) => b.action === 'customSave').length - saves };
  };
  await finder(web, 'zelda');
  const sizes = await web.locator('.forge-hit').evaluateAll((rows) => rows.map((r) => ({ n: Number(r.querySelector('.forge-hit-size')?.dataset.pages ?? 0), tag: r.querySelector('.forge-hit-size small')?.dataset.tag ?? null })));
  const most = Math.max(...sizes.map((x) => x.n));
  check('the Biggest tag sits on the largest page count shown', sizes.filter((x) => x.tag === 'finderBiggest').length === 1 && sizes.find((x) => x.tag === 'finderBiggest').n === most, JSON.stringify(sizes));
  const zeldaSaved = () => economy.bodies.filter((b, i) => b.action === 'customSave' && economy.who[i]?.user === webId && /zelda\.fandom\.com\/api/.test(b.args?.pack?.wiki?.apiUrl ?? '')).length;
  const first = await forge(web, 'zelda');
  const landed = await until(() => [...(econDb.users.get(webId)?.custom.values() ?? [])].some((row) => /zelda\.fandom\.com/.test(row.def.wiki.apiUrl)), 9000);
  await web.waitForTimeout(800);
  const zeldaSaves = zeldaSaved();
  check('a 503 on save is retried and the booster is made', landed && hiccups === 1 && zeldaSaves === 1 && /ready|shop/i.test(first.text), `${hiccups} ${zeldaSaves} ${first.text}`);
  check('without an error shown', !(await web.locator('#toast.is-error').isVisible().catch(() => false)) && await web.locator('#creator-status.is-ok').count() === 1);
  const shelf = [...econDb.users.get(webId).custom.values()].length;
  for (let i = shelf; i < 24; i++) await econDb.store(webId).customPut({ id: `custom-fill-${i}`, name: `Filler ${i}`, wiki: { apiUrl: `https://fill${i}.fandom.com/api.php`, sitename: `Filler ${i}` } });
  await web.evaluate(() => window.__wikster.econ('snapshot', {}));
  const full = await forge(web, 'zelda', 'ZeldaWiki');
  check('a full shelf says how many boosters fit and how to free one', /24/.test(full.text) && /delete/i.test(full.text) && !/didn.t go through/i.test(full.text), full.text);
  for (let i = shelf; i < 24; i++) await econDb.store(webId).customDrop(`custom-fill-${i}`);

  section('a mature custom booster from the creator, for an adult who opted in on the web');
  const grownMade = await forge(web, 'zelda', 'NSFW');
  check('the mature wiki is made from the creator', /created|shop/i.test(grownMade.text)
    && [...econDb.users.get(webId).custom.values()].some((row) => row.def.wiki.apiUrl === 'https://zelda.wiki.gg/api.php' && row.def.wiki.mature === true), grownMade.text);

  section('No NSFW content on a signed in account');
  const calm = await enter('calm@example.com');
  const calmId = people[3][0];
  check('an opted in adult starts unlocked', await lock(calm) === '0');
  const theme = { kind: 'theme', themeId: 'space', rarityId: null, cards: 5 };
  const themeId = await calm.evaluate((spec) => window.__wikster.specId(spec), theme);
  await econDb.store(calmId).apply({ inventory: [{ spec_id: themeId, spec: theme, delta: 2 }] });
  const early = await calm.evaluate((id) => window.__wikster.econ('prepare', { specId: id }), themeId);
  check('without the switch a sensitive card can be drawn', early.cards.some((c) => /Brothel/.test(c.article.title)));
  await viaDrawer(calm, 'settings');
  await calm.locator('.no-nsfw-row .switch').click();
  check('the switch is saved on the account', await until(() => shared.users.get('calm@example.com').meta.no_nsfw === true));
  check('it locks and hides mature content at once', await until(async () => await lock(calm) === '1' && await calm.evaluate(() => document.documentElement.dataset.nsfwHide === '1')),
    JSON.stringify(await calm.evaluate(() => [document.documentElement.dataset.matureLock, document.documentElement.dataset.nsfwHide, window.__wikster.state.account?.session?.user?.user_metadata, window.__wikster.state.profile.settings.noNsfw])));
  check('the Mature wikis switch reads off', (await calm.locator('.mature-row .switch').getAttribute('aria-checked')) === 'false');
  check('a booster already drawn with mature cards is thrown away', await until(() => econDb.pulls.get(early.nonce) == null));
  const later = await calm.evaluate((id) => window.__wikster.econ('prepare', { specId: id }), themeId);
  check('the server then draws only safe cards', later.cards.length === 5 && later.cards.every((c) => !/Brothel/.test(c.article.title)), later.cards.map((c) => c.article.title).join(', '));
  check('and refuses adult boosters', await saveAdult(calm) === 'MATURE_LOCKED');
  await calm.evaluate(() => {
    const now = Date.now();
    window.__wikster.state.collection.entries['wiki:adult.example.org:9'] = { key: 'wiki:adult.example.org:9', title: 'Grown page', mature: true, rarityId: 'rare', price: 300, count: 1, lang: 'en',
      thumbnail: 'https://upload.wikimedia.org/hero-3.svg', extract: 'A page from a wiki made for adults, long enough to be the words on the card.', firstPulledAt: now, lastPulledAt: now };
    window.__wikster.store.saveCollection(window.__wikster.state.collection);
  });
  await calm.locator('.nav-item[data-tab="binder"]').click();
  await calm.waitForTimeout(600);
  await calm.locator('.seg-option[data-value="classic"]').first().click().catch(() => {});
  await calm.waitForTimeout(900);
  const adultCards = calm.locator('.card[data-adult]');
  check('its own mature cards are hidden from view', await adultCards.count() >= 1 && !(await adultCards.first().isVisible()), String(await adultCards.count()));
}

console.log(errors.length ? `\nERRORS:\n${errors.join('\n')}` : '\nno page errors');
console.log(fails ? `\n${fails} FAILURES` : '\nALL PASS');
await browser.close();
process.exit(fails ? 1 : 0);
