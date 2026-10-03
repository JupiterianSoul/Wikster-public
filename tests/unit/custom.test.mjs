import { check, done } from './lib.mjs';

const { useLanguageSource } = await import('../../src/i18n.js');
useLanguageSource(() => 'en');
const { drawCustomSet, useCustomPool, warmCustomPool, htmlToText, leadImageIn, POOL_LOW, isSubpage, junkTitle, offTopic, protoCard } = await import('../../src/wiki/custom.js');

const WIKI = { apiUrl: 'https://lotr.fandom.com/api.php', lang: 'en', sitename: 'LOTR Wiki', server: 'https://lotr.fandom.com', articlePath: '/wiki/$1' };
const pack = (cards = 5) => ({ name: 'Middle-earth', cards, source: 'custom', wiki: WIKI, odds: null, guarantee: null });

let requests = 0;
let pageId = 0;
const page = () => {
  const id = ++pageId;
  return {
    pageid: id, title: `Page ${id}`, length: 6000,
    extract: `Page ${id} is a place in Middle-earth with a long and winding history that fills more than eighty characters.`,
    thumbnail: { source: `https://static.wikia.nocookie.net/lotr/images/${id}.jpg/revision/latest/scale-to-width-down/640`, width: 640, height: 480 },
    fullurl: `https://lotr.fandom.com/wiki/Page_${id}`
  };
};
globalThis.fetch = async (url) => {
  requests++;
  const u = new URL(String(url));
  if (u.searchParams.get('generator') === 'random') {
    const pages = Object.fromEntries(Array.from({ length: 20 }, () => { const p = page(); return [p.pageid, p]; }));
    return new Response(JSON.stringify({ query: { pages } }), { status: 200 });
  }
  return new Response(JSON.stringify({}), { status: 200 });
};

const stock = new Map();
const background = [];
useCustomPool({
  async take(source, n) {
    const list = stock.get(source) ?? [];
    const cards = list.splice(0, n);
    return { cards, left: list.length };
  },
  async put(source, cards) {
    stock.set(source, [...(stock.get(source) ?? []), ...cards]);
  },
  later(work) { background.push(work); }
});

let got = await drawCustomSet(pack(5));
check('a custom booster draws its cards live when the stock is empty', got.length === 5 && requests > 0);
await Promise.all(background.splice(0));
const stocked = stock.get(WIKI.apiUrl)?.length ?? 0;
check('and then fills the stock for that wiki', stocked >= POOL_LOW, String(stocked));

requests = 0;
got = await drawCustomSet(pack(5));
check('the next one is dealt from the stock without asking the wiki', got.length === 5 && requests === 0, `${requests} requests`);
check('with the booster name and rarities set', got.every((c) => c.description === 'Middle-earth' && c.rarityId));
check('and no card twice', new Set(got.map((c) => c.title)).size === 5);

stock.set(WIKI.apiUrl, []);
requests = 0;
await warmCustomPool({ name: 'Middle-earth', wiki: WIKI });
check('saving a custom booster fills its stock ahead of time', (stock.get(WIKI.apiUrl)?.length ?? 0) >= POOL_LOW && requests > 0);

const html = '<table><tr><td><p>In a table that should never be read as the text of the card at all, not ever.</p></td></tr></table>'
  + '<p>Too short.</p><p>The <b>Shire</b> is a region &amp; home of the hobbits<sup>[1]</sup>, green and quiet, far from the troubles of the world.</p>'
  + '<img src="https://static.wikia.nocookie.net/lotr/images/site-logo.png" width="200">'
  + '<img data-src="https://static.wikia.nocookie.net/lotr/images/a/ab/Shire.jpg/revision/latest/scale-to-width-down/180" src="data:image/gif;base64,R0" width="180" height="200">';
check('lead text is read without a browser', htmlToText(html).startsWith('The Shire is a region & home of the hobbits,'), htmlToText(html));
check('and so is the lead picture', leadImageIn(html) === 'https://static.wikia.nocookie.net/lotr/images/a/ab/Shire.jpg/revision/latest/scale-to-width-down/640', leadImageIn(html));

check('a lead picture with a path on the wiki itself gets its full address', leadImageIn('<img src="/images/Sacrifice.png?d06870" width="140" height="136">', 'https://calamitymod.wiki.gg/api.php') === 'https://calamitymod.wiki.gg/images/Sacrifice.png?d06870');

const CALAMITY = { apiUrl: 'https://calamitymod.wiki.gg/api.php', sitename: 'Calamity Mod Wiki' };
const WIKIPEDIA = { apiUrl: 'https://en.wikipedia.org/w/api.php', sitename: 'Wikipedia' };
check('subpages are not cards', ['Recipes/Plague Infuser/register', 'Hoglin/ED', 'Commands/me', 'Tutorials/Creeper farming', 'Jedi High Council/Legends', 'Java Edition item texture history/Golden Carrot'].every(isSubpage));
check('but a slash inside a real name is fine', !isSubpage('AC/DC') && !isSubpage('Fate/stay night') && !isSubpage('1/2'));
check('changelogs, versions and data pages are not cards', ['1.2.3.003', 'Java Edition Classic server 1.7', 'Bedrock Edition 1.21.80', 'Sounds.json', 'Template:Item', 'Module:Tr'].every((t) => junkTitle(t, CALAMITY)));
check('real articles are kept', !junkTitle('Sacrifice', CALAMITY) && !junkTitle("Carian Knight's Sword", CALAMITY) && !junkTitle('Windows 3.1', WIKIPEDIA) && !junkTitle('Input/output', WIKIPEDIA));
check('a disambiguation page is not a card', protoCard({ pageid: 3, title: 'Medal', pageprops: { disambiguation: '' } }, CALAMITY) === null && protoCard({ pageid: 4, title: 'Medal' }, CALAMITY) !== null);
const daybroken = { title: 'Daybroken', categories: [{ title: 'Category:Debuffs' }] };
check('a mod wiki never deals the base game pages it documents', offTopic(daybroken, 'Daybroken is a vanilla Heat-type debuff that deals massive damage over time.', CALAMITY) === 'VANILLA');
check('the mod own pages are fine', offTopic({ title: 'Sacrifice', categories: [{ title: 'Category:Daggers' }] }, 'Sacrifice is a post-Moon Lord dagger that is dropped by Supreme Witch, Calamitas.', CALAMITY) === null);
check('vanilla only means base game on a mod wiki', offTopic({ title: 'Vanilla', categories: [] }, 'Vanilla is a vanilla flavouring used in many desserts.', { apiUrl: 'https://cooking.fandom.com/api.php', sitename: 'Recipes Wiki' }) === null);
check('a disambiguation page without the page property is not a card either', offTopic({ title: 'Ice Temple', categories: [] }, 'Ice Temple may refer to: the dungeon in one game, or the other one in another game.', CALAMITY) === 'META');
check('wiki meta pages are not cards', offTopic({ title: 'Editing rules', categories: [{ title: 'Category:Policies' }] }, 'x', CALAMITY) === 'META' && offTopic({ title: 'Guide:Class setups', categories: [] }, 'x', CALAMITY) === 'META');

done();
