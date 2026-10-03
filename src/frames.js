import { FRAME_PRICE, FRAME_PRICE_EPIC, FRAME_PRICE_LEGENDARY } from './ink.js';

export const FRAME_GRADES = [
  { id: 'classic',   color: '#b8c2d4', name: { en: 'Classic',   fr: 'Classique' } },
  { id: 'rare',      color: '#5fb4ff', name: { en: 'Rare',      fr: 'Rare' } },
  { id: 'epic',      color: '#b98bff', name: { en: 'Epic',      fr: 'Épique' } },
  { id: 'legendary', color: '#ffc44d', name: { en: 'Legendary', fr: 'Légendaire' } },
  { id: 'mythic',    color: '#ff7ac0', name: { en: 'Mythic',    fr: 'Mythique' } },
  { id: 'exclusive', color: '#ff8a5c', name: { en: 'Exclusive', fr: 'Exclusif' } }
];

export const FRAME_STYLES = [
  { id: 'metal',   minLevel: 1,   grade: 'classic',   name: { en: 'Metal Ages',    fr: 'Âges du métal' } },
  { id: 'circuit', minLevel: 15,  grade: 'rare',      name: { en: 'Neon Circuit',  fr: 'Circuit néon' } },
  { id: 'orbit',   minLevel: 35,  grade: 'rare',      name: { en: 'Cosmic Orbit',  fr: 'Orbite cosmique' } },
  { id: 'crest',   minLevel: 60,  grade: 'epic',      name: { en: 'Foil Crest',    fr: 'Blason métallisé' } },
  { id: 'crystal', minLevel: 90,  grade: 'epic',      name: { en: 'Crystal Bloom', fr: 'Floraison de cristal' } },
  { id: 'aurora',  minLevel: 125, grade: 'legendary', name: { en: 'Aurora Veil',   fr: 'Voile aurore' } },
  { id: 'runic',   minLevel: 160, grade: 'legendary', name: { en: 'Runic Seal',    fr: 'Sceau runique' } },
  { id: 'solar',   minLevel: 200, grade: 'legendary', name: { en: 'Solar Crown',   fr: 'Couronne solaire' } },
  { id: 'singularity', minLevel: 500, grade: 'mythic', name: { en: 'Singularity', fr: 'Singularité' } },
  { id: 'god',     minLevel: Infinity, code: true, grade: 'exclusive',
    name: { en: 'Apotheosis', fr: 'Apothéose' } },
  { id: 'hellfire', minLevel: Infinity, code: true, grade: 'exclusive',
    name: { en: 'Hellfire', fr: 'Feu de l’enfer' } },
  { id: 'ivy',      minLevel: 1, ink: true, grade: 'rare', price: FRAME_PRICE, name: { en: 'Living Ivy',     fr: 'Lierre vivant' } },
  { id: 'gears',    minLevel: 1, ink: true, grade: 'rare', price: FRAME_PRICE, name: { en: 'Clockwork',      fr: 'Horlogerie' } },
  { id: 'tide',     minLevel: 1, ink: true, grade: 'rare', price: FRAME_PRICE, name: { en: 'Tidewater',      fr: 'Marée' } },
  { id: 'storm',    minLevel: 1, ink: true, grade: 'rare', price: FRAME_PRICE, name: { en: 'Stormcell',      fr: 'Cellule orageuse' } },
  { id: 'honey',    minLevel: 1, ink: true, grade: 'rare', price: FRAME_PRICE, name: { en: 'Honeycomb',      fr: 'Rayon de miel' } },
  { id: 'inkwell',  minLevel: 1, ink: true, grade: 'rare', price: FRAME_PRICE, name: { en: 'Inkwell',        fr: 'Encrier' } },
  { id: 'origami',  minLevel: 1, ink: true, grade: 'rare', price: FRAME_PRICE, name: { en: 'Paper Fold',     fr: 'Pli de papier' } },
  { id: 'lanterns', minLevel: 1, ink: true, grade: 'rare', price: FRAME_PRICE, name: { en: 'Paper Lanterns', fr: 'Lanternes de papier' } },
  { id: 'stained',  minLevel: 1, ink: true, grade: 'rare', price: FRAME_PRICE, name: { en: 'Stained Glass',  fr: 'Vitrail' } },
  { id: 'comet',    minLevel: 1, ink: true, grade: 'rare', price: FRAME_PRICE, name: { en: 'Comet Trail',    fr: 'Traînée de comète' } },
  { id: 'sakura',   minLevel: 1, ink: true, grade: 'epic', price: FRAME_PRICE_EPIC, name: { en: 'Sakura Moon', fr: 'Lune de sakura' } },
  { id: 'ouroboros', minLevel: 1, ink: true, grade: 'epic', price: FRAME_PRICE_EPIC, name: { en: 'Ouroboros', fr: 'Ouroboros' } },
  { id: 'phoenix',  minLevel: 1, ink: true, grade: 'legendary', price: FRAME_PRICE_LEGENDARY, name: { en: 'Phoenix Plume', fr: 'Plume du phénix' } },
  { id: 'astral',   minLevel: 1, ink: true, grade: 'legendary', price: FRAME_PRICE_LEGENDARY, name: { en: 'Astral Crown', fr: 'Couronne astrale' } }
];

export const INK_FRAMES = FRAME_STYLES.filter((s) => s.ink);

export const inkFramePrice = (id) => INK_FRAMES.find((f) => f.id === id)?.price ?? null;
export const frameGrade = (style) => FRAME_GRADES.find((g) => g.id === style?.grade) ?? FRAME_GRADES[0];

export const frameUnlocked = (style, level) => (Number(level) || 1) >= (style?.minLevel ?? 1);
export const DEFAULT_FRAME_STYLE = 'metal';
export const frameStyleById = (id) =>
  FRAME_STYLES.find((s) => s.id === id) ?? FRAME_STYLES[0];

export const frameTier = (level) =>
  Math.max(1, Math.min(50, Math.floor((Number(level) || 1) / 10)));

export const FRAME_SEAT = 29.6;
export const FRAME_REACH = 57;

const D = Math.PI / 180;
const n2 = (v) => Math.round(v * 100) / 100;
const xy = (r, a) => [n2(r * Math.cos(a * D)), n2(r * Math.sin(a * D))];
const P = (r, a) => xy(r, a).join(' ');
const jit = (i, salt = 0) => (((i + 1) * 73 + salt * 131) % 97) / 97;
const stageOf = (t) => (t < 4 ? 0 : t < 9 ? 1 : t < 19 ? 2 : t < 34 ? 3 : 4);
const KEY = '#0a0714';

const stopList = (list) => list.map(([o, c, a]) => `<stop offset="${o}" stop-color="${c}"${a == null ? '' : ` stop-opacity="${a}"`}/>`).join('');
const lin = (id, list, x1 = 0, y1 = -40, x2 = 0, y2 = 40) =>
  `<linearGradient id="${id}" gradientUnits="userSpaceOnUse" x1="${n2(x1)}" y1="${n2(y1)}" x2="${n2(x2)}" y2="${n2(y2)}">${stopList(list)}</linearGradient>`;
const radial = (id, list, r = 52, cx = 0, cy = 0) =>
  `<radialGradient id="${id}" gradientUnits="userSpaceOnUse" cx="${cx}" cy="${cy}" r="${r}">${stopList(list)}</radialGradient>`;
const bb = (id, list, x1 = 0, y1 = 1, x2 = 0, y2 = 0) =>
  `<linearGradient id="${id}" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}">${stopList(list)}</linearGradient>`;
const boxRadial = (id, list) => `<radialGradient id="${id}" cx=".4" cy=".35" r=".7">${stopList(list)}</radialGradient>`;
const defs = (...d) => `<defs>${d.join('')}</defs>`;
const ring = (r, stroke, w, extra = '') => `<circle r="${n2(r)}" fill="none" stroke="${stroke}" stroke-width="${n2(w)}"${extra ? ` ${extra}` : ''}/>`;
const arc = (r, a0, a1) => `M${P(r, a0)}A${n2(r)} ${n2(r)} 0 ${a1 - a0 > 180 ? 1 : 0} 1 ${P(r, a1)}`;
const arcLine = (r, a0, a1, stroke, w, extra = '') => `<path d="${arc(r, a0, a1)}" fill="none" stroke="${stroke}" stroke-width="${n2(w)}"${extra ? ` ${extra}` : ''}/>`;
const poly = (pts) => `M${pts.join('L')}Z`;
const at = (r, a, body, spin = 0) => `<g transform="translate(${P(r, a)}) rotate(${n2(a + 90 + spin)})">${body}</g>`;
const spot = (x, y, body) => `<g transform="translate(${n2(x)} ${n2(y)})">${body}</g>`;
const fine = (body) => `<g class="fr-fine">${body}</g>`;
const CRESCENT = 'M0 -4A4 4 0 0 0 0 4A5 5 0 0 1 0 -4Z';
const dot = (x, y, r, fill, extra = '') => `<circle cx="${n2(x)}" cy="${n2(y)}" r="${n2(r)}" fill="${fill}"${extra ? ` ${extra}` : ''}/>`;

const spark = (x, y, s, fill, extra = '') =>
  `<path d="M${n2(x)} ${n2(y - s)}Q${n2(x)} ${n2(y)} ${n2(x + s)} ${n2(y)}Q${n2(x)} ${n2(y)} ${n2(x)} ${n2(y + s)}Q${n2(x)} ${n2(y)} ${n2(x - s)} ${n2(y)}Q${n2(x)} ${n2(y)} ${n2(x)} ${n2(y - s)}Z" fill="${fill}"${extra ? ` ${extra}` : ''}/>`;
const sparkAt = (r, a, s, fill, extra = '') => { const [x, y] = xy(r, a); return spark(x, y, s, fill, extra); };

const gem = (x, y, r, color) => spot(x, y,
  `<circle r="${n2(r + 0.7)}" fill="${KEY}" fill-opacity=".55"/><circle r="${n2(r)}" fill="${color}"/>`
  + `<path d="M${n2(-r * 0.74)} ${n2(-r * 0.06)}L0 ${n2(-r * 0.8)}L${n2(r * 0.74)} ${n2(-r * 0.06)}Z" fill="#fff" fill-opacity=".42"/>`
  + `<path d="M${n2(-r * 0.74)} ${n2(-r * 0.06)}L${n2(r * 0.74)} ${n2(-r * 0.06)}L0 ${n2(r * 0.88)}Z" fill="#000" fill-opacity=".24"/>`
  + `<circle cx="${n2(-r * 0.3)}" cy="${n2(-r * 0.42)}" r="${n2(Math.max(r * 0.2, 0.35))}" fill="#fff" fill-opacity=".92"/>`);
const gemAt = (r, a, size, color) => { const [x, y] = xy(r, a); return gem(x, y, size, color); };

function band(u, r, w, [hi, mid, lo], { casing = 0.55 } = {}) {
  return defs(lin(`${u}bv`, [[0, hi], [0.48, mid], [1, lo]], -r * 0.45, -r, r * 0.45, r), lin(`${u}bi`, [[0, lo], [1, hi]], 0, -r, 0, r))
    + ring(r, KEY, w + 1.3, `stroke-opacity="${casing}"`)
    + ring(r, `url(#${u}bv)`, w)
    + ring(r - w / 2 + 0.38, `url(#${u}bi)`, 0.75)
    + ring(r + w / 2 - 0.36, hi, 0.6, 'stroke-opacity=".55"');
}

function glint(u, r, w, color = '#ffffff', span = 46, strength = 0.85, start = -128, tag = 'gl') {
  const [x1, y1] = xy(r, start), [x2, y2] = xy(r, start + span);
  return defs(lin(`${u}${tag}`, [[0, color, 0], [0.5, color, strength], [1, color, 0]], x1, y1, x2, y2))
    + `<path d="${arc(r, start, start + span)}" fill="none" stroke="url(#${u}${tag})" stroke-width="${n2(w)}" stroke-linecap="round"/>`;
}

const glow = (u, color, inner = 0.6, peak = 0.78, strength = 0.4, r = 54, tag = 'gw') =>
  defs(radial(`${u}${tag}`, [[0, color, 0], [inner, color, 0], [peak, color, strength], [1, color, 0]], r))
  + `<circle class="fr-fine" r="${r}" fill="url(#${u}${tag})"/>`;

