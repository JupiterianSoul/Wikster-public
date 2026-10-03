const O = 'var(--eo, #0b0d18)';
const HI = 'rgba(255, 255, 255, 0.92)';
const W = 4;

let seq = 0;

const r2 = (n) => Math.round(n * 100) / 100;

function polar(cx, cy, r, deg) {
  const a = (deg * Math.PI) / 180;
  return [r2(cx + r * Math.cos(a)), r2(cy + r * Math.sin(a))];
}

function starPoints(cx, cy, outer, inner, n = 5, turn = -90) {
  const pts = [];
  for (let i = 0; i < n * 2; i++) pts.push(polar(cx, cy, i % 2 ? inner : outer, turn + (i * 180) / n));
  return pts;
}

const pts = (list) => list.map((p) => p.join(',')).join(' ');

function waxPath(cx, cy, r, bumps, depth) {
  const steps = bumps * 8;
  let d = '';
  for (let i = 0; i <= steps; i++) {
    const deg = (i / steps) * 360;
    const [x, y] = polar(cx, cy, r + depth * Math.sin((deg * bumps * Math.PI) / 180), deg);
    d += `${i ? 'L' : 'M'}${x} ${y}`;
  }
  return `${d}Z`;
}

function kit(u) {
  const A = `url(#${u}a)`;
  const B = `url(#${u}b)`;
  const F = `url(#${u}f)`;
  const line = (stroke, width, extra = '') => `fill="none" stroke="${stroke}" stroke-width="${width}" stroke-linecap="round" stroke-linejoin="round"${extra}`;
  return {
    A, B, F,
    defs: `<defs>`
      + `<linearGradient id="${u}a" x1="0.1" y1="0" x2="0.9" y2="1"><stop offset="0" style="stop-color:var(--e1, #e2e8f0)"/><stop offset="1" style="stop-color:var(--e2, #94a3b8)"/></linearGradient>`
      + `<linearGradient id="${u}b" x1="0.1" y1="0" x2="0.9" y2="1"><stop offset="0" style="stop-color:var(--e2, #94a3b8)"/><stop offset="1" style="stop-color:var(--e3, #334155)"/></linearGradient>`
      + `<linearGradient id="${u}f" x1="0" y1="0" x2="1" y2="1"><stop offset="0.3" stop-color="#fff" stop-opacity="0"/><stop offset="0.46" stop-color="#fff" stop-opacity="0.5"/><stop offset="0.54" stop-color="#fff" stop-opacity="0.12"/><stop offset="0.7" stop-color="#fff" stop-opacity="0"/></linearGradient>`
      + `</defs>`,
    ground: (rx = 34, cx = 60) => `<ellipse cx="${cx}" cy="108" rx="${rx}" ry="4.5" fill="${O}" opacity="0.28"/>`,
    path: (d, fill = A, width = W, extra = '') => `<path d="${d}" fill="${fill}" stroke="${O}" stroke-width="${width}" stroke-linejoin="round" stroke-linecap="round"${extra}/>`,
    poly: (p, fill = A, width = W, extra = '') => `<polygon points="${p}" fill="${fill}" stroke="${O}" stroke-width="${width}" stroke-linejoin="round"${extra}/>`,
    rect: (x, y, w, h, rx, fill = A, width = W, extra = '') => `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${rx}" fill="${fill}" stroke="${O}" stroke-width="${width}"${extra}/>`,
    circle: (cx, cy, r, fill = A, width = W) => `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${fill}" stroke="${O}" stroke-width="${width}"/>`,
    ellipse: (cx, cy, rx, ry, fill = A, width = W, extra = '') => `<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="${fill}" stroke="${O}" stroke-width="${width}"${extra}/>`,
    dot: (cx, cy, r, fill = O) => `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${fill}"/>`,
    stroke: (d, color = O, width = W) => `<path d="${d}" ${line(color, width)}/>`,
    rod: (d, inner = A, width = 9) => `<path d="${d}" ${line(O, width)}/><path d="${d}" ${line(inner, width - 5)}/>`,
    glint: (d, width = 3.2) => `<path d="${d}" ${line(HI, width)}/>`,
    foil: (d) => `<path d="${d}" fill="${F}"/>`,
    sparkle: (cx, cy, s) => `<path d="M${cx} ${cy - s}Q${cx + s * 0.12} ${cy - s * 0.12} ${cx + s} ${cy}Q${cx + s * 0.12} ${cy + s * 0.12} ${cx} ${cy + s}Q${cx - s * 0.12} ${cy + s * 0.12} ${cx - s} ${cy}Q${cx - s * 0.12} ${cy - s * 0.12} ${cx} ${cy - s}Z" fill="${HI}"/>`
  };
}

