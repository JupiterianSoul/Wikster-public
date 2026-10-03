import { chromium, devices } from 'playwright';
import { launchOptions } from '../lib/browser.mjs';
import { installStubs } from '../lib/stubs.mjs';
import { THEMES } from '../../src/ui/themes.js';

let fails = 0;
const check = (l, c, e = '') => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${e ? '  ' + e : ''}`); };
const section = (s) => console.log(`\n== ${s}`);
const BASE = process.env.BASE_URL ?? 'http://127.0.0.1:4173/';
const browser = await chromium.launch(launchOptions());
const errors = [];
const today = () => String(Math.floor(Date.now() / 86400000));
const rgb = (hex) => `rgb(${parseInt(hex.slice(1, 3), 16)}, ${parseInt(hex.slice(3, 5), 16)}, ${parseInt(hex.slice(5, 7), 16)})`;
const SIZES = { phone: { serviceWorkers: 'block', ...devices['Pixel 7'] }, pc: { serviceWorkers: 'block', viewport: { width: 1600, height: 900 }, deviceScaleFactor: 1 } };
const CUSTOM = {
  v: 1, base: 'aurora', veil: 0,
  palette: { bg: '#1a0b2e', ink: '#fff4e6', 'ink-dim': '#d8b4a0', 'ink-faint': '#8a6f60', surface: '#ffffff12', 'surface-2': '#ffffff1c', 'surface-solid': '#251040', line: '#ffffff22', 'line-strong': '#ffffff3a', accent: '#ff3d7f', 'accent-2': '#ffd60a', 'accent-ink': '#1a0b2e', positive: '#6ee7b7', negative: '#fda4af', warning: '#fcd34d' },
  layers: { sound: 'arcade', font: 'matrix', shape: 'arcade', scene: 'matrix', special: 'none' }
};

async function context(size, { reducedMotion, seed = {}, profile = null, init = '' } = {}) {
  const ctx = await browser.newContext({ ...SIZES[size], ...(reducedMotion ? { reducedMotion } : {}) });
  await ctx.addInitScript(({ seed, profile, init }) => {
    if (sessionStorage.getItem('seeded')) return;
    sessionStorage.setItem('seeded', '1');
    localStorage.setItem('wikster.language', 'en');
    if (profile) {
      const now = Date.now();
      localStorage.setItem('wikster.profile.v1', JSON.stringify({
        started: true, createdAt: now, playMs: 0, boostersOpened: 6, rarityCounts: {}, progress: { level: 12, xp: 0 }, pendingLevels: [],
        daily: { lastDay: Math.floor(now / 86400000), shownDay: Math.floor(now / 86400000), claimed: 1, board: 0 }, timed: { count: 0, stamp: now }, freeTaken: { window: 0, ids: [] },
        ...profile
      }));
    }
    for (const [k, v] of Object.entries(seed)) localStorage.setItem(k, v);
    if (init) (0, eval)(init);
  }, { seed, profile, init });
  return ctx;
}

async function page(ctx, { bundle = true } = {}) {
  const p = await ctx.newPage();
  p.on('pageerror', (e) => errors.push(e.message));
  installStubs(p);
  if (!bundle) await p.route(/\/assets\/.*\.js$/, (r) => r.abort());
  return p;
}

const step = (p) => p.evaluate(() => document.getElementById('intro')?.dataset.step ?? null);
const untilStep = (p, want, timeout = 6000) => p.waitForFunction((w) => document.getElementById('intro')?.dataset.step === w, want, { timeout }).then(() => true).catch(() => false);
const settle = (p) => p.evaluate(() => {
  for (const a of document.getAnimations()) {
    if (!a.effect?.target?.closest?.('#intro')) continue;
    if (a.effect.getComputedTiming().iterations === Infinity) continue;
    a.finish();
  }
});
const intro = (p, fn) => p.evaluate(fn);

async function logoShown(p) {
  return p.evaluate(() => {
    const logo = document.querySelector('#intro .intro-logo');
    if (!logo) return { ok: false, why: 'no logo' };
    const front = logo.querySelector('.il-front svg');
    const box = front?.getBoundingClientRect();
    const layers = [...logo.querySelectorAll('.il-l, .il-r, .il-front, .il-wipe')].map((n) => getComputedStyle(n));
    const solid = layers.length === 4 && layers.every((s) => s.opacity === '1' && (s.transform === 'none' || s.transform === 'matrix(1, 0, 0, 1, 0, 0)'));
    const cx = box ? box.left + box.width / 2 : -1;
    const cy = box ? box.top + box.height * 0.62 : -1;
    const hit = document.elementFromPoint(cx, cy);
    const wTop = box && box.width > 60 && box.left >= 0 && box.right <= innerWidth && box.top >= 0 && box.bottom <= innerHeight;
    const card = logo.querySelector('.il-front rect')?.getAttribute('fill');
    return { ok: Boolean(solid && wTop && hit && logo.contains(hit) && card === '#ffffff'), solid, wTop, hit: hit?.className?.baseVal ?? hit?.className, card };
  });
}

section('the logo is on the title');
for (const size of ['phone', 'pc']) {
  const ctx = await context(size, { seed: { 'wikster.introSeen': '1' } });
  const p = await page(ctx);
  const t0 = Date.now();
  await p.goto(`${BASE}?intro=1`, { waitUntil: 'domcontentloaded' });
  check(`${size}: a returning player gets the short version`, await intro(p, () => document.getElementById('intro')?.dataset.mode) === 'short');
  check(`${size}: the studio card comes first`, await step(p) === 'studio');
  check(`${size}: then the title`, await untilStep(p, 'title', 3000));
  const atTitle = Date.now() - t0;
  check(`${size}: the title arrives in about a second`, atTitle < 1800, `${atTitle}ms`);
  await p.waitForTimeout(1550);
  const shown = await logoShown(p);
  check(`${size}: the Hand logo is drawn, whole and on screen`, shown.ok, JSON.stringify(shown));
  const press = await intro(p, () => { const n = document.querySelector('.intro-press'); return n ? { op: getComputedStyle(n).opacity, text: n.textContent } : null; });
  check(`${size}: the prompt is up about two seconds in`, press && Number(press.op) > 0.3 && press.text.length > 0, JSON.stringify(press));
  const running = () => intro(p, () => document.getAnimations().filter((a) => a.effect?.target?.closest?.('#intro') && a.playState === 'running' && a.effect.getComputedTiming().iterations !== Infinity).length);
  let left = await running();
  for (let i = 0; left > 0 && process.env.CI && i < 10; i++) { await p.waitForTimeout(150); left = await running(); }
  check(`${size}: and the build is over by then`, left === 0, String(left));
  await ctx.close();
}

section('the intro wears the theme before the game loads');
for (const id of ['arcade', 'paper', 'wankel', 'elden']) {
  const theme = THEMES.find((th) => th.id === id);
  const ctx = await context('phone', { seed: { 'wikster.theme': id, 'wikster.introSeen': today() } });
  const p = await page(ctx, { bundle: false });
  await p.goto(`${BASE}?intro=1`, { waitUntil: 'domcontentloaded' });
  const got = await intro(p, () => {
    const root = document.getElementById('intro');
    const css = getComputedStyle(document.documentElement);
    const accent = css.getPropertyValue('--accent').trim() || css.getPropertyValue('--intro-acc').trim();
    return {
      theme: document.documentElement.dataset.theme,
      bg: getComputedStyle(root).backgroundColor,
      accent,
      hex: getComputedStyle(document.querySelector('.intro-mark .hex')).stroke,
      font: getComputedStyle(document.querySelector('.intro-word')).fontFamily,
      rootFont: ['--font-display', '--font', '--intro-font-display', '--intro-font'].map((name) => css.getPropertyValue(name).trim()).find(Boolean) ?? '',
      pace: getComputedStyle(document.documentElement).getPropertyValue('--intro-pace').trim(),
      meta: document.querySelector('meta[name="theme-color"]')?.getAttribute('content')
    };
  });
  check(`${id}: html wears the theme at first paint`, got.theme === id, got.theme);
  check(`${id}: background from the theme`, got.bg === rgb(theme.swatch[0]), `${got.bg} vs ${theme.swatch[0]}`);
  check(`${id}: accent from the theme`, got.accent && got.hex === rgb(got.accent.slice(0, 7)), `${got.hex} vs ${got.accent}`);
  check(`${id}: typeface from the theme`, got.font.length > 0 && got.rootFont.length > 0 && got.font.replace(/["'\s]/g, '').startsWith(got.rootFont.replace(/["'\s]/g, '').split(',')[0]), `${got.font} | ${got.rootFont}`);
  const pace = Math.min(1.25, Math.max(0.7, theme.motion.scale));
  check(`${id}: motion pace from the theme`, Math.abs(Number(got.pace) - pace) < 0.001, `${got.pace} vs ${pace}`);
  check(`${id}: and the browser bar too`, got.meta === theme.swatch[0].slice(0, 7), got.meta);
  await ctx.close();
}

section('the custom theme, read before the game loads');
{
  const ctx = await context('phone', { seed: { 'wikster.theme': 'custom', 'wikster.introSeen': today(), 'wikster.seenRelease.v1': 'x' }, profile: { owned: { themes: ['arcade', 'matrix', 'custom'], frames: [], fx: [] }, customTheme: CUSTOM } });
  const p = await page(ctx);
  await p.goto(BASE, { waitUntil: 'domcontentloaded' });
  const cached = await p.waitForFunction(() => {
    try { return JSON.parse(localStorage.getItem('wikster.look.v1') ?? 'null')?.id === 'custom'; } catch { return false; }
  }, null, { timeout: 8000 }).then(() => true).catch(() => false);
  check('the game remembers the custom look for the next launch', cached);
  const cold = await page(ctx, { bundle: false });
  await cold.goto(`${BASE}?intro=1`, { waitUntil: 'domcontentloaded' });
  const got = await intro(cold, () => ({
    theme: document.documentElement.dataset.theme,
    custom: document.documentElement.dataset.custom,
    bg: getComputedStyle(document.getElementById('intro')).backgroundColor,
    hex: getComputedStyle(document.querySelector('.intro-mark .hex')).stroke,
    ink: getComputedStyle(document.querySelector('.intro-tag')).color,
    font: getComputedStyle(document.querySelector('.intro-word')).fontFamily
  }));
  check('custom: the shape theme is on html before any script of the game', got.theme === 'arcade' && got.custom === '1', JSON.stringify(got));
  check('custom: background is the custom background', got.bg === rgb(CUSTOM.palette.bg), got.bg);
  check('custom: accent is the custom accent', got.hex === rgb(CUSTOM.palette.accent), got.hex);
  check('custom: text is the custom ink', got.ink === rgb(CUSTOM.palette['ink-dim']), got.ink);
  check('custom: typeface from the font layer', /mono/i.test(got.font), got.font);
  await cold.close();
  const warm = await page(ctx);
  await warm.goto(`${BASE}?intro=1`, { waitUntil: 'domcontentloaded' });
  const before = await intro(warm, () => getComputedStyle(document.getElementById('intro')).backgroundColor);
  await warm.waitForFunction(() => window.wiksterReady === true, null, { timeout: 15000 }).catch(() => {});
  const after = await intro(warm, () => getComputedStyle(document.getElementById('intro') ?? document.body).backgroundColor);
  check('custom: no flash when the game takes over', before === rgb(CUSTOM.palette.bg) && (after === before || after === 'rgba(0, 0, 0, 0)'), `${before} -> ${after}`);
  await warm.keyboard.press('Enter');
  await warm.waitForTimeout(700);
  await warm.evaluate(() => window.__wikster.setTheme('aurora'));
  await warm.waitForTimeout(200);
  const clean = await warm.evaluate(() => ({ early: document.documentElement.dataset.earlyVars ?? null, accent: document.documentElement.style.getPropertyValue('--accent'), custom: document.documentElement.dataset.custom ?? null }));
  check('custom: switching theme drops the colours read early', clean.early === null && clean.accent === '' && clean.custom === null, JSON.stringify(clean));
  await ctx.close();
}

section('skipping');
for (const size of ['phone', 'pc']) {
  const shelf = JSON.stringify({ 'theme|animals|std|5': { spec: { kind: 'theme', themeId: 'animals', rarityId: null, cards: 5 }, count: 2 } });
  const ctx = await context(size, { profile: {}, seed: { 'wikster.inventory.v1': shelf } });
  const p = await page(ctx);
  await p.goto(`${BASE}?intro=1`, { waitUntil: 'domcontentloaded' });
  await p.waitForTimeout(400);
  check(`${size}: a first visit starts on the studio card`, await step(p) === 'studio' && await intro(p, () => document.getElementById('intro').dataset.mode) === 'first');
  if (size === 'phone') await p.touchscreen.tap(200, 400);
  else await p.keyboard.press('Space');
  await p.waitForTimeout(120);
  check(`${size}: any ${size === 'phone' ? 'tap' : 'key'} skips straight to the title`, await step(p) === 'title');
  await p.waitForFunction(() => window.wiksterReady === true, null, { timeout: 15000 }).catch(() => {});
  if (size === 'phone') await p.touchscreen.tap(200, 400);
  else await p.keyboard.press('Enter');
  await p.waitForTimeout(900);
  check(`${size}: and one more leaves the intro`, await p.locator('#intro').count() === 0);
  if (size === 'phone') {
    check('phone: the tap that leaves does not reach the booster under it', await p.locator('#screen-open.is-active').count() === 0 && await p.locator('#screen-packs.is-active').count() === 1);
    check('phone: the navbar marks Boosters, the screen the game opens on', await p.evaluate(() => document.querySelector('#navbar .nav-item.is-active')?.dataset.tab) === 'packs');
  }
  await ctx.close();
}

section('reduced motion and battery saver');
for (const [label, opts] of [['reduced motion', { reducedMotion: 'reduce', seed: { 'wikster.introSeen': '1' } }], ['battery saver', { seed: { 'wikster.introSeen': '1', 'wikster.look.v1': JSON.stringify({ lp: 1 }) } }]]) {
  const ctx = await context('pc', opts);
  const p = await page(ctx);
  await p.goto(`${BASE}?intro=1`, { waitUntil: 'domcontentloaded' });
  await p.waitForTimeout(150);
  check(`${label}: straight to the title`, await step(p) === 'title' && await intro(p, () => document.getElementById('intro').dataset.mode) === 'still');
  const moving = await intro(p, () => document.getAnimations().filter((a) => a.effect?.target?.closest?.('#intro') && (a instanceof CSSAnimation || a.effect.getComputedTiming().duration > 60)).length);
  check(`${label}: nothing moves`, moving === 0, String(moving));
  const shown = await logoShown(p);
  check(`${label}: the logo is there at once`, shown.ok, JSON.stringify(shown));
  await ctx.close();
}

section('the desktop app is always the PC edition');
{
  const ctx = await context('phone', { init: 'window.__TAURI_INTERNALS__ = {};' });
  const p = await page(ctx, { bundle: false });
  await p.goto(`${BASE}?intro=1`, { waitUntil: 'domcontentloaded' });
  check('Tauri: the intro asks for a key, not a tap', await intro(p, () => document.querySelector('.intro-skip')?.textContent) === 'Any key to skip');
  await ctx.close();
}

section('screenshots');
const shots = [
  ['default', {}],
  ['arcade', { seed: { 'wikster.theme': 'arcade' } }],
  ['custom', { seed: { 'wikster.theme': 'custom', 'wikster.seenRelease.v1': 'x' }, profile: { owned: { themes: ['arcade', 'matrix', 'custom'], frames: [], fx: [] }, customTheme: CUSTOM } }]
];
for (const [name, opts] of shots) {
  for (const size of ['phone', 'pc']) {
    const ctx = await context(size, opts);
    const warmup = await page(ctx);
    await warmup.goto(BASE, { waitUntil: 'domcontentloaded' });
    await warmup.waitForFunction(() => Boolean(localStorage.getItem('wikster.look.v1')), null, { timeout: 8000 }).catch(() => {});
    await warmup.close();
    const p = await page(ctx);
    await p.addInitScript(() => localStorage.setItem('wikster.introSeen', '1'));
    await p.goto(`${BASE}?intro=1`, { waitUntil: 'domcontentloaded' });
    await untilStep(p, 'title', 4000);
    await p.waitForTimeout(150);
    await settle(p);
    const shown = await logoShown(p);
    check(`${name} ${size}: logo on the title`, shown.ok, JSON.stringify(shown));
    await p.screenshot({ path: `intro-${name}-${size}.png` });
    await ctx.close();
  }
}

section('page errors');
const real = errors.filter((e) => !/ERR_TUNNEL|Failed to load resource|Failed to fetch dynamically|error loading dynamically|Importing a module script failed/.test(e));
check('no page errors', real.length === 0, real.slice(0, 3).join(' | '));

await browser.close();
console.log(fails ? `\n${fails} FAILED` : '\nALL PASS');
process.exit(fails ? 1 : 0);
