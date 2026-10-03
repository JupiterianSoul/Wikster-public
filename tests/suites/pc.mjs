import { chromium, devices } from 'playwright';
import { launchOptions } from '../lib/browser.mjs';
import { installStubs } from '../lib/stubs.mjs';
import { RELEASES } from '../../src/data/releases.js';

let fails = 0;
const check = (l, c, e = '') => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${e ? '  ' + e : ''}`); };
const section = (s) => console.log(`\n== ${s}`);
const BASE = process.env.BASE_URL ?? 'http://127.0.0.1:4173/';
const browser = await chromium.launch(launchOptions());
const errors = [];
const PX = 'data:image/gif;base64,R0lGODlhAQABAAAAACw=';
const entries = {};
for (let i = 0; i < 20; i++) {
  const k = `en:Card_${i}`;
  entries[k] = { key: k, title: `Article number ${i}`, rarityId: ['common', 'rare', 'epic', 'legendary'][i % 4], price: 100 + i * 90, views: 400000,
    popularity: 0.7, count: 1, favorite: false, packId: 'theme|animals', packName: 'Animals', lang: 'en', thumbnail: PX,
    firstPulledAt: i, lastPulledAt: i, description: 'A thing', extract: 'Some words about it, long enough to be read as a card.' };
}
for (const i of [0, 5, 10, 15, 3, 19]) entries[`en:Card_${i}`].mature = true;

async function open({ viewport = { width: 1920, height: 1080 }, layout = null, mobile = false } = {}) {
  const ctx = await browser.newContext(mobile
    ? { serviceWorkers: 'block', ...devices['Pixel 7'] }
    : { serviceWorkers: 'block', viewport, deviceScaleFactor: 1 });
  const p = await ctx.newPage();
  p.on('pageerror', (e) => errors.push(e.message));
  installStubs(p);
  await p.addInitScript(({ entries, seen, layout }) => {
    localStorage.setItem('wikster.language', 'en');
    if (layout) localStorage.setItem('wikster.layout.v1', layout);
    const now = Date.now();
    localStorage.setItem('wikster.profile.v1', JSON.stringify({
      started: true, createdAt: now - 86400000 * 40, playMs: 7200000, boostersOpened: 24,
      rarityCounts: { common: 9, rare: 6 }, progress: { level: 12, xp: 20 }, pendingLevels: [],
      daily: { v: 2, day: 3, weeks: 2, lastDay: Math.floor(now / 86400000), shownDay: Math.floor(now / 86400000) },
      timed: { count: 2, stamp: now, last: now, opened: 4 }, freeTaken: { window: 0, ids: [] }
    }));
    localStorage.setItem('wikster.wallet.v1', '48000');
    localStorage.setItem('wikster.collection.v3', JSON.stringify({ entries }));
    const wiki = { apiUrl: 'https://minecraft.wiki/api.php', sitename: 'Minecraft Wiki' };
    localStorage.setItem('wikster.inventory.v1', JSON.stringify({
      'theme|animals|std|5': { spec: { kind: 'theme', themeId: 'animals', rarityId: null, cards: 5 }, count: 2 },
      'theme|space|std|5': { spec: { kind: 'theme', themeId: 'space', rarityId: null, cards: 5 }, count: 1 },
      'custom|minecraft.wiki|std|5': { spec: { kind: 'custom', themeId: null, rarityId: null, cards: 5, customName: 'Minecraft', customId: 'custom-minecraft-wiki', wiki, icon: 'wand', accent: '#4ade80', accent2: '#14532d' }, count: 1 }
    }));
    localStorage.setItem('wikster.customPacks.v2', JSON.stringify([{ id: 'custom-minecraft-wiki', name: 'Minecraft', tagline: 'Minecraft Wiki', icon: 'wand', accent: '#4ade80', accent2: '#14532d', wiki }]));
    localStorage.setItem('wikster.seenRelease.v1', seen);
  }, { entries, seen: RELEASES.at(-1).id, layout });
  await p.goto(BASE, { waitUntil: 'domcontentloaded' });
  await p.waitForTimeout(2600);
  for (let i = 0; i < 6; i++) {
    if (!(await p.locator('#sheet').isVisible().catch(() => false))) break;
    await p.keyboard.press('Escape');
    await p.waitForTimeout(450);
  }
  return p;
}

section('a computer screen gets the PC layout');
const p = await open();
check('the PC frame is up', await p.locator('#pc').isVisible());
check('with six sections in the top bar', await p.locator('.pc-tab').count() === 6);
check('the phone navigation is out of sight', !(await p.locator('#navbar').isVisible()));
check('home is the first screen', await p.locator('.pch').isVisible());
check('the wallet is in the top bar', /48,000/.test(await p.locator('.pc-purse').first().textContent()));
check('a prompt bar shows the keys', await p.locator('.pc-foot .pc-prompt').count() >= 2);
const noBars = () => p.evaluate(() => [...document.querySelectorAll('#pc *')].every((n) => {
  const st = getComputedStyle(n);
  if (!/(auto|scroll)/.test(st.overflowY + st.overflowX)) return true;
  const side = parseFloat(st.borderLeftWidth) + parseFloat(st.borderRightWidth);
  return n.offsetWidth - n.clientWidth - side <= 0.5;
}));
check('no scrollbar is drawn anywhere', await noBars());
check('the shelf shows the boosters held, custom ones apart', await p.locator('.pch-flow-item').count() === 2);
const first = await p.locator('.pch-name').textContent();
await p.keyboard.press('ArrowRight');
await p.waitForTimeout(400);
check('the arrow keys pick another booster', (await p.locator('.pch-name').textContent()) !== first);
check('the latest cards are dealt as a hand', await p.locator('.pch-hand-card:visible').count() >= 6);
check('the free packs sit in their own panel', /2/.test(await p.locator('.pch-dial-core b').textContent()));
const fits = await p.evaluate(() => {
  const home = document.querySelector('.pch').getBoundingClientRect();
  return [...document.querySelectorAll('.pch-stage, .pch-latest, .pch-widget')].every((n) => n.getBoundingClientRect().bottom <= home.bottom + 1);
});
check('the home screen fits the window without scrolling', fits);
await p.keyboard.press('ArrowDown');
await p.waitForTimeout(400);
check('the down arrow moves to the custom shelf', await p.locator('.pch .pcx-seg-item.is-on[data-value="custom"]').count() === 1 && await p.locator('.pch-flow-item').count() === 1);
await p.keyboard.press('ArrowUp');
await p.waitForTimeout(300);

section('boosters');
await p.keyboard.press('2');
await p.waitForTimeout(800);
check('2 opens the boosters screen', await p.locator('.pcb').isVisible());
check('with its three tabs', await p.locator('.pc-subtab').count() === 3);
check('only bought boosters on the grid, custom ones elsewhere', await p.locator('.pcb-tile').count() === 2 && await p.locator('.pcb-tile[data-id^="custom|"]').count() === 0);
check('and the odds of the chosen one', await p.locator('.pcx-odds-row').count() >= 6);
const pickedBefore = await p.locator('.pcb-detail-name').textContent();
await p.keyboard.press('ArrowRight');
await p.waitForTimeout(300);
check('the arrow keys pick another booster there too', (await p.locator('.pcb-detail-name').textContent()) !== pickedBefore);
await p.keyboard.press('e');
await p.waitForTimeout(800);
check('E moves to the Custom tab', await p.locator('.pcc').isVisible());
check('custom boosters are ready to open there', await p.locator('.pcc .pcb-tile').count() === 1);
check('with the forge beside them', await p.locator('.pcc #creator-input').isVisible());
await p.locator('.pcc .pcx-seg-item[data-value="wikis"]').click();
await p.waitForTimeout(600);
check('and the wikis you made, ready to buy', await p.locator('.pcc-wiki').count() === 1 && await p.locator('.pcc-wiki .buy').count() === 1);
await p.keyboard.press('e');
await p.waitForTimeout(800);
check('E again moves to the free packs', await p.locator('.pcf').isVisible());
check('with the count on a big dial', (await p.locator('.pcf-dial-core b').textContent()).trim() === '2');
check('and the ten levels laid out', await p.locator('.pcf-rung').count() === 10);
await p.keyboard.press('q');
await p.waitForTimeout(500);
check('Q goes back a tab', await p.locator('.pcc').isVisible());
await p.locator('.pcc #creator-input').fill('zeldda');
await p.waitForFunction(() => document.querySelectorAll('.pcc .forge-hit').length > 0, null, { timeout: 12000 }).catch(() => {});
check('the finder lists wikis inside the PC forge', await p.locator('.pcc .forge-hit').count() === 3 && /biggest/i.test(await p.locator('.pcc .forge-hit').first().innerText()));
const forgeBox = await p.locator('.pcc-forge').boundingBox();
const listBox = await p.locator('.pcc #forge-results').boundingBox();
const goBox = await p.locator('.pcc #creator-go').boundingBox();
check('and everything still fits in the panel', forgeBox && listBox && goBox && listBox.y + listBox.height <= forgeBox.y + forgeBox.height && goBox.y + goBox.height <= forgeBox.y + forgeBox.height,
  JSON.stringify([forgeBox, listBox, goBox]));
await p.locator('.pcc #creator-input').fill('');
await p.locator('.pcc #creator-input').dispatchEvent('input');
await p.locator('.pcc #creator-input').blur();
await p.waitForTimeout(300);

section('collection');
await p.keyboard.press('3');
await p.waitForTimeout(900);
check('3 opens the collection binder', await p.locator('.pck').isVisible());
check('with its own sub-tabs', await p.locator('.pc-subtab').count() === 6);
check('every card is counted', /20 of 20/.test(await p.locator('.pck-count').textContent()));
check('mature cards are marked and blurred in the PC binder too', await p.locator('.pck .card[data-adult]').count() > 0 && await p.evaluate(() => {
  const art = document.querySelector('.pck .card[data-adult] .card-art');
  const img = art?.querySelector('img');
  return document.documentElement.dataset.matureLock === '1' && Boolean(art) && (!img || /blur/.test(getComputedStyle(img).filter));
}));
check('cards sit on two facing pages', await p.locator('.pck-page').count() === 2 && await p.locator('.pck-card').count() > 0);
const folio = await p.locator('.pck-folio').first().textContent();
const spreads = await p.evaluate(() => document.querySelector('.pck .pcx-pager').classList.contains('is-single') ? 1 : 2);
if (spreads > 1) {
  await p.keyboard.press('ArrowRight');
  await p.waitForTimeout(500);
  check('the right arrow turns the page', (await p.locator('.pck-folio').first().textContent()) !== folio);
  await p.keyboard.press('ArrowLeft');
  await p.waitForTimeout(400);
}
await p.keyboard.press('Control+f');
await p.keyboard.type('number 1');
await p.waitForTimeout(600);
check('Ctrl F searches the collection', /11 of 20/.test(await p.locator('.pck-count').textContent()), await p.locator('.pck-count').textContent());
await p.keyboard.press('Escape');
await p.waitForTimeout(400);
check('Esc in the search clears it', /20 of 20/.test(await p.locator('.pck-count').textContent()));
await p.keyboard.press('Escape');
await p.waitForTimeout(300);
check('and a second Esc only leaves the field', !(await p.locator('.pc-menu').isVisible()));
await p.locator('.pck-gem[title^="Legendary"]').click();
await p.waitForTimeout(400);
check('the rarity gems filter the binder', /5 of 20/.test(await p.locator('.pck-count').textContent()));
await p.locator('.pck-gem.is-all').click();
await p.waitForTimeout(300);
await p.locator('.pck-card').first().click();
await p.waitForTimeout(700);
check('a card opens in a window', await p.locator('#sheet .giant-card').isVisible());
await p.keyboard.press('Escape');
await p.waitForTimeout(600);
check('Esc closes it', !(await p.locator('#sheet .giant-card').isVisible()));
await p.keyboard.press('e');
await p.waitForTimeout(800);
check('E shows the albums', await p.locator('.pca').isVisible() && await p.locator('.pca-tile').count() > 0);
await p.locator('.pca-tile:not(.is-locked)').first().click();
await p.waitForTimeout(700);
check('an album opens as a book', await p.locator('.pca-head').isVisible() && await p.locator('.pca .pck-card').count() > 0);
await p.keyboard.press('Escape');
await p.waitForTimeout(500);
check('Esc closes the book, not the game', await p.locator('.pca-grid').isVisible() && !(await p.locator('.pc-menu').isVisible()));

section('shop');
await p.keyboard.press('4');
await p.waitForTimeout(900);
check('4 opens the shop', await p.locator('.pcs').isVisible());
check('with its six counters', await p.locator('.pcs-link').count() === 6);
check('the spotlight deal leads the page', await p.locator('.pcs .shop-feature').isVisible());
await p.locator('.pcs-link[data-page="subjects"]').click();
await p.waitForTimeout(600);
const walletBefore = await p.evaluate(() => window.__wikster.state.wallet);
const heldBefore = await p.evaluate(() => Object.values(window.__wikster.state.inventory).reduce((n, s) => n + s.count, 0));
await p.locator('.pcs .shop-tile .buy:not([disabled])').first().click();
await p.waitForTimeout(700);
check('buying from the PC shop takes the coins', (await p.evaluate(() => window.__wikster.state.wallet)) < walletBefore);
check('and puts the booster on the shelf', (await p.evaluate(() => Object.values(window.__wikster.state.inventory).reduce((n, s) => n + s.count, 0))) === heldBefore + 1);
check('still without a scrollbar', await noBars());
await p.keyboard.press('e');
await p.waitForTimeout(900);
check('E switches to the Atelier', await p.locator('#screen-atelier').isVisible());
await p.keyboard.press('Escape');
await p.waitForTimeout(300);
check('Esc opens the menu', await p.locator('.pc-menu').isVisible());
await p.keyboard.press('Escape');
await p.waitForTimeout(300);
check('and closes it again', !(await p.locator('.pc-menu').isVisible()));

section('opening from home');
await p.keyboard.press('1');
await p.waitForTimeout(700);
const onStand = async () => (await p.locator('.pch-name').textContent()) === 'Animals' && (await p.locator('.pch-info .pcx-chip').allTextContents()).includes('5 cards');
for (let i = 0; i < 6; i++) { await p.keyboard.press('ArrowLeft'); await p.waitForTimeout(120); }
for (let i = 0; i < 8 && !(await onStand()); i++) {
  await p.keyboard.press('ArrowRight');
  await p.waitForTimeout(250);
}
check('Animals is on the stand', await onStand());
await p.keyboard.press('Space');
await p.waitForTimeout(900);
check('Space opens the chosen booster', await p.locator('#screen-open').isVisible());
check('the top bar steps aside while opening', !(await p.locator('.pc-bar').isVisible()));
await p.keyboard.press('Space');
const revealed = await p.waitForFunction(() => document.querySelector('#screen-open')?.classList.contains('phase-reveal'), null, { timeout: 12000 }).then(() => true, () => false);
check('Space tears the pack open', revealed);
await p.waitForTimeout(900);
const spread = await p.evaluate(() => {
  const xs = [...document.querySelectorAll('#card-stack .stack-card')].map((c) => Math.round(c.getBoundingClientRect().left));
  return new Set(xs).size === xs.length && xs.length === window.__wikster.state.spec.cards;
});
const dealt = await p.evaluate(() => window.__wikster.state.spec.cards);
check('the cards are dealt side by side', spread);
check('only the first one is turned over', await p.locator('#card-stack .stack-card.is-revealed').count() === 1);
await p.locator('#card-stack .stack-card').nth(3).click();
await p.waitForTimeout(500);
check('clicking a card turns it over', await p.locator('#card-stack .stack-card').nth(3).evaluate((n) => n.classList.contains('is-revealed')));
for (let i = 0; i < dealt - 1; i++) { await p.keyboard.press('Space'); await p.waitForTimeout(350); }
check('Space turns the rest', await p.locator('#card-stack .stack-card.is-revealed').count() === dealt);
await p.waitForFunction(() => document.querySelector('#screen-open').classList.contains('phase-summary'), null, { timeout: 6000 }).catch(() => 0);
await p.waitForTimeout(400);
check('then the pack is done, cards still on the table', await p.evaluate(() => document.querySelector('#screen-open').classList.contains('phase-summary')) && await p.locator('#card-stack .stack-card').first().isVisible());
check('with a button to open another of the same', await p.locator('.pc-open-again').isVisible());
await p.waitForTimeout(500);
let leveled = false;
for (let i = 0; i < 6 && await p.locator('#sheet.is-locked.is-open').count(); i++) {
  leveled = true;
  await p.keyboard.press('Enter');
  await p.waitForTimeout(500);
}
if (leveled) check('a level up on the way is claimed with Enter, no mouse needed', await p.locator('#sheet.is-locked.is-open').count() === 0);
await p.keyboard.press('Space');
await p.waitForTimeout(900);
check('Space opens the next one straight away', await p.evaluate(() => document.querySelector('#screen-open').classList.contains('phase-idle')));
await p.keyboard.press('Escape');
await p.waitForTimeout(900);
check('Esc before tearing leaves the pack closed', !(await p.evaluate(() => document.querySelector('#screen-open').classList.contains('is-active'))));
check('and brings you back home', await p.locator('.pch').isVisible());

section('the menu');
await p.keyboard.press('Escape');
await p.waitForTimeout(300);
await p.locator('.pc-menu-item[data-act="settings"]').click();
await p.waitForTimeout(800);
check('settings open from the menu', await p.locator('#screen-settings').isVisible());
await p.locator('.pc-plate').click();
await p.waitForTimeout(800);
check('the player plate opens the profile', await p.locator('#screen-profile').isVisible());
await p.context().close();

section('size');
const small = await open({ viewport: { width: 1280, height: 800 } });
check('a Steam Deck sized window still gets the PC layout', await small.locator('#pc').isVisible());
const fitsSmall = await small.evaluate(() => {
  const tabs = document.querySelector('.pc-tabs').getBoundingClientRect();
  const hud = document.querySelector('.pc-hud').getBoundingClientRect();
  const brand = document.querySelector('.pc-brand').getBoundingClientRect();
  return tabs.right <= hud.left && brand.right <= tabs.left && hud.right <= innerWidth;
});
check('the top bar fits at 1280 wide', fitsSmall);
await small.context().close();

section('the phone layout stays the phone layout');
const phone = await open({ mobile: true });
check('no PC frame on a phone', await phone.locator('#pc').count() === 0);
check('the phone navigation is there', await phone.locator('#navbar').isVisible());
await phone.context().close();
const chosen = await open({ layout: 'mobile' });
check('the phone layout can still be forced for tests', await chosen.locator('#pc').count() === 0);
await chosen.context().close();

section('a new build forces a reload, on a computer and on a phone');
for (const mobile of [false, true]) {
  const where = mobile ? 'phone' : 'computer';
  let newer = true;
  const fresh = { id: 'test-fresh-release', icon: 'spark', accent: '#22d3ee', title: { en: 'Brand new things', fr: 'Des nouveautés' }, points: [{ en: 'A shiny new point', fr: 'Un nouveau point' }] };
  const u = await open({ mobile, layout: mobile ? 'mobile' : null });
  await u.route(/wikster\.pages\.dev\/version\.json/, (r) => r.fulfill({ contentType: 'application/json', headers: { 'access-control-allow-origin': '*' },
    body: JSON.stringify(newer ? { sha: 'next', at: Date.now() + 3600000, notes: [RELEASES.at(-1), fresh] } : { sha: 'dev', at: 0 }) }));
  await u.evaluate(() => dispatchEvent(new Event('wikster:check-update')));
  const modal = u.locator('.force-update');
  await modal.waitFor({ state: 'visible', timeout: 8000 }).catch(() => {});
  check(`${where}: the update modal shows up`, await modal.isVisible());
  check(`${where}: it lists the notes newer than the running build`, (await u.locator('.force-update-note').count()) === 1
    && (await u.locator('.force-update-note h4').textContent()).includes('Brand new things'));
  check(`${where}: one Reload button and nothing to close it`, (await u.locator('.force-update button').count()) === 1);
  await u.keyboard.press('Escape');
  await u.waitForTimeout(300);
  check(`${where}: Escape does not close it`, await modal.isVisible());
  const back = await u.evaluate(() => (window.wiksterBack ? window.wiksterBack() : null));
  await u.waitForTimeout(300);
  check(`${where}: back does not close it`, back === true && await modal.isVisible());
  await u.mouse.click(8, 8);
  await u.waitForTimeout(300);
  check(`${where}: a click outside does not close it`, await modal.isVisible());
  check(`${where}: the game behind is out of reach`, await u.evaluate(() => Boolean(document.getElementById('app').closest('[inert]'))));
  const card = await u.locator('.force-update-card').boundingBox();
  const vp = u.viewportSize();
  check(`${where}: the card fits the screen`, card && card.x >= 0 && card.y >= 0 && card.x + card.width <= vp.width && card.y + card.height <= vp.height, JSON.stringify(card));
  await u.screenshot({ path: `update-${where}.png` });
  newer = false;
  await u.evaluate(() => { window.__beforeUpdate = 1; });
  const loaded = u.waitForEvent('load', { timeout: 15000 }).catch(() => null);
  const seen = await u.evaluate(() => { document.querySelector('.force-update-go').click(); return localStorage.getItem('wikster.seenRelease.v1'); });
  check(`${where}: the notes shown count as seen`, seen === 'test-fresh-release', String(seen));
  await loaded;
  await u.waitForTimeout(2600);
  check(`${where}: Reload loads the page again`, await u.evaluate(() => window.__beforeUpdate === undefined).catch(() => false));
  check(`${where}: and the new build does not ask again`, !(await u.locator('.force-update').isVisible().catch(() => false)));
  await u.context().close();
}

section('the intro: smooth, skippable, shorter once seen');
for (const mobile of [false, true]) {
  const where = mobile ? 'phone' : 'computer';
  const ctx = await browser.newContext(mobile ? { serviceWorkers: 'block', ...devices['Pixel 7'] } : { serviceWorkers: 'block', viewport: { width: 1600, height: 900 } });
  const i = await ctx.newPage();
  i.on('pageerror', (e) => errors.push(e.message));
  installStubs(i);
  await i.addInitScript(() => { try { localStorage.setItem('wikster.language', 'en'); } catch {} });
  await i.goto(`${BASE}?intro=1`, { waitUntil: 'domcontentloaded' });
  await i.waitForFunction(() => document.getElementById('intro')?.dataset.step, null, { timeout: 5000 }).catch(() => {});
  await i.waitForTimeout(250);
  const firstStep = await i.evaluate(() => document.getElementById('intro')?.dataset.step);
  check(`${where}: the studio card comes first`, firstStep === 'studio', String(firstStep));
  const props = await i.evaluate(() => {
    const out = new Set();
    for (const a of document.getAnimations()) {
      const node = a.effect?.target;
      if (!node || !node.closest?.('#intro')) continue;
      for (const frame of a.effect.getKeyframes()) for (const k of Object.keys(frame)) if (!['offset', 'easing', 'composite', 'computedOffset'].includes(k)) out.add(k);
    }
    return [...out];
  });
  check(`${where}: the intro only animates transform and opacity`, props.length > 0 && props.every((k) => k === 'transform' || k === 'opacity' || k === 'visibility'), props.join(','));
  await i.waitForTimeout(2000);
  check(`${where}: the notices follow on a first visit`, await i.evaluate(() => document.getElementById('intro')?.dataset.step) === 'notice');
  await i.keyboard.press('Space');
  await i.waitForTimeout(300);
  check(`${where}: a key skips to the title`, await i.evaluate(() => document.getElementById('intro')?.dataset.step) === 'title');
  await i.waitForFunction(() => window.wiksterReady === true, null, { timeout: 15000 }).catch(() => {});
  const word = await i.locator('.intro-word').boundingBox();
  check(`${where}: the title fits the screen`, word && word.x >= 0 && word.x + word.width <= i.viewportSize().width, JSON.stringify(word));
  await i.keyboard.press('Enter');
  await i.waitForTimeout(mobile ? 2000 : 900);
  check(`${where}: then the intro gets out of the way`, await i.locator('#intro').count() === 0);
  check(`${where}: and remembers the day it was seen`, await i.evaluate(() => localStorage.getItem('wikster.introSeen') === String(Math.floor(Date.now() / 86400000))));
  await i.goto(`${BASE}?intro=1`, { waitUntil: 'domcontentloaded' });
  await i.waitForTimeout(300);
  check(`${where}: the second time today it goes straight to a shorter title`, await i.evaluate(() => document.getElementById('intro')?.dataset.step === 'title' && document.getElementById('intro')?.dataset.mode === 'quick'));
  await ctx.close();
}
for (const reduce of ['reduce']) {
  const ctx = await browser.newContext({ serviceWorkers: 'block', viewport: { width: 1280, height: 800 }, reducedMotion: reduce });
  const r = await ctx.newPage();
  installStubs(r);
  await r.goto(`${BASE}?intro=1`, { waitUntil: 'domcontentloaded' });
  await r.waitForTimeout(500);
  const moving = await r.evaluate(() => document.getAnimations().filter((a) => a instanceof CSSAnimation && a.effect?.target?.closest?.('#intro')).length);
  check('reduced motion: the intro does not animate', moving === 0, String(moving));
  check('reduced motion: a first visit shows the notices at once, fully drawn', await r.evaluate(() => document.getElementById('intro')?.dataset.step === 'notice' && getComputedStyle(document.querySelector('.intro-notice-row')).opacity === '1'));
  await ctx.close();
}

section('page errors');
const real = errors.filter((e) => !/ERR_TUNNEL|Failed to load resource/.test(e));
check('no page errors', real.length === 0, real.slice(0, 3).join(' | '));

await browser.close();
console.log(fails ? `\n${fails} FAILED` : '\nALL PASS');
process.exit(fails ? 1 : 0);
