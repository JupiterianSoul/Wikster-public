import { readFileSync } from 'node:fs';
import { check, done } from './lib.mjs';
import { createEconDb } from '../lib/econdb.mjs';

const { run } = await import('../../src/econ/engine.js');
const { predict } = await import('../../src/econ/local.js');
const { ECON_KEYS } = await import('../../src/econ/core.js');
const fc = await import('../../src/friendcodes.js');
const { THEMES } = await import('../../src/ui/themes.js');
const { EMBLEMS } = await import('../../src/data/emblems.js');
const { specId, specName, specColours } = await import('../../src/booster.js');
const { buildAlbums } = await import('../../src/albums.js');
const { badgeStates, badgeStateFromRank, badgeSvg } = await import('../../src/badges.js');
const { cleanAppearance, themeIdOwned, ownedThemeIds } = await import('../../src/appearance.js');
const { standardSpec, pityAfter } = await import('../../src/econ/rules.js');

const schema = readFileSync('supabase/schema.sql', 'utf8');
const sqlArray = (fn) => {
  const m = new RegExp(`function public\\.${fn}\\(\\)[\\s\\S]*?select array\\[([\\s\\S]*?)\\]`).exec(schema);
  return m ? [...m[1].matchAll(/'([^']+)'/g)].map((x) => x[1]) : [];
};
check('the database knows every theme a friend theme can start from', sqlArray('friend_themes').join() === THEMES.map((th) => th.id).join());
check('and every emblem a friend badge can wear', sqlArray('friend_emblems').join() === Object.keys(EMBLEMS).join());
check('the server mirrors the friend codes into the phone', ECON_KEYS.includes('friendCodes'));

const PIC = 'https://example.supabase.co/storage/v1/object/public/friend-pictures/ROBINFC/a.png';
const SPECIAL = {
  name: 'Robin', message: 'Made for you, Robin.', junk: true,
  cards: [
    { article: { key: 'en:Tetris', title: 'Tetris', lang: 'en', url: 'https://en.wikipedia.org/wiki/Tetris', thumbnail: 'https://upload.wikimedia.org/hk.jpg' }, rarityId: 'legendary' },
    { article: { key: 'special:robinfc:the-laugh', title: 'The Laugh', lang: 'en', extract: 'Only Robin laughs like that.', picture: { url: PIC, credit: 'Gabriel', license: 'CC BY 4.0', link: 'https://example.org/a' } }, rarityId: 'special' }
  ],
  booster: { name: 'Robin’s booster', accent: '#3B82F6', cards: [
    { article: { key: 'en:Ada_Lovelace', title: 'Ada Lovelace' }, rarityId: 'epic' },
    { article: { key: 'en:Alan_Turing', title: 'Alan Turing' } },
    { article: { key: 'en:Concorde', title: 'Concorde' }, rarityId: 'common' }
  ] },
  theme: { name: 'Robin Blue', base: 'rire', accent: '#3b82f6' },
  badge: { name: 'Robin’s badge', emblem: 'laugh', color: '#3b82f6' }
};

const clean = fc.checkSpecial(SPECIAL);
check('a full special is cleaned, unknown keys dropped', !('junk' in clean) && clean.cards.length === 2 && clean.booster.cards.length === 3
  && clean.booster.accent === '#3b82f6' && clean.cards[1].article.picture.source === 'upload' && clean.cards[1].article.thumbnail === PIC);
const refused = (label, raw, items = false) => {
  let code = null;
  try { fc.checkSpecial(raw, items); } catch (e) { code = e.code; }
  check(`refused: ${label}`, code === 'BAD_SPECIAL', String(code));
};
refused('no name', { ...SPECIAL, name: '' });
refused('a message too long', { ...SPECIAL, message: 'x'.repeat(801) });
refused('a short hex colour', { ...SPECIAL, theme: { ...SPECIAL.theme, accent: '#fff' } });
refused('an unknown base theme', { ...SPECIAL, theme: { ...SPECIAL.theme, base: 'custom' } });
refused('an unknown emblem', { ...SPECIAL, badge: { ...SPECIAL.badge, emblem: 'nope' } });
refused('an empty booster', { ...SPECIAL, booster: { ...SPECIAL.booster, cards: [] } });
refused('a booster of 13', { ...SPECIAL, booster: { ...SPECIAL.booster, cards: Array.from({ length: 13 }, () => SPECIAL.booster.cards[0]) } });
refused('a picture over plain http', { ...SPECIAL, cards: [{ article: { key: 'k', picture: { url: 'http://x.org/a.png' } } }] });
refused('a made up rarity', { ...SPECIAL, cards: [{ article: { key: 'k' }, rarityId: 'shiny' }] });
refused('nothing to give', { name: 'Ana', message: 'Hi' });
check('a message alone is fine with items', fc.checkSpecial({ name: 'Ana', message: 'Hi' }, true).name === 'Ana');

