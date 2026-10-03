import { codeWorld } from '../lib/codeworld.mjs';
import { ROTOR, codeOf } from '../lib/codefixtures.mjs';

let fails = 0;
const check = (l, c, e = '') => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${e ? '  ' + e : ''}`); };
const world = await codeWorld();
const PICTURES = ROTOR.cards.slice(0, 5).map((card) => card.image.url);

const backdropIsBlue = (p) => p.evaluate(async () => {
  const data = (await window.__wikster.backdrop.snapshot())?.data ?? [];
  let blue = 0, total = 0;
  for (let i = 0; i < data.length; i += 4 * 97) { total++; if (data[i + 2] > data[i] + 20 && data[i + 2] > data[i + 1] + 20) blue++; }
  return blue / Math.max(1, total);
});

const who = await world.person();
const p = await world.open(who);
const said = await world.redeem(p, codeOf(ROTOR).toLowerCase());
check('the code redeems through the server', /added to your boosters/.test(said), said);
const reveal = await p.locator('.reveal').textContent().catch(() => '');
check('with the message, the booster, the theme and the badge', reveal.includes(ROTOR.message.en) && /Rotary/.test(reveal) && reveal.includes(ROTOR.badge.name.en) && reveal.includes(ROTOR.name.en), reveal.slice(0, 160));
await world.closeSheets(p);
const st = await p.evaluate(() => ({
  theme: document.documentElement.dataset.theme,
  badges: window.__wikster.store.loadBadgeLoadout(),
  packs: Object.values(window.__wikster.store.loadInventory()).map((s) => s.spec)
}));
check('the Rotary theme goes on, on the phone', st.theme === 'wankel', st.theme);
check('the badge is worn', (st.badges ?? []).includes(ROTOR.badge.id), JSON.stringify(st.badges));
const spec = st.packs.find((s) => s?.codeId === ROTOR.id);
check('the booster is on the shelf with seven cards', spec?.cards === 7, JSON.stringify(spec));
await p.waitForTimeout(400);
check('the rotor turns in the backdrop', (await backdropIsBlue(p)) > 0.5);

await p.locator('.nav-item[data-tab="packs"]').click(); await p.waitForTimeout(800);
await p.locator('.seg-option').filter({ hasText: /Custom/ }).first().click().catch(() => 0);
await p.waitForTimeout(900);
const tile = p.locator(`.booster[data-spec^="code|${ROTOR.id}"]`).first();
check('the booster tile wears the roundel and the rotor', (await tile.getAttribute('data-family')) === 'roundel' && (await tile.locator('.emblem-art svg path').count()) > 4);
const cards = await world.openBooster(p, `code|${ROTOR.id}`);
console.log('cards revealed:', cards?.length, (cards ?? []).map((c) => c.title).join(' | '));
check('seven cards come out', cards?.length === 7, String(cards?.length));
check('six wear the rotary treatment and the maker comes last', cards.slice(0, 6).every((c) => c.special === 'rotor') && cards[6]?.special === 'creator', JSON.stringify(cards.map((c) => c.special)));
check('each of the five shows exactly its picture', PICTURES.every((url, i) => cards[i]?.art === url), cards.slice(0, 5).map((c) => c.art).join(' '));
check('the first card is named after its own name', cards[0]?.title === 'The fixture car', cards[0]?.title);
check('the last game has a picture of its own', Boolean(cards[5]?.art) && !String(cards[5].art).startsWith('data:image/svg'), String(cards[5]?.art));
const owned = await p.evaluate((id) => Object.values(window.__wikster.store.loadCollection().entries).filter((e) => e.special === id), ROTOR.id);
check('seven entries land in the collection', owned.length === 7, String(owned.length));
check('the pictures keep their author and licence', owned.filter((e) => e.picture?.source === 'commons' && e.picture.credit && e.picture.license).length === 5);
await world.leaveOpening(p);
await p.locator('.nav-item[data-tab="binder"]').click(); await p.waitForTimeout(900);
const cover = p.locator('.album-cover').filter({ hasText: /Rotortest/ }).first();
check('the album is in the binder', (await cover.count()) === 1);
await cover.click(); await p.waitForTimeout(1200);
check('two pages in the album', (await p.locator('.album-dot').count()) === 2, String(await p.locator('.album-dot').count()));
await p.locator('#page-slots .card').filter({ hasText: 'The fixture car' }).first().click(); await p.waitForTimeout(1200);
const credit = await p.locator('.card-credit-picture').first().textContent().catch(() => '');
check('the open card credits its picture', /Picture: Fixture author 1, CC0 via Wikimedia Commons/.test(credit), credit);
await world.closeSheets(p);

const before = await world.person({ state: { codesRedeemed: { [ROTOR.id]: 1 } } });
const d = await world.open(before, { pc: true, seed: { 'wikster.theme': 'wankel', 'wikster.profile.v1': JSON.stringify({ started: true, createdAt: world.now, playMs: 0, boostersOpened: 5, rarityCounts: {}, progress: { level: 5, xp: 0 }, pendingLevels: [], codesRedeemed: { [ROTOR.id]: 1 } }) } });
check('the PC frame is up', await d.locator('#pc').isVisible());
check('the Rotary theme holds on PC for a player who redeemed before the move', (await d.evaluate(() => document.documentElement.dataset.theme)) === 'wankel');
check('with its accent', (await d.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--accent').trim())) === '#5a5aff');
check('and the rotor in the backdrop', (await backdropIsBlue(d)) > 0.5);

console.log(world.errors.length ? `page errors: ${world.errors.join(' | ')}` : 'no page errors');
if (world.errors.length) fails++;
console.log(fails ? `${fails} FAILURES` : 'ALL PASS');
await world.browser.close();
process.exit(fails ? 1 : 0);
