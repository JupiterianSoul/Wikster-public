import { chromium, devices } from 'playwright';
import { launchOptions } from '../lib/browser.mjs';
import { installStubs } from '../lib/stubs.mjs';
import { economyStub, installSupabase, newDatabase } from '../lib/supastub.mjs';
import { createEconDb } from '../lib/econdb.mjs';
import { RELEASES } from '../../src/data/releases.js';
import { pickOption } from '../lib/dropdown.mjs';

const engine = await import('../../supabase/functions/economy/engine.js');

let fails = 0;
const check = (label, ok, detail = '') => { if (!ok) fails++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? `  ${detail}` : ''}`); };
const section = (s) => console.log(`\n== ${s}`);
const BASE = process.env.BASE_URL ?? 'http://127.0.0.1:4173/';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 8000) => {
  const end = Date.now() + ms;
  for (;;) {
    let ok = false;
    try { ok = await fn(); } catch { ok = false; }
    if (ok || Date.now() > end) return ok;
    await sleep(150);
  }
};

const PX = 'data:image/gif;base64,R0lGODlhAQABAAAAACw=';
const now = Date.now();
const iso = (ms = 0) => new Date(now + ms).toISOString();
const day = Math.floor(now / 86400000);
const ME = '00000000-0000-4000-8000-0000000000e1';
const OWN = '00000000-0000-4000-8000-0000000000e2';
const MAT = '00000000-0000-4000-8000-0000000000e3';
const OLD = '00000000-0000-4000-8000-0000000000e4';
const CAM = '00000000-0000-4000-8000-0000000000e5';
const shown = { key: 'en:Alan_Turing', title: 'Alan Turing', rarityId: 'legendary', price: 1600, views: 400000, thumbnail: PX, lang: 'en', description: 'A mathematician', extract: 'Some words.' };
const racy = { key: 'en:Late_show', title: 'Late show', rarityId: 'epic', price: 900, views: 300000, thumbnail: PX, lang: 'en', description: 'A show', extract: 'Some words.', mature: true };
const people = {
  [ME]: { email: 'viewer@example.test', name: 'viewer_vi', ink: 0, theme: 'paper', owned: { themes: ['paper'], frames: [], fx: [] } },
  [OWN]: { email: 'owner@example.test', name: 'owner_olive', ink: 700, theme: 'aurora', owned: { themes: ['arcade', 'matrix'], frames: [], fx: ['legendary:moltengold'] }, showcase: [shown, racy] },
  [CAM]: { email: 'cam@example.test', name: 'careful_cam', ink: 0, theme: 'paper', owned: { themes: ['paper'], frames: [], fx: [] }, meta: { no_nsfw: true } }
};

const db = newDatabase();
const econDb = createEconDb();
econDb.cutover = now + 86400000;
for (const [id, p] of Object.entries(people)) {
  db.users.set(p.email, { id, password: 'hunter2hunter2', meta: { age_13_plus: true, ...(p.meta ?? {}) } });
  db.profiles.set(id, { id, username: p.name, created_at: iso(-86400000), level: 6, cards: 1, unique_cards: 1, boosters_opened: 4, collection_value: 900, play_ms: 60000, showcase: p.showcase ?? null });
  const profile = {
    started: true, createdAt: now - 86400000, playMs: 60000, boostersOpened: 4, rarityCounts: {}, progress: { level: 6, xp: 0 }, pendingLevels: [],
    daily: { lastDay: day, shownDay: day, claimed: 1, board: 0 }, timed: { count: 0, stamp: now }, freeTaken: { window: 0, ids: [] },
    owned: p.owned, ...(p.showcase ? { showcase: p.showcase } : {})
  };
  const data = {
    'wikster.wallet.v1': '3000', 'wikster.ink.v1': String(p.ink), 'wikster.inventory.v1': '{}', 'wikster.theme': p.theme,
    'wikster.collection.v3': JSON.stringify({ entries: { [shown.key]: { ...shown, count: 1, favorite: false, packId: 'theme|history', packName: 'History', firstPulledAt: 1, lastPulledAt: 1 } } }),
    'wikster.profile.v1': JSON.stringify(profile), 'wikster.language': 'en'
  };
  db.saves.set(id, { user_id: id, data: { format: 'wikster-save', version: 2, at: now - 60000, data, stamps: Object.fromEntries(Object.keys(data).map((k) => [k, now - 60000])) }, updated_at: iso(-60000) });
  econDb.born.set(id, now - 86400000);
}
db.profiles.set(MAT, { id: MAT, username: 'matrix_max', created_at: iso(-86400000), level: 9, cards: 1, unique_cards: 1, boosters_opened: 2, collection_value: 100, play_ms: 1,
  appearance: { v: 1, theme: 'matrix', fx: {} }, showcase: [shown] });
db.profiles.set(OLD, { id: OLD, username: 'legacy_lou', created_at: iso(-86400000), level: 3, cards: 1, unique_cards: 1, boosters_opened: 1, collection_value: 10, play_ms: 1,
  appearance: { v: 1, theme: 'neon-2030', fx: { legendary: 'not-a-thing' } }, showcase: [shown] });
for (const other of [OWN, MAT, OLD]) db.friendships.push({ id: `f-${other}`, requester: ME, addressee: other, status: 'accepted', created_at: iso(-3600000) });
db.friendships.push({ id: 'f-cam', requester: CAM, addressee: OWN, status: 'accepted', created_at: iso(-3600000) });
const economy = economyStub(engine, econDb);

const browser = await chromium.launch(launchOptions());
const errors = [];

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

async function player(id, { pc = false, local = {} } = {}) {
  const p = people[id];
  const ctx = await browser.newContext(pc ? { serviceWorkers: 'block', viewport: { width: 1600, height: 900 }, deviceScaleFactor: 1 } : { serviceWorkers: 'block', ...devices['Pixel 7'] });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(`${p.name}: ${e.message}`));
  installStubs(page);
  await installSupabase(page, { db, economy });
  await page.addInitScript(({ local, seen }) => {
    if (localStorage.getItem('wikster.test.seeded')) return;
    localStorage.setItem('wikster.test.seeded', '1');
    localStorage.setItem('wikster.language', 'en');
    localStorage.setItem('wikster.seenRelease.v1', seen);
    for (const [k, v] of Object.entries(local)) localStorage.setItem(k, v);
  }, { local, seen: RELEASES.at(-1).id });
  await page.goto(BASE, { waitUntil: 'domcontentloaded' });
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
  await page.locator('#gate-form input[name="email"]').fill(p.email);
  await page.locator('#gate-form input[name="password"]').fill('hunter2hunter2');
  if (await page.locator('#gate-form input[name="age"]').count()) await page.locator('#gate-form input[name="age"]').fill('30');
  await page.locator('#gate-form button[type="submit"]').click();
  await until(() => page.evaluate(() => window.__wikster.serverEconomy()), 20000);
  await page.waitForTimeout(1800);
  await closeSheets(page);
  return page;
}

const drawer = async (page, link) => {
  await closeSheets(page);
  for (let i = 0; i < 5; i++) {
    if (await page.locator('#drawer.is-open').count()) break;
    await page.evaluate(() => document.querySelector('.appbar .icon-btn')?.click());
    await page.waitForTimeout(420);
  }
  await page.locator(`.drawer-link[data-link="${link}"]`).click();
  await page.waitForTimeout(900);
};
const flush = async (page) => { await page.evaluate(() => window.__wikster.flushSync()).catch(() => {}); await page.waitForTimeout(500); };
const setColor = (page, token, value) => page.evaluate(([tk, v]) => {
  const input = document.querySelector(`#custom-theme input[data-token="${tk}"]`);
  input.value = v;
  input.dispatchEvent(new Event('input', { bubbles: true }));
  input.dispatchEvent(new Event('change', { bubbles: true }));
}, [token, value]);
const rootVar = (page, name) => page.evaluate((n) => document.documentElement.style.getPropertyValue(n).trim(), name);
const rgb = (hex) => `rgb(${parseInt(hex.slice(1, 3), 16)}, ${parseInt(hex.slice(3, 5), 16)}, ${parseInt(hex.slice(5, 7), 16)})`;

