import { readFileSync } from 'node:fs';
import { check, done } from './lib.mjs';
import { createEconDb } from '../lib/econdb.mjs';

const { run, EconError } = await import('../../src/econ/engine.js');
const { predict } = await import('../../src/econ/local.js');
const { invOp } = await import('../../src/econ/core.js');
const { specId } = await import('../../src/booster.js');
const { generateShop } = await import('../../src/shop.js');
const { windowIndexAt, freeWindowAt, CUSTOM_QTY_RANGE } = await import('../../src/economy.js');
const { matureOptedIn } = await import('../../src/age.js');
const { adultQuery, adultCanon, minorsText, minorsWiki, minorsCard, cardAllowed } = await import('../../src/wiki/safety.js');
const { findWikis, useAdultWikis, cleanAdultWikis } = await import('../../src/wiki/finder.js');
const { ADULT_FIXTURE } = await import('../lib/codefixtures.mjs');
const { matureHost, matureSite, matureTopic } = await import('../../src/wiki/mature.js');
const { isSensitive, isMature } = await import('../../src/sensitive.js');
const { isUsableText } = await import('../../src/wiki/filter.js');
const { androidRequest } = await import('../../src/platform.js');

const NOW = Date.UTC(2026, 9, 3, 12, 0, 0);
const db = createEconDb();
const draws = [];
let nextDraw = null;
const fakeDraw = async (pack) => {
  draws.push(pack);
  if (nextDraw) { const out = nextDraw(pack); nextDraw = null; return out; }
  return Array.from({ length: pack.cards ?? 5 }, (_, i) => ({
    key: `en:Page_${draws.length}_${i}`, title: `Page ${draws.length} ${i}`, extract: 'A plain page about a castle on a hill with long walls and towers.',
    thumbnail: 'https://img/x.jpg', lang: 'en', views: null, popularity: 0.4, ...(pack.wiki?.mature ? { mature: true } : {})
  }));
};
const finds = [];
const fakeFind = async (q, { allowMature }) => {
  finds.push({ q, allowMature });
  const results = [
    { apiUrl: 'https://zelda.fandom.com/api.php', sitename: 'Zelda Wiki', articles: 11976, farm: 'fandom', score: 1 },
    { apiUrl: 'https://www.boobpedia.com/wiki/api.php', sitename: 'Boobpedia', articles: 90000, farm: 'wiki', score: 0.9, mature: true },
    { apiUrl: 'https://lolicon.example.org/api.php', sitename: 'Some Wiki', articles: 900, farm: 'wiki', score: 0.8 }
  ];
  return { query: q, corrected: null, results: allowMature ? results : results.filter((r) => !r.mature), mature: allowMature ? 0 : 1 };
};
const ctxFor = (id, extra = {}) => ({ store: db.store(id), now: NOW, random: () => 0.42, draw: fakeDraw, later: () => {}, user: id, findWiki: fakeFind, ...extra });
const call = (id, action, args, extra) => run(ctxFor(id, extra), action, args);
const refused = async (fn, code) => {
  try { await fn(); return false; } catch (e) { return e instanceof EconError && e.code === code; }
};

const BUYER = 'user-buyer';
const KID = 'user-kid';
const OPTED = 'user-opted';
const SAFE = 'user-safe';
const SAFE_ADULT = 'user-safe-adult';
for (const id of [BUYER, KID, OPTED, SAFE, SAFE_ADULT]) {
  await call(id, 'import');
  await db.store(id).apply({ coins: 500000 });
}
db.meta.set(BUYER, { age_13_plus: true });
db.meta.set(KID, { age_13_plus: true });
db.meta.set(OPTED, { age_13_plus: true, age_18_plus: true, mature_wikis: true });
db.meta.set(SAFE, { age_13_plus: true, no_nsfw: true });
db.meta.set(SAFE_ADULT, { age_13_plus: true, age_18_plus: true, mature_wikis: true, no_nsfw: true });

