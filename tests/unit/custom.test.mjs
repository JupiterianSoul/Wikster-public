import { check, done } from './lib.mjs';

const { useLanguageSource } = await import('../../src/i18n.js');
useLanguageSource(() => 'en');
const { drawCustomSet, useCustomPool, warmCustomPool, htmlToText, leadImageIn, POOL_LOW } = await import('../../src/wiki/custom.js');

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

done();
