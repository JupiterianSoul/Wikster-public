import { getLanguage } from './i18n.js';
import { rarityRank } from './data/rarities.js';
import { regional, supabase, configured } from './account.js';
import { QUIZ_PER_DAY, questionCountFor } from './quizrules.js';
import { utcDayIndex } from './days.js';

export { QUIZ_MONEY, QUIZ_PER_DAY, QUIZ_POINTS_PER_ANSWER, questionCountFor, quizRewards } from './quizrules.js';

export const quizAvailable = () => configured;

export async function buildQuiz({ title, text, rarityId }) {
  if (!quizAvailable()) throw new Error('QUIZ_UNAVAILABLE');

  const { data, error } = await supabase.functions.invoke(regional('quiz'), {
    body: {
      title,
      text: String(text ?? '').slice(0, 3500),
      rank: rarityRank(rarityId),
      count: questionCountFor(rarityId),
      lang: getLanguage()
    }
  });

  if (error) {
    const body = await error?.context?.json?.().catch(() => null);
    const status = error?.context?.status;
    const why = body?.detail ?? body?.error ?? error?.message ?? 'unknown';
    console.error(`quiz failed (${status ?? 'no status'}): ${why}`);
    if (status === 503 || body?.error === 'QUIZ_UNSET') throw new Error('QUIZ_UNAVAILABLE');
    const short = status === 404
      ? 'not deployed as "quiz"'
      : (body?.detail ?? `${status ?? '?'} ${body?.error ?? ''}`.trim());
    throw Object.assign(new Error('QUIZ_SHAPE'), { detail: short });
  }
  if (data?.error === 'QUIZ_UNSET') throw new Error('QUIZ_UNAVAILABLE');

  const questions = (Array.isArray(data?.questions) ? data.questions : [])
    .filter((q) => q && typeof q.question === 'string'
      && Array.isArray(q.choices) && q.choices.length === 4
      && Number.isInteger(q.answer) && q.answer >= 0 && q.answer < 4);
  if (questions.length < 3) throw new Error('QUIZ_SHAPE');
  return questions;
}

const PLAYS_KEY = 'wikster.quizPlays.v1';

const today = () => utcDayIndex();

function readPlays(userKey) {
  try {
    const all = JSON.parse(localStorage.getItem(PLAYS_KEY) ?? '{}');
    const mine = all?.[userKey];
    return mine && mine.day === today() ? mine.count : 0;
  } catch {
    return 0;
  }
}

export function quizPlaysLeft(userKey = 'local') {
  return Math.max(0, QUIZ_PER_DAY - readPlays(userKey));
}

export function recordQuizPlay(userKey = 'local') {
  try {
    const all = JSON.parse(localStorage.getItem(PLAYS_KEY) ?? '{}');
    const mine = all?.[userKey];
    const count = (mine && mine.day === today() ? mine.count : 0) + 1;
    all[userKey] = { day: today(), count };
    localStorage.setItem(PLAYS_KEY, JSON.stringify(all));
  } catch {}
}
