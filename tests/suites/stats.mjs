import { chromium, devices } from 'playwright';
import { launchOptions } from '../lib/browser.mjs';
import { installStubs } from '../lib/stubs.mjs';
import { RELEASES } from '../../src/data/releases.js';

let fails = 0;
const check = (l, c, e = '') => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${e ? '  ' + e : ''}`); };
const section = (s) => console.log(`\n== ${s}`);
const BASE = process.env.BASE_URL ?? 'http://127.0.0.1:4173/';
const SHOT = process.env.STATS_SHOTS ?? '.';
const DAY = 86400000;

const now = Date.now();
const today = new Date(now).toISOString().slice(0, 10);
const week = Math.floor((Math.floor(now / DAY) + 4) / 7);
const entries = {
  'en:Alpha': { key: 'en:Alpha', title: 'Alpha', rarityId: 'legendary', price: 900, count: 3, prints: { common: 1, legendary: 2 }, packId: 'theme|animals', packName: 'Animals', lang: 'en', thumbnail: 'https://upload.wikimedia.org/stats/a.png', favorite: true, firstPulledAt: now - DAY },
  'en:Beta': { key: 'en:Beta', title: 'Beta', rarityId: 'rare', price: 120, count: 1, packId: 'theme|animals', packName: 'Animals', lang: 'en', thumbnail: 'https://upload.wikimedia.org/stats/b.png', firstPulledAt: now - 8 * DAY },
  'en:Gamma': { key: 'en:Gamma', title: 'Gamma', rarityId: 'epic', price: 300, count: 2, packId: 'theme|space', packName: 'Space', lang: 'en', thumbnail: 'https://upload.wikimedia.org/stats/c.png', firstPulledAt: now - 15 * DAY },
  'en:Delta': { key: 'en:Delta', title: 'Delta', rarityId: 'common', price: 30, count: 1, packId: null, lang: 'en', thumbnail: 'https://upload.wikimedia.org/stats/d.png', firstPulledAt: now }
};
const profile = {
  started: true, createdAt: Date.parse('2026-01-15T12:00:00Z'), playMs: 5 * 3600000 + 20 * 60000, boostersOpened: 37, pity: 31,
  rarityCounts: { common: 90, uncommon: 40, rare: 30, epic: 12, legendary: 3, mythic: 1 }, progress: { level: 14, xp: 20 }, pendingLevels: [],
  daily: { v: 2, day: 4, weeks: 3, lastDay: Math.floor(now / DAY), shownDay: Math.floor(now / DAY), run: 11, best: 16, total: 33 },
  timed: { count: 0, stamp: now, last: now, opened: 4 }, freeTaken: { window: 0, ids: [] },
  cardsSold: 21, fused: 4, quizPlayed: 6, quizWins: 4, quizPerfect: 1, duelBest: 7, duelRounds: 12,
  ledger: { opens_theme: 20, opens_open: 9, opens_timed: 8, spent: 8400, shopBuys: 12, sellEarned: 1530, inkEarned: 210, inkSpent: 120,
    playDays: 19, questsClaimed: 27, questsHard: 5, messagesSent: 3, wikdlePlays: 5, wikdleWins: 3 },
  pullStats: { since: now - 20 * DAY, n: 10, v: 4000, d: [today, 2, 500], w: [[week - 2, 3, 900], [week, 7, 3100]], luck: ['2026-09-20', 2600, 4],
    top: { r: 'mythic', k: 'en:Omega', t: 'Omega', p: 2400, at: Date.parse('2026-09-20T15:00:00Z') } },
  settings: { hints: false }
};

const browser = await chromium.launch(launchOptions());
const errors = [];

async function open({ context, lang = 'en', layout = null }) {
  const ctx = await browser.newContext({ serviceWorkers: 'block', ...context });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(e.message));
  installStubs(page);
  await page.addInitScript(({ entries, profile, seen, lang, layout }) => {
    if (sessionStorage.getItem('stats.seeded')) return;
    sessionStorage.setItem('stats.seeded', '1');
    localStorage.setItem('wikster.language', lang);
    if (layout) localStorage.setItem('wikster.layout.v1', layout);
    localStorage.setItem('wikster.profile.v1', JSON.stringify(profile));
    localStorage.setItem('wikster.wallet.v1', '4321');
    localStorage.setItem('wikster.ink.v1', '87');
    localStorage.setItem('wikster.collection.v3', JSON.stringify({ entries }));
    localStorage.setItem('wikster.seenRelease.v1', seen);
  }, { entries, profile, seen: RELEASES.at(-1).id, lang, layout });
  await page.goto(BASE, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2400);
  for (let i = 0; i < 6; i++) {
    if (!(await page.locator('#sheet').isVisible().catch(() => false))) break;
    await page.keyboard.press('Escape');
    await page.waitForTimeout(400);
  }
  return page;
}

async function tallShot(page, path) {
  const vp = page.viewportSize();
  const tall = await page.evaluate(() => Math.ceil(document.querySelector('#stat-grid').getBoundingClientRect().height));
  await page.setViewportSize({ width: vp.width, height: tall + 260 });
  await page.waitForTimeout(300);
  await page.locator('#stats-label').evaluate((n) => n.scrollIntoView({ block: 'start' }));
  await page.waitForTimeout(300);
  await page.screenshot({ path });
  await page.setViewportSize(vp);
  await page.waitForTimeout(300);
}

const tileText = (page, id) => page.locator(`#stat-grid .stat-cell[data-stat="${id}"]`).first().innerText().then((s) => s.replace(/\s+/g, ' ').trim()).catch(() => '');
const noOverflow = (page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1
  && [...document.querySelectorAll('#stat-grid .stat-cell, #stat-grid .stat-chart')].every((n) => n.getBoundingClientRect().right <= window.innerWidth + 1));

