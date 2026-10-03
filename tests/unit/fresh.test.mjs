import { check, done } from './lib.mjs';

const { useLanguageSource } = await import('../../src/i18n.js');
useLanguageSource(() => 'en');
const { freshlyVandalised, pageToCard } = await import('../../src/wiki/fetch.js');

const now = Date.parse('2026-09-29T12:00:00Z');
const rev = (minutes, extra = {}) => ({ revisions: [{ timestamp: new Date(now - minutes * 60000).toISOString(), user: 'Longtime editor', tags: [], ...extra }] });

check('an old edit is fine', !freshlyVandalised(rev(90, { anon: '' }), now));
check('a fresh edit by a regular editor is fine', !freshlyVandalised(rev(5), now));
check('a fresh anonymous edit is held back', freshlyVandalised(rev(5, { anon: '', user: '203.0.113.9' }), now));
check('a fresh IPv6 edit too', freshlyVandalised(rev(20, { user: '2001:db8::1' }), now));
check('a fresh temporary account edit too', freshlyVandalised(rev(20, { user: '~2026-31415-9' }), now));
check('a fresh page blanking by anyone', freshlyVandalised(rev(10, { tags: ['mw-blank'] }), now));
check('a page with no revision info passes', !freshlyVandalised({}, now));

const page = { pageid: 1, title: 'Otter', extract: 'The otter is a carnivorous mammal in the subfamily Lutrinae. There are 14 extant otter species.', thumbnail: { source: 'https://upload.wikimedia.org/o.jpg' } };
check('a normal page still becomes a card', Boolean(pageToCard(page, 1000)));
check('a freshly vandalised one does not', !pageToCard({ ...page, revisions: [{ timestamp: new Date().toISOString(), user: '198.51.100.4', anon: '' }] }, 1000));

done();