const PALETTE = { bg: '#1a0b2e', ink: '#fdf4ff', 'surface-solid': '#240a40', accent: '#f472b6', 'accent-2': '#38bdf8' };

section('the owner dresses up');
const owner = await player(OWN, { local: { 'wikster.cardFx.v1': JSON.stringify({ legendary: 'moltengold', rare: 'neonsign' }) } });
check('the owner is on the server economy with their Ink', await owner.evaluate(() => window.__wikster.state.ink) === 700);
await drawer(owner, 'atelier');
await owner.locator('#atelier-custom .atelier-buy').click();
await owner.waitForTimeout(1200);
check('the server sells the custom theme for 500 Ink', econDb.users.get(OWN)?.wallet.ink === 200 && econDb.users.get(OWN)?.state.owned?.themes?.includes('custom'));
await owner.locator('#atelier-custom .atelier-buy').click();
await owner.waitForTimeout(1000);
check('the editor opens', await owner.locator('#custom-theme .ct-preview').isVisible());
for (const [token, value] of Object.entries(PALETTE)) await setColor(owner, token, value);
for (const [layer, value] of Object.entries({ sound: 'arcade', font: 'matrix', shape: 'arcade', scene: 'matrix', special: 'arcade' })) {
  await pickOption(owner, owner.locator(`#custom-theme wk-select[data-layer="${layer}"]`), value);
}
await owner.waitForTimeout(600);
await owner.locator('#custom-theme [data-ct-wear]').click();
await owner.waitForTimeout(900);
check('the owner wears it', await owner.evaluate(() => document.documentElement.dataset.custom) === '1' && await rootVar(owner, '--accent') === PALETTE.accent);
const writesBefore = db.appearanceWrites ?? 0;
await flush(owner);
await flush(owner);
const published = db.profiles.get(OWN)?.appearance;
check('the appearance is published with the profile', published?.theme === 'custom' && published?.custom?.palette?.accent === PALETTE.accent, JSON.stringify(published));
check('with every layer', published?.custom?.layers?.shape === 'arcade' && published?.custom?.layers?.scene === 'matrix' && published?.custom?.layers?.font === 'matrix');
check('the server keeps owned card effects only', JSON.stringify(published?.fx) === '{"legendary":"moltengold"}', JSON.stringify(published?.fx));
check('it is small', JSON.stringify(published).length < 1000, String(JSON.stringify(published).length));
const writesAfter = db.appearanceWrites ?? 0;
await flush(owner);
await flush(owner);
check('it went up once, and not again while nothing changed', writesAfter - writesBefore === 1 && (db.appearanceWrites ?? 0) === writesAfter, `${writesBefore} -> ${writesAfter} -> ${db.appearanceWrites}`);
await setColor(owner, 'accent', '#fb7185');
await owner.waitForTimeout(600);
await flush(owner);
check('a change goes up again', db.profiles.get(OWN)?.appearance?.custom?.palette?.accent === '#fb7185' && db.appearanceWrites === writesAfter + 1);
await setColor(owner, 'accent', PALETTE.accent);
await owner.waitForTimeout(600);
await flush(owner);

