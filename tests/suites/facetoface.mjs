import { chromium, devices } from 'playwright';
import { launchOptions } from '../lib/browser.mjs';
import { installStubs } from '../lib/stubs.mjs';
import { installSupabase, newDatabase } from '../lib/supastub.mjs';
import { centerAudit } from '../lib/centering.mjs';

let fails = 0;
const check = (l, c, e = '') => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${e ? '  ' + e : ''}`); };
const section = (s) => console.log(`\n== ${s}`);
const until = async (fn, ms = 4000) => {
  const end = Date.now() + ms;
  for (;;) {
    let ok = false;
    try { ok = await fn(); } catch { ok = false; }
    if (ok || Date.now() > end) return ok;
    await new Promise((r) => setTimeout(r, 150));
  }
};
const browser = await chromium.launch(launchOptions());
const shared = newDatabase();
const errors = [];
const PX = 'data:image/gif;base64,R0lGODlhAQABAAAAACw=';
const card = (key, title, rarityId, price, pack, extra = {}) => ({
  key, title, rarityId, price, views: 400000, popularity: 0.7, count: 1, favorite: false,
  packId: `theme|${pack}`, packName: pack[0].toUpperCase() + pack.slice(1), lang: 'en',
  thumbnail: PX, firstPulledAt: 1, lastPulledAt: 1, description: 'A thing', extract: 'Some words about it.', ...extra
});
const MINE = {
  'en:Cat': card('en:Cat', 'Cat', 'rare', 300, 'animals'),
  'en:Dog': card('en:Dog', 'Dog', 'legendary', 1600, 'animals', { count: 2 }),
  'en:Paris': card('en:Paris', 'Paris', 'prismatic', 9000, 'geography'),
  'en:Mars': card('en:Mars', 'Mars', 'epic', 800, 'space')
};
const THEIRS = {
  'en:Ada_Lovelace': card('en:Ada_Lovelace', 'Ada Lovelace', 'epic', 900, 'history'),
  'en:Alan_Turing': card('en:Alan_Turing', 'Alan Turing', 'legendary', 1600, 'history', { count: 3 }),
  'en:Cat': card('en:Cat', 'Cat', 'rare', 300, 'animals')
};

async function newPlayer(label, { cards = {} } = {}) {
  const ctx = await browser.newContext({ serviceWorkers: 'block', ...devices['Pixel 7'] });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(`${label} PAGE: ${e.message}`));
  installStubs(page);
  await installSupabase(page, { db: shared });
  await page.addInitScript(({ cards }) => {
    localStorage.setItem('wikster.language', 'en');
    localStorage.setItem('wikster.profile.v1', JSON.stringify({
      started: true, createdAt: Date.now(), playMs: 0, boostersOpened: 3,
      rarityCounts: {}, progress: { level: 5, xp: 0 }, pendingLevels: [],
      daily: { v: 2, day: 1, weeks: 0, lastDay: Math.floor(Date.now() / 86400000), shownDay: Math.floor(Date.now() / 86400000) },
      timed: { count: 0, stamp: Date.now() }, freeTaken: { window: 0, ids: [] }
    }));
    localStorage.setItem('wikster.wallet.v1', '50000');
    localStorage.setItem('wikster.collection.v3', JSON.stringify({ entries: cards }));
    localStorage.setItem('wikster.wishlist.v1', JSON.stringify([{ key: 'en:Alan_Turing', title: 'Alan Turing', rarityId: 'legendary', price: 1600, views: 400000, lang: 'en' }]));
  }, { cards });
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
const tab = async (page, name) => { await page.locator(`.nav-item[data-tab="${name}"]`).click(); await page.waitForTimeout(700); };

section('two friends');
const a = await newPlayer('A', { cards: MINE });
await gate(a, 'ada@example.com', 'ada_lovelace');
const b = await newPlayer('B', { cards: THEIRS });
await gate(b, 'grace@example.com', 'grace_h');
await b.waitForTimeout(1500);
const idA = [...shared.profiles.values()].find((p) => p.username === 'ada_lovelace')?.id;
const idB = [...shared.profiles.values()].find((p) => p.username === 'grace_h')?.id;
check('both accounts exist', Boolean(idA && idB));
shared.friendships.push({ id: 'f1', requester: idA, addressee: idB, status: 'accepted', created_at: new Date().toISOString() });
check('B\'s save carries the cards', Boolean(shared.saves.get(idB)?.data?.data?.['wikster.collection.v3']));

section('a friend\'s profile');
shared.profiles.get(idB).badges = {
  worn: ['ripper'],
  earned: [{ id: 'ripper', rank: 2 }, { id: 'climber', rank: 1 }],
  ach: 42
};
shared.profiles.get(idB).avatar = { url: PX };
shared.profiles.get(idB).stats = null;
await viaDrawer(a, 'friends');
await a.waitForTimeout(1200);
await a.locator('#friends-list .person').first().click();
await a.waitForTimeout(1800);
check('the friend screen is up', await a.locator('#screen-friend').isVisible());
check('their picture is inside the level ring, in place of the number', (await a.locator('#friend-ring .ring-face').count()) === 1 && await a.locator('#friend-ring').evaluate((n) => n.classList.contains('has-face') && getComputedStyle(n.querySelector('.ring-label')).display === 'none'));
check('the stats label reads like the profile', /stat/i.test(await a.locator('#friend-stats-label').textContent()));
const bareSecs = await a.locator('#friend-stats .stat-sec').evaluateAll((n) => n.map((x) => x.dataset.sec));
check('with no summary yet, the same statistics board is drawn from their public profile', JSON.stringify(bareSecs) === JSON.stringify(['collection', 'boosters', 'activity', 'social']), JSON.stringify(bareSecs));
check('the old cells are gone', await a.locator('#friend-stats.stat-grid, #friend-stats > .stat-cell').count() === 0);
check('albums are counted off their cards', (await a.locator('#friend-stats .stat-cell[data-stat="albums"] b').textContent()).trim() === '2');
check('their copies by print come from their cards', await a.locator('#friend-stats .stat-seg').count() === 3);
check('a small note says where the numbers come from', await a.locator('#friend-stats-note').isVisible() && /public profile/.test(await a.locator('#friend-stats-note').textContent()));
check('tiles it cannot know are left out', await a.locator('#friend-stats [data-sec="economy"], #friend-stats [data-sec="games"], #friend-stats .stat-cell[data-stat="pity"]').count() === 0);
check('the tier breakdown is painted', (await a.locator('#friend-rarity-bars .rarity-row').count()) === 8);
check('legendary counts their three copies', /3/.test(await a.locator('#friend-rarity-bars .rarity-row', { hasText: 'Legendary' }).locator('.rarity-count').textContent()));
check('the shelf shows only what they chose to wear', (await a.locator('#friend-badges .badge-chip').count()) === 1 && /Ripper/i.test(await a.locator('#friend-badges').textContent()), await a.locator('#friend-badges').textContent());
check('and their achievement count is a stat', /42/.test(await a.locator('#friend-stats').textContent()));
await a.locator('.badges-manage').click();
await a.waitForTimeout(600);
check('the whole cabinet is a tap away, unlocked ones only', (await a.locator('#sheet .badge-chip').count()) === 2 && /grace_h/.test(await a.locator('#sheet-title').textContent()));
await a.locator('#sheet-close').click();
await a.waitForTimeout(400);
check('at the rank they hold it', /II/.test(await a.locator('#friend-badges .badge-chip').first().textContent()));
await a.locator('#friend-badges .badge-chip').first().click();
await a.waitForTimeout(600);
check('a tap opens the sheet, with no button to wear it', /Ripper/.test(await a.locator('#sheet-title').textContent()) && (await a.locator('#sheet .badge-rung').count()) > 0 && (await a.locator('#sheet .badge-sheet .btn').count()) === 0);
await a.locator('#sheet-close').click();
await a.waitForTimeout(400);

check('the view switch is offered', await a.locator('#friend-seg .seg-option').count() === 2);
check('albums show first', (await a.locator('#friend-albums .album-cover, #friend-albums > *').count()) >= 1 && await a.locator('#friend-classic').isHidden());
await a.locator('#friend-seg .seg-option[data-value="classic"]').click();
await a.waitForTimeout(900);
check('classic lists every card in groups', (await a.locator('#friend-classic .classic-group').count()) === 2 && (await a.locator('#friend-classic .card').count()) === 3, `${await a.locator('#friend-classic .classic-group').count()} groups, ${await a.locator('#friend-classic .card').count()} cards: ${(await a.locator('#friend-classic .classic-group h3').allTextContents()).join('/')}`);
check('copies are counted on the card', (await a.locator('#friend-classic .copy-badge', { hasText: '3' }).count()) === 1);
check('no star on a friend\'s card', (await a.locator('#friend-classic .fav-button').count()) === 0);
await a.screenshot({ path: 'f2f-friend-classic.png', fullPage: true });
await a.locator('#friend-classic .card', { hasText: 'Ada' }).first().click({ force: true });
await a.waitForTimeout(900);
check('a friend\'s card opens big', await a.locator('#sheet .giant-card').isVisible());
check('with no star of mine on it', (await a.locator('#sheet .giant-card .fav-button').count()) === 0);
await closeSheets(a);
await a.locator('#friend-seg .seg-option[data-value="albums"]').click();
await a.waitForTimeout(600);
check('back to albums', await a.locator('#friend-albums').isVisible() && await a.locator('#friend-classic').isHidden());

section('their statistics, in public');
const dayNow = Math.floor(Date.now() / 86400000);
shared.profiles.get(idB).stats = { v: 1, at: dayNow, cC: 3, cU: 2, cPr: [1, 0, 0, 0, 3, 0, 0, 0], bN: 5, bC: 15, bH: 3, bS: Date.now() - 86400000, bT: 2, bW: 4, bA: 310,
  bPd: 12, bPl: 40, bK: [0, 5], eC: 500, eSp: 1200, eSb: 3, aD: 6, aSt: 3, aSb: 5, aA: 42, aAt: 355, gWp: 3, gWw: 2, sF: 1, sMs: 4, sSh: 1, sSm: 10 };
await a.waitForTimeout(30500);
await viaDrawer(a, 'friends');
await a.waitForTimeout(1200);
await a.locator('#friends-list .person').first().click();
await a.waitForTimeout(2200);
const pubSecs = await a.locator('#friend-stats .stat-sec').evaluateAll((n) => n.map((x) => x.dataset.sec));
check('a friend who shares their statistics shows all six sections', JSON.stringify(pubSecs) === JSON.stringify(['collection', 'boosters', 'economy', 'activity', 'games', 'social']), JSON.stringify(pubSecs));
check('with no private note on any of them', await a.locator('#friend-stats .stat-sec-note').count() === 0);
const pubTile = (id) => a.locator(`#friend-stats .stat-cell[data-stat="${id}"]`).first().innerText().then((x) => x.replace(/\s+/g, ' ').trim()).catch(() => '');
check('their economy is there', /^500 Buckarooz/.test(await pubTile('coins')) && /^1,200 Spent in the Shop 3 purchases/.test(await pubTile('spent')), await pubTile('spent'));
check('their achievements and Wikdle', /^42 \/ 355 Achievements/.test(await pubTile('achievements')) && /^2 of 3 Wikdle won/.test(await pubTile('wikdle')));
check('their copies by print are drawn', await a.locator('#friend-stats .stat-seg').count() === 2);
check('today\'s count is theirs', /^2 Opened today/.test(await pubTile('today')));
await a.screenshot({ path: 'f2f-friend-stats.png', fullPage: true });
check('the note goes once they share them', await a.locator('#friend-stats-note').isHidden());
shared.profiles.get(idB).stats = { v: 1, off: 1, at: dayNow };

