export const DAY_MS = 86400000;
export const WEEK_MS = 7 * DAY_MS;

export const utcDayIndex = (now = Date.now()) => Math.floor(now / DAY_MS);

export const utcDay = (now = Date.now()) => new Date(now).toISOString().slice(0, 10);

export const dayStart = (day) => Date.parse(`${day}T00:00:00Z`);

export const dayBefore = (now = Date.now()) => utcDay(now - DAY_MS);

export const dayBeforeDay = (day) => utcDay(dayStart(day) - DAY_MS);

export const nextUtcDayAt = (now = Date.now()) => (utcDayIndex(now) + 1) * DAY_MS;

export const msUntilNextUtcDay = (now = Date.now()) => nextUtcDayAt(now) - now;

export const utcWeekIndex = (now = Date.now()) => Math.floor((utcDayIndex(now) + 4) / 7);

export const utcWeek = (now = Date.now()) => String(utcWeekIndex(now));

export const nextUtcWeekAt = (now = Date.now()) => ((utcWeekIndex(now) + 1) * 7 - 4) * DAY_MS;

export const msUntilNextUtcWeek = (now = Date.now()) => nextUtcWeekAt(now) - now;

const NAIVE = /^\d{4}-\d{2}-\d{2}(?:[T ]\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?)?$/;

export function parseStamp(v) {
  if (v == null || v === '') return null;
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  const text = String(v).trim();
  const at = NAIVE.test(text) ? Date.parse(`${text.replace(' ', 'T')}${text.length === 10 ? '' : 'Z'}`) : Date.parse(text);
  return Number.isFinite(at) ? at : null;
}

export const utcDateText = (ms, lang, options) =>
  new Date(ms).toLocaleDateString(lang, { day: 'numeric', month: 'long', ...options, timeZone: 'UTC' });