section('the custom theme on another device');
const second = await player(OWN);
check('the second device wears the custom theme', await until(() => second.evaluate(() => document.documentElement.dataset.custom === '1'), 10000)
  && await rootVar(second, '--accent') === PALETTE.accent);
check('with the same specialities', await second.evaluate(() => document.documentElement.dataset.theme) === 'arcade'
  && await second.evaluate(() => window.__wikster.backdrop.theme?.id) === 'matrix' && await second.evaluate(() => window.__wikster.synth.theme?.id) === 'arcade');
await second.context().close();

section('a friend sees the owner\'s style');
const viewer = await player(ME, { local: { 'wikster.cardFx.v1': JSON.stringify({ legendary: 'filigree' }) } });
check('the viewer wears their own theme', await until(() => viewer.evaluate(() => document.documentElement.dataset.theme === 'paper')));
await drawer(viewer, 'friends');
await until(() => viewer.locator('#friends-list .person').count().then((n) => n >= 3));
await viewer.locator('#friends-list .person', { hasText: 'owner_olive' }).click();
await until(() => viewer.locator('#screen-friend').isVisible());
await viewer.waitForTimeout(900);
const seen = await viewer.evaluate(() => {
  const screen = document.getElementById('screen-friend');
  const s = getComputedStyle(screen);
  return {
    theme: screen.dataset.theme, worn: screen.dataset.worn, accent: s.getPropertyValue('--accent').trim(),
    name: getComputedStyle(document.getElementById('friend-name')).color, font: getComputedStyle(document.getElementById('friend-name')).fontFamily,
    radius: s.getPropertyValue('--radius').trim(),
    root: document.documentElement.dataset.theme, rootCustom: document.documentElement.dataset.custom ?? null,
    appbar: getComputedStyle(document.querySelector('.appbar')).color,
    scene: window.__wikster.backdrop.theme?.id, texture: document.getElementById('texture').dataset.look,
    tint: !document.getElementById('tint').hidden && document.getElementById('tint').style.getPropertyValue('--tint'),
    fx: document.querySelector('#friend-showcase .card')?.dataset.fx ?? null,
    racy: (() => {
      const card = [...document.querySelectorAll('#friend-showcase .card')].find((c) => c.hasAttribute('data-adult'));
      const art = card?.querySelector('.card-art');
      return card ? { slots: document.querySelectorAll('#friend-showcase .showcase-slot').length, shown: card.offsetParent !== null, blur: art ? getComputedStyle(art, '::before').filter : 'no-art' } : null;
    })(),
    sound: window.__wikster.synth.theme?.id
  };
});
check('the profile wears the owner\'s custom palette', seen.worn === 'custom' && seen.accent === PALETTE.accent, JSON.stringify(seen));
check('their text colour and their font', seen.name === rgb(PALETTE.ink) && /monospace/.test(seen.font));
check('their element shapes', seen.theme === 'arcade' && seen.radius === '2px');
check('their animated scene, tinted with their background', seen.scene === 'matrix' && seen.texture === 'arcade' && seen.tint === PALETTE.bg);
check('their card effect on their showcase, not the viewer\'s', seen.fx === 'moltengold');
check('the viewer\'s mature rules still apply to the owner\'s cards: blurred, not hidden', seen.racy?.slots === 2 && seen.racy.shown && /blur/.test(seen.racy.blur), JSON.stringify(seen.racy));
check('the rest of the app keeps the viewer\'s theme', seen.root === 'paper' && seen.rootCustom === null && seen.appbar === 'rgb(23, 21, 18)');
check('and the viewer\'s sounds', seen.sound === 'paper');
await viewer.locator('#friend-back').click();
await viewer.waitForTimeout(800);
check('leaving the profile brings the viewer\'s scene back', await viewer.evaluate(() => window.__wikster.backdrop.theme?.id) === 'paper'
  && await viewer.evaluate(() => document.getElementById('texture').dataset.look) === 'paper' && await viewer.evaluate(() => document.getElementById('tint').hidden));

