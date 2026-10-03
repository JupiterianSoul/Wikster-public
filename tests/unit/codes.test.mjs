import { check, done, fakeStorage } from './lib.mjs';
import { CROWN, FIRE, MAKER_PHOTO, ROTOR, SOLO, SOLO_PHOTO, TREE, defsOf } from '../lib/codefixtures.mjs';
import { readFileSync, readdirSync, existsSync } from 'node:fs';

fakeStorage();
const { useLanguageSource } = await import('../../src/i18n.js');
useLanguageSource(() => 'en');
const codes = await import('../../src/codedefs.js');
const { codeById, codeSpec, codeTitles, codeThemeOwned, codeFrameOwned, missingCodeDefs, opsecArt, redactText, skinOf, specialPhoto, withSpecialPhoto, useCodeSource, learnCodeDefs, cleanCodeDef } = codes;
const { THEMES } = await import('../../src/ui/themes.js');
const { BADGES, codeBadge, codeBadgeStates, badgeStateFromRank } = await import('../../src/badges.js');
const { FRAME_STYLES } = await import('../../src/frames.js');
const classic = await import('../../src/data/emblems-classic.js');
const next = await import('../../src/data/emblems-next.js');
const { styleForSpec } = await import('../../src/packstyle.js');
const { toDrawPack, specName, specBaseName } = await import('../../src/booster.js');
const { drawArticles } = await import('../../src/wiki/core.js');

