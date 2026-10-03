import { box, wStroke } from './shapes.js';

const SIDE = '#c9ccd6';
const FRONT_FILL = '#ffffff';
const INK = '#0b0c12';

export const FAN = {
  front: { x: 19, y: 13, w: 26, h: 41, r: 4 },
  turn: 20,
  pivot: [32, 50],
  lift: 6,
  gap: 3.5,
  glyph: { big: [23, 26, 18, 17, 4.5], small: [22, 23, 20, 20, 5.5] }
};
const FRONT = FAN.front;
const card = (extra = '') => `<rect x="${FRONT.x}" y="${FRONT.y}" width="${FRONT.w}" height="${FRONT.h}" rx="${FRONT.r}" ${extra}/>`;
const turned = (deg, extra) => `<g transform="rotate(${deg} ${FAN.pivot.join(' ')}) translate(0 -${FAN.lift})">${card(extra)}</g>`;

export const fan = {
  id: 'fan',
  name: 'Hand',
  idea: 'Three cards held as a hand, the front one marked W. The plainest picture of collecting, and it still reads at sixteen pixels.',
  viewBox: '0 0 64 64',
  ground: { inner: SIDE, outer: INK },
  layers({ id = 'wk', inner = SIDE, outer = INK } = {}) {
    const [x, y, w, h, s] = FAN.glyph.big;
    const gap = (side) => `<defs><mask id="${id}-${side}" maskUnits="userSpaceOnUse" x="0" y="0" width="64" height="64"><rect width="64" height="64" fill="#fff"/>${card(`fill="#000" stroke="#000" stroke-width="${FAN.gap * 2}"`)}</mask></defs>`;
    return {
      pivot: [FAN.pivot[0] / 64, FAN.pivot[1] / 64],
      turn: FAN.turn,
      front: [FRONT.x / 64, FRONT.y / 64, FRONT.w / 64, FRONT.h / 64, FRONT.r / FRONT.w, FRONT.r / FRONT.h],
      glyph: [(x - 1.5) / 64, (x + w + 0.5) / 64],
      left: `${gap('l')}<g mask="url(#${id}-l)">${turned(-FAN.turn, `fill="${inner}"`)}</g>`,
      right: `${gap('r')}<g mask="url(#${id}-r)">${turned(FAN.turn, `fill="${inner}"`)}${turned(FAN.turn, 'fill="#fff" fill-opacity=".18"')}</g>`,
      outline: card('fill="none" stroke="currentColor" stroke-width="1.4"'),
      card: card(`fill="${FRONT_FILL}"`) + card('fill="none" stroke="currentColor" stroke-opacity=".22" stroke-width=".6"'),
      glyphMarkup: `<defs>${box(`${id}-wb`, x, y, w, h)}</defs>${wStroke(x, y, w, h, s, outer, `${id}-wb`)}`
    };
  },
  markup({ id = 'wk', text = true, inner = SIDE, outer = INK, mono = false } = {}) {
    const clip = `${id}-wb`;
    const [x, y, w, h, s] = text ? FAN.glyph.big : FAN.glyph.small;
    const gap = `<mask id="${id}-g" maskUnits="userSpaceOnUse" x="0" y="0" width="64" height="64"><rect width="64" height="64" fill="#fff"/>${card(`fill="#000" stroke="#000" stroke-width="${FAN.gap * 2}"`)}</mask>`;
    if (mono) {
      return `<defs>${box(clip, x, y, w, h)}${gap}<mask id="${id}-w" maskUnits="userSpaceOnUse" x="0" y="0" width="64" height="64">${card('fill="#fff"')}${wStroke(x, y, w, h, s, '#000', clip)}</mask></defs>`
        + `<g fill="currentColor" mask="url(#${id}-g)">${turned(-FAN.turn, '')}${turned(FAN.turn, '')}</g>`
        + `<rect width="64" height="64" fill="currentColor" mask="url(#${id}-w)"/>`;
    }
    return `<defs>${box(clip, x, y, w, h)}${gap}</defs>`
      + `<g mask="url(#${id}-g)">${turned(-FAN.turn, `fill="${inner}"`)}${turned(FAN.turn, `fill="${inner}"`)}${turned(FAN.turn, 'fill="#fff" fill-opacity=".18"')}</g>`
      + card(`fill="${FRONT_FILL}"`)
      + wStroke(x, y, w, h, s, outer, clip);
  }
};
