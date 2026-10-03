import { chromium, devices } from 'playwright';
import { launchOptions } from '../lib/browser.mjs';
import { installStubs } from '../lib/stubs.mjs';
import { installSupabase, newDatabase, recoveryLink } from '../lib/supastub.mjs';
import { centerAudit } from '../lib/centering.mjs';

let fails = 0;
const check = (l, c, e = '') => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${e ? '  ' + e : ''}`); };
const section = (s) => console.log(`\n== ${s}`);
const BASE = process.env.BASE_URL ?? 'http://127.0.0.1:4173/';
const SITE = 'https://wikster.pages.dev/';
const EMAIL = 'ada@example.com';
const FIRST = 'hunter2hunter2';
const browser = await chromium.launch(launchOptions());
const db = newDatabase();
const errors = [];
const PC = { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 };
const until = async (fn, ms = 12000) => {
  const end = Date.now() + ms;
  for (;;) {
    let ok = false;
    try { ok = await fn(); } catch { ok = false; }
    if (ok || Date.now() > end) return ok;
    await new Promise((r) => setTimeout(r, 150));
  }
};

async function device(label, { lang = 'en', seed = true, layout = devices['Pixel 7'], userAgent = null, init = null } = {}) {
  const ctx = await browser.newContext({ serviceWorkers: 'block', ...layout, ...(userAgent ? { userAgent } : {}) });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(`${label} PAGE: ${e.message}`));
  installStubs(page);
  await installSupabase(page, { db });
  if (seed) await page.addInitScript((lang) => { if (!localStorage.getItem('wikster.language')) localStorage.setItem('wikster.language', lang); }, lang);
  if (init) await page.addInitScript(init);
  return page;
}
const open = async (page, url = BASE) => {
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await until(() => page.locator('#gate').isVisible());
};
const title = (page) => page.locator('#gate-title').textContent();
const status = (page) => page.locator('#gate-status').textContent();
const signedInAs = (page) => page.evaluate(() => window.__wikster?.state?.account?.session?.user?.email ?? null);
async function closeSheets(page) {
  for (let i = 0; i < 6; i++) {
    if (!(await page.locator('#sheet').isVisible().catch(() => false))) break;
    if (await page.locator('#sheet-close').isVisible()) await page.locator('#sheet-close').click();
    else await page.locator('#sheet .btn-primary').click().catch(() => 0);
    await page.waitForTimeout(300);
  }
}
async function gate(page, mode, email, password, username = null) {
  await page.locator(`#gate-seg .seg-option[data-value="${mode}"]`).click();
  await page.waitForTimeout(150);
  await page.locator('#gate-form input[name="email"]').fill(email);
  await page.locator('#gate-form input[name="password"]').fill(password);
  if (await page.locator('#gate-form input[name="age"]').count()) await page.locator('#gate-form input[name="age"]').fill('30');
  await page.locator('#gate-form button[type="submit"]').click();
  await page.waitForTimeout(1200);
  if (username && await page.locator('#gate-form input[name="username"]').count()) {
    await page.locator('#gate-form input[name="username"]').fill(username);
    await page.locator('#gate-form button[type="submit"]').click();
  }
  await page.waitForTimeout(1500);
  await closeSheets(page);
}
async function choose(page, first, second = first) {
  await page.locator('#gate-form input[name="password"]').fill(first);
  await page.locator('#gate-form input[name="confirm"]').fill(second);
  await page.locator('#gate-form button[type="submit"]').click();
}
async function askReset(page, email) {
  await page.locator('#gate-seg .seg-option[data-value="signin"]').click();
  await page.locator('#gate-form input[name="email"]').fill(email);
  const before = db.recoveries?.length ?? 0;
  await page.locator('#gate-alt').click();
  await until(async () => !/One moment/.test(await status(page)) && (await status(page)).length > 0);
  return before;
}

section('an account to recover');
{
  const page = await device('A');
  await open(page);
  await gate(page, 'signup', EMAIL, FIRST, 'ada_lovelace');
  check('the account exists', db.users.get(EMAIL)?.password === FIRST);
  check('and is signed in', (await signedInAs(page)) === EMAIL);
  await page.context().close();
}

section('asking for a link');
{
  const page = await device('B');
  await open(page);
  await page.locator('#gate-seg .seg-option[data-value="signin"]').click();
  await page.locator('#gate-alt').click();
  check('an empty email is asked for first', /Enter your email address first/.test(await status(page)), await status(page));
  check('and nothing is sent', !(db.recoveries?.length));

  await askReset(page, EMAIL);
  const known = await status(page);
  check('a known address is told a link is on its way', /reset link is on its way/.test(known), known);
  const sent = db.recoveries?.at(-1);
  check('the request reached the server', sent?.email === EMAIL);
  check('and asks to come back to this site', sent?.redirectTo === BASE, String(sent?.redirectTo));

  await askReset(page, 'nobody@example.com');
  check('an unknown address reads exactly the same', (await status(page)) === known, await status(page));
  check('and was still sent to the server to decide', db.recoveries?.at(-1)?.email === 'nobody@example.com');

  db.recoverLimit = 1;
  const before = await askReset(page, EMAIL);
  const limited = await status(page);
  check('a rate limit says to wait', /Wait a minute/.test(limited), limited);
  check('and does not claim a link went out', !/on its way/.test(limited));
  check('the server sent nothing more', db.recoveries.length === before);
  db.recoverLimit = null;
  await page.context().close();
}