const NOW = Date.UTC(2026, 9, 3, 12, 0, 0);
const db = createEconDb();
const ROBIN = 'user-robin';
const OTHER = 'user-other';
const ctx = (user) => ({ store: db.store(user), now: NOW, random: () => 0.37, draw: async () => { throw new Error('no draws for a friend booster'); } });
const call = (action, args, user = ROBIN) => run(ctx(user), action, args);
for (const u of [ROBIN, OTHER]) {
  await call('import', {}, u);
  await db.store(u).apply({ coins: 1000, state: { owned: { themes: ['paper'], frames: [], fx: [] } } });
}
db.codes.set('ROBINFC', { code: 'ROBINFC', items: [{ kind: 'coins', amount: 75 }], special: SPECIAL, allowed: [ROBIN], per_user: 1 });
db.codes.set('BROKENFC', { code: 'BROKENFC', items: [], special: { name: 'X', message: 'Y', theme: { name: 'T', base: 'nope', accent: '#000000' } } });

let error = null;
try { await call('redeem', { code: 'ROBINFC' }, OTHER); } catch (e) { error = e.code ?? e.message; }
check('a player not on the list is told the code does not exist', error === 'UNKNOWN_CODE', String(error));
check('and leaves no use behind', !db.codeUses.some((u) => u.code === 'ROBINFC'));

let guessed = false;
try {
  const snap = await call('snapshot', {});
  await predict(run, 'redeem', { code: 'ROBINFC' }, { wallet: snap.wallet, state: snap.state, inventory: snap.inventory, custom: snap.custom, entries: snap.cards }, null, NOW);
} catch (e) { guessed = Boolean(e.cannotPredict); }
check('the phone leaves a book code to the server', guessed);

const res = await call('redeem', { code: 'robin-fc' });
const u = db.users.get(ROBIN);
const spec = fc.friendSpec('ROBINFC', clean.booster, 'Robin');
const sid = specId(spec);
check('the booster spec is a code booster keyed by the code', sid === 'code|db:ROBINFC|std|3' && spec.codeName === 'Robin’s booster' && spec.accent === '#3b82f6');
check('its name and colours come from the spec', specName(spec) === 'Robin’s booster' && specColours(spec).accent === '#3b82f6');
check('the items still land', u.wallet.coins === 1075);
const hk = u.cards.get('special:db:ROBINFC:en:Tetris');
const laugh = u.cards.get('special:db:ROBINFC:special:robinfc:the-laugh');
check('the cards go straight into the collection, one copy each', hk?.copies === 1 && laugh?.copies === 1 && u.cards.size === 2);
check('keeping their rarity', hk.rarity_id === 'legendary' && laugh.rarity_id === 'special');
check('locked like every special card', hk.data.special === 'db:ROBINFC' && laugh.data.special === 'db:ROBINFC');
check('with the uploaded picture and its credit', laugh.data.thumbnail === PIC && laugh.data.picture?.credit === 'Gabriel' && laugh.data.picture?.source === 'upload');
check('one sealed booster waits in the inventory', u.inventory.get(sid)?.count === 1);
check('and its draw is already filed', [...db.pulls.values()].filter((p) => p.specId === sid && !p.claimedAt).length === 1);
const def = u.state.friendCodes?.ROBINFC;
check('the definition is kept in the state, without the booster cards', def?.name === 'Robin' && def.message === 'Made for you, Robin.' && def.booster?.cards === 3
  && def.cards === 2 && def.theme?.base === 'rire' && def.badge?.emblem === 'laugh' && !JSON.stringify(def).includes('Lovelace'));
check('the theme is owned', u.state.owned.themes.includes('fc-robinfc') && u.state.owned.themes.includes('paper'));
check('the reply tells the phone what was given', res.friend?.code === 'ROBINFC' && res.friend.keys.length === 2 && res.friend.spec?.codeId === 'db:ROBINFC'
  && res.state.friendCodes?.ROBINFC && res.inventory[sid]?.count === 1);
check('the claim is written', u.claims.has('dbcode:ROBINFC:1'));
error = null;
try { await call('redeem', { code: 'ROBINFC' }); } catch (e) { error = e.code ?? e.message; }
check('a second redeem is refused', error === 'ALREADY_CLAIMED', String(error));

