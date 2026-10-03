import { codeWorld } from '../lib/codeworld.mjs';
import { CROWN, codeOf } from '../lib/codefixtures.mjs';

let fails = 0;
const check = (l, c, e = '') => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${e ? '  ' + e : ''}`); };
const world = await codeWorld();
const who = await world.person({ level: 30 });
const p = await world.open(who);

await world.drawer(p, 'customize');
const before = await p.evaluate(() => ({
  themes: [...document.querySelectorAll('.theme-card')].map((c) => c.dataset.theme),
  frames: [...document.querySelectorAll('.frame-card')].map((c) => c.dataset.frame),
  fxRows: document.querySelectorAll('.fx-tier').length,
  fxChips: document.querySelectorAll('.fx-chip').length
}));
console.log('   before:', JSON.stringify(before));
check('the gold theme is hidden before the code', !before.themes.includes('apotheosis'));
check('the gold frame is hidden before the code', !before.frames.includes('god'));
check('a card-effect row per rarity', before.fxRows === 8, String(before.fxRows));
check('only classic is offered before anything is bought', await p.locator('.fx-chip.is-on').count() === 8 && before.fxChips === 16, String(before.fxChips));
check('the Atelier frames are not in the picker until bought', !before.frames.some((f) => ['ivy', 'comet', 'inkwell'].includes(f)));
check('high frames are locked at level 30', await p.locator('.frame-card.is-locked').count() >= 4);

const said = await world.redeem(p, codeOf(CROWN));
check('the code redeems through the server', said.includes(CROWN.name.en), said);
check('the reveal opens', await p.locator('.reveal').isVisible().catch(() => false));
check('and shows no booster, since it grants none', await p.locator('.reveal-booster').count() === 0);
const revealText = await p.locator('.reveal').textContent().catch(() => '');
check('it carries the message from the codes table', revealText.includes(CROWN.message.en), revealText.slice(0, 90));
await world.closeSheets(p);

const after = await p.evaluate(() => ({
  theme: document.documentElement.dataset.theme,
  frame: window.__wikster.store.loadFrameStyle(),
  badges: window.__wikster.store.loadBadgeLoadout()
}));
console.log('   after:', JSON.stringify(after));
check('the gold theme is on', after.theme === 'apotheosis', after.theme);
check('the gold frame is worn', after.frame === 'god', String(after.frame));
check('the crown badge is worn', (after.badges ?? []).includes(CROWN.badge.id), JSON.stringify(after.badges));
check('no booster was added', await p.evaluate((id) => Object.keys(window.__wikster.store.loadInventory()).some((k) => k.startsWith(`code|${id}`)), CROWN.id) === false);

await world.drawer(p, 'customize');
const now2 = await p.evaluate(() => ({
  themes: [...document.querySelectorAll('.theme-card')].map((c) => c.dataset.theme),
  frames: [...document.querySelectorAll('.frame-card')].map((c) => c.dataset.frame)
}));
check('the gold theme is in the picker now', now2.themes.includes('apotheosis'));
check('the gold frame is in the picker now', now2.frames.includes('god'));
check('the animated frame is drawn', await p.locator('.frame-card[data-frame="god"] .god-spin').count() > 0);
check('redeeming twice is refused', /already/i.test(await world.redeem(p, codeOf(CROWN))) && !(await p.locator('.reveal').isVisible().catch(() => false)));
await world.closeSheets(p);

await p.evaluate(() => window.__wikster.flushSync()).catch(() => {});
await p.waitForTimeout(600);
await p.evaluate(() => window.__wikster.flushSync()).catch(() => {});
await p.waitForTimeout(600);
const shelf = world.db.profiles.get(who.id)?.badges;
const out = shelf?.earned?.find((b) => b.id === CROWN.badge.id);
check('the badge goes out with its look', out?.look?.motif === 'seal' && out.look.foil?.[1] === CROWN.badge.foil[1] && out.look.name?.en === CROWN.badge.name.en && shelf.worn?.includes(CROWN.badge.id), JSON.stringify(shelf));
const look = world.db.profiles.get(who.id)?.appearance;
check('the gold theme is published for viewers', look?.theme === 'apotheosis', JSON.stringify(look));

const viewer = await world.person();
world.db.friendships.push({ id: 'f-crown', requester: viewer.id, addressee: who.id, status: 'accepted', created_at: new Date(world.now - 3600000).toISOString() });
const v = await world.open(viewer);
await world.drawer(v, 'friends');
await world.until(() => v.locator('#friends-list .person').count().then((n) => n >= 1));
await v.locator('#friends-list .person').first().click();
await world.until(() => v.locator('#screen-friend').isVisible());
await v.waitForTimeout(1200);
const seen = await v.evaluate(() => {
  const screen = document.getElementById('screen-friend');
  return { theme: screen.dataset.theme, badges: [...document.querySelectorAll('#friend-badges svg')].length, text: document.getElementById('friend-badges')?.textContent ?? '',
    labels: [...document.querySelectorAll('#friend-badges [aria-label], #friend-badges [title]')].map((n) => n.getAttribute('aria-label') ?? n.getAttribute('title')).join('|') };
});
check('a friend sees the gold theme on the profile', seen.theme === 'apotheosis', JSON.stringify(seen));
check('and the crown badge under its name, without holding the code', seen.badges > 0 && (seen.text.includes(CROWN.badge.name.en) || seen.labels.includes(CROWN.badge.name.en))
  && await v.evaluate((id) => !JSON.stringify(window.__wikster.state.profile).includes(id), CROWN.id), JSON.stringify(seen));

console.log(world.errors.length ? `page errors: ${world.errors.join(' | ')}` : 'no page errors');
if (world.errors.length) fails++;
console.log(fails ? `${fails} FAILURES` : 'ALL PASS');
await world.browser.close();
process.exit(fails ? 1 : 0);