section('the friend page');
const tilesActs = await a.locator('#friend-actions .friend-tile').evaluateAll((n) => n.map((b) => b.dataset.act));
check('one primary action, then four even tiles', await a.locator('#friend-actions .btn-primary').count() === 1 && JSON.stringify(tilesActs) === '["trade","gift","challenge","wishlist"]', JSON.stringify(tilesActs));
check('the tiles share one row and one size', await a.evaluate(() => {
  const boxes = [...document.querySelectorAll('#friend-actions .friend-tile')].map((n) => n.getBoundingClientRect());
  return boxes.every((b) => Math.abs(b.top - boxes[0].top) < 1 && Math.abs(b.width - boxes[0].width) < 1 && Math.abs(b.height - boxes[0].height) < 1);
}));
check('the header card is centred on the screen, its name on the card', await a.evaluate(() => {
  const hero = document.getElementById('friend-hero').getBoundingClientRect();
  const name = document.getElementById('friend-name').getBoundingClientRect();
  const mid = (r) => r.left + r.width / 2;
  return Math.abs(mid(hero) - window.innerWidth / 2) < 2 && Math.abs(mid(name) - mid(hero)) < 2;
}));
check('the chips say when they joined and since when you are friends', /Member since/.test(await a.locator('#friend-meta').textContent()) && /Friends since/.test(await a.locator('#friend-meta').textContent()));
await a.locator('#friend-actions [data-act="gift"]').click();
await a.waitForTimeout(700);
check('the gift tile opens the gift chooser', /gift grace_h/i.test(await a.locator('#sheet-title').textContent()));
await closeSheets(a);
await a.locator('#friend-actions [data-act="wishlist"]').click();
await a.waitForTimeout(900);
check('the wishlist tile opens their wishlist', /wishlist of grace_h/i.test(await a.locator('#sheet-title').textContent()));
await closeSheets(a);
await a.locator('#friend-more').click();
await a.waitForTimeout(700);
check('remove, report and block wait in the menu', JSON.stringify(await a.locator('#sheet .friend-menu-row').evaluateAll((n) => n.map((b) => b.dataset.act))) === '["remove","report","block"]');
await closeSheets(a);
const friendOff = await a.evaluate(centerAudit, '#screen-friend');
check('nothing on the friend page is off centre', friendOff.length === 0, friendOff.join(' | '));
await a.screenshot({ path: 'f2f-friend-page.png' });

