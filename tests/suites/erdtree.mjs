import { codeWorld } from '../lib/codeworld.mjs';
import { TREE, codeOf } from '../lib/codefixtures.mjs';

let fails = 0;
const check = (l, c, e = '') => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${e ? '  ' + e : ''}`); };
const world = await codeWorld();

const backdropIsWarm = (p) => p.evaluate(async () => {
  const data = (await window.__wikster.backdrop.snapshot())?.data ?? [];
  let warm = 0, total = 0;
  for (let i = 0; i < data.length; i += 4 * 97) { total++; if (data[i] > data[i + 2] + 4) warm++; }
  return warm / Math.max(1, total);
});

const who = await world.person();
const p = await world.open(who);
const said = await world.redeem(p, codeOf(TREE).replace(/(.{3})/, '$1 '));
check('the code redeems through the server, spaces and all', /added to your boosters/.test(said), said);
const reveal = await p.locator('.reveal').textContent().catch(() => '');
check('the reveal shows the message, the booster, the theme and the badge', reveal.includes(TREE.message.en) && /Erdtree/.test(reveal) && reveal.includes(TREE.badge.name.en) && reveal.includes(TREE.name.en), reveal.slice(0, 160));
await world.closeSheets(p);
const st = await p.evaluate(() => ({
  theme: document.documentElement.dataset.theme,
  badges: window.__wikster.store.loadBadgeLoadout(),
  packs: Object.values(window.__wikster.store.loadInventory()).map((s) => s.spec)
}));
check('the Erdtree theme goes on, on the phone', st.theme === 'elden', st.theme);
check('the badge is worn', (st.badges ?? []).includes(TREE.badge.id), JSON.stringify(st.badges));
const spec = st.packs.find((s) => s?.codeId === TREE.id);
check('the booster is on the shelf with six cards', spec?.cards === 6, JSON.stringify(spec));
await p.waitForTimeout(400);
check('the tree glows in the backdrop', (await backdropIsWarm(p)) > 0.5);

await p.locator('.nav-item[data-tab="packs"]').click(); await p.waitForTimeout(800);
await p.locator('.seg-option').filter({ hasText: /Custom/ }).first().click().catch(() => 0);
await p.waitForTimeout(900);
const tile = p.locator(`.booster[data-spec^="code|${TREE.id}"]`).first();
check('the booster tile wears the arch and the tree', (await tile.getAttribute('data-family')) === 'arch' && (await tile.locator('.emblem-art svg path').count()) > 4);
const cards = await world.openBooster(p, `code|${TREE.id}`);
console.log('cards revealed:', cards?.length, (cards ?? []).map((c) => c.title).join(' | '));
check('six cards come out', cards?.length === 6, String(cards?.length));
check('five wear the crimson treatment and the maker comes last', cards.slice(0, 5).every((c) => c.special === 'erdtree') && cards[5]?.special === 'creator', JSON.stringify(cards.map((c) => c.special)));
check('each game shows a real picture', cards.slice(0, 4).every((c) => /^https:\/\/upload\.wikimedia\.org\//.test(c.art ?? '')), cards.slice(0, 4).map((c) => c.art).join(' '));
check('Linux comes out classified', cards[4]?.title === 'Linux [REDACTED]' && decodeURIComponent(cards[4]?.art ?? '').includes('CLASSIFIED'), cards[4]?.title);
const owned = await p.evaluate((id) => Object.values(window.__wikster.store.loadCollection().entries).filter((e) => e.special === id), TREE.id);
check('six entries land in the collection', owned.length === 6, String(owned.length));
check('the Linux extract is redacted', owned.some((e) => e.title === 'Linux [REDACTED]' && e.extract.includes('█')));
await world.leaveOpening(p);
await p.locator('.nav-item[data-tab="binder"]').click(); await p.waitForTimeout(900);
const cover = p.locator('.album-cover').filter({ hasText: /Treetest/ }).first();
check('the album is in the binder', (await cover.count()) === 1);
await cover.click(); await p.waitForTimeout(1200);
check('two pages in the album', (await p.locator('.album-dot').count()) === 2, String(await p.locator('.album-dot').count()));

const before = await world.person({ state: { codesRedeemed: { [TREE.id]: 1 } } });
const d = await world.open(before, { pc: true, seed: { 'wikster.theme': 'elden', 'wikster.profile.v1': JSON.stringify({ started: true, createdAt: world.now, playMs: 0, boostersOpened: 5, rarityCounts: {}, progress: { level: 5, xp: 0 }, pendingLevels: [], codesRedeemed: { [TREE.id]: 1 } }) } });
check('the PC frame is up', await d.locator('#pc').isVisible());
check('the Erdtree theme holds on PC for a player who redeemed before the move', (await d.evaluate(() => document.documentElement.dataset.theme)) === 'elden');
check('with its accent', (await d.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--accent').trim())) === '#c8102e');
check('and the tree in the backdrop', (await backdropIsWarm(d)) > 0.5);
check('the definition came back from the codes table', await world.until(() => d.evaluate((id) => Boolean(window.__wikster.state.profile.codeDefs?.[id]), TREE.id), 8000));

console.log(world.errors.length ? `page errors: ${world.errors.join(' | ')}` : 'no page errors');
if (world.errors.length) fails++;
console.log(fails ? `${fails} FAILURES` : 'ALL PASS');
await world.browser.close();
process.exit(fails ? 1 : 0);
