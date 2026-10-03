import { codeById } from './codedefs.js';
import { isFriendSpec } from './friendcodes.js';
import { themeById } from './data/packs.js';
import { rarityById } from './data/rarities.js';

const P = {
  stars: (s = 1, a = 0.5) => `
    radial-gradient(circle 1.5px at 12% 18%, rgba(255,255,255,${a}) 98%, transparent),
    radial-gradient(circle 1px  at 68% 9%,  rgba(255,255,255,${a * 0.7}) 98%, transparent),
    radial-gradient(circle 1.8px at 42% 38%, rgba(255,255,255,${a}) 98%, transparent),
    radial-gradient(circle 1px  at 88% 30%, rgba(255,255,255,${a * 0.7}) 98%, transparent),
    radial-gradient(circle 1.4px at 22% 60%, rgba(255,255,255,${a * 0.85}) 98%, transparent),
    radial-gradient(circle 1px  at 60% 74%, rgba(255,255,255,${a * 0.6}) 98%, transparent),
    radial-gradient(circle 1.7px at 82% 86%, rgba(255,255,255,${a * 0.9}) 98%, transparent)`,

  orbits: (s = 1, a = 0.16) => `
    repeating-radial-gradient(circle at 82% 12%,
      transparent 0 ${13 * s}px, rgba(255,255,255,${a}) ${13 * s}px ${14 * s}px)`,

  stripes: (s = 1, a = 0.12) => `
    repeating-linear-gradient(64deg,
      transparent 0 ${18 * s}px, rgba(255,255,255,${a}) ${18 * s}px ${26 * s}px,
      transparent ${26 * s}px ${30 * s}px, rgba(255,255,255,${a * 0.55}) ${30 * s}px ${33 * s}px)`,

  checker: (s = 1, a = 0.14) => `
    repeating-conic-gradient(rgba(255,255,255,${a}) 0% 25%, transparent 0% 50%) 0 0 / ${26 * s}px ${26 * s}px`,

  contrails: (s = 1, a = 0.2) => `
    repeating-linear-gradient(-32deg,
      transparent 0 ${26 * s}px, rgba(255,255,255,${a}) ${26 * s}px ${27 * s}px,
      transparent ${27 * s}px ${30 * s}px, rgba(255,255,255,${a}) ${30 * s}px ${31 * s}px,
      transparent ${31 * s}px ${60 * s}px)`,

  pixels: (s = 1, a = 0.1) => `
    repeating-linear-gradient(0deg, rgba(255,255,255,${a}) 0 1px, transparent 1px ${11 * s}px),
    repeating-linear-gradient(90deg, rgba(255,255,255,${a}) 0 1px, transparent 1px ${11 * s}px)`,

  ruled: (s = 1, a = 0.12) => `
    repeating-linear-gradient(0deg,
      transparent 0 ${13 * s}px, rgba(255,255,255,${a}) ${13 * s}px ${14 * s}px)`,

  sprockets: (s = 1, a = 0.35) => `
    radial-gradient(circle ${2.6 * s}px at 5% 50%, rgba(0,0,0,${a}) 97%, transparent) 0 0 / 100% ${14 * s}px,
    radial-gradient(circle ${2.6 * s}px at 95% 50%, rgba(0,0,0,${a}) 97%, transparent) 0 0 / 100% ${14 * s}px`,

  scales: (s = 1, a = 0.13) => `
    radial-gradient(circle at 50% 0, transparent ${9 * s}px, rgba(255,255,255,${a}) ${9.5 * s}px ${10.5 * s}px, transparent ${11 * s}px) 0 0 / ${20 * s}px ${16 * s}px,
    radial-gradient(circle at 0 0, transparent ${9 * s}px, rgba(255,255,255,${a * 0.7}) ${9.5 * s}px ${10.5 * s}px, transparent ${11 * s}px) ${10 * s}px ${8 * s}px / ${20 * s}px ${16 * s}px`,

  petals: (s = 1, a = 0.12) => `
    radial-gradient(ellipse ${7 * s}px ${16 * s}px at 50% 50%, rgba(255,255,255,${a}) 60%, transparent 62%) 0 0 / ${24 * s}px ${34 * s}px,
    radial-gradient(ellipse ${7 * s}px ${16 * s}px at 50% 50%, rgba(255,255,255,${a * 0.6}) 60%, transparent 62%) ${12 * s}px ${17 * s}px / ${24 * s}px ${34 * s}px`,

  rays: (s = 1, a = 0.1) => `
    repeating-conic-gradient(from 168deg at 50% -8%,
      rgba(255,255,255,${a}) 0deg ${5 * s}deg, transparent ${5 * s}deg ${17 * s}deg)`,

  columns: (s = 1, a = 0.1) => `
    repeating-linear-gradient(90deg,
      rgba(255,255,255,${a}) 0 ${2 * s}px, transparent ${2 * s}px ${5 * s}px,
      rgba(0,0,0,${a}) ${5 * s}px ${7 * s}px, transparent ${7 * s}px ${18 * s}px)`,

  waves: (s = 1, a = 0.12) => `
    repeating-radial-gradient(ellipse ${40 * s}px ${10 * s}px at 50% 120%,
      rgba(255,255,255,${a}) 0 1px, transparent 2px ${11 * s}px)`,

  zigzag: (s = 1, a = 0.12) => `
    repeating-linear-gradient(45deg, rgba(255,255,255,${a}) 0 1.5px, transparent 1.5px ${13 * s}px),
    repeating-linear-gradient(-45deg, rgba(255,255,255,${a}) 0 1.5px, transparent 1.5px ${13 * s}px)`,

  facets: (s = 1, a = 0.14) => `
    repeating-linear-gradient(60deg, rgba(255,255,255,${a}) 0 1px, transparent 1px ${21 * s}px),
    repeating-linear-gradient(-60deg, rgba(255,255,255,${a}) 0 1px, transparent 1px ${21 * s}px),
    repeating-linear-gradient(0deg, rgba(0,0,0,${a}) 0 1px, transparent 1px ${21 * s}px)`,

  goldleaf: (s = 1, a = 0.16) => `
    repeating-linear-gradient(28deg, rgba(255,247,214,${a}) 0 2px, transparent 2px ${17 * s}px),
    repeating-linear-gradient(-64deg, rgba(255,247,214,${a * 0.7}) 0 1px, transparent 1px ${29 * s}px),
    repeating-linear-gradient(96deg, rgba(0,0,0,${a * 0.5}) 0 1px, transparent 1px ${41 * s}px)`,

  linen: (s = 1, a = 0.12) => `
    repeating-linear-gradient(0deg, rgba(255,255,255,${a}) 0 1px, transparent 1px ${5 * s}px),
    repeating-linear-gradient(90deg, rgba(255,255,255,${a * 0.8}) 0 1px, transparent 1px ${5 * s}px),
    repeating-linear-gradient(0deg, rgba(0,0,0,${a * 0.4}) 0 1px, transparent 1px ${19 * s}px)`,

  grooves: (s = 1, a = 0.14) => `
    repeating-radial-gradient(circle at 50% 42%,
      transparent 0 ${9 * s}px, rgba(255,255,255,${a}) ${9 * s}px ${10 * s}px)`,

  epitrochoid: (s = 1, a = 0.13) => `
    repeating-radial-gradient(ellipse ${30 * s}px ${44 * s}px at 50% 46%,
      transparent 0 ${10 * s}px, rgba(255,255,255,${a}) ${10 * s}px ${11 * s}px),
    repeating-conic-gradient(from 0deg at 50% 46%,
      rgba(255,255,255,${a * 0.7}) 0deg 2deg, transparent 2deg 120deg)`,

  runes: (s = 1, a = 0.13) => `
    repeating-radial-gradient(circle at 50% 40%,
      transparent 0 ${22 * s}px, rgba(255,226,150,${a}) ${22 * s}px ${23 * s}px, transparent ${23 * s}px ${26 * s}px,
      rgba(255,226,150,${a * 0.5}) ${26 * s}px ${27 * s}px, transparent ${27 * s}px ${44 * s}px),
    repeating-conic-gradient(from 6deg at 50% 40%,
      rgba(255,226,150,${a * 0.8}) 0deg 1.5deg, transparent 1.5deg 30deg)`,

  circuit: (s = 1, a = 0.12) => `
    repeating-linear-gradient(0deg, rgba(255,255,255,${a}) 0 1px, transparent 1px ${17 * s}px),
    repeating-linear-gradient(90deg, rgba(255,255,255,${a * 0.8}) 0 1px, transparent 1px ${23 * s}px),
    radial-gradient(circle 2px at 30% 24%, rgba(255,255,255,${a * 2.2}) 97%, transparent),
    radial-gradient(circle 2px at 72% 58%, rgba(255,255,255,${a * 2.2}) 97%, transparent),
    radial-gradient(circle 2px at 18% 78%, rgba(255,255,255,${a * 2.2}) 97%, transparent)`,

  contours: (s = 1, a = 0.12) => `
    repeating-radial-gradient(ellipse ${52 * s}px ${34 * s}px at 28% 30%,
      transparent 0 ${9 * s}px, rgba(255,255,255,${a}) ${9 * s}px ${10 * s}px),
    repeating-radial-gradient(ellipse ${44 * s}px ${30 * s}px at 78% 74%,
      transparent 0 ${11 * s}px, rgba(255,255,255,${a * 0.7}) ${11 * s}px ${12 * s}px)`,

  swirl: (s = 1, a = 0.1) => `
    repeating-conic-gradient(from 8deg at 50% 46%,
      rgba(255,255,255,${a}) 0deg ${9 * s}deg, transparent ${9 * s}deg ${30 * s}deg)`
};