const L = (cls, body, opts = {}) => ({ cls, body, ...opts });
const tint = (base, share = 40) => `color-mix(in srgb, var(--ink, #ffffff) ${share}%, ${base})`;

const METAL_TONES = [
  ['#ffd9a8', '#c0813f', '#5a3013', '#e5484f'],
  ['#ffd2b6', '#c86b3d', '#5b2410', '#36b39f'],
  ['#eceff3', '#8a929e', '#2f343c', '#e5484f'],
  ['#f6f9fd', '#a6b2c2', '#3b4554', '#4f8cff'],
  ['#ffffff', '#cbd3de', '#59616f', '#8a63ff'],
  ['#fff3c2', '#e2ab33', '#71470a', '#e0304a'],
  ['#ffe8de', '#d9917f', '#6e3428', '#33bf8a'],
  ['#ffffff', '#d7e3ea', '#62737f', '#4fc3ff'],
  ['#c4b5ff', '#433d5c', '#0e0b19', '#b48cff'],
  ['#f0fffd', '#8adbd1', '#1f605b', '#ffffff']
];

function drawMetal(t, s, u) {
  const [hi, mid, lo, stone] = METAL_TONES[Math.min(Math.floor(t / 5), 9)];
  let base = band(u, 33.2, 4.6, [hi, mid, lo]);
  base += ring(33.2, lo, 0.5, 'stroke-opacity=".5"') + ring(33.75, hi, 0.4, 'stroke-opacity=".45"');
  base += ring(37.7, KEY, 2.1, 'stroke-opacity=".4"') + ring(37.7, `url(#${u}bv)`, 1.1);
  if (s >= 1) {
    base += Array.from({ length: 8 }, (_, i) => {
      const [x, y] = xy(33.2, 22.5 + i * 45);
      return dot(x, y, 1.25, `url(#${u}bv)`, `stroke="${lo}" stroke-width=".45"`) + dot(x - 0.35, y - 0.4, 0.42, '#fff', 'fill-opacity=".8"');
    }).join('');
  }
  if (s >= 3) base += fine(Array.from({ length: 48 }, (_, i) => `<path d="M${P(38.6, i * 7.5)}L${P(40, i * 7.5)}" stroke="${mid}" stroke-width=".7"/>`).join(''));
  if (s >= 3) base += [0, 180].map((a) => spot(...xy(33.2, a), `<circle r="3" fill="url(#${u}bv)" stroke="${KEY}" stroke-opacity=".6" stroke-width=".6"/>`) + gemAt(33.2, a, 1.9, stone)).join('');
  if (s >= 2) {
    base += `<path d="M-5.6 -36.4L0 -42.6L5.6 -36.4L0 -33.6Z" fill="url(#${u}bv)" stroke="${KEY}" stroke-opacity=".6" stroke-width=".6"/>`;
    base += gem(0, -35.4, s >= 4 ? 3 : 2.5, s >= 4 ? '#dff6ff' : stone);
  }
  if (s >= 4) {
    base += ring(43, mid, 0.9, 'stroke-opacity=".75"') + [45, 135, 225, 315].map((a) => {
      const [x, y] = xy(43, a);
      return `<path d="M${n2(x)} ${n2(y - 2.4)}L${n2(x + 1.6)} ${n2(y)}L${n2(x)} ${n2(y + 2.4)}L${n2(x - 1.6)} ${n2(y)}Z" fill="${hi}" stroke="${lo}" stroke-width=".5"/>`;
    }).join('');
  }
  const layers = s >= 3 ? [L('fr-spin', glint(u, 33.2, 4, '#ffffff', 40, 0.7), { dur: 9 })] : [];
  return { base, layers };
}

const NEON = ['#38d6ff', '#4cf0c8', '#a98bff', '#ff5fd2', '#ffd45f'];

function drawCircuit(t, s, u) {
  const neon = NEON[s];
  const oct = (R) => Array.from({ length: 8 }, (_, i) => P(R, 22.5 + i * 45));
  const hole = `M${P(30.4, 0)}A30.4 30.4 0 1 0 ${P(30.4, 180)}A30.4 30.4 0 1 0 ${P(30.4, 0)}Z`;
  let base = defs(lin(`${u}pcb`, [[0, '#2a3870'], [1, '#090e24']]));
  base += `<path d="${poly(oct(38.4))} ${hole}" fill-rule="evenodd" fill="url(#${u}pcb)" stroke="${KEY}" stroke-opacity=".75" stroke-width="1.2" stroke-linejoin="round"/>`;
  base += `<path d="${poly(oct(36.9))}" fill="none" stroke="${neon}" stroke-width=".65" stroke-opacity=".5" stroke-linejoin="round"/>`;
  base += ring(31.7, neon, 2.8, 'stroke-opacity=".16"') + ring(31.7, neon, 0.8);
  const lit = s === 0 ? 4 : 8;
  base += Array.from({ length: 8 }, (_, i) => {
    const a = 22.5 + i * 45;
    const on = s === 0 ? i % 2 === 0 : i < lit;
    const c = on ? neon : '#33437d';
    const bend = a + (i % 2 ? 7 : -7);
    return `<path d="M${P(32.2, a)}L${P(34.4, a)}L${P(35.4, bend)}" fill="none" stroke="${c}" stroke-width=".8" stroke-linecap="round" stroke-linejoin="round"/>`
      + dot(...xy(35.4, bend), 1.1, '#0a0f26', `stroke="${c}" stroke-width=".65"`)
      + (on ? dot(...xy(35.4, bend), 2.4, neon, 'fill-opacity=".18"') : '');
  }).join('');
  if (s >= 1) base += fine([0, 45, 90, 135, 180, 225, 270, 315].map((a) => at(33.9, a, `<rect x="-1.6" y="-0.8" width="3.2" height="1.6" rx=".3" fill="#121a3c" stroke="${neon}" stroke-opacity=".6" stroke-width=".35"/>`)).join(''));
  if (s >= 3) {
    base += `<rect x="-5.2" y="-41.6" width="10.4" height="5" rx="1" fill="#0b1130" stroke="${neon}" stroke-width=".7"/>`
      + Array.from({ length: 5 }, (_, i) => `<path d="M${n2(-3.6 + i * 1.8)} -41.6v-1.4M${n2(-3.6 + i * 1.8)} -36.6v1" stroke="${neon}" stroke-width=".45"/>`).join('')
      + dot(0, -39.1, 1.1, neon) + dot(0, -39.1, 2.6, neon, 'fill-opacity=".25"');
  }
  if (s >= 4) base += fine(`<path d="${poly(oct(42.4))}" fill="none" stroke="${neon}" stroke-width=".55" stroke-opacity=".55" stroke-dasharray="2 2.6" stroke-linejoin="round"/>`);
  const pulse = glint(u, 31.7, 2, neon, 70, 1, -160) + dot(...xy(31.7, -90), 1.3, '#ffffff');
  const layers = [L('fr-spin', pulse, { dur: 5 })];
  if (s >= 2) layers.push(L('fr-spin is-rev', glint(u, 31.7, 1.6, '#ffffff', 40, 0.8, 20, 'g2'), { dur: 8 }));
  return { base, layers };
}

const ORBIT_TONES = [['#9fbcff', '#ffcf7a'], ['#9be7ff', '#ff9e7a'], ['#c8acff', '#7affd4'], ['#ffb8e8', '#ffe17a'], ['#fff1c2', '#a6d0ff']];

function drawOrbit(t, s, u) {
  const [line, warm] = ORBIT_TONES[s];
  const orbits = [[44.5, 34, -28], [43, 35.2, 34], [41.6, 36.2, 90]].slice(0, s >= 3 ? 3 : s >= 1 ? 2 : 1);
  const half = ([rx, ry, rot], front) =>
    `<path d="M${front ? rx : -rx} 0A${rx} ${ry} 0 0 1 ${front ? -rx : rx} 0" transform="rotate(${rot})" fill="none" stroke="url(#${u}ol)" stroke-width="1.5" stroke-linecap="round"${front ? '' : ' stroke-opacity=".55"'}/>`;
  let base = defs(lin(`${u}ol`, [[0, line, 0.35], [0.5, '#ffffff'], [1, line, 0.35]], -46, -20, 46, 20),
    boxRadial(`${u}pl`, [[0, '#ffffff'], [0.35, warm], [1, '#3a1d5c']]),
    boxRadial(`${u}mn`, [[0, '#ffffff'], [0.5, line], [1, '#1b2350']]));
  if (s >= 4) base += glow(u, '#8a5fd0', 0.6, 0.78, 0.35, 50);
  if (s >= 2) base += fine(Array.from({ length: 14 }, (_, i) => sparkAt(46 + jit(i, 3) * 8, i * 360 / 14 + jit(i, 5) * 20, 0.7 + jit(i, 7) * 0.9, i % 3 ? line : '#ffffff')).join(''));
  base += orbits.map((o) => half(o, false)).join('');
  base += band(u, 32.6, 3.2, ['#b3bdff', '#3b408f', '#11122e']);
  base += fine(Array.from({ length: 10 }, (_, i) => dot(...xy(32.6, i * 36 + 9), 0.35, '#e8ecff', 'fill-opacity=".8"')).join(''));
  base += orbits.map((o) => half(o, true)).join('');
  const planetAt = ([rx, ry, rot], th) => {
    const x = rx * Math.cos(th * D), y = ry * Math.sin(th * D);
    const c = Math.cos(rot * D), sn = Math.sin(rot * D);
    return [x * c - y * sn, x * sn + y * c];
  };
  const [px, py] = planetAt(orbits[0], 140);
  base += dot(px, py, 4.4, KEY, 'fill-opacity=".5"') + dot(px, py, 3.8, `url(#${u}pl)`);
  if (orbits[1]) { const [mx, my] = planetAt(orbits[1], 30); base += dot(mx, my, 2, KEY, 'fill-opacity=".5"') + dot(mx, my, 1.6, `url(#${u}mn)`); }
  if (s >= 3) {
    base += spot(31, -36, `<circle r="3.2" fill="url(#${u}mn)"/><ellipse rx="6" ry="1.5" fill="none" stroke="${warm}" stroke-width=".8" transform="rotate(-24)"/>`);
  }
  const moon = ring(40.6, line, 0.5, 'stroke-opacity=".35" stroke-dasharray="1 3"') + dot(...xy(40.6, -40), 2.2, KEY, 'fill-opacity=".45"') + dot(...xy(40.6, -40), 1.7, `url(#${u}mn)`)
    + (s >= 4 ? dot(...xy(40.6, 140), 1.3, '#ffffff') : '');
  return { base, layers: [L('fr-spin', moon, { dur: 18 })] };
}

const FOILS = [
  ['#fff4c4', '#e6b33c', '#7b4d0b'], ['#fff4c4', '#e6b33c', '#7b4d0b'], ['#ffffff', '#c3ccda', '#596273'],
  ['#e9fbff', '#d6a8ff', '#6a3a9c'], ['#ffffff', '#ffd27a', '#9a4f10']
];

function feather(len, w, curl = 0.5) {
  return `M${n2(-w / 2)} 0C${n2(-w * 0.8)} ${n2(-len * 0.45)} ${n2(-w * 0.2 + curl)} ${n2(-len * 0.85)} ${n2(curl)} ${n2(-len)}C${n2(w * 0.35 + curl)} ${n2(-len * 0.75)} ${n2(w * 0.7)} ${n2(-len * 0.4)} ${n2(w / 2)} 0Z`;
}

