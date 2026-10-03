import { check, done } from './lib.mjs';

const { useLanguageSource } = await import('../../src/i18n.js');
useLanguageSource(() => 'en');
const F = await import('../../src/wiki/finder.js');
const { nameScore, foldName, slugsFor, cleanApi, findWikis, farmIdApi, rankResults, useFinderCache } = F;

check('a typo still matches', nameScore('harry poter', 'Harry Potter Wiki') >= 0.85, String(nameScore('harry poter', 'Harry Potter Wiki')));
check('a part of the name matches', nameScore('zelda', 'The Legend of Zelda') >= 0.85);
check('40k and 40,000 are the same', nameScore('warhammer 40k', 'Warhammer 40,000') === 1 && foldName('Warhammer 40,000') === foldName('warhammer 40k'));
check('spaces do not matter', nameScore('one piece', 'onepiece') >= 0.9);
check('accents do not matter', nameScore('pokemon', 'Pokémon Wiki') === 1);
check('another language spelling still lands', nameScore('pokémon', 'pokemon') === 1);
check('an unrelated wiki does not match', nameScore('zelda', 'Minecraft Wiki') < 0.6);
check('slugs drop accents and keep words joined and hyphenated', slugsFor('Pokémon').includes('pokemon') && slugsFor('One Piece').includes('onepiece') && slugsFor('One Piece').includes('one-piece'));
check('mobile and plain http addresses are cleaned', cleanApi('http://en.m.wikipedia.org/w/api.php') === 'https://en.wikipedia.org/w/api.php'
  && cleanApi('https://zelda.fandom.com/') === 'https://zelda.fandom.com/api.php' && cleanApi('https://x.org:8080/api.php') === null);
check('farm ids become api addresses', farmIdApi('fandom', 'fr.onepiece') === 'https://onepiece.fandom.com/fr/api.php'
  && farmIdApi('wikigg', 'terraria') === 'https://terraria.wiki.gg/api.php' && farmIdApi('miraheze', 'zelda') === 'https://zelda.miraheze.org/w/api.php');

