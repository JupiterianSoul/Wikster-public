import { GOLD, GOLD_LIGHT, INNER, box, wStroke } from './shapes.js';

const CARD = 'M15 6H49A5 5 0 0 1 54 11V55A5 5 0 0 1 49 60H15A5 5 0 0 1 10 55V11A5 5 0 0 1 15 6Z';
const RIBBON = 'M38 1H48V27L43 22L38 27Z';
const LINES = 'M17 14H31M17 21H27';
const RIBBON_COLOR = '#fb7185';

const glyph = (text) => (text ? [17, 31, 30, 21, 6] : [15, 30, 34, 24, 7.5]);

export const folio = {
  id: 'folio',
  name: 'Folio',
  idea: 'A card kept like a book: a ribbon marks the page, a W is set into it. A card to collect and an article to read in one shape.',
  viewBox: '0 0 64 64',
  ground: { inner: '#4f46e5', outer: '#11122a' },
  markup({ id = 'wk', text = true, inner = INNER, mono = false } = {}) {
    const [x, y, w, h, s] = glyph(text);
    const clip = `${id}-wb`;
    if (mono) {
      return `<defs>${box(clip, x, y, w, h)}<mask id="${id}-m" maskUnits="userSpaceOnUse" x="0" y="0" width="64" height="64">`
        + `<path d="${CARD}" fill="#fff"/><path d="${RIBBON}" fill="#000" stroke="#000" stroke-width="5" stroke-linejoin="round"/><path d="${RIBBON}" fill="#fff"/>`
        + (text ? `<path d="${LINES}" stroke="#000" stroke-width="3" stroke-linecap="round"/>` : '')
        + `${wStroke(x, y, w, h, s, '#000', clip)}</mask></defs>`
        + `<rect width="64" height="64" fill="currentColor" mask="url(#${id}-m)"/>`;
    }
    return `<defs>${box(clip, x, y, w, h)}</defs>`
      + `<path d="${CARD}" fill="${inner}"/>`
      + `<path d="${RIBBON}" fill="${RIBBON_COLOR}"/>`
      + (text ? `<path d="${LINES}" stroke="${GOLD_LIGHT}" stroke-opacity=".75" stroke-width="3" stroke-linecap="round"/>` : '')
      + wStroke(x, y, w, h, s, GOLD, clip);
  }
};
