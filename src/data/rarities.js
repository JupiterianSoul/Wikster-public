export const RARITIES = [
  { id: 'common',    name: { en: 'Common', fr: 'Commune' },        minPop: 0,     bonusPct: 0,    color: '#9aa5b1', glow: 'rgba(154, 165, 177, 0.45)', flash: 0 },
  { id: 'uncommon',  name: { en: 'Uncommon', fr: 'Peu commune' },  minPop: 0.53,  bonusPct: 25,   color: '#4ade80', glow: 'rgba(74, 222, 128, 0.5)',   flash: 0 },
  { id: 'rare',      name: { en: 'Rare', fr: 'Rare' },             minPop: 0.655, bonusPct: 60,   color: '#3b82f6', glow: 'rgba(59, 130, 246, 0.55)',  flash: 0.12 },
  { id: 'epic',      name: { en: 'Epic', fr: 'Épique' },           minPop: 0.755, bonusPct: 140,  color: '#c084fc', glow: 'rgba(192, 132, 252, 0.65)', flash: 0.3 },
  { id: 'legendary', name: { en: 'Legendary', fr: 'Légendaire' },  minPop: 0.83,  bonusPct: 320,  color: '#fbbf24', glow: 'rgba(251, 191, 36, 0.75)',  flash: 0.55 },
  { id: 'mythic',    name: { en: 'Mythic', fr: 'Mythique' },       minPop: 0.885, bonusPct: 700,  color: '#e02134', glow: 'rgba(224, 33, 52, 0.8)',    flash: 0.72 },
  { id: 'exotic',    name: { en: 'Exotic', fr: 'Exotique' },       minPop: 0.93,  bonusPct: 1500, color: '#22d3ee', glow: 'rgba(34, 211, 238, 0.85)',  flash: 0.88 },
  { id: 'prismatic', name: { en: 'Prismatic', fr: 'Prismatique' }, minPop: 0.97,  bonusPct: 3200, color: '#f472b6', glow: 'rgba(244, 114, 182, 0.95)', flash: 1 }
];

const LEGACY_IDS = { artifact: 'prismatic' };
export const normalizeRarityId = (id) => LEGACY_IDS[id] ?? id;
export const rarityIdAliases = (id) =>
  [id, ...Object.keys(LEGACY_IDS).filter((old) => LEGACY_IDS[old] === id)];

export const SPECIAL = {
  id: 'special', name: { en: 'Special', fr: 'Spéciale' }, minPop: 2, bonusPct: 3200,
  color: '#ffffff', glow: 'rgba(255, 255, 255, 0.9)', flash: 1
};

export const rarityRank = (id) =>
  normalizeRarityId(id) === SPECIAL.id ? RARITIES.length : RARITIES.findIndex((r) => r.id === normalizeRarityId(id));
export const rarityById = (id) =>
  normalizeRarityId(id) === SPECIAL.id ? SPECIAL : (RARITIES.find((r) => r.id === normalizeRarityId(id)) ?? RARITIES[0]);

export function rarityFromPopularity(popularity) {
  const p = Number.isFinite(popularity) ? popularity : 0;
  for (let i = RARITIES.length - 1; i >= 0; i--) {
    if (p >= RARITIES[i].minPop) return RARITIES[i];
  }
  return RARITIES[0];
}

export const rarityText = (rarity) =>
  rarity?.id ? `var(--rarity-${normalizeRarityId(rarity.id)}-text, ${rarity.color})` : (rarity?.color ?? 'inherit');

export const rarityOfCard = (card) =>
  card?.rarityId ? rarityById(card.rarityId) : rarityFromPopularity(card?.popularity);
