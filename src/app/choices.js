import { tx } from '../i18n.js';
import { emblemSvg, monogramSvg } from '../data/emblems.js';
import { choice } from '../ui/dropdown.js';

export const option = (value, label, extra) => choice(value, label, extra);

export const rarityChoice = (r) => choice(r.id, tx(r.name), { dot: r.color });

export function albumArt(album) {
  const emblem = album.style?.emblem;
  return emblem?.kind === 'monogram' ? monogramSvg(emblem.letter, emblem.spin, { size: 20 }) : emblemSvg(emblem?.id ?? 'open', { size: 20 });
}

export const albumChoice = (album) => choice(album.key, album.name ?? album.key, { art: albumArt(album), accent: album.style?.accent, accent2: album.style?.accent2 });