section('chat');
await a.locator('#friend-actions .btn-primary').click();
await a.waitForTimeout(1200);
check('the chat is up', await a.locator('#screen-chat').isVisible());
check('gift and trade sit in the header', (await a.locator('#chat-tools .chat-tool').count()) === 2);
check('the header is a door', (await a.locator('#chat-who').getAttribute('aria-label') ?? '').includes('grace_h'));
await a.locator('#chat-input').fill('hello grace');
await a.waitForTimeout(200);
await a.locator('#chat-send').click();
await a.waitForTimeout(1200);
const bubble = a.locator('#chat-log .bubble.is-mine').first();
check('my bubble is up', (await bubble.count()) === 1);
check('one tick: on the server, unseen', (await bubble.locator('.bubble-ticks svg path').count()) === 1 && !(await bubble.evaluate((n) => n.classList.contains('is-read'))));
check('the last one says Sent', /sent/i.test(await a.locator('#chat-log .chat-receipt').textContent()));
await a.screenshot({ path: 'f2f-chat-sent.png' });
await viaDrawer(b, 'friends');
await b.waitForTimeout(1200);
await b.locator('#friends-list .person').first().click();
await b.waitForTimeout(1200);
await b.locator('#friend-actions .btn-primary').click();
await b.waitForTimeout(1500);
check('B sees the message', /hello grace/.test(await b.locator('#chat-log').textContent()));
check('the server has it read', shared.messages.every((m) => m.read_at));
await a.waitForTimeout(10800);
check('two blue ticks once seen', await bubble.evaluate((n) => n.classList.contains('is-read')) && (await bubble.locator('.bubble-ticks svg path').count()) === 2);
check('and it says Seen', /seen/i.test(await a.locator('#chat-log .chat-receipt').textContent()));
await a.screenshot({ path: 'f2f-chat-seen.png' });
check('the typing line waits hidden', await a.locator('#chat-typing').isHidden());
await a.locator('#chat-input').fill('typing something');
await a.waitForTimeout(300);
await a.locator('#chat-input').fill('');
await a.locator('#chat-who').click();
await a.waitForTimeout(900);
check('the name opens the friend\'s profile', await a.locator('#screen-friend').isVisible());
await a.locator('#friend-actions .btn-primary').click();
await a.waitForTimeout(900);
await a.locator('#chat-tools .chat-tool').first().click();
await a.waitForTimeout(900);
check('the gift door opens the gift sheet', await a.locator('#sheet').isVisible() && /gift/i.test(await a.locator('#sheet-title').textContent()));
await closeSheets(a);
check('the chat room is a fixed-height column', await a.evaluate(() => {
  const s = getComputedStyle(document.querySelector('#screen-chat'));
  return s.display === 'flex' && s.flexDirection === 'column' && parseFloat(s.height) > 200;
}));