function drawCrest(t, s, u) {
  const [hi, mid, lo] = FOILS[s];
  let base = defs(lin(`${u}fo`, [[0, hi], [0.5, mid], [1, lo]], -30, -46, 30, 30), bb(`${u}fb`, [[0, lo], [0.45, mid], [1, hi]]));
  if (s >= 4) base += fine(Array.from({ length: 11 }, (_, i) => `<path d="M${P(38, -150 + i * 12)}L${P(51, -150 + i * 12)}" stroke="${mid}" stroke-width=".7" stroke-opacity=".55"/>`).join(''));
  const n = [3, 4, 5, 5, 6][s];
  const wing = Array.from({ length: n }, (_, k) => n - 1 - k).map((k) => {
    const b = 6 - k * 10;
    const len = 9.5 + k * 1.7;
    return at(33.6, b, `<path d="${feather(len, 3.4, 0.8)}" fill="url(#${u}fb)" stroke="${KEY}" stroke-opacity=".6" stroke-width=".55"/><path d="M0 -.5L.5 ${n2(-len * 0.8)}" stroke="${lo}" stroke-width=".45" stroke-opacity=".7"/>`, 52 + k * 2);
  }).join('');
  base += `<g>${wing}</g><g transform="scale(-1 1)">${wing}</g>`;
  if (s >= 1) {
    base += `<path d="${arc(39, 58, 122)}" fill="none" stroke="${KEY}" stroke-opacity=".6" stroke-width="5.6"/>`
      + `<path d="${arc(39, 58, 122)}" fill="none" stroke="url(#${u}fo)" stroke-width="4.4"/>`
      + `<path d="${arc(39, 60, 120)}" fill="none" stroke="${lo}" stroke-width=".4" stroke-opacity=".7"/>`
      + [56, 124].map((a) => at(39, a, `<path d="M-2.6 -0.2L2.6 -0.2L2.6 4.2L0 2.6L-2.6 4.2Z" fill="url(#${u}fb)" stroke="${KEY}" stroke-opacity=".6" stroke-width=".5"/>`, a < 90 ? -90 : 90)).join('');
  }
  base += band(u, 33, 4.2, [hi, mid, lo]);
  const crown = s >= 2
    ? 'M-9 -34.6L-10 -41.4L-6.2 -38L-4.6 -44L-2 -38.6L0 -46.8L2 -38.6L4.6 -44L6.2 -38L10 -41.4L9 -34.6Q0 -36.6 -9 -34.6Z'
    : 'M-7.4 -34.6L-8.6 -41.2L-4 -37.8L0 -45.4L4 -37.8L8.6 -41.2L7.4 -34.6Q0 -36.4 -7.4 -34.6Z';
  base += `<path d="${crown}" fill="url(#${u}fo)" stroke="${KEY}" stroke-opacity=".65" stroke-width=".6" stroke-linejoin="round"/>`;
  const tips = s >= 2 ? [[-10, -41.4], [-4.6, -44], [0, -46.8], [4.6, -44], [10, -41.4]] : [[-8.6, -41.2], [0, -45.4], [8.6, -41.2]];
  base += tips.map(([x, y]) => dot(x, y, 0.95, hi, `stroke="${lo}" stroke-width=".35"`)).join('');
  if (s >= 2) base += gem(0, -37.1, 1.5, '#e5384f');
  if (s >= 3) base += gemAt(39, 90, 1.6, '#4fc3ff');
  const layers = [L('fr-spin', glint(u, 33, 3.8, '#ffffff', 44, 0.75), { dur: 7 })];
  if (s >= 3) layers.push(L('fr-twinkle', spark(0, -51.4, 3.4, '#fff4c4') + spark(0, -51.4, 1.4, '#ffffff'), { dur: 2.4 }));
  return { base, layers };
}

const CRYSTALS = [
  ['#e2fffb', '#5fe0d4', '#13706d'], ['#e3ecff', '#6f95ff', '#1d3591'], ['#f3e6ff', '#b07cff', '#4a1f8f'],
  ['#ffe6f0', '#ff7fb0', '#8a1f4c'], null
];
const PRISM = [['#e2fffb', '#5fe0d4', '#13706d'], ['#f3e6ff', '#b07cff', '#4a1f8f'], ['#ffe6f0', '#ff7fb0', '#8a1f4c'], ['#fff6d6', '#ffc94d', '#8a5a0a'], ['#e3ecff', '#6f95ff', '#1d3591']];

function drawCrystal(t, s, u) {
  const set = CRYSTALS[s];
  const grow = 1 + s * 0.07;
  const shards = [
    [90, 15, 5], [75, 11, 4], [105, 11, 4], [61, 7.5, 3.2], [119, 7.5, 3.2],
    [-130, 10.5, 4], [-143, 7, 3], [-117, 7, 3], [-50, 10.5, 4], [-37, 7, 3], [-63, 7, 3]
  ];
  if (s >= 2) shards.push([180, 7.5, 3.2], [168, 5, 2.6], [0, 7.5, 3.2], [12, 5, 2.6]);
  if (s >= 3) shards.push([-90, 8, 3.4], [-100, 5.4, 2.6], [-80, 5.4, 2.6]);
  let base = '';
  if (s >= 4) base += glow(u, '#ffffff', 0.62, 0.8, 0.22, 52);
  base += band(u, 32, 2.6, set ?? PRISM[0]);
  const tips = [];
  base += shards.map(([a, len0, w], i) => {
    const pal = set ?? PRISM[i % PRISM.length];
    const len = len0 * grow;
    tips.push(xy(31.6 + len, a));
    const id = `${u}c${i % 5}`;
    const g = i < 5 ? defs(lin(id, [[0, pal[0]], [0.55, pal[1]], [1, pal[2]]], -w, -len, w, 0)) : '';
    const fill = i < 5 ? `url(#${id})` : `url(#${u}c${i % 5})`;
    return g + at(31.6, a,
      `<path d="M${n2(-w / 2)} 0L${n2(-w * 0.62)} ${n2(-len * 0.55)}L0 ${n2(-len)}L${n2(w * 0.62)} ${n2(-len * 0.55)}L${n2(w / 2)} 0Z" fill="${fill}" stroke="${KEY}" stroke-opacity=".55" stroke-width=".55" stroke-linejoin="round"/>`
      + `<path d="M${n2(-w * 0.62)} ${n2(-len * 0.55)}L0 ${n2(-len)}L0 ${n2(-len * 0.45)}Z" fill="#fff" fill-opacity=".35"/>`
      + `<path d="M${n2(w * 0.62)} ${n2(-len * 0.55)}L0 ${n2(-len * 0.45)}L0 0L${n2(w / 2)} 0Z" fill="#000" fill-opacity=".18"/>`
      + `<path d="M0 ${n2(-len * 0.45)}L0 ${n2(-len * 0.92)}" stroke="#fff" stroke-width=".4" stroke-opacity=".8"/>`);
  }).join('');
  const sparkle = (list) => list.map(([x, y]) => spark(x, y, 2.6, '#ffffff') + dot(x, y, 0.7, (set ?? PRISM[1])[1])).join('');
  const layers = [L('fr-twinkle', sparkle([tips[0], tips[5], tips[8]]), { dur: 2.2 })];
  if (s >= 2) layers.push(L('fr-twinkle fr-fine', sparkle([tips[1], tips[4], tips[6], tips[10]]), { dur: 2.2, delay: -1.1 }));
  return { base, layers };
}

function wavy(R, A, k, phase = 0) {
  return 'M' + Array.from({ length: 121 }, (_, i) => P(R + A * Math.sin((i * 3 * k + phase) * D), i * 3)).join('L') + 'Z';
}

function drawAurora(t, s, u) {
  let base = defs(
    lin(`${u}a1`, [[0, '#7dffb2'], [0.5, '#3ee0ff'], [1, '#a77bff']], -40, -40, 40, 40),
    lin(`${u}a2`, [[0, '#ff8fd8'], [0.5, '#a77bff'], [1, '#5ce1ff']], 40, -40, -40, 40),
    lin(`${u}a3`, [[0, '#fff3a8'], [1, '#7dffb2']], 0, -46, 0, 46),
    radial(`${u}ry`, [[0.64, '#7dffb2', 0], [0.72, '#7dffb2', 0.6], [0.82, '#3ee0ff', 0.3], [0.92, '#a77bff', 0]], 52));
  base += ring(37, '#3ee0ff', 9, 'stroke-opacity=".07"');
  const rays = s >= 2 ? 28 : 14;
  const span = s >= 2 ? 360 : 140;
  const from = s >= 2 ? 0 : -160;
  base += Array.from({ length: rays }, (_, i) => {
    const a = from + i * span / rays + jit(i, 2) * 4;
    return `<path d="M${P(35, a)}L${P(41 + jit(i, 4) * 5, a)}" stroke="url(#${u}ry)" stroke-width="${n2(0.6 + jit(i, 6) * 0.7)}" stroke-linecap="round"/>`;
  }).join('');
  base += band(u, 32, 2.4, ['#a8baff', '#25306b', '#0b0f2a']);
  const ribbon = (R, A, k, ph, grad, w) => `<path d="${wavy(R, A, k, ph)}" fill="none" stroke="url(#${grad})" stroke-width="${w * 3}" stroke-opacity=".22" stroke-linejoin="round"/>`
    + `<path d="${wavy(R, A, k, ph)}" fill="none" stroke="url(#${grad})" stroke-width="${w}" stroke-linejoin="round"/>`;
  const layers = [L('fr-spin', ribbon(37.4, 2.2, 5, 0, `${u}a1`, 1.4), { dur: 46 })];
  if (s >= 1) layers.push(L('fr-spin is-rev', ribbon(40.6, 2.4, 3, 40, `${u}a2`, 1.1), { dur: 64 }));
  if (s >= 3) layers.push(L('fr-spin fr-fine', ribbon(44.6, 1.6, 7, 90, `${u}a3`, 0.8), { dur: 80 }));
  if (s >= 2) layers.push(L('fr-twinkle fr-fine', Array.from({ length: 9 }, (_, i) => sparkAt(45 + jit(i, 8) * 8, i * 40 + jit(i, 9) * 20, 0.8 + jit(i, 3) * 1.1, i % 2 ? '#c9fff0' : '#ffffff')).join(''), { dur: 2.8 }));
  return { base, layers };
}

const RUNES = ['M-1.4 -1.9L0 1.9L1.4 -1.9', 'M-1.2 -1.9V1.9M-1.2 0L1.3 -1.6', 'M0 -1.9V1.9M-1.4 -.6L1.4 -.6',
  'M-1.4 -1.9L1.4 1.9M1.4 -1.9L-1.4 1.9', 'M-1.5 1.9L0 -1.9L1.5 1.9M-.8 .5H.8', 'M-1.4 -1.9H1.4L-1.4 1.9H1.4',
  'M-1.3 -1.9V1.9L1.3 .2L-1.3 -1.2', 'M0 -1.9L1.4 0L0 1.9L-1.4 0Z'];
const RUNE_GLOW = ['#7dd3fc', '#5eead4', '#c4b5fd', '#fdba74', '#fde68a'];

function drawRunic(t, s, u) {
  const glowC = RUNE_GLOW[s];
  const stone = ['#8a93a6', '#3a4150', '#141821'];
  let base = '';
  if (s >= 4) base += glow(u, glowC, 0.62, 0.8, 0.25, 52) + fine(ring(47, glowC, 0.6, 'stroke-opacity=".5" stroke-dasharray="1 2.4"'));
  const tab = (a, big) => at(37.4, a, `<path d="${big ? 'M-4 1L-2.9 -5.6L2.9 -5.6L4 1Z' : 'M-2.6 1L-1.9 -3.6L1.9 -3.6L2.6 1Z'}" fill="url(#${u}bv)" stroke="${KEY}" stroke-opacity=".7" stroke-width=".6" stroke-linejoin="round"/>`
    + (big ? `<path d="M-2.3 -0.4L-1.7 -4.7L1.7 -4.7L2.3 -0.4Z" fill="none" stroke="${glowC}" stroke-opacity=".35" stroke-width=".4"/>` : ''));
  base += band(u, 34, 7, stone);
  base += [0, 90, 180, 270].map((a) => tab(a, true)).join('');
  if (s >= 3) base += [45, 135, 225, 315].map((a) => tab(a, false)).join('');
  base += ring(34, '#07080c', 4.4, 'stroke-opacity=".6"') + ring(36.1, stone[0], 0.4, 'stroke-opacity=".45"');
  base += [0, 90, 180, 270].map((a) => (s >= 2 ? gemAt(40.2, a, 1.5, glowC) : dot(...xy(40.2, a), 1, glowC) + dot(...xy(40.2, a), 2.4, glowC, 'fill-opacity=".25"'))).join('');
  if (s >= 1) base += fine(ring(44, glowC, 0.5, 'stroke-opacity=".45"') + Array.from({ length: 24 }, (_, i) => dot(...xy(44, i * 15 + 7.5), 0.55, glowC, 'fill-opacity=".7"')).join(''));
  const count = s >= 2 ? 18 : 14;
  const runes = Array.from({ length: count }, (_, i) => at(34, i * 360 / count, `<path d="${RUNES[(i * 3 + s) % RUNES.length]}" fill="none" stroke="${glowC}" stroke-width="2" stroke-opacity=".28" stroke-linecap="round" stroke-linejoin="round"/><path d="${RUNES[(i * 3 + s) % RUNES.length]}" fill="none" stroke="${glowC}" stroke-width=".75" stroke-linecap="round" stroke-linejoin="round"/>`)).join('');
  return {
    base,
    layers: [
      L('fr-pulse', ring(34, glowC, 4.2, 'stroke-opacity=".22"'), { dur: 3.2 }),
      L('fr-spin', runes, { dur: 60 })
    ]
  };
}