const SITES = {
  'https://harrypotter.fandom.com/api.php': { sitename: 'Harry Potter Wiki', articles: 24698, images: 56521, server: 'https://harrypotter.fandom.com' },
  'https://harry-potter-compendium.fandom.com/api.php': { sitename: 'The Harry Potter Compendium', articles: 5083, images: 900, server: 'https://harry-potter-compendium.fandom.com' },
  'https://harrypotter.fandom.com/fr/api.php': { sitename: 'Wiki Harry Potter', articles: 9001, images: 20000, server: 'https://harrypotter.fandom.com', scriptpath: '/fr', lang: 'fr' },
  'https://harrypotter.miraheze.org/w/api.php': { sitename: 'Potterpedia', articles: 300, images: 40, server: 'https://harrypotter.miraheze.org', scriptpath: '/w' },
  'https://potter.wiki.gg/api.php': { sitename: 'Potter Lewd Wiki', articles: 99999, images: 10, server: 'https://potter.wiki.gg', nsfw: true },
  'https://minecraft.wiki/api.php': { sitename: 'Minecraft Wiki', articles: 18100, images: 173022, server: 'https://minecraft.wiki' },
  'https://tiny.fandom.com/api.php': { sitename: 'Harry Potter Tiny Wiki', articles: 12, images: 1, server: 'https://tiny.fandom.com' }
};
const calls = [];
let wikipediaDown = false;
const reply = (body) => JSON.parse(JSON.stringify(body));
const get = async (url) => {
  calls.push(url);
  const u = new URL(url);
  const p = u.searchParams;
  if (u.hostname === 'services.fandom.com') {
    const q = p.get('query');
    if (!/harry/i.test(q)) return { results: [] };
    return reply({ results: [
      { name: 'Harry Potter Wiki', url: 'https://harrypotter.fandom.com/', language: 'en', pageCount: 20000 },
      { name: 'The Harry Potter Compendium', url: 'https://harry-potter-compendium.fandom.com/', language: 'en', pageCount: 5000 },
      { name: 'Harry Potter Tiny Wiki', url: 'https://tiny.fandom.com/', language: 'en', pageCount: 10 }
    ] });
  }
  if (u.hostname === 'www.wikidata.org' && p.get('list') === 'search') {
    return /harry potter/i.test(p.get('srsearch')) ? { query: { search: [{ title: 'Q8337' }] } } : { query: { search: [] } };
  }
  if (u.hostname === 'www.wikidata.org' && p.get('action') === 'wbgetentities') {
    return { entities: { Q8337: { labels: { en: { value: 'Harry Potter' } }, claims: {
      P4073: [{ mainsnak: { datavalue: { value: 'harrypotter' } } }, { mainsnak: { datavalue: { value: 'fr.harrypotter' } } }],
      P11994: [{ mainsnak: { datavalue: { value: 'potter' } } }]
    } } } };
  }
  if (u.hostname === 'meta.miraheze.org') {
    return /harrypotterwiki/.test(p.get('wdwikis')) ? { query: { wikidiscover: { wikis: { harrypotterwiki: { url: 'https://harrypotter.miraheze.org', sitename: 'Potterpedia', public: '' } } } } } : { query: { wikidiscover: { wikis: {} } } };
  }
  if (u.hostname.endsWith('.wikipedia.org')) {
    if (wikipediaDown) throw new Error('Wiki responded 503');
    const q = p.get('srsearch');
    if (/poter/i.test(q)) return { query: { searchinfo: { totalhits: 3887, suggestion: 'harry potter' }, search: [{ title: 'Harry Potter' }] } };
    if (/harry potter/i.test(q)) return { query: { searchinfo: { totalhits: 3887 }, search: [{ title: 'Harry Potter' }] } };
    return { query: { searchinfo: { totalhits: 0 }, search: [] } };
  }
  if (p.get('meta') === 'siteinfo') {
    const site = SITES[`${u.origin}${u.pathname}`];
    if (!site) throw new Error('Wiki responded 404');
    return { query: {
      general: { sitename: site.sitename, server: site.server, scriptpath: site.scriptpath ?? '', lang: site.lang ?? 'en', articlepath: `${site.scriptpath ?? ''}/wiki/$1`, ...(site.nsfw ? { isAdult: true } : {}) },
      statistics: { articles: site.articles, images: site.images }
    } };
  }
  throw new Error(`unexpected ${url}`);
};

const stored = new Map();
useFinderCache({
  find: { get: async (k) => stored.get(`find:${k}`) ?? null, put: async (k, v) => { stored.set(`find:${k}`, v); } },
  site: { get: async (k) => (stored.has(`site:${k}`) ? { info: stored.get(`site:${k}`) } : null), put: async (k, v) => { stored.set(`site:${k}`, v); } }
});

let found = await findWikis('harry poter', { lang: 'en', get, fandom: true });
const best = found.results[0];
check('a misspelt name finds the wiki', best?.apiUrl === 'https://harrypotter.fandom.com/api.php', JSON.stringify(found.results.map((r) => r.apiUrl)));
check('the biggest matching wiki is picked', best.articles === 24698 && found.results.filter((r) => !r.topic).every((r) => r.articles <= best.articles));
check('the spelling it searched with is reported', found.corrected === 'harry potter');
check('alternatives come with their page counts', found.results.length >= 3 && found.results.every((r) => Number.isFinite(r.articles) && r.articles > 0));
check('the other language edition is offered too', found.results.some((r) => r.apiUrl === 'https://harrypotter.fandom.com/fr/api.php' && r.lang === 'fr'));
check('a wiki on another farm is offered', found.results.some((r) => r.farm === 'miraheze'));
check('a wiki that is too small is left out', !found.results.some((r) => r.apiUrl.includes('tiny.fandom.com')));
check('a mature wiki is hidden and counted', !found.results.some((r) => r.mature) && found.mature === 1);
check('a Wikipedia topic is offered last', found.results.at(-1)?.topic === 'Harry Potter' && found.results.at(-1)?.farm === 'wikimedia');
check('each address was asked once at most', new Set(calls).size === calls.length);
check('the search is kept on the server', [...stored.keys()].some((k) => k.startsWith(`find:${F.findKey('harry poter', 'en')}`)));
check('and so is every wiki looked at', stored.get('site:https://harrypotter.fandom.com/api.php')?.articles === 24698);