section('the link from the email, in a fresh browser');
let phone;
{
  phone = await device('C', { seed: false });
  await open(phone, recoveryLink(db, EMAIL, BASE));
  check('the new password screen shows', await until(async () => /Set a new password/.test(await title(phone))), await title(phone));
  check('naming the account', (await phone.locator('#gate-body').textContent()).includes(EMAIL));
  check('the tokens are wiped from the address bar', !/access_token|refresh_token|type=recovery/.test(phone.url()), phone.url());
  check('the game is not entered yet', !(await phone.evaluate(() => window.__wikster?.state?.account?.session)));
  check('the sign in tabs are hidden', await phone.locator('#gate-seg').isHidden());

  await choose(phone, 'brandnew2026', 'brandnew2027');
  check('two different passwords are refused', await until(async () => /do not match/.test(await status(phone))), await status(phone));
  await choose(phone, 'abc');
  check('a short one is refused', await until(async () => /too short/.test(await status(phone))), await status(phone));
  await choose(phone, FIRST);
  check('the old one is refused kindly', await until(async () => /already your password/.test(await status(phone))), await status(phone));
  check('nothing changed on the server', db.users.get(EMAIL).password === FIRST);

  await phone.reload({ waitUntil: 'domcontentloaded' });
  check('a reload keeps the new password screen', await until(async () => await phone.locator('#gate').isVisible() && /Set a new password/.test(await title(phone))), await title(phone));

  await choose(phone, 'brandnew2026');
  check('the password is saved', await until(() => db.users.get(EMAIL).password === 'brandnew2026'));
  check('the player is signed in to the game', await until(async () => (await signedInAs(phone)) === EMAIL && await phone.locator('#gate').isHidden()));
  check('with a word about it', /Password changed/.test(await phone.locator('#toast').textContent()), await phone.locator('#toast').textContent());
  check('and the screen will not come back on reload', (await phone.evaluate(() => sessionStorage.getItem('wikster.recovering'))) === null);
}

section('signing in with it elsewhere');
{
  const page = await device('D');
  await open(page);
  await gate(page, 'signin', EMAIL, FIRST);
  check('the old password no longer works', /do not match/.test(await status(page)), await status(page));
  await gate(page, 'signin', EMAIL, 'brandnew2026');
  check('the new one does', await until(async () => (await signedInAs(page)) === EMAIL));

  section('a link opened where the player is already signed in');
  const tab = await page.context().newPage();
  tab.on('pageerror', (e) => errors.push(`D2 PAGE: ${e.message}`));
  installStubs(tab);
  await installSupabase(tab, { db });
  await open(tab, recoveryLink(db, EMAIL, BASE));
  check('asks for the new password before the game', await until(async () => /Set a new password/.test(await title(tab))), await title(tab));
  await choose(tab, 'third2026pass');
  check('and saves it', await until(() => db.users.get(EMAIL).password === 'third2026pass'));
  check('then goes on to the game', await until(async () => (await signedInAs(tab)) === EMAIL && await tab.locator('#gate').isHidden()));
  await page.context().close();
}

section('an expired or used link');
{
  const page = await device('E');
  await open(page, `${BASE}#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired`);
  check('says the link expired', await until(async () => /This link has expired/.test(await title(page))), await title(page));
  check('the error is wiped from the address bar', !/error/.test(page.url()), page.url());
  check('offers an email field', await page.locator('#gate-form input[name="email"]').isVisible());
  await page.locator('#gate-form input[name="email"]').fill(EMAIL);
  const before = db.recoveries.length;
  await page.locator('#gate-form button[type="submit"]').click();
  check('a new link can be sent from there', await until(() => db.recoveries.length === before + 1));
  check('and it says so', await until(async () => /on its way/.test(await status(page))), await status(page));
  await page.locator('#gate-alt').click();
  check('back goes to the sign in screen', await until(async () => await page.locator('#gate-seg').isVisible() && /Wikster/.test(await title(page))), await title(page));
  await page.context().close();
}

section('links that carry a token hash');
{
  const link = recoveryLink(db, EMAIL, BASE, { via: 'otp' });
  const page = await device('F');
  await open(page, link);
  check('a token hash link opens the new password screen', await until(async () => /Set a new password/.test(await title(page))), await title(page));
  check('and is wiped from the address bar', !/token_hash/.test(page.url()), page.url());
  const again = await device('F2');
  await open(again, link);
  check('the same link a second time is expired', await until(async () => /This link has expired/.test(await title(again))), await title(again));
  await again.context().close();
  await page.locator('#gate-alt').click();
  check('cancel signs out to the sign in screen', await until(async () => await page.locator('#gate-seg').isVisible()));
  check('without entering the game', !(await signedInAs(page)));
  check('and the password did not change', db.users.get(EMAIL).password === 'third2026pass');
  await page.context().close();
}