const ready = await call('ready', { have: [] });
const nonce = ready.ready?.[sid]?.[0];
check('the ready list hands the filed draw at once', Boolean(nonce) && ready.pulls[nonce]?.length === 3);
const pityBefore = Number(u.state.pity) || 0;
const opened = await call('open', { nonce });
check('opening deals exactly its cards, in order', opened.pulls.map((c) => c.article.article).join() === 'en:Ada_Lovelace,en:Alan_Turing,en:Concorde',
  opened.pulls.map((c) => c.article.key).join());
check('with the rarities they were given', opened.pulls.map((c) => c.rarityId).join() === 'epic,common,common');
check('the booster is used up', !db.users.get(ROBIN).inventory.get(sid));
check('pity and the hit slot leave it alone', !standardSpec(spec) && pityAfter(5, spec, []) === 5 && (Number(db.users.get(ROBIN).state.pity) || 0) === pityBefore);
check('the cards land in the collection', db.users.get(ROBIN).cards.has('special:db:ROBINFC:en:Ada_Lovelace'));

await db.store(ROBIN).apply({ inventory: [{ spec_id: sid, spec, delta: 1 }] });
error = null;
try { await call('prepare', { specId: sid }); } catch (e) { error = e.code ?? e.message; }
check('a friend booster without its filed draw is never drawn at random', error === 'DRAW_FAILED', String(error));
await db.store(ROBIN).apply({ inventory: [{ spec_id: sid, spec, delta: -1 }] });

error = null;
try { await call('redeem', { code: 'BROKENFC' }, OTHER); } catch (e) { error = e.code ?? e.message; }
check('a special the game cannot read is refused', error === 'BAD_SPECIAL', String(error));
check('and its use is given back', !db.codeUses.some((x) => x.code === 'BROKENFC'));

const st = db.users.get(ROBIN).state;
fc.useFriendSource(() => st.friendCodes);
check('the theme is owned only with its definition', themeIdOwned(st, 'fc-robinfc') && !themeIdOwned({ owned: { themes: ['fc-robinfc'] } }, 'fc-robinfc')
  && ownedThemeIds(st).includes('fc-robinfc'));
const look = cleanAppearance({ theme: 'fc-robinfc', friend: { name: 'Forged', base: 'apotheosis', accent: '#000000' } }, st);
check('the published look takes the theme from the state', look.theme === 'fc-robinfc' && look.friend.name === 'Robin Blue' && look.friend.base === 'rire');
check('another player sees the look as published', cleanAppearance(look).friend.accent === '#3b82f6');
check('a look without its theme falls back to aurora', cleanAppearance({ theme: 'fc-robinfc' }).theme === 'aurora'
  && cleanAppearance({ theme: 'fc-robinfc' }, { owned: { themes: ['fc-robinfc'] } }).theme === 'aurora');

const states = badgeStates([], {}, [], [], st);
const mine = states.find((s) => s.badge.id === 'fc-robinfc');
check('the badge is earned', mine?.rank === 1 && mine.name === 'Robin’s badge' && mine.badge.emblem === 'laugh');
check('it draws its emblem in its colour', /--e2:#3b82f6/.test(badgeSvg(mine.badge, 1, 1)));
const shelf = fc.cleanFriendBadges({ worn: ['fc-robinfc', 'fc-fake'], earned: [{ id: 'fc-robinfc', rank: 1, look: { name: 'Forged', emblem: 'seal', color: '#000000' } }, { id: 'fc-fake', rank: 1 }, { id: 'ripper', rank: 2 }] }, st);
check('a published shelf keeps the real look and drops the fakes', shelf.earned.length === 2 && shelf.earned[0].look.name === 'Robin’s badge' && shelf.worn.join() === 'fc-robinfc');
const seen = badgeStateFromRank('fc-robinfc', 1, shelf.earned[0].look);
check('another player sees it with its name and emblem', seen?.badge.emblem === 'laugh' && seen.name === 'Robin’s badge');

const entries = [...db.users.get(ROBIN).cards.values()].map((row) => ({ ...row.data, key: row.article_key, title: row.title, rarityId: row.rarity_id, count: row.copies }));
const album = buildAlbums(entries).find((a) => a.key === 'code:db:ROBINFC');
check('the cards have their own album, complete once the booster is open', album?.name === 'Robin’s Album' && album.owned === 5 && album.total === 5 && album.complete);

done();
