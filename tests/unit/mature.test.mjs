import { check, done } from './lib.mjs';
import { createEconDb } from '../lib/econdb.mjs';

const { run, EconError } = await import('../../src/econ/engine.js');
const { predict } = await import('../../src/econ/local.js');
const { invOp } = await import('../../src/econ/core.js');
const { specId } = await import('../../src/booster.js');
const { generateShop } = await import('../../src/shop.js');
const { windowIndexAt, freeWindowAt } = await import('../../src/economy.js');
const { matureOptedIn, ageMeta, matureMeta } = await import('../../src/age.js');
const { isMature } = await import('../../src/sensitive.js');
const { matureSite, matureHost, matureCategories } = await import('../../src/wiki/mature.js');

const NOW = Date.UTC(2026, 9, 2, 12, 0, 0);
const db = createEconDb();
const draws = [];
const fakeDraw = async (pack) => {
  draws.push(pack);
  return Array.from({ length: pack.cards ?? 5 }, (_, i) => ({
    key: `wiki:adult.example.org:${draws.length}_${i}`, title: `Page ${draws.length} ${i}`, thumbnail: 'https://img/x.jpg', lang: 'en',
    views: null, popularity: 0.4, mature: Boolean(pack.wiki?.mature)
  }));
};
const finds = [];
const fakeFind = async (q, { allowMature }) => {
  finds.push({ q, allowMature });
  const results = [
    { apiUrl: 'https://zelda.fandom.com/api.php', sitename: 'Zelda Wiki', articles: 11976, farm: 'fandom', score: 1 },
    { apiUrl: 'https://lewd.fandom.com/api.php', sitename: 'Lewd Wiki', articles: 90000, farm: 'fandom', score: 0.9, mature: true },
    { apiUrl: 'https://blocked.example/api.php', sitename: 'Blocked', articles: 5, farm: 'wiki', score: 0.7 }
  ];
  return { query: q, corrected: null, results: allowMature ? results : results.filter((r) => !r.mature), mature: allowMature ? 0 : 1 };
};
const ctxFor = (id, extra = {}) => ({ store: db.store(id), now: NOW, random: () => 0.42, draw: fakeDraw, later: () => {}, user: id, findWiki: fakeFind, ...extra });
const call = (id, action, args, extra) => run(ctxFor(id, extra), action, args);
const refused = async (fn, code) => {
  try { await fn(); return false; } catch (e) { return e instanceof EconError && e.code === code; }
};

check('a sign up aged 18 or more records it', ageMeta(19).age_18_plus === true && ageMeta(15).age_18_plus === undefined);
check('mature wikis need both the age and the setting', matureOptedIn({ age_18_plus: true, mature_wikis: true })
  && !matureOptedIn({ age_18_plus: true }) && !matureOptedIn({ mature_wikis: true }) && !matureOptedIn(null));
check('turning the setting on with an adult age confirms it', matureMeta(true, 21).age_18_plus === true && matureMeta(true, 16).age_18_plus === undefined
  && matureMeta(false).mature_wikis === false);
check('mature wikis are told by their host or their name', matureHost('www.boobpedia.com') && matureHost('hentai.fandom.com')
  && !matureHost('zelda.fandom.com') && matureSite({ sitename: 'NSFW Art Wiki' }) && !matureSite({ sitename: 'Zelda Wiki', host: 'zelda.fandom.com' }));
check('or by a flag the farm sets', matureSite({ host: 'x.fandom.com', sitename: 'X', flags: { isAdult: true } }));
check('a page is mature by its categories', matureCategories([{ title: 'Category:Pages with mature content' }]) && !matureCategories([{ title: 'Category:Characters' }]));
check('a card flagged mature is mature everywhere', isMature({ title: 'A', mature: true }) && !isMature({ title: 'Zelda', extract: 'A princess.' }));

const KID = 'user-kid';
const ADULT = 'user-adult';
const OPTED = 'user-opted';
for (const id of [KID, ADULT, OPTED]) {
  await call(id, 'import');
  await db.store(id).apply({ coins: 200000 });
}
db.meta.set(KID, { age_13_plus: true });
db.meta.set(ADULT, { age_13_plus: true, age_18_plus: true });
db.meta.set(OPTED, { age_13_plus: true, age_18_plus: true, mature_wikis: true });

