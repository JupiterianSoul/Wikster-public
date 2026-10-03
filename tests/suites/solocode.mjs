import { codeWorld } from '../lib/codeworld.mjs';
import { SOLO, SOLO_PHOTO, codeOf } from '../lib/codefixtures.mjs';

let fails = 0;
const check = (l, c, e = '') => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${e ? '  ' + e : ''}`); };
const world = await codeWorld();

const algorithmLook = (page, scope) => page.evaluate((sel) => {
  const card = document.querySelector(`${sel} [data-special="algorithm"]`) ?? document.querySelector(`${sel}[data-special="algorithm"]`);
  if (!card) return null;
  const front = card.querySelector('.card-front');
  return {
    shadow: front ? getComputedStyle(front).boxShadow : '',
    title: card.querySelector('.card-title')?.textContent?.trim(),
    art: card.querySelector('.card-art img')?.getAttribute('src') ?? ''
  };
}, scope);

const who = await world.person();
const p = await world.open(who);
const themeBefore = await p.evaluate(() => document.documentElement.dataset.theme);
const said = await world.redeem(p, codeOf(SOLO));
check('the code redeems through the server', /added to your boosters/.test(said), said);
check('the reveal opens', await p.locator('.reveal').isVisible().catch(() => false));
const reveal = await p.locator('.reveal').textContent().catch(() => '');
check('with the message and the badge, and no theme', /only one Solotest/.test(reveal) && await p.locator('.reveal [data-badge-grant]:not([hidden])').count() === 1 && await p.locator('.reveal [data-theme-grant][hidden]').count() === 1, reveal.slice(0, 120));
await world.closeSheets(p);
const st = await p.evaluate(() => ({
  theme: document.documentElement.dataset.theme,
  badges: window.__wikster.store.loadBadgeLoadout(),
  packs: Object.values(window.__wikster.store.loadInventory()).map((s) => s.spec)
}));
check('the theme stays as it was', st.theme === themeBefore, st.theme);
check('the badge is worn', (st.badges ?? []).includes(SOLO.badge.id), JSON.stringify(st.badges));
const spec = st.packs.find((s) => s?.codeId === SOLO.id);
check('a booster of exactly one card waits on the shelf', spec?.cards === 1, JSON.stringify(spec));
check('the code works once', /already/i.test(await world.redeem(p, codeOf(SOLO))));
await world.closeSheets(p);

await p.locator('.nav-item[data-tab="packs"]').click(); await p.waitForTimeout(800);
await p.locator('.seg-option').filter({ hasText: /Custom/ }).first().click().catch(() => 0);
await p.waitForTimeout(900);
const tile = p.locator(`.booster[data-spec^="code|${SOLO.id}"]`).first();
check('and says 1 card, not 1 cards', (await tile.locator('.booster-count').textContent()) === '1 card', await tile.locator('.booster-count').textContent());
const cards = await world.openBooster(p, `code|${SOLO.id}`);
console.log('cards revealed:', cards?.length, (cards ?? []).map((c) => c.title).join(' | '));
check('exactly one card comes out', cards?.length === 1, String(cards?.length));
check('it is the solo card, with the photo from the bucket', cards[0]?.title === 'Solotest' && cards[0]?.special === 'algorithm' && cards[0]?.art === SOLO_PHOTO, JSON.stringify(cards[0]));
const opening = await algorithmLook(p, '#screen-open');
check('the algorithm look is on the opening card', /0, 229, 168/.test(opening?.shadow ?? ''), JSON.stringify(opening));
const owned = await p.evaluate((id) => Object.values(window.__wikster.store.loadCollection().entries).filter((e) => e.special === id), SOLO.id);
check('one card lands in the collection, special and locked', owned.length === 1 && owned[0].rarityId === 'special' && !owned[0].creator, JSON.stringify(owned.map((e) => [e.key, e.rarityId])));
await world.leaveOpening(p);
await p.locator('.nav-item[data-tab="binder"]').click(); await p.waitForTimeout(900);
const cover = p.locator('.album-cover').filter({ hasText: /Solotest/ }).first();
check('the album is in the binder', (await cover.count()) === 1);
await cover.click(); await p.waitForTimeout(1200);
const page = await algorithmLook(p, '#page-slots');
check('the binder shows the card in its algorithm look', page?.title === 'Solotest' && /0, 229, 168/.test(page.shadow) && page.art === SOLO_PHOTO, JSON.stringify(page));
check('a one card album has no empty numbered slots', await p.locator('#page-slots .album-slot-empty').count() === 0 && await p.locator('#page-slots > *').count() === 1);
await p.locator('#page-slots .card').first().click(); await p.waitForTimeout(1200);
const detail = await algorithmLook(p, '#sheet');
check('and so does the open card', detail?.title === 'Solotest' && /0, 229, 168/.test(detail.shadow), JSON.stringify(detail));
check('it cannot be sold', await p.locator('#sheet .chip.is-lock').count() > 0);
await world.closeSheets(p);
await p.locator('.nav-item[data-tab="profile"]').click(); await p.waitForTimeout(900);
check('the badge shows on the profile', await p.locator('#screen-profile svg[viewBox="-50 -46 100 96"]').count() > 0);

const at = world.now - 3600000;
const before = await world.person({
  state: { codesRedeemed: { [SOLO.id]: 1 } },
  cards: [{ key: 'special:solotest', title: 'Solotest', rarityId: 'special', price: 0, copies: 1, lang: 'en', packId: `code|${SOLO.id}|std|1`,
    data: { special: SOLO.id, creator: false, description: 'old', extract: 'An old copy of the card.', thumbnail: 'https://wikster.pages.dev/special/old.jpg', sourceId: 'special', sourceName: 'Wikster', firstPulledAt: at, lastPulledAt: at, packName: 'Solotest', packIcon: 'gift', packAccent: '#00e5a8' } }]
});
check('a player who redeemed before the move has no definition on the server yet', !world.econDb.users.get(before.id).state.codeDefs);
const d = await world.open(before, { pc: true });
check('the PC frame is up', await d.locator('#pc').isVisible());
check('the definition comes back from the codes table at launch', await world.until(() => Boolean(world.econDb.users.get(before.id).state.codeDefs?.[SOLO.id]), 8000)
  && await d.evaluate((id) => Boolean(window.__wikster.state.profile.codeDefs?.[id]), SOLO.id));
await d.evaluate(() => globalThis.wiksterPc?.screen('binder'));
await d.waitForTimeout(1200);
const pc = await algorithmLook(d, '.pck');
if (!pc) console.log('pc screen:', await d.evaluate(() => ({ screen: globalThis.wiksterPc?.pc?.screen, cards: document.querySelectorAll('.pck .card').length, specials: [...document.querySelectorAll('[data-special]')].map((n) => n.dataset.special), entries: Object.keys(window.__wikster.state.collection.entries) })));
check('on PC the binder shows the old card in its algorithm look', pc?.title === 'Solotest' && /0, 229, 168/.test(pc.shadow), JSON.stringify(pc));
check('and a card saved with the old photo address shows the bucket photo', pc?.art === SOLO_PHOTO, pc?.art);
check('the badge is back on the shelf', await d.evaluate((id) => window.__wikster.state.profile.codeDefs?.solotest?.badge?.id === id, SOLO.badge.id));

console.log(world.errors.length ? `page errors: ${world.errors.join(' | ')}` : 'no page errors');
if (world.errors.length) fails++;
console.log(fails ? `${fails} FAILURES` : 'ALL PASS');
await world.browser.close();
process.exit(fails ? 1 : 0);