function drawSolar(t, s, u) {
  const n = s >= 3 ? 24 : s >= 1 ? 20 : 16;
  let base = '';
  const corona = glow(u, '#ffae2e', 0.64, 0.74, 0.42, 50);
  const rays = defs(bb(`${u}ry`, [[0, '#ff5a12'], [0.55, '#ffb23a'], [1, '#fff3b0']]))
    + Array.from({ length: n }, (_, i) => {
      const long = i % 2 === 0;
      const len = (long ? 11.5 : 7.5) + s * 0.6;
      const w = long ? 4 : 3;
      return at(34.2, i * 360 / n, `<path d="M${-w / 2} 0C${n2(-w * 0.4)} ${n2(-len * 0.4)} ${n2(w * 0.35)} ${n2(-len * 0.6)} 0 ${n2(-len)}C${n2(w * 0.7)} ${n2(-len * 0.55)} ${n2(w * 0.5)} ${n2(-len * 0.3)} ${w / 2} 0Z" fill="url(#${u}ry)" stroke="#7a2a04" stroke-opacity=".45" stroke-width=".4"/>`);
    }).join('');
  base += band(u, 32.4, 3.8, ['#fff6c0', '#f4a522', '#8a3b06']);
  if (s >= 3) base += [45, 135, 225, 315].map((a) => gemAt(32.4, a, 1.4, '#ff6a3d')).join('');
  base += `<path d="M-5 -34L0 -43.5L5 -34Z" fill="url(#${u}bv)" stroke="${KEY}" stroke-opacity=".6" stroke-width=".6"/>` + gem(0, -36.6, 2.2, '#ffef9a');
  const layers = [L('fr-pulse', corona, { dur: 4 }), L('fr-spin', rays, { dur: 70 })];
  if (s >= 2) {
    layers.push(L('fr-spin is-rev fr-fine', Array.from({ length: n }, (_, i) => `<path d="M${P(36, i * 360 / n + 180 / n)}L${P(41 + s, i * 360 / n + 180 / n)}" stroke="#fff3b0" stroke-width=".6" stroke-linecap="round" stroke-opacity=".8"/>`).join(''), { dur: 90 }));
  }
  if (s >= 4) layers.push(L('fr-twinkle fr-fine', Array.from({ length: 6 }, (_, i) => sparkAt(50, i * 60 + 30, 1.6, '#fff6c0')).join(''), { dur: 2.6 }));
  return { base, layers };
}

function drawSingularity(t, s, u) {
  let base = defs(
    lin(`${u}in`, [[0, '#ffffff'], [0.5, '#bae6fd'], [1, '#7dd3fc', 0.25]], -36, -36, 36, 36),
    lin(`${u}md`, [[0, '#fde68a'], [0.5, '#fbbf24'], [1, '#f97316', 0.25]], 40, -40, -40, 40),
    lin(`${u}ot`, [[0, '#d8b4fe'], [0.5, '#8b5cf6'], [1, '#312e81', 0.2]], -45, 45, 45, -45),
    lin(`${u}jt`, [[0, '#e0f2fe', 0], [0.5, '#bae6fd'], [1, '#e0f2fe', 0]], 0, -52.5, 0, -45));
  base += glow(u, '#7c3aed', 0.56, 0.78, 0.32, 56, 'wl');
  if (s >= 2) base += fine(arcLine(48.5, 200, 340, '#c4b5fd', 0.8, 'stroke-opacity=".6" stroke-linecap="round"') + arcLine(48.5, 20, 160, '#c4b5fd', 0.8, 'stroke-opacity=".6" stroke-linecap="round"'));
  base += ring(31.7, '#05030c', 3.4) + ring(31.7, '#3b1d6e', 0.5, 'stroke-opacity=".9"');
  const jet = `<rect x="-1.3" y="-52.5" width="2.6" height="7.5" rx="1.3" fill="url(#${u}jt)"/><rect x="-1.3" y="-52.5" width="2.6" height="7.5" rx="1.3" fill="url(#${u}jt)" transform="rotate(180)"/>`;
  const starCount = 8 + s * 2;
  const stars = Array.from({ length: starCount }, (_, i) => {
    const [x, y] = xy(46 + jit(i, 10) * 9, i * 360 / starCount + jit(i, 9) * 14);
    return dot(x, y, 0.5 + jit(i, 11) * 0.9, i % 3 === 0 ? '#ffffff' : i % 3 === 1 ? '#bae6fd' : '#fde68a');
  }).join('');
  return {
    base,
    layers: [
      L('fr-twinkle fr-fine sing-stars', stars, { dur: 2.6 }),
      L('fr-pulse sing-jet', jet, { dur: 2.2 }),
      L('fr-spin sing-spin sing-out', ring(44.6, `url(#${u}ot)`, 3.2, 'stroke-dasharray="40 9 16 7" stroke-linecap="round"'), { dur: 18 }),
      L('fr-spin is-rev sing-spin sing-mid', ring(39.8, `url(#${u}md)`, 3.8, 'stroke-dasharray="27 6 12 8" stroke-linecap="round"'), { dur: 11 }),
      L('fr-spin sing-spin sing-in', ring(35.5, `url(#${u}in)`, 2.6, 'stroke-dasharray="19 5 8 4" stroke-linecap="round"'), { dur: 6 }),
      L('sing-ring', ring(33.7, '#ffffff', 1.1) + ring(33.7, '#c4b5fd', 3, 'stroke-opacity=".25"'), { dur: 3.2 })
    ]
  };
}

function drawGod(t, s, u) {
  const gold = ['#fff7d6', '#f5b82e', '#8a4b06'];
  let base = defs(lin(`${u}gd`, [[0, '#fff7d6'], [0.45, '#fbbf24'], [0.75, '#b45309'], [1, '#fde68a']], -40, -40, 40, 40));
  base += band(u, 32.6, 3.2, gold);
  base += ring(37.4, KEY, 2.4, 'stroke-opacity=".5"') + ring(37.4, `url(#${u}gd)`, 1.3);
  const rays = Array.from({ length: 24 }, (_, i) => {
    const long = i % 2 === 0;
    const a = i * 15 + 7.5;
    const r1 = long ? 50.5 : 44.5;
    const [ax, ay] = xy(39.4, a - 1.6), [bx, by] = xy(39.4, a + 1.6), [cx, cy] = xy(r1, a);
    return `<path d="M${ax} ${ay}L${cx} ${cy}L${bx} ${by}Z" fill="url(#${u}gd)"/>`;
  }).join('');
  const teeth = Array.from({ length: 12 }, (_, i) => {
    const [x, y] = xy(37.4, i * 30 + 15);
    return `<path d="M${x} ${n2(y - 2.8)}L${n2(x + 2)} ${y}L${x} ${n2(y + 2.8)}L${n2(x - 2)} ${y}Z" fill="url(#${u}gd)" stroke="#7a3d05" stroke-width=".45"/>` + dot(x - 0.4, y - 0.7, 0.45, '#fff');
  }).join('');
  return {
    base,
    layers: [
      L('fr-pulse god-halo', glow(u, '#fbbf24', 0.58, 0.72, 0.5, 52), { dur: 4.6 }),
      L('fr-spin god-spin', rays, { dur: 26 }),
      L('fr-spin is-rev god-spin-back', teeth, { dur: 18 }),
      L('', `<path d="M0 -36L2.2 -40.6L0 -47.6L-2.2 -40.6Z" fill="#fffbe8" stroke="#b45309" stroke-width=".6"/>` + spark(0, -51.6, 3, '#fffbe8')),
      ...(s >= 2 ? [L('fr-twinkle fr-fine', Array.from({ length: 4 + s * 2 }, (_, i) => sparkAt(53, i * 360 / (4 + s * 2) + 15, 1.5, '#fff3c4')).join(''), { dur: 2.4 })] : [])
    ]
  };
}

function flameTongues(u, n, r, height, salt, start = -90) {
  return Array.from({ length: n }, (_, i) => {
    const a = start + i * 360 / n;
    const h = height * (0.65 + jit(i, salt) * 0.6);
    const w = 360 / n * 0.62;
    const lean = (jit(i, salt + 3) - 0.5) * 2.4;
    return at(r, a, `<path class="hell-flame" d="M${n2(-w * 0.32)} 0C${n2(-w * 0.34)} ${n2(-h * 0.45)} ${n2(lean - 0.6)} ${n2(-h * 0.7)} ${n2(lean)} ${n2(-h)}C${n2(lean + 0.6)} ${n2(-h * 0.6)} ${n2(w * 0.4)} ${n2(-h * 0.4)} ${n2(w * 0.32)} 0Z" fill="url(#${u}fi)"/>`);
  }).join('');
}

function drawHellfire(t, s, u) {
  const height = 8 + s * 1.8;
  let base = defs(bb(`${u}fi`, [[0, '#b3200f'], [0.3, '#ff5a1f'], [0.6, '#ffa040'], [0.85, '#ffe0a0'], [1, '#fff8ee']]),
    lin(`${u}hn`, [[0, '#fff1e6'], [0.4, '#c2410c'], [1, '#2a0b08']], 0, -54, 0, -34));
  base += band(u, 33, 5, ['#7a2c22', '#2a0b08', '#0d0302']);
  base += Array.from({ length: 12 + s * 2 }, (_, i) => {
    const a = i * 360 / (12 + s * 2) + jit(i, 5) * 14;
    const d = `M${P(31, a)}L${P(33.2, a + 4)}L${P(35.1, a + 1)}`;
    return `<path d="${d}" fill="none" stroke="#ff7a4d" stroke-width="1.8" stroke-opacity=".3" stroke-linecap="round"/><path d="${d}" fill="none" stroke="#ffc09a" stroke-width=".6" stroke-linecap="round"/>`;
  }).join('');
  const horns = ['M7.6 -33.8C13.4 -37.6 17.2 -44.6 14.2 -53.4C13.2 -46.8 9.4 -41.6 3.4 -36.2Z', 'M-7.6 -33.8C-13.4 -37.6 -17.2 -44.6 -14.2 -53.4C-13.2 -46.8 -9.4 -41.6 -3.4 -36.2Z']
    .map((d) => `<path d="${d}" fill="url(#${u}hn)" stroke="${KEY}" stroke-opacity=".7" stroke-width=".6" stroke-linejoin="round"/>`).join('');
  const n = 16 + s * 2;
  const embers = Array.from({ length: 10 + s * 3 }, (_, i) => dot(...xy(43 + jit(i, 7) * 9, i * 360 / (10 + s * 3)), 0.5 + jit(i, 8) * 0.9, i % 4 === 0 ? '#fff1ec' : '#ff8a5c')).join('');
  const layers = [
    L('fr-pulse hell-heat', glow(u, '#fa5a32', 0.62, 0.74, 0.26, 50), { dur: 3.2 }),
    L('fr-flicker hell-flames', flameTongues(u, n, 35, height, 1), { dur: 1.3 }),
    L('fr-flicker is-alt hell-flames', flameTongues(u, n, 35, height * 1.1, 4, -90 + 180 / n), { dur: 1.3 })
  ];
  if (s >= 3) layers.push(L('fr-flicker fr-fine', flameTongues(u, n + 6, 43, height * 0.45, 2, -84), { dur: 1.1 }));
  layers.push(L('fr-spin is-rev fr-fine hell-embers', embers, { dur: 22 }));
  layers.push(L('', horns));
  return { base, layers };
}