const holo = (angle = 115, a = 1) => `
  repeating-linear-gradient(${angle}deg,
    rgba(255, 90, 90,${0.10 * a}) 0 14px, rgba(255,200, 80,${0.10 * a}) 14px 28px,
    rgba(120,255,160,${0.10 * a}) 28px 42px, rgba( 90,180,255,${0.12 * a}) 42px 56px,
    rgba(190,120,255,${0.11 * a}) 56px 70px)`;

const burst = (shapes, colors, { count = 26, spread = 1, gravity = 0.35 } = {}) =>
  ({ shapes, colors, count, spread, gravity });

const THEME_STYLES = {
  cars:        { family: 'sash', foil: P.stripes(1, 0.13),      holoAngle: 64,
                 particles: burst(['streak', 'shard'], ['#f87171', '#ffe1e1', '#ffffff'], { spread: 1.3, gravity: 0.2 }) },
  f1:          { family: 'sash', foil: P.checker(1, 0.12),      holoAngle: 105,
                 particles: burst(['square', 'square-alt'], ['#f8fafc', '#111318', '#ef4444'], { count: 30, gravity: 0.5 }) },
  planes:      { family: 'roundel', foil: P.contrails(1, 0.2),     holoAngle: 148,
                 particles: burst(['streak', 'orb'], ['#bfdbfe', '#ffffff', '#60a5fa'], { spread: 1.4, gravity: 0.1 }) },
  'video-games': { family: 'panel', foil: P.pixels(1, 0.11),     holoAngle: 90,
                 particles: burst(['square', 'square', 'square-alt'], ['#4ade80', '#facc15', '#38bdf8', '#f472b6'], { count: 34, gravity: 0.45 }) },
  books:       { family: 'plate', foil: P.ruled(1, 0.12),        holoAngle: 100,
                 particles: burst(['page', 'page'], ['#fde68a', '#fef3c7', '#d6b25e'], { count: 22, gravity: 0.8 }) },
  movies:      { family: 'marquee', foil: P.sprockets(1, 0.4),     holoAngle: 120,
                 particles: burst(['frame', 'star4'], ['#facc15', '#f8fafc', '#171717'], { gravity: 0.5 }) },
  space:       { family: 'roundel', foil: P.stars(1, 0.5),         holoAngle: 122,
                 particles: burst(['star4', 'orb', 'ring'], ['#c4b5fd', '#67e8f9', '#ffffff'], { spread: 1.2, gravity: 0 }) },
  physics:     { family: 'roundel', foil: P.orbits(1, 0.15),       holoAngle: 132,
                 particles: burst(['orb', 'ring'], ['#22d3ee', '#a78bfa', '#ffffff'], { gravity: 0.05 }) },
  nature:      { family: 'arch', foil: P.zigzag(1, 0.12),       holoAngle: 118,
                 particles: burst(['petal', 'orb'], ['#86efac', '#fbbf24', '#dcfce7'], { gravity: 0.6 }) },
  animals:     { family: 'arch', foil: P.scales(1, 0.13),       holoAngle: 108,
                 particles: burst(['orb', 'shard'], ['#fbbf24', '#fb923c', '#fff7ed'], { gravity: 0.45 }) },
  plants:      { family: 'arch', foil: P.petals(1, 0.12),       holoAngle: 96,
                 particles: burst(['petal', 'petal', 'orb'], ['#86efac', '#4ade80', '#fef9c3'], { count: 30, gravity: 0.55 }) },
  history:     { family: 'plate', foil: P.columns(1, 0.1),       holoAngle: 90,
                 particles: burst(['shard', 'page'], ['#d6b25e', '#a8a29e', '#f5f5f4'], { gravity: 0.7 }) },
  philosophy:  { family: 'roundel', foil: P.orbits(1.6, 0.13),     holoAngle: 140,
                 particles: burst(['ring', 'orb'], ['#e0e7ff', '#a5b4fc', '#ffffff'], { count: 20, gravity: 0.1 }) },
  celebrities: { family: 'marquee', foil: P.rays(1, 0.11),         holoAngle: 112,
                 particles: burst(['star5', 'star4'], ['#fde047', '#ffffff', '#f9a8d4'], { count: 30, gravity: 0.3 }) },
  quotes:      { family: 'plate', foil: P.ruled(1.5, 0.1),       holoAngle: 102,
                 particles: burst(['comma', 'page'], ['#f8fafc', '#cbd5e1', '#94a3b8'], { count: 22, gravity: 0.6 }) },
  art:         { family: 'marquee', foil: P.waves(1, 0.13),        holoAngle: 84,
                 particles: burst(['blob', 'blob', 'orb'], ['#f472b6', '#fbbf24', '#38bdf8', '#4ade80'], { count: 30, gravity: 0.5 }) },
  cactus:      { family: 'arch', foil: P.petals(0.7, 0.1),      holoAngle: 76,
                 particles: burst(['spike', 'orb'], ['#4ade80', '#fbbf24', '#dcfce7'], { spread: 1.4, gravity: 0.4 }) },
  sport:       { family: 'sash', foil: P.stripes(1.4, 0.11),    holoAngle: 58,
                 particles: burst(['square-alt', 'orb'], ['#fbbf24', '#f8fafc', '#38bdf8'], { count: 30, gravity: 0.5 }) },
  music:       { family: 'marquee', foil: P.grooves(1, 0.13),   holoAngle: 96,
                 particles: burst(['ring', 'orb', 'star4'], ['#ff4fa3', '#ffd6ec', '#ffffff'], { count: 28, gravity: 0.25 }) },
  records:     { family: 'plate', foil: P.rays(1.2, 0.12),      holoAngle: 108,
                 particles: burst(['star5', 'star4'], ['#ffe9a3', '#e6edf7', '#ffffff'], { count: 30, gravity: 0.3 }) },
  food:        { family: 'arch', foil: P.petals(0.9, 0.11),     holoAngle: 88,
                 particles: burst(['blob', 'orb'], ['#ff6b57', '#ffd8a8', '#fff7ed'], { count: 26, gravity: 0.6 }) },
  geography:   { family: 'roundel', foil: P.contours(1, 0.13),  holoAngle: 124,
                 particles: burst(['orb', 'shard'], ['#0ea5e9', '#bae6fd', '#ffffff'], { gravity: 0.35 }) },
  technology:  { family: 'panel', foil: P.circuit(1, 0.12),     holoAngle: 90,
                 particles: burst(['square', 'streak'], ['#4cc9f0', '#a5f3fc', '#ffffff'], { count: 30, gravity: 0.2 }) },
  weapons:     { family: 'sash', foil: P.facets(0.9, 0.12),     holoAngle: 70,
                 particles: burst(['shard', 'streak'], ['#cbd5e1', '#ffffff', '#ffb86b'], { spread: 1.3, gravity: 0.3 }) },
  weird:       { family: 'panel', foil: P.swirl(1, 0.1),        holoAngle: 134,
                 particles: burst(['ring', 'star4', 'orb'], ['#a3e635', '#d8b4fe', '#ffffff'], { count: 30, spread: 1.3, gravity: 0.05 }) },
  memes:       { family: 'marquee', foil: P.pixels(1.5, 0.12),  holoAngle: 82,
                 particles: burst(['square', 'star5'], ['#ffd60a', '#38bdf8', '#ffffff'], { count: 34, gravity: 0.5 }) }
};

