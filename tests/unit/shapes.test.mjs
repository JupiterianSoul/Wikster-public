import { check, done } from './lib.mjs';

let lang = 'en';
const { useLanguageSource } = await import('../../src/i18n.js');
useLanguageSource(() => lang);
const { drawCustomMany, drawCustomSet, leadWikitext } = await import('../../src/wiki/custom.js');
const { usePictureCache } = await import('../../src/wiki/art.js');
usePictureCache({ async get() { return []; }, async put() {} });

const lead = (title) => `${title} is a page of this wiki that runs long enough to make a proper card, with words to spare for the face.`;
const pagesFor = (n, make) => Object.fromEntries(Array.from({ length: n }, (_, i) => { const p = make(i + 1); return [p.pageid, p]; }));

const SHAPES = {
  'modern.example.org': {
    random: () => pagesFor(20, (i) => ({ pageid: i, title: `Modern ${i}`, extract: lead(`Modern ${i}`), thumbnail: { source: `https://modern.example.org/images/${i}.jpg`, width: 640, height: 480 }, fullurl: `https://modern.example.org/wiki/Modern_${i}`, length: 9000 }))
  },
  'fandomlike.fandom.com': {
    random: () => pagesFor(20, (i) => ({ pageid: 100 + i, title: `Fan ${i}`, extract: '', thumbnail: { source: `https://static.wikia.nocookie.net/fan/images/${i}.png/revision/latest/scale-to-width-down/640`, width: 640, height: 400 }, fullurl: `https://fandomlike.fandom.com/wiki/Fan_${i}`, length: 7000 })),
    content: (page) => `{{Infobox Character\n|image = File:${page.title}.png\n|race = [[Hylian]]\n}}\n'''{{PAGENAME}}''' is a page of this wiki that runs long enough to make a proper card.<ref>{{Cite|Book}}</ref> It has words to spare for the face.\n[[File:Extra.png|thumb]]\n\n== Biography ==\nNot in the lead.`
  },
  'oldwiki.example.net': {
    random: () => pagesFor(20, (i) => ({ pageid: 200 + i, title: `Old ${i}`, fullurl: `https://oldwiki.example.net/w/index.php?title=Old_${i}`, length: 5000 })),
    content: (page) => `${lead(page.title)}\n\n== More ==\nRest.`,
    images: true
  },
  'bare.example.com': {
    random: () => pagesFor(20, (i) => ({ pageid: 300 + i, title: `Bare ${i}`, extract: lead(`Bare ${i}`), fullurl: `https://bare.example.com/wiki/Bare_${i}`, length: 4000, ...(i === 1 ? { categories: [{ title: 'Category:Mature content' }] } : {}) }))
  },
  'fr.wikipedia.org': {
    search: () => pagesFor(6, (i) => ({ pageid: 500 + i, title: `Sujet ${i}`, extract: lead(`Sujet ${i}`), fullurl: `https://fr.wikipedia.org/wiki/Sujet_${i}`, length: 8000,
      pageprops: { wikibase_item: `Q${i}` }, ...(i <= 2 ? { thumbnail: { source: `https://upload.wikimedia.org/s/${i}.jpg`, width: 640, height: 480 } } : {}) })),
    random: () => ({})
  },
  'en.wikipedia.org': {
    search: () => pagesFor(20, (i) => ({ pageid: 400 + i, title: `Topic ${i}`, extract: lead(`Topic ${i}`), thumbnail: { source: `https://upload.wikimedia.org/t/${i}.jpg`, width: 640, height: 480 }, fullurl: `https://en.wikipedia.org/wiki/Topic_${i}`, length: 8000 }))
  }
};