const LEAF = (sz) => `M0 0C${n2(-sz * 0.9)} ${n2(-sz * 0.15)} ${n2(-sz * 1.25)} ${n2(-sz * 0.8)} ${n2(-sz * 0.62)} ${n2(-sz * 1.15)}C${n2(-sz * 0.5)} ${n2(-sz * 1.6)} ${n2(-sz * 0.18)} ${n2(-sz * 1.85)} 0 ${n2(-sz * 2.1)}C${n2(sz * 0.18)} ${n2(-sz * 1.85)} ${n2(sz * 0.5)} ${n2(-sz * 1.6)} ${n2(sz * 0.62)} ${n2(-sz * 1.15)}C${n2(sz * 1.25)} ${n2(-sz * 0.8)} ${n2(sz * 0.9)} ${n2(-sz * 0.15)} 0 0Z`;
const BLOSSOM = (sz, petal, heart) => [0, 72, 144, 216, 288].map((r) => `<path d="M0 0C${n2(-sz * 1.1)} ${n2(-sz * 0.5)} ${n2(-sz * 1.2)} ${n2(-sz * 1.8)} ${n2(-sz * 0.42)} ${n2(-sz * 2.25)}L0 ${n2(-sz * 1.9)}L${n2(sz * 0.42)} ${n2(-sz * 2.25)}C${n2(sz * 1.2)} ${n2(-sz * 1.8)} ${n2(sz * 1.1)} ${n2(-sz * 0.5)} 0 0Z" fill="${petal}" stroke="#9d2a5c" stroke-opacity=".45" stroke-width=".3" transform="rotate(${r})"/>`).join('') + `<circle r="${n2(sz * 0.55)}" fill="${heart}"/>`;

function drawIvy(t, s, u) {
  let base = defs(bb(`${u}lf`, [[0, '#14532d'], [0.5, '#3fae4f'], [1, '#a6f0a0']]),
    bb(`${u}lg`, [[0, '#1a4d12'], [0.5, '#65a30d'], [1, '#d9f99d']]),
    bb(`${u}am`, [[0, '#c2410c'], [1, '#fde68a']]),
    lin(`${u}bk`, [[0, '#8a6a43'], [1, '#3b2814']], 0, -36, 0, 36));
  base += ring(33.2, KEY, 3.6, 'stroke-opacity=".5"') + ring(33.2, `url(#${u}bk)`, 2.3);
  base += `<path d="${wavy(33.4, 1.5, 7)}" fill="none" stroke="#2f6b2a" stroke-width="1.1"/>`;
  const n = 13 + s * 2;
  base += Array.from({ length: n }, (_, i) => {
    const a = i * 360 / n + jit(i, 1) * 8;
    const sz = 3.3 + jit(i, 2) * 1.1 + s * 0.12;
    const tilt = (i % 2 ? 1 : -1) * (24 + jit(i, 3) * 14);
    const fill = s >= 3 && i % 4 === 0 ? `url(#${u}am)` : i % 2 ? `url(#${u}lf)` : `url(#${u}lg)`;
    return at(34.2, a, `<path d="${LEAF(sz)}" fill="${fill}" stroke="#0f3b1c" stroke-opacity=".7" stroke-width=".45" transform="rotate(${n2(tilt)})"/><path d="M0 -.3L0 ${n2(-sz * 1.8)}" stroke="#0f3b1c" stroke-opacity=".45" stroke-width=".35" transform="rotate(${n2(tilt)})"/>`);
  }).join('');
  if (s >= 1) base += [-64, 52, 160].map((a) => [0, 1, 2].map((k) => dot(...xy(39.6 + (k === 2 ? 1.6 : 0), a + (k - 1) * 2.6), 1.15, '#3b1f5c', 'stroke="#140a24" stroke-width=".35"') + dot(...xy(39.9 + (k === 2 ? 1.6 : 0), a + (k - 1) * 2.6 - 0.6), 0.32, '#fff', 'fill-opacity=".7"')).join('')).join('');
  if (s >= 2) base += [-110, 10, 128].map((a) => at(40.6, a, BLOSSOM(1.3, '#fde4f0', '#facc15'))).join('');
  if (s >= 4) base += fine(ring(45.5, '#facc15', 0.7, 'stroke-opacity=".7" stroke-dasharray="1.5 3.5"'));
  const flies = Array.from({ length: 4 + s }, (_, i) => {
    const [x, y] = xy(42.5 + jit(i, 12) * 9, i * 360 / (4 + s) + 25);
    return dot(x, y, 2.2, '#d9ff6a', 'fill-opacity=".25"') + dot(x, y, 0.75, '#f7ffbf');
  }).join('');
  return { base, layers: [L('fr-twinkle fr-fine', flies, { dur: 2.6 })] };
}

const BRASS = [
  ['#fff1b8', '#c9902a', '#5e3a08'], ['#ffd8bf', '#c26b3a', '#5a2410'], ['#f4f8fc', '#9aa6b6', '#3b4554'],
  ['#fff6c8', '#e5b53a', '#7a4f0a'], ['#ffe6dc', '#d9917f', '#6e3428']
];

function gearPath(n, r0, r1, hole) {
  const step = 360 / n;
  const pts = [];
  for (let i = 0; i < n; i++) {
    const c = i * step;
    pts.push(P(r0, c - step * 0.5), P(r0, c - step * 0.24), P(r1, c - step * 0.14), P(r1, c + step * 0.14), P(r0, c + step * 0.24));
  }
  return `${poly(pts)} M${P(hole, 0)}A${hole} ${hole} 0 1 0 ${P(hole, 180)}A${hole} ${hole} 0 1 0 ${P(hole, 0)}Z`;
}

function drawGears(t, s, u) {
  const tone = BRASS[s];
  const [hi, mid, lo] = tone;
  let base = defs(lin(`${u}br`, [[0, hi], [0.5, mid], [1, lo]], -24, -40, 24, 40));
  base += ring(33.6, KEY, 8.6, 'stroke-opacity=".35"');
  const teeth = `<path d="${gearPath(30, 34.8, 37.8, 30.4)}" fill-rule="evenodd" fill="url(#${u}br)" stroke="${KEY}" stroke-opacity=".7" stroke-width=".7" stroke-linejoin="round"/>`
    + ring(32.4, lo, 0.5, 'stroke-opacity=".7"') + ring(32.9, hi, 0.4, 'stroke-opacity=".5"')
    + Array.from({ length: 12 }, (_, i) => `<path d="M${P(30.9, i * 30)}L${P(i % 3 === 0 ? 32.2 : 31.7, i * 30)}" stroke="${lo}" stroke-width="${i % 3 === 0 ? 0.8 : 0.5}"/>`).join('');
  const spots = [-42, 138, -150, 30].slice(0, s >= 3 ? 4 : s >= 1 ? 3 : 2);
  const cogs = spots.map((a, i) => {
    const r = i === 3 ? 4.2 : i === 2 ? 4.8 : 5.6;
    const [x, y] = xy(37.4 + r + 0.3, a);
    const teethN = Math.round(r * 2);
    const body = spot(x, y, `<path d="${gearPath(teethN, r, r + 1.5, r * 0.32)}" fill-rule="evenodd" fill="url(#${u}br)" stroke="${KEY}" stroke-opacity=".7" stroke-width=".55" stroke-linejoin="round"/>`
      + ring(r * 0.68, lo, 0.5) + (s >= 3 ? dot(0, 0, r * 0.26, '#e5384f') : ''));
    return L(`fr-spin${i % 2 ? '' : ' is-rev'}`, body, { dur: n2(90 * teethN / 30), origin: [x, y] });
  });
  return { base, layers: [L('fr-spin', teeth, { dur: 90 }), ...cogs] };
}

function drawTide(t, s, u) {
  let base = defs(lin(`${u}wv`, [[0, '#e0f7ff'], [0.35, '#5cc8f2'], [1, '#0a3d6b']], 0, -8, 0, 0),
    lin(`${u}wd`, [[0, '#c9f1ff'], [0.5, '#1b8fd1'], [1, '#08345c']], 0, -38, 0, 38));
  if (s >= 3) base += spot(0, -48.4, `<path d="${CRESCENT}" fill="#fff6c9" stroke="#8a6a10" stroke-opacity=".6" stroke-width=".4" transform="rotate(-20)"/>`);
  base += fine(Array.from({ length: 10 + s * 2 }, (_, i) => dot(...xy(42 + jit(i, 4) * 6, i * 360 / (10 + s * 2) + 12), 0.5 + jit(i, 6) * 0.6, '#e6f8ff', 'fill-opacity=".85"')).join(''));
  base += ring(33, KEY, 4.6, 'stroke-opacity=".55"') + ring(33, `url(#${u}wd)`, 3.4) + ring(31.7, '#e6f8ff', 0.5, 'stroke-opacity=".55"');
  const n = 9 + s;
  const curl = 'M-5 0C-4.2 -2.4 -1.8 -5.6 1.8 -6.2C4.4 -6.6 5.8 -4.4 4.4 -2.9C3.3 -1.8 1.8 -2.6 2.3 -3.8C1.2 -3.2 .6 -1.6 1.4 0Z';
  const waves = Array.from({ length: n }, (_, i) => at(34.4, i * 360 / n, `<path d="${curl}" fill="url(#${u}wv)" stroke="${KEY}" stroke-opacity=".5" stroke-width=".45" stroke-linejoin="round"/><path d="M-3.8 -2C-2.4 -4.4 0 -5.7 2.2 -5.8" fill="none" stroke="#f4fcff" stroke-width=".7" stroke-linecap="round"/>`, 0)).join('');
  const layers = [];
  if (s >= 4) layers.push(L('fr-spin is-rev fr-fine', Array.from({ length: n }, (_, i) => at(39.6, i * 360 / n + 180 / n, `<path d="${curl}" fill="#5cc8f2" fill-opacity=".55" transform="scale(.7)"/>`)).join(''), { dur: 60 }));
  layers.push(L('fr-spin', waves, { dur: 36 }));
  if (s >= 2) layers.push(L('fr-spin is-rev fr-fine', [0, 180].map((a) => at(45, a, '<path d="M-3 0L1 -2L1 2Z M1 0L3.2 -1.6L3.2 1.6Z" fill="#7dd3fc"/>', -90)).join(''), { dur: 30 }));
  return { base, layers };
}

function drawStorm(t, s, u) {
  const violet = s >= 3;
  let base = '';
  if (s >= 2) base += fine(Array.from({ length: 16 + s * 2 }, (_, i) => { const a = i * 360 / (16 + s * 2) + jit(i, 3) * 8; return `<path d="M${P(42, a)}L${P(45.5, a + 3)}" stroke="#bae6fd" stroke-width=".6" stroke-opacity=".7" stroke-linecap="round"/>`; }).join(''));
  if (s >= 4) base += ring(47.5, '#fef08a', 0.6, 'stroke-opacity=".55" stroke-dasharray="1 4"');
  const cloud = violet ? ['#ece6ff', '#a497c9', '#4b3d73'] : ['#f1f5fa', '#a9b6c8', '#4a566c'];
  base += defs(lin(`${u}cb`, [[0, cloud[0]], [0.55, cloud[1]], [1, cloud[2]]], 0, -40, 0, 40));
  const puffs = 18;
  const puffList = Array.from({ length: puffs }, (_, i) => [xy(36.2 + jit(i, 2) * 1.6, i * 360 / puffs + jit(i, 4) * 6), 2.8 + jit(i, 5) * 2]);
  base += ring(34, KEY, 7.2, 'stroke-opacity=".5"');
  base += puffList.map(([[x, y], r]) => dot(x, y, r + 0.7, KEY, 'fill-opacity=".5"')).join('');
  base += ring(34, `url(#${u}cb)`, 6);
  base += puffList.map(([[x, y], r]) => dot(x, y, r, `url(#${u}cb)`)).join('');
  base += puffList.map(([[x, y], r]) => dot(x - r * 0.3, y - r * 0.35, r * 0.45, '#ffffff', 'fill-opacity=".35"')).join('');
  base += ring(31.4, cloud[2], 0.8, 'stroke-opacity=".6"');
  const bolt = 'M.6 -3.6L-1.8 -7.6L.3 -7.8L-1.4 -12.6L2.4 -6.8L.2 -6.6L1.9 -3.6Z';
  const bolts = (list) => list.map((a) => at(38.4, a, `<path d="${bolt}" fill="none" stroke="#ffe14d" stroke-width="2" stroke-opacity=".35" stroke-linejoin="round"/><path d="${bolt}" fill="#fffbd1" stroke="#c9a300" stroke-width=".35" stroke-linejoin="round"/>`)).join('');
  const all = [-70, 50, 170, -10, 110, -130, 20, 200].slice(0, 2 + s);
  return {
    base,
    layers: [
      L('fr-flash storm-bolt', bolts(all.filter((_, i) => i % 2 === 0)), { dur: 3.4 }),
      L('fr-flash storm-bolt', bolts(all.filter((_, i) => i % 2 === 1)), { dur: 3.4, delay: -1.6 })
    ]
  };
}

