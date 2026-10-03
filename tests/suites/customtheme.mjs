import { chromium, devices } from 'playwright';
import { launchOptions } from '../lib/browser.mjs';
import { installStubs } from '../lib/stubs.mjs';
import { RELEASES } from '../../src/data/releases.js';
import { CUSTOM_THEME_PRICE } from '../../src/ink.js';
import { PALETTE_TOKENS, ALPHA_TOKENS, LAYERS } from '../../src/ui/customtheme.js';
import { pickOption } from '../lib/dropdown.mjs';

let fails = 0;
const check = (l, c, e = '') => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${e ? '  ' + e : ''}`); };
const section = (s) => console.log(`\n== ${s}`);
const BASE = process.env.BASE_URL ?? 'http://127.0.0.1:4173/';
const browser = await chromium.launch(launchOptions());
const errors = [];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 6000) => {
  const end = Date.now() + ms;
  for (;;) {
    let ok = false;
    try { ok = await fn(); } catch { ok = false; }
    if (ok || Date.now() > end) return ok;
    await sleep(120);
  }
};

async function open({ pc = false, ink = 700, owned = ['arcade', 'matrix'], extra = {} } = {}) {
  const ctx = await browser.newContext(pc
    ? { serviceWorkers: 'block', viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 1 }
    : { serviceWorkers: 'block', ...devices['Pixel 7'] });
  const p = await ctx.newPage();
  p.on('pageerror', (e) => errors.push(e.message));
  installStubs(p);
  await p.addInitScript(({ seen, ink, owned, extra }) => {
    if (localStorage.getItem('wikster.test.seeded')) return;
    localStorage.setItem('wikster.test.seeded', '1');
    localStorage.setItem('wikster.language', 'en');
    const now = Date.now();
    const day = Math.floor(now / 86400000);
    localStorage.setItem('wikster.profile.v1', JSON.stringify({
      started: true, createdAt: now, playMs: 0, boostersOpened: 6, rarityCounts: {}, progress: { level: 12, xp: 0 }, pendingLevels: [],
      daily: { lastDay: day, shownDay: day, claimed: 1, board: 0 }, timed: { count: 0, stamp: now }, freeTaken: { window: 0, ids: [] },
      owned: { themes: owned, frames: [], fx: [] }, ...(extra.profile ?? {})
    }));
    localStorage.setItem('wikster.wallet.v1', '20000');
    localStorage.setItem('wikster.ink.v1', String(ink));
    localStorage.setItem('wikster.seenRelease.v1', seen);
    for (const [k, v] of Object.entries(extra.keys ?? {})) localStorage.setItem(k, v);
  }, { seen: RELEASES.at(-1).id, ink, owned, extra });
  await p.goto(BASE, { waitUntil: 'domcontentloaded' });
  await p.waitForTimeout(2400);
  for (let i = 0; i < 6; i++) {
    if (!(await p.locator('#sheet').isVisible().catch(() => false))) break;
    await p.keyboard.press('Escape');
    await p.waitForTimeout(400);
  }
  return { ctx, p };
}

const drawer = async (p, link) => {
  for (let i = 0; i < 5; i++) {
    if (await p.locator('#drawer.is-open').count()) break;
    await p.evaluate(() => document.querySelector('.appbar .icon-btn')?.click());
    await p.waitForTimeout(420);
  }
  await p.locator(`.drawer-link[data-link="${link}"]`).click();
  await p.waitForTimeout(900);
};
const profileOf = (p) => p.evaluate(() => JSON.parse(localStorage.getItem('wikster.profile.v1') ?? '{}'));
const rootVar = (p, name) => p.evaluate((n) => document.documentElement.style.getPropertyValue(n).trim(), name);
const setColor = (p, token, value) => p.evaluate(([tk, v]) => {
  const input = document.querySelector(`#custom-theme input[data-token="${tk}"]`);
  input.value = v;
  input.dispatchEvent(new Event('input', { bubbles: true }));
  input.dispatchEvent(new Event('change', { bubbles: true }));
}, [token, value]);
const setRange = (p, sel, value) => p.evaluate(([s, v]) => {
  const input = document.querySelector(s);
  input.value = String(v);
  input.dispatchEvent(new Event('input', { bubbles: true }));
  input.dispatchEvent(new Event('change', { bubbles: true }));
}, [sel, value]);
const pick = (p, layer, value) => pickOption(p, p.locator(`#custom-theme wk-select[data-layer="${layer}"]`), value);

section('before the purchase');
const { p } = await open();
await drawer(p, 'customize');
check('the custom theme tab is not there yet', await p.locator('#custom-theme-head').isHidden() && await p.locator('#custom-theme').isHidden());
check('nor its card among the themes', await p.locator('#theme-grid .theme-card[data-theme="custom"]').count() === 0);