section('phone, portrait');
const page = await open({ context: devices['Pixel 7'] });
await page.locator('.nav-item[data-tab="profile"]').click();
await page.waitForTimeout(800);
const secs = await page.locator('#stat-grid .stat-sec').evaluateAll((n) => n.map((s) => s.dataset.sec));
check('six sections, in order', JSON.stringify(secs) === JSON.stringify(['collection', 'boosters', 'economy', 'activity', 'games', 'social']), JSON.stringify(secs));
check('every section has its icon', await page.locator('#stat-grid .stat-sec-icon svg').count() === secs.length);
check('cards owned count every copy', /^7 Cards owned/.test(await tileText(page, 'copies')), await tileText(page, 'copies'));
check('different cards', /^4 Different cards/.test(await tileText(page, 'unique')));
check('the best print owned', /^Legendary Best print owned Alpha/.test(await tileText(page, 'bestPrint')), await tileText(page, 'bestPrint'));
check('copies by print add up', (await page.locator('#stat-grid .stat-seg').count()) === 4 && /Legendary\s*2/.test(await page.locator('#stat-grid .stat-legend').innerText()));
check('albums by family', /Themes/.test(await page.locator('#stat-grid [data-family="theme"]').innerText()) && /2 of \d+ started/.test(await page.locator('#stat-grid [data-family="theme"]').innerText()));
check('new cards per week has twelve weeks', await page.locator('#stat-grid [data-chart="new"] .stat-spark-bar').count() === 12);
check('boosters opened', /^37 Boosters opened/.test(await tileText(page, 'boosters')));
check('opened today and this week', /^2 Opened today/.test(await tileText(page, 'today')) && /^7 Opened this week/.test(await tileText(page, 'week')), `${await tileText(page, 'today')} | ${await tileText(page, 'week')}`);
const pulledNow = await page.evaluate(() => { const rc = window.__wikster.state.profile.rarityCounts; const sum = (ids) => ids.reduce((a, id) => a + (rc[id] ?? 0), 0); return { all: sum(Object.keys(rc)), high: sum(['legendary', 'mythic', 'exotic', 'prismatic']) }; });
check('cards pulled and Legendary or better', (await tileText(page, 'pulled')).startsWith(`${pulledNow.all} Cards pulled`) && (await tileText(page, 'legendaryPlus')).startsWith(`${pulledNow.high} Legendary or better`), `${await tileText(page, 'pulled')} | ${await tileText(page, 'legendaryPlus')}`);
check('the average per booster', /^400 Average per booster/.test(await tileText(page, 'average')), await tileText(page, 'average'));
check('the best pull ever', /^Mythic Best pull Omega/.test(await tileText(page, 'bestPull')), await tileText(page, 'bestPull'));
check('the luckiest day', /^2,600 Luckiest day .*4 boosters/.test(await tileText(page, 'luckiest')), await tileText(page, 'luckiest'));
check('the Legendary guarantee', /^In 9 boosters Legendary guarantee 31 of 40/.test(await tileText(page, 'pity')), await tileText(page, 'pity'));
check('opened by kind', (await page.locator('#stat-grid .stat-chip').evaluateAll((n) => n.map((c) => c.dataset.kind))).join() === 'theme,open,timed');
check('boosters per week', await page.locator('#stat-grid [data-chart="boosters"] .stat-spark-bar').count() === 12);
check('the since line says when counting started', /counted from/.test(await page.locator('#stat-grid [data-sec="boosters"] .stat-foot').innerText()));
check('no section is marked private', await page.locator('#stat-grid .stat-sec-note').count() === 0);
const summary = await page.evaluate(() => window.__wikster.statsSummary());
const summaryText = JSON.stringify(summary);
check('the public summary is small and carries no card names', summaryText.length < 1500 && !/Alpha|Omega|en:/.test(summaryText), summaryText);
check('it holds what the board shows', summary.cC === 7 && summary.bN === 37 && summary.eSp === 8400 && summary.aSt === 11 && summary.gQp === 6 && summary.bR === 5, summaryText);
await page.evaluate(() => { window.__wikster.state.profile.settings.publicStats = false; });
check('turned off in Settings, it says only that it is hidden', JSON.stringify(await page.evaluate(() => window.__wikster.statsSummary())).length < 40);
await page.evaluate(() => { window.__wikster.state.profile.settings.publicStats = true; });
check('wallet and Ink', /^4,321 Buckarooz/.test(await tileText(page, 'coins')) && /^87 Ink/.test(await tileText(page, 'ink')));
check('spent in the Shop', /^8,400 Spent in the Shop 12 purchases/.test(await tileText(page, 'spent')), await tileText(page, 'spent'));
check('earned from sales', /^1,530 Earned from sales 21 cards sold/.test(await tileText(page, 'sales')));
check('fusions', /^4 Fusions/.test(await tileText(page, 'fused')));
check('nothing at zero is shown', await page.locator('#stat-grid .stat-cell[data-stat="trades"]').count() === 0);
check('time played', /^5h 20m Time played/.test(await tileText(page, 'playtime')));
check('collecting since', /Jan.*2026 Collecting since/.test(await tileText(page, 'since')), await tileText(page, 'since'));
check('days played', /^20 Days played/.test(await tileText(page, 'days')));
check('the gift streak and its best', /^11 days Daily gift streak Best 16/.test(await tileText(page, 'streak')), await tileText(page, 'streak'));
check('gifts and quests', /^33 Daily gifts claimed/.test(await tileText(page, 'gifts')) && /^27 Quests done 5 hard/.test(await tileText(page, 'quests')));
check('achievements out of the total', /^\d+ \/ \d{3} Achievements/.test(await tileText(page, 'achievements')), await tileText(page, 'achievements'));
check('minigames', /^3 of 5 Wikdle won/.test(await tileText(page, 'wikdle')) && /^6 Quizzes played 4 won, 1 perfect/.test(await tileText(page, 'quiz')) && /^7 Best duel streak 12 rounds/.test(await tileText(page, 'duel')));
check('the showcase', /^0 \/ 10 Showcase/.test(await tileText(page, 'showcase')));
check('the old rarity bars stay', await page.locator('.rarity-row').count() === 8);
check('nothing runs off the side', await noOverflow(page));
await tallShot(page, `${SHOT}/stats-phone.png`);

