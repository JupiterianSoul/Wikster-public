export const GOLD = '#f2c35b';
export const GOLD_LIGHT = '#fff0b8';
export const INNER = 'var(--logo-inner, #4f46e5)';
export const OUTER = 'var(--logo-outer, #11122a)';

export function wPoints(x, y, w, h, dip = 0.1) {
  return `${x},${y} ${x + w * 0.25},${y + h} ${x + w * 0.5},${y + h * dip} ${x + w * 0.75},${y + h} ${x + w},${y}`;
}

export function wStroke(x, y, w, h, stroke, color, clip, dip) {
  return `<g clip-path="url(#${clip})"><polyline points="${wPoints(x, y, w, h, dip)}" fill="none" stroke="${color}" stroke-width="${stroke}" stroke-linejoin="miter" stroke-miterlimit="12"/></g>`;
}

export const box = (id, x, y, w, h) => `<clipPath id="${id}"><rect x="${x}" y="${y}" width="${w}" height="${h}"/></clipPath>`;