section('classic search and the star');
await tab(a, 'binder');
await a.locator('#binder-seg .seg-option[data-value="classic"]').click();
await a.waitForTimeout(900);
check('the search field is in the classic tools', await a.locator('#classic-search').isVisible());
await a.locator('#classic-search').fill('cat');
await a.waitForTimeout(700);
check('search narrows to the one card', (await a.locator('#classic-view .card').count()) === 1, String(await a.locator('#classic-view .card').count()));
check('the count says one', /1/.test(await a.locator('#classic-count').textContent()));
await a.locator('#classic-search').fill('');
await a.waitForTimeout(700);
check('clearing brings every card back', (await a.locator('#classic-view .card').count()) === 4);
await tab(a, 'packs'); await tab(a, 'binder'); await a.waitForTimeout(600);
check('the field survives a tab change', await a.locator('#classic-search').isVisible());
const cat = a.locator('#classic-view .card', { hasText: 'Cat' }).first();
await cat.evaluate((n) => n.scrollIntoView({ block: 'center' }));
await a.waitForTimeout(400);
const star = cat.locator('.fav-button');
const box = await star.boundingBox();
check('the star is still drawn small', box && box.width >= 48 && (await star.evaluate((n) => getComputedStyle(n, '::before').width)) === '30px', JSON.stringify(box));
check('the star sits on the card, above the face', await star.evaluate((n) => n.parentElement.classList.contains('card')));
console.log('centre hits over a second:', JSON.stringify(await star.evaluate(async (star) => {
  const out = [];
  for (let i = 0; i < 12; i++) {
    const r = star.getBoundingClientRect();
    const e = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    out.push(`${e?.className?.toString().slice(0, 10)}@${Math.round(r.left)},${Math.round(r.top)}`);
    await new Promise((f) => setTimeout(f, 80));
  }
  return out;
})));
console.log('star probe:', JSON.stringify(await star.evaluate((star) => {
  const r = star.getBoundingClientRect();
  const cs = getComputedStyle(star, '::before');
  const at = (dx, dy) => { const e = document.elementFromPoint(r.left + r.width / 2 + dx, r.top + r.height / 2 + dy); return e ? `${e.tagName}.${String(e.className).slice(0, 24)}` : 'none'; };
  return { box: [r.left, r.top, r.width, r.height].map(Math.round), before: { content: cs.content, pos: cs.position, inset: cs.inset, w: cs.width }, centre: at(0, 0), l10: at(-10, 0), l20: at(-20, 0), l24: at(-24, 0), d18: at(0, 18)};
})));
await a.mouse.click(box.x + 6, box.y + box.height / 2 - 3);
await a.waitForTimeout(600);
await a.waitForTimeout(600);
check('the near miss still favourites', await star.evaluate((n) => n.getAttribute('aria-pressed') === 'true'));
check('and does not open the card', !(await a.locator('#sheet').isVisible().catch(() => false)));
await a.waitForTimeout(2200);
const star2 = a.locator('#classic-view .card', { hasText: 'Cat' }).first().locator('.fav-button');
await star2.evaluate((n) => n.scrollIntoView({ block: 'center' }));
await a.waitForTimeout(400);
const box2 = await star2.boundingBox();
console.log('second tap under:', await a.evaluate(([x, y]) => { const e = document.elementFromPoint(x, y); return e ? `${e.tagName}.${String(e.className).slice(0, 30)} pressed=${e.getAttribute('aria-pressed')}` : 'none'; }, [box2.x + 6, box2.y + box2.height / 2 - 3]), JSON.stringify(box2));
await a.mouse.click(box2.x + 6, box2.y + box2.height / 2 - 3);
await a.waitForTimeout(900);
console.log('after second tap: sheet', await a.locator('#sheet').isVisible().catch(() => false), 'stars', JSON.stringify(await a.evaluate(() => [...document.querySelectorAll('#classic-view .card')].map((c) => `${c.querySelector('.card-title').textContent}:${c.querySelector('.fav-button')?.getAttribute('aria-pressed')}`))));
check('a second tap takes it back', await a.locator('#classic-view .card', { hasText: 'Cat' }).first().locator('.fav-button').evaluate((n) => n.getAttribute('aria-pressed') === 'false'));
await closeSheets(a);
await a.locator('#classic-view .card', { hasText: 'Cat' }).first().evaluate((n) => n.click());
await a.waitForTimeout(1000);
const giantStar = a.locator('#sheet .giant-card .fav-button.is-giant');
check('the big view has a star, top right', (await giantStar.count()) === 1 && await giantStar.evaluate((n) => {
  const r = n.getBoundingClientRect(); const c = n.closest('.giant-card').getBoundingClientRect();
  return r.right > c.right - 80 && r.top < c.top + 80 && r.width >= 40;
}));
await giantStar.click();
await a.waitForTimeout(500);
check('it favourites', await giantStar.evaluate((n) => n.classList.contains('is-on')));
await a.screenshot({ path: 'f2f-giant.png' });
await closeSheets(a);
check('the binder star agrees', await a.locator('#classic-view .card', { hasText: 'Cat' }).first().locator('.fav-button').evaluate((n) => n.classList.contains('is-on')));

