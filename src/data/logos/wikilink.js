import { GOLD, INNER, box, wStroke } from './shapes.js';

const DOUBLE = 'M9.5 6H4.5V58H9.5M19.5 6H14.5V58H19.5M54.5 6H59.5V58H54.5M44.5 6H49.5V58H44.5';
const SINGLE = 'M14 6H6V58H14M50 6H58V58H50';

export const wikilink = {
  id: 'wikilink',
  name: 'Wikilink',
  idea: 'Two square brackets are how every wiki writes a link: [[W]]. The mark is the link itself, the thing every card in the game comes from.',
  viewBox: '0 0 64 64',
  ground: { inner: '#6366f1', outer: '#11122a' },
  markup({ id = 'wk', text = true, inner = INNER, mono = false } = {}) {
    const clip = `${id}-wb`;
    const [x, y, w, h, s] = text ? [21.5, 21, 21, 22, 4.6] : [14.5, 18, 35, 28, 6.5];
    const brackets = text ? DOUBLE : SINGLE;
    const ink = mono ? 'currentColor' : inner;
    return `<defs>${box(clip, x, y, w, h)}</defs>`
      + `<path d="${brackets}" fill="none" stroke="${ink}" stroke-width="${text ? 4.4 : 6}" stroke-linejoin="miter"/>`
      + wStroke(x, y, w, h, s, mono ? 'currentColor' : GOLD, clip);
  }
};