const CAR = 'M14 84V72Q14 64 24 62L38 59L50 46Q54 42 60 42H80Q87 42 91 47L100 59Q108 61 108 70V84Z';
const FLAG = 'M36 22Q52 14 68 22T100 22V62Q84 54 68 62T36 62Z';
const PLANE = 'M12 3.2c1 0 1.7 1 1.7 2.7v3.2l7.2 4.2v2l-7.2-2.2v3.6l2.4 1.8v1.6L12 18.9l-4.1 1.2v-1.6l2.4-1.8v-3.6L3.1 15.3v-2l7.2-4.2V5.9C10.3 4.2 11 3.2 12 3.2z';
const PAD = 'M32 42H88Q106 42 108 62L106 84Q103 98 90 94L78 80H42L30 94Q17 98 14 84L12 62Q14 42 32 42Z';
const FOX = 'M60 98L28 66L22 24L46 42H74L98 24L92 66Z';
const OWL = 'M60 102Q26 102 26 66Q26 38 34 24L46 34Q60 28 74 34L86 24Q94 38 94 66Q94 102 60 102Z';
const BUBBLE = 'M24 24H96Q106 24 106 34V72Q106 82 96 82H54L34 100V82H24Q14 82 14 72V34Q14 24 24 24Z';
const PALETTE = 'M60 16C90 16 108 36 106 60C104 76 92 77 84 72C76 67 70 72 72 82C74 94 66 102 56 102C32 102 14 84 14 60C14 36 34 16 60 16Z';
const FLAME = 'M60 106C36 106 22 90 24 70C26 52 40 44 38 24C52 32 56 44 54 54C62 44 64 30 74 14C78 34 96 46 96 72C96 92 82 106 60 106Z';
const TUB = 'M26 54H94L86 100Q85 106 79 106H41Q35 106 34 100Z';
const CHEESE = 'M14 82A46 46 0 0 1 106 82Z';
const PENT = (cx, cy, r, turn = -90) => pts(Array.from({ length: 5 }, (_, i) => polar(cx, cy, r, turn + i * 72)));

const pixelHeart = [
  '.XX.XX.',
  'XXXXXXX',
  'XXXXXXX',
  '.XXXXX.',
  '..XXX..',
  '...X...'
];

function pixels(k) {
  const unit = 12;
  const cells = [];
  pixelHeart.forEach((row, y) => [...row].forEach((c, x) => { if (c === 'X') cells.push([18 + x * unit, 26 + y * unit]); }));
  const layer = (attrs) => `<g ${attrs}>${cells.map(([x, y]) => `<rect x="${x}" y="${y}" width="${unit}" height="${unit}"/>`).join('')}</g>`;
  return layer(`fill="${O}" stroke="${O}" stroke-width="8"`)
    + layer(`fill="${k.A}" stroke="${k.A}" stroke-width="0.6"`)
    + `<rect x="30" y="38" width="12" height="12" fill="${HI}"/><rect x="30" y="26" width="12" height="6" fill="${HI}" opacity="0.6"/>`
    + `<rect x="78" y="50" width="12" height="12" fill="${k.B}"/><rect x="66" y="62" width="12" height="12" fill="${k.B}"/><rect x="54" y="74" width="12" height="12" fill="${k.B}"/>`;
}

function wGlyph(x, y, w, h, stroke, color, u) {
  return `<clipPath id="${u}w"><rect x="${x}" y="${y}" width="${w}" height="${h}"/></clipPath>`
    + `<g clip-path="url(#${u}w)"><polyline points="${x},${y} ${x + w * 0.25},${y + h} ${x + w * 0.5},${y + h * 0.1} ${x + w * 0.75},${y + h} ${x + w},${y}" fill="none" stroke="${color}" stroke-width="${stroke}" stroke-linejoin="miter" stroke-miterlimit="12"/></g>`;
}

