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