const TIMED_STYLE = {
  family: 'roundel',
  foil: P.orbits(0.8, 0.14), holoAngle: 126,
  particles: burst(['orb', 'ring'], ['#38bdf8', '#bae6fd', '#ffffff'], { count: 20, gravity: 0.15 })
};
const OPEN_STYLE = {
  family: 'roundel',
  foil: P.stars(1.4, 0.3), holoAngle: 116,
  particles: burst(['orb', 'star4'], ['#cbd5e1', '#ffffff'], { count: 22, gravity: 0.3 })
};

function hashSeed(text) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function mulberry(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const PROC_PATTERNS = ['stars', 'orbits', 'stripes', 'pixels', 'ruled', 'scales',
  'petals', 'rays', 'waves', 'zigzag', 'checker', 'columns'];
const PROC_FAMILIES = ['sash', 'roundel', 'plate', 'marquee', 'arch', 'panel'];
const PROC_SHAPES = [['shard', 'orb'], ['square', 'square-alt'], ['star4', 'orb'],
  ['petal', 'orb'], ['ring', 'orb'], ['blob', 'star4'], ['streak', 'shard'], ['page', 'shard']];

export function proceduralStyle(seedText) {
  const rng = mulberry(hashSeed(String(seedText)));

  const hue = Math.floor(rng() * 360);
  const hueShift = (hue + 18 + Math.floor(rng() * 40)) % 360;
  const sat = 62 + Math.floor(rng() * 26);
  const accent = `hsl(${hue} ${sat}% ${58 + Math.floor(rng() * 10)}%)`;
  const accent2 = `hsl(${hueShift} ${Math.min(85, sat + 8)}% ${16 + Math.floor(rng() * 8)}%)`;

  const patternId = PROC_PATTERNS[Math.floor(rng() * PROC_PATTERNS.length)];
  const scale = 0.7 + rng() * 0.9;
  const alpha = 0.09 + rng() * 0.09;
  const foil = P[patternId](scale, alpha);

  const shapes = PROC_SHAPES[Math.floor(rng() * PROC_SHAPES.length)];
  const light = `hsl(${hue} ${sat}% 85%)`;
  const particles = burst(shapes, [accent, light, '#ffffff'], {
    count: 22 + Math.floor(rng() * 12),
    spread: 0.9 + rng() * 0.6,
    gravity: rng() * 0.7
  });

  return {
    accent, accent2, foil,
    holoAngle: 60 + Math.floor(rng() * 90),
    holoStrength: 0.8 + rng() * 0.5,
    particles
  };
}

export function customSeed(spec) {
  if (spec.wiki?.apiUrl) {
    try {
      const url = new URL(spec.wiki.apiUrl);
      return url.host + url.pathname.replace('/api.php', '');
    } catch {}
  }
  return spec.customId ?? spec.customName ?? 'custom';
}

export function styleForSpec(spec) {
  if (isFriendSpec(spec)) {
    const accent = spec.accent ?? '#64748b';
    const accent2 = spec.accent2 ?? '#1e2233';
    return {
      accent, accent2,
      foil: P.facets(1, 0.15),
      holo: holo(102, 1.2),
      particles: burst(['orb', 'star4'], [accent, '#ffffff', accent2], { count: 34, spread: 1.3, gravity: 0.25 }),
      family: 'plate',
      emblem: { kind: 'drawn', id: spec.emblem ?? 'seal' }
    };
  }
  if (spec.kind === 'code') {
    const code = codeById(spec.codeId);
    if (code) {
      const light = code.light ?? '#ffffff';
      return {
        accent: code.accent, accent2: code.accent2,
        foil: (P[code.foil] ?? P.facets)(1, 0.15),
        holo: holo(102, 1.2),
        particles: burst(code.shapes ?? ['orb', 'star4'], [code.accent, light, '#ffffff'], { count: 34, spread: 1.3, gravity: 0.25 }),
        family: code.family ?? 'plate',
        emblem: { kind: 'drawn', id: code.emblem ?? 'seal' }
      };
    }
  }

  if (spec.kind === 'custom') {
    const style = proceduralStyle(customSeed(spec));
    const seed = hashSeed(String(customSeed(spec)));
    const letter = (spec.customName ?? spec.wiki?.sitename ?? 'W').trim().charAt(0) || 'W';
    return {
      ...style,
      holo: holo(style.holoAngle, style.holoStrength),
      family: PROC_FAMILIES[seed % PROC_FAMILIES.length],
      emblem: { kind: 'monogram', letter, spin: seed % 14 }
    };
  }

  if (spec.kind === 'timed') {
    return { accent: '#38bdf8', accent2: '#0c4a6e', foil: TIMED_STYLE.foil,
      holo: holo(TIMED_STYLE.holoAngle), particles: TIMED_STYLE.particles,
      family: TIMED_STYLE.family, emblem: { kind: 'drawn', id: 'timed' } };
  }

  const theme = themeById(spec.themeId);
  if (theme) {
    const s = theme.style
      ? { family: theme.style.family, foil: (P[theme.style.foil] ?? P.facets)(1, 0.14), holoAngle: theme.style.holoAngle,
          particles: burst(theme.style.shapes, theme.style.colors, { count: 30, spread: 1.2, gravity: 0.3 }) }
      : (THEME_STYLES[theme.id] ?? OPEN_STYLE);
    return { accent: theme.accent, accent2: theme.accent2, foil: s.foil,
      holo: holo(s.holoAngle ?? 115), particles: s.particles,
      family: s.family ?? 'roundel', emblem: { kind: 'drawn', id: theme.emblem ?? theme.id } };
  }

  if (spec.rarityId) {
    const rarity = rarityById(spec.rarityId);
    return { accent: rarity.color, accent2: '#1e2233', foil: P.facets(1, 0.15),
      holo: holo(118), particles: burst(['shard', 'star4'], [rarity.color, '#ffffff'], { count: 28, gravity: 0.25 }),
      family: 'roundel', emblem: { kind: 'drawn', id: 'gem' } };
  }

  return { accent: '#94a3b8', accent2: '#334155', foil: OPEN_STYLE.foil,
    holo: holo(OPEN_STYLE.holoAngle), particles: OPEN_STYLE.particles,
    family: OPEN_STYLE.family, emblem: { kind: 'drawn', id: 'open' } };
}

export function rarityBurst(rarity) {
  return burst(['star4', 'orb', 'shard'], [rarity.color, '#ffffff'],
    { count: 18, spread: 1.1, gravity: 0.2 });
}
