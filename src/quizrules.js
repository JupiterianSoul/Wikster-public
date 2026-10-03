import { rarityRank } from './data/rarities.js';

export function questionCountFor(rarityId) {
  const rank = rarityRank(rarityId);
  if (rank >= 4) return 5;
  if (rank >= 2) return 4;
  return 3;
}

export const QUIZ_MONEY = { small: 40, medium: 120, large: 350 };

export const QUIZ_PER_DAY = 5;

export const QUIZ_POINTS_PER_ANSWER = 200;

export function quizRewards(correct, themeId) {
  const rewards = { money: 0, card: false, booster: null };
  if (correct === 1) rewards.money = QUIZ_MONEY.small;
  if (correct >= 2) rewards.card = true;
  if (correct === 3) rewards.booster = { kind: 'theme', themeId, rarityId: null, cards: 3 };
  if (correct === 4) rewards.money = QUIZ_MONEY.medium;
  if (correct === 5) {
    rewards.money = QUIZ_MONEY.large;
    rewards.booster = { kind: 'theme', themeId, rarityId: 'rare', cards: 5 };
  }
  return rewards;
}