const zelda = { id: 'custom-zelda', name: 'Zelda', wiki: { apiUrl: 'https://zelda.fandom.com/api.php', sitename: 'Zelda Wiki' } };
await call(BUYER, 'customSave', { pack: zelda });
const shop = generateShop(windowIndexAt(NOW), [zelda], freeWindowAt(NOW));
const item = shop.customs[0];
const before = (await db.store(BUYER).load()).wallet.coins;
let r = await call(BUYER, 'buy', { section: 'customs', id: item.id, cards: 7, count: 3, req: 'buy-req-00000001' });
const spec7 = { ...item.spec, cards: 7 };
const held = (await db.store(BUYER).load()).inventory[specId(spec7)]?.count ?? 0;
const after = (await db.store(BUYER).load()).wallet.coins;
check('one request buys several identical custom boosters', held === 3 && r.count === 3, `held ${held}`);
check('and charges the size price times the quantity', before - after === r.price && r.price === 3 * (r.price / 3) && r.price > 0, `${before - after} vs ${r.price}`);
const single = await call(BUYER, 'buy', { section: 'customs', id: item.id, cards: 7 });
check('a single booster of that size costs a third of it', single.price * 3 === r.price, `${single.price} x3 vs ${r.price}`);
const mid = (await db.store(BUYER).load()).wallet.coins;
r = await call(BUYER, 'buy', { section: 'customs', id: item.id, cards: 7, count: 3, req: 'buy-req-00000001' });
const midHeld = (await db.store(BUYER).load()).inventory[specId(spec7)]?.count ?? 0;
check('the same request sent twice is only charged once', r.already === true && (await db.store(BUYER).load()).wallet.coins === mid && midHeld === 4);
check('a quantity outside the range is refused', await refused(() => call(BUYER, 'buy', { section: 'customs', id: item.id, count: CUSTOM_QTY_RANGE[1] + 1 }), 'BAD_COUNT')
  && await refused(() => call(BUYER, 'buy', { section: 'customs', id: item.id, count: 0 }), 'BAD_COUNT'));
check('other shelves never take a quantity', (await call(BUYER, 'buy', { section: 'subjects', id: shop.subjects[0].id, count: 5 })).count === 1);
let local = await predict(run, 'buy', { section: 'customs', id: item.id, cards: 4, count: 2 }, {
  wallet: { coins: 100000, ink: 0 }, state: {}, inventory: {}, custom: [zelda], entries: {}
}, null, NOW);
check('the phone predicts the same multi buy', local.inventory[specId({ ...item.spec, cards: 4 })]?.count === 2 && local.wallet.coins === 100000 - local.price);
db.blockedHosts.add('zelda.fandom.com');
check('a blocked wiki cannot be bought, however many', await refused(() => call(BUYER, 'buy', { section: 'customs', id: item.id, count: 4 }), 'HOST_BLOCKED'));
db.blockedHosts.delete('zelda.fandom.com');

check('the finder knows porn and its spellings', ['porn', 'porno', 'p0rn', 'pr0n', 'pron', 'PORN', 'p.o.r.n', 'pr0n0'].every(adultQuery)
  && !['pronoun', 'pronto', 'zelda', 'popcorn'].some(adultQuery));
check('and reads them as the plain word', adultCanon('p0rn') === 'porn' && adultCanon('pr0n') === 'porn' && adultCanon('pron') === 'porn' && adultCanon('p0rn0') === 'porno' && adultCanon('zelda') === 'zelda');
check('porn wikis are mature, even with the word inside the name', matureHost('www.wikiporno.org') && matureHost('www.boobpedia.com') && matureSite({ sitename: 'Wikiporno' }) && matureSite({ sitename: 'Pr0n Wiki' }));

