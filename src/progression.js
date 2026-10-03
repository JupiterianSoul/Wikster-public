import { RARITIES, rarityRank } from './data/rarities.js';
import { THEME_PACKS } from './data/packs.js';
import { eventMult, tune } from './live.js';

export const MAX_LEVEL = 500;

const XP_BY_RANK = [12, 20, 34, 62, 130, 280, 600, 1300];

export const xpForCard = (rarityId, now = Date.now()) =>
  Math.round((XP_BY_RANK[rarityRank(rarityId)] ?? XP_BY_RANK[0]) * tune('xp.mult') * eventMult('xp', now));

export function xpForLevel(level) {
  if (level >= MAX_LEVEL) return Infinity;
  const raw = 180 + (level - 1) * 17 + Math.pow(level, 1.25) * 1.6;
  return Math.round(raw / 5) * 5;
}

export const RANKS = [
  { min: 1,   name: { en: 'Newcomer',      fr: 'Nouveau venu' } },
  { min: 10,  name: { en: 'Collector',     fr: 'Collectionneur' } },
  { min: 25,  name: { en: 'Archivist',     fr: 'Archiviste' } },
  { min: 50,  name: { en: 'Curator',       fr: 'Conservateur' } },
  { min: 80,  name: { en: 'Scholar',       fr: 'Érudit' } },
  { min: 120, name: { en: 'Historian',     fr: 'Historien' } },
  { min: 170, name: { en: 'Sage',          fr: 'Sage' } },
  { min: 230, name: { en: 'Luminary',      fr: 'Sommité' } },
  { min: 300, name: { en: 'Polymath',      fr: 'Polymathe' } },
  { min: 400, name: { en: 'Encyclopedist', fr: 'Encyclopédiste' } }
];

export const rankFor = (level) =>
  [...RANKS].reverse().find((rank) => level >= rank.min) ?? RANKS[0];

export function rewardForLevel(level) {
  const coins = Math.round((90 + level * 11) / 5) * 5;

  if (level % 25 === 0) {
    return { type: 'both', coins: coins * 4, spec: rewardBooster(level, 'high') };
  }
  if (level % 10 === 0) {
    return { type: 'booster', spec: rewardBooster(level, 'mid') };
  }
  if (level % 5 === 0) {
    return { type: 'booster', spec: rewardBooster(level, 'low') };
  }
  return { type: 'coins', coins };
}

function rewardTier(level, grade) {
  const ceiling = level >= 300 ? 6 : level >= 150 ? 5 : level >= 60 ? 4 : level >= 20 ? 3 : 2;
  const wanted = grade === 'high' ? 4 : grade === 'mid' ? 3 : 1;
  return RARITIES[Math.min(ceiling, wanted + Math.floor(level / 100))].id;
}

function rewardBooster(level, grade) {
  const theme = THEME_PACKS[(level * 7) % THEME_PACKS.length];
  return {
    kind: 'theme',
    themeId: theme.id,
    rarityId: grade === 'low' ? null : rewardTier(level, grade),
    cards: grade === 'high' ? 6 : grade === 'mid' ? 5 : 4
  };
}

export function clampLevel(value) {
  const n = Math.floor(Number(value));
  if (n === Infinity) return MAX_LEVEL;
  return Number.isFinite(n) && n >= 1 ? Math.min(n, MAX_LEVEL) : 1;
}

export const levelOf = (progress) => clampLevel(progress?.level);

export const atMaxLevel = (progress) => levelOf(progress) >= MAX_LEVEL;

export function cleanPending(list) {
  if (!Array.isArray(list)) return [];
  return list.filter((n) => Number.isInteger(n) && n >= 2 && n <= MAX_LEVEL);
}

export function normalizeProgress(progress) {
  const level = levelOf(progress);
  const xp = Math.floor(Number(progress.xp));
  progress.level = level;
  progress.xp = level >= MAX_LEVEL || !Number.isFinite(xp) || xp < 0 ? 0 : xp;
  return progress;
}

export function addXp(progress, amount) {
  const gained = [];
  normalizeProgress(progress);
  const add = Math.round(Number(amount));
  if (Number.isFinite(add) && add > 0 && progress.level < MAX_LEVEL) progress.xp += add;

  while (progress.level < MAX_LEVEL && progress.xp >= xpForLevel(progress.level)) {
    progress.xp -= xpForLevel(progress.level);
    progress.level += 1;
    gained.push(progress.level);
  }
  if (progress.level >= MAX_LEVEL) progress.xp = 0;
  return gained;
}

export function xpToNext(progress) {
  return atMaxLevel(progress) ? null : xpForLevel(levelOf(progress));
}

export function levelFraction(progress) {
  const level = levelOf(progress);
  if (level >= MAX_LEVEL) return 1;
  const need = xpForLevel(level);
  const xp = Number(progress?.xp);
  return need > 0 && Number.isFinite(xp) ? Math.min(1, Math.max(0, xp / need)) : 0;
}