check('the client holds no code list', !existsSync('src/codes.js') && !Object.keys(codes).some((k) => /SECRET|^CREATOR/.test(k)));
check('and no special photo', !existsSync('src/assets/special') && !existsSync('public/special'));
const shipped = readdirSync('src', { recursive: true }).filter((f) => /\.(js|css)$/.test(f)).map((f) => readFileSync(`src/${f}`, 'utf8')).join('\n');
check('no code theme or badge names a person', !/code: '[a-z0-9]+'/.test(readFileSync('src/ui/themes.js', 'utf8')) && !BADGES.some((b) => String(b.id).startsWith('special-')));
check('no special card skin is keyed by a code id', !/data-special="(?!creator|hellfire|laugh|lamassu|pixelheart|dice|wheel|openbook|pot|rotor|erdtree|algorithm)/.test(shipped));

check('an unknown code id has no definition', codeById('rotortest') === null);
let mine = defsOf(ROTOR, TREE);
useCodeSource(() => mine);
const entry = codeById('rotortest');
check('a definition comes from the player state', entry?.id === 'rotortest' && codeById('treetest')?.theme === 'elden');
check('six cards and the maker card', codeSpec(entry).cards === 7 && entry.cards.length === 6);
const theme = THEMES.find((t) => t.id === entry.theme);
check('the code theme stays a visual in the game', theme?.code === true && theme.backdrop.renderer === 'wankel');
check('the rotor emblem is in both sets', Boolean(classic.EMBLEMS.rotor && next.EMBLEMS.rotor));
const style = styleForSpec(codeSpec(entry));
check('the booster wears the rotor, its foil and its shapes', style.emblem.id === 'rotor' && style.foil.includes('repeating-conic-gradient') && style.particles.shapes.includes('rotor'));
check('the booster is named from the definition', specName(codeSpec(entry)) === 'Rotortest’s Test Booster' && specBaseName(codeSpec(entry)) === 'Rotortest');

const titles = codeTitles(entry, 'en');
check('the first five cards carry their own picture', titles.slice(0, 5).every((t, i) => t.image?.url === ROTOR.cards[i].image.url));
check('the fixture car keeps its own name', titles[0].name === 'The fixture car' && titles[0].title === 'Sports car');

let pageId = 100;
globalThis.fetch = async (url) => {
  const u = new URL(String(url));
  const json = (body) => ({ ok: true, status: 200, json: async () => body });
  if (u.pathname.includes('/rest_v1/page/summary/')) return json({ thumbnail: { source: 'https://upload.wikimedia.org/wikipedia/en/cover.webp' } });
  if (u.pathname.endsWith('/w/api.php')) {
    if (u.searchParams.get('generator') === 'images') return json({ query: { pages: {} } });
    const pages = {};
    for (const title of u.searchParams.get('titles').split('|')) {
      const id = pageId++;
      pages[id] = { pageid: id, title, extract: `${title} is an article long enough to be read on the face of a card, with several words in it.`, thumbnail: { source: 'https://upload.wikimedia.org/wrong.jpg', width: 640, height: 480 } };
    }
    return json({ query: { pages } });
  }
  return json({ items: [] });
};

const cards = await drawArticles(toDrawPack(codeSpec(entry)));
check('the draw deals seven cards', cards.length === 7, String(cards.length));
check('each of the five uses exactly its picture', cards.slice(0, 5).every((c, i) => c.thumbnail === ROTOR.cards[i].image.url), cards.map((c) => c.thumbnail).join(' '));
check('and credits it on the card', cards.slice(0, 5).every((c, i) => c.picture?.source === 'commons' && c.picture.credit === ROTOR.cards[i].image.credit));
check('every card is special to the code, the maker last with its photo', cards.every((c) => c.special === 'rotortest') && cards[6].creator === true && cards[6].thumbnail === MAKER_PHOTO && cards[6].key === 'special:creator:rotortest');
check('the drawn cards carry their skin', cards.slice(0, 6).every((c) => c.skin === 'rotor') && skinOf(cards[0]) === 'rotor' && skinOf(cards[6]) === 'creator');

const tree = codeById('treetest');
const treeTitles = codeTitles(tree, 'fr');
check('the four games take their picture from the English article', treeTitles.slice(0, 4).every((t) => t.pictureLang === 'en'));
check('Linux is classified', treeTitles[4].redact && typeof treeTitles[4].art === 'function' && treeTitles[4].name === 'Linux [REDACTED]');
const terminal = decodeURIComponent(opsecArt().replace('data:image/svg+xml,', ''));
check('its terminal art draws without a document', terminal.startsWith('<svg') && terminal.includes('CLASSIFIED'));
const hidden = redactText('Linux is a family of open source operating systems built around a kernel first released in 1991.');
check('the extract is partly redacted and still readable', hidden.includes('█') && hidden.startsWith('Linux'), hidden);

check('nothing is owned without being redeemed', !codeThemeOwned({ codeDefs: mine }, 'wankel'));
const st = { codeDefs: defsOf(ROTOR, FIRE, CROWN), codesRedeemed: { rotortest: 1, firetest: 1, crowntest: 1 } };
check('a redeemed definition owns its theme and its frame', codeThemeOwned(st, 'wankel') && codeThemeOwned(st, 'apotheosis') && codeFrameOwned(st, 'god') && codeFrameOwned(st, 'hellfire') && !codeThemeOwned(st, 'elden'));
check('code frames stay visuals in the game', FRAME_STYLES.filter((f) => f.code).map((f) => f.id).join() === 'god,hellfire');
const fire = codeBadge(FIRE);
check('the badge comes from the definition', fire.id === 'special-firetest' && fire.live === 'fire' && fire.name.en === 'Firetest’s Test Badge' && fire.look.motif === 'hellfire');
check('every redeemed code shows its badge', codeBadgeStates(st).map((s) => s.badge.id).sort().join() === 'special-crowntest,special-firetest,special-rotortest');
const seen = badgeStateFromRank('special-firetest', 1, fire.look);
check('a viewer draws the badge from its published look', seen?.badge.motif === 'hellfire' && seen.badge.live === 'fire' && seen.name === 'Firetest’s Test Badge');
check('a code badge without a look is not drawn', badgeStateFromRank('special-firetest', 1) === null && badgeStateFromRank('special-firetest', 1, { name: 'x', motif: 'nope', foil: ['#000000', '#000000', '#000000'] }) === null);

check('a player who redeemed before the move waits for the definitions', missingCodeDefs({ codesRedeemed: { rotortest: 1, lorna: 1, gone: 0 }, codeDefs: {} }).join() === 'rotortest');
check('a definition must have a clean id', cleanCodeDef({ id: 'Bad Id' }) === null && cleanCodeDef({ id: 'lorna' }) === null && cleanCodeDef(ROTOR) === ROTOR);

mine = defsOf(SOLO);
const solo = toDrawPack(codeSpec(codeById('solotest')));
check('the solo booster is its one card alone', codeSpec(SOLO).cards === 1 && solo.titles.length === 0 && solo.extra.length === 1 && solo.extra[0].key === 'special:solotest' && !solo.extra[0].creator && solo.extra[0].skin === 'algorithm');
check('with its photo from the bucket', solo.extra[0].thumbnail === SOLO_PHOTO);
check('a card stored with an old photo address gets the bucket one', withSpecialPhoto({ key: 'special:solotest', thumbnail: 'https://wikster.pages.dev/special/x.jpg' }).thumbnail === SOLO_PHOTO);
check('other cards are left alone', withSpecialPhoto({ key: 'en:Cat', thumbnail: null }).thumbnail === null);
mine = {};
check('a definition the server sent stays known for its cards', (learnCodeDefs(defsOf(ROTOR)), specialPhoto('special:creator:rotortest') === MAKER_PHOTO));

const realNavigator = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
Object.defineProperty(globalThis, 'navigator', { value: { onLine: false }, configurable: true });
globalThis.fetch = async () => { throw new Error('offline'); };
const offline = await drawArticles(toDrawPack(codeSpec(entry))).then(() => null, (error) => error);
check('offline, the draw is refused instead of dealing designed cards', Boolean(offline));
if (realNavigator) Object.defineProperty(globalThis, 'navigator', realNavigator);

done();