const probes = [];
const fakeGet = async (url) => {
  probes.push(url);
  if (url.startsWith(`${ADULT_FIXTURE.api}?`) && url.includes('siteinfo')) {
    return { query: { general: { sitename: 'Fixture Grown Ups Wiki', server: 'https://grownups.example.test', articlepath: '/wiki/$1', lang: 'en' }, statistics: { articles: 50000, images: 1000 } } };
  }
  return {};
};
check('the game ships no list of adult wikis', !/ADULT_WIKIS|boobpedia\.com\/wiki\/api|wikiporno\.org\/api/.test(readFileSync('src/data/wikis.js', 'utf8') + readFileSync('src/wiki/finder.js', 'utf8')));
let found = await findWikis('p0rn', { allowMature: true, fandom: false, get: fakeGet, budget: 4000, fresh: true });
check('without the server list the finder finds no adult wiki on its own', !found.results.some((x) => x.sitename === 'Fixture Grown Ups Wiki'));
useAdultWikis(async () => [ADULT_FIXTURE, { api: 'javascript:alert(1)', names: ['porn'] }, { api: 'https://empty.example.test/api.php', names: [] }]);
check('the list from the server is cleaned', cleanAdultWikis([ADULT_FIXTURE, { api: 'ftp://x', names: ['porn'] }, null]).length === 1);
found = await findWikis('p0rn', { allowMature: true, fandom: false, get: fakeGet, budget: 4000, fresh: true });
check('an adult who may see them finds a porn wiki from an obfuscated spelling', found.results.some((x) => x.sitename === 'Fixture Grown Ups Wiki' && x.mature === true), JSON.stringify(found.results.map((x) => x.sitename)));
found = await findWikis('pr0n', { allowMature: false, fandom: false, get: fakeGet, budget: 4000, fresh: true });
check('nobody else sees it', found.results.every((x) => !x.mature));
const before2 = probes.length;
found = await findWikis('l0licon', { allowMature: true, fandom: false, get: fakeGet, budget: 4000, fresh: true });
check('a search for minors returns nothing and asks nobody', found.results.length === 0 && found.refused === true && probes.length === before2);

const adultPack = { id: 'custom-bp', name: 'Boobpedia', wiki: { apiUrl: 'https://www.boobpedia.com/wiki/api.php', sitename: 'Boobpedia', mature: true } };
check('an adult wiki is refused under 18', await refused(() => call(KID, 'customSave', { pack: adultPack }), 'MATURE_LOCKED'));
check('it is refused to an adult who keeps No NSFW content on', await refused(() => call(SAFE_ADULT, 'customSave', { pack: adultPack }), 'MATURE_LOCKED'));
check('it is refused from the Android app, even for an opted in adult', await refused(() => call(OPTED, 'customSave', { pack: adultPack }, { android: true }), 'MATURE_LOCKED'));
r = await call(OPTED, 'customSave', { pack: adultPack });
check('it is built for an adult who turned the filter off, on the web', r.custom.some((p) => p.id === 'custom-bp' && p.wiki.mature === true));
check('its explicit name passes the pack filter for that adult', r.custom.some((p) => p.name === 'Boobpedia'));
check('the Android marker is read from the user agent or the body', androidRequest('Mozilla/5.0 (Linux; Android 14) WiksterAndroid/1') && androidRequest('', 'android') && !androidRequest('Mozilla/5.0 (X11; Linux)'));
const adultSpec = { kind: 'custom', themeId: null, rarityId: null, cards: 5, wiki: adultPack.wiki, customName: 'Boobpedia', customId: 'custom-bp' };
await db.store(OPTED).apply({ inventory: [invOp(adultSpec, 2)] });
check('the Android app cannot draw it either', await refused(() => call(OPTED, 'prepare', { specId: specId(adultSpec) }, { android: true }), 'MATURE_LOCKED'));
r = await call(OPTED, 'prepare', { specId: specId(adultSpec) });
check('the web can', r.cards?.length === 5);
const adultShop = generateShop(windowIndexAt(NOW), [adultPack], freeWindowAt(NOW));
check('nor buy it from Android', await refused(() => call(OPTED, 'buy', { section: 'customs', id: adultShop.customs[0].id, count: 2 }, { android: true }), 'MATURE_LOCKED'));
r = await call(OPTED, 'wikiFind', { q: 'porn', mature: true }, { android: true });
check('and the Android finder never lists adult wikis, nor says some were hidden', r.find.results.every((x) => !x.mature) && r.find.mature === 0 && finds.at(-1).allowMature === false);
r = await call(OPTED, 'wikiFind', { q: 'porn', mature: true });
check('the web finder lists them for that adult', r.find.results.some((x) => x.mature));
check('but never a wiki whose address names minors', r.find.results.every((x) => !x.apiUrl.includes('lolicon')));
const nFinds = finds.length;
r = await call(OPTED, 'wikiFind', { q: 'sh0tacon', mature: true });
check('a minors search is answered empty without searching', r.find.results.length === 0 && finds.length === nFinds);