const asked = [];
globalThis.fetch = async (url, init = {}) => {
  const u = new URL(String(url));
  const host = u.hostname;
  const p = init.body ? new URLSearchParams(init.body) : u.searchParams;
  asked.push({ host, what: p.get('action') === 'parse' ? 'parse' : p.get('prop') === 'revisions' ? 'revisions' : p.get('generator') ?? p.get('prop') ?? p.get('list') ?? p.get('meta') ?? 'other', url: String(url), q: p.get('gsrsearch') });
  const shape = SHAPES[host];
  const json = (body) => new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } });
  if (host === 'www.wikidata.org') {
    const ids = (p.get('titles') ?? '').split('|');
    return json({ query: { pages: Object.fromEntries(ids.filter((id) => id === 'Q3').map((id) => [id, { title: id, pageimage: 'Trois.jpg', thumbnail: { source: 'https://upload.wikimedia.org/wikipedia/commons/thumb/t/tr/Trois.jpg/640px-Trois.jpg', width: 640 } }])) } });
  }
  if (host === 'api.openverse.org') return json({ results: [] });
  if (!shape) return new Response('nope', { status: 404 });
  if (p.get('generator') === 'random' && shape.random) return json({ query: { pages: shape.random() } });
  if (p.get('generator') === 'search' && shape.search) return json({ query: { searchinfo: { totalhits: 900 }, pages: shape.search() } });
  if (p.get('prop') === 'revisions') {
    const ids = p.get('pageids').split('|').map(Number);
    const all = Object.values(shape.random());
    return json({ query: { pages: ids.map((id) => {
      const page = all.find((x) => x.pageid === id);
      return { pageid: id, title: page.title, revisions: [{ slots: { main: { content: shape.content(page) } } }] };
    }) } });
  }
  if (p.get('action') === 'parse') {
    const text = p.get('text');
    const html = text.replace(/'''([^']+)'''/g, '<b>$1</b>').split(/\n\n+/).map((para) => `<p>${para}</p>`).join('\n');
    return json({ parse: { title: 'Wikster', text: html } });
  }
  if (p.get('prop') === 'images' && shape.images) {
    const ids = p.get('pageids').split('|').map(Number);
    return json({ query: { pages: Object.fromEntries(ids.map((id) => [id, { pageid: id, title: `Old ${id - 200}`, images: [{ title: 'File:Site-logo.png' }, { title: `File:Old ${id - 200} photo.jpg` }] }])) } });
  }
  if (p.get('prop') === 'imageinfo' && shape.images) {
    const titles = p.get('titles').split('|');
    return json({ query: { pages: Object.fromEntries(titles.map((title, i) => [-(i + 1), { title, imageinfo: [{ thumburl: `https://oldwiki.example.net/images/thumb/${encodeURIComponent(title)}/640px.jpg`, width: 1200, height: 900, mime: 'image/jpeg' }] }])) } });
  }
  return json({ query: { pages: {} } });
};

const pack = (apiUrl, extra = {}) => ({ name: 'Shapes', cards: 5, source: 'custom', wiki: { apiUrl, sitename: 'Shapes Wiki', ...extra }, odds: null, guarantee: null, look: { icon: 'wand', accent: '#a78bfa', accent2: '#4c1d95' } });
const countFor = (host) => asked.filter((a) => a.host === host).length;

let cards = await drawCustomSet(pack('https://modern.example.org/api.php'));
check('a modern wiki with extracts and page images deals a booster in one round of batch requests', cards.length === 5 && countFor('modern.example.org') <= 2, String(countFor('modern.example.org')));
check('with the article picture and text', cards.every((c) => c.thumbnail.startsWith('https://modern.example.org/images/') && c.extract.length >= 80 && !c.picture));

cards = await drawCustomSet(pack('https://fandomlike.fandom.com/api.php'));
const fanAsks = asked.filter((a) => a.host === 'fandomlike.fandom.com').map((a) => a.what);
check('a Fandom wiki with empty intros is read in a few batch requests, not one per page', cards.length === 5 && fanAsks.length <= 5 && fanAsks.includes('revisions') && fanAsks.includes('parse'), fanAsks.join(','));
check('its text keeps the page name and drops the infobox and references', cards.every((c) => /^Fan \d+ is a page of this wiki/.test(c.extract) && !/Wikster|Infobox|Cite|Biography/.test(c.extract)), cards[0]?.extract);
check('and its pictures come from the page images', cards.every((c) => c.thumbnail.includes('static.wikia.nocookie.net')));