await viewer.locator('#friends-list .person', { hasText: 'matrix_max' }).click();
await until(() => viewer.locator('#screen-friend').isVisible());
await viewer.waitForTimeout(800);
const plain = await viewer.evaluate(() => {
  const screen = document.getElementById('screen-friend');
  return { theme: screen.dataset.theme, custom: screen.dataset.custom ?? null, accent: getComputedStyle(screen).getPropertyValue('--accent').trim(),
    scene: window.__wikster.backdrop.theme?.id, fx: document.querySelector('#friend-showcase .card')?.dataset.fx ?? null };
});
check('a friend on a plain theme shows it', plain.theme === 'matrix' && plain.custom === null && plain.accent === '#00ff41' && plain.scene === 'matrix', JSON.stringify(plain));
check('with the classic effect when they wear none', plain.fx === null);
await viewer.locator('#friend-back').click();
await viewer.waitForTimeout(700);

await viewer.locator('#friends-list .person', { hasText: 'legacy_lou' }).click();
await until(() => viewer.locator('#screen-friend').isVisible());
await viewer.waitForTimeout(800);
const legacy = await viewer.evaluate(() => {
  const screen = document.getElementById('screen-friend');
  return { theme: screen.dataset.theme ?? null, worn: screen.dataset.worn ?? null, scene: window.__wikster.backdrop.theme?.id,
    fx: document.querySelector('#friend-showcase .card')?.dataset.fx ?? null,
    racy: (() => {
      const card = [...document.querySelectorAll('#friend-showcase .card')].find((c) => c.hasAttribute('data-adult'));
      const art = card?.querySelector('.card-art');
      return card ? { slots: document.querySelectorAll('#friend-showcase .showcase-slot').length, shown: card.offsetParent !== null, blur: art ? getComputedStyle(art, '::before').filter : 'no-art' } : null;
    })(), text: screen.textContent.includes('legacy_lou') };
});
check('an unknown theme falls back to the viewer\'s, readable', legacy.theme === null && legacy.worn === null && legacy.scene === 'paper' && legacy.text, JSON.stringify(legacy));
check('and an unknown effect to the classic one', legacy.fx === null);
await viewer.locator('#friend-back').click();
await viewer.waitForTimeout(500);
await drawer(viewer, 'profile');
check('the viewer\'s own profile wears their own theme', await viewer.evaluate(() => document.getElementById('screen-profile').dataset.worn) === 'paper');

