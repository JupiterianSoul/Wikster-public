import { check, done, fakeStorage } from './lib.mjs';
import { createEconDb } from '../lib/econdb.mjs';
import { MAKER_PHOTO, SOLO_PHOTO, TREE, SOLO, defsOf, seedLegacyCodes } from '../lib/codefixtures.mjs';

fakeStorage();
const { useLanguageSource } = await import('../../src/i18n.js');
useLanguageSource(() => 'en');
const { codeById, codeSpec, learnCodeDefs, withSpecialPhoto } = await import('../../src/codedefs.js');
const { toDrawPack, specId } = await import('../../src/booster.js');
const { drawArticles, retryAfterMs } = await import('../../src/wiki/core.js');
const { titleCards } = await import('../../src/wiki/translate.js');
const { run } = await import('../../src/econ/engine.js');
const { brokenSpecial, forgetFixTries, CARD_FIX } = await import('../../src/econ/fix.js');
const { platePicture } = await import('../../src/wiki/translate.js');

const COVERS = {
  Chess: 'https://upload.wikimedia.org/wikipedia/commons/a/aa/Fixture_chess.jpg',
  'Go (game)': 'https://upload.wikimedia.org/wikipedia/commons/a/aa/Fixture_go.jpg',
  Checkers: 'https://upload.wikimedia.org/wikipedia/commons/a/aa/Fixture_checkers.jpg',
  Backgammon: 'https://upload.wikimedia.org/wikipedia/commons/a/aa/Fixture_backgammon.jpg',
  Linux: 'https://upload.wikimedia.org/wikipedia/commons/a/aa/Fixture_linux.svg'
};
const MISSING = new Set(['No such page at all']);
const idOf = (title) => 1000 + [...title].reduce((n, c) => (n * 31 + c.charCodeAt(0)) % 900000, 7);

let script = [];
const apiCalls = [];
const agents = [];
globalThis.fetch = async (url, init = {}) => {
  const u = new URL(String(url));
  agents.push(init.headers?.['User-Agent'] ?? null);
  const json = (body, status = 200, headers = {}) => ({
    ok: status >= 200 && status < 300, status, json: async () => body,
    headers: { get: (name) => headers[String(name).toLowerCase()] ?? null }
  });
  if (u.pathname.includes('/rest_v1/page/summary/')) return json({});
  if (!u.pathname.endsWith('/w/api.php')) return json({ items: [] });
  if (u.searchParams.get('generator') === 'images') return json({ query: { pages: {} } });
  apiCalls.push(u.searchParams.get('titles'));
  const step = script.length ? script.shift() : 'ok';
  if (step === 500) return json({ error: 'boom' }, 500);
  if (step === 429) return json({}, 429, { 'retry-after': '0' });
  if (step === 503) return json({}, 503);
  if (step === 'ratelimited') return json({ error: { code: 'ratelimited', info: 'slow down' } });
  const pages = {};
  let miss = -1;
  for (const title of (u.searchParams.get('titles') ?? '').split('|')) {
    if (MISSING.has(title)) { pages[miss--] = { ns: 0, title, missing: '' }; continue; }
    const id = idOf(title);
    pages[id] = {
      pageid: id, ns: 0, title, lang: 'en',
      extract: `${title} is an article long enough to be read on the face of a card, with several words in it.`,
      description: 'stub article',
      ...(COVERS[title] ? { thumbnail: { source: COVERS[title], width: 640, height: 480 } } : {}),
      pageviews: { '2026-09-01': 1200, '2026-09-02': 1300 },
      fullurl: `https://en.wikipedia.org/wiki/${encodeURIComponent(title)}`
    };
  }
  return json({ query: { pages } });
};
const always = (step, n = 40) => Array.from({ length: n }, () => step);

check('Retry-After in seconds or as a date', retryAfterMs('2') === 2000 && retryAfterMs(new Date(Date.now() + 3000).toUTCString()) > 1000 && retryAfterMs(null) === null);

learnCodeDefs(defsOf(TREE, SOLO));
const greg = codeById('treetest');
script = [500, 429];
apiCalls.length = 0;
const cards = await drawArticles(toDrawPack(codeSpec(greg)));
check('after a 500 and a 429 the code booster still deals six cards', cards.length === 6, String(cards.length));
const games = cards.slice(0, 4);
check('every game has its real picture', games.every((c) => String(c.thumbnail).startsWith('https://upload.wikimedia.org/')), games.map((c) => c.thumbnail).join(' '));
check('no placeholder: every card is keyed by its page id', cards.slice(0, 5).every((c) => /^special:treetest:wikipedia:en:\d+$/.test(c.key)), cards.map((c) => c.key).join(' '));
check('and reads its article, not its title', cards.slice(0, 5).every((c) => c.extract.replace(/█/g, '').length > c.title.length + 20));
check('the five titles go in one request, tried again after each failure', apiCalls.length === 3 && apiCalls.every((t) => t && t.split('|').length === 5), JSON.stringify(apiCalls));
check('the maker photo is the bucket address', cards[5].thumbnail === MAKER_PHOTO, cards[5].thumbnail);
check('the server fetches carry the Wikster User-Agent once it is set', agents.every((a) => a === null));