cards = await drawCustomSet(pack('https://oldwiki.example.net/w/api.php'));
check('an old wiki without extracts or page images still deals a full booster', cards.length === 5, String(cards.length));
check('with the photo used on each page, never the site logo', cards.every((c) => /photo\.jpg/.test(decodeURIComponent(c.thumbnail)) && !/logo/i.test(c.thumbnail)), cards[0]?.thumbnail);
check('and the card links to the article address the wiki gave', cards.every((c) => c.url.startsWith('https://oldwiki.example.net/w/index.php?title=Old_')));
check('its cards are keyed on the wiki address', cards.every((c) => c.key.startsWith('wiki:oldwiki.example.net/w:')));

asked.length = 0;
cards = await drawCustomSet(pack('https://bare.example.com/api.php'));
check('a wiki with no pictures at all still deals a booster of text cards', cards.length === 5 && cards.every((c) => c.thumbnail.startsWith('data:image/svg+xml') && c.picture?.source === 'text'));
check('after looking for linked pages and free pictures first', asked.some((a) => a.what === 'links') && asked.some((a) => a.host === 'api.openverse.org'));
check('a page filed as mature content never lands in a booster that is not mature', !cards.some((c) => c.title === 'Bare 1') && cards.every((c) => !c.mature));
cards = await drawCustomSet(pack('https://bare.example.com/api.php', { mature: true }));
check('a mature wiki marks every card mature', cards.length === 5 && cards.every((c) => c.mature === true));

asked.length = 0;
cards = await drawCustomSet(pack('https://en.wikipedia.org/w/api.php', { topic: 'Space probes' }));
const search = asked.find((a) => a.what === 'search');
check('a Wikipedia topic booster draws from a search for its topic', cards.length === 5 && search?.q === '"Space probes"');
check('and its cards are ordinary Wikipedia cards', cards.every((c) => c.key.startsWith('wikipedia:en:') && c.sourceName === 'Wikipedia'));

asked.length = 0;
const sets = await drawCustomMany(pack('https://modern.example.org/api.php'), 3);
const dealt = sets.flat().map((c) => c.title);
check('several custom boosters are dealt from one gathering', sets.length === 3 && sets.every((set) => set.length === 5) && new Set(dealt).size === 15, `${sets.length} sets`);
check('in a handful of requests, not one round per booster', countFor('modern.example.org') <= 6, String(countFor('modern.example.org')));

lang = 'fr';
asked.length = 0;
cards = await drawCustomSet(pack('https://modern.example.org/api.php'));
check('an independent wiki is not sent looking for a /fr/ twin it does not have', !asked.some((a) => a.url.includes('/fr/api.php')) && cards.length === 5);

const { drawWikipediaSet } = await import('../../src/wiki/draw.js');
cards = await drawWikipediaSet({ name: 'Sujets', cards: 5, queries: ['sujet'], odds: null, guarantee: null, look: { icon: 'book', accent: '#0ea5e9', accent2: '#082f49' } });
check('a Wikipedia booster short of pictured articles now uses the ones without a picture', cards.length === 5, String(cards.length));
check('the pictured ones keep their own picture', cards.filter((c) => !c.picture).length === 2);
check('one takes its Wikidata picture, credited on the card', cards.some((c) => c.title === 'Sujet 3' && c.picture?.source === 'wikidata'));
check('the rest become designed text cards', cards.filter((c) => c.picture?.source === 'text').length === 2);

check('a lead without templates is kept whole', leadWikitext('A plain lead.\n\n== Next ==\nNo.') === 'A plain lead.');
check('an inline template in a sentence is kept for the wiki to render', leadWikitext('{{Infobox|a=1}}\nThe {{TP}} item.').includes('The {{TP}} item.'));

done();
