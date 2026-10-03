import { check, done } from './lib.mjs';
import * as classic from '../../src/data/emblems-classic.js';
import * as next from '../../src/data/emblems-next.js';
import * as live from '../../src/data/emblems.js';
import { THEME_PACKS } from '../../src/data/packs.js';
import { crest } from '../../src/data/logos/crest.js';
import { folio } from '../../src/data/logos/folio.js';
import { wikilink } from '../../src/data/logos/wikilink.js';
import { fan } from '../../src/data/logos/fan.js';
import { facet } from '../../src/data/logos/facet.js';
import { LOGO, logoFavicon, logoMarkup } from '../../src/data/logo.js';

const classicIds = Object.keys(classic.EMBLEMS).sort();
const nextIds = Object.keys(next.EMBLEMS).sort();
check('the new emblem set covers every id of the current one', classicIds.every((id) => nextIds.includes(id)), classicIds.filter((id) => !nextIds.includes(id)).join(','));
check('every theme pack has a new emblem', THEME_PACKS.every((p) => next.EMBLEMS[p.emblem ?? p.id]));
check('both sets export the same functions', ['emblemSvg', 'monogramSvg', 'monogramEmblem'].every((f) => typeof classic[f] === 'function' && typeof next[f] === 'function'));
check('the game uses the new emblem set', live.emblemSvg === next.emblemSvg);

const a = next.emblemSvg('cars');
const b = next.emblemSvg('cars');
const ids = (s) => [...s.matchAll(/id="([^"]+)"/g)].map((m) => m[1]);
check('two copies of one emblem never share gradient ids', ids(a).length > 0 && ids(a).every((id) => !ids(b).includes(id)));
check('a monogram keeps markup out of the letter', !next.monogramSvg('<', 0).includes('><<'));

for (const logo of [crest, folio, wikilink, fan, facet]) {
  const big = logo.markup({ id: 't', text: true });
  const small = logo.markup({ id: 't', text: false });
  check(`${logo.name}: draws at both detail levels`, big.length > 40 && small.length > 40 && /^[\d. -]+$/.test(logo.viewBox));
}
for (const logo of [folio, wikilink, fan, facet]) {
  check(`${logo.name}: has a one colour version`, logo.markup({ id: 'm', mono: true }).includes('currentColor'));
}
check('the game logo is the Hand', LOGO === fan);
check('the favicon is an svg data url', logoFavicon().startsWith('data:image/svg+xml,'));
check('logoMarkup draws the bolder W when small', logoMarkup({ size: 24 }).includes('stroke-width="5.5"') && logoMarkup({ size: 64 }).includes('stroke-width="4.5"'));
const one = logoMarkup({ size: 40 });
const two = logoMarkup({ size: 40 });
check('two logos on one page never share mask ids', ids(one).length > 0 && ids(one).every((id) => !ids(two).includes(id)));
check('the one colour logo has no fixed colours', !logoMarkup({ size: 40, mono: true, fixed: true }).includes(LOGO.ground.inner));

done();