section('the Atelier sells it');
await drawer(p, 'atelier');
const tile = p.locator('#atelier-custom .theme-card[data-theme="custom"]');
check('the custom theme has its own shelf', await tile.count() === 1);
check('priced at 500 Ink', /500/.test(await tile.locator('.atelier-buy').textContent()) && CUSTOM_THEME_PRICE === 500);
check('the regular theme shelf is untouched', await p.locator('#atelier-themes .theme-card').count() === 9);
await tile.locator('.atelier-buy').click();
await p.waitForTimeout(800);
check('buying takes 500 Ink', await p.evaluate(() => Number(localStorage.getItem('wikster.ink.v1'))) === 200);
check('and owns the custom theme', (await profileOf(p)).owned?.themes?.includes('custom'));
check('the tile now opens the editor', /editor/i.test(await tile.locator('.atelier-buy').textContent()));
await tile.locator('.atelier-buy').click();
await p.waitForTimeout(900);
check('it lands on the customization screen', await p.locator('#screen-customize').isVisible());
check('where the custom theme tab is unlocked', await p.locator('#custom-theme-head').isVisible() && await p.locator('#custom-theme').isVisible());
check('and the custom theme is a card among the themes', await p.locator('#theme-grid .theme-card[data-theme="custom"]').count() === 1);

section('editing every colour');
const tokenOrder = await p.locator('#custom-theme input[type="color"][data-token]').evaluateAll((n) => n.map((x) => x.dataset.token));
check('every token of the palette has a picker', tokenOrder.length === PALETTE_TOKENS.length && [...tokenOrder].sort().join() === [...PALETTE_TOKENS].sort().join(), tokenOrder.join());
check('the see-through ones have an opacity slider', await p.locator('#custom-theme input[data-alpha]').count() === ALPHA_TOKENS.length);
check('it starts readable', await p.locator('#custom-theme .ct-ok').count() === 1);
const picked = {
  bg: '#1a0b2e', ink: '#fdf4ff', 'ink-dim': '#d8b4fe', 'ink-faint': '#a78bfa', surface: '#2e1065', 'surface-2': '#3b0764', 'surface-solid': '#240a40',
  line: '#7e22ce', 'line-strong': '#c084fc', accent: '#f472b6', 'accent-2': '#38bdf8', 'accent-ink': '#1a0b2e', positive: '#4ade80', negative: '#fb7185', warning: '#facc15'
};
for (const [token, value] of Object.entries(picked)) await setColor(p, token, value);
await setRange(p, '#custom-theme input[data-alpha="surface"]', 60);
await p.waitForTimeout(700);
const saved = (await profileOf(p)).customTheme;
check('every colour is saved', PALETTE_TOKENS.every((tk) => saved?.palette?.[tk]?.slice(0, 7) === picked[tk]), JSON.stringify(saved?.palette));
check('with the opacity it was given', saved?.palette?.surface === '#2e106599');
const preview = await p.evaluate(() => {
  const node = document.querySelector('#custom-theme .ct-preview');
  const s = getComputedStyle(node);
  return { accent: s.getPropertyValue('--accent').trim(), ink: s.getPropertyValue('--ink').trim(), color: getComputedStyle(node.querySelector('.ct-pv-ink')).color, worn: node.dataset.worn };
});
check('the preview follows live', preview.accent === '#f472b6' && preview.ink === '#fdf4ff' && preview.color === 'rgb(253, 244, 255)', JSON.stringify(preview));
check('the app keeps its theme until it is worn', await p.evaluate(() => document.documentElement.dataset.theme) === 'aurora' && !(await rootVar(p, '--accent')));

section('contrast');
await setColor(p, 'ink', '#240a40');
await p.waitForTimeout(300);
check('text the colour of the panels is flagged', await p.locator('#custom-theme .ct-warn[data-pair="inkSolid"]').count() === 1);
check('with the ratio in the warning', /:1/.test(await p.locator('#custom-theme .ct-warn').first().textContent()));
await setColor(p, 'ink', '#fdf4ff');
await p.waitForTimeout(300);
check('fixing it clears the warning', await p.locator('#custom-theme .ct-warn[data-pair="inkSolid"]').count() === 0);