calls.length = 0;
const again = await findWikis('Harry   POTER', { lang: 'en', get, fandom: true, allowMature: true });
check('a repeat search costs nothing', calls.length === 0);
check('and shows the mature wiki to a player who asked for it', again.results.some((r) => r.mature && r.apiUrl === 'https://potter.wiki.gg/api.php') && again.mature === 0);
check('but a mature wiki is never the default pick, even when bigger', again.results[0].apiUrl === 'https://harrypotter.fandom.com/api.php');

calls.length = 0;
wikipediaDown = true;
found = await findWikis('minecraft', { lang: 'en', get, fandom: false });
check('a known independent wiki is found without Fandom', found.results[0]?.apiUrl === 'https://minecraft.wiki/api.php', JSON.stringify(found.results.map((r) => r.apiUrl)));
check('and the finder still answers when Wikipedia is down', found.results.length >= 1);
check('without Fandom search the phone never asks it', !calls.some((u) => u.includes('services.fandom.com')));

found = await findWikis('qzxv blorp', { lang: 'en', get, fandom: true });
check('a name with no wiki finds nothing', found.results.length === 0);

const ranked = rankResults([
  { apiUrl: 'a', articles: 900000, score: 0.62 },
  { apiUrl: 'b', articles: 2000, score: 0.95 },
  { apiUrl: 'c', articles: 5000, score: 0.9 },
  { apiUrl: 'd', articles: 800000, score: 0.9, topic: 'X' },
  { apiUrl: 'e', articles: 99999, score: 0.4 }
]);
check('a strong match beats a huge loose one', ranked[0].apiUrl === 'c' && ranked.at(-1).apiUrl === 'd' && !ranked.some((r) => r.apiUrl === 'e'));

