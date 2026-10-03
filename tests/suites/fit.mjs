import { chromium } from 'playwright';
import { writeFileSync, mkdirSync, readFileSync, readdirSync } from 'node:fs';
import { launchOptions } from '../lib/browser.mjs';
import { installStubs } from '../lib/stubs.mjs';
import { RELEASES } from '../../src/data/releases.js';
import { customTileAudit } from '../lib/customtile.mjs';
import { dropdownAudit } from '../lib/dropdown.mjs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));

const BASE = process.env.BASE_URL ?? 'http://127.0.0.1:4173/';
const FULL = Boolean(process.env.FIT_FULL);
const ONLY = process.env.FIT_ONLY ? process.env.FIT_ONLY.split(',') : null;
const SHOTS = process.env.FIT_SHOTS ?? null;
const ALL_THEMES = ['aurora', 'paper', 'arcade', 'noir', 'sunset', 'meadow', 'cartoon', 'matrix', 'casino', 'horror', 'rire', 'assur', 'pixel', 'tabletop', 'raclette', 'lecture', 'yaourt', 'wankel', 'elden', 'hellfire', 'apotheosis'];
const THEMES = process.env.FIT_THEMES === 'all' ? ALL_THEMES : process.env.FIT_THEMES ? process.env.FIT_THEMES.split(',') : [null];

const parseList = (v) => v.split(',').map((x) => x.includes('x') ? x.split('x').map(Number) : Number(x));
const GRID_SIZES = [[1280, 720], [1280, 800], [1366, 768], [1600, 900], [1920, 1080], [2560, 1440], [3440, 1440], [3840, 2160]];
const GRID_SCALES = [0.8, 0.9, 1, 1.1, 1.2, 1.3, 1.4];
const grid = (sizes, scales) => sizes.flatMap(([w, h]) => scales.map((scale) => [w, h, scale]));
const CONFIGS = process.env.FIT_SIZES || process.env.FIT_SCALES
  ? grid(process.env.FIT_SIZES ? parseList(process.env.FIT_SIZES) : [[1920, 1080]], process.env.FIT_SCALES ? parseList(process.env.FIT_SCALES) : [1])
  : FULL ? grid(GRID_SIZES, GRID_SCALES) : [[1280, 720, 1.4], [1920, 1080, 1], [2560, 1440, 0.8]];

const SCREENS = [
  'home', 'packs', 'custom', 'timed', 'binder', 'albums', 'classic', 'selling', 'cardindex', 'glossary',
  'shop', 'atelier', 'market', 'games', 'quiz', 'quests', 'season', 'leaderboard',
  'friends', 'discussions', 'profile', 'ach', 'badges', 'customize', 'settings', 'updates'
].filter((s) => !ONLY || ONLY.includes(s));

const TIERS = ['common', 'uncommon', 'rare', 'epic', 'legendary', 'mythic', 'exotic', 'prismatic'];
const PACKS = ['animals', 'space', 'history', 'art', 'food', 'music', 'cars', 'planes'];
const PX = 'data:image/gif;base64,R0lGODlhAQABAAAAACw=';
const entries = {};
for (let i = 0; i < 240; i++) {
  const key = `en:Card_${i}`;
  entries[key] = {
    key, title: `Article with a longer name number ${i}`, rarityId: TIERS[i % TIERS.length], price: 100 + i * 37, views: 400000 + i,
    popularity: 0.7, count: 1 + (i % 5 === 0 ? 2 : 0), favorite: i % 17 === 0, packId: `theme|${PACKS[i % PACKS.length]}`,
    packName: PACKS[i % PACKS.length], lang: 'en', thumbnail: PX, firstPulledAt: i, lastPulledAt: 1e12 + i,
    description: 'A description of the thing', extract: 'Some words about it that go on for a while so the card has text to wrap.'
  };
}
const inventory = {};
PACKS.forEach((id, i) => { inventory[`theme|${id}|std|5`] = { spec: { kind: 'theme', themeId: id, rarityId: null, cards: 5 }, count: 1 + (i % 3) }; });
inventory['theme|space|epic|5'] = { spec: { kind: 'theme', themeId: 'space', rarityId: 'epic', cards: 5 }, count: 2 };
const wiki = { apiUrl: 'https://minecraft.wiki/api.php', sitename: 'Minecraft Wiki' };
inventory['custom|minecraft.wiki|std|5'] = { spec: { kind: 'custom', themeId: null, rarityId: null, cards: 5, customName: 'Minecraft', customId: 'custom-minecraft-wiki', wiki, icon: 'wand', accent: '#4ade80', accent2: '#14532d' }, count: 2 };

