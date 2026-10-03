import { GOLD, INNER } from './shapes.js';

const GEM = '18,12 46,12 60,26 32,58 4,26';
const ZIG = '18,12 25,26 32,12 39,26 46,12';
const FACETS = [
  ['18,12 4,26 25,26', '#fff', 0.22],
  ['18,12 32,12 25,26', '#fff', 0.4],
  ['25,26 32,12 39,26', '#fff', 0.1],
  ['32,12 46,12 39,26', '#fff', 0.3],
  ['46,12 60,26 39,26', '#fff', 0],
  ['4,26 25,26 32,58', '#000', 0.18],
  ['25,26 39,26 32,58', '#fff', 0.06],
  ['39,26 60,26 32,58', '#000', 0.36]
];

export const facet = {
  id: 'facet',
  name: 'Facet',
  idea: 'A cut stone whose crown facets are the W. Rarity is the heart of a collection: the logo is the thing you hope to pull.',
  viewBox: '0 0 64 64',
  ground: { inner: '#6d5df6', outer: '#11122a' },
  markup({ id = 'wk', text = true, inner = INNER, mono = false } = {}) {
    const clip = `<clipPath id="${id}-gem"><polygon points="${GEM}"/></clipPath>`;
    const zig = (color, width) => `<g clip-path="url(#${id}-gem)"><polyline points="${ZIG}" fill="none" stroke="${color}" stroke-width="${width}" stroke-linejoin="miter" stroke-miterlimit="12"/></g>`;
    if (mono) {
      return `<defs>${clip}<mask id="${id}-m" maskUnits="userSpaceOnUse" x="0" y="0" width="64" height="64"><polygon points="${GEM}" fill="#fff"/>`
        + (text ? '<path d="M4 26H60M25 26L32 58M39 26L32 58" stroke="#000" stroke-width="1.4"/>' : '')
        + `${zig('#000', text ? 4 : 5)}</mask></defs>`
        + `<rect width="64" height="64" fill="currentColor" mask="url(#${id}-m)"/>`;
    }
    return `<defs>${clip}</defs><polygon points="${GEM}" fill="${inner}"/>`
      + FACETS.filter(([, , a]) => a > 0).map(([p, c, a]) => `<polygon points="${p}" fill="${c}" fill-opacity="${a}"/>`).join('')
      + zig(GOLD, text ? 4.5 : 5.5);
  }
};