const minorsPacks = [
  { id: 'custom-m1', name: 'Loli', wiki: { apiUrl: 'https://loli.example.org/api.php', sitename: 'Loli Wiki' } },
  { id: 'custom-m2', name: 'Art', wiki: { apiUrl: 'https://shotacon.example.org/api.php', sitename: 'Art' } },
  { id: 'custom-m3', name: 'Cub Art', wiki: { apiUrl: 'https://cubart.example.org/api.php', sitename: 'Cub Art', mature: true } },
  { id: 'custom-m4', name: 'Fine', wiki: { apiUrl: 'https://fine.example.org/api.php', sitename: 'Fine' } }
];
let allRefused = true;
for (const pack of minorsPacks.slice(0, 3)) {
  for (const id of [KID, OPTED, SAFE]) if (!(await refused(() => call(id, 'customSave', { pack }), 'CONTENT_REFUSED'))) allRefused = false;
}
check('a wiki about minors is refused to everyone, adults included', allRefused);
check('also when only the server lookup reveals it', await refused(() => call(OPTED, 'customSave', { pack: minorsPacks[3] }, { inspectWiki: async () => ({ sitename: 'Pedo Wiki', mature: false }) }), 'CONTENT_REFUSED'));
check('a booster about minors granted somehow is never drawn', await (async () => {
  const sp = { kind: 'custom', themeId: null, rarityId: null, cards: 5, wiki: minorsPacks[0].wiki, customName: 'Loli', customId: 'custom-m1' };
  await db.store(OPTED).apply({ inventory: [invOp(sp, 1)] });
  return refused(() => call(OPTED, 'prepare', { specId: specId(sp) }), 'CONTENT_REFUSED');
})());
check('minors terms are caught in several languages and spellings', ['loli', 'l0li', 'shota', 'jailbait', 'underage', 'preteen', 'pedo', 'child porn', 'kinderporno', 'pornographie infantile', 'pornografía infantil', 'ロリコン', '児童ポルノ', 'cub porn', 'teen p0rn', 'hentai kids']
  .every((q) => minorsText(q)));
check('without catching ordinary words', !['Chicago Cubs', 'cub', 'teen', 'kids', 'pedometer', 'pedology', 'Lolita (novel)', 'children', 'Zelda'].some((q) => minorsText(q)));
check('a mature wiki that names children is refused', minorsWiki({ apiUrl: 'https://x.example.org/api.php', sitename: 'Teen Models', mature: true }) && !minorsWiki({ apiUrl: 'https://x.example.org/api.php', sitename: 'Teen Titans' }));
check('a page about minors is never usable as a card', !isUsableText('Loli (slang)', 'A word used for drawings of children in a sexual way, which is banned in many countries around the world.'));
check('nor a card from an adult wiki that mentions minors', minorsCard({ title: 'Someone', extract: 'She started at 18 after school with teen shoots.', mature: true }) && !minorsCard({ title: 'Someone', extract: 'An actress.', mature: true }));

