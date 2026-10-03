import { RARITIES } from './data/rarities.js';
import { tune } from './live.js';

export const MAX_TIMED_LEVEL = 10;
export const TIMED_CARDS = 3;

export const LEVEL_STEPS = [0, 20, 55, 110, 200, 340, 560, 900, 1400, 2100];

export function timedLevel(opened = 0) {
  let level = 1;
  for (let i = 1; i < LEVEL_STEPS.length; i++) if (opened >= LEVEL_STEPS[i]) level = i + 1;
  return level;
}

export function levelBounds(opened = 0) {
  const level = timedLevel(opened);
  const from = LEVEL_STEPS[level - 1];
  const to = level >= MAX_TIMED_LEVEL ? LEVEL_STEPS[MAX_TIMED_LEVEL - 1] : LEVEL_STEPS[level];
  return { level, from, to };
}

export function levelProgress(opened = 0) {
  const { level, from, to } = levelBounds(opened);
  if (level >= MAX_TIMED_LEVEL) return 1;
  return Math.min(1, Math.max(0, (opened - from) / (to - from)));
}

const lerp = (a, b, level) => a + (b - a) * ((level - 1) / (MAX_TIMED_LEVEL - 1));

export const regenMs = (level) => Math.round(lerp(10, 3, level) * 60 * 1000 * tune('timed.regenMult'));

export const maxHeld = (level) => Math.max(1, Math.round(lerp(7, 20, level)) + tune('timed.capBonus'));

export function timedDrawCaps(level) {
  const cap = lerp(0.755, 1, level);
  return { minPopularity: null, maxPopularity: cap >= 0.995 ? null : cap };
}

export function timedTopTier(level) {
  const { maxPopularity } = timedDrawCaps(level);
  if (maxPopularity === null) return RARITIES[RARITIES.length - 1];
  for (let i = RARITIES.length - 1; i >= 0; i--) {
    if (RARITIES[i].minPop < maxPopularity) return RARITIES[i];
  }
  return RARITIES[0];
}

export const timedSpec = (level) => ({
  kind: 'timed',
  themeId: null,
  rarityId: null,
  cards: TIMED_CARDS,
  timedLevel: level
});

export const emptyTimed = () => ({ count: 0, last: Date.now(), opened: 0 });

export function accrue(timed, now = Date.now()) {
  const level = timedLevel(timed.opened ?? 0);
  const cap = maxHeld(level);
  const step = regenMs(level);

  if (!Number.isFinite(timed.last)) timed.last = now;
  if ((timed.count ?? 0) >= cap) {
    timed.count = cap;
    timed.last = now;
    return timed;
  }

  const earned = Math.floor((now - timed.last) / step);
  if (earned > 0) {
    const room = cap - timed.count;
    const added = Math.min(room, earned);
    timed.count += added;
    timed.last = timed.count >= cap ? now : timed.last + earned * step;
  }
  return timed;
}

export function msToNext(timed, now = Date.now()) {
  const level = timedLevel(timed.opened ?? 0);
  if ((timed.count ?? 0) >= maxHeld(level)) return null;
  return Math.max(0, timed.last + regenMs(level) - now);
}

export function levelPerks(level) {
  return {
    regen: Math.round(regenMs(level) / 60000),
    max: maxHeld(level),
    top: RARITIES[RARITIES.length - 1].id
  };
}
