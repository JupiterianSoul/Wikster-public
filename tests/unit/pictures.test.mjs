import { check, done } from './lib.mjs';

const { useLanguageSource } = await import('../../src/i18n.js');
useLanguageSource(() => 'en');
const A = await import('../../src/wiki/art.js');
const { findPictures, textCardArt, isTextArt, wrapTitle, openverseThumb, closestLink, usePictureCache, licenceName } = A;

const art = textCardArt({ title: 'The <Very> Long & Winding Title Of An Article', subject: 'Zelda', icon: 'book', accent: '#ff0000', accent2: '#000000' });
const svg = decodeURIComponent(art.replace('data:image/svg+xml,', ''));
check('a text card is a picture the card can show anywhere', isTextArt(art) && svg.startsWith('<svg') && svg.endsWith('</svg>'));
check('with the title written out safely', svg.includes('&lt;Very&gt;') && svg.includes('&amp;') && !svg.includes('<Very>'));
check('wrapped over a few lines', (svg.match(/<tspan/g) ?? []).length >= 2 && wrapTitle('a b c d e f g h i j k l m n o p q r s t u v w x y z '.repeat(4), 10, 4).length === 4);
check('with the pack subject and its colours', svg.includes('ZELDA') && svg.includes('#ff0000'));
check('a bad colour falls back to a safe one', !decodeURIComponent(textCardArt({ title: 'X', accent: 'red;"><script>' })).includes('<script>'));
check('it stays small', art.length < 6000, String(art.length));

check('Flickr pictures are asked at 640 wide', openverseThumb({ url: 'https://live.staticflickr.com/1/2_abc_b.jpg' }) === 'https://live.staticflickr.com/1/2_abc_z.jpg');
check('Commons originals become 640 thumbnails', openverseThumb({ url: 'https://upload.wikimedia.org/wikipedia/commons/a/ab/Pine.jpg', width: 3000 })
  === 'https://upload.wikimedia.org/wikipedia/commons/thumb/a/ab/Pine.jpg/640px-Pine.jpg');
check('licences are named', licenceName({ license: 'by-sa', license_version: '4.0' }) === 'CC BY-SA 4.0' && licenceName({ license: 'cc0', license_version: '1.0' }) === 'CC0');
check('the closest link is the one inside the title', closestLink('Pine tree', ['Conifer', 'Forest', 'Pine', 'Tree farm']) === 'Pine');
check('and nothing when no link is close', closestLink('Pine tree', ['Volcano', 'Opera']) === null);

const order = [];
let openverseDown = false;
const get = async (url) => {
  const u = new URL(url);
  const p = u.searchParams;
  if (u.hostname === 'www.wikidata.org') {
    order.push('wikidata');
    return { query: { pages: { 1: { title: 'Q1', thumbnail: { source: 'https://thumb.wikimedia.org/wikipedia/commons/thumb/a/a1/Alpha.jpg/640px-Alpha.jpg?utm_source=x', width: 640 }, pageimage: 'Alpha.jpg' } } } };
  }
  if (u.hostname === 'api.openverse.org') {
    order.push('openverse');
    if (openverseDown) throw new Error('Wiki responded 429');
    if (/Gamma/.test(p.get('q'))) {
      return { results: [
        { title: 'Something else', url: 'https://live.staticflickr.com/9/x_b.jpg', license: 'by', license_version: '2.0', tags: [] },
        { title: 'Gamma ray burst', url: 'https://live.staticflickr.com/9/9_g_b.jpg', license: 'by', license_version: '2.0', creator: 'Ann', foreign_landing_url: 'https://flickr.com/p/9', license_url: 'https://creativecommons.org/licenses/by/2.0/', mature: false }
      ] };
    }
    return { results: [] };
  }
  if (p.get('prop') === 'links') {
    order.push('links');
    return { query: { pages: {
      2: { title: 'Pine tree', links: [{ title: 'Forest' }, { title: 'Pine' }] },
      3: { title: 'Gamma', links: [{ title: 'Physics' }] },
      4: { title: 'Nothing at all', links: [] }
    } } };
  }
  if (p.get('prop') === 'pageimages|info') {
    order.push('linked pictures');
    return { query: { pages: { 9: { title: 'Pine', fullurl: 'https://en.wikipedia.org/wiki/Pine', thumbnail: { source: 'https://upload.wikimedia.org/wikipedia/commons/thumb/p/pi/Pine.jpg/640px-Pine.jpg', width: 640 } } } } };
  }
  throw new Error(`unexpected ${url}`);
};

const saved = new Map();
let reads = 0;
usePictureCache({
  async get(keys) { reads++; return keys.map((k) => saved.get(k)).filter(Boolean); },
  async put(rows) { for (const row of rows) saved.set(row.key, row); }
});

const pages = [
  { title: 'Alpha', pageprops: { wikibase_item: 'Q1' } },
  { title: 'Pine tree' },
  { title: 'Gamma' },
  { title: 'Nothing at all' }
];
const look = { subject: 'Space', icon: 'book', accent: '#123456', accent2: '#000000' };
let got = await findPictures(pages, { apiUrl: 'https://en.wikipedia.org/w/api.php', look, get });
check('step 2: a page without a picture takes its Wikidata picture', got.get('Alpha')?.picture.source === 'wikidata' && !got.get('Alpha').thumbnail.includes('utm_'));
check('step 3: then the picture of the closest linked page', got.get('Pine tree')?.picture.source === 'linked' && got.get('Pine tree').picture.from === 'Pine' && got.get('Pine tree').thumbnail.includes('Pine.jpg'));
check('step 4: then a freely licensed picture from Openverse', got.get('Gamma')?.picture.source === 'openverse' && got.get('Gamma').thumbnail === 'https://live.staticflickr.com/9/9_g_z.jpg');
check('which records its licence and author', got.get('Gamma').picture.license === 'CC BY 2.0' && got.get('Gamma').picture.credit === 'Ann' && got.get('Gamma').picture.link === 'https://flickr.com/p/9');
check('an Openverse picture about something else is not used', !got.get('Gamma').thumbnail.includes('x_b'));
check('step 5: and when nothing is found, a designed text card', got.get('Nothing at all')?.picture.source === 'text' && isTextArt(got.get('Nothing at all').thumbnail));
check('the steps run in that order, each once for the whole batch', order.join(',') === 'wikidata,links,linked pictures,openverse,openverse', order.join(','));
check('every answer is kept once for everyone, keyed by host and title', saved.size === 4 && saved.get('en.wikipedia.org|Gamma')?.license === 'CC BY 2.0' && saved.get('en.wikipedia.org|Nothing at all')?.source === 'text');

order.length = 0;
got = await findPictures(pages, { apiUrl: 'https://en.wikipedia.org/w/api.php', look, get });
check('the next player gets the same pictures without a single request', order.length === 0 && got.get('Gamma')?.picture.source === 'openverse' && got.get('Nothing at all')?.picture.source === 'text');

saved.clear();
openverseDown = true;
order.length = 0;
const fresh = await import('../../src/wiki/art.js?again');
fresh.usePictureCache({ async get() { return []; }, async put(rows) { for (const row of rows) saved.set(row.key, row); } });
got = await fresh.findPictures([{ title: 'Gamma' }], { apiUrl: 'https://en.wikipedia.org/w/api.php', look, get });
check('when Openverse fails the card still gets a text card', got.get('Gamma')?.picture.source === 'text');
check('but that miss is not kept, so it is searched again later', !saved.has('en.wikipedia.org|Gamma'));
check('a picture cache read is made per batch, not per card', reads <= 2, String(reads));

done();