export const EMBLEMS = {
  cars: (k) => k.ground(44)
    + k.path(CAR) + k.foil(CAR)
    + k.path('M47 59L55 49H68V59Z', k.B, 3.5) + k.path('M74 49H82Q85 49 87 52L92 59H74Z', k.B, 3.5)
    + k.stroke('M71 62V78', O, 3)
    + k.circle(36, 84, 12, k.B) + k.circle(36, 84, 4.5, k.A, 3)
    + k.circle(88, 84, 12, k.B) + k.circle(88, 84, 4.5, k.A, 3)
    + k.glint('M58 47H78') + k.glint('M101 67H105'),

  f1: (k, u) => k.ground(26, 34)
    + k.rect(27, 14, 7, 94, 3.5, k.B)
    + `<clipPath id="${u}c"><path d="${FLAG}"/></clipPath>`
    + k.path(FLAG)
    + `<g clip-path="url(#${u}c)" fill="${O}" opacity="0.82">${[0, 1, 2, 3, 4, 5, 6, 7].map((c) => [0, 1, 2, 3].map((r) => ((c + r) % 2 ? '' : `<rect x="${36 + c * 8}" y="${14 + r * 13 + (c % 2) * 2}" width="8" height="13"/>`)).join('')).join('')}</g>`
    + k.foil(FLAG)
    + k.path(FLAG, 'none')
    + k.glint('M30.5 20V30', 2.4),

  planes: (k) => k.ground(30)
    + `<path d="M18 100L36 82M30 106L44 92" stroke="${HI}" stroke-width="3.4" stroke-linecap="round" opacity="0.55"/>`
    + `<g transform="translate(62 56) rotate(45) scale(4.1) translate(-12 -12)">`
    + `<path d="${PLANE}" fill="${k.A}" stroke="${O}" stroke-width="0.98" stroke-linejoin="round"/>`
    + `<path d="${PLANE}" fill="${k.F}"/>`
    + `<path d="M12 4.6V8.2" stroke="${HI}" stroke-width="0.8" stroke-linecap="round"/></g>`,

  'video-games': (k) => k.ground(40)
    + k.path(PAD) + k.foil(PAD)
    + k.path('M33 56h8v8h8v8h-8v8h-8v-8h-8v-8h8z', k.B, 3)
    + k.circle(82, 61, 6, k.B, 3) + k.circle(94, 72, 6, k.B, 3)
    + k.circle(60, 62, 2.6, O, 0)
    + k.glint('M28 50Q36 47 46 47'),

  books: (k) => k.ground(44)
    + k.rect(14, 80, 92, 20, 4, k.B) + k.stroke('M90 84V96M96 84V96', HI, 2.4)
    + k.rect(22, 60, 78, 20, 4) + k.foil('M22 60H100V80H22Z') + k.stroke('M34 60V80M42 60V80', O, 3)
    + `<g transform="rotate(-8 60 46)">${k.rect(30, 38, 64, 20, 4, k.B)}${k.stroke('M80 38V58', O, 3)}${k.glint('M38 44H70', 2.6)}</g>`
    + k.glint('M50 66H88'),

  movies: (k) => k.ground(42)
    + k.rect(20, 52, 80, 50, 6) + k.foil('M20 52H100V102H20Z')
    + `<path d="M28 52h11l-6 12h-11zM50 52h11l-6 12h-11zM72 52h11l-6 12h-11zM94 52h6v2l-5 10h-6z" fill="${O}" opacity="0.85"/>`
    + k.stroke('M20 64H100', O, 3.5)
    + `<g transform="rotate(-16 22 50)">${k.rect(20, 34, 80, 14, 3)}<path d="M30 34h11l-6 14h-11zM52 34h11l-6 14h-11zM74 34h11l-6 14h-11zM96 34h4v4l-4 10h-7z" fill="${O}" opacity="0.85"/></g>`
    + k.circle(23, 50, 4.5, k.B, 3)
    + k.stroke('M32 78H72M32 90H58', k.B, 4.5),

  space: (k) => k.ground(30)
    + `<g transform="rotate(-16 60 62)">${k.rod('M12 62A48 13 0 0 1 108 62', k.A, 10)}</g>`
    + k.circle(60, 62, 27) + k.foil('M33 62a27 27 0 1 0 54 0a27 27 0 1 0 -54 0Z')
    + k.stroke('M37 54Q60 47 83 53M35 70Q60 76 85 69', k.B, 4)
    + `<g transform="rotate(-16 60 62)">${k.rod('M12 62A48 13 0 0 0 108 62', k.A, 10)}</g>`
    + k.glint('M42 50Q46 42 54 38')
    + k.sparkle(98, 22, 8) + k.sparkle(22, 30, 5) + k.sparkle(104, 94, 4),

  physics: (k) => k.ground(30)
    + [0, 60, 120].map((a) => `<ellipse cx="60" cy="60" rx="45" ry="16" transform="rotate(${a} 60 60)" fill="none" stroke="${O}" stroke-width="9"/>`).join('')
    + [0, 60, 120].map((a) => `<ellipse cx="60" cy="60" rx="45" ry="16" transform="rotate(${a} 60 60)" fill="none" stroke="${k.A}" stroke-width="4"/>`).join('')
    + k.circle(60, 60, 12, k.B) + k.foil('M48 60a12 12 0 1 0 24 0a12 12 0 1 0 -24 0Z') + k.dot(56, 56, 3, HI)
    + k.circle(105, 60, 5.5, k.A, 3) + `<g transform="rotate(120 60 60)">${k.circle(105, 60, 5.5, k.A, 3)}</g>`,

  nature: (k) => k.ground(48)
    + k.circle(84, 36, 13)
    + k.poly('54,100 80,58 108,100', k.B)
    + k.poly('12,100 46,40 78,100') + k.foil('M12 100L46 40L78 100Z')
    + k.path('M46 40L55.4 57L50 54L45 60L40 54L35.6 58Z', HI, 3)
    + k.stroke('M10 100H110', O, 4),

  animals: (k) => k.ground(30)
    + k.path(FOX) + k.foil(FOX)
    + k.path('M29 34L41 45L31 52Z', k.B, 3) + k.path('M91 34L79 45L89 52Z', k.B, 3)
    + k.path('M60 98L40 74Q50 68 60 76Q70 68 80 74Z', HI, 3)
    + k.dot(46, 62, 4.2) + k.dot(74, 62, 4.2) + k.dot(44.6, 60.6, 1.3, HI) + k.dot(72.6, 60.6, 1.3, HI)
    + k.path('M55 87H65L60 93Z', O, 2),

  plants: (k) => k.ground(36)
    + k.path('M24 102Q60 82 96 102Z', k.B)
    + k.rod('M60 98V58')
    + k.path('M60 78Q34 80 22 52Q52 46 60 78Z') + k.path('M60 62Q64 30 98 22Q102 56 60 62Z') + k.foil('M60 62Q64 30 98 22Q102 56 60 62Z')
    + k.stroke('M57 75Q44 66 32 56M63 59Q76 44 92 30', k.B, 3),

  history: (k) => k.ground(50)
    + k.poly('14,44 60,16 106,44') + k.foil('M14 44L60 16L106 44Z') + k.circle(60, 34, 5, k.B, 3)
    + k.rect(18, 44, 84, 10, 2, k.B)
    + [23, 44, 66, 87].map((x) => k.rect(x, 54, 10, 34, 1.5, k.A, 3.5) + k.stroke(`M${x + 5} 59V83`, k.B, 2)).join('')
    + k.rect(14, 88, 92, 8, 2, k.B) + k.rect(10, 96, 100, 8, 2)
    + k.glint('M28 40L54 25'),

  philosophy: (k) => k.ground(30)
    + k.path(OWL) + k.foil(OWL)
    + k.circle(46, 56, 13, HI) + k.circle(74, 56, 13, HI)
    + k.dot(47, 57, 5.5) + k.dot(73, 57, 5.5) + k.dot(45, 55, 1.8, HI) + k.dot(71, 55, 1.8, HI)
    + k.path('M55 67H65L60 77Z', k.B, 3)
    + k.stroke('M46 86l5 5l5 -5M64 86l5 5l5 -5M55 94l5 5l5 -5', k.B, 3),

  celebrities: (k) => {
    const s = starPoints(60, 60, 46, 19);
    const facets = s.map((p, i) => (i % 2 ? '' : `<polygon points="60,60 ${p.join(',')} ${s[(i + 1) % 10].join(',')}" fill="${O}" opacity="0.16"/>`)).join('');
    return k.ground(30) + k.poly(pts(s)) + k.foil(`M${pts(s).replace(/ /g, 'L')}Z`) + facets + k.poly(pts(s), 'none')
      + k.sparkle(100, 20, 8) + k.sparkle(20, 96, 6) + k.glint('M47 38L56 22', 2.8);
  },

  quotes: (k) => k.ground(40)
    + k.path(BUBBLE) + k.foil(BUBBLE)
    + `<g fill="${O}" opacity="0.85"><circle cx="46" cy="48" r="8"/><path d="M38 49Q37 62 48 68L50 64Q44 60 45 56Z"/><circle cx="72" cy="48" r="8"/><path d="M64 49Q63 62 74 68L76 64Q70 60 71 56Z"/></g>`
    + k.glint('M24 33H40'),

  art: (k) => k.ground(42)
    + k.path(PALETTE) + k.foil(PALETTE)
    + k.circle(40, 76, 7, O, 0)
    + k.circle(36, 48, 7, HI, 3) + k.circle(58, 34, 7, k.B, 3) + k.circle(82, 40, 7, O, 3)
    + k.rod('M106 16L78 52', k.A, 10) + k.rod('M78 52L71 61', k.B, 10)
    + k.path('M71 61Q62 68 60 80Q70 76 75 66Z', O, 2),

  cactus: (k) => k.ground(30)
    + k.path('M50 64H40Q32 64 32 56V40Q32 33 38.5 33Q45 33 45 40V52H50Z')
    + k.path('M70 56H76V34Q76 27 82.5 27Q89 27 89 34V50Q89 64 76 64H70Z')
    + k.rect(50, 20, 20, 62, 10) + k.foil('M50 30a10 10 0 0 1 20 0V82H50Z')
    + k.stroke('M60 28V76', k.B, 3)
    + k.path('M38 84H82L77 106H43Z', k.B) + k.rect(34, 78, 52, 10, 3)
    + k.circle(60, 18, 5, HI, 3),

  sport: (k, u) => {
    const patches = [0, 72, 144, 216, 288].map((a) => {
      const [cx, cy] = polar(60, 60, 40, a - 90);
      return `<polygon points="${PENT(cx, cy, 13, a - 90 + 180)}" fill="${k.B}"/>`;
    }).join('');
    const seams = [0, 72, 144, 216, 288].map((a) => {
      const [x1, y1] = polar(60, 60, 13, a - 90);
      const [x2, y2] = polar(60, 60, 28, a - 90);
      return `M${x1} ${y1}L${x2} ${y2}`;
    }).join('');
    return k.ground(34)
      + `<clipPath id="${u}c"><circle cx="60" cy="60" r="42"/></clipPath>`
      + k.circle(60, 60, 42)
      + `<g clip-path="url(#${u}c)">${patches}</g>`
      + `<polygon points="${PENT(60, 60, 13)}" fill="${k.B}" stroke="${O}" stroke-width="3" stroke-linejoin="round"/>`
      + k.stroke(seams, O, 3)
      + k.foil('M18 60a42 42 0 1 0 84 0a42 42 0 1 0 -84 0Z')
      + k.circle(60, 60, 42, 'none')
      + k.glint('M30 42Q36 30 48 24');
  },

  music: (k) => k.ground(36)
    + k.path('M43 36L97 22V80H89V38L51 48V88H43Z') + k.foil('M43 36L97 22V40L43 54Z')
    + k.ellipse(35, 88, 12, 9, k.A, W, ' transform="rotate(-20 35 88)"')
    + k.ellipse(81, 80, 12, 9, k.A, W, ' transform="rotate(-20 81 80)"')
    + k.glint('M50 40L90 29.5', 2.6)
    + k.sparkle(104, 100, 5) + k.sparkle(16, 30, 6),

  records: (k) => k.ground(50)
    + k.rect(14, 68, 30, 36, 3, k.B) + k.rect(76, 76, 30, 28, 3, k.B)
    + k.rect(44, 50, 32, 54, 3) + k.foil('M44 50H76V104H44Z')
    + k.stroke('M55 64L61 60V84', O, 4.5)
    + k.dot(25, 80, 3, HI) + k.dot(33, 80, 3, HI) + k.dot(87, 88, 3, HI)
    + k.poly(pts(starPoints(60, 30, 14, 6)), k.A, 3.5)
    + k.sparkle(96, 40, 6),

  food: (k) => k.ground(44)
    + k.path('M18 84H102V90Q102 100 92 100H28Q18 100 18 90Z')
    + k.rect(15, 66, 90, 18, 9, k.B)
    + k.path('M14 60Q22 66 30 60T46 60T62 60T78 60T94 60T106 60L104 68H16Z', HI, 3)
    + k.path('M18 58Q18 22 60 22Q102 22 102 58Z') + k.foil('M18 58Q18 22 60 22Q102 22 102 58Z')
    + ['40,38,-20', '56,31,10', '72,35,-10', '62,45,20', '84,45,-25', '46,48,15'].map((s) => {
      const [x, y, a] = s.split(',');
      return `<ellipse cx="${x}" cy="${y}" rx="3.2" ry="1.8" transform="rotate(${a} ${x} ${y})" fill="${HI}"/>`;
    }).join(''),

  geography: (k, u) => k.ground(26)
    + k.rod('M86.3 25.7A40 40 0 0 1 29.7 82.3', k.B, 9)
    + `<clipPath id="${u}c"><circle cx="58" cy="54" r="32"/></clipPath>`
    + k.circle(58, 54, 32)
    + `<g clip-path="url(#${u}c)"><path d="M34 40Q42 28 54 34Q60 46 48 50Q40 58 34 48Z M62 58Q76 48 86 58Q90 72 76 80Q66 74 62 58Z M28 70Q36 66 42 74Q38 84 30 82Z" fill="${k.B}"/>`
    + `<path d="M26 54H90M58 22V86" stroke="${O}" stroke-width="2.4" opacity="0.5"/><ellipse cx="58" cy="54" rx="14" ry="32" fill="none" stroke="${O}" stroke-width="2.4" opacity="0.5"/></g>`
    + k.foil('M26 54a32 32 0 1 0 64 0a32 32 0 1 0 -64 0Z')
    + k.circle(58, 54, 32, 'none')
    + k.rod('M58 94V102', k.B, 9) + k.rod('M42 104H74', k.B, 9)
    + k.glint('M36 36Q42 28 50 25'),

  technology: (k) => k.ground(36)
    + [44, 60, 76].map((p) => k.rod(`M${p} 14V30M${p} 90V106M14 ${p}H30M90 ${p}H106`, k.A, 7)).join('')
    + k.rect(28, 28, 64, 64, 9, k.B)
    + k.rect(42, 42, 36, 36, 5, k.A, 3.5) + k.foil('M42 42H78V78H42Z')
    + k.stroke('M49 60H57L63 52H71M57 68H66', k.B, 3) + k.dot(49, 60, 2.6, k.B) + k.dot(71, 52, 2.6, k.B),

  weapons: (k) => {
    const sword = (a) => `<g transform="rotate(${a} 60 62)">`
      + k.path('M60 12L66 21V76H54V21Z') + k.foil('M60 12L66 21V76H54V21Z') + k.stroke('M60 24V70', k.B, 2.4)
      + k.rect(42, 76, 36, 8, 4, k.B, 3.5) + k.rect(56, 84, 8, 14, 2, k.B, 3) + k.circle(60, 102, 5, k.A, 3) + '</g>';
    return k.ground(38) + sword(-40) + sword(40);
  },

  weird: (k) => k.ground(36)
    + `<path d="M46 72L30 106H90L74 72Z" fill="${HI}" opacity="0.28"/>`
    + k.ellipse(60, 68, 24, 7, k.B, 3.5)
    + k.ellipse(60, 60, 47, 13) + k.foil('M13 60a47 13 0 1 0 94 0a47 13 0 1 0 -94 0Z')
    + k.path('M40 55Q40 30 60 30Q80 30 80 55Z', HI, W, ' fill-opacity="0.9"')
    + [30, 45, 60, 75, 90].map((x) => k.circle(x, 62, 3.4, HI, 2)).join('')
    + k.stroke('M48 42Q51 35 58 34', k.B, 2.6)
    + k.sparkle(18, 24, 5) + k.sparkle(104, 30, 4),

  memes: (k) => k.ground(30)
    + k.circle(60, 60, 42) + k.foil('M18 60a42 42 0 1 0 84 0a42 42 0 1 0 -84 0Z')
    + `<path d="M20 46H100V54H94V66Q94 72 88 72H72Q66 72 66 66V58H54V66Q54 72 48 72H32Q26 72 26 66V54H20Z" fill="${O}"/>`
    + `<rect x="34" y="56" width="6" height="6" fill="${HI}"/><rect x="74" y="56" width="6" height="6" fill="${HI}"/><rect x="40" y="62" width="4" height="4" fill="${HI}" opacity="0.6"/><rect x="80" y="62" width="4" height="4" fill="${HI}" opacity="0.6"/>`
    + k.stroke('M44 84Q60 94 80 80', O, 4.5)
    + k.glint('M30 36Q36 28 46 24'),

  timed: (k) => k.ground(32)
    + k.path('M36 26H84Q84 46 66 60Q84 74 84 94H36Q36 74 54 60Q36 46 36 26Z', HI, W, ' fill-opacity="0.32"')
    + k.path('M44 38H76Q73 49 60 57Q47 49 44 38Z', k.A, 2.5)
    + k.path('M42 94Q48 78 60 76Q72 78 78 94Z', k.A, 2.5)
    + k.stroke('M60 58V78', k.A, 2.6)
    + k.rect(26, 14, 68, 12, 5, k.B) + k.rect(26, 94, 68, 12, 5, k.B)
    + k.glint('M42 30Q42 42 50 50', 2.6),

  open: (k, u) => k.ground(32)
    + `<g transform="rotate(-16 56 100)">${k.rect(34, 26, 40, 60, 6, k.B)}</g>`
    + `<g transform="rotate(16 64 100)">${k.rect(46, 26, 40, 60, 6, k.B)}</g>`
    + k.rect(40, 22, 40, 62, 6) + k.foil('M40 22H80V84H40Z')
    + wGlyph(46, 44, 28, 20, 5.5, O, u)
    + k.glint('M47 30H64', 2.8),

  gem: (k) => k.ground(30)
    + k.poly('36,22 84,22 106,46 60,104 14,46')
    + `<polygon points="36,22 60,22 46,46" fill="#fff" opacity="0.4"/><polygon points="60,22 84,22 74,46" fill="#fff" opacity="0.28"/><polygon points="14,46 36,22 46,46" fill="#fff" opacity="0.2"/>`
    + `<polygon points="14,46 46,46 60,104" fill="${O}" opacity="0.14"/><polygon points="74,46 106,46 60,104" fill="${O}" opacity="0.32"/>`
    + k.foil('M36 22H84L106 46L60 104L14 46Z')
    + k.stroke('M14 46H106M36 22L46 46L60 22L74 46L84 22M46 46L60 104L74 46', O, 2.6)
    + k.poly('36,22 84,22 106,46 60,104 14,46', 'none')
    + k.sparkle(100, 20, 8) + k.sparkle(18, 84, 5),

  laugh: (k) => k.ground(30)
    + k.circle(60, 60, 42) + k.foil('M18 60a42 42 0 1 0 84 0a42 42 0 1 0 -84 0Z')
    + k.stroke('M37 50L45 42L53 50M67 50L75 42L83 50', O, 4.5)
    + k.path('M34 62H86Q86 92 60 92Q34 92 34 62Z', O, 3)
    + `<rect x="40" y="62" width="40" height="7" rx="2" fill="${HI}"/>`
    + k.path('M46 84Q60 74 74 84Q68 91 60 91Q52 91 46 84Z', k.B, 0)
    + k.path('M15 54q-5 9 0 12q5 -3 0 -12z', HI, 2.2) + k.path('M105 54q-5 9 0 12q5 -3 0 -12z', HI, 2.2),

  lamassu: (k) => {
    const wing = k.path('M46 54L8 42Q8 56 20 60L46 64Z') + k.path('M46 64L14 66Q20 76 30 76L46 72Z') + k.path('M46 72L26 82Q32 90 44 84Z', k.B, 3.5)
      + k.stroke('M18 50L40 56M22 70L40 68', k.B, 2.4);
    return k.ground(36)
      + wing + `<g transform="translate(120 0) scale(-1 1)">${wing}</g>`
      + k.path('M52 78L60 102L68 78Z', k.A, 3.5)
      + k.path('M49 50Q38 36 48 22Q48 38 57 46Z', k.A, 3.5) + k.path('M71 50Q82 36 72 22Q72 38 63 46Z', k.A, 3.5)
      + k.circle(60, 62, 17, k.B) + k.foil('M43 62a17 17 0 1 0 34 0a17 17 0 1 0 -34 0Z')
      + `<circle cx="60" cy="62" r="8.5" fill="none" stroke="${HI}" stroke-width="2.6"/>`;
  },

  pixelheart: (k) => k.ground(32) + pixels(k) + k.sparkle(104, 24, 6) + k.sparkle(14, 96, 4),

  dice: (k) => k.ground(44)
    + `<g transform="rotate(-14 40 60)">${k.rect(18, 38, 44, 44, 9, k.B)}${[[29, 49], [40, 60], [51, 71]].map(([x, y]) => k.dot(x, y, 4, HI)).join('')}</g>`
    + `<g transform="rotate(12 78 70)">${k.rect(54, 46, 48, 48, 10)}${k.foil('M54 46H102V94H54Z')}${[[66, 58], [90, 58], [78, 70], [66, 82], [90, 82]].map(([x, y]) => k.dot(x, y, 4.5)).join('')}${k.glint('M60 52H80', 2.6)}</g>`,

  openbook: (k) => k.ground(48)
    + k.path('M12 32V94Q38 90 60 100Q82 90 108 94V32Z', k.B)
    + k.path('M60 34Q40 24 16 28V90Q40 86 60 96Z') + k.path('M60 34Q80 24 104 28V90Q80 86 60 96Z')
    + k.foil('M60 34Q80 24 104 28V90Q80 86 60 96Z')
    + k.stroke('M24 42Q38 38 52 44M24 54Q38 50 52 56M24 66Q38 62 52 68M24 78Q38 74 52 80M68 44Q82 38 96 42M68 56Q82 50 96 54M68 68Q82 62 96 66', k.B, 3)
    + k.path('M84 25V50L89 45L94 50V24Z', HI, 2.6),

  pot: (k) => k.ground(30)
    + k.path(TUB) + k.foil(TUB)
    + k.stroke('M33 74H87', k.B, 6)
    + k.rect(22, 46, 76, 12, 5, k.B)
    + k.path('M28 48Q32 32 48 35Q58 24 72 32Q88 30 92 48Z', HI, 3.5)
    + k.rod('M78 12L64 46', k.A, 10)
    + k.glint('M32 64Q34 78 38 92', 2.6),

  wheel: (k) => k.ground(48)
    + k.path('M24 74A46 46 0 0 1 114 74L106 82H14Z', k.B)
    + k.path(CHEESE) + k.foil(CHEESE)
    + `<path d="M20 82A40 40 0 0 1 100 82" fill="none" stroke="${k.B}" stroke-width="6"/>`
    + k.circle(44, 66, 5.5, k.B, 0) + k.circle(70, 58, 4.5, k.B, 0) + k.circle(62, 74, 3.5, k.B, 0) + k.circle(84, 72, 3, k.B, 0)
    + k.path(CHEESE, 'none')
    + k.path('M28 80H40V90Q40 95 34 95Q28 95 28 90Z', k.A, 3) + k.path('M46 80H53V85Q53 88 49.5 88Q46 88 46 85Z', k.A, 3)
    + k.glint('M28 60Q36 46 50 40'),

  hellfire: (k) => k.ground(32)
    + k.path(FLAME) + k.foil(FLAME)
    + k.path('M60 62C73 62 82 70 82 81C82 87 78 90 76 92V99H44V92C42 90 38 87 38 81C38 70 47 62 60 62Z', HI, 3.5)
    + k.ellipse(51, 81, 5.5, 6, O, 0) + k.ellipse(69, 81, 5.5, 6, O, 0)
    + `<path d="M57.5 91L60 86L62.5 91Z" fill="${O}"/>`
    + k.stroke('M51 94V99M56 94V99M60 94V99M64 94V99M69 94V99', O, 2),

  algorithm: (k) => {
    const node = 'M60 38L78 56L60 74L42 56Z';
    return k.ground(36)
      + k.stroke('M60 26V38M42 56H26V86M78 56H94V86M26 86H94M60 74V86M60 86V98', O, 7)
      + k.stroke('M60 26V38M42 56H26V86M78 56H94V86M26 86H94M60 74V86M60 86V98', k.A, 3)
      + k.rect(40, 10, 40, 16, 8, k.B)
      + k.path(node) + k.foil(node)
      + k.rect(14, 80, 24, 14, 3, k.B, 3.5) + k.rect(82, 80, 24, 14, 3, k.B, 3.5)
      + k.rect(46, 96, 28, 14, 3, k.A, 3.5)
      + k.dot(60, 56, 4.5)
      + `<text x="60" y="22" text-anchor="middle" font-family="ui-monospace, Menlo, monospace" font-size="10" font-weight="700" fill="${HI}">f(x)</text>`
      + `<text x="26" y="91" text-anchor="middle" font-family="ui-monospace, Menlo, monospace" font-size="8" font-weight="700" fill="${HI}">01</text>`
      + `<text x="94" y="91" text-anchor="middle" font-family="ui-monospace, Menlo, monospace" font-size="8" font-weight="700" fill="${HI}">10</text>`
      + k.sparkle(100, 22, 6) + k.sparkle(18, 38, 4);
  },

  erdtree: (k) => {
    const gold = '#f3c969';
    const ticks = Array.from({ length: 24 }, (_, i) => {
      const a = (i / 24) * Math.PI * 2;
      const r1 = 44;
      const r2 = i % 3 ? 48 : 51;
      return `M${(60 + Math.cos(a) * r1).toFixed(1)} ${(58 + Math.sin(a) * r1).toFixed(1)}L${(60 + Math.cos(a) * r2).toFixed(1)} ${(58 + Math.sin(a) * r2).toFixed(1)}`;
    }).join('');
    const crown = 'M60 18C80 18 98 28 98 44C98 58 84 66 60 66C36 66 22 58 22 44C22 28 40 18 60 18Z';
    return k.ground(30)
      + `<circle cx="60" cy="58" r="44" fill="none" stroke="${O}" stroke-width="7"/>`
      + `<circle cx="60" cy="58" r="44" fill="none" stroke="${k.B}" stroke-width="3"/>`
      + k.stroke(ticks, gold, 2.4)
      + k.path(crown, k.A) + k.foil(crown)
      + k.rod('M60 74Q48 60 34 52', gold, 7) + k.rod('M60 74Q72 60 86 52', gold, 7)
      + k.rod('M60 70Q54 50 44 34', gold, 7) + k.rod('M60 70Q66 50 76 32', gold, 7)
      + k.rod('M60 72V26', gold, 8)
      + k.path('M53 104Q57 88 56 72H64Q63 88 67 104Z', gold, 3.5)
      + k.stroke('M53 104Q46 104 40 108M67 104Q74 104 80 108', O, 3)
      + k.sparkle(60, 22, 6) + k.sparkle(30, 40, 3.5) + k.sparkle(92, 38, 4);
  },

  rotor: (k) => {
    const outer = 'M60 99.4L51.6 98.4L43.9 95.3L37.4 90.7L32.5 85.1L29.3 79L27.6 73.2L27 67.9L27.1 63.3L27.3 59.5L27.4 56L27.3 52.5L27.1 48.7L27 44.1L27.6 38.8L29.3 33L32.5 26.9L37.4 21.3L43.9 16.7L51.6 13.6L60 12.6L68.4 13.6L76.1 16.7L82.6 21.3L87.5 26.9L90.7 33L92.4 38.8L93 44.1L92.9 48.7L92.7 52.5L92.6 56L92.7 59.5L92.9 63.3L93 67.9L92.4 73.2L90.7 79L87.5 85.1L82.6 90.7L76.1 95.3L68.4 98.4Z';
    const inner = 'M60 91.4L53.1 90.6L46.8 88.1L41.5 84.3L37.6 79.7L34.9 74.8L33.6 70L33.1 65.7L33.1 62L33.3 58.8L33.4 56L33.3 53.2L33.1 50L33.1 46.3L33.6 42L34.9 37.2L37.6 32.3L41.5 27.7L46.8 23.9L53.1 21.4L60 20.6L66.9 21.4L73.2 23.9L78.5 27.7L82.4 32.3L85.1 37.2L86.4 42L86.9 46.3L86.9 50L86.7 53.2L86.6 56L86.7 58.8L86.9 62L86.9 65.7L86.4 70L85.1 74.8L82.4 79.7L78.5 84.3L73.2 88.1L66.9 90.6Z';
    const rotor = 'M51.3 90Q33.4 67.7 34.3 39.1Q62.5 34.7 86.9 49.8Q76.5 76.5 51.3 90Z';
    return k.ground(34)
      + k.rect(92, 47, 13, 7, 2.5, k.A, 3) + k.rect(92, 58, 13, 7, 2.5, k.A, 3)
      + k.rect(14, 38, 14, 10, 2, k.B, 3) + k.rect(14, 64, 14, 10, 2, k.B, 3)
      + k.path(outer, k.B)
      + `<path d="${inner}" fill="${O}" opacity="0.78"/>`
      + k.path(rotor) + k.foil(rotor)
      + k.circle(57.5, 59.7, 8.5, k.B, 3)
      + `<circle cx="57.5" cy="59.7" r="12.5" fill="none" stroke="${O}" stroke-width="2" stroke-dasharray="2.4 2.4" opacity="0.5"/>`
      + k.circle(60, 56, 3.4, HI, 2.4)
      + k.stroke('M52.2 85.8L51.3 90M37.5 42L34.3 39.1M82.8 51.2L86.9 49.8', HI, 4)
      + k.sparkle(104, 20, 7) + k.sparkle(16, 96, 4.5);
  },

  seal: (k, u) => {
    const wax = waxPath(56, 64, 38, 9, 3);
    return k.ground(36)
      + k.rod('M104 12L38 100', HI, 8)
      + k.path(wax) + k.foil(wax)
      + `<circle cx="56" cy="64" r="26" fill="none" stroke="${k.B}" stroke-width="3.5"/>`
      + wGlyph(42, 54, 28, 20, 5.5, O, u)
      + k.path('M104 12Q84 18 72 42Q90 34 104 12Z', HI, 3);
  }
};