section('gold and prism');
const dog = a.locator('#classic-view .card[data-rarity="legendary"]').first();
check('legendary plate is opaque gold', await dog.evaluate((n) => {
  const bg = getComputedStyle(n.querySelector('.card-front')).backgroundImage;
  return /185, 132, 22/.test(bg) && !/color-mix|rgba\(0, 0, 0, 0\)/.test(bg);
}));
check('legendary type is stamped dark', await dog.evaluate((n) => getComputedStyle(n.querySelector('.card-front')).color === 'rgb(43, 29, 5)'));
const paris = a.locator('#classic-view .card[data-rarity="prismatic"]').first();
check('prismatic front is the charcoal foil', await paris.evaluate((n) => /28, 28, 38/.test(getComputedStyle(n.querySelector('.card-front')).backgroundImage)));
check('the ribbon is a drawn curve', await paris.evaluate((n) => /svg\+xml/.test(getComputedStyle(n.querySelector('.fx-b'), '::before').backgroundImage)));
check('the bezel is the thin-film ring', await paris.evaluate((n) => /0, 224, 192/.test(getComputedStyle(n.querySelector('.fx-ring'), '::before').backgroundImage)));
check('the badge is glass with a spectrum rim', await paris.evaluate((n) => /conic-gradient/.test(getComputedStyle(n.querySelector('.rarity-badge')).backgroundImage) && getComputedStyle(n.querySelector('.rarity-badge')).color === 'rgb(255, 255, 255)'));
await a.waitForTimeout(600);
await dog.evaluate((n) => n.click()); await a.waitForTimeout(1200);
check('the legendary opens big', await a.locator('#sheet .giant-card').isVisible());
await a.locator('#sheet .giant-card').screenshot({ path: 'f2f-legendary.png' }).catch(() => 0);
await closeSheets(a); await a.waitForTimeout(600);
await a.locator('#classic-view .card[data-rarity="prismatic"]').first().evaluate((n) => n.click()); await a.waitForTimeout(1200);
check('the prismatic opens big', await a.locator('#sheet .giant-card').isVisible());
await a.locator('#sheet .giant-card').screenshot({ path: 'f2f-prismatic.png' }).catch(() => 0);
await closeSheets(a); await a.waitForTimeout(600);

section('bundles');
await tab(a, 'shop');
await a.waitForTimeout(1200);
const bundles = await a.locator('.shop-tile.is-bundle').count();
check('there are bundles', bundles >= 1, String(bundles));
check('never more than three sleeves', await a.evaluate(() =>
  [...document.querySelectorAll('.shop-tile.is-bundle')].every((t) => t.querySelectorAll('.shop-tile-stack-item').length <= 3)));
check('a bundle beyond three carries a count', await a.evaluate(() =>
  [...document.querySelectorAll('.shop-tile.is-bundle')].every((t) => {
    const listed = [...t.querySelectorAll('.shop-bundle-list li b')].reduce((n, b) => n + (Number((b.textContent.match(/^(\d+)×/) ?? [])[1]) || 1), 0);
    const shown = t.querySelectorAll('.shop-tile-stack-item').length;
    const more = t.querySelector('.shop-tile-stack-more');
    return listed <= 3 ? !more : (more && more.textContent === `+${listed - 3}`);
  })));
check('sleeves stay inside the tile', await a.evaluate(() =>
  [...document.querySelectorAll('.shop-tile.is-bundle .shop-tile-stack')].every((s) => {
    const r = s.getBoundingClientRect();
    return [...s.querySelectorAll('.booster')].every((b) => { const q = b.getBoundingClientRect(); return q.left >= r.left - 1 && q.right <= r.right + 1; });
  })));
await a.locator('.shop-tile.is-bundle').first().screenshot({ path: 'f2f-bundle.png' });
console.log('bundle geometry:', JSON.stringify(await a.evaluate(() => [...document.querySelectorAll('.shop-tile.is-bundle')].map((t) => { const s = t.querySelector('.shop-tile-stack').getBoundingClientRect(); return { stack: [Math.round(s.width), Math.round(s.height)], boosters: [...t.querySelectorAll('.booster')].map((b) => { const q = b.getBoundingClientRect(); return [Math.round(q.left - s.left), Math.round(q.right - s.left), Math.round(q.width), Math.round(q.height)]; }) }; }))));