section('phone, landscape');
await page.setViewportSize({ width: 915, height: 412 });
await page.waitForTimeout(600);
check('still fits sideways', await noOverflow(page));
await tallShot(page, `${SHOT}/stats-landscape.png`);
await page.context().close();

section('French');
const fr = await open({ context: devices['Pixel 7'], lang: 'fr' });
await fr.locator('.nav-item[data-tab="profile"]').click();
await fr.waitForTimeout(800);
const frHeads = await fr.locator('#stat-grid .stat-sec-head h4').allInnerTexts();
check('the sections speak French', frHeads.join('|') === 'Collection|Boosters|Économie|Activité|Mini-jeux|Social', frHeads.join('|'));
check('numbers are grouped the French way', /^2\s600/.test(await tileText(fr, 'luckiest')) && /Jour le plus chanceux/.test(await tileText(fr, 'luckiest')), await tileText(fr, 'luckiest'));
check('and plurals agree', /11 jours/.test(await tileText(fr, 'streak')) && /Dans 9 boosters/.test(await tileText(fr, 'pity')));
await tallShot(fr, `${SHOT}/stats-french.png`);
await fr.context().close();

section('PC');
const pc = await open({ context: { viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 }, layout: 'pc' });
await pc.locator('.pc-plate').click();
await pc.waitForTimeout(900);
const link = pc.locator('.pc-section-link', { hasText: 'Statistics' });
check('the profile has a Statistics tab', await link.count() === 1);
await link.click();
await pc.waitForTimeout(700);
check('it shows every section', await pc.locator('#stat-grid .stat-sec:visible').count() === 6);
check('tiles sit in rows', await pc.evaluate(() => {
  const cells = [...document.querySelectorAll('#stat-grid [data-sec="collection"] .stat-cell')].map((n) => Math.round(n.getBoundingClientRect().top));
  return new Set(cells).size < cells.length;
}));
check('nothing runs off the side on PC', await noOverflow(pc));
await pc.screenshot({ path: `${SHOT}/stats-pc.png` });
await pc.context().close();

console.log(errors.length ? `ERRORS ${errors.join(' | ')}` : 'no page errors');
console.log(fails ? `${fails} CHECK(S) FAILED` : 'ALL PASS');
await browser.close();
process.exit(fails || errors.length ? 1 : 0);
