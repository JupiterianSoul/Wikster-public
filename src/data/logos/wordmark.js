const STROKE = 7;
const GAP = 7;

const LETTERS = [
  ['W', 36, 'M3 0L10.5 40L18 14L25.5 40L33 0'],
  ['I', 7, 'M3.5 0V40'],
  ['K', 27, 'M3.5 0V40M26 0L6 22.5M12.5 15.5L27 40'],
  ['S', 28, 'M23.09 7.62A10.5 8.25 0 1 0 14 20A10.5 8.25 0 1 1 4.91 32.38'],
  ['T', 28, 'M0 3.5H28M14 3.5V40'],
  ['E', 24, 'M24 3.5H3.5V36.5H24M3.5 20H20'],
  ['R', 27, 'M3.5 40V3.5H14A8.25 8.25 0 0 1 14 20H3.5M13 20L26 40']
];

export const WORDMARK_HEIGHT = 40;
export const WORDMARK_WIDTH = LETTERS.reduce((sum, [, w]) => sum + w, 0) + GAP * (LETTERS.length - 1);

export function wordmarkMarkup({ id = 'wm', color = 'currentColor' } = {}) {
  let x = 0;
  const paths = LETTERS.map(([, w, d]) => {
    const g = `<path transform="translate(${x} 0)" d="${d}"/>`;
    x += w + GAP;
    return g;
  }).join('');
  return `<defs><clipPath id="${id}-c"><rect x="-4" y="0" width="${WORDMARK_WIDTH + 8}" height="${WORDMARK_HEIGHT}"/></clipPath></defs>`
    + `<g clip-path="url(#${id}-c)" fill="none" stroke="${color}" stroke-width="${STROKE}" stroke-linejoin="miter" stroke-miterlimit="12">${paths}</g>`;
}