section('the cropper');
await viaDrawer(a, 'customize');
await a.waitForTimeout(800);
let face = a.locator('.person-mark.row-action').first();
if (!(await face.count())) { await viaDrawer(a, 'settings'); await a.waitForTimeout(800); face = a.locator('.person-mark.row-action').first(); }
check('the picture row is offered', (await face.count()) === 1);
await face.click();
await a.waitForTimeout(800);
await a.locator('#sheet .avatar-cell').first().click();
await a.waitForTimeout(800);
const stage = a.locator('#sheet .crop-stage');
check('the crop stage is up with a fixed circle', await stage.isVisible() && await a.locator('#sheet .crop-circle').evaluate((n) => {
  const r = n.getBoundingClientRect(); const s = n.parentElement.getBoundingClientRect();
  return Math.abs((r.left + r.width / 2) - (s.left + s.width / 2)) < 2 && Math.abs(r.width - s.width * 0.72) < 3;
}));
const before = await a.locator('#sheet .crop-img').evaluate((n) => n.style.transform);
const sb = await stage.boundingBox();
await a.mouse.move(sb.x + sb.width / 2, sb.y + sb.height / 2);
await a.mouse.down();
await a.mouse.move(sb.x + sb.width / 2 - 30, sb.y + sb.height / 2 - 10, { steps: 6 });
await a.mouse.up();
await a.waitForTimeout(300);
const after = await a.locator('#sheet .crop-img').evaluate((n) => n.style.transform);
check('dragging moves the picture', before !== after, `${before} -> ${after}`);
const z0 = await a.locator('#sheet [data-zoom]').inputValue();
await a.locator('#sheet [data-zoom]').evaluate((n) => { n.value = '200'; n.dispatchEvent(new Event('input', { bubbles: true })); });
await a.waitForTimeout(300);
const w0 = parseFloat(await a.locator('#sheet .crop-img').evaluate((n) => n.style.width));
check('the slider zooms the picture', w0 > sb.width * 0.72 * 1.5, `${z0} -> width ${w0}`);
check('the preview shows the crop', await a.locator('#sheet .crop-preview').evaluate((n) => /%/.test(n.style.backgroundSize) && n.style.backgroundSize !== 'cover'));
await a.screenshot({ path: 'f2f-crop.png' });
await a.locator('#sheet [data-save]').click();
await a.waitForTimeout(1200);
const saved = shared.profiles.get(idA)?.avatar;
check('the crop is saved with zoom and shape', saved && saved.z > 0 && saved.r > 0 && Math.abs(saved.z - 0.5) < 0.02, JSON.stringify(saved));
check('every face wears the crop, not a cover', await a.evaluate(() => {
  const faces = [...document.querySelectorAll('.screen.is-active .person-mark.has-avatar, .screen.is-active .ring-face')];
  return faces.length > 0 && faces.every((m) => /%/.test(m.style.backgroundSize) && m.style.backgroundSize !== 'cover');
}));

section('the wishlist match');
shared.wishlists.push({ owner: idA, key: 'en:Alan_Turing', card: { key: 'en:Alan_Turing', title: 'Alan Turing', rarityId: 'legendary', price: 1600, views: 400000, lang: 'en' }, created_at: new Date().toISOString() });
await viaDrawer(a, 'cardindex');
await a.locator('#index-rarities .chip').first().click();
await a.waitForTimeout(900);
check('the wishlist view offers the match', (await a.locator('.wish-match').count()) === 1, String(await a.locator('#screen-cardindex').isVisible()));
await a.locator('.wish-match').click();
await a.waitForTimeout(2500);
check('B is found holding the wished card', /grace_h/.test(await a.locator('#sheet').textContent()) && /Alan Turing/.test(await a.locator('#sheet').textContent()), (await a.locator('#sheet [data-status]').textContent()));
check('with the spare copies noted', /spare/i.test(await a.locator('#sheet').textContent()));
await a.locator('#sheet .person .btn-primary').first().click();
await a.waitForTimeout(2200);
check('the trade sheet opens already asking for it', /Trade/i.test(await a.locator('#sheet-title').textContent()) && (await a.locator('#sheet [data-ask] .pick-row.is-on').count()) === 1 && /Alan Turing/.test(await a.locator('#sheet [data-ask] .pick-row.is-on').textContent()));
await closeSheets(a);

section('a profile from anywhere');
const idC = '00000000-0000-4000-8000-0000000000c3';
const idD = '00000000-0000-4000-8000-0000000000d4';
const idE = '00000000-0000-4000-8000-0000000000e5';
const pinned = [THEIRS['en:Ada_Lovelace'], THEIRS['en:Alan_Turing']];
const born = new Date(Date.now() - 30 * 86400000).toISOString();
shared.profiles.set(idC, { id: idC, username: 'cleo_c', level: 12, cards: 9, unique_cards: 6, boosters_opened: 14, collection_value: 2100, best_rarity: 'epic', play_ms: 3600000, created_at: born,
  presence: 'online', last_seen_at: new Date().toISOString(), visibility: 'public', appearance: { v: 1, theme: 'matrix', fx: {} }, showcase: pinned, stats: null });
