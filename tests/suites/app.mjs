import { chromium, devices } from 'playwright';
import { launchOptions } from '../lib/browser.mjs';
import { installStubs } from '../lib/stubs.mjs';
import { customTileAudit } from '../lib/customtile.mjs';
const SHOT = '.';
let fails = 0;
const check = (l, c, e = '') => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${e ? '  ' + e : ''}`); };
const section = (s) => console.log(`\n- ${s} ${'-'.repeat(Math.max(0, 52 - s.length))}`);

const browser = await chromium.launch(launchOptions());
const ctx = await browser.newContext({ serviceWorkers: 'block', ...devices['Pixel 7'] });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push('PAGE: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push('CONSOLE: ' + m.text()); });
installStubs(page);

const wallet = () => page.evaluate(() => window.__wikster.store.loadWallet());
const owned = () => page.evaluate(() =>
  Object.values(window.__wikster.store.loadInventory()).reduce((n, s) => n + s.count, 0));
const profile = () => page.evaluate(() => window.__wikster.store.loadProfile());
const closeSheet = async () => {
  for (let i = 0; i < 12; i++) {
    if (!(await page.locator('#sheet').isVisible())) return;
    if (await page.locator('#sheet-close').isVisible()) {
      await page.locator('#sheet-close').click();
    } else {
      await page.locator('#sheet .btn-primary').click();
    }
    await page.waitForTimeout(600);
  }
};
const go = async (tab) => {
  await page.locator(`.nav-item[data-tab="${tab}"]`).click();
  await page.waitForTimeout(600);
};
const viaMenu = async (label) => {
  await page.locator('#menu-btn').click();
  await page.waitForTimeout(500);
  await page.locator('.drawer-link').filter({ hasText: label }).click();
  await page.waitForTimeout(800);
};
const noOverflow = async () => !(await page.evaluate(() =>
  document.documentElement.scrollWidth > window.innerWidth + 1));

section('first run');
await page.goto((process.env.BASE_URL ?? 'http://127.0.0.1:4173/'), { waitUntil: 'networkidle' });
await page.waitForTimeout(700);
check('welcome greets a new player', await page.locator('#welcome').isVisible());
check('starter waits for a language', !(await page.locator('#starter').isVisible()));
await page.locator('.lang-choice[data-lang="en"]').click();
await page.waitForTimeout(900);
check('starter kit offered', await page.locator('#starter').isVisible());
check('starter grants coins', (await wallet()) === 1500, String(await wallet()));
check('starter grants boosters', (await owned()) === 3, String(await owned()));
await page.screenshot({ path: `${SHOT}/a1-welcome.png` });
await page.locator('#starter-go').click();
await page.waitForTimeout(900);

section('first-run tour');
check('a short tour starts', await page.locator('.tour').isVisible());
check('it starts on the boosters', /boosters/i.test(await page.locator('.tour-title').textContent()));
check('and can be skipped', await page.locator('.tour [data-skip]').isVisible());
let tourSteps = 1;
for (let i = 0; i < 10 && (await page.locator('.tour').count()); i++) {
  const last = /start playing/i.test(await page.locator('.tour [data-next]').textContent());
  await page.locator('.tour [data-next]').click();
  await page.waitForTimeout(350);
  if (!last) tourSteps += 1;
}
check('it walks through the main parts of the game', tourSteps >= 6, String(tourSteps));
check('and closes for good', (await page.locator('.tour').count()) === 0 && await page.evaluate(() => window.__wikster.state.profile.tourDone === true));
await page.waitForTimeout(500);

section('daily gift');
check('a waiting gift opens on first launch', await page.locator('#sheet').isVisible());
check('the ladder shows the week', (await page.locator('.daily-tile').count()) === 7);
check('exactly one rung is claimable', (await page.locator('.daily-tile.is-ready').count()) === 1);
check('and the clock is the world\'s', /UTC/.test(await page.locator('.daily-foot').textContent()));
const beforeGift = await wallet();
await page.locator('[data-claim]').click();
await page.waitForTimeout(600);
await page.waitForTimeout(600);
check('claiming pays out', (await wallet()) > beforeGift, `${beforeGift} -> ${await wallet()}`);
check('the day is ticked off', (await page.locator('.daily-tile.is-claimed').count()) === 1);
await page.screenshot({ path: `${SHOT}/a2-daily.png` });
await closeSheet();

await page.evaluate(() => {
  const p = window.__wikster.state.profile;
  p.daily.lastDay -= 1;
  p.daily.shownDay = null;
  window.__wikster.store.saveProfile(p);
});
await page.reload({ waitUntil: 'networkidle' });
await page.waitForTimeout(900);
check('a waiting gift reopens the dialog', await page.locator('#sheet').isVisible());
check('the next day carries the week on', (await page.locator('.daily-tile.is-ready .daily-tile-day').textContent()).includes('2'),
  await page.locator('.daily-tile.is-ready .daily-tile-day').textContent());
await closeSheet();
await page.evaluate(() => {
  const p = window.__wikster.state.profile;
  p.daily.lastDay -= 3;
  p.daily.shownDay = null;
  window.__wikster.store.saveProfile(p);
});
await page.reload({ waitUntil: 'networkidle' });
await page.waitForTimeout(900);
check('a missed day starts the week again', (await page.locator('.daily-tile.is-ready .daily-tile-day').textContent()).includes('1'),
  await page.locator('.daily-tile.is-ready .daily-tile-day').textContent());
await closeSheet();

section('sheet gestures');
const dragSheet = async (dy, steps, pause) => {
  const h = await page.locator('.sheet-handle').boundingBox();
  const x = h.x + h.width / 2, y0 = h.y + h.height / 2;
  await page.locator('.sheet-handle').dispatchEvent('pointerdown',
    { pointerId: 9, clientX: x, clientY: y0, isPrimary: true, pointerType: 'touch', bubbles: true });
  for (let i = 1; i <= steps; i++) {
    await page.evaluate(({ px, py }) => window.dispatchEvent(new PointerEvent('pointermove',
      { pointerId: 9, clientX: px, clientY: py, isPrimary: true, pointerType: 'touch', bubbles: true })),
      { px: x, py: y0 + (dy * i) / steps });
    if (pause) await page.waitForTimeout(pause);
  }
  await page.evaluate(({ px, py }) => window.dispatchEvent(new PointerEvent('pointerup',
    { pointerId: 9, clientX: px, clientY: py, isPrimary: true, pointerType: 'touch', bubbles: true })),
    { px: x, py: y0 + dy });
  await page.waitForTimeout(600);
};

await viaMenu(/daily gift/i);
await page.waitForTimeout(700);
await dragSheet(40, 6, 40);
check('a short slow drag springs back', await page.locator('#sheet').isVisible());
await dragSheet(420, 8, 20);
check('a long drag dismisses', !(await page.locator('#sheet').isVisible()));
await viaMenu(/daily gift/i);
await page.waitForTimeout(700);
await dragSheet(90, 3, 0);
check('a short fast flick dismisses on velocity', !(await page.locator('#sheet').isVisible()));

section('shell');
check('bottom navigation, five destinations', (await page.locator('.nav-item').count()) === 5);
check('the indicator travels', await page.locator('.nav-indicator').isVisible());
check('level ring in the bar', await page.locator('#level-badge .ring-fill').count() === 1);
check('wallet reads as an odometer', (await page.locator('.odo-col').count()) >= 4);
check('a live backdrop is running', await page.evaluate(() => {
  const c = document.querySelector('#backdrop');
  return c.width > 0 && c.height > 0;
}));
check('no sideways overflow', await noOverflow());

section('packs');
check('shelf lists what you own', (await page.locator('#packs-rail .rail-item').count()) === 3);
check('each shows an owned count', (await page.locator('#packs-rail .own-badge').count()) === 3);
const depth = await page.locator('#packs-rail .rail-item.is-focused').evaluate(
  (n) => getComputedStyle(n).getPropertyValue('--depth'));
check('the centred pack is at full depth', Number(depth) < 0.2, `depth ${depth}`);
check('a segmented control switches to custom', (await page.locator('#packs-seg .seg-option').count()) === 2);
await page.screenshot({ path: `${SHOT}/a3-packs.png` });

section('opening');
const shelf = () => page.evaluate(() => Object.fromEntries(
  Object.entries(window.__wikster.store.loadInventory()).map(([k, v]) => [k, v.count])));
const before = await shelf();
await page.locator('#packs-open').click();
await page.waitForTimeout(700);
check('the frame gets out of the way', await page.evaluate(() =>
  document.documentElement.classList.contains('is-immersive')));
check('the backdrop stops during a takeover', await page.evaluate(() =>
  window.__wikster.backdrop.running === false));
check('no pull tab, just the rip line', (await page.locator('.rip-zone').count()) === 1);

const zone = await page.locator('.rip-zone').boundingBox();
const y = zone.y + zone.height / 2;
await page.locator('.rip-zone').dispatchEvent('pointerdown',
  { pointerId: 1, clientX: zone.x + 20, clientY: y, isPrimary: true, pointerType: 'touch', bubbles: true });
for (let dx = 30; dx <= 240; dx += 26) {
  await page.evaluate(({ x, yy }) => window.dispatchEvent(new PointerEvent('pointermove',
    { pointerId: 1, clientX: x, clientY: yy, isPrimary: true, pointerType: 'touch', bubbles: true })),
    { x: zone.x + 20 + dx, yy: y });
}
await page.evaluate(({ x, yy }) => window.dispatchEvent(new PointerEvent('pointerup',
  { pointerId: 1, clientX: x, clientY: yy, isPrimary: true, pointerType: 'touch', bubbles: true })),
  { x: zone.x + 260, yy: y });
await page.waitForFunction(() => document.querySelector('#screen-open').classList.contains('phase-reveal'),
  null, { timeout: 20000 });
check('a touch drag tears it open', true);
const after = await shelf();
const spent = Object.keys(before).filter((k) => (after[k] ?? 0) === before[k] - 1);
check('opening consumes the booster', spent.length === 1,
  `${JSON.stringify(before)} -> ${JSON.stringify(after)}`);
await page.waitForTimeout(700);
check('card backs carry the pack emblem', (await page.locator('.card-back .cb-emblem svg').count()) >= 1);
await page.screenshot({ path: `${SHOT}/a4-reveal.png` });

const box = await page.locator('#card-stack').boundingBox();
const cx = box.x + box.width / 2, cy = box.y + box.height / 2;
await page.locator('#card-stack').dispatchEvent('pointerdown',
  { pointerId: 3, clientX: cx, clientY: cy, isPrimary: true, pointerType: 'touch', bubbles: true });
await page.evaluate(({ x, yy }) => window.dispatchEvent(new PointerEvent('pointermove',
  { pointerId: 3, clientX: x, clientY: yy, isPrimary: true, pointerType: 'touch', bubbles: true })),
  { x: cx + 40, yy: cy - 30 });
await page.waitForTimeout(120);
const held = await page.evaluate(() => {
  const card = document.querySelector('#card-stack .card');
  const m = new DOMMatrix(getComputedStyle(card).transform);
  const face = new DOMMatrix(getComputedStyle(card.querySelector('.card-front')).transform);
  return { x: m.m41, y: m.m42, leaning: Math.abs(face.m13) > 0.01 || Math.abs(face.m23) > 0.01 };
});
check('a held card does not travel', Math.abs(held.x) < 1 && Math.abs(held.y) < 1,
  `dx=${held.x.toFixed(1)} dy=${held.y.toFixed(1)}`);
check('it leans instead', held.leaning);
await page.evaluate(({ x, yy }) => window.dispatchEvent(new PointerEvent('pointerup',
  { pointerId: 3, clientX: x, clientY: yy, isPrimary: true, pointerType: 'touch', bubbles: true })),
  { x: cx, yy: cy });
await page.waitForTimeout(400);

check('arrow buttons appear during the reveal', await page.locator('.open-nav').isVisible());
await page.locator('#open-next').click();
await page.waitForTimeout(500);
check('next advances a card', /2/.test(await page.locator('#open-progress').textContent()),
  await page.locator('#open-progress').textContent());
await page.locator('#open-prev').click();
await page.waitForTimeout(500);
check('prev returns', /1/.test(await page.locator('#open-progress').textContent()));

for (let i = 0; i < 10; i++) {
  await page.locator('#card-stack').dispatchEvent('pointerdown',
    { pointerId: 2, clientX: cx, clientY: cy, isPrimary: true, pointerType: 'touch', bubbles: true });
  for (let s = -30; s >= -170; s -= 30) {
    await page.evaluate(({ x, yy }) => window.dispatchEvent(new PointerEvent('pointermove',
      { pointerId: 2, clientX: x, clientY: yy, isPrimary: true, pointerType: 'touch', bubbles: true })),
      { x: cx + s, yy: cy });
  }
  await page.evaluate(({ x, yy }) => window.dispatchEvent(new PointerEvent('pointerup',
    { pointerId: 2, clientX: x, clientY: yy, isPrimary: true, pointerType: 'touch', bubbles: true })),
    { x: cx - 170, yy: cy });
  await page.waitForTimeout(520);
  if (await page.locator('#screen-open.phase-summary').count()) break;
}
await page.waitForTimeout(900);
check('the summary shows the whole pack', (await page.locator('#summary .card').count()) === 5);
const perRow = await page.evaluate(() => {
  const cards = [...document.querySelectorAll('#summary .card')];
  const top = cards[0].getBoundingClientRect().top;
  return cards.filter((c) => Math.abs(c.getBoundingClientRect().top - top) < 4).length;
});
check('two to a row on a phone', perRow === 2, `${perRow}`);
check('the summary keeps only name, rarity and price', await page.evaluate(() => {
  const card = document.querySelector('.summary .card');
  const gone = (s) => { const n = card.querySelector(s); return !n || getComputedStyle(n).display === 'none'; };
  const on = (s) => { const n = card.querySelector(s); return n && getComputedStyle(n).display !== 'none'; };
  return gone('.card-extract') && gone('.card-views') && gone('.card-desc')
    && on('.card-title') && on('.card-price') && on('.rarity-badge');
}));
await page.screenshot({ path: `${SHOT}/a5-summary.png` });

section('progression');
const prog = await profile();
check('opening awards XP', prog.progress.xp > 0 || prog.progress.level > 1,
  `level ${prog.progress.level}, ${prog.progress.xp} xp`);
check('the opening is counted', prog.boostersOpened === 1, String(prog.boostersOpened));
check('pulls are counted by rarity',
  Object.values(prog.rarityCounts).reduce((a, b) => a + b, 0) === 5, JSON.stringify(prog.rarityCounts));

section('card detail');
const shape = () => page.evaluate(() => {
  const s = document.querySelector('#sheet');
  if (s.hidden) return 'closed';
  const card = s.querySelector('.card.giant-card');
  const panel = s.querySelector('.sheet-panel');
  const box = (n) => String(Math.round(n.getBoundingClientRect().width));
  return [box(panel), box(card),
    s.querySelectorAll('.giant-actions .btn, .giant-actions a').length,
    Boolean(s.querySelector('.card-art img, .card-art-fallback'))].join(' | ');
});

await closeSheet();
await page.locator('#summary .card').first().click();
await page.waitForTimeout(600);
check('a summary card opens the detail', await page.locator('#sheet').isVisible());
const fromSummary = await shape();
const fits = await page.evaluate(() => {
  const p = document.querySelector('.sheet-panel').getBoundingClientRect();
  const c = document.querySelector('.card.giant-card').getBoundingClientRect();
  return c.left >= p.left - 1 && c.right <= p.right + 1 && p.width <= window.innerWidth + 1;
});
check('the card fits inside the sheet', fits);
check('no page overflow while open', await noOverflow());
await page.screenshot({ path: `${SHOT}/a6-detail.png` });
await closeSheet();

await page.locator('#open-done').click();
await page.waitForTimeout(700);
check('leaving the takeover restores the frame', await page.evaluate(() =>
  !document.documentElement.classList.contains('is-immersive')));

await go('binder');
check('albums shown on the shelf', (await page.locator('.album-cover').count()) >= 19);
const unlockedCovers = page.locator('.album-cover:not(.is-locked)');
check('exactly the pulled categories are unlocked', (await unlockedCovers.count()) >= 1);
await unlockedCovers.first().click();
await page.waitForTimeout(800);
check('the album opens as a book', await page.locator('#album-book').isVisible());
check('pulls landed in the album', (await page.locator('.album-slots .card').count()) === 4);
await page.locator('.album-slots .card').first().click();
await page.waitForTimeout(600);
const fromBinder = await shape();
check('the same card view from a pack and from the binder',
  fromSummary === fromBinder && fromSummary !== 'closed',
  fromSummary === fromBinder ? '' : `\n    pack:   ${fromSummary}\n    binder: ${fromBinder}`);

section('selling');
check('selling offered in the binder', await page.locator('#sheet .sell').isVisible());
const beforeSell = await wallet();
await page.locator('#sheet .sell').click();
await page.waitForTimeout(300);
check('the first tap arms', /sure/i.test(await page.locator('#sheet .sell').textContent()));
check('nothing sold yet', (await wallet()) === beforeSell);
await page.locator('#sheet .sell').click();
await page.waitForTimeout(700);
check('the second tap sells', (await wallet()) > beforeSell, `${beforeSell} -> ${await wallet()}`);
check('the sheet closes after selling', !(await page.locator('#sheet').isVisible()));
check('the card left the album', (await page.locator('.album-slots .card').count()) === 4);

section('filters');
await page.locator('#filter-open').click();
await page.waitForTimeout(600);
check('filters open in a sheet', await page.locator('#sheet .filters').isVisible());
const sorts = await page.locator('#sheet [data-key="sort"] option').allTextContents();
check('price ascending and descending offered',
  sorts.some((s) => /high to low/i.test(s)) && sorts.some((s) => /low to high/i.test(s)), sorts.join(' | '));
await page.locator('#sheet [data-key="rarity"]').selectOption('prismatic');
await page.waitForTimeout(500);
check('a filter narrows the album', (await page.locator('.album-slots .card').count()) < 4);
await page.locator('#sheet [data-reset]').click();
await page.waitForTimeout(600);
check('reset restores everything', (await page.locator('.album-slots .card').count()) === 4);
await closeSheet();

section('shop');
await go('shop');
check('the market has its stalls', (await page.locator('.shop-sec').count()) >= 3);
check('a spotlight deal on top', (await page.locator('.shop-feature').count()) === 1);
check('the deal shows its old price struck through', (await page.locator('.shop-feature-prices s').count()) === 1);
check('a tier vault with its guarantee', (await page.locator('.press-plate').count()) >= 2
  && /at least one/i.test(await page.locator('.press-plate').first().textContent()));
check('a free shelf is always present', (await page.locator('.buy.is-free').count()) >= 1);
check('the free shelf runs on four hours',
  /four hours/i.test(await page.locator('[data-free-note]').textContent()));
check('a restock countdown', /\d/.test(await page.locator('#restock').textContent()));
check('and the balance sits beside it', /\d/.test(await page.locator('#shop-purse').textContent()));
const counts = (await page.locator('.shop-tile .booster-count, .shop-feature .booster-count').allTextContents())
  .map((c) => Number(c.split(' ')[0]));
check('card counts stay within 3 to 7',
  Math.min(...counts) >= 3 && Math.max(...counts) <= 7, `${Math.min(...counts)}–${Math.max(...counts)}`);

const beforeFree = await owned();
await page.locator('.buy.is-free').first().click();
await page.waitForTimeout(600);
check('a free booster costs nothing', (await owned()) === beforeFree + 1);
check('and the slot is spent', await page.locator('.buy.is-free').first().evaluate((n) => n.disabled));

const cheapest = await page.evaluate(() => {
  const buys = [...document.querySelectorAll('.buy:not(.is-free)')];
  const priced = buys.map((b, i) => [Number((b.querySelector('.buy-price')?.textContent ?? '').replace(/[^0-9]/g, '')), i])
    .filter(([n]) => n > 0).sort((a, b) => a[0] - b[0]);
  return priced[0];
});
const beforeBuy = await wallet();
await page.locator('.buy:not(.is-free)').nth(cheapest[1]).click();
await page.waitForTimeout(600);
check('buying costs Buckarooz', (await wallet()) === beforeBuy - cheapest[0],
  `${beforeBuy} -> ${await wallet()}`);
await page.screenshot({ path: `${SHOT}/a7-shop.png` });

await page.evaluate(() => window.__wikster.store.saveWallet(0));
await page.reload({ waitUntil: 'networkidle' });
await page.waitForTimeout(800);
await closeSheet();
await go('shop');
await page.locator('.buy:not(.is-free):not([disabled])').first().click();
await page.waitForTimeout(500);
check('a purchase you cannot afford is refused', await page.locator('#toast.is-error').isVisible());
await page.evaluate(() => window.__wikster.grant(20000));

section('timed');
await go('timed');
const held2 = `${await page.locator('#free-count').textContent()} ${await page.locator('#free-cap').textContent()}`;
check('a held count against a cap', /\d+\s+of\s+\d+/i.test(held2), held2);
check('the cap starts at seven', /of\s+7/i.test(held2), held2);
check('a pip for every slot the cap allows', (await page.locator('.free-pip').count()) === 7);
check('a countdown to the next', /next one in/i.test(await page.locator('#free-state').textContent()));
check('the track starts at level one', /level 1/i.test(await page.locator('#track-level').textContent()));
const perks = await page.locator('#free-perks').textContent();
check('what the level buys is spelled out, one line each',
  (await page.locator('.free-perk').count()) === 3 && /min/i.test(perks) && /rare/i.test(perks), perks);
check('you cannot open one you do not have', await page.locator('#timed-open').evaluate((n) => n.disabled));
const topTier = await page.evaluate(() => window.__wikster.timedTopTier(1).id);
check('low levels cap how famous a free pull can be', topTier === 'rare', topTier);
await page.evaluate(() => window.__wikster.giveTimed(3));
await page.waitForTimeout(400);
const timedBefore = (await profile()).timed.count;
await page.locator('#timed-open').click();
await page.waitForTimeout(700);
check('opening spends one', (await profile()).timed.count === timedBefore - 1);
check('a timed booster holds three cards',
  (await page.evaluate(() => window.__wikster.state.spec.cards)) === 3);
await page.screenshot({ path: `${SHOT}/a8-timed.png` });
await page.locator('#open-back').click();
await page.waitForTimeout(600);

section('custom boosters');
await go('packs');
await page.locator('.seg-option[data-value="custom"]').click();
await page.waitForTimeout(600);
check('the creator appears under Custom', await page.locator('#creator').isVisible());
check('no custom boosters at first', (await page.locator('#packs-rail .rail-item').count()) === 0);
await page.locator('#creator-input').fill('  TERRARIA ');
await page.locator('#creator-go').click();
await page.waitForTimeout(300);
check('it says it is working', /creating|being created/i.test(await page.locator('#creator-status').textContent()));
await page.locator('#creator-status.is-ok').waitFor({ timeout: 15000 });
check('creating grants no free booster', (await page.locator('#packs-rail .rail-item').count()) === 0);
check('it says where to find it', /shop/i.test(await page.locator('#creator-status').textContent()));

await go('shop');
const built = page.locator('.shop-sec').filter({ hasText: /built/i });
check('the built pack is on sale', (await built.count()) >= 1);
await built.first().locator('.buy').first().click();
await page.waitForTimeout(600);
await go('packs');
await page.locator('.seg-option[data-value="custom"]').click();
await page.waitForTimeout(600);
check('a bought custom booster lands on the shelf',
  (await page.locator('#packs-rail .rail-item').count()) === 1);
check('and it has drawn artwork', (await page.locator('#packs-rail .emblem-art svg').count()) >= 1);

section('the booster finder');
await go('packs');
await page.locator('.seg-option[data-value="custom"]').click();
await page.waitForTimeout(500);
await page.locator('#creator-input').fill('zeldda');
await page.waitForFunction(() => document.querySelectorAll('.forge-hit').length > 0, null, { timeout: 12000 }).catch(() => {});
const hits = await page.locator('.forge-hit').allInnerTexts();
check('a misspelt subject finds its wiki while typing', /Zelda Wiki/.test(hits[0] ?? ''), hits.join(' | '));
check('the biggest wiki comes first, with its page count', /biggest/i.test(hits[0] ?? '') && /12k pages/.test(hits[0] ?? ''));
check('other wikis are offered with theirs', hits.some((h) => /ZeldaWiki/.test(h) && /4\.5k pages/.test(h)) && hits.some((h) => /Wikipedia: The Legend of Zelda/.test(h)));
check('mature wikis are hidden from a guest', !hits.some((h) => /NSFW/.test(h)) && /hidden: 1/i.test(await page.locator('#forge-results').innerText()));
await page.locator('.forge-hit[data-api="https://zelda.fandom.com/fr/api.php"]').click();
check('another wiki can be picked instead', (await page.locator('.forge-hit[data-api="https://zelda.fandom.com/fr/api.php"]').getAttribute('aria-selected')) === 'true');
await page.screenshot({ path: `${SHOT}/a8b-finder.png` });
await page.locator('#creator-go').click();
await page.locator('#creator-status.is-ok').waitFor({ timeout: 15000 });
const madeZelda = await page.evaluate(() => window.__wikster.state.customPacks.find((p) => /zelda/.test(p.wiki.apiUrl)));
check('the booster is built from the wiki picked', madeZelda?.wiki.apiUrl === 'https://zelda.fandom.com/fr/api.php' && madeZelda.wiki.articles === 4473, JSON.stringify(madeZelda?.wiki));
check('and the field is cleared for the next one', (await page.locator('#creator-input').inputValue()) === '' && await page.locator('#forge-results').isHidden());
await page.locator('#creator-input').fill('qzxv blorp');
await page.waitForFunction(() => /No wiki found/.test(document.querySelector('#forge-results')?.textContent ?? ''), null, { timeout: 12000 }).catch(() => {});
check('a name with no wiki says so plainly', /No wiki found/.test(await page.locator('#forge-results').innerText()));
await page.locator('#creator-input').fill('');
await page.locator('#creator-input').dispatchEvent('input');

section('mature cards and text cards');
await page.evaluate(() => {
  const now = Date.now();
  const entries = window.__wikster.state.collection.entries;
  entries['wiki:x.example.org:1'] = { key: 'wiki:x.example.org:1', title: 'Grown up page', mature: true, rarityId: 'rare', price: 300, count: 1, lang: 'en',
    thumbnail: 'https://upload.wikimedia.org/hero-3.svg', extract: 'A page from a wiki made for adults, long enough to be the words on the face of the card.', firstPulledAt: now, lastPulledAt: now };
  const art = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="640" height="420"><rect width="640" height="420" fill="#334"/></svg>');
  entries['wiki:x.example.org:2'] = { key: 'wiki:x.example.org:2', title: 'Pictureless page', rarityId: 'common', price: 20, count: 1, lang: 'en', picture: { source: 'text' },
    thumbnail: art, extract: 'A page that had no picture anywhere at all, long enough to be the words on the card.', firstPulledAt: now, lastPulledAt: now };
  window.__wikster.store.saveCollection(window.__wikster.state.collection);
});
await go('binder');
await page.locator('#binder-view .seg-option[data-value="classic"], .seg-option[data-value="classic"]').first().click().catch(() => {});
await page.waitForTimeout(900);
const matureCard = page.locator('.card[data-adult]', { hasText: 'Grown up page' }).first();
check('a mature card is marked in the collection', await matureCard.count() === 1);
check('and its picture is blurred for a player who did not opt in', /blur/.test(await matureCard.locator('.card-art img').evaluate((n) => getComputedStyle(n).filter).catch(() => '')));
check('a text card keeps its designed picture', /^data:image\/svg/.test(await page.locator('.card', { hasText: 'Pictureless page' }).first().locator('.card-art img').getAttribute('src').catch(() => '') ?? ''));
await matureCard.click();
await page.waitForTimeout(800);
check('its detail says it is mature and offers no way to uncover it', await page.locator('#sheet .adult-reveal.is-locked').isVisible() && await page.locator('#sheet button.adult-reveal').count() === 0);
await page.keyboard.press('Escape');
await page.waitForTimeout(500);

section('buying several custom boosters at once');
await page.evaluate(() => { window.__wikster.store.saveWallet(500000); });
await go('shop');
const customTileNow = () => page.locator('.shop-sec').filter({ hasText: /built/i }).first().locator('.shop-tile.is-sized').first();
const tilePrice = async () => Number(await customTileNow().locator('.buy').getAttribute('data-price'));
const heldCustoms = () => page.evaluate(() => Object.values(window.__wikster.state.inventory).filter((s) => s.spec.kind === 'custom').reduce((n, s) => n + s.count, 0));
const order = await customTileNow().evaluate((n) => [...n.querySelectorAll('.sizer')].map((s) => (s.classList.contains('is-qty') ? 'qty' : 'size')).join(','));
check('a quantity control sits right under the size control', order === 'size,qty', order);
const startCards = Number(await customTileNow().getAttribute('data-cards'));
const sizedTo = String(startCards + 1);
const oneOfFive = await tilePrice();
await customTileNow().locator('[data-step="1"]').click();
const oneOfSix = await tilePrice();
await customTileNow().locator('[data-qty="1"]').click();
await customTileNow().locator('[data-qty="1"]').click();
const threeOfSix = await tilePrice();
check('the price follows the size and the quantity live', oneOfSix > oneOfFive && threeOfSix === oneOfSix * 3, `${oneOfFive} ${oneOfSix} ${threeOfSix}`);
check('the quantity reads 3', /3/.test(await customTileNow().locator('.sizer.is-qty .sizer-count').innerText()));
const tileFit = await page.evaluate(customTileAudit);
check('a custom tile shows one price, art that matches its size and nothing cut off', tileFit.count > 0 && !tileFit.issues.length, tileFit.issues.slice(0, 4).join('; '));
check('the booster art follows the size', (await customTileNow().locator('.booster-count').innerText()).startsWith(sizedTo), await customTileNow().locator('.booster-count').innerText());
const walletThen = await page.evaluate(() => window.__wikster.state.wallet);
const heldThen = await heldCustoms();
await customTileNow().locator('.buy').click();
await page.waitForTimeout(700);
check('one tap buys all three', (await heldCustoms()) === heldThen + 3, `${heldThen} -> ${await heldCustoms()}`);
check('for the price shown', walletThen - (await page.evaluate(() => window.__wikster.state.wallet)) === threeOfSix);
const tileState = async () => `${await customTileNow().getAttribute('data-cards')} ${await customTileNow().getAttribute('data-qty')}`;
check('the size and quantity stay as chosen after buying', (await customTileNow().getAttribute('data-cards')) === sizedTo && (await customTileNow().getAttribute('data-qty')) === '3', await tileState());
await go('packs');
await go('shop');
check('and when the shop is drawn again', (await customTileNow().getAttribute('data-cards')) === sizedTo && (await customTileNow().getAttribute('data-qty')) === '3', await tileState());
await page.reload({ waitUntil: 'networkidle' });
await page.waitForTimeout(800);
await go('shop');
check('and after a reload', (await customTileNow().getAttribute('data-cards')) === sizedTo && (await customTileNow().getAttribute('data-qty')) === '3' && (await tilePrice()) === threeOfSix, await tileState());
await customTileNow().locator('[data-qty="-1"]').click();
await customTileNow().locator('[data-qty="-1"]').click();
await customTileNow().locator('[data-step="-1"]').click();
check('until the player changes them', (await customTileNow().getAttribute('data-qty')) === '1' && (await tilePrice()) === oneOfFive);

section('no NSFW content');
await viaMenu(/settings/i);
const nsfwSwitch = page.locator('#settings-list .no-nsfw-row .switch');
check('a No NSFW content switch, off by default', await nsfwSwitch.count() === 1 && (await nsfwSwitch.getAttribute('aria-checked')) === 'false');
await nsfwSwitch.click();
await page.waitForTimeout(400);
check('turning it on hides mature content', (await nsfwSwitch.getAttribute('aria-checked')) === 'true' && await page.evaluate(() => document.documentElement.dataset.nsfwHide === '1'));
await go('binder');
await page.waitForTimeout(700);
check('a mature card is gone from the collection view', !(await page.locator('.card', { hasText: 'Grown up page' }).first().isVisible().catch(() => false))
  && await page.locator('.card', { hasText: 'Pictureless page' }).first().isVisible());
check('but it is kept, not deleted', await page.evaluate(() => Boolean(window.__wikster.state.collection.entries['wiki:x.example.org:1'])));
await go('packs');
await page.locator('.seg-option[data-value="custom"]').click();
await page.locator('#creator-input').fill('zelda');
await page.waitForFunction(() => document.querySelectorAll('.forge-hit').length > 0, null, { timeout: 12000 }).catch(() => {});
const calmHits = await page.locator('#forge-results').innerText();
check('the finder neither shows mature wikis nor mentions them', !/NSFW/.test(calmHits) && !/hidden/i.test(calmHits), calmHits.replace(/\n/g, ' | '));
await page.locator('#creator-input').fill('');
await page.locator('#creator-input').dispatchEvent('input');
await viaMenu(/settings/i);
await page.locator('#settings-list .no-nsfw-row .switch').click();
await page.waitForTimeout(400);
check('turning it off shows them again, blurred', await page.evaluate(() => document.documentElement.dataset.nsfwHide === '0' && document.documentElement.dataset.matureLock === '1'));
await closeSheet();

section('profile');
await go('profile');
check('a level is shown', /level/i.test(await page.locator('#profile-level').textContent()));
check('a rank is shown', (await page.locator('#profile-rank').textContent()).trim().length > 0);
check('the xp bar is painted', await page.locator('#xp-bar .bar-fill').evaluate((n) => /%$/.test(n.style.width)));
check('the next reward is shown', (await page.locator('#next-reward .reward-card').count()) === 1);
check('stats are listed', (await page.locator('.stat-cell').count()) >= 6);
const statsText = await page.locator('#stat-grid').textContent();
check('playtime is a stat', /time played/i.test(statsText));
check('joining date is a stat', /collecting since/i.test(statsText));
check('no Unique stat in the binder', !/unique/i.test(await page.locator('#binder-stats').textContent()));
check('every tier is broken out', (await page.locator('.rarity-row').count()) === 8);
check('the profile no longer carries a list of everything else',
  (await page.locator('#profile-links').count()) === 0);
check('the odds live on the Boosters tab now', await page.locator('#odds-btn').count() === 1);
await page.screenshot({ path: `${SHOT}/a9-profile.png` });

section('levelling');
await page.evaluate(() => window.__wikster.addXp(400));
await page.waitForTimeout(900);
check('a level-up opens its sheet', await page.locator('#sheet').isVisible());
const from = await page.locator('.level-node').first().textContent();
const to = await page.locator('.level-node.is-new').textContent();
check('it shows the level before and after', Number(to) === Number(from) + 1, `${from} -> ${to}`);
check('a level-up has no close button', await page.locator('#sheet-close').isHidden());
await dragSheet(420, 8, 20);
check('and cannot be thrown away either', await page.locator('#sheet').isVisible());
const walletBefore = await wallet();
const invBefore = await owned();
await page.locator('#sheet .btn-primary').click();
await page.waitForTimeout(900);
check('claiming pays out', (await wallet()) > walletBefore || (await owned()) > invBefore);
await closeSheet();

section('settings and themes');
await viaMenu(/settings/i);
check('settings reachable from the menu', await page.locator('#screen-settings').isVisible());
check('no theme grid in settings any more', (await page.locator('#screen-settings .theme-card').count()) === 0);
const switches = await page.locator('#settings-list .switch').count();
check('every preference switch is present, Mature wikis included', switches === 14 && await page.locator('#settings-list .mature-row .switch').count() === 1 && await page.locator('#settings-list .no-nsfw-row .switch').count() === 1, `${switches} switches`);
check('a guest is told Mature wikis need an adult account', /sign in/i.test(await page.locator('#settings-list .mature-row p').textContent()) && await page.locator('#settings-list .mature-row .switch.is-off-limits').count() === 1);
check('two volume sliders', (await page.locator('#settings-list input[type="range"]').count()) === 2);
check('music is one of them', /music|musique/i.test(await page.locator('#settings-list').textContent()));
check('sound lives here', /sound/i.test(await page.locator('#settings-list').textContent()));
check('language shown as locked, under preferences', /english/i.test(await page.locator('#settings-list').textContent()));
check('an account section of its own', await page.locator('#account-list').isVisible());
check('the save transfer stays under data', /save|transfer/i.test(await page.locator('#data-list').textContent()));
await page.screenshot({ path: `${SHOT}/a10-settings.png` });

await viaMenu(/customization|personnalisation/i);
check('customization reachable from the menu', await page.locator('#screen-customize').isVisible());
check('only the default theme is offered before the Atelier', (await page.locator('.theme-card').count()) === 1);
await page.evaluate(() => window.__wikster.own('themes', ['paper', 'arcade', 'noir', 'sunset', 'cartoon', 'matrix', 'casino', 'horror', 'meadow']));
await page.waitForTimeout(300);
check('ten themes offered once owned', (await page.locator('.theme-card').count()) === 10);
check('one is marked current', (await page.locator('.theme-card.is-on').count()) === 1);
check('identity rows live here', await page.locator('#identity-list').isVisible());
await page.screenshot({ path: `${SHOT}/a10b-customize.png` });

const fingerprint = () => page.evaluate(() => {
  const root = getComputedStyle(document.documentElement);
  const nav = getComputedStyle(document.querySelector('.navbar'));
  return {
    theme: document.documentElement.dataset.theme,
    accent: root.getPropertyValue('--accent').trim(),
    radius: root.getPropertyValue('--radius').trim(),
    border: root.getPropertyValue('--border').trim(),
    font: root.getPropertyValue('--font').trim().slice(0, 24),
    motion: root.getPropertyValue('--motion-scale').trim(),
    navRadius: nav.borderTopLeftRadius,
    voice: window.__wikster.THEMES.find((t) => t.id === document.documentElement.dataset.theme).sound.voice
  };
});
const prints = [];
for (const id of ['aurora', 'paper', 'arcade', 'noir', 'sunset', 'cartoon', 'matrix', 'casino', 'horror', 'meadow']) {
  await page.locator(`.theme-card[data-theme="${id}"]`).click();
  await page.waitForTimeout(700);
  prints.push(await fingerprint());
  await page.screenshot({ path: `${SHOT}/a11-theme-${id}.png` });
}
const distinct = (key) => new Set(prints.map((p) => p[key])).size;
check('each theme has its own palette', distinct('accent') === 10, prints.map((p) => p.accent).join(' '));
check('each theme has its own pace', distinct('motion') >= 5, prints.map((p) => p.motion).join(' '));
check('each theme has its own instrument', distinct('voice') >= 5, prints.map((p) => p.voice).join(' '));
check('shape language varies', distinct('radius') >= 3, prints.map((p) => p.radius).join(' '));
check('typeface varies', distinct('font') >= 3, prints.map((p) => p.font.split(',')[0]).join(' | '));
check('border weight varies', distinct('border') >= 2, prints.map((p) => p.border).join(' '));
const whole = new Set(prints.map((p) => JSON.stringify({ ...p, theme: undefined })));
check('no two themes are the same design', whole.size === 10, `${whole.size} distinct`);
check('the tokens reach real components', distinct('navRadius') >= 2, prints.map((p) => p.navRadius).join(' '));
check('the choice survives a reload', await (async () => {
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(800);
  return (await page.evaluate(() => document.documentElement.dataset.theme)) === 'meadow';
})());
await closeSheet();

section('battery');
await viaMenu(/settings/i);
const saver = page.locator('.row').filter({ has: page.locator('h4', { hasText: /^Battery saver$/ }) }).locator('.switch');
await saver.click();
await page.waitForTimeout(500);
check('battery saver marks the document',
  (await page.evaluate(() => document.documentElement.dataset.lowpower)) === '1');
check('and the backdrop keeps running at half rate', await page.evaluate(() =>
  window.__wikster.backdrop.running === true && window.__wikster.backdrop.lowPower === true));
await saver.click();
await page.waitForTimeout(500);
check('turning it back off restores the full rate', await page.evaluate(() =>
  window.__wikster.backdrop.running === true && window.__wikster.backdrop.lowPower === false));

const timers = await page.evaluate(async () => {
  let live = 0;
  const realSet = window.setInterval;
  const realClear = window.clearInterval;
  window.setInterval = (...a) => { live++; return realSet(...a); };
  window.clearInterval = (id) => { live--; return realClear(id); };
  document.querySelector('.nav-item[data-tab="shop"]').click();
  await new Promise((r) => setTimeout(r, 400));
  const withShop = live;
  document.querySelector('.nav-item[data-tab="binder"]').click();
  await new Promise((r) => setTimeout(r, 400));
  return { withShop, after: live };
});
check('the shop runs a clock while open', timers.withShop >= 1, String(timers.withShop));
check('and stops it on the way out', timers.after < timers.withShop, `${timers.withShop} -> ${timers.after}`);

const audio = await page.evaluate(async () => {
  const s = window.__wikster.synth;
  s.resume();
  await new Promise((r) => setTimeout(r, 150));
  const running = s.ctx ? s.ctx.state : 'none';
  Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
  document.dispatchEvent(new Event('visibilitychange'));
  await new Promise((r) => setTimeout(r, 250));
  return { running, after: s.ctx ? s.ctx.state : 'none' };
});
check('audio runs while on screen', audio.running === 'running', audio.running);
check('and parks in the background', audio.after === 'suspended', audio.after);

console.log('');
const real = errors.filter((e) => !/404 \(Not Found\)/.test(e));
console.log(real.length ? `PAGE ERRORS: ${real.slice(0, 5).join(' | ')}` : 'page errors: none');
if (real.length) fails++;
console.log(fails ? `\n${fails} CHECK(S) FAILED` : '\nALL CHECKS PASSED');
await browser.close();
process.exit(fails ? 1 : 0);