const { offCanon, biggestIndex, formatPages, pageCount } = F;
const pokemon = [
  { apiUrl: 'https://pokemonfanon.fandom.com/api.php', sitename: 'PokéFanon', articles: 41596, score: 0.82, lang: 'en' },
  { apiUrl: 'https://pokemon.fandom.com/api.php', sitename: 'Pokémon Wiki', articles: 37715, score: 1, lang: 'en' },
  { apiUrl: 'https://pokemon.fandom.com/ko/api.php', sitename: 'Korean Pokémon Wiki', articles: 46127, score: 1, lang: 'ko', official: true }
];
check('a fan fiction wiki loses to the canonical one, even when bigger', rankResults(pokemon, { lang: 'en', query: 'pokemon' })[0].apiUrl === 'https://pokemon.fandom.com/api.php');
check('a known canonical wiki wins over a bigger farm copy', rankResults([...pokemon, { apiUrl: 'https://bulbapedia.bulbagarden.net/w/api.php', sitename: 'Bulbapedia', articles: 30000, score: 1, lang: 'en', known: true }], { lang: 'en', query: 'pokemon' })[0].sitename === 'Bulbapedia');
check('another language edition is not the default pick', rankResults(pokemon, { lang: 'en', query: 'pokemon' })[0].lang === 'en' && rankResults(pokemon, { lang: 'ko', query: 'pokemon' })[0].lang === 'ko');
check('fanon in the address counts too', rankResults([
  { apiUrl: 'https://narutofanon.fandom.com/api.php', sitename: 'Naruto Wiki', articles: 39769, score: 1, lang: 'en' },
  { apiUrl: 'https://naruto.fandom.com/api.php', sitename: 'Narutopedia', articles: 8029, score: 1, lang: 'en' }
], { lang: 'en', query: 'naruto' })[0].apiUrl === 'https://naruto.fandom.com/api.php');
check('an exact name beats a bigger spin off', rankResults([
  { apiUrl: 'https://fortnite-esports.fandom.com/api.php', sitename: 'Fortnite Esports Wiki', articles: 171233, score: 0.96, lang: 'en' },
  { apiUrl: 'https://fortnite.fandom.com/api.php', sitename: 'Fortnite Wiki', articles: 35088, score: 1, lang: 'en' }
], { lang: 'en', query: 'fortnite' })[0].apiUrl === 'https://fortnite.fandom.com/api.php');
check('a non canon wiki loses to the canon one', rankResults([
  { apiUrl: 'https://memory-beta.fandom.com/api.php', sitename: 'Memory Beta, non-canon Star Trek Wiki', articles: 77067, score: 1, lang: 'en' },
  { apiUrl: 'https://memory-alpha.fandom.com/api.php', sitename: 'Memory Alpha', articles: 66619, score: 1, lang: 'en' }
], { lang: 'en', query: 'star trek' })[0].sitename === 'Memory Alpha');
check('fan words are spotted in names and addresses', offCanon({ sitename: 'Genshin Impact Fanfiction & Roleplay Wiki' }) && offCanon({ sitename: 'Ideas Wiki' })
  && offCanon({ sitename: 'X', apiUrl: 'https://wh40khomebrew.fandom.com/api.php' }) && !offCanon({ sitename: 'Wookieepedia', apiUrl: 'https://starwars.fandom.com/api.php' }));
check('but a player who asks for fanon gets fanon', !offCanon({ sitename: 'PokéFanon', apiUrl: 'https://pokemonfanon.fandom.com/api.php' }, 'pokemon fanon'));
check('the finder cache is versioned', F.findKey('Pokemon', 'en').startsWith(`v${F.FINDER_VERSION}|`) && F.FINDER_VERSION >= 2);
check('a known canonical wiki is listed for Pokemon', (await import('../../src/data/wikis.js')).KNOWN_WIKIS.some((w) => w.api === 'https://bulbapedia.bulbagarden.net/w/api.php'));

const shown = [
  { apiUrl: 'a', sitename: 'Best match', articles: 9800, score: 1 },
  { apiUrl: 'b', sitename: 'Middle', articles: 12000, score: 0.9 },
  { apiUrl: 'c', sitename: 'Largest', articles: 1200000, score: 0.85 },
  { apiUrl: 'd', sitename: 'Cached long ago', articles: '130000', score: 0.84 },
  { apiUrl: 'e', sitename: 'Unknown size', articles: null, score: 0.9 },
  { apiUrl: 'f', sitename: 'Wikipedia', articles: 5000000, score: 0.9, topic: 'X' }
];
const labels = shown.map((r) => formatPages(pageCount(r)));
check('the sizes read as k and M', labels.join(' ') === '9.8k 12k 1.2M 130k ? 5M', labels.join(' '));
check('and in French with a comma', formatPages(9800, 'fr') === '9,8k' && formatPages(1200000, 'fr') === '1,2M' && formatPages(12000, 'fr') === '12k');
check('Biggest goes to the largest real count, not the first or the longest text', biggestIndex(shown) === 2);
check('a cached count kept as text is compared as a number', biggestIndex([shown[0], shown[3], shown[1]]) === 1);
check('an unknown count or a Wikipedia topic never gets it', biggestIndex([shown[4], shown[5]]) === -1);
check('a missing count sorts as empty, not as huge', rankResults([shown[4], { ...shown[1], score: 0.9 }])[0].apiUrl === 'b');

done();