shared.profiles.set(idD, { id: idD, username: 'dora_d', level: 31, cards: 50, unique_cards: 40, boosters_opened: 80, collection_value: 9000, best_rarity: 'mythic', play_ms: 9000000, created_at: born,
  presence: 'online', last_seen_at: new Date(Date.now() - 5 * 86400000).toISOString(), visibility: 'public', appearance: { v: 1, theme: 'arcade', fx: {} },
  stats: { v: 1, at: dayNow, cC: 50, cU: 40, bN: 80, eC: 300, aA: 12, aAt: 355, sSh: 0, sSm: 10 } });
shared.profiles.set(idE, { id: idE, username: 'eve_e', level: 3, created_at: born, visibility: 'public' });
shared.friendships.push({ id: 'f-c', requester: idA, addressee: idC, status: 'accepted', created_at: new Date().toISOString() });
shared.guilds.push({ id: 'g-owl', name: 'Night Owls', tag: 'OWL', owner: idD, members: 1, created_at: born });
shared.guildMembers.push({ user_id: idD, guild_id: 'g-owl', joined_at: born });
shared.scores = [...(shared.scores ?? []), { user_id: idD, username: 'dora_d', game: 'duel', day: '2026-10-01', score: 99000 }, { user_id: idE, username: 'eve_e', game: 'duel', day: '2026-10-01', score: 98000 }];
const watchLook = (page) => page.evaluate(() => {
  window.__lookAt = null;
  const screen = document.getElementById('screen-friend');
  const watch = new MutationObserver(() => {
    if (!screen.classList.contains('is-active') || window.__lookAt) return;
    window.__lookAt = { worn: screen.dataset.worn ?? null, title: document.getElementById('friend-name').textContent };
    watch.disconnect();
  });
  watch.observe(screen, { attributes: true, attributeFilter: ['class'] });
});
await a.evaluate(() => window.__wikster.syncSocial({ full: true }));
await viaDrawer(a, 'friends');
await a.waitForTimeout(800);
await watchLook(a);
await a.locator('#friends-list .person', { hasText: 'cleo_c' }).click();
await a.waitForTimeout(1500);
check('a friend\'s page opens in their theme, never the viewer\'s first', JSON.stringify(await a.evaluate(() => window.__lookAt)) === JSON.stringify({ worn: 'matrix', title: 'cleo_c' }), JSON.stringify(await a.evaluate(() => window.__lookAt)));
check('their showcase is a gallery of their pins', await a.locator('#friend-showcase .showcase-slot').count() === 2 && /2 \/ 10/.test(await a.locator('#friend-showcase-note').textContent()));
check('the board is there without a summary', await a.locator('#friend-stats .stat-sec').count() === 4 && await a.locator('#friend-stats-note').isVisible());
await a.locator('#friend-showcase .card').first().click({ force: true });
await a.waitForTimeout(900);
check('a pinned card opens big', await a.locator('#sheet .giant-card').isVisible());
await closeSheets(a);
await a.locator('#friend-back').click();
await a.waitForTimeout(800);
check('back returns to the friends list', await a.locator('#screen-friends').isVisible());

