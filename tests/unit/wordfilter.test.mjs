import { check, done } from './lib.mjs';
import { FILTER_SAMPLES } from '../lib/filtersamples.mjs';

const { screenText, normText } = await import('../../src/wordfilter.js');
const { FILTER_TERMS } = await import('../../src/data/filterterms.js');

check('every term is stored in the form the filter compares', FILTER_TERMS.every(([term]) => normText(term) === term));
check('no term is listed twice', new Set(FILTER_TERMS.map(([term]) => term)).size === FILTER_TERMS.length);
for (const [text, scope, want] of FILTER_SAMPLES) {
  const got = screenText(text, scope);
  check(`${scope}: "${text}" ${want ? `is refused as ${want}` : 'passes'}`, got === want, String(got));
}

done();