function hexAt(r, a, size, fill, extra = '') {
  return at(r, a, `<path d="${poly(Array.from({ length: 6 }, (_, k) => P(size, k * 60 + 30)))}" fill="${fill}" stroke="#6b3b06" stroke-width=".45" stroke-linejoin="round"${extra}/>`);
}

function drawHoney(t, s, u) {
  let base = defs(bb(`${u}hn`, [[0, '#ffe9a0'], [0.5, '#f5a524'], [1, '#a65a06']], 0, 0, 1, 1),
    bb(`${u}wx`, [[0, '#fff6cf'], [1, '#e9c46a']], 0, 0, 1, 1),
    bb(`${u}rg`, [[0, '#fff8e1'], [0.5, '#ffd34d'], [1, '#b8860b']], 0, 0, 1, 1));
  const n = 30;
  const step = 360 / n;
  const outer = s >= 2 ? [0, n] : s >= 1 ? [4, 11] : [5, 10];
  base += ring(34.2, KEY, 9.2, 'stroke-opacity=".5"') + ring(34.2, '#7a4306', 8);
  base += Array.from({ length: n }, (_, i) => (i < outer[0] || i > outer[1] ? '' : hexAt(40.2, i * step + step / 2, 3.7, i % 3 === 0 ? `url(#${u}wx)` : `url(#${u}hn)`, ` stroke-opacity=".9"`))).join('');
  base += Array.from({ length: n }, (_, i) => hexAt(34.2, i * step, 3.7, s >= 3 && i % 6 === 0 ? `url(#${u}rg)` : i % 5 === 2 ? `url(#${u}wx)` : `url(#${u}hn)`)).join('');
  base += fine(Array.from({ length: n }, (_, i) => dot(...xy(35.6, i * step - 2.4), 0.6, '#ffffff', 'fill-opacity=".55"')).join(''));
  const drips = [[90, 8], [72, 5.4], [108, 6.2], [54, 3.8], [126, 4.2]].slice(0, 3 + Math.min(s, 2));
  base += drips.map(([a, len]) => at(43.2, a, `<path d="M-1.3 .4C-1.3 ${n2(-len * 0.4)} -.8 ${n2(-len * 0.7)} -1.1 ${n2(-len + 1.4)}C-1.3 ${n2(-len - 0.6)} 1.3 ${n2(-len - 0.6)} 1.1 ${n2(-len + 1.4)}C.8 ${n2(-len * 0.7)} 1.3 ${n2(-len * 0.4)} 1.3 .4Z" fill="url(#${u}hn)" stroke="#5a3204" stroke-opacity=".6" stroke-width=".4"/><circle cx="-.3" cy="${n2(-len + 1)}" r=".35" fill="#fff" fill-opacity=".8"/>`)).join('');
  if (s >= 4) base += [-120, -60].map((a) => at(42, a, BLOSSOM(1.2, '#ffffff', '#facc15'))).join('');
  const bee = (a) => at(46, a, '<g transform="rotate(90)"><ellipse cx="-.6" cy="-2" rx="1.6" ry="1" fill="#e0f2fe" fill-opacity=".85" transform="rotate(-20)"/><ellipse cx=".6" cy="-2" rx="1.6" ry="1" fill="#e0f2fe" fill-opacity=".7" transform="rotate(20)"/><ellipse rx="2.6" ry="1.7" fill="#fbbf24" stroke="#1c1917" stroke-width=".4"/><path d="M-.9 -1.6V1.6M.5 -1.6V1.6" stroke="#1c1917" stroke-width=".7"/><circle cx="2.4" r="1" fill="#1c1917"/></g>');
  return { base, layers: [L('fr-spin fr-fine', bee(-60) + (s >= 2 ? bee(120) : ''), { dur: 16 })] };
}

function drawInkwell(t, s, u) {
  let base = defs(lin(`${u}ik`, [[0, '#8f8cff'], [0.45, '#2a2580'], [1, '#0b0920']], -20, -36, 20, 36));
  const blobs = 7 + s * 2;
  base += Array.from({ length: blobs }, (_, i) => {
    const a = i * 360 / blobs + jit(i, 7) * 22;
    const [x, y] = xy(39.5 + jit(i, 8) * 4.5, a);
    const r = 0.9 + jit(i, 9) * 1.6;
    const gold = s >= 3 && i % 3 === 0;
    return dot(x, y, r, gold ? '#f5c542' : '#221d6e', `stroke="${gold ? '#7a5a0a' : '#7d78ff'}" stroke-width=".4" stroke-opacity=".7"`) + (r > 1.6 ? dot(...xy(39.5 + jit(i, 8) * 4.5 + r + 1.2, a + 4), 0.5, gold ? '#f5c542' : '#221d6e') : '');
  }).join('');
  const drips = [[90, 9], [78, 5.6], [101, 6.6], [66, 3.6], [114, 4.2]].slice(0, 3 + Math.min(s, 2));
  base += drips.map(([a, len]) => at(34.4, a, `<path d="M-1.4 .6C-1.4 ${n2(-len * 0.5)} -1 ${n2(-len + 1.2)} -1.3 ${n2(-len + 0.8)}C-1.5 ${n2(-len - 1)} 1.5 ${n2(-len - 1)} 1.3 ${n2(-len + 0.8)}C1 ${n2(-len + 1.2)} 1.4 ${n2(-len * 0.5)} 1.4 .6Z" fill="url(#${u}ik)" stroke="#7d78ff" stroke-opacity=".5" stroke-width=".4"/>`)).join('');
  base += band(u, 33.2, 5, ['#8f8cff', '#2a2580', '#0b0920']);
  base += arcLine(34.6, -150, -104, '#ffffff', 0.9, 'stroke-opacity=".6" stroke-linecap="round"') + dot(...xy(34.6, -96), 0.5, '#ffffff', 'fill-opacity=".7"');
  if (s >= 2) {
    const nib = s >= 3 ? '#f5c542' : '#2a2580';
    base += `<g transform="translate(25 -25) rotate(-45)"><path d="M0 -1.2C6 -4.6 16 -4.4 24 -1.6C16 -0.2 7 1.4 0 1.2Z" fill="#eef0ff" stroke="#3b3790" stroke-width=".5"/><path d="M1 0C8 -1 16 -1.2 23 -1.4" stroke="#3b3790" stroke-width=".4" fill="none"/><path d="M0 -1.2L-4 0L0 1.2Z" fill="${nib}" stroke="#1a1650" stroke-width=".4"/></g>`;
  }
  const layers = [L('fr-drip', dot(...xy(44.6, 90), 1.25, '#3b36b5', 'stroke="#8f8cff" stroke-width=".4"'), { dur: 2.6 })];
  if (s >= 4) layers.push(L('fr-spin', glint(u, 33.2, 4.2, '#c7c5ff', 40, 0.7), { dur: 10 }));
  return { base, layers };
}

const PAPERS = [
  ['#ffe2d9', '#ff9a85', '#d9543d'], ['#dcf7f1', '#6fd3be', '#1f8a74'], ['#e3e7ff', '#8d9bff', '#3c48b8'],
  ['#fff3d1', '#f5c542', '#a8780a'], ['#ffe3f2', '#f68bc4', '#b0306f']
];

function drawOrigami(t, s, u) {
  const [light, mid, dark] = PAPERS[s];
  const n = 16;
  let base = '';
  base += Array.from({ length: n }, (_, i) => {
    const a0 = i * 360 / n, a1 = a0 + 360 / n, am = a0 + 180 / n;
    const I0 = P(30.5, a0), I1 = P(30.5, a1), O = P(38, am), M = P(32.8, am);
    return `<path d="M${I0}L${O}L${M}Z" fill="${light}"/><path d="M${M}L${O}L${I1}Z" fill="${dark}"/><path d="M${I0}L${M}L${I1}Z" fill="${mid}"/>`
      + `<path d="M${I0}L${O}L${I1}Z" fill="none" stroke="${KEY}" stroke-opacity=".55" stroke-width=".55" stroke-linejoin="round"/><path d="M${M}L${O}" stroke="#fff" stroke-opacity=".5" stroke-width=".35"/>`;
  }).join('');
  if (s >= 2) base += fine(Array.from({ length: n }, (_, i) => dot(...xy(38, i * 360 / n + 180 / n), 0.6, '#f5c542')).join(''));
  if (s >= 3) base += arcLine(29.9, 0, 359.9, dark, 0.4, 'stroke-dasharray="2 2" stroke-opacity=".6"');
  const crane = (a) => at(45.5, a, `<g transform="rotate(-90)"><path d="M-4 0L0 -1.2L4 0L0 1.3Z" fill="#fffaf2" stroke="${dark}" stroke-width=".35"/><path d="M2.6 -.4L6.2 -4L6.8 -3.6L3.6 .3Z" fill="#fffaf2" stroke="${dark}" stroke-width=".35"/><path d="M6.2 -4L7.9 -3.3L6.8 -3.6Z" fill="${dark}"/><path d="M-2.6 -.4L-6.2 -4L-6.6 -3.3L-3.6 .3Z" fill="#fffaf2" stroke="${dark}" stroke-width=".35"/><path d="M-1.6 -.6L1.2 -7.2L1.8 -.6Z" fill="${light}" stroke="${dark}" stroke-width=".35"/><path d="M-.4 -.4L3.4 -5.2L1.8 -.4Z" fill="${mid}" stroke="${dark}" stroke-width=".3"/></g>`);
  const cranes = [-60, 60, 180].slice(0, s >= 3 ? 3 : s >= 1 ? 2 : 1).map(crane).join('');
  return { base, layers: [L('fr-spin', cranes, { dur: 40 })] };
}

const LANTERN = (c, glowId, tassel) => `<path d="M0 -.2V-2.6" stroke="#7c2d12" stroke-width=".5"/><rect x="-1.5" y="-3.6" width="3" height="1.1" rx=".3" fill="#3b1206"/>`
  + `<path d="M-2.3 -3.6C-3.6 -5.4 -3.6 -8.4 -2.3 -10.2L2.3 -10.2C3.6 -8.4 3.6 -5.4 2.3 -3.6Z" fill="${c}" stroke="#4a1405" stroke-width=".45"/>`
  + `<path d="M-2.3 -3.6C-3.6 -5.4 -3.6 -8.4 -2.3 -10.2L2.3 -10.2C3.6 -8.4 3.6 -5.4 2.3 -3.6Z" fill="url(#${glowId})"/>`
  + '<path d="M-1 -3.7C-1.6 -5.6 -1.6 -8.2 -1 -10.1M1 -3.7C1.6 -5.6 1.6 -8.2 1 -10.1" fill="none" stroke="#4a1405" stroke-width=".3" stroke-opacity=".7"/>'
  + `<rect x="-1.5" y="-11.2" width="3" height="1.1" rx=".3" fill="#3b1206"/><path d="M0 -11.2V-12.8" stroke="${tassel}" stroke-width=".6"/>`;

function drawLanterns(t, s, u) {
  const n = 8 + Math.min(s, 3) * 2;
  let base = defs(boxRadial(`${u}lg`, [[0, '#fff6c2', 0.95], [0.5, '#ffd34d', 0.35], [1, '#ffd34d', 0]]));
  const pts = Array.from({ length: n * 6 + 1 }, (_, i) => P(33.4 + 1.3 * Math.abs(Math.sin(i * Math.PI / 6)), i * 360 / (n * 6) - 90));
  base += `<path d="M${pts.join('L')}" fill="none" stroke="${KEY}" stroke-opacity=".5" stroke-width="1.8"/><path d="M${pts.join('L')}" fill="none" stroke="#8a4a1c" stroke-width=".9"/>`;
  if (s >= 4) base += fine(Array.from({ length: 24 }, (_, i) => dot(...xy(48, i * 15 + 7), 0.7, '#ffe9a0')).join(''));
  const colors = s >= 3 ? ['#f5b42a', '#e5484f', '#f5b42a'] : ['#e5484f', '#f97316', '#f5b42a'];
  const glows = Array.from({ length: n }, (_, i) => dot(...xy(40.6, -90 + i * 360 / n), 5.6, '#ffc94d', 'fill-opacity=".28"')).join('');
  const lamps = Array.from({ length: n }, (_, i) => at(33.4, -90 + i * 360 / n, LANTERN(colors[i % 3], `${u}lg`, s >= 3 ? '#f5c542' : '#7c2d12'))).join('');
  return { base, layers: [L('fr-pulse', glows, { dur: 2.8 }), L('', lamps)] };
}