const browser = await chromium.launch(launchOptions());
const ctx = await browser.newContext({ serviceWorkers: 'block', viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
installStubs(page);
await page.addInitScript(({ entries, inventory, wiki, seen }) => {
  localStorage.setItem('wikster.language', 'en');
  localStorage.setItem('wikster.layout.v1', 'pc');
  const now = Date.now();
  localStorage.setItem('wikster.profile.v1', JSON.stringify({
    started: true, createdAt: now - 86400000 * 40, playMs: 7200000, boostersOpened: 240,
    rarityCounts: { common: 90, rare: 60, epic: 40, legendary: 20 }, progress: { level: 83, xp: 200 }, pendingLevels: [],
    daily: { v: 2, day: 3, weeks: 2, lastDay: Math.floor(now / 86400000) - 1, shownDay: Math.floor(now / 86400000) },
    timed: { count: 7, stamp: now, last: now - 200000, opened: 140 }, freeTaken: { window: 0, ids: [] }
  }));
  localStorage.setItem('wikster.wallet.v1', '1234567');
  localStorage.setItem('wikster.ink.v1', '98765');
  localStorage.setItem('wikster.collection.v3', JSON.stringify({ entries }));
  localStorage.setItem('wikster.inventory.v1', JSON.stringify(inventory));
  localStorage.setItem('wikster.customPacks.v2', JSON.stringify([{ id: 'custom-minecraft-wiki', name: 'Minecraft', tagline: 'Minecraft Wiki', icon: 'wand', accent: '#4ade80', accent2: '#14532d', wiki }]));
  localStorage.setItem('wikster.seenRelease.v1', seen);
}, { entries, inventory, wiki, seen: RELEASES.at(-1).id });

await page.goto(BASE, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(2500);
for (let i = 0; i < 6; i++) {
  if (!(await page.locator('#sheet').isVisible().catch(() => false))) break;
  await page.keyboard.press('Escape');
  await page.waitForTimeout(400);
}

function audit() {
  const vw = innerWidth;
  const vh = innerHeight;
  const stage = document.querySelector('.pc-stage')?.getBoundingClientRect();
  const ATOM = '.shop-tile-stack, .pck-card, .card, .booster, .stack-card, .pch-flow-item.is-center, .pch-hand-card, .avatar, .pc-avatar, .frame-ring, .badge-chip, .mini-card, .pcx-meter, svg, img, canvas, input, select, wk-select, textarea, .switch, .pc-range, .rarity-fx, .fx-preview';
  const SKIP = '.pc-menu, #sheet, .toast, .pc-foot, [aria-hidden="true"], .pch-flow-item:not(.is-center), .pch-hand, .sr-only, .visually-hidden';
  const leaves = [];
  const seen = new Set();
  const pcRoot = document.getElementById('pc');
  if (!pcRoot) return { issues: ['the PC frame is missing'], blank: null, pageScroll: false };
  const walker = document.createTreeWalker(pcRoot, NodeFilter.SHOW_ELEMENT);
  for (let node = walker.currentNode; node; node = walker.nextNode()) {
    if (!(node instanceof Element)) continue;
    if (node.closest(SKIP) && !node.matches('.pch-hand')) continue;
    if (!node.checkVisibility({ opacityProperty: true, visibilityProperty: true })) continue;
    let atom = null;
    for (let n = node; n && n !== pcRoot; n = n.parentElement) if (n.matches(ATOM)) atom = n;
    const host = atom ?? node;
    if (seen.has(host)) continue;
    let leaf = false;
    if (atom || node.matches('.pch-hand')) leaf = true;
    else for (const child of node.childNodes) if (child.nodeType === 3 && child.textContent.trim()) { leaf = true; break; }
    if (!leaf) continue;
    seen.add(host);
    leaves.push(host);
  }
  const clipOf = (el) => {
    let r = el.getBoundingClientRect();
    let box = { l: r.left, t: r.top, r: r.right, b: r.bottom };
    const raw = { ...box };
    for (let n = el.parentElement; n && n !== document.documentElement; n = n.parentElement) {
      const s = getComputedStyle(n);
      if (/auto|scroll/.test(s.overflowY) && n.scrollHeight > n.clientHeight + 1) {
        const c = n.getBoundingClientRect();
        return { raw: { ...raw }, box: { l: Math.max(box.l, c.left), t: Math.max(box.t, c.top), r: Math.min(box.r, c.right), b: Math.min(box.b, c.bottom) }, scrolls: true, scroller: n };
      }
      if (s.overflowX !== 'visible' || s.overflowY !== 'visible' || s.contain.includes('paint')) {
        const c = n.getBoundingClientRect();
        box = { l: Math.max(box.l, c.left), t: Math.max(box.t, c.top), r: Math.min(box.r, c.right), b: Math.min(box.b, c.bottom) };
      }
    }
    box = { l: Math.max(box.l, 0), t: Math.max(box.t, 0), r: Math.min(box.r, vw), b: Math.min(box.b, vh) };
    return { raw, box };
  };
  const area = (b) => Math.max(0, b.r - b.l) * Math.max(0, b.b - b.t);
  const name = (el) => {
    const cls = [...el.classList].slice(0, 2).join('.');
    const txt = (el.textContent ?? '').trim().replace(/\s+/g, ' ').slice(0, 28);
    return `${el.tagName.toLowerCase()}${el.id ? '#' + el.id : ''}${cls ? '.' + cls : ''}${txt ? ` "${txt}"` : ''}`;
  };
  const badge = (el) => {
    const s = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    return s.position === 'absolute' && r.width * r.height < innerWidth * innerHeight * 0.0016 && /count|badge|tag|level|pip/i.test(el.className);
  };
  const items = leaves.map((el) => ({ el, ...clipOf(el) })).filter((i) => area(i.raw) > 4 && !badge(i.el));
  const issues = [];
  for (const i of items) {
    const full = area(i.raw);
    const shown = area(i.box);
    if (shown < full * 0.9 && !i.scrolls && !i.el.closest('.pch-flow, .pc-bar .pc-tabs')) {
      const ellipsis = getComputedStyle(i.el).textOverflow === 'ellipsis';
      if (!ellipsis) issues.push(`cut ${Math.round((1 - shown / full) * 100)}%: ${name(i.el)}`);
    }
    const edge = i.scroller ? i.scroller.getBoundingClientRect() : null;
    const out = stage && (edge ? (edge.bottom > stage.bottom + 1 || edge.right > stage.right + 1) : (i.box.b > stage.bottom + 1 || i.box.r > stage.right + 1));
    if (stage && i.el.closest('.pc-stage') && out && shown > 0) {
      issues.push(`outside stage: ${name(i.el)}`);
    }
  }
  const painted = (el) => [el, ...el.querySelectorAll('*')].some((n) => {
    const st = getComputedStyle(n);
    if (n.matches('svg, img, canvas, .booster, .card, .avatar, .pc-avatar, .swatch, [style*="background"]')) return true;
    if (st.backgroundImage !== 'none' || st.maskImage !== 'none' || st.webkitMaskImage !== 'none') return true;
    if (n !== el && !/rgba\(\d+, \d+, \d+, 0\)|transparent/.test(st.backgroundColor)) return true;
    return [':before', ':after'].some((pseudo) => { const ps = getComputedStyle(n, pseudo); return ps.content !== 'none' && ps.content !== 'normal' && (ps.content !== '""' || ps.backgroundImage !== 'none' || ps.maskImage !== 'none'); });
  });
  for (const btn of document.querySelectorAll('#pc button, #pc .buy, #pc .pcx-btn, #pc a[href]')) {
    if (!btn.checkVisibility({ opacityProperty: true, visibilityProperty: true }) || btn.closest(SKIP)) continue;
    const r = btn.getBoundingClientRect();
    if (r.width < 4) continue;
    if (r.width > 22 && r.height > 22 && !btn.textContent.trim() && !painted(btn) && !btn.matches('.pcx-switch, .switch, [role="switch"], input')) issues.push(`empty button: ${name(btn)}`);
    const style = getComputedStyle(btn);
    const ink = style.color.match(/[\d.]+/g)?.map(Number) ?? [];
    if (btn.textContent.trim() && (ink[3] === 0 || style.opacity === '0')) issues.push(`button text is invisible: ${name(btn)}`);
    for (const kid of btn.querySelectorAll('span, b, small, kbd')) {
      if (!kid.checkVisibility({ opacityProperty: true, visibilityProperty: true }) || !kid.textContent.trim() || badge(kid)) continue;
      const k = kid.getBoundingClientRect();
      if (k.width && (k.left < r.left - 2 || k.right > r.right + 2)) { issues.push(`spills out of its button: ${name(kid)}`); break; }
    }
  }
  const measure = document.createElement('canvas').getContext('2d');
  for (const field of document.querySelectorAll('#pc input:not([type="range"], [type="checkbox"], [type="radio"], [type="color"]), #pc select, #pc wk-select')) {
    if (!field.checkVisibility({ opacityProperty: true, visibilityProperty: true }) || field.closest(SKIP)) continue;
    const text = field.matches('select, wk-select') ? field.options[field.selectedIndex]?.text ?? '' : field.value || field.placeholder;
    if (!text) continue;
    const st = getComputedStyle(field);
    measure.font = `${st.fontStyle} ${st.fontWeight} ${st.fontSize} ${st.fontFamily}`;
    const shown = field.shadowRoot?.querySelector('.value');
    const room = shown ? shown.clientWidth + 2 : field.clientWidth - parseFloat(st.paddingLeft) - parseFloat(st.paddingRight) + 2;
    const need = measure.measureText(text).width;
    if (need > room) issues.push(`text cut in its field: ${name(field)} "${text.slice(0, 28)}" (${Math.round(need)} > ${Math.round(room)})`);
  }
  for (const side of document.querySelectorAll('#pc .sell-side')) {
    if (side.checkVisibility() && side.scrollHeight > side.clientHeight + 2) issues.push(`the selling filters need scrolling (${side.scrollHeight} > ${side.clientHeight})`);
  }
  for (const barSel of ['.pc-bar', '.pc-foot', '.pc-sub']) {
    const bar = document.querySelector(barSel);
    if (!bar || !bar.checkVisibility()) continue;
    const br = bar.getBoundingClientRect();
    for (const n of bar.querySelectorAll('*')) {
      if (!n.checkVisibility({ opacityProperty: true, visibilityProperty: true })) continue;
      const r = n.getBoundingClientRect();
      if (r.width * r.height < 4) continue;
      if (r.top < br.top - 2 || r.bottom > br.bottom + 2) { issues.push(`sticks out of ${barSel}: ${name(n)}`); break; }
    }
  }
  const text = items.filter((i) => area(i.box) > 0);
  for (let a = 0; a < text.length; a++) {
    for (let b = a + 1; b < text.length; b++) {
      const A = text[a];
      const B = text[b];
      if (A.el.contains(B.el) || B.el.contains(A.el)) continue;
      const box = { l: Math.max(A.box.l, B.box.l), t: Math.max(A.box.t, B.box.t), r: Math.min(A.box.r, B.box.r), b: Math.min(A.box.b, B.box.b) };
      const hit = area(box);
      if (hit < 12) continue;
      const small = Math.min(area(A.box), area(B.box));
      if (hit < small * 0.18) continue;
      if (A.el.closest('.pch-hand') && B.el.closest('.pch-hand')) continue;
      const cx = (box.l + box.r) / 2;
      const cy = (box.t + box.b) / 2;
      const top = document.elementFromPoint(cx, cy);
      if (top && !(A.el.contains(top) || B.el.contains(top) || top.contains(A.el) || top.contains(B.el))) continue;
      issues.push(`overlap ${Math.round((hit / small) * 100)}%: ${name(A.el)} <> ${name(B.el)}`);
    }
  }
  let blank = null;
  if (stage) {
    const inStage = text.filter((i) => i.el.closest('.pc-stage'));
    if (inStage.length) {
      const u = inStage.reduce((m, i) => ({ l: Math.min(m.l, i.box.l), t: Math.min(m.t, i.box.t), r: Math.max(m.r, i.box.r), b: Math.max(m.b, i.box.b) }), { l: 1e9, t: 1e9, r: -1e9, b: -1e9 });
      const fw = (u.r - u.l) / stage.width;
      const fh = (u.b - u.t) / stage.height;
      if (fw < 0.72 || fh < 0.55) blank = `content fills ${Math.round(fw * 100)}% x ${Math.round(fh * 100)}% of the stage`;
    }
  }
  return { issues: [...new Set(issues)], blank, pageScroll: document.documentElement.scrollHeight > vh + 1 || document.body.scrollHeight > vh + 1 };
}

async function setScale(scale) {
  await page.evaluate((s) => {
    localStorage.setItem('wikster.uiScale.v1', String(s));
    document.documentElement.style.setProperty('--pc-scale', String(s));
    dispatchEvent(new Event('resize'));
  }, scale);
}

async function visit(screen) {
  await page.evaluate((s) => globalThis.wiksterPc?.screen(s), screen);
  await page.waitForTimeout(400);
  await settle('.pc-stage');
}

const tabsOf = () => page.evaluate(() => [...document.querySelectorAll('.pc-legacy .screen.is-active .pc-section-link')].map((b) => b.dataset.group));

let failures = 0;
const report = [];

function record(where, res) {
  if (res.issues.length || res.pageScroll) {
    failures++;
    report.push(`FAIL  ${where}`);
    for (const i of res.issues.slice(0, 12)) report.push(`        ${i}`);
    if (res.issues.length > 12) report.push(`        ... ${res.issues.length - 12} more`);
    if (res.pageScroll) report.push('        the page itself scrolls');
  } else {
    report.push(`PASS  ${where}${res.blank ? `  (note: ${res.blank})` : ''}`);
  }
  if (process.env.FIT_LIVE) console.log(report.slice(-1 - Math.min(13, res.issues.length)).join('\n'));
}

const SUBS = {
  home: '.pch-stage-head .pcx-seg-item',
  packs: '.pcb-bar .pcx-seg-item',
  custom: '.pcb-bar .pcx-seg-item',
  albums: '.pca .pck-tools .pcx-seg-item',
  classic: '.pccl .pck-tools .pcx-seg-item',
  shop: '.pcs-link'
};

function overlayAudit(selector) {
  {
    const node = document.querySelector(selector);
    const issues = [];
    if (!node || !node.checkVisibility()) return { issues: [`${selector} did not open`], blank: null, pageScroll: false };
    const r = node.getBoundingClientRect();
    if (r.top < -1 || r.left < -1 || r.bottom > innerHeight + 1 || r.right > innerWidth + 1) issues.push(`${selector} runs off the window (${Math.round(r.top)} to ${Math.round(r.bottom)} of ${innerHeight})`);
    for (const el of node.querySelectorAll('*')) {
      const s = getComputedStyle(el);
      if (!el.matches('.giant-scroll') && (s.overflowY === 'auto' || s.overflowY === 'scroll') && el.scrollHeight > el.clientHeight + 2) { issues.push(`${el.className || el.tagName} needs scrolling`); break; }
    }
    return { issues, blank: null, pageScroll: false };
  }
}

async function settle(selector) {
  let last = '';
  let steady = 0;
  for (let i = 0; i < 30; i++) {
    await page.waitForTimeout(150);
    const now = await page.evaluate((sel) => {
      const node = document.querySelector(sel);
      const busy = (a) => a.playState === 'running' && a.effect?.getComputedTiming().iterations !== Infinity && a.effect?.target && (a.effect.target.contains(node) || node.contains(a.effect.target));
      if (!node || document.getAnimations().some(busy)) return 'moving';
      return JSON.stringify(node.getBoundingClientRect());
    }, selector);
    if (now === last && now !== 'moving') { if (++steady >= 2) return; } else steady = 0;
    last = now;
  }
}

async function leave() {
  for (let i = 0; i < 4; i++) {
    const open = await page.evaluate(() => Boolean(document.querySelector('#sheet:not([hidden])') || document.querySelector('.pc-menu:not([hidden])') || document.querySelector('#screen-open.is-active') || document.querySelector('.pca-book-view:not([hidden])')));
    if (!open) break;
    await page.keyboard.press('Escape');
    await page.waitForTimeout(450);
  }
  await visit('home');
}

const STATES = [
  ['card window', async () => { await visit('binder'); await page.locator('.pck-card .card').first().click(); await settle('#sheet .sheet-panel'); }, overlayAudit, '#sheet .sheet-panel'],
  ['menu', async () => { await visit('home'); await page.keyboard.press('Escape'); await page.waitForTimeout(500); }, overlayAudit, '.pc-menu-panel'],
  ['album book', async () => { await visit('albums'); await page.locator('.pca-grid > *').first().click().catch(() => {}); await page.waitForTimeout(800); }, audit],
  ['opening', async () => {
    await visit('packs');
    await page.keyboard.press(' ');
    await page.waitForTimeout(1800);
    await page.keyboard.press(' ');
    await page.waitForTimeout(3000);
    await page.keyboard.press(' ');
    await page.waitForTimeout(900);
  }, audit]
];
if (SHOTS) mkdirSync(SHOTS, { recursive: true });
for (const theme of THEMES) {
if (theme) {
  await page.evaluate((id) => localStorage.setItem('wikster.theme', id), theme);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => document.getElementById('pc'), null, { timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(2200);
  for (let i = 0; i < 6; i++) {
    if (!(await page.locator('#sheet').isVisible().catch(() => false))) break;
    await page.keyboard.press('Escape');
    await page.waitForTimeout(400);
  }
}
const tag = theme ? `${theme} ` : '';
for (const [w, h, scale] of CONFIGS) {
  await page.setViewportSize({ width: w, height: h });
  {
    await setScale(scale);
    for (const screen of SCREENS) {
      await visit(screen);
      const groups = await tabsOf();
      const runs = groups.length ? groups.map((g) => ({ group: g })) : [{}];
      if (SUBS[screen]) {
        const n = await page.evaluate((sel) => document.querySelectorAll(sel).length, SUBS[screen]);
        for (let i = 1; i < n; i++) runs.push({ sub: i });
      }
      for (const run of runs) {
        if (run.group) {
          await page.evaluate((g) => document.querySelector(`.pc-legacy .screen.is-active .pc-section-link[data-group="${g}"]`)?.click(), run.group);
          await page.waitForTimeout(420);
        }
        if (run.sub) {
          await page.evaluate(([sel, i]) => document.querySelectorAll(sel)[i]?.click(), [SUBS[screen], run.sub]);
          await page.waitForTimeout(300);
          await settle('.pc-stage');
        }
        record(`${tag}${w}x${h} @${scale} ${screen}${run.group ? '#' + run.group : ''}${run.sub ? '/' + run.sub : ''}`, await page.evaluate(audit));
        if (SHOTS && report.at(-1)?.startsWith('        ')) await page.screenshot({ path: `${SHOTS}/${tag.trim()}${tag ? '-' : ''}${w}x${h}-${scale}-${screen}${run.group ? '-' + run.group : ''}${run.sub ? '-' + run.sub : ''}.png` });
      }
    }
    if (!ONLY || ONLY.includes('states')) {
      for (const [name, enter, check, arg] of STATES) {
        await enter();
        record(`${tag}${w}x${h} @${scale} ${name}`, await page.evaluate(check, arg));
        if (SHOTS && report.at(-1)?.startsWith('        ')) await page.screenshot({ path: `${SHOTS}/${tag.trim()}${tag ? '-' : ''}${w}x${h}-${scale}-${name}.png` });
        await leave();
      }
    }
  }
}
}
if (!ONLY || ONLY.includes('selling')) {
  await page.evaluate(() => { localStorage.setItem('wikster.language', 'fr'); localStorage.setItem('wikster.theme', 'matrix'); });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2600);
  for (let i = 0; i < 6; i++) {
    if (!(await page.locator('#sheet').isVisible().catch(() => false))) break;
    await page.keyboard.press('Escape');
    await page.waitForTimeout(400);
  }
  for (const [w, h, scale] of [[1280, 720, 1.4], [1366, 768, 1], [1920, 1080, 1]]) {
    await page.setViewportSize({ width: w, height: h });
    await setScale(scale);
    await visit('selling');
    record(`fr matrix ${w}x${h} @${scale} selling`, await page.evaluate(audit));
  }
}

function rarityContrast() {
  const parse = (text) => {
    const s = String(text).trim();
    let m = s.match(/^#([0-9a-f]{6})([0-9a-f]{2})?$/i);
    if (m) return { r: parseInt(m[1].slice(0, 2), 16), g: parseInt(m[1].slice(2, 4), 16), b: parseInt(m[1].slice(4, 6), 16), a: m[2] ? parseInt(m[2], 16) / 255 : 1 };
    m = s.match(/^rgba?\(([^)]*)\)$/);
    if (!m) return null;
    const [r, g, b, a = 1] = m[1].split(/[\s,/]+/).filter(Boolean).map(Number);
    return { r, g, b, a };
  };
  const over = (top, under) => ({ r: top.r * top.a + under.r * (1 - top.a), g: top.g * top.a + under.g * (1 - top.a), b: top.b * top.a + under.b * (1 - top.a), a: 1 });
  const lum = (c) => {
    const f = (v) => { const x = v / 255; return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4; };
    return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b);
  };
  const ratio = (a, b) => { const x = lum(a); const y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
  const canvas = parse(getComputedStyle(document.documentElement).getPropertyValue('--intro-bg')) ?? { r: 0, g: 0, b: 0, a: 1 };
  const groundOf = (el) => {
    const chain = [];
    for (let n = el; n && n !== document.documentElement; n = n.parentElement) chain.push(n);
    let ground = canvas;
    for (const n of chain.reverse()) {
      const bg = parse(getComputedStyle(n).backgroundColor);
      if (bg && bg.a > 0) ground = over(bg, ground);
    }
    return ground;
  };
  const issues = [];
  const seen = [];
  const pick = '[style*="color"], .rarity-name, .simple-rarity, .sell-prints i, .pcx-odds-name, .pcx-chip.is-tier, .press-tier, .crate-cap';
  for (const el of document.querySelectorAll(pick)) {
    if (el.matches('[style*="color"]') && !/--rarity-[a-z]+-text/.test(el.style.color) && !el.matches(pick.slice(pick.indexOf(',') + 1))) continue;
    if (!el.checkVisibility({ opacityProperty: true, visibilityProperty: true }) || !el.textContent.trim()) continue;
    const fg = parse(getComputedStyle(el).color);
    if (!fg) continue;
    const ground = groundOf(el);
    const r = ratio(over(fg, ground), ground);
    seen.push(r);
    if (r < 4.5) issues.push(`${el.className || el.tagName} "${el.textContent.trim().slice(0, 20)}" is ${r.toFixed(2)}:1`);
  }
  const holder = document.createElement('div');
  holder.style.cssText = 'position:fixed;left:0;top:0;opacity:0;pointer-events:none';
  document.body.appendChild(holder);
  const grounds = ['var(--surface-solid)', 'transparent', 'var(--surface)', 'var(--surface-2)'];
  for (const tier of window.__wikster.RARITIES) {
    for (const bg of grounds) {
      const box = document.createElement('div');
      box.style.background = bg;
      const span = document.createElement('span');
      span.style.color = `var(--rarity-${tier.id}-text)`;
      span.textContent = tier.id;
      box.appendChild(span);
      holder.appendChild(box);
      const fg = parse(getComputedStyle(span).color);
      const ground = groundOf(span);
      const r = fg ? ratio(fg, ground) : 0;
      if (r < 4.5) issues.push(`${tier.id} text on ${bg} is ${r.toFixed(2)}:1`);
      if (getComputedStyle(span).color === getComputedStyle(holder).color && tier.color.toLowerCase() !== '#ffffff') issues.push(`--rarity-${tier.id}-text is not set`);
    }
  }
  for (const tier of window.__wikster.RARITIES) {
    const chip = document.createElement('span');
    chip.className = 'pcx-chip is-tier';
    chip.style.setProperty('--rarity', tier.color);
    chip.style.setProperty('--rarity-text', `var(--rarity-${tier.id}-text)`);
    chip.textContent = tier.id;
    holder.appendChild(chip);
    const fg = parse(getComputedStyle(chip).color);
    const ground = groundOf(chip);
    const r = fg ? ratio(fg, ground) : 0;
    if (r < 4.5) issues.push(`${tier.id} guarantee chip is ${r.toFixed(2)}:1`);
  }
  holder.remove();
  return { issues, checked: seen.length, worst: seen.length ? Math.min(...seen) : null };
}

if (!ONLY || ONLY.includes('contrast')) {
  await page.evaluate(() => localStorage.setItem('wikster.language', 'en'));
  await page.setViewportSize({ width: 1920, height: 1080 });
  await setScale(1);
  const looks = await page.evaluate(() => window.__wikster.THEMES.map((th) => th.id));
  const customs = {
    'custom light': { v: 1, base: 'paper', palette: { bg: '#f4efe4', ink: '#1d1a14', 'ink-dim': '#5b5446', 'ink-faint': '#6f6757', surface: '#ffffff', 'surface-2': '#f7f2e8', 'surface-solid': '#ffffff', line: '#00000022', 'line-strong': '#00000044', accent: '#e02134', 'accent-2': '#3b82f6', 'accent-ink': '#ffffff', positive: '#15803d', negative: '#b91c1c', warning: '#a16207' }, layers: { sound: 'aurora', font: 'aurora', shape: 'aurora', scene: 'aurora', special: 'none' }, veil: 0 },
    'custom dark red': { v: 1, base: 'aurora', palette: { bg: '#2a0a0a', 'surface-solid': '#330c0c', surface: '#ffffff0e', 'surface-2': '#ffffff16', accent: '#8a1020' }, layers: { sound: 'aurora', font: 'aurora', shape: 'aurora', scene: 'aurora', special: 'none' }, veil: 0 }
  };
  const runs = [...looks.map((id) => [id, null]), ...Object.entries(customs)];
  let checked = 0;
  const found = new Map(runs.map(([id]) => [id, []]));
  const plan = [
    ['profile', runs],
    ...['selling', 'cardindex', 'packs', 'shop'].map((screen) => [screen, runs.filter(([id]) => ['aurora', 'paper', 'cartoon', 'wankel', 'elden', 'custom light'].includes(id))])
  ];
  for (const [screen, list] of plan) {
    await visit(screen);
    for (const [id, custom] of list) {
      await page.evaluate(({ id, custom }) => {
        const w = window.__wikster;
        if (custom) {
          const owned = w.state.profile.owned ?? {};
          w.state.profile.owned = { ...owned, themes: [...new Set([...(owned.themes ?? []), 'custom'])] };
          w.state.profile.customTheme = custom;
          w.setTheme('custom');
        } else {
          w.setTheme(id);
        }
      }, { id, custom });
      const res = await page.evaluate(rarityContrast);
      checked += res.checked;
      found.get(id).push(...res.issues.map((i) => `${screen}: ${i}`));
    }
  }
  for (const [id, issues] of found) record(`rarity names read at 4.5:1 or better on ${id}`, { issues: [...new Set(issues)], blank: null, pageScroll: false });
  record('rarity name contrast looked at real text', { issues: checked > runs.length * 8 ? [] : [`only ${checked} rarity labels were found`], blank: null, pageScroll: false });
  await page.evaluate(() => window.__wikster.setTheme('aurora'));
}

if (!ONLY || ONLY.includes('phone')) {
  const phone = await browser.newContext({ serviceWorkers: 'block', viewport: { width: 360, height: 740 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const pp = await phone.newPage();
  pp.on('pageerror', (e) => errors.push(e.message));
  installStubs(pp);
  await pp.addInitScript(({ entries, inventory }) => {
    if (sessionStorage.getItem('seeded')) return;
    sessionStorage.setItem('seeded', '1');
    localStorage.setItem('wikster.language', 'fr');
    const now = Date.now();
    localStorage.setItem('wikster.profile.v1', JSON.stringify({ started: true, createdAt: now, playMs: 0, boostersOpened: 5, rarityCounts: {}, progress: { level: 5, xp: 0 }, pendingLevels: [], daily: { lastDay: Math.floor(now / 86400000), shownDay: Math.floor(now / 86400000), claimed: 1, board: 0 }, timed: { count: 0, stamp: now }, freeTaken: { window: 0, ids: [] } }));
    localStorage.setItem('wikster.collection.v3', JSON.stringify({ entries }));
    localStorage.setItem('wikster.inventory.v1', JSON.stringify(inventory));
  }, { entries, inventory });
  await pp.goto(BASE, { waitUntil: 'domcontentloaded' });
  await pp.waitForTimeout(2600);
  for (let i = 0; i < 6; i++) {
    if (!(await pp.locator('#sheet').isVisible().catch(() => false))) break;
    await pp.keyboard.press('Escape');
    await pp.waitForTimeout(400);
  }
  for (const id of ['aurora', 'paper', 'wankel', 'elden']) {
    await pp.evaluate((id) => { window.__wikster.setTheme(id); document.querySelector('.nav-item[data-tab="profile"]')?.click(); }, id);
    await pp.waitForTimeout(700);
    const res = await pp.evaluate(rarityContrast);
    record(`phone profile rarity names read at 4.5:1 or better on ${id}`, { issues: res.checked >= 8 ? res.issues : [...res.issues, `only ${res.checked} rarity names found`], blank: null, pageScroll: false });
  }
  await pp.evaluate(() => { window.__wikster.setTheme('aurora'); document.querySelector('.nav-item[data-tab="packs"]')?.click(); });
  await pp.waitForTimeout(500);
  const segments = () => pp.evaluate(() => {
    const shown = [...document.querySelectorAll('.screen.is-active .segmented')].filter((s) => s.checkVisibility());
    if (!shown.length) return ['no segmented control on screen'];
    return shown.flatMap((s) => {
    const box = s.getBoundingClientRect();
    const out = [];
    if (s.scrollWidth > s.clientWidth + 1 || box.left < -1 || box.right > innerWidth + 1) out.push(`#${s.id} is wider than the screen (${s.scrollWidth} > ${s.clientWidth})`);
    for (const o of s.querySelectorAll('.seg-option')) {
      const r = o.getBoundingClientRect();
      if (o.scrollWidth > o.clientWidth + 1 || r.right > box.right + 1 || r.left < box.left - 1) out.push(`"${o.textContent}" is cut in #${s.id}`);
    }
    return out;
    });
  });
  const screens = [['packs', null], ['binder', null], ['leaderboard', 'leaderboard']];
  for (const [tabName, link] of screens) {
    if (link) await pp.evaluate((id) => { document.querySelector('#menu-btn')?.click(); setTimeout(() => document.querySelector(`.drawer-link[data-link="${id}"]`)?.click(), 450); }, link);
    else await pp.evaluate((id) => document.querySelector(`.nav-item[data-tab="${id}"]`)?.click(), tabName);
    await pp.waitForTimeout(1300);
    const issues = await segments();
    record(`phone fr 360 ${tabName} segments`, { issues, blank: null, pageScroll: false });
  }
  await pp.evaluate(() => { window.__wikster.levelUp(6); window.__wikster.season('points', { amount: 4000 }); });
  await pp.waitForTimeout(500);
  const covered = await pp.evaluate(() => {
    const t = document.querySelector('.toast.is-showing')?.getBoundingClientRect();
    if (!t) return ['no toast showed'];
    const panel = document.querySelector('#sheet .sheet-panel')?.getBoundingClientRect();
    if (!panel) return ['no sheet opened'];
    return [...document.querySelectorAll('#sheet .btn, #sheet .sheet-body')].filter((n) => n.checkVisibility()).map((n) => n.getBoundingClientRect())
      .some((r) => r.left < t.right && r.right > t.left && r.top < t.bottom && r.bottom > t.top) ? [`a toast covers the open sheet (${Math.round(t.top)} to ${Math.round(t.bottom)})`] : [];
  });
  record('phone toast stays clear of an open sheet', { issues: covered, blank: null, pageScroll: false });
  for (let i = 0; i < 6; i++) {
    if (!(await pp.locator('#sheet').isVisible().catch(() => false))) break;
    await pp.keyboard.press('Escape');
    await pp.waitForTimeout(400);
  }
  await pp.setViewportSize({ width: 740, height: 340 });
  await pp.evaluate(() => document.querySelector('.nav-item[data-tab="packs"]')?.click());
  await pp.waitForTimeout(1300);
  const fold = await pp.evaluate(() => {
    const nav = document.querySelector('.navbar')?.getBoundingClientRect();
    const floor = nav ? nav.top : innerHeight;
    const out = [];
    for (const sel of ['#packs-name', '#packs-open']) {
      const r = document.querySelector(sel)?.getBoundingClientRect();
      if (!r || r.bottom > floor + 1 || r.top < 0) out.push(`${sel} is below the fold (${Math.round(r?.bottom ?? -1)} > ${Math.round(floor)})`);
    }
    return out;
  });
  record('phone landscape 740x340 boosters name and Open in view', { issues: fold, blank: null, pageScroll: false });
  await phone.close();
}
if (!ONLY || ONLY.includes('dropdowns')) {
  const NATIVE = /<select\b|createElement\(\s*['"]select['"]|\bh\(\s*['"]select|\bnode\(\s*['"]select/;
  const walk = (dir) => readdirSync(dir, { withFileTypes: true }).flatMap((d) => d.isDirectory() ? walk(join(dir, d.name)) : [join(dir, d.name)]);
  const native = [join(ROOT, 'index.html'), ...walk(join(ROOT, 'src')).filter((f) => /\.(js|html)$/.test(f) && !/i18n/.test(f))]
    .filter((f) => NATIVE.test(readFileSync(f, 'utf8'))).map((f) => f.slice(ROOT.length));
  record('no native <select> left in the game source', { issues: native.map((f) => `native select in ${f}`), blank: null, pageScroll: false });

  const flipCheck = (p) => p.evaluate(async () => {
    const host = document.createElement('wk-select');
    host.setAttribute('aria-label', 'Probe');
    host.className = 'filter-select';
    host.style.cssText = 'position:fixed;left:auto;right:12px;bottom:10px;width:220px;z-index:100';
    host.replaceChildren(...Array.from({ length: 40 }, (_, i) => { const o = document.createElement('option'); o.value = String(i); o.textContent = `A long option name number ${i}`; return o; }));
    document.body.appendChild(host);
    host.click();
    await new Promise((r) => setTimeout(r, 400));
    const panel = document.querySelector('.wk-drop:not(.is-leaving) .wk-drop-panel');
    const out = [];
    if (!panel) out.push('the probe did not open');
    else {
      const r = panel.getBoundingClientRect();
      const h = host.getBoundingClientRect();
      const sheet = panel.closest('.wk-drop').classList.contains('is-sheet');
      if (r.top < -1 || r.left < -1 || r.bottom > innerHeight + 1 || r.right > innerWidth + 1) out.push(`the list near the bottom right runs off the window (${Math.round(r.left)},${Math.round(r.top)} to ${Math.round(r.right)},${Math.round(r.bottom)})`);
      if (!sheet && r.bottom > h.top + 1) out.push('the list near the bottom did not flip up');
      if (!panel.querySelector('.wk-drop-search')) out.push('a long list has no search box');
    }
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await new Promise((r) => setTimeout(r, 300));
    if (document.querySelector('.wk-drop:not(.is-leaving)')) out.push('Escape does not close it');
    host.remove();
    return out;
  });
  const nativeNow = (p) => p.evaluate(() => [...document.querySelectorAll('select')].map((n) => `a native select is on screen: ${n.className || n.id}`));
  const shots = SHOTS ? (p, file) => p.screenshot({ path: `${SHOTS}/${file}.png` }) : async () => {};

  await page.evaluate(() => { localStorage.setItem('wikster.language', 'en'); window.__wikster.setTheme('elden'); });
  for (const [w, h, scale] of [[1280, 720, 1.4], [1920, 1080, 1]]) {
    await page.setViewportSize({ width: w, height: h });
    await setScale(scale);
    await visit('selling');
    const issues = [];
    const tools = page.locator('#pc .selling.is-pc .sell-tools wk-select');
    if (await tools.count() < 3) issues.push('the selling filters are not themed dropdowns');
    else {
      await tools.nth(1).click();
      await page.waitForTimeout(400);
      issues.push(...(await page.evaluate(dropdownAudit)).issues);
      await shots(page, `dropdown-pc-${w}x${h}-selling-album`);
      await page.keyboard.press('ArrowDown');
      await page.keyboard.press('Enter');
      await page.waitForTimeout(300);
      if (await page.locator('.wk-drop:not(.is-leaving)').count()) issues.push('Enter does not pick and close');
      if (!(await tools.nth(1).evaluate((n) => n.value))) issues.push('the keyboard pick did not change the album');
      await tools.nth(1).evaluate((n) => { n.value = ''; n.dispatchEvent(new Event('change', { bubbles: true })); });
    }
    issues.push(...await flipCheck(page), ...await nativeNow(page));
    await visit('binder');
    const drop = page.locator('#pc .pcx-drop').last();
    if (await drop.count()) {
      await drop.click();
      await page.waitForTimeout(400);
      issues.push(...(await page.evaluate(dropdownAudit)).issues.map((i) => `collection: ${i}`));
      await page.mouse.click(w - 3, Math.round(h * 0.6));
      await page.waitForTimeout(300);
      if (await page.locator('.wk-drop:not(.is-leaving)').count()) issues.push('a click outside does not close it');
    } else issues.push('the collection has no dropdown');
    record(`dropdowns pc elden ${w}x${h} @${scale}`, { issues, blank: null, pageScroll: false });
  }
  await page.evaluate(() => window.__wikster.setTheme('aurora'));

  const phone = await browser.newContext({ serviceWorkers: 'block', viewport: { width: 360, height: 740 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const pp = await phone.newPage();
  pp.on('pageerror', (e) => errors.push(e.message));
  installStubs(pp);
  await pp.addInitScript(({ entries, seen }) => {
    if (sessionStorage.getItem('seeded')) return;
    sessionStorage.setItem('seeded', '1');
    localStorage.setItem('wikster.language', 'en');
    const now = Date.now();
    localStorage.setItem('wikster.profile.v1', JSON.stringify({ started: true, createdAt: now, playMs: 0, boostersOpened: 5, rarityCounts: {}, progress: { level: 5, xp: 0 }, pendingLevels: [], daily: { lastDay: Math.floor(now / 86400000), shownDay: Math.floor(now / 86400000), claimed: 1, board: 0 }, timed: { count: 0, stamp: now }, freeTaken: { window: 0, ids: [] }, settings: { hints: false } }));
    localStorage.setItem('wikster.collection.v3', JSON.stringify({ entries }));
    localStorage.setItem('wikster.seenRelease.v1', seen);
  }, { entries, seen: RELEASES.at(-1).id });
  await pp.goto(BASE, { waitUntil: 'domcontentloaded' });
  await pp.waitForTimeout(2600);
  for (let i = 0; i < 6; i++) {
    if (!(await pp.locator('#sheet').isVisible().catch(() => false))) break;
    await pp.keyboard.press('Escape');
    await pp.waitForTimeout(400);
  }
  for (const theme of ['elden', 'paper', 'custom']) {
    await pp.evaluate((id) => {
      const w = window.__wikster;
      if (id === 'custom') {
        const owned = w.state.profile.owned ?? {};
        w.state.profile.owned = { ...owned, themes: [...new Set([...(owned.themes ?? []), 'custom'])] };
        w.state.profile.customTheme = { v: 1, base: 'paper', palette: { bg: '#f4efe4', ink: '#1d1a14', 'ink-dim': '#5b5446', 'ink-faint': '#6f6757', surface: '#ffffff', 'surface-2': '#f7f2e8', 'surface-solid': '#ffffff', line: '#00000022', 'line-strong': '#00000044', accent: '#e02134', 'accent-2': '#3b82f6', 'accent-ink': '#ffffff', positive: '#15803d', negative: '#b91c1c', warning: '#a16207' }, layers: { sound: 'aurora', font: 'aurora', shape: 'aurora', scene: 'aurora', special: 'none' }, veil: 0 };
      }
      w.setTheme(id);
    }, theme);
    await pp.evaluate(() => document.querySelector('.nav-item[data-tab="binder"]')?.click());
    await pp.waitForTimeout(700);
    await pp.evaluate(() => document.getElementById('binder-sell')?.click());
    await pp.waitForTimeout(900);
    const issues = [];
    await pp.locator('#screen-selling .sell-tab[data-group="albums"]').click();
    await pp.waitForTimeout(300);
    await pp.locator('#screen-selling .sell-byalbum').click();
    await pp.waitForTimeout(600);
    const res = await pp.evaluate(dropdownAudit);
    issues.push(...res.issues);
    if (!(await pp.locator('.wk-drop.is-sheet').count())) issues.push('the phone list is not a bottom sheet');
    if (!(await pp.locator('.wk-drop-opt .wk-drop-mark.is-art').count())) issues.push('albums show no emblem');
    await shots(pp, `dropdown-phone-${theme}-album-pick`);
    const album = await pp.locator('.wk-drop-opt').nth(1).getAttribute('data-value');
    await pp.locator('.wk-drop-opt').nth(1).click();
    await pp.waitForTimeout(500);
    if (await pp.locator('.wk-drop:not(.is-leaving)').count()) issues.push('picking does not close the list');
    if (!(await pp.locator(`#screen-selling .sell-tag[data-remove="album:${album}"]`).count())) issues.push(`picking an album did not add its quick pick (${album})`);
    await pp.locator('#screen-selling .sell-tools wk-select').first().click();
    await pp.waitForTimeout(500);
    issues.push(...(await pp.evaluate(dropdownAudit)).issues.map((i) => `rarity: ${i}`));
    if (!(await pp.locator('.wk-drop-opt .wk-drop-mark .dot').count())) issues.push('rarities show no diamond');
    await pp.locator('.wk-drop-scrim').click({ position: { x: 20, y: 20 } });
    await pp.waitForTimeout(400);
    if (await pp.locator('.wk-drop:not(.is-leaving)').count()) issues.push('tapping outside does not close the list');
    issues.push(...await flipCheck(pp), ...await nativeNow(pp));
    record(`dropdowns phone ${theme} selling`, { issues, blank: null, pageScroll: false });
  }
  await phone.close();
}
if (!ONLY || ONLY.includes('customtile')) {
  const made = [['dead-cells', 'Dead Cells', 'deadcells.fandom.com'], ['zelda', 'The Legend of Zelda Encyclopedia', 'zelda.fandom.com'], ['star-wars', 'Star Wars', 'starwars.fandom.com'], ['hollow', 'Hollow Knight', 'hollowknight.fandom.com']]
    .map(([id, name, host]) => ({ id: `custom-${id}`, name, tagline: name, icon: 'wand', accent: '#ef4444', accent2: '#450a0a', wiki: { apiUrl: `https://${host}/api.php`, sitename: name } }));
  const seedCustoms = ({ made, lang, pc, scale, seen }) => {
    localStorage.setItem('wikster.language', lang);
    if (pc) localStorage.setItem('wikster.layout.v1', 'pc');
    if (scale) localStorage.setItem('wikster.uiScale.v1', String(scale));
    const now = Date.now();
    localStorage.setItem('wikster.profile.v1', JSON.stringify({ started: true, createdAt: now, playMs: 0, boostersOpened: 5, rarityCounts: {}, progress: { level: 5, xp: 0 }, pendingLevels: [], daily: { lastDay: Math.floor(now / 86400000), shownDay: Math.floor(now / 86400000), claimed: 1, board: 0 }, timed: { count: 0, stamp: now }, freeTaken: { window: 0, ids: [] } }));
    localStorage.setItem('wikster.wallet.v1', '23456');
    localStorage.setItem('wikster.customPacks.v2', JSON.stringify(made));
    localStorage.setItem('wikster.customBuy.v1', JSON.stringify({ last: { cards: 4, qty: 4 }, byId: { 'custom-dead-cells': { cards: 4, qty: 4 } } }));
    localStorage.setItem('wikster.seenRelease.v1', seen);
  };
  const tileRun = async (where, { viewport, pc = false, scale = null, mobile = false, lang = 'en', go, del = false }) => {
    const c = await browser.newContext({ serviceWorkers: 'block', viewport, deviceScaleFactor: 1, isMobile: mobile, hasTouch: mobile });
    const p = await c.newPage();
    p.on('pageerror', (e) => errors.push(e.message));
    installStubs(p);
    await p.addInitScript(seedCustoms, { made, lang, pc, scale, seen: RELEASES.at(-1).id });
    await p.goto(BASE, { waitUntil: 'domcontentloaded' });
    await p.waitForTimeout(2600);
    for (let i = 0; i < 6; i++) {
      if (!(await p.locator('#sheet').isVisible().catch(() => false))) break;
      await p.keyboard.press('Escape');
      await p.waitForTimeout(400);
    }
    await go(p);
    await p.waitForTimeout(900);
    const first = p.locator('.shop-tile.is-sized').first();
    await first.scrollIntoViewIfNeeded().catch(() => {});
    await first.locator('[data-step="1"]').click();
    await first.locator('[data-step="1"]').click();
    await p.waitForTimeout(300);
    const res = await p.evaluate(customTileAudit);
    const issues = [...res.issues];
    if (!res.count) issues.push('no custom tile on screen');
    if ((await first.getAttribute('data-cards')) !== '6') issues.push(`the remembered size did not come back and step to 6 (${await first.getAttribute('data-cards')})`);
    if (mobile) {
      const tiles = await p.locator('.shop-tile.is-sized').count();
      for (let i = 0; i < tiles; i++) {
        await p.locator('.shop-tile.is-sized').nth(i).scrollIntoViewIfNeeded();
        const foot = await p.locator('.shop-tile.is-sized').nth(i).evaluate((tile) => {
          const b = tile.querySelector('.buy').getBoundingClientRect();
          return b.height > 20 && b.width > 80 ? null : `tile ${tile.dataset.spec} has no usable Buy button`;
        });
        if (foot) issues.push(foot);
      }
    }
    if (del) {
      const before = await p.locator('.shop-tile.is-sized').count();
      await first.locator('.pcc-delete').click();
      await p.waitForTimeout(500);
      if (!(await p.locator('#sheet .btn-danger').isVisible())) issues.push('deleting a wiki does not ask first');
      await p.keyboard.press('Escape');
      await p.waitForTimeout(500);
      if ((await p.evaluate(() => JSON.parse(localStorage.getItem('wikster.customPacks.v2') ?? '[]').length)) !== made.length || (await p.locator('.shop-tile.is-sized').count()) !== before) issues.push('closing the question deleted the wiki anyway');
    }
    record(`custom tile ${where}`, { issues, blank: null, pageScroll: false });
    if (SHOTS && issues.length) await p.screenshot({ path: `${SHOTS}/customtile-${where.replace(/\W+/g, '-')}.png` });
    await c.close();
  };
  const phoneShop = async (p) => { await p.locator('.nav-item[data-tab="shop"]').click(); };
  const pcCustom = async (p) => { await p.evaluate(() => globalThis.wiksterPc?.screen('custom')); await p.waitForTimeout(700); await p.locator('.pcb-bar .pcx-seg-item').nth(1).click(); };
  const pcShop = async (p) => { await p.evaluate(() => globalThis.wiksterPc?.screen('shop')); await p.waitForTimeout(700); await p.locator('.pcs-link[data-page="custom"]').click(); };
  await tileRun('phone 360x640', { viewport: { width: 360, height: 640 }, mobile: true, go: phoneShop });
  await tileRun('phone fr 412x915', { viewport: { width: 412, height: 915 }, mobile: true, lang: 'fr', go: phoneShop });
  await tileRun('phone landscape 915x412', { viewport: { width: 915, height: 412 }, mobile: true, go: phoneShop });
  for (const [w, h, scale] of [[1280, 720, 1.4], [1440, 900, 1], [1920, 1080, 1]]) {
    await tileRun(`pc ${w}x${h} @${scale} custom wikis`, { viewport: { width: w, height: h }, pc: true, scale, go: pcCustom, del: true });
    await tileRun(`pc fr ${w}x${h} @${scale} shop built boosters`, { viewport: { width: w, height: h }, pc: true, scale, lang: 'fr', go: pcShop });
  }
}
if (!ONLY || ONLY.includes('frames')) {
  const { FRAME_STYLES, FRAME_SEAT, FRAME_REACH, frameSvg } = await import('../../src/frames.js');
  const raster = async (items) => page.evaluate(async ({ items, seat, reach }) => {
    const V = 64, S = 2, W = V * 2 * S;
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = W;
    const g = canvas.getContext('2d', { willReadFrequently: true });
    const out = [];
    for (const { name, svg } of items) {
      const box = document.createElement('div');
      box.innerHTML = svg;
      const inner = [...box.children].map((s) => s.innerHTML).join('');
      const img = new Image();
      img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="${-V} ${-V} ${2 * V} ${2 * V}" width="${W}" height="${W}">${inner}</svg>`)}`;
      try { await img.decode(); } catch { out.push(`${name} does not render`); continue; }
      g.clearRect(0, 0, W, W);
      g.drawImage(img, 0, 0);
      const data = g.getImageData(0, 0, W, W).data;
      let painted = 0, inside = 0, outside = 0;
      for (let y = 0; y < W; y++) {
        for (let x = 0; x < W; x++) {
          const a = data[(y * W + x) * 4 + 3];
          if (a < 24) continue;
          painted++;
          const ux = (x + 0.5) / S - V, uy = (y + 0.5) / S - V;
          if (Math.hypot(ux, uy) < seat - 0.8) inside++;
          if (Math.abs(ux) > reach || Math.abs(uy) > reach) outside++;
        }
      }
      if (painted < 400) out.push(`${name} draws almost nothing (${painted} px)`);
      if (inside) out.push(`${name} paints ${inside} px over the ring`);
      if (outside) out.push(`${name} spills ${outside} px out of its box`);
    }
    return out;
  }, { items, seat: FRAME_SEAT, reach: FRAME_REACH });
  for (const style of FRAME_STYLES) {
    const items = Array.from({ length: 50 }, (_, i) => ({ name: `${style.id} tier ${i + 1}`, svg: frameSvg(style.id, i + 1) }));
    record(`frame ${style.id}: fifty tiers clear the ring and stay in the box`, { issues: await raster(items), blank: null, pageScroll: false });
  }
  const seat = await page.evaluate(({ list, seat }) => {
    const issues = [];
    const host = document.createElement('div');
    host.style.cssText = 'position:fixed;left:0;top:0;display:flex;flex-wrap:wrap;gap:90px;padding:90px;z-index:99999;background:var(--surface-solid)';
    host.className = 'fr-still';
    host.innerHTML = '<style>.fr-still * { animation: none !important; }</style>';
    document.body.appendChild(host);
    for (const { id, svg } of list) {
      for (const size of [22, 30, 40, 62]) {
        const ring = document.createElement('span');
        ring.className = 'ring';
        ring.style.cssText = `width:${size}px;height:${size}px`;
        ring.innerHTML = `<svg viewBox="0 0 ${size} ${size}" width="${size}" height="${size}"><circle class="ring-track" cx="${size / 2}" cy="${size / 2}" r="${size / 2 - 2}" fill="none" stroke-width="3"/></svg><span class="ring-label">500</span><span class="frame-overlay" aria-hidden="true">${svg}</span>`;
        if (size < 30) ring.querySelector('.ring-label').style.fontSize = '0.55rem';
        host.appendChild(ring);
        const r = ring.getBoundingClientRect();
        const l = ring.querySelector('.ring-label').getBoundingClientRect();
        const o = ring.querySelector('.frame-overlay').getBoundingClientRect();
        const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
        if (Math.abs(l.left + l.width / 2 - cx) > 0.75 || Math.abs(l.top + l.height / 2 - cy) > 0.75) issues.push(`${id} @${size}px: the level number is off centre`);
        const room = (r.width / 2) * (seat / 29);
        if (Math.hypot(l.width / 2, l.height / 2) > room + 0.5) issues.push(`${id} @${size}px: the level number reaches the frame`);
        if (Math.abs(o.width - r.width * 2) > 1 || Math.abs(o.left + o.width / 2 - cx) > 0.75 || Math.abs(o.top + o.height / 2 - cy) > 0.75) issues.push(`${id} @${size}px: the frame is not seated on the ring`);
        const layers = [...ring.querySelectorAll('.frame-overlay > svg')].filter((s) => getComputedStyle(s).display !== 'none');
        if (!layers.length || layers.some((s) => { const b = s.getBoundingClientRect(); return Math.abs(b.width - o.width) > 1 || Math.abs(b.left - o.left) > 1; })) issues.push(`${id} @${size}px: a layer is not stacked on the frame`);
        const hidden = [...ring.querySelectorAll('.fr-fine')].filter((n) => getComputedStyle(n).display !== 'none').length;
        if (size <= 40 && hidden) issues.push(`${id} @${size}px: fine detail still drawn at a small size`);
      }
    }
    const overlays = [...document.querySelectorAll('#app .frame-overlay, #pc .frame-overlay')].filter((o) => o.getBoundingClientRect().width);
    for (const o of overlays) {
      const p = o.parentElement.getBoundingClientRect(), b = o.getBoundingClientRect();
      if (Math.abs(b.width - p.width * 2) > 1.5 || Math.abs(b.left + b.width / 2 - (p.left + p.width / 2)) > 1) issues.push(`a frame in ${o.parentElement.id || o.parentElement.className} is not twice its ring and centred on it`);
    }
    host.remove();
    return issues;
  }, { list: FRAME_STYLES.map((s) => ({ id: s.id, svg: frameSvg(s.id, 50) })), seat: FRAME_SEAT });
  record('frames: the level number stays centred and clear inside every frame, at every size', { issues: seat, blank: null, pageScroll: false });
}
if (!process.env.FIT_LIVE) console.log(report.join('\n'));
if (process.env.FIT_REPORT) writeFileSync(process.env.FIT_REPORT, report.join('\n'));
const errs = errors.filter((e) => !/Failed to fetch|NetworkError|Load failed/.test(e));
console.log(`\n${failures} layout(s) with problems, ${errs.length} page error(s)`);
for (const e of errs.slice(0, 5)) console.log(`  error: ${e}`);
await browser.close();
process.exit(failures || errs.length ? 1 : 0);