await viaDrawer(a, 'leaderboard');
await a.waitForTimeout(1500);
const row = a.locator('[data-player-name="dora_d"]').first();
check('a name on the leaderboard is a door', await row.count() === 1 && await row.getAttribute('role') === 'button');
await watchLook(a);
const guildReads = shared.guildOfCalls ?? 0;
await row.click();
await a.waitForTimeout(1800);
check('a stranger\'s page waits for their look before it shows', JSON.stringify(await a.evaluate(() => window.__lookAt)) === JSON.stringify({ worn: 'arcade', title: 'dora_d' }), JSON.stringify(await a.evaluate(() => window.__lookAt)));
check('their guild is found with one light query', (shared.guildOfCalls ?? 0) - guildReads === 1 && /Night Owls \[OWL\]/.test(await a.locator('#friend-meta').textContent()));
const strangerSecs = await a.locator('#friend-stats .stat-sec').evaluateAll((n) => n.map((x) => x.dataset.sec));
check('their published statistics show in full', JSON.stringify(strangerSecs) === JSON.stringify(['collection', 'boosters', 'economy', 'activity', 'games', 'social']), JSON.stringify(strangerSecs));
check('the guild is a statistic too', /Night Owls/.test(await a.locator('#friend-stats .stat-cell[data-stat="guild"]').textContent()));
check('a stranger is offered one thing: add them', JSON.stringify(await a.locator('#friend-actions .btn').evaluateAll((n) => n.map((b) => b.dataset.act))) === '["add"]');
check('their collection waits behind a friendship', await a.locator('#friend-albums .friend-locked').isVisible() && await a.locator('#friend-rarity-head').isHidden());
check('their last visit shows', /days ago/.test(await a.locator('#friend-rank').textContent()), await a.locator('#friend-rank').textContent());
const strangerOff = await a.evaluate(centerAudit, '#screen-friend');
check('nothing on a stranger\'s page is off centre', strangerOff.length === 0, strangerOff.join(' | '));
await a.screenshot({ path: 'f2f-stranger.png' });
await a.locator('#friend-actions [data-act="add"]').click();
check('add sends the request', await until(async () => shared.friendships.some((f) => f.requester === idA && f.addressee === idD && f.status === 'pending')));
check('and the page says it is on its way', await until(async () => await a.locator('#friend-actions [data-act="pending"]').count() === 1 && await a.locator('#friend-actions [data-act="cancel"]').count() === 1));
await a.locator('#friend-back').click();
await a.waitForTimeout(800);
check('back returns to the leaderboard', await a.locator('#screen-leaderboard').isVisible());
await a.route('**/rest/v1/profiles?*', (route) => route.fulfill(route.request().method() === 'OPTIONS'
  ? { status: 204, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': 'GET,POST,PATCH,DELETE,OPTIONS' }, body: '' }
  : { status: 500, headers: { 'access-control-allow-origin': '*', 'content-type': 'application/json' }, body: JSON.stringify({ message: 'down' }) }));
await a.locator('[data-player-name="eve_e"]').first().click();
await a.waitForTimeout(1800);
check('a profile that will not load says so, with a way to try again', await a.locator('#friend-state').isVisible() && await a.locator('#friend-state [data-act="retry"]').count() === 1 && await a.locator('#friend-stats-head').isHidden());
await a.unroute('**/rest/v1/profiles?*');
await a.locator('#friend-state [data-act="retry"]').click();
check('and it loads on the second try', await until(async () => await a.locator('#friend-state').isHidden() && /eve_e/.test(await a.locator('#friend-name').textContent()), 5000));
await a.locator('#friend-back').click();
await a.waitForTimeout(600);

section('the profile on PC, in French');
const deskCtx = await browser.newContext({ serviceWorkers: 'block', viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1.4 });
const desk = await deskCtx.newPage();
desk.on('pageerror', (e) => errors.push(`PC PAGE: ${e.message}`));
installStubs(desk);
await installSupabase(desk, { db: shared });
await desk.addInitScript(() => {
  if (localStorage.getItem('f2f.desk')) return;
  localStorage.setItem('f2f.desk', '1');
  localStorage.setItem('wikster.language', 'fr');
  localStorage.setItem('wikster.layout.v1', 'pc');
});
await desk.goto((process.env.BASE_URL ?? 'http://127.0.0.1:4173/'), { waitUntil: 'domcontentloaded' });
await desk.waitForTimeout(2400);
await closeSheets(desk);
await desk.evaluate(() => window.wiksterPc?.go('social'));
await desk.waitForTimeout(900);
if (await desk.locator('#gate-seg .seg-option[data-value="in"]').count()) { await desk.locator('#gate-seg .seg-option[data-value="in"]').click(); await desk.waitForTimeout(200); }
await desk.locator('#gate-form input[name="email"]').fill('ada@example.com');
await desk.locator('#gate-form input[name="password"]').fill('hunter2hunter2');
await desk.locator('#gate-form button[type="submit"]').click();
await desk.waitForTimeout(3000);
await closeSheets(desk);
await desk.evaluate(() => window.wiksterPc?.go('social'));
await desk.waitForTimeout(1200);
await desk.locator('#friends-list .person', { hasText: 'cleo_c' }).click();
await desk.waitForTimeout(1800);
check('the PC page wears their theme', await desk.evaluate(() => document.getElementById('screen-friend').dataset.worn === 'matrix'));
check('it speaks French', /Profil du joueur/i.test(await desk.locator('#friend-title').textContent()) && /Échanger/.test(await desk.locator('#friend-actions').textContent()));
const deskTabs = await desk.locator('#screen-friend .pc-section-link').allInnerTexts();
check('the sections are tabs beside the content', JSON.stringify(deskTabs) === JSON.stringify(['Vitrine', 'Statistiques', 'Cartes par rareté', 'Sa collection']), JSON.stringify(deskTabs));
check('the header card spans the page and every tab is on screen', await desk.evaluate(() => {
  const hero = document.getElementById('friend-hero').getBoundingClientRect();
  const nav = document.querySelector('#screen-friend .pc-sections').getBoundingClientRect();
  return hero.width > nav.width * 2 && nav.bottom <= innerHeight;
}));
const deskOff = await desk.evaluate(centerAudit, '#pc');
check('nothing is off centre on PC', deskOff.length === 0, deskOff.join(' | '));
await desk.screenshot({ path: 'f2f-pc-friend.png' });
await desk.locator('#screen-friend .pc-section-link', { hasText: 'Statistiques' }).click();
await desk.waitForTimeout(700);
check('the statistics tab shows the board and its note in French', await desk.locator('#friend-stats .stat-sec:visible').count() === 4 && /profil public/.test(await desk.locator('#friend-stats-note').textContent()));
const statsOff = await desk.evaluate(centerAudit, '#pc');
check('the statistics tab is centred too', statsOff.length === 0, statsOff.join(' | '));
await desk.screenshot({ path: 'f2f-pc-stats.png' });
await deskCtx.close();

console.log(errors.length ? `page errors: ${errors.join(' | ')}` : 'no page errors');
console.log(fails ? `${fails} CHECK(S) FAILED` : 'ALL PASS');
await browser.close();
process.exit(fails || errors.length ? 1 : 0);
