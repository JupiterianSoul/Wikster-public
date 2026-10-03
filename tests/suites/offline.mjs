import { chromium, devices } from 'playwright';
import { launchOptions } from '../lib/browser.mjs';
import { installStubs } from '../lib/stubs.mjs';

let fails = 0;
const check = (l, c, e = '') => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${e ? '  ' + e : ''}`); };
const BASE = process.env.BASE_URL ?? 'http://127.0.0.1:4173/';
const browser = await chromium.launch(launchOptions());
const ctx = await browser.newContext({ ...devices['Pixel 7'] });
const p = await ctx.newPage();
const errors = [];
p.on('pageerror', (e) => errors.push(e.message));
installStubs(p);
await p.addInitScript(() => {
  if (localStorage.getItem('wikster.test.seeded')) return;
  localStorage.setItem('wikster.test.seeded', '1');
  localStorage.setItem('wikster.language', 'en');
  localStorage.setItem('wikster.profile.v1', JSON.stringify({
    started: true, createdAt: Date.now(), playMs: 0, boostersOpened: 3, rarityCounts: {}, progress: { level: 2, xp: 0 }, pendingLevels: [],
    daily: { v: 2, day: 1, weeks: 0, lastDay: Math.floor(Date.now() / 86400000), shownDay: Math.floor(Date.now() / 86400000) },
    timed: { count: 0, stamp: Date.now() }, freeTaken: { window: 0, ids: [] }
  }));
});

await p.goto(BASE, { waitUntil: 'load' });
check('the page names its manifest', (await p.locator('link[rel="manifest"]').count()) === 1);
const manifest = await p.evaluate(async () => (await fetch('./manifest.webmanifest')).json());
check('the manifest is served', manifest?.name === 'Wikster' && manifest.icons?.length === 3);
const iconOk = await p.evaluate(async () => (await fetch('./icons/icon-192.png')).ok);
check('and its icons', iconOk);
const sw = await p.evaluate(async () => (await fetch('./sw.js')).text());
check('the worker is served with this build\'s files in it', /PRECACHE = \[/.test(sw) && /assets\/index-/.test(sw));
check('and without the music', !/\.mp3/.test(sw.split('PRECACHE = ')[1].split('];')[0]));
const listed = (name) => JSON.parse(sw.split(`const ${name} = `)[1].split(';\n')[0]);
const precache = listed('PRECACHE');
const later = listed('LATER');
check('the first visit stores only what the game boots with', precache.filter((f) => f.endsWith('.js')).length <= 3, precache.join(' '));
check('screens, games and data wait for later', later.some((f) => /settings-/.test(f)) && later.some((f) => /market-/.test(f)) && later.some((f) => /i18n-fr-/.test(f)) && later.some((f) => /wikdle-words-/.test(f)));
check('nothing is in both lists', !later.some((f) => precache.includes(f)));

await p.waitForTimeout(4500);
const state = await p.evaluate(async () => {
  const reg = await navigator.serviceWorker.getRegistration();
  if (!reg) return 'none';
  await navigator.serviceWorker.ready;
  return (reg.active ?? reg.waiting ?? reg.installing)?.state ?? 'unknown';
});
check('the worker is registered and active', state === 'activated', state);
const shellKeys = await p.evaluate(async () => (await caches.keys()).filter((k) => k.startsWith('wikster-shell-')));
check('the shell is stored', shellKeys.length === 1, shellKeys.join(','));
const stored = await p.evaluate(async () => {
  const cache = await caches.open((await caches.keys()).find((k) => k.startsWith('wikster-shell-')));
  return (await cache.keys()).length;
});
check('with the page, the scripts, the styles and the sounds', stored >= 8, String(stored));

const warmed = await p.evaluate(async (count) => {
  const reg = await navigator.serviceWorker.ready;
  reg.active.postMessage({ type: 'warm', lang: 'en' });
  const cache = await caches.open((await caches.keys()).find((k) => k.startsWith('wikster-shell-')));
  for (let i = 0; i < 80; i++) {
    const keys = (await cache.keys()).map((r) => r.url);
    if (keys.filter((u) => /\/assets\/.+\.(js|css)$/.test(u)).length >= count) return keys;
    await new Promise((r) => setTimeout(r, 250));
  }
  return (await cache.keys()).map((r) => r.url);
}, precache.filter((f) => /\.(js|css)$/.test(f)).length + later.filter((f) => !/i18n-fr-|wikdle-words-fr-/.test(f)).length);
check('on a roomy connection the rest is stored in the background', later.filter((f) => !/i18n-fr-|wikdle-words-fr-/.test(f)).every((f) => warmed.some((u) => u.endsWith(f.slice(1)))), String(warmed.length));
check('but not the other language', !warmed.some((u) => /i18n-fr-|wikdle-words-fr-/.test(u)));

await ctx.setOffline(true);
await p.reload({ waitUntil: 'domcontentloaded' });
await p.waitForTimeout(2500);
check('offline, the page still loads', await p.locator('#app').isVisible());
check('and the app is painted', (await p.locator('.nav-item').count()) >= 5, String(await p.locator('.nav-item').count()));
check('the shop is reachable', await p.locator('.nav-item[data-tab="shop"]').isVisible());
await p.locator('#menu-btn').click();
await p.locator('.drawer-link[data-link="settings"]').click();
await p.waitForSelector('#screen-settings.is-active #settings-list .row', { timeout: 8000 }).catch(() => {});
check('a screen loaded on demand still opens offline', await p.locator('#screen-settings.is-active #settings-list .row').count() > 0);
await p.screenshot({ path: 'offline-shell.png' });
await ctx.setOffline(false);

console.log(errors.length ? `\npage errors:\n${errors.join('\n')}` : '\nno page errors');
console.log(fails ? `\n${fails} FAILURES` : '\nALL PASS');
await browser.close();
process.exit(fails ? 1 : 0);