const adultPack = { id: 'custom-adult', name: 'Adult', wiki: { apiUrl: 'https://adult.example.org/api.php', sitename: 'Adult Wiki', mature: true } };
check('an account under 18 cannot build a mature booster', await refused(() => call(KID, 'customSave', { pack: adultPack }), 'MATURE_LOCKED'));
check('nor an adult who did not turn mature wikis on', await refused(() => call(ADULT, 'customSave', { pack: adultPack }), 'MATURE_LOCKED'));
check('the client cannot hide it by dropping the flag: the host gives it away', await refused(() => call(KID, 'customSave', {
  pack: { id: 'custom-bp', name: 'BP', wiki: { apiUrl: 'https://www.boobpedia.com/wiki/api.php', sitename: 'Boobpedia' } }
}), 'MATURE_LOCKED'));
check('nor by the name when the server looks the wiki up', await refused(() => call(KID, 'customSave', {
  pack: { id: 'custom-sly', name: 'Sly', wiki: { apiUrl: 'https://sly.example.org/api.php', sitename: 'Sly' } }
}, { inspectWiki: async () => ({ mature: true }) }), 'MATURE_LOCKED'));
let r = await call(OPTED, 'customSave', { pack: adultPack });
check('an opted in adult can build it, and it stays marked mature', r.custom.some((p) => p.id === 'custom-adult' && p.wiki.mature === true));
r = await call(OPTED, 'customSave', { pack: { id: 'custom-hp', name: 'HP', wiki: { apiUrl: 'https://harrypotter.fandom.com/api.php', sitename: 'Harry Potter Wiki', mature: 'yes', topic: '  ' } } });
const hp = r.custom.find((p) => p.id === 'custom-hp');
check('a flag that is not true is dropped and an empty topic is not kept', hp && !('mature' in hp.wiki) && !('topic' in hp.wiki));
r = await call(KID, 'customSave', { pack: { id: 'custom-wp', name: 'Zelda', wiki: { apiUrl: 'https://en.wikipedia.org/w/api.php', sitename: 'Wikipedia', topic: 'The Legend of Zelda' } } });
check('a Wikipedia booster keeps its topic', r.custom.some((p) => p.wiki.topic === 'The Legend of Zelda'));

let local = null;
try {
  local = await predict(run, 'customSave', { pack: adultPack }, { wallet: { coins: 0, ink: 0 }, state: {}, inventory: {}, custom: [], entries: {} });
} catch (e) {
  local = e?.cannotPredict ? 'server' : e;
}
check('the phone never predicts a mature booster, it waits for the server', local === 'server', String(local?.message ?? local));

const spec = { kind: 'custom', themeId: null, rarityId: null, cards: 5, wiki: adultPack.wiki, customName: 'Adult', customId: 'custom-adult' };
for (const id of [KID, OPTED]) await db.store(id).apply({ inventory: [invOp(spec, 1)] });
check('a mature booster held by a locked account is not drawn', await refused(() => call(KID, 'prepare', { specId: specId(spec) }), 'MATURE_LOCKED') && draws.length === 0);
r = await call(OPTED, 'prepare', { specId: specId(spec) });
check('it is drawn for an opted in adult', r.cards?.length === 5 && draws.at(-1).wiki.mature === true);
check('and its cards are marked mature', r.cards.every((c) => c.article.mature === true));
const hostSpec = { ...spec, wiki: { apiUrl: 'https://www.boobpedia.com/wiki/api.php', sitename: 'Boobpedia' }, customId: 'custom-bp' };
await db.store(KID).apply({ inventory: [invOp(hostSpec, 1)] });
check('a mature host is refused even when the booster was granted without the flag', await refused(() => call(KID, 'prepare', { specId: specId(hostSpec) }), 'MATURE_LOCKED'));

const shopMature = generateShop(windowIndexAt(NOW), [adultPack], freeWindowAt(NOW));
db.meta.set(OPTED, { age_13_plus: true, age_18_plus: true, mature_wikis: false });
check('turning the setting off stops buying the mature booster', await refused(() => call(OPTED, 'buy', { section: 'customs', id: shopMature.customs[0].id }), 'MATURE_LOCKED'));
db.meta.set(OPTED, { age_13_plus: true, age_18_plus: true, mature_wikis: true });
r = await call(OPTED, 'buy', { section: 'customs', id: shopMature.customs[0].id });
check('and turning it back on lets it be bought again', r.specs?.[0]?.wiki?.mature === true);

db.blockedHosts.add('blocked.example');
r = await call(KID, 'wikiFind', { q: 'zelda', mature: true });
check('the finder hides mature wikis from a locked account even when it asks', finds.at(-1).allowMature === false && r.find.results.every((x) => !x.mature) && r.mature === false);
check('and never lists a blocked host', r.find.results.every((x) => !x.apiUrl.includes('blocked.example')));
r = await call(OPTED, 'wikiFind', { q: 'zelda', mature: true });
check('an opted in adult sees them', finds.at(-1).allowMature === true && r.find.results.some((x) => x.mature));
r = await call(OPTED, 'wikiFind', { q: 'zelda' });
check('only when asking for them', finds.at(-1).allowMature === false && r.find.results.every((x) => !x.mature));
check('a finder query must be a name', await refused(() => call(KID, 'wikiFind', { q: ' ' }), 'BAD_QUERY'));
check('and a server without a finder says so', await refused(() => call(KID, 'wikiFind', { q: 'zelda' }, { findWiki: undefined }), 'NO_FINDER'));

done();
