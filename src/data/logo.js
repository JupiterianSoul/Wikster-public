import { fan as LOGO } from './logos/fan.js';

export { LOGO };

let seq = 0;

export function logoMarkup({ size = 64, className = '', id = '', text = size >= 48, fixed = false, mono = false } = {}) {
  const colors = fixed && !mono ? LOGO.ground : {};
  const uid = id || `wk${(++seq).toString(36)}`;
  return `<svg class="logo-mark ${className}" viewBox="${LOGO.viewBox}" width="${size}" height="${size}"
    aria-hidden="true">${LOGO.markup({ id: uid, text, mono, ...colors })}</svg>`;
}

export function logoIntro({ className = 'intro-logo', id = 'il' } = {}) {
  const svg = (cls, body, extra = '') => `<svg class="${cls}" viewBox="${LOGO.viewBox}" preserveAspectRatio="xMidYMid meet" aria-hidden="true"${extra}>${body}</svg>`;
  if (!LOGO.layers) {
    return `<div class="${className}" role="img" aria-label="Wikster"><div class="il-layer il-front">${svg('il-svg', LOGO.markup({ id, text: true, ...LOGO.ground }))}</div></div>`;
  }
  const L = LOGO.layers({ id, ...LOGO.ground });
  const pct = (n) => `${Math.round(n * 10000) / 100}%`;
  const [fx, fy, fw, fh, rx, ry] = L.front;
  const style = [
    `--il-px:${pct(L.pivot[0])}`, `--il-py:${pct(L.pivot[1])}`, `--il-turn:${L.turn}deg`,
    `--il-fx:${pct(fx)}`, `--il-fy:${pct(fy)}`, `--il-fw:${pct(fw)}`, `--il-fh:${pct(fh)}`, `--il-rx:${pct(rx)}`, `--il-ry:${pct(ry)}`,
    `--il-w0:${pct(1 - L.glyph[0])}`, `--il-w1:${pct(1 - L.glyph[1])}`
  ].join(';');
  return `<div class="${className}" role="img" aria-label="Wikster" style="${style}">`
    + '<div class="il-ring"></div>'
    + `<div class="il-layer il-side il-l">${svg('il-svg', L.left)}</div>`
    + `<div class="il-layer il-side il-r">${svg('il-svg', L.right)}</div>`
    + `<div class="il-layer il-sketch">${svg('il-svg', L.outline)}</div>`
    + `<div class="il-layer il-front">${svg('il-svg', L.card)}</div>`
    + `<div class="il-layer il-wipe"><div class="il-layer il-wipe-in">${svg('il-svg', L.glyphMarkup)}</div></div>`
    + '<div class="il-shine"></div>'
    + '</div>';
}

export function logoFavicon() {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${LOGO.viewBox}">${LOGO.markup({ id: 'f', text: false, ...LOGO.ground })}</svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}
