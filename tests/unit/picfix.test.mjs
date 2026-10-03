import { check, done, fakeStorage } from './lib.mjs';
import { createEconDb } from '../lib/econdb.mjs';

fakeStorage();
const { useLanguageSource } = await import('../../src/i18n.js');
useLanguageSource(() => 'en');
const { run } = await import('../../src/econ/engine.js');
const { needsPicture, pictureApi, forgetPictureTries, PICFIX_MAX } = await import('../../src/econ/picfix.js');
const { PICTURE_VERSION, textCardArt } = await import('../../src/wiki/art.js');

const plate = textCardArt({ title: 'X' });
const row = (key, title, sourceId, thumbnail = plate, extra = {}) => ({
  key, title, rarityId: 'common', price: 10, copies: 1, lang: 'en', packId: 'custom|x|std|5',
  data: { extract: `${title} is a card with enough words on its face to be read.`, thumbnail, sourceId, description: 'Calamity Mod', ...extra }
});

check('a Wikipedia card is looked up on its own wiki', pictureApi('wikipedia:fr') === 'https://fr.wikipedia.org/w/api.php');
check('and a custom wiki card on its api', pictureApi('wiki:calamitymod.wiki.gg') === 'https://calamitymod.wiki.gg/api.php' && pictureApi('wiki:pvz.miraheze.org/w') === 'https://pvz.miraheze.org/w/api.php');
check('only cards with a text card are checked, never special ones',
  needsPicture({ article_key: 'a', title: 'A', data: { thumbnail: plate, sourceId: 'wikipedia:en' } })
  && !needsPicture({ article_key: 'b', title: 'B', data: { thumbnail: 'https://upload.wikimedia.org/b.jpg', sourceId: 'wikipedia:en' } })
  && !needsPicture({ article_key: 'special:x:wikipedia:en:1', title: 'C', data: { thumbnail: plate, sourceId: 'wikipedia:en' } })
  && !needsPicture({ article_key: 'd', title: 'D', data: { thumbnail: plate, sourceId: 'wikipedia:en', pictureCheck: PICTURE_VERSION } }));

const db = createEconDb();
const U = 'u-pictures';
await db.store(U).apply({
  add: [
    row('wiki:calamitymod.wiki.gg:1', 'Sacrifice', 'wiki:calamitymod.wiki.gg'),
    row('wiki:calamitymod.wiki.gg:2', 'Bare page', 'wiki:calamitymod.wiki.gg'),
    row('wikipedia:en:3', 'Chinese aircraft carrier Fujian', 'wikipedia:en'),
    row('wikipedia:en:4', 'Pine', 'wikipedia:en', 'https://upload.wikimedia.org/pine.jpg')
  ],
  state: { imported: true, cardFix: 1, started: true }
});

const asked = [];
const findPictures = async (pages, { apiUrl }) => {
  asked.push({ apiUrl, titles: pages.map((p) => p.title) });
  const out = new Map();
  for (const { title } of pages) {
    if (title === 'Sacrifice') out.set(title, { thumbnail: 'https://calamitymod.wiki.gg/images/Sacrifice.png#wkpx', picture: { source: 'page', pixel: true } });
    else if (title === 'Chinese aircraft carrier Fujian') out.set(title, { thumbnail: 'https://upload.wikimedia.org/fujian.jpg', picture: { source: 'wikidata', link: 'https://commons.wikimedia.org/wiki/File:Fujian.jpg' } });
    else out.set(title, { thumbnail: plate, picture: { source: 'text' } });
  }
  return out;
};
const ctx = (extra = {}) => ({ store: db.store(U), now: Date.now(), random: () => 0.5, user: U, findPictures, ...extra });

const snap = await run(ctx(), 'snapshot', {});
const cards = db.users.get(U).cards;
check('a stored text card upgrades to the picture found since', cards.get('wiki:calamitymod.wiki.gg:1').data.thumbnail.endsWith('Sacrifice.png#wkpx') && cards.get('wiki:calamitymod.wiki.gg:1').data.picture?.pixel === true);
check('with its credit when it came from Wikidata', cards.get('wikipedia:en:3').data.picture?.source === 'wikidata');
check('a page that still has no picture keeps its text card', cards.get('wiki:calamitymod.wiki.gg:2').data.thumbnail === plate);
check('every checked card is stamped so it is checked once', ['wiki:calamitymod.wiki.gg:1', 'wiki:calamitymod.wiki.gg:2', 'wikipedia:en:3'].every((k) => cards.get(k).data.pictureCheck === PICTURE_VERSION));
check('cards with a picture are left alone', !asked.some((a) => a.titles.includes('Pine')));
check('one batched lookup per wiki', asked.length === 2 && asked.some((a) => a.apiUrl === 'https://calamitymod.wiki.gg/api.php' && a.titles.length === 2), JSON.stringify(asked));
check('the snapshot carries the upgraded cards', String(snap.cards?.['wiki:calamitymod.wiki.gg:1']?.thumbnail ?? '').includes('Sacrifice.png'));

asked.length = 0;
await run(ctx(), 'snapshot', {});
check('the next launch does not look again', asked.length === 0);
forgetPictureTries();
await run(ctx(), 'snapshot', {});
check('and even after a while, a checked card is not asked again', asked.length === 0);

const many = Array.from({ length: PICFIX_MAX + 6 }, (_, i) => row(`wikipedia:en:${100 + i}`, `Page ${i}`, 'wikipedia:en'));
await db.store(U).apply({ add: many });
forgetPictureTries();
asked.length = 0;
await run(ctx(), 'snapshot', {});
check('a big backlog is worked through a few cards per launch', asked.reduce((n, a) => n + a.titles.length, 0) === PICFIX_MAX);
forgetPictureTries();
asked.length = 0;
await run(ctx({ findPictures: async () => { throw new Error('down'); } }), 'snapshot', {});
check('a lookup that fails changes nothing', [...db.users.get(U).cards.entries()].filter(([key, r]) => needsPicture({ ...r, article_key: key })).length === 6);

done();
