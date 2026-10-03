import { codeWorld } from '../lib/codeworld.mjs';
import { FIRE, MAKER_PHOTO, codeOf } from '../lib/codefixtures.mjs';

let fails = 0;
const check = (l, c, e = '') => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${e ? '  ' + e : ''}`); };
const world = await codeWorld();
const who = await world.person();
const p = await world.open(who);

check('the level frame is painted at level 5', (await p.locator('#level-badge .frame-overlay svg').count()) === 1);
check('the code is not in the game until the server hands it over', await p.evaluate((id) => !JSON.stringify(window.__wikster.state.profile).includes(id), FIRE.id));

const said = await world.redeem(p, codeOf(FIRE).toLowerCase());
check('the code redeems through the server', /added to your boosters/.test(said), said);
check('the reveal opens with the message from the codes table', await p.locator('.reveal').isVisible().catch(() => false)
  && (await p.locator('.reveal-message').textContent()) === FIRE.message.en);
await world.closeSheets(p);
const st = await p.evaluate(() => ({
  theme: document.documentElement.dataset.theme,
  badges: window.__wikster.store.loadBadgeLoadout(),
  packs: Object.values(window.__wikster.store.loadInventory()).map((s) => s.spec),
  defs: Object.keys(window.__wikster.state.profile.codeDefs ?? {})
}));
check('the definition is kept with the player', st.defs.includes(FIRE.id), JSON.stringify(st.defs));
check('the Hellfire theme goes on', st.theme === 'hellfire', st.theme);
check('the badge is worn', (st.badges ?? []).includes(FIRE.badge.id), JSON.stringify(st.badges));
check('the Hellfire frame goes on and burns in the app bar', (await p.evaluate(() => localStorage.getItem('wikster.frameStyle.v1'))) === 'hellfire' && (await p.locator('#level-badge .frame-overlay .hell-flame').count()) > 10, String(await p.locator('#level-badge .frame-overlay .hell-flame').count()));
const spec = st.packs.find((s) => s?.codeId === FIRE.id);
check('the booster is on the shelf with its cards and the maker', spec?.cards === FIRE.cards.length + 1, JSON.stringify(spec));
check('a second try is refused', /already/i.test(await world.redeem(p, codeOf(FIRE))));
await world.closeSheets(p);

const cards = await world.openBooster(p, `code|${FIRE.id}`);
console.log('cards revealed:', cards?.length, (cards ?? []).map((c) => c.title).join(' | '));
check('every card comes out', cards?.length === FIRE.cards.length + 1, String(cards?.length));
check('every card wears the hellfire treatment but the last, which is the maker', cards.slice(0, -1).every((c) => c.special === 'hellfire') && cards.at(-1)?.special === 'creator', JSON.stringify(cards.map((c) => c.special)));
const names = cards.map((c) => c.title);
check('the slotted members are different cards with their own names', ['First Violin', 'Cellist'].every((name) => names.includes(name)), names.join(', '));
check('the maker card shows the photo from the bucket', cards.at(-1)?.art === MAKER_PHOTO, cards.at(-1)?.art);
const owned = await p.evaluate((id) => Object.entries(window.__wikster.store.loadCollection().entries).filter(([, e]) => e.special === id).map(([k, e]) => ({ k, t: e.title })), FIRE.id);
check('every card lands in the collection', owned.length === FIRE.cards.length + 1, String(owned.length) + ' ' + owned.map((o) => o.t).join(','));
check('member keys carry their slot', owned.filter((o) => /#(violin|cello)$/.test(o.k)).length === 2, owned.map((o) => o.k).filter((k) => k.includes('#')).join(','));
await world.leaveOpening(p);

await p.evaluate(() => { window.__wikster.state.filters.band = 'famous'; window.__wikster.state.filters.search = 'zzz'; });
await p.locator('.nav-item[data-tab="binder"]').click(); await p.waitForTimeout(900);
await p.locator('.album-cover').filter({ hasText: /Firetest/ }).first().click(); await p.waitForTimeout(1200);
const shown = await p.evaluate(() => [...document.querySelectorAll('#page-slots .card')].map((n) => n.querySelector('.card-title')?.textContent));
check('the album shows its first page whatever the filters', shown.length === 4 && shown[0] === 'Orchestra', JSON.stringify(shown));
check('two pages, the maker last', (await p.locator('.album-dot').count()) === 2, String(await p.locator('.album-dot').count()));
await p.locator('.nav-item[data-tab="profile"]').click(); await p.waitForTimeout(900);
check('the badge on the profile carries a live flame', (await p.locator('#screen-profile .badge-live-fire .badge-flame').count()) === 3, String(await p.locator('#screen-profile .badge-live-fire .badge-flame').count()));
check('the Hellfire frame rings the profile too', (await p.locator('#profile-ring .frame-overlay .hell-flame').count()) > 10);

console.log(world.errors.length ? `page errors: ${world.errors.join(' | ')}` : 'no page errors');
if (world.errors.length) fails++;
console.log(fails ? `${fails} FAILURES` : 'ALL PASS');
await world.browser.close();
process.exit(fails ? 1 : 0);