section('mixing specialities');
const options = async (layer) => p.locator(`#custom-theme wk-select[data-layer="${layer}"] option`).evaluateAll((n) => n.map((o) => o.value));
check('every speciality has its own picker', await p.locator('#custom-theme wk-select[data-layer]').count() === LAYERS.length);
check('only owned themes lend sounds', (await options('sound')).sort().join() === ['arcade', 'aurora', 'matrix'].join(), (await options('sound')).join());
check('or a scene', (await options('scene')).sort().join() === ['arcade', 'aurora', 'matrix'].join());
check('a theme not owned is not offered', !(await options('shape')).includes('noir') && !(await options('font')).includes('cartoon'));
check('special touches come only from owned themes that have them', (await options('special')).join() === ['none', 'arcade'].join(), (await options('special')).join());
await pick(p, 'sound', 'arcade');
await pick(p, 'font', 'matrix');
await pick(p, 'shape', 'arcade');
await pick(p, 'scene', 'matrix');
await pick(p, 'special', 'arcade');
await setRange(p, '#custom-theme input[data-veil]', 30);
await p.waitForTimeout(700);
const layers = (await profileOf(p)).customTheme?.layers;
check('the layers are saved', layers?.sound === 'arcade' && layers?.font === 'matrix' && layers?.shape === 'arcade' && layers?.scene === 'matrix' && layers?.special === 'arcade', JSON.stringify(layers));
check('the preview takes the shapes and the fonts', await p.evaluate(() => {
  const node = document.querySelector('#custom-theme .ct-preview');
  return node.dataset.theme === 'arcade' && /monospace/.test(getComputedStyle(node).fontFamily);
}));

section('wearing it');
await p.locator('#custom-theme [data-ct-wear]').click();
await p.waitForTimeout(900);
check('the theme key says custom', await p.evaluate(() => localStorage.getItem('wikster.theme')) === 'custom');
const worn = await p.evaluate(() => ({
  theme: document.documentElement.dataset.theme,
  custom: document.documentElement.dataset.custom,
  scene: window.__wikster.backdrop.theme?.id,
  sound: window.__wikster.synth.theme?.id,
  texture: document.getElementById('texture').dataset.look,
  tint: !document.getElementById('tint').hidden,
  veil: !document.getElementById('veil').hidden && getComputedStyle(document.getElementById('veil')).opacity,
  font: getComputedStyle(document.body).fontFamily,
  ink: getComputedStyle(document.querySelector('.appbar')).color
}));
check('the shapes come from Arcade, app-wide', worn.theme === 'arcade' && worn.custom === '1', JSON.stringify(worn));
check('the colours are the custom palette', await rootVar(p, '--accent') === '#f472b6' && await rootVar(p, '--surface-solid') === '#240a40');
check('the type is Matrix\'s', /monospace/.test(worn.font));
check('the scene is Matrix\'s', worn.scene === 'matrix');
check('the sounds are Arcade\'s', worn.sound === 'arcade');
check('the special touches are Arcade\'s', worn.texture === 'arcade' && await p.evaluate(() => getComputedStyle(document.getElementById('texture')).opacity) === '1');
check('the background colour tints the scene and veils it', worn.tint && worn.veil === '0.3', JSON.stringify(worn));
check('the custom card is marked worn', await p.locator('#theme-grid .theme-card[data-theme="custom"].is-on').count() === 1);
await setColor(p, 'accent', '#22d3ee');
await p.waitForTimeout(700);
check('an edit while worn shows at once', await rootVar(p, '--accent') === '#22d3ee');
await p.locator('#custom-theme .ct-preset[data-preset="matrix"]').click();
await p.waitForTimeout(700);
check('a preset takes the colours of an owned theme', (await profileOf(p)).customTheme?.palette?.accent === '#00ff41' && await rootVar(p, '--accent') === '#00ff41');
check('and keeps the specialities', (await profileOf(p)).customTheme?.layers?.font === 'matrix');
await p.locator('#custom-theme [data-ct-reset]').click();
await p.waitForTimeout(700);
check('reset goes back to the starting theme', (await profileOf(p)).customTheme?.palette?.ink === '#b8ffc9' && (await profileOf(p)).customTheme?.layers?.shape === 'matrix');
await setColor(p, 'accent', '#f472b6');
await pick(p, 'shape', 'arcade');
await p.waitForTimeout(700);

section('after a reload');
await p.reload({ waitUntil: 'domcontentloaded' });
await p.waitForTimeout(2600);
check('the custom theme comes back', await p.evaluate(() => document.documentElement.dataset.custom) === '1' && await rootVar(p, '--accent') === '#f472b6');
check('with its shapes and scene', await p.evaluate(() => document.documentElement.dataset.theme) === 'arcade' && await p.evaluate(() => window.__wikster.backdrop.theme?.id) === 'matrix');
await p.evaluate(() => window.__wikster.setTheme('arcade'));
await p.waitForTimeout(400);
check('switching to a normal theme clears the custom colours', !(await rootVar(p, '--accent')) && await p.evaluate(() => document.documentElement.dataset.custom) === undefined
  && await p.evaluate(() => document.getElementById('tint').hidden));
await p.evaluate(() => window.__wikster.setTheme('custom'));
await p.waitForTimeout(400);
check('and back again', await rootVar(p, '--accent') === '#f472b6');

