import { chromium, devices } from 'playwright';
import { launchOptions } from '../lib/browser.mjs';
import { installStubs } from '../lib/stubs.mjs';
import { BOOSTER_LOOKS } from '../../src/data/looks.js';

let fails = 0;
const check = (l, c, e = '') => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${e ? '  ' + e : ''}`); };
const section = (s) => console.log(`\n== ${s}`);
const BASE = process.env.BASE_URL ?? 'http://127.0.0.1:4173/';
const SPEC = { kind: 'theme', themeId: 'animals', rarityId: null, cards: 5 };
const SPEC_ID = 'theme|animals|std|5';
const browser = await chromium.launch(launchOptions());
const errors = [];

async function open({ pc = false, look = null, count = 4, settings = {}, reduced = false } = {}) {
  const ctx = await browser.newContext({
    serviceWorkers: 'block',
    ...(pc ? { viewport: { width: 1600, height: 900 }, deviceScaleFactor: 1 } : devices['Pixel 7']),
    ...(reduced ? { reducedMotion: 'reduce' } : {})
  });
  const p = await ctx.newPage();
  p.on('pageerror', (e) => errors.push(e.message));
  installStubs(p);
  await p.addInitScript(({ look, count, settings, specId, spec }) => {
    if (sessionStorage.getItem('seeded')) return;
    sessionStorage.setItem('seeded', '1');
    localStorage.setItem('wikster.language', 'en');
    const now = Date.now();
    localStorage.setItem('wikster.profile.v1', JSON.stringify({
      started: true, tourDone: true, createdAt: now, playMs: 0, boostersOpened: 6, rarityCounts: {}, progress: { level: 12, xp: 0 }, pendingLevels: [],
      daily: { v: 2, day: 3, weeks: 2, lastDay: Math.floor(now / 86400000), shownDay: Math.floor(now / 86400000) },
      timed: { count: 0, stamp: now }, freeTaken: { window: 0, ids: [] }, settings
    }));
    localStorage.setItem('wikster.wallet.v1', '20000');
    localStorage.setItem('wikster.inventory.v1', JSON.stringify({ [specId]: { spec, count } }));
    if (look) localStorage.setItem('wikster.boosterLook.v1', JSON.stringify(look));
  }, { look, count, settings, specId: SPEC_ID, spec: SPEC });
  await p.goto(BASE, { waitUntil: 'domcontentloaded' });
  await p.waitForTimeout(2400);
  for (let i = 0; i < 6; i++) {
    if (!(await p.locator('#sheet').isVisible().catch(() => false))) break;
    await p.keyboard.press('Escape');
    await p.waitForTimeout(400);
  }
  return { ctx, p };
}

const toShelf = async (p) => { await p.evaluate(() => document.querySelector('.nav-item[data-tab="packs"]')?.click()); await p.waitForTimeout(600); };
const idle = (p) => p.waitForFunction(() => document.querySelector('#screen-open')?.classList.contains('phase-idle'), null, { timeout: 8000 });
const reveal = (p) => p.waitForFunction(() => document.querySelector('#screen-open')?.classList.contains('phase-reveal'), null, { timeout: 30000 });
const freeze = (p) => p.addStyleTag({ content: '*, *::before, *::after { animation: none !important; transition: none !important; }' });

async function tearRegion(p) {
  return p.evaluate(() => {
    const tear = document.querySelector('#screen-open .booster-tear');
    const r = tear.getBoundingClientRect();
    return { x: Math.round(r.x) + 2, y: Math.round(r.y) + 2, width: Math.round(r.width) - 4, height: Math.round(r.height) - 4 };
  });
}

async function pixels(p, buf) {
  return p.evaluate(async (b64) => {
    const img = new Image();
    img.src = `data:image/png;base64,${b64}`;
    await img.decode();
    const c = document.createElement('canvas');
    c.width = img.naturalWidth; c.height = img.naturalHeight;
    const g = c.getContext('2d');
    g.drawImage(img, 0, 0);
    return Array.from(g.getImageData(0, 0, c.width, c.height).data);
  }, buf.toString('base64'));
}

const mean = (px) => {
  const s = [0, 0, 0];
  for (let i = 0; i < px.length; i += 4) { s[0] += px[i]; s[1] += px[i + 1]; s[2] += px[i + 2]; }
  const n = px.length / 4;
  return s.map((v) => v / n);
};
const diff = (a, b) => {
  let d = 0;
  for (let i = 0; i < a.length; i += 4) d += Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2]);
  return d / (a.length / 4) / 3;
};

async function flapShot(p) {
  await freeze(p);
  await p.waitForTimeout(250);
  const clip = await tearRegion(p);
  const withTear = await pixels(p, await p.screenshot({ clip }));
  await p.evaluate(() => { for (const n of document.querySelectorAll('#screen-open :is(.booster-tear, .booster-mouth)')) n.style.visibility = 'hidden'; });
  await p.waitForTimeout(80);
  const under = await pixels(p, await p.screenshot({ clip }));
  await p.evaluate(() => { for (const n of document.querySelectorAll('#screen-open :is(.booster-tear, .booster-mouth)')) n.style.visibility = ''; });
  return { withTear, under };
}

section('the booster skin covers the flap too');
const flaps = {};
const misfits = [];
for (const look of BOOSTER_LOOKS.map((l) => l.id)) {
  const deep = look === 'kraft' || look === 'deco';
  const { ctx, p } = await open({ look });
  await toShelf(p);
  await p.locator('#packs-open').click();
  await idle(p);
  const dom = await p.evaluate(() => {
    const booster = document.querySelector('#screen-open .booster');
    const tear = booster.querySelector('.booster-tear');
    const body = booster.querySelector('.booster-body > .look');
    const flap = tear.querySelector('.look');
    return { look: booster.dataset.look, body: body?.className, flap: flap?.className, bg: getComputedStyle(tear).backgroundImage };
  });
  const { withTear, under } = await flapShot(p);
  const d = diff(withTear, under);
  if (!(dom.look === look && dom.flap && dom.flap === dom.body && dom.bg === 'none' && d < 6)) misfits.push(`${look} ${d.toFixed(1)} ${JSON.stringify(dom)}`);
  flaps[look] = mean(withTear);
  if (!deep) { await ctx.close(); continue; }
  check(`${look}: the flap carries the skin`, dom.look === look && dom.flap && dom.flap === dom.body, JSON.stringify(dom));
  check(`${look}: and not the default foil`, dom.bg === 'none', dom.bg);
  check(`${look}: the flap looks exactly like the skin under it`, d < 6, d.toFixed(2));
  const zone = await p.locator('#screen-open .rip-zone').boundingBox();
  await p.evaluate(() => { document.querySelector('#screen-open .rip-zone').dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); });
  await p.waitForFunction(() => document.querySelector('.tear-scrap'), null, { timeout: 5000 }).catch(() => null);
  const scrap = await p.evaluate(() => {
    const s = document.querySelector('.tear-scrap');
    return s ? { has: s.classList.contains('has-look'), look: s.querySelector('.look')?.className ?? null } : null;
  });
  check(`${look}: the torn-off strip is the skin too`, scrap?.has && scrap.look === dom.body, JSON.stringify(scrap));
  check(`${look}: the rip zone was on screen`, Boolean(zone));
  await ctx.close();
}
check(`every one of the ${BOOSTER_LOOKS.length} skins draws its own flap`, misfits.length === 0, misfits.join(' | '));
const gap = Math.abs(flaps.kraft[0] - flaps.deco[0]) + Math.abs(flaps.kraft[1] - flaps.deco[1]) + Math.abs(flaps.kraft[2] - flaps.deco[2]);
check('two skins give two different flaps', gap > 40, JSON.stringify(flaps));
{
  const { ctx, p } = await open({ look: 'kraft' });
  await toShelf(p);
  await p.locator('#packs-open').click();
  await idle(p);
  await p.addStyleTag({ content: '.booster-tear > .look { display: none !important; } .booster[data-look] .booster-tear { background: linear-gradient(168deg, #3b4a8a, #0b0f20) !important; }' });
  const { withTear, under } = await flapShot(p);
  check('the pixel check catches a flap that ignores the skin', diff(withTear, under) > 20, diff(withTear, under).toFixed(2));
  await ctx.close();
}
{
  const { ctx, p } = await open({ look: 'kraft', pc: true });
  await p.evaluate(() => document.querySelector('#packs-open')?.click());
  await idle(p);
  const { withTear, under } = await flapShot(p);
  check('on a computer too, the flap matches the skin', diff(withTear, under) < 6, diff(withTear, under).toFixed(2));
  await ctx.close();
}

section('skip the opening animation');
{
  const { ctx, p } = await open({ count: 3 });
  await p.evaluate(() => document.querySelector('.appbar .icon-btn')?.click());
  await p.waitForTimeout(450);
  await p.locator('.drawer-link[data-link="settings"]').click();
  await p.waitForTimeout(700);
  const row = p.locator('#settings-list .row').filter({ hasText: 'Skip opening animation' });
  check('settings has the switch', await row.count() === 1);
  await row.locator('.switch').click();
  await p.waitForTimeout(200);
  check('it is remembered', await p.evaluate(() => JSON.parse(localStorage.getItem('wikster.profile.v1')).settings.skipOpening === true));
  await toShelf(p);
  await p.locator('#packs-open').click();
  await idle(p);
  check('the opening screen shows the quick switch, on', await p.locator('#open-fast').isVisible() && (await p.locator('#open-fast').getAttribute('aria-checked')) === 'true');
  check('a tap is all it takes', /tap/i.test(await p.locator('#open-hint').textContent()), await p.locator('#open-hint').textContent());
  await p.evaluate(() => {
    window.__motion = { scraps: 0, emerging: 0 };
    new MutationObserver((list) => {
      for (const m of list) {
        for (const n of m.addedNodes) if (n instanceof HTMLElement && n.classList.contains('tear-scrap')) window.__motion.scraps++;
        if (m.type === 'attributes' && m.target instanceof HTMLElement && /is-emerging|is-dealt|is-bursting/.test(m.target.className)) window.__motion.emerging++;
      }
    }).observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] });
  });
  const t0 = Date.now();
  await p.locator('#screen-open .rip-zone').dispatchEvent('pointerdown', { pointerId: 1, isPrimary: true, pointerType: 'touch', bubbles: true });
  await reveal(p);
  const took = Date.now() - t0;
  check('the cards are ready at once', took < 1500, `${took} ms`);
  check('no tear, no shuffle, no dealing', await p.evaluate(() => window.__motion.scraps === 0 && window.__motion.emerging === 0), await p.evaluate(() => JSON.stringify(window.__motion)));
  check('the booster is gone from the table', await p.evaluate(() => document.querySelector('#screen-open .booster').classList.contains('is-gone')));
  check('the deck is laid out, one card showing', await p.locator('#card-stack .stack-card').count() === 5 && await p.locator('#card-stack .stack-card.is-revealed').count() === 1);
  await p.locator('#open-next').click();
  await p.waitForTimeout(300);
  check('turning the next card stays in the player hands', await p.locator('#card-stack .stack-card.is-revealed').count() === 2);
  await p.locator('#open-skip').click();
  await p.waitForTimeout(700);
  check('reveal all still works', await p.locator('#screen-open.phase-summary').count() === 1 && await p.locator('#summary .card').count() === 5);
  await p.locator('#open-done').click();
  await p.waitForTimeout(500);
  await p.locator('#packs-open').click();
  await idle(p);
  await p.locator('#open-fast').click();
  await p.waitForTimeout(200);
  check('the quick switch turns it off again', await p.evaluate(() => JSON.parse(localStorage.getItem('wikster.profile.v1')).settings.skipOpening === false) && (await p.locator('#open-fast').getAttribute('aria-checked')) === 'false');
  check('and the hint goes back to the rip', /slide|rip/i.test(await p.locator('#open-hint').textContent()), await p.locator('#open-hint').textContent());
  await ctx.close();
}
{
  const { ctx, p } = await open({ count: 2, reduced: true });
  await toShelf(p);
  await p.locator('#packs-open').click();
  await idle(p);
  check('with reduced motion a tap opens too', /tap/i.test(await p.locator('#open-hint').textContent()));
  const t0 = Date.now();
  await p.locator('#screen-open .rip-zone').dispatchEvent('pointerdown', { pointerId: 1, isPrimary: true, pointerType: 'touch', bubbles: true });
  await reveal(p);
  check('and takes the same fast path', Date.now() - t0 < 1500 && await p.evaluate(() => !document.querySelector('.tear-scrap')), `${Date.now() - t0} ms`);
  await ctx.close();
}

section('open all of the same booster');
{
  const { ctx, p } = await open({ count: 4 });
  await toShelf(p);
  check('the shelf offers to open all four', await p.locator('#packs-open-all').isVisible() && (await p.locator('#packs-open-all').textContent()) === 'Open all 4');
  await p.locator('#packs-open-all').click();
  await idle(p);
  check('the screen names the batch', (await p.locator('#open-title').textContent()) === 'Animals ×4' && await p.locator('.booster-batch').isVisible());
  await p.locator('#open-all').click();
  await p.waitForTimeout(200);
  check('it can go back to just one', (await p.locator('#open-title').textContent()) === 'Animals' && await p.locator('.booster-batch').count() === 0);
  await p.locator('#open-all').click();
  await p.waitForTimeout(200);
  check('and to all of them again', (await p.locator('#open-title').textContent()) === 'Animals ×4');
  const zone = await p.locator('#screen-open .rip-zone').boundingBox();
  const y = zone.y + zone.height / 2;
  await p.locator('#screen-open .rip-zone').dispatchEvent('pointerdown', { pointerId: 1, clientX: zone.x + 20, clientY: y, isPrimary: true, pointerType: 'touch', bubbles: true });
  for (let dx = 30; dx <= 300; dx += 30) await p.evaluate(({ x, yy }) => window.dispatchEvent(new PointerEvent('pointermove', { pointerId: 1, clientX: x, clientY: yy, isPrimary: true, pointerType: 'touch', bubbles: true })), { x: zone.x + 20 + dx, yy: y });
  await p.evaluate(({ x, yy }) => window.dispatchEvent(new PointerEvent('pointerup', { pointerId: 1, clientX: x, clientY: yy, isPrimary: true, pointerType: 'touch', bubbles: true })), { x: zone.x + 320, yy: y });
  await reveal(p);
  check('one tear opens all four', await p.locator('#card-stack .stack-card').count() === 20);
  check('all four boosters are used', await p.evaluate(() => !JSON.parse(localStorage.getItem('wikster.inventory.v1'))['theme|animals|std|5']));
  check('and counted as four openings', await p.evaluate(() => window.__wikster.state.profile.boostersOpened === 10));
  check('the cards lie face down in a grid', await p.locator('#card-stack .stack-card.is-revealed').count() === 0 && await p.evaluate(() => getComputedStyle(document.querySelector('#card-stack')).display === 'grid'));
  check('no sideways overflow', await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
  await p.locator('#card-stack .stack-card').nth(7).click();
  await p.waitForTimeout(400);
  check('a tap turns one over', await p.locator('#card-stack .stack-card.is-revealed').count() === 1 && /1 of 20/i.test(await p.locator('#open-progress').textContent()), await p.locator('#open-progress').textContent());
  await p.locator('#open-skip').click();
  await p.waitForTimeout(1200);
  check('reveal all shows every card', await p.locator('#summary .card').count() === 20);
  check('best cards first', await p.evaluate(() => {
    const order = window.__wikster.RARITIES.map((r) => r.id);
    const ranks = [...document.querySelectorAll('#summary .card')].map((c) => order.indexOf(c.dataset.rarity));
    return ranks.every((r, i) => i === 0 || ranks[i - 1] >= r);
  }));
  check('every card is in the collection', await p.evaluate(() => window.__wikster.state.pulls.every((pull) => window.__wikster.state.collection.entries[pull.article.key])));
  await ctx.close();
}
{
  const { ctx, p } = await open({ count: 3, pc: true });
  const all = p.locator('.pch-actions button', { hasText: 'Open all 3' });
  check('the computer stand offers open all', await all.count() === 1);
  await all.click();
  await idle(p);
  check('the HUD has the skip switch', await p.locator('.pc-open-fast').isVisible() && (await p.locator('.pc-open-fast').getAttribute('aria-checked')) === 'false');
  await p.keyboard.press('f');
  await p.waitForTimeout(150);
  check('F turns it on', (await p.locator('.pc-open-fast').getAttribute('aria-checked')) === 'true' && await p.evaluate(() => window.__wikster.state.profile.settings.skipOpening === true));
  const t0 = Date.now();
  await p.keyboard.press('Space');
  await reveal(p);
  check('Space opens the three at once, straight to the cards', await p.locator('#card-stack .stack-card').count() === 15 && Date.now() - t0 < 2000, `${Date.now() - t0} ms`);
  await p.keyboard.press('Space');
  await p.waitForTimeout(300);
  check('Space turns the next card', await p.locator('#card-stack .stack-card.is-revealed').count() === 1);
  const cols = await p.evaluate(() => getComputedStyle(document.querySelector('#card-stack')).gridTemplateColumns.split(' ').length);
  check('the cards sit in rows on the table', cols >= 6, String(cols));
  await p.keyboard.press('Escape');
  await p.waitForTimeout(900);
  check('Esc reveals them all', await p.locator('#screen-open.phase-summary').count() === 1 && await p.locator('#card-stack .stack-card.is-revealed').count() === 15);
  await ctx.close();
}

check('no page errors', errors.length === 0, errors.slice(0, 3).join(' | '));
await browser.close();
console.log(fails ? `\n${fails} FAILED` : '\nALL PASS');
process.exit(fails ? 1 : 0);