nextDraw = (pack) => [
  { key: 'en:Castle', title: 'Castle', extract: 'A fortified building with walls and towers from the middle ages.', popularity: 0.4, lang: 'en' },
  { key: 'en:Brothel', title: 'Brothel', extract: 'A brothel is a place where people engage in sexual activity with a prostitute.', popularity: 0.4, lang: 'en' },
  { key: 'en:Loli', title: 'Loli', extract: 'A loli is a drawing style that sexualises children and is banned on Wikster.', popularity: 0.4, lang: 'en' },
  { key: 'en:Tower', title: 'Tower', extract: 'A tall structure, taller than it is wide, built for watching the land.', popularity: 0.4, lang: 'en' },
  { key: 'en:Pornography', title: 'Pornography', extract: 'Pornography is the portrayal of sexual subject matter for the purpose of arousal.', popularity: 0.4, lang: 'en' }
].slice(0, pack.cards ?? 5);
const themeSpec = { kind: 'theme', themeId: 'space', rarityId: null, cards: 5 };
await db.store(SAFE).apply({ inventory: [invOp(themeSpec, 2)] });
r = await call(SAFE, 'prepare', { specId: specId(themeSpec) });
const titles = r.cards.map((c) => c.article.title);
check('with No NSFW content on, the server leaves mature cards out of a regular booster', !titles.includes('Brothel') && !titles.includes('Pornography') && titles.includes('Castle'), titles.join(', '));
check('and tops the booster up from another draw', r.cards.length === 5, String(r.cards.length));
check('the draw itself is told to stay safe', draws.at(-1).safe === true);
nextDraw = (pack) => [
  { key: 'en:Castle2', title: 'Castle', extract: 'A fortified building with walls and towers from the middle ages.', popularity: 0.4, lang: 'en' },
  { key: 'en:Loli2', title: 'Loli', extract: 'A loli is a drawing style that sexualises children and is banned on Wikster.', popularity: 0.4, lang: 'en' },
  { key: 'en:Brothel2', title: 'Brothel', extract: 'A brothel is a place where people engage in sexual activity with a prostitute.', popularity: 0.4, lang: 'en' }
];
await db.store(KID).apply({ inventory: [invOp({ ...themeSpec, cards: 3 }, 1)] });
r = await call(KID, 'prepare', { specId: specId({ ...themeSpec, cards: 3 }) });
const kidTitles = r.cards.map((c) => c.article.title);
check('without it, minors cards are still always left out', !kidTitles.includes('Loli') && kidTitles.includes('Brothel'), kidTitles.join(', '));
check('No NSFW content overrides the mature opt in', !matureOptedIn({ age_18_plus: true, mature_wikis: true, no_nsfw: true }) && matureOptedIn({ age_18_plus: true, mature_wikis: true }));
check('cards are judged the same way on both sides', !cardAllowed({ title: 'Brothel', extract: 'A brothel is a place of prostitution.' }, { safe: true })
  && cardAllowed({ title: 'Brothel', extract: 'A brothel is a place of prostitution.' }, { safe: false }) && cardAllowed({ title: 'Creator', special: 'creator', mature: true }, { safe: true }));

db.meta.set(OPTED, { age_13_plus: true, age_18_plus: true, mature_wikis: true });
await call(OPTED, 'prepare', { specId: specId(adultSpec) }).catch(() => null);
const waitingBefore = (await db.store(OPTED).waitingList()).length;
db.meta.set(OPTED, { age_13_plus: true, age_18_plus: true, mature_wikis: true, no_nsfw: true });
r = await call(OPTED, 'safeReady', {});
const waitingAfter = (await db.store(OPTED).waitingList()).length;
check('turning No NSFW content on throws away boosters already drawn with mature cards', r.dropped.length > 0 && waitingAfter === waitingBefore - r.dropped.length, `${waitingBefore} -> ${waitingAfter}`);
check('and mature boosters can no longer be drawn or bought', await refused(() => call(OPTED, 'prepare', { specId: specId(adultSpec) }), 'MATURE_LOCKED')
  && await refused(() => call(OPTED, 'buy', { section: 'customs', id: adultShop.customs[0].id }), 'MATURE_LOCKED'));
r = await call(SAFE, 'wikiFind', { q: 'zelda', mature: true });
check('and the finder neither shows nor counts them', r.find.results.every((x) => !x.mature) && r.find.mature === 0);