section('on PC');
const desk = await player(CAM, { pc: true });
check('the PC viewer hides NSFW content', await desk.evaluate(() => document.documentElement.dataset.nsfwHide) === '1');
check('the PC layout is up', await desk.evaluate(() => document.documentElement.classList.contains('is-pc')));
await desk.locator('.pc-tab[data-dest="social"]').click();
await desk.waitForTimeout(500);
await desk.locator('.pc-subtab[data-screen="friends"]').click().catch(() => 0);
await until(() => desk.locator('#friends-list .person').count().then((n) => n >= 1));
await desk.locator('#friends-list .person', { hasText: 'owner_olive' }).click();
await until(() => desk.locator('#screen-friend').isVisible());
await desk.waitForTimeout(900);
const pcSeen = await desk.evaluate(() => {
  const screen = document.getElementById('screen-friend');
  return { theme: screen.dataset.theme, accent: getComputedStyle(screen).getPropertyValue('--accent').trim(), root: document.documentElement.dataset.theme,
    bar: getComputedStyle(document.querySelector('.pc-top, .pc-bar') ?? document.body).getPropertyValue('--accent').trim(), scene: window.__wikster.backdrop.theme?.id };
});
check('the friend profile wears the owner\'s style on PC', pcSeen.theme === 'arcade' && pcSeen.accent === PALETTE.accent && pcSeen.scene === 'matrix', JSON.stringify(pcSeen));
check('while the PC bars keep the viewer\'s', pcSeen.root === 'paper' && pcSeen.bar === '#1f6f5c');
const hidden = await desk.evaluate(() => {
  const slots = [...document.querySelectorAll('#friend-showcase .showcase-slot')];
  const racy = slots.find((n) => n.querySelector('[data-adult]'));
  const plain = slots.find((n) => !n.querySelector('[data-adult]'));
  return { slots: slots.length, racy: racy ? getComputedStyle(racy).display : null, plain: plain ? getComputedStyle(plain).display !== 'none' : null, fx: plain?.querySelector('.card')?.dataset.fx ?? null };
});
check('the owner\'s mature card is hidden for this viewer, the other keeps the owner\'s effect',
  hidden.slots === 2 && hidden.racy === 'none' && hidden.plain && hidden.fx === 'moltengold', JSON.stringify(hidden));
check('the PC panels are drawn from the owner\'s colours too', await desk.evaluate(() => {
  const glass = (sel) => getComputedStyle(document.querySelector(sel)).getPropertyValue('--pcx-glass').replace(/\s+/g, '');
  return glass('#screen-friend .friend-hero') !== glass('#screen-profile .hero-card') && /#240a40/.test(glass('#screen-friend .friend-hero'));
}));

const real = errors.filter((e) => !/Target page, context or browser has been closed/.test(e));
check('no page errors', real.length === 0, real.join(' | '));
await browser.close();
console.log(fails ? `\n${fails} FAILURES` : '\nALL PASS');
process.exit(fails ? 1 : 0);