script = always(503);
const down = await drawArticles(toDrawPack(codeSpec(greg))).then(() => null, (e) => e);
check('when Wikipedia stays down the draw fails instead of dealing placeholders', Boolean(down) && Number(down.status) === 503, String(down));
script = ['ratelimited', 'ok'];
const limited = await drawArticles(toDrawPack(codeSpec(greg)));
check('an API rate limit answer is retried too', limited.slice(0, 5).every((c) => /:\d+$/.test(c.key)));

script = [];
const roll = await titleCards([{ title: 'Backgammon', fallback: 'Backgammon' }, { title: 'No such page at all', fallback: 'No such page at all' }], { fallbackArt: '#123456' });
check('a page that really does not exist becomes a designed card', roll[0].pageId && roll[1].pageId === null && String(roll[1].thumbnail).startsWith('data:image/svg'));

const { setRequestHeaders } = await import('../../src/wiki/core.js');
setRequestHeaders({ 'User-Agent': 'Wikster/1.0 (test)' });
agents.length = 0;
await titleCards([{ title: 'Backgammon' }], {});
check('the User-Agent is sent on every Wikipedia request', agents.length > 0 && agents.every((a) => a === 'Wikster/1.0 (test)'), JSON.stringify(agents));
setRequestHeaders({});

const db = seedLegacyCodes(createEconDb());
const ctxFor = (id, extra = {}) => ({ store: db.store(id), now: Date.now(), random: () => 0.42, later: () => {}, user: id, draw: (p, o) => drawArticles(p, o), titleCards, ...extra });
const call = (id, action, args = {}, extra) => run(ctxFor(id, extra), action, args);

const U = 'user-tree';
await call(U, 'import');
check('a new player starts with the card check done', db.users.get(U).state.cardFix === CARD_FIX);
await db.store(U).apply({ state: { cardFix: 0, codesRedeemed: { treetest: 1 } } });
check('a player who redeemed before the move has no definition yet', !db.users.get(U).state.codeDefs);
const plate = platePicture('#c8102e', 'Chess');
const at = Date.now() - 60000;
const broken = (title, extra = {}) => ({
  key: `special:treetest:wikipedia:en:${title}`, title, rarityId: 'special', price: 900, copies: 1, lang: 'en', packId: specId(codeSpec(greg)),
  data: { description: '', extract: title, thumbnail: plate, url: `https://en.wikipedia.org/wiki/${encodeURIComponent(title)}`, sourceId: 'wikipedia:en', sourceName: 'Wikipedia', views: null, popularity: 0.3, packName: 'Treetest', packIcon: 'gift', packAccent: '#c8102e', firstPulledAt: at, lastPulledAt: at, special: 'treetest', article: null, creator: false },
  ...extra
});
await db.store(U).apply({ add: [
  broken('Chess', { copies: 2, prints: { special: 2 } }),
  broken('Go (game)'),
  broken('Checkers'),
  broken('Backgammon'),
  broken('Linux [REDACTED]'),
  { key: 'special:creator:treetest', title: 'The Maker', rarityId: 'special', price: 0, copies: 1, lang: 'en', packId: specId(codeSpec(greg)), data: { special: 'treetest', creator: true, extract: 'Made up', sourceId: 'special', firstPulledAt: at, thumbnail: 'https://wikster.pages.dev/special/creator.jpg' } },
  { key: 'special:treetest:wikipedia:en:4242', title: 'Shogi', rarityId: 'special', price: 900, copies: 1, lang: 'en', data: { special: 'treetest', thumbnail: 'https://upload.wikimedia.org/shogi.jpg', extract: 'Shogi is fine already.' } },
  { key: 'en:Cat', title: 'Cat', rarityId: 'common', price: 10, copies: 1, lang: 'en', data: { thumbnail: 'https://upload.wikimedia.org/cat.jpg', extract: 'A cat.' } }
] });
await db.store(U).apply({ patch: [{ key: 'special:treetest:wikipedia:en:Backgammon', favorite: true }] });
const rows = () => [...db.users.get(U).cards.values()];
check('the stored placeholders are spotted', rows().filter((r) => brokenSpecial(r)).length === 6, rows().filter((r) => brokenSpecial(r)).map((r) => r.article_key).join(' '));
await new Promise((r) => setTimeout(r, 15));
const since = Date.now() - 5;
await new Promise((r) => setTimeout(r, 15));

script = always(503);
const failedSnap = await call(U, 'snapshot', { since });
check('while Wikipedia is down the snapshot still answers', failedSnap && typeof failedSnap.cards === 'object');
check('and the placeholders stay as they were, the photo fixed', rows().filter((r) => brokenSpecial(r)).length === 5 && db.users.get(U).state.cardFix !== CARD_FIX);
script = [];
const callsBefore = apiCalls.length;
await call(U, 'snapshot', { since });
check('a second launch right after a failure does not hammer Wikipedia', apiCalls.length === callsBefore);
forgetFixTries();