section('only owned themes can lend');
await p.evaluate(() => {
  const w = window.__wikster;
  w.state.profile.customTheme.layers.shape = 'noir';
  w.state.profile.customTheme.layers.scene = 'apotheosis';
  w.store.saveProfile(w.state.profile);
});
await p.reload({ waitUntil: 'domcontentloaded' });
await p.waitForTimeout(2600);
check('a layer from a theme not owned is not worn', await p.evaluate(() => document.documentElement.dataset.theme) === 'aurora'
  && await p.evaluate(() => window.__wikster.backdrop.theme?.id) === 'aurora');
check('the colours still are', await rootVar(p, '--accent') === '#f472b6');
await p.evaluate(() => {
  const w = window.__wikster;
  w.state.profile.owned.themes = w.state.profile.owned.themes.filter((id) => id !== 'custom');
  w.store.saveProfile(w.state.profile);
});
await p.reload({ waitUntil: 'domcontentloaded' });
await p.waitForTimeout(2600);
check('without the purchase the custom theme is not worn', await p.evaluate(() => document.documentElement.dataset.custom) === undefined && !(await rootVar(p, '--accent')));
check('but the choice is kept for when it comes back', await p.evaluate(() => localStorage.getItem('wikster.theme')) === 'custom');

section('the PC layout');
const pcSeed = {
  profile: { customTheme: { v: 1, base: 'aurora', palette: { ...picked }, layers: { sound: 'arcade', font: 'matrix', shape: 'arcade', scene: 'matrix', special: 'none' }, veil: 0 } },
  keys: { 'wikster.theme': 'custom' }
};
const { p: q } = await open({ pc: true, owned: ['arcade', 'matrix', 'custom'], extra: pcSeed });
check('the PC layout is up', await q.evaluate(() => document.documentElement.classList.contains('is-pc')));
check('it wears the custom theme from the start', await q.evaluate(() => document.documentElement.dataset.custom) === '1' && await rootVar(q, '--accent') === '#f472b6');
await q.locator('.pc-plate').click();
await q.waitForTimeout(600);
await q.locator('.pc-subtab[data-screen="customize"]').click();
await q.waitForTimeout(900);
const link = q.locator('#screen-customize .pc-section-link', { hasText: /custom theme/i });
check('the customization screen has a Custom theme tab', await link.count() === 1);
await link.click();
await q.waitForTimeout(700);
check('which shows the editor', await q.locator('#custom-theme .ct-preview').isVisible() && await q.locator('#custom-theme input[data-token="accent"]').isVisible());
check('next to its preview, not under it', await q.evaluate(() => {
  const a = document.querySelector('#custom-theme .ct-side').getBoundingClientRect();
  const b = document.querySelector('#custom-theme .ct-controls').getBoundingClientRect();
  return b.left >= a.right - 1;
}));
await setColor(q, 'accent', '#22d3ee');
await q.waitForTimeout(700);
check('editing on PC applies at once', await rootVar(q, '--accent') === '#22d3ee');
check('and is saved', (await profileOf(q)).customTheme?.palette?.accent === '#22d3ee');
check('no horizontal scroll on the editor', await q.evaluate(() => {
  const box = document.querySelector('#custom-theme');
  return box.scrollWidth <= box.clientWidth + 1;
}));

await q.locator('#screen-customize .pc-section-link').first().click();
await q.waitForTimeout(500);
check('another tab hides the editor', await q.locator('#custom-theme').isHidden());
await q.locator('.pc-tab[data-dest="shop"]').click();
await q.waitForTimeout(500);
await q.locator('.pc-subtab[data-screen="atelier"]').click();
await q.waitForTimeout(800);
await q.locator('#screen-atelier .pc-section-link', { hasText: /custom theme/i }).click();
await q.waitForTimeout(500);
await q.locator('#atelier-custom .atelier-buy').click();
await q.waitForTimeout(1200);
check('the Atelier opens the editor tab on PC', await q.locator('#screen-customize').isVisible() && await q.locator('#custom-theme .ct-preview').isVisible());

section('the phone layout fits');
check('no horizontal scroll on the phone editor', await p.evaluate(async () => {
  window.__wikster.setTheme('custom');
  const box = document.getElementById('custom-theme');
  return document.documentElement.scrollWidth <= window.innerWidth + 1 && box.scrollWidth <= box.clientWidth + 1
    && [...box.querySelectorAll('*')].every((n) => n.getBoundingClientRect().right <= window.innerWidth + 1);
}));

const real = errors.filter((e) => !/Target page, context or browser has been closed/.test(e));
check('no page errors', real.length === 0, real.join(' | '));
await browser.close();
console.log(fails ? `\n${fails} FAILURES` : '\nALL PASS');
process.exit(fails ? 1 : 0);