const GLASS = ['#e0314f', '#2f6bff', '#ffb21f', '#21b66f', '#9a4dff', '#1fc7c7'];

function drawStained(t, s, u) {
  const n = s >= 3 ? 20 : s >= 1 ? 16 : 12;
  const lead = '#1a1410';
  let base = '';
  base += Array.from({ length: n }, (_, i) => {
    const a0 = i * 360 / n, a1 = a0 + 360 / n, am = (a0 + a1) / 2;
    const c = GLASS[(i * 2 + (i % 2)) % 6];
    const pane = `M${P(30.6, a0)}A30.6 30.6 0 0 1 ${P(30.6, a1)}L${P(36.8, a1)}A36.8 36.8 0 0 0 ${P(36.8, a0)}Z`;
    const bump = `M${P(36.8, a0)}Q${P(42.6, am)} ${P(36.8, a1)}Z`;
    return `<path d="${bump}" fill="${GLASS[(i * 2 + 3) % 6]}" fill-opacity=".9" stroke="${lead}" stroke-width="1" stroke-linejoin="round"/>`
      + `<path d="${pane}" fill="${c}" stroke="${lead}" stroke-width="1.1" stroke-linejoin="round"/>`
      + `<path d="M${P(31.6, a0 + 2)}A31.6 31.6 0 0 1 ${P(31.6, am)}L${P(34.4, am)}A34.4 34.4 0 0 0 ${P(34.4, a0 + 2)}Z" fill="#fff" fill-opacity=".28"/>`;
  }).join('');
  base += ring(30.6, lead, 1.3) + ring(36.8, lead, 1.1);
  if (s >= 1) {
    const rose = Array.from({ length: 8 }, (_, k) => `<path d="M0 0L${P(6, k * 45 - 22.5)}A6 6 0 0 1 ${P(6, k * 45 + 22.5)}Z" fill="${GLASS[k % 6]}" stroke="${lead}" stroke-width=".7"/>`).join('');
    base += spot(0, -44, `<circle r="7" fill="${lead}"/>${rose}<circle r="6" fill="none" stroke="${lead}" stroke-width=".9"/><circle r="1.8" fill="#fff3c4" stroke="${lead}" stroke-width=".6"/>`);
  }
  if (s >= 4) base += fine([180, 0].map((a) => spot(...xy(44, a), `<circle r="3.6" fill="${lead}"/><circle r="2.8" fill="${GLASS[4]}"/><path d="M-2.8 0H2.8M0 -2.8V2.8" stroke="${lead}" stroke-width=".6"/>`)).join(''));
  return { base, layers: [L('fr-spin', glint(u, 33.7, 6.4, '#fff8e0', 70, 0.5), { dur: 12 })] };
}

function cometBody(u, r, start, sweep, color, tag, w = 3) {
  const [x1, y1] = xy(r, start), [x2, y2] = xy(r, start + sweep);
  const [hx, hy] = xy(r, start + sweep);
  return defs(lin(`${u}${tag}`, [[0, color, 0], [1, color, 1]], x1, y1, x2, y2))
    + `<path d="${arc(r, start, start + sweep)}" fill="none" stroke="url(#${u}${tag})" stroke-width="${n2(w * 2)}" stroke-opacity=".3" stroke-linecap="round"/>`
    + `<path d="${arc(r, start, start + sweep)}" fill="none" stroke="url(#${u}${tag})" stroke-width="${n2(w)}" stroke-linecap="round"/>`
    + dot(hx, hy, w * 1.4, color, 'fill-opacity=".3"') + dot(hx, hy, w * 0.75, '#ffffff');
}

function drawComet(t, s, u) {
  let base = '';
  base += fine(Array.from({ length: 12 + s * 3 }, (_, i) => dot(...xy(43 + jit(i, 13) * 11, i * 360 / (12 + s * 3)), 0.35 + jit(i, 14) * 0.6, '#a5f3fc', `fill-opacity=".85" style="fill:${tint('#a5f3fc', 35)}"`)).join(''));
  if (s >= 2) base += spot(30.5, -38, `<circle r="3.2" fill="#fbbf24" stroke="#7a4a05" stroke-width=".4"/><ellipse rx="5.8" ry="1.5" fill="none" stroke="#fde68a" stroke-width=".7" transform="rotate(-20)"/>`);
  base += band(u, 32.4, 2.2, ['#a8ecff', '#1b4c74', '#081a30']);
  base += ring(38.6, '#7fdcff', 0.7, `stroke-opacity=".75" stroke-dasharray=".6 2.6" stroke-linecap="round" style="stroke:${tint('#7fdcff', 30)}"`);
  const span = 110 + Math.min(t, 30) * 1.5;
  const layers = [L('fr-spin comet-orbit', cometBody(u, 38.6, -90 - span, span, '#7ff0ff', 'c0'), { dur: 9 })];
  if (s >= 1) layers.push(L('fr-spin is-rev comet-orbit comet-o1', cometBody(u, 43.6, 60, span * 0.7, '#ffcf7a', 'c1', 2.2), { dur: 15 }));
  if (s >= 3) layers.push(L('fr-spin comet-orbit comet-o2 fr-fine', cometBody(u, 47.8, 150, span * 0.5, '#ffa8e8', 'c2', 1.6), { dur: 21 }));
  return { base, layers };
}

