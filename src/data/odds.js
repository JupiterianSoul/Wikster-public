import { RARITIES, rarityRank } from './rarities.js';
import { activeEvents, eventFits, livePackById, tune } from '../live.js';

const TABLE = {
  none:      [68,   18,   8,    3.5,  1.6,  0.6,  0.25, 0.05],
  common:    [68,   18,   8,    3.5,  1.6,  0.6,  0.25, 0.05],
  uncommon:  [50,   28,   13,   5.5,  2.2,  0.9,  0.35, 0.05],
  rare:      [34,   30,   20,   9,    4.2,  1.8,  0.85, 0.15],
  epic:      [20,   26,   26,   16,   7.5,  3,    1.3,  0.2],
  legendary: [11,   18,   25,   23,   14,   6,    2.6,  0.4],
  mythic:    [6,    11,   19,   24,   22,   12,   5,    1],
  exotic:    [3,    6,    12,   19,   24,   20,   13,   3],
  prismatic: [1.5,  3,    7,    13,   20,   24,   20,   11.5]
};

export const oddsFor = (rarityId) => TABLE[rarityId ?? 'none'] ?? TABLE.none;

export function liveOddsFor(rarityId, spec = null, now = Date.now()) {
  const tuned = tune('odds.table')?.[rarityId ?? 'none'];
  const pack = !rarityId && spec?.themeId ? livePackById(spec.themeId)?.odds : null;
  let row = [...(pack ?? tuned ?? oddsFor(rarityId))];
  for (const event of activeEvents('drop_rate', now)) {
    if (!eventFits(event, spec)) continue;
    const mult = event.params.mult && typeof event.params.mult === 'object' ? event.params.mult : {};
    row = row.map((w, i) => {
      const m = Number(mult[RARITIES[i].id]);
      return Number.isFinite(m) && m >= 0 ? w * Math.min(100, m) : w;
    });
  }
  const total = row.reduce((a, b) => a + b, 0);
  return total > 0 ? row.map((w) => (w * 100) / total) : [...oddsFor(rarityId)];
}

export const oddsRows = (rarityId, spec = null) =>
  liveOddsFor(rarityId, spec).map((pct, i) => ({ rarity: RARITIES[i], pct }));

export function rollRarity(rarityId, rng = Math.random) {
  const row = Array.isArray(rarityId) ? rarityId : oddsFor(rarityId);
  let ticket = rng() * (row.reduce((a, b) => a + b, 0) || 100);
  for (let i = 0; i < row.length; i++) {
    ticket -= row[i];
    if (ticket < 0) return RARITIES[i].id;
  }
  return RARITIES[0].id;
}

export function chanceOfAtLeast(rarityId, wanted) {
  const from = rarityRank(wanted);
  return oddsFor(rarityId).slice(from).reduce((sum, pct) => sum + pct, 0) / 100;
}