script = [500];
const snap = await call(U, 'snapshot', { since });
const renamed = snap.renamed ?? {};
check('the definition came back from the codes table', db.users.get(U).state.codeDefs?.treetest?.theme === 'elden');
check('the next load repairs the five cards', Object.keys(renamed).length === 5, JSON.stringify(renamed));
check('the old title keys are gone from the reply', Object.keys(renamed).every((k) => k.includes(':en:') && snap.cards[k] === null));
const fresh = Object.values(renamed).map((k) => snap.cards[k]);
check('and the page id keys arrive with real cards', fresh.every((e) => e && /^special:treetest:wikipedia:en:\d+$/.test(e.key) && e.extract.replace(/█/g, '').length > e.title.length + 20), JSON.stringify(fresh.map((e) => e?.key)));
check('the four games carry their picture', fresh.filter((e) => !/Linux/.test(e.title)).every((e) => String(e.thumbnail).startsWith('https://upload.wikimedia.org/')));
const arch = fresh.find((e) => /Linux/.test(e.title));
check('Linux keeps its name, its terminal and its redaction', arch && arch.title === 'Linux [REDACTED]' && decodeURIComponent(arch.thumbnail).includes('CLASSIFIED') && arch.extract.includes('█'));
const ds = rows().find((r) => r.data?.article === null && r.title === 'Chess' && /:\d+$/.test(r.article_key));
check('copies and prints move with the card', ds && ds.copies === 2 && ds.prints?.special === 2, JSON.stringify(ds));
const bb = rows().find((r) => r.title === 'Backgammon');
check('the favourite moves with the card', bb && bb.favorite === true && /:\d+$/.test(bb.article_key));
check('special, album pack and first pull date are kept', fresh.every((e) => e.special === 'treetest' && e.packId === specId(codeSpec(greg)) && e.firstPulledAt === at && e.rarityId === 'special'));
check('the price is kept', rows().filter((r) => /:\d+$/.test(r.article_key) && r.data?.special && r.title !== 'Shogi').every((r) => r.price === 900));
const creator = rows().find((r) => r.article_key === 'special:creator:treetest');
check('the maker card stored with the old site address now carries the bucket photo', creator?.data?.thumbnail === MAKER_PHOTO, creator?.data?.thumbnail);
check('the good cards are left alone', rows().some((r) => r.article_key === 'special:treetest:wikipedia:en:4242' && r.data.thumbnail === 'https://upload.wikimedia.org/shogi.jpg') && rows().some((r) => r.article_key === 'en:Cat'));
check('no placeholder is left', rows().every((r) => !brokenSpecial(r)));
check('the check is marked done', db.users.get(U).state.cardFix === CARD_FIX);
check('the totals did not move', rows().filter((r) => r.data?.special).length === 7);
const after = apiCalls.length;
const again = await call(U, 'snapshot', {});
check('a later load does not look again', apiCalls.length === after && !again.renamed && Object.keys(again.cards).length === 8);

const S = 'user-server-photos';
await call(S, 'import');
script = [];
await call(S, 'redeem', { code: 'TR33T3ST' });
const gregId = specId(codeSpec(greg));
const pull = await call(S, 'prepare', { specId: gregId });
const opened = await call(S, 'open', { nonce: pull.nonce });
const creatorPull = opened.pulls.find((p) => p.article.creator);
check('in server mode the maker card is dealt with its bucket picture', creatorPull?.article?.thumbnail === MAKER_PHOTO, creatorPull?.article?.thumbnail);
check('and stored with it', db.users.get(S).cards.get('special:creator:treetest')?.data?.thumbnail === MAKER_PHOTO);
await call(S, 'redeem', { code: 'S0L0T3ST' });
const solo = codeById('solotest');
const cp = await call(S, 'prepare', { specId: specId(codeSpec(solo)) });
await call(S, 'open', { nonce: cp.nonce });
check('the solo card too', db.users.get(S).cards.get('special:solotest')?.data?.thumbnail === SOLO_PHOTO, db.users.get(S).cards.get('special:solotest')?.data?.thumbnail);

script = always(503);
const W = 'user-wiki-down';
await call(W, 'import');
await call(W, 'redeem', { code: 'TR33T3ST' });
const refused = await call(W, 'prepare', { specId: gregId }).then(() => null, (e) => e);
check('a server fill while Wikipedia is down leaves the booster sealed', Boolean(refused) && db.users.get(W).inventory.get(gregId)?.count === 1 && ![...db.pulls.values()].some((p) => p.user === W));
script = [];

check('on the phone a photo stored with the old site address is shown from the bucket', withSpecialPhoto({ key: 'special:solotest', thumbnail: 'https://wikster.pages.dev/special/x.jpg' }).thumbnail === SOLO_PHOTO);

done();