export function emblemMarkup(id) {
  const u = `em${(++seq).toString(36)}`;
  const k = kit(u);
  const draw = EMBLEMS[id] ?? EMBLEMS.open;
  return k.defs + draw(k, u);
}

export function monogramEmblem(letter, spin = 0) {
  const ch = (letter || 'W').slice(0, 1).toUpperCase();
  const u = `em${(++seq).toString(36)}`;
  const k = kit(u);
  const hex = 'M60 12L102 36V84L60 108L18 84V36Z';
  return `${k.defs}${k.ground(30)}<g transform="rotate(${spin % 14 - 7} 60 60)">`
    + k.path(hex) + k.foil(hex)
    + `<path d="M60 12L102 36L60 50L18 36Z" fill="#fff" opacity="0.22"/>`
    + `<path d="M60 22L93 41V79L60 98L27 79V41Z" fill="none" stroke="${k.B}" stroke-width="3"/>`
    + `<text x="60" y="76" text-anchor="middle" font-family="system-ui, sans-serif" font-size="46" font-weight="900" fill="${O}">${ch.replace(/[<&>"]/g, '')}</text>`
    + '</g>';
}

export function emblemSvg(id, { size = 96 } = {}) {
  return `<svg viewBox="0 0 120 120" width="${size}" height="${size}"
    fill="none" aria-hidden="true">${emblemMarkup(id)}</svg>`;
}

export function monogramSvg(letter, spin, { size = 96 } = {}) {
  return `<svg viewBox="0 0 120 120" width="${size}" height="${size}"
    fill="none" aria-hidden="true">${monogramEmblem(letter, spin)}</svg>`;
}