function drawSakura(t, s, u) {
  const goldMoon = s >= 2;
  const moon = goldMoon ? ['#fffbe0', '#f5cf63', '#9a6a10'] : ['#ffffff', '#dfe6f5', '#7f8cab'];
  let base = defs(lin(`${u}mo`, [[0, moon[0]], [0.6, moon[1]], [1, moon[2]]], -44, -30, -28, 30),
    lin(`${u}br`, [[0, '#6b4430'], [1, '#2e1a10']], 0, -40, 0, 40),
    boxRadial(`${u}pt`, [[0, '#ff9cc6'], [0.55, '#ffd3e6'], [1, '#fff3f8']]));
  base += band(u, 32.2, 1.6, ['#ffffff', '#c9d2e8', '#5f6b8c']);
  const crescent = `M${P(41, 132)}A41 41 0 0 1 ${P(41, 228)}A150 150 0 0 0 ${P(41, 132)}Z`;
  base += `<path d="${crescent}" fill="url(#${u}mo)" stroke="${KEY}" stroke-opacity=".6" stroke-width=".7" stroke-linejoin="round"/>`;
  base += fine(dot(-37.6, -6, 1.3, moon[2], 'fill-opacity=".25"') + dot(-36.2, 8.4, 0.9, moon[2], 'fill-opacity=".25"') + dot(-38.4, 4, 0.6, moon[2], 'fill-opacity=".25"'));
  const stem = `M${P(36.4, 128)}C${P(40, 95)} ${P(38.4, 60)} ${P(36.6, 36)}C${P(35.4, 8)} ${P(37.8, -20)} ${P(36.8, -48)}`;
  base += `<path d="${stem}" fill="none" stroke="${KEY}" stroke-opacity=".5" stroke-width="3.2" stroke-linecap="round"/><path d="${stem}" fill="none" stroke="url(#${u}br)" stroke-width="2" stroke-linecap="round"/>`;
  base += [[100, 44, 4], [58, 43, -6], [16, 42.4, 3], [-24, 42.6, -4]].map(([a, r]) => `<path d="M${P(37.4, a)}L${P(r - 1, a + 2)}" stroke="#3d2416" stroke-width="1" stroke-linecap="round"/>`).join('');
  const flowers = [[100, 44, 2.1], [58, 43.2, 1.85], [16, 43, 2], [-24, 43, 1.75], [-50, 40.6, 1.4], [122, 41.4, 1.5], [80, 40.4, 1.3], [36, 40.4, 1.35]].slice(0, 5 + Math.min(s, 3));
  base += flowers.map(([a, r, sz]) => spot(...xy(r, a), `<g transform="rotate(${n2(a * 1.7)})">${BLOSSOM(sz, `url(#${u}pt)`, '#c2185b')}</g>`)).join('');
  base += [[-42, 40], [-62, 37.6]].map(([a, r]) => dot(...xy(r, a), 1.2, '#ff8fbf', 'stroke="#9d2a5c" stroke-width=".35"')).join('');
  const petal = '<path d="M0 0C-1.2 -.6 -1.3 -2 -.4 -2.5L0 -2.2L.4 -2.5C1.3 -2 1.2 -.6 0 0Z" fill="#ffc2dc" stroke="#9d2a5c" stroke-opacity=".4" stroke-width=".25"/>';
  const petals = Array.from({ length: 5 + s }, (_, i) => at(44 + jit(i, 3) * 9, i * 360 / (5 + s) + 20, petal, jit(i, 4) * 180)).join('');
  const layers = [L('fr-spin', petals, { dur: 34 })];
  if (s >= 3) layers.push(L('fr-twinkle fr-fine', [[-46, 172], [-47, 196], [-44, 210]].map(([r, a]) => sparkAt(-r, a, 1.6, '#fff6c9')).join(''), { dur: 2.4 }));
  return { base, layers };
}

const SCALES = [
  ['#c8ffe2', '#2fae7a', '#0c4a33', '#ffd34d'], ['#fff2b3', '#e0a52a', '#6e4508', '#e5384f'], ['#ffc2b8', '#c0303a', '#4a0b12', '#ffd34d'],
  ['#ece4ff', '#7a5cd6', '#2a1a5c', '#7affd4'], ['#ffffff', '#b9e5ff', '#3d6a9c', '#ffb02e']
];

function drawOuroboros(t, s, u) {
  const [hi, mid, lo, eye] = SCALES[s];
  let base = defs(lin(`${u}sc`, [[0, hi], [0.5, mid], [1, lo]], -30, -40, 30, 40), lin(`${u}hd`, [[0, hi], [0.5, mid], [1, lo]], -4, -14, 2, 5));
  if (s >= 2) {
    base += spot(0, 43.6, `<circle r="4.6" fill="${eye}" fill-opacity=".25"/><circle r="3.2" fill="#ffffff" stroke="${lo}" stroke-width=".5"/><circle cx="-1" cy="-1" r="1" fill="#fff"/><circle r="3.2" fill="${mid}" fill-opacity=".25"/>`);
  }
  base += Array.from({ length: 26 }, (_, i) => {
    const a = -72 + i * 11.8;
    if (a > 248) return '';
    return at(36.6, a, `<path d="M-1.5 .6L0 -3.4L1.5 .6Z" fill="url(#${u}sc)" stroke="${KEY}" stroke-opacity=".6" stroke-width=".45" stroke-linejoin="round"/>`);
  }).join('');
  const body = arc(34, -78, 250);
  base += `<path d="${body}" fill="none" stroke="${KEY}" stroke-opacity=".55" stroke-width="7"/><path d="${body}" fill="none" stroke="url(#${u}sc)" stroke-width="5.6"/>`;
  base += `<path d="${arc(31.8, -78, 250)}" fill="none" stroke="#f6e7b0" stroke-width="1.1" stroke-opacity=".9"/>`;
  base += fine(Array.from({ length: 30 }, (_, i) => {
    const a = -74 + i * 10.8;
    return `<path d="M${P(35.6, a)}A2 2 0 0 0 ${P(35.6, a + 7)}M${P(33.6, a + 5.4)}A2 2 0 0 0 ${P(33.6, a + 12)}" fill="none" stroke="${lo}" stroke-width=".45" stroke-opacity=".6"/>`;
  }).join(''));
  const [tx, ty] = xy(34, 250);
  base += `<path d="M${P(31.2, 248)}L${P(36.8, 248)}L${n2(tx + 3.6)} ${n2(ty - 2.8)}Z" fill="url(#${u}sc)" stroke="${KEY}" stroke-opacity=".6" stroke-width=".5" stroke-linejoin="round"/>`;
  const head = '<g transform="translate(0 -37.6) scale(1.25)">'
    + `<path d="M3.4 -5.6C5.6 -9 8.6 -11.4 12.6 -12C9.6 -9.8 7.6 -7.6 5.8 -4.6Z" fill="url(#${u}hd)" stroke="${KEY}" stroke-opacity=".7" stroke-width=".5"/>`
    + `<path d="M.4 -6.4C1.8 -9.8 4 -12 7 -13.2C5.2 -11 3.8 -8.8 2.8 -6Z" fill="url(#${u}hd)" stroke="${KEY}" stroke-opacity=".7" stroke-width=".5"/>`
    + `<path d="M7.6 2.2C7.6 -2.6 4.6 -6.6 -.6 -6.8C-4.2 -6.8 -7 -5.2 -10 -3.4L-10.6 -1.4L-6.4 -.6L-3.4 .8L-8.8 1.8L-7.4 3.8C-2.4 5 3 4.6 7.6 2.2Z" fill="url(#${u}hd)" stroke="${KEY}" stroke-opacity=".75" stroke-width=".6" stroke-linejoin="round"/>`
    + '<path d="M-3.2 .8L-6.4 -.6L-6 .6Z" fill="#7a1010"/>'
    + `<path d="M-1 -2.6C1.6 -1.6 4 -1.6 6.4 -3" fill="none" stroke="${lo}" stroke-width=".45" stroke-opacity=".7"/>`
    + `<ellipse cx="-3.6" cy="-3.6" rx="1.35" ry=".95" fill="${eye}" stroke="${KEY}" stroke-width=".35"/><path d="M-3.6 -4.4V-2.8" stroke="#1a0a00" stroke-width=".45"/>`
    + dot(-8.8, -2.6, 0.35, lo)
    + (s >= 1 ? '<path d="M-10 -2.6C-13 -4 -14.6 -7 -13.4 -9.4M-8.6 1.8C-12 2.4 -14.4 4.6 -14 7" fill="none" stroke="#f6e7b0" stroke-width=".55" stroke-linecap="round"/>' : '')
    + '</g>';
  const layers = [L('fr-spin', glint(u, 34, 4.6, '#ffffff', 36, 0.55), { dur: 8 }), L('', head),
    L('fr-pulse', spot(-4.5, -42.1, `<circle r="2.4" fill="${eye}" fill-opacity=".45"/>`), { dur: 1.8 })];
  if (s >= 4) layers.push(L('fr-twinkle fr-fine', Array.from({ length: 6 }, (_, i) => sparkAt(46 + jit(i, 2) * 6, 10 + i * 30, 1.4, hi)).join(''), { dur: 2.4 }));
  return { base, layers };
}

function drawPhoenix(t, s, u) {
  const sun = s >= 4;
  let base = defs(bb(`${u}fe`, sun
    ? [[0, '#ff8a1f'], [0.4, '#ffc94d'], [0.8, '#fff3b0'], [1, '#ffffff']]
    : [[0, '#c4210c'], [0.35, '#ff6a1a'], [0.72, '#ffc23a'], [1, '#fff3b0']]));
  if (s >= 3) base += glow(u, '#ff6a1a', 0.62, 0.8, 0.18, 54);
  const n = [5, 6, 6, 7, 7][s];
  const wing = Array.from({ length: n }, (_, k) => n - 1 - k).map((k) => {
    const b = 16 - k * 10.5;
    const len = 10 + k * 1.9 + s * 0.5;
    return at(33.8, b, `<path d="${feather(len, 3.6, 1)}" fill="url(#${u}fe)" stroke="#4a0d05" stroke-opacity=".7" stroke-width=".5"/><path d="M0 -.4L1 ${n2(-len * 0.82)}" stroke="#5a1006" stroke-width=".45" stroke-opacity=".7"/>`, -18 - k * 1.5);
  }).join('');
  base += `<g>${wing}</g><g transform="scale(-1 1)">${wing}</g>`;
  const tail = [[90, 16.5], [72, 13.5], [108, 13.5]].concat(s >= 2 ? [[58, 10], [122, 10]] : []);
  base += tail.map(([a, len]) => at(34, a, `<path d="M0 0C-.8 ${n2(-len * 0.4)} .8 ${n2(-len * 0.6)} 0 ${n2(-len + 3)}" fill="none" stroke="#c2410c" stroke-width=".9"/>`
    + `<path d="M0 ${n2(-len + 4.6)}C-2.8 ${n2(-len + 3)} -2.4 ${n2(-len - 0.4)} 0 ${n2(-len - 1.4)}C2.4 ${n2(-len - 0.4)} 2.8 ${n2(-len + 3)} 0 ${n2(-len + 4.6)}Z" fill="url(#${u}fe)" stroke="#4a0d05" stroke-opacity=".7" stroke-width=".45"/>`
    + dot(0, -len + 1.6, 0.9, '#1e3a8a', 'stroke="#7dd3fc" stroke-width=".45"'))).join('');
  base += band(u, 32.6, 3.8, sun ? ['#ffffff', '#ffd34d', '#b45309'] : ['#fff1a8', '#f08a1c', '#7a1d06']);
  base += [-90, -76, -104].map((a, i) => at(34.2, a, `<path d="${feather(i ? 6.4 : 8.6, 2.4, 0)}" fill="url(#${u}fe)" stroke="#4a0d05" stroke-opacity=".7" stroke-width=".45"/>`, i ? (a > -90 ? 14 : -14) : 0)).join('');
  if (s >= 2) base += gem(0, 32.6, 2.3, '#e5384f');
  const embers = Array.from({ length: 6 + s * 2 }, (_, i) => {
    const [x, y] = xy(45 + jit(i, 5) * 8, i * 360 / (6 + s * 2) + 15);
    return spark(x, y, 1.3 + jit(i, 6), i % 3 ? '#ffb23a' : '#fff3b0');
  }).join('');
  return {
    base,
    layers: [
      L('fr-pulse', glow(u, '#ffb23a', 0.66, 0.84, 0.2, 54, 'g2'), { dur: 2.4 }),
      L('fr-spin is-rev', embers, { dur: 20 })
    ]
  };
}

function drawAstral(t, s, u) {
  const gold = s >= 4;
  const crys = gold ? ['#fffbe8', '#f5cf63', '#8a5a0a'] : ['#ffffff', '#b8c4ff', '#3b3fa8'];
  let base = defs(lin(`${u}cy`, [[0, crys[0]], [0.55, crys[1]], [1, crys[2]]], -10, -50, 10, -34));
  if (s >= 2) base += glow(u, '#6b7bff', 0.6, 0.78, 0.3, 52);
  base += band(u, 32.6, 3.4, ['#c9d6ff', '#2b3a8f', '#0a0f33']);
  base += fine(Array.from({ length: 14 }, (_, i) => dot(...xy(32.6 + (jit(i, 4) - 0.5) * 1.6, i * 360 / 14 + 6), 0.3 + jit(i, 5) * 0.3, '#ffffff', 'fill-opacity=".85"')).join(''));
  if (s >= 2) {
    base += spot(0, 44, `<path d="${CRESCENT}" fill="#f5f0d8" stroke="#3b3fa8" stroke-opacity=".6" stroke-width=".4" transform="rotate(-25) scale(.9)"/>`);
  }
  const groups = [[20, 34, 46], [100, 114, 124], [196, 210, 224], [290, 302]];
  const constellation = ring(42.4, '#9fb4ff', 0.45, `stroke-opacity=".5" stroke-dasharray=".5 2.2" stroke-linecap="round" style="stroke:${tint('#9fb4ff')}"`)
    + groups.map((g, gi) => {
      const pts = g.map((a, i) => xy(i % 2 ? 45 : 41.2, a));
      return `<path d="M${pts.map(([x, y]) => `${x} ${y}`).join('L')}" fill="none" stroke="#c9d4ff" stroke-opacity=".75" stroke-width=".55" style="stroke:${tint('#a9b8ff')}"/>`
        + pts.map(([x, y], i) => (i === gi % g.length ? spark(x, y, 2.1, '#ffffff', `style="fill:${tint('#c9d4ff', 30)}"`) : '') + dot(x, y, 0.8, '#eef1ff', `style="fill:${tint('#c9d4ff', 30)}"`)).join('');
    }).join('');
  const spires = s >= 3
    ? [[-12, 6], [-8, 9], [-4, 12], [0, 15], [4, 12], [8, 9], [12, 6]]
    : [[-10, 7], [-5, 10.5], [0, 14], [5, 10.5], [10, 7]];
  const crown = `<path d="${arc(35.8, -116, -64)}" fill="none" stroke="${KEY}" stroke-opacity=".6" stroke-width="3.2"/><path d="${arc(35.8, -116, -64)}" fill="none" stroke="url(#${u}cy)" stroke-width="2"/>`
    + spires.map(([x, h]) => {
      const y0 = -34.8 - Math.abs(x) * Math.abs(x) * 0.018;
      return `<path d="M${x} ${n2(y0)}L${n2(x - 1.7)} ${n2(y0 - h * 0.45)}L${x} ${n2(y0 - h)}L${n2(x + 1.7)} ${n2(y0 - h * 0.45)}Z" fill="url(#${u}cy)" stroke="${KEY}" stroke-opacity=".6" stroke-width=".45" stroke-linejoin="round"/>`
        + `<path d="M${x} ${n2(y0)}L${n2(x + 1.7)} ${n2(y0 - h * 0.45)}L${x} ${n2(y0 - h)}Z" fill="#000" fill-opacity=".2"/>`
        + spark(x, y0 - h - 0.6, h > 10 ? 2.2 : 1.6, gold ? '#fff3b0' : '#ffffff');
    }).join('')
    + gem(0, -36.4, 1.6, gold ? '#e5384f' : '#7ad8ff');
  const orbiters = [0, 120, 240].map((a) => sparkAt(48.6, a, 2.2, '#ffffff', `style="fill:${tint('#dfe5ff', 35)}"`) + dot(...xy(48.6, a), 0.8, '#b8c4ff')).join('');
  const layers = [L('fr-spin', constellation, { dur: 70 }), L('fr-spin is-rev', orbiters, { dur: 24 }), L('', crown)];
  if (s >= 1) layers.splice(2, 0, L('fr-twinkle fr-fine', Array.from({ length: 6 }, (_, i) => sparkAt(52, i * 60 + 30, 1.2, '#dfe6ff')).join(''), { dur: 2.6 }));
  return { base, layers };
}

const DRAWERS = {
  metal: drawMetal, circuit: drawCircuit, orbit: drawOrbit, crest: drawCrest, crystal: drawCrystal,
  aurora: drawAurora, runic: drawRunic, solar: drawSolar, singularity: drawSingularity,
  god: drawGod, hellfire: drawHellfire,
  ivy: drawIvy, gears: drawGears, tide: drawTide, storm: drawStorm, honey: drawHoney,
  inkwell: drawInkwell, origami: drawOrigami, lanterns: drawLanterns, stained: drawStained, comet: drawComet,
  sakura: drawSakura, ouroboros: drawOuroboros, phoenix: drawPhoenix, astral: drawAstral
};

let seq = 0;
const pct = (v) => n2(((v + 58) / 116) * 100);

export function frameSvg(styleId, tier, { size = null } = {}) {
  const t = Math.min(Math.max(Math.round(tier), 0), 50) - 1;
  if (t < 0) return '';
  const id = DRAWERS[styleId] ? styleId : 'metal';
  seq = (seq + 1) % 1e6;
  const uid = `wf${seq.toString(36)}${id.slice(0, 2)}`;
  const { base, layers } = DRAWERS[id](t, stageOf(t), uid);
  const dim = size ? `width="${size}" height="${size}"` : 'width="100%" height="100%"';
  const open = (cls, style = '') => `<svg class="${cls}" viewBox="-58 -58 116 116" ${dim} aria-hidden="true" focusable="false" style="position:absolute;inset:0;overflow:visible${style}">`;
  const grade = frameStyleById(id).grade ?? 'classic';
  return `${open(`fr fr-${id}`).replace('<svg ', `<svg data-grade="${grade}" `)}${base}</svg>`
    + layers.map((layer) => {
      const style = [layer.dur ? `--fr-dur:${layer.dur}s` : '', layer.delay ? `--fr-delay:${layer.delay}s` : '',
        layer.origin ? `transform-origin:${pct(layer.origin[0])}% ${pct(layer.origin[1])}%` : ''].filter(Boolean).join(';');
      return `${open(`fr-layer${layer.cls ? ` ${layer.cls}` : ''}`, style ? `;${style}` : '')}${layer.body}</svg>`;
    }).join('');
}
