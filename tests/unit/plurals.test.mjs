import { readFileSync } from 'node:fs';
import { check, done, fakeStorage } from './lib.mjs';

fakeStorage();
let lang = 'en';
const { useLanguageSource, loadLanguage, t, isSingular } = await import('../../src/i18n.js');
useLanguageSource(() => lang);

check('English: 1 is singular, 0 and 2 are not', isSingular(1, 'en') && !isSingular(0, 'en') && !isSingular(2, 'en'));
check('French: 0 and 1 are singular, 2 is not', isSingular(0, 'fr') && isSingular(1, 'fr') && !isSingular(2, 'fr'));
check('a count given as a string still counts', isSingular('1', 'en') && !isSingular('1,000', 'en') && !isSingular('1.2M', 'en'));

check('1 card, 0 cards, 5 cards', t('pcCards', { n: 1 }) === '1 card' && t('pcCards', { n: 0 }) === '0 cards' && t('pcCards', { n: 5 }) === '5 cards');
check('a noun after a count takes the count', t('albumsStarted', { n: 1 }) === 'album started' && t('albumsStarted', { n: 3 }) === 'albums started');
check('the opening summary', t('packSummary', { n: 1 }).startsWith('1 card ·') && t('packSummary', { n: 4 }).startsWith('4 cards ·'));
check('no (s) placeholders left', t('guildMembers', { n: 1 }) === '1 member' && t('guildMembers', { n: 2 }) === '2 members');
check('keys without a singular are untouched', t('youOwn', { n: 1 }) === 'You own 1');

lang = 'fr';
await loadLanguage();
check('French 1 carte, 0 carte, 2 cartes', t('pcCards', { n: 1 }) === '1 carte' && t('pcCards', { n: 0 }) === '0 carte' && t('pcCards', { n: 2 }) === '2 cartes');
check('French albums', t('albumsStarted', { n: 1 }) === 'album commencé' && t('albumsStarted', { n: 2 }) === 'albums commencés');
check('French days left', t('seasonDays', { n: 1 }) === '1 jour restant' && t('seasonDays', { n: 6 }) === '6 jours restants');

const en = readFileSync('src/i18n.js', 'utf8');
const fr = readFileSync('src/i18n-fr.js', 'utf8');
const loose = [...en.matchAll(/^ {4}(\w+): '([^']*\(s\)[^']*)'/gm), ...fr.matchAll(/^ {2}(\w+): '([^']*\((s|x|e)\)[^']*)'/gm)].map((m) => m[1]);
check('no string writes a plural as (s)', loose.length === 0, loose.join(', '));
const singles = [...en.matchAll(/^ {4}(\w+)_one:/gm)].map((m) => m[1]);
const orphans = singles.filter((k) => !new RegExp(`^ {4}${k}:`, 'm').test(en));
check('every singular has its plural', orphans.length === 0, orphans.join(', '));

done();