section('the apps send the link to the website');
{
  const android = await device('G', { userAgent: `${devices['Pixel 7'].userAgent} WiksterAndroid/1` });
  await open(android);
  await askReset(android, EMAIL);
  check('Android asks for the website', db.recoveries.at(-1)?.redirectTo === SITE, String(db.recoveries.at(-1)?.redirectTo));
  check('and says the link opens there', /opens the Wikster website/.test(await status(android)), await status(android));
  await android.context().close();

  const steam = await device('H', { layout: PC, init: () => { window.WIKSTER_STEAM = true; } });
  await open(steam);
  await steam.evaluate(() => { window.__TAURI_INTERNALS__ = {}; });
  await askReset(steam, EMAIL);
  check('the PC app asks for the website', db.recoveries.at(-1)?.redirectTo === SITE, String(db.recoveries.at(-1)?.redirectTo));
  check('and says so', /opens the Wikster website/.test(await status(steam)), await status(steam));
  await steam.context().close();
}

section('PC layout');
{
  const page = await device('PC', { layout: PC });
  await open(page, recoveryLink(db, EMAIL, BASE));
  check('the new password screen shows on PC', await until(async () => /Set a new password/.test(await title(page))), await title(page));
  const box = await page.locator('.gate-card').boundingBox();
  check('and fits the window', box && box.y >= 0 && box.y + box.height <= 900 && box.x >= 0 && box.x + box.width <= 1440, JSON.stringify(box));
  await choose(page, 'pc2026password');
  check('saving signs in', await until(async () => (await signedInAs(page)) === EMAIL && await page.locator('#gate').isHidden()));
  check('in the PC layout', await page.locator('.pc-tab').first().isVisible().catch(() => false));
  await page.context().close();
}

section('French');
{
  let page = await device('FR', { lang: 'fr' });
  await open(page, `${BASE}#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired`);
  check('the expired screen is in French', await until(async () => /Ce lien a expiré/.test(await title(page))), await title(page));
  await page.context().close();
  page = await device('FR2', { lang: 'fr' });
  await open(page, recoveryLink(db, EMAIL, BASE));
  check('so is the new password screen', await until(async () => /Nouveau mot de passe/.test(await title(page))), await title(page));
  await choose(page, 'un', 'deux');
  check('with French errors', await until(async () => /trop court/.test(await status(page))), await status(page));
  await page.context().close();
}

const small = await device('fit', { layout: { viewport: { width: 320, height: 568 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true } });
await open(small, recoveryLink(db, EMAIL, BASE));
await until(async () => /Set a new password/.test(await title(small)));
const wide = await small.evaluate(() => document.documentElement.scrollWidth);
check('a small phone shows it without sideways scroll', wide <= 320, String(wide));
await small.context().close();
await phone.context().close();

section('every sign in card is centered');
{
  const sizes = [
    ['phone', devices['Pixel 7']],
    ['landscape', { viewport: { width: 915, height: 412 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true }],
    ['pc', PC],
    ['pc big text', PC, 1.4]
  ];
  for (const [label, layout, scale] of sizes) {
    for (const lang of ['en', 'fr']) {
      const fresh = (tag) => device(`center ${label} ${lang} ${tag}`, { lang, layout, init: scale ? `localStorage.setItem('wikster.uiScale.v1', '${scale}')` : null });
      let page = await fresh('gate');
      const card = async (state) => {
        await page.waitForTimeout(400);
        const off = await page.evaluate(centerAudit, '#gate:not([hidden]) .gate-card');
        check(`${label} ${lang} ${state}: nothing in the card is off center`, off.length === 0, off.slice(0, 4).join(' | '));
      };
      await open(page);
      await page.waitForTimeout(800);
      if (label.startsWith('pc')) check(`${label} ${lang}: the PC layout is on`, await page.evaluate(() => document.documentElement.classList.contains('is-pc')));
      await card('sign in');
      await page.locator('#gate-seg .seg-option[data-value="signup"]').click();
      await card('create account');
      await askReset(page, EMAIL);
      await card('forgot password');
      await page.context().close();
      page = await fresh('link');
      await open(page, recoveryLink(db, EMAIL, BASE));
      await until(async () => (await page.locator('#gate-form input[type="password"]').count()) >= 2);
      await card('new password');
      await page.context().close();
    }
  }
}

console.log(errors.length ? `\npage errors:\n${errors.join('\n')}` : '\nno page errors');
console.log(fails ? `\n${fails} FAILURES` : '\nALL PASS');
await browser.close();
process.exit(fails || errors.length ? 1 : 0);
