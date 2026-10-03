import { addSeasonPoints, pointsForReport, seasonQuestOf } from '../season.js';
import { creditFor } from '../data/quests.js';
import { clone } from './core.js';

export function track(state, events, now, bonus = 0) {
  const profile = { seasons: clone(state.seasons ?? {}) };
  const { quest, day, key } = seasonQuestOf(now);
  const held = state.seasonDay?.day === day && state.seasonDay?.key === key ? state.seasonDay.progress : 0;
  let progress = Number(held) || 0;
  let points = Math.max(0, Math.floor(Number(bonus) || 0));
  for (const { m, d = {} } of events) {
    points += pointsForReport(m, d, now);
    if (progress < quest.target) progress = Math.min(quest.target, progress + creditFor(quest, m, d));
  }
  const moved = addSeasonPoints(profile, points, now);
  return {
    state: { seasons: profile.seasons, seasonDay: { day, key, progress } },
    season: { key: moved.key, points: moved.after, gained: points, reached: moved.reached }
  };
}
