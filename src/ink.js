import { rarityRank } from './data/rarities.js';

export const INK_KEY = 'wikster.ink.v1';
export const INK_NAME = 'Ink';

export const EXCHANGE_RATE = 60;

export const THEME_PRICE = 120;
export const CUSTOM_THEME_PRICE = 500;
export const FRAME_PRICE = 150;
export const FRAME_PRICE_EPIC = 300;
export const FRAME_PRICE_LEGENDARY = 500;
export const LOOK_PRICE = 100;
export const OPENING_PRICE = 140;
const FX_PRICES = [25, 30, 40, 50, 65, 80, 100, 120];
export const fxPrice = (rarityId) => FX_PRICES[Math.max(0, Math.min(FX_PRICES.length - 1, rarityRank(rarityId)))];

const read = () => {
  try {
    const v = JSON.parse(localStorage.getItem(INK_KEY) ?? 'null');
    return Number.isFinite(v) ? Math.max(0, Math.floor(v)) : 0;
  } catch { return 0; }
};
const write = (n) => {
  try { localStorage.setItem(INK_KEY, JSON.stringify(Math.max(0, Math.floor(n)))); } catch {}
};

let listener = null;
export const onInk = (fn) => { listener = fn; };

export const loadInk = () => read();
export const saveInk = (n) => write(n);

export function addInk(amount) {
  const n = Math.max(0, Math.floor(Number(amount) || 0));
  const after = read() + n;
  write(after);
  if (n > 0) try { listener?.('earn', n); } catch {}
  return after;
}

export function spendInk(amount) {
  const n = Math.max(0, Math.floor(Number(amount) || 0));
  const have = read();
  if (have < n) return false;
  write(have - n);
  if (n > 0) try { listener?.('spend', n); } catch {}
  return true;
}

export const exchangeCost = (ink) => Math.max(0, Math.floor(Number(ink) || 0)) * EXCHANGE_RATE;

export function inkForLevel(level) {
  const n = Math.max(1, Math.floor(Number(level) || 1));
  let ink = 2 + Math.floor(n / 5);
  if (n % 10 === 0) ink += 10;
  if (n % 25 === 0) ink += 25;
  if (n % 100 === 0) ink += 100;
  return ink;
}

export function inkForAchievement(reward) {
  if (!reward) return 0;
  if (reward.kind === 'coins') return Math.max(1, Math.round((Number(reward.coins) || 0) / 100));
  const rank = rarityRank(reward.spec?.rarityId ?? 'common');
  return [5, 8, 10, 15, 25, 35, 50, 80][Math.max(0, Math.min(7, rank))];
}

export const inkForQuestTier = (tier) => ({ easy: 1, medium: 2, hard: 5 }[tier] ?? 1);

export const INK_DAILY_WEEK = 10;
export const INK_GUILD_GOAL = 10;
export const INK_GUILD_MATCH = 15;
export const INK_SEASON_QUEST = 3;

export function owned(profile) {
  profile.owned ??= { themes: [], frames: [], fx: [] };
  profile.owned.themes ??= [];
  profile.owned.frames ??= [];
  profile.owned.fx ??= [];
  profile.owned.looks ??= [];
  profile.owned.openings ??= [];
  return profile.owned;
}

export const ownsTheme = (profile, id) => owned(profile).themes.includes(id);
export const ownsFrame = (profile, id) => owned(profile).frames.includes(id);
export const ownsLook = (profile, id) => owned(profile).looks.includes(id);
export const ownsOpening = (profile, id) => owned(profile).openings.includes(id);
export const fxKey = (rarityId, fxId) => `${rarityId}:${fxId}`;
export const ownsFx = (profile, rarityId, fxId) => owned(profile).fx.includes(fxKey(rarityId, fxId));

export function grant(profile, kind, id) {
  const list = owned(profile)[kind];
  if (list && !list.includes(id)) list.push(id);
}