db.meta.set(OPTED, { age_13_plus: true, age_18_plus: true, mature_wikis: true });
const pornPack = { id: 'custom-wp', name: 'Wikiporno', tagline: 'Wikiporno', wiki: { apiUrl: 'https://www.wikiporno.org/api.php', sitename: 'Wikiporno', mature: true } };
r = await call(OPTED, 'customSave', { pack: pornPack }, { inspectWiki: async () => { throw new Error('Wiki responded 403'); } });
check('an adult wiki the server cannot reach is still built from what the phone saw', r.custom.some((p) => p.id === 'custom-wp' && p.wiki.mature === true));
r = await call(OPTED, 'customSave', { pack: { ...pornPack, id: 'custom-wp2', wiki: { ...pornPack.wiki, mature: false } } }, { inspectWiki: async () => null });
check('and is known as mature from its address alone', r.custom.some((p) => p.id === 'custom-wp2' && p.wiki.mature === true));
check('the same wiki is refused without the opt ins', await refused(() => call(BUYER, 'customSave', { pack: pornPack }, { inspectWiki: async () => { throw new Error('down'); } }), 'MATURE_LOCKED'));
check('a sexual name is fine on a mature booster', (await call(OPTED, 'customSave', { pack: { ...pornPack, id: 'custom-hentai', name: 'Hentai' } })).custom.some((p) => p.id === 'custom-hentai'));
check('but a slur is still refused with its own code', await refused(() => call(OPTED, 'customSave', { pack: { ...pornPack, id: 'custom-slur', name: 'Faggot Wiki' } }), 'NAME_REFUSED'));
check('a sexual name is refused on a normal booster', await refused(() => call(BUYER, 'customSave', { pack: { ...zelda, id: 'custom-z2', name: 'Hentai Zelda' } }), 'NAME_REFUSED'));
r = await call(OPTED, 'customSave', { pack: { ...zelda, id: 'custom-deep', wiki: { apiUrl: 'https://quiet.example.org/api.php', sitename: 'Quiet Wiki' } } }, { inspectWiki: async () => ({ sitename: 'Quiet Wiki', mature: true, deep: true }) });
check('a wiki the server finds explicit by its content is saved as mature', r.custom.some((p) => p.id === 'custom-deep' && p.wiki.mature === true));

check('sexual anatomy topics are mature', ['Penis', 'Pénis', 'Human penis', 'Vagina', 'Clitoris', 'Breast', 'Masturbation', 'Human sexuality', 'Sexual intercourse', 'Kama Sutra', 'Testicle'].every(matureTopic),
  ['Penis', 'Pénis', 'Human penis', 'Vagina', 'Clitoris', 'Breast', 'Masturbation', 'Human sexuality', 'Sexual intercourse', 'Kama Sutra', 'Testicle'].filter((x) => !matureTopic(x)).join(', '));
check('plain medical and biology words are not', !['Breast cancer', 'Heart', 'Liver', 'Sexual reproduction', 'Penistone', 'Homosexuality', 'Puberty', 'Pregnancy', 'Sex', 'Testicular cancer'].some(matureTopic),
  ['Breast cancer', 'Heart', 'Liver', 'Sexual reproduction', 'Penistone', 'Homosexuality', 'Puberty', 'Pregnancy', 'Sex', 'Testicular cancer'].filter(matureTopic).join(', '));
check('a card about sexual anatomy is sensitive and blurred', isSensitive({ title: 'Penis', description: 'Male external sex organ' }) && isMature({ title: 'Vulva', description: 'External female genitalia' }));
check('but a town with a close name is not', !isSensitive({ title: 'Penistone', description: 'Town in South Yorkshire, England', extract: 'Penistone is a market town.' }));
const penis = { id: 'custom-penis', name: 'Penis', tagline: 'Wikipedia · Penis', wiki: { apiUrl: 'https://en.wikipedia.org/w/api.php', sitename: 'Wikipedia', topic: 'Penis' } };
check('a Wikipedia topic booster about sexual anatomy needs the opt ins', await refused(() => call(BUYER, 'customSave', { pack: penis }), 'MATURE_LOCKED')
  && await refused(() => call(OPTED, 'customSave', { pack: penis }, { android: true }), 'MATURE_LOCKED'));
r = await call(OPTED, 'customSave', { pack: penis });
check('and is saved as mature for an opted in adult', r.custom.some((p) => p.id === 'custom-penis' && p.wiki.mature === true));
const heart = { id: 'custom-heart', name: 'Heart', tagline: 'Wikipedia · Heart', wiki: { apiUrl: 'https://en.wikipedia.org/w/api.php', sitename: 'Wikipedia', topic: 'Heart' } };
r = await call(BUYER, 'customSave', { pack: heart });
check('while a plain anatomy topic stays a normal booster', r.custom.some((p) => p.id === 'custom-heart' && !p.wiki.mature));
check('minors stay refused on a mature topic too', await refused(() => call(OPTED, 'customSave', { pack: { ...penis, id: 'custom-m', name: 'Teen penis', wiki: { ...penis.wiki, topic: 'Teen penis' } } }), 'CONTENT_REFUSED'));

done();
