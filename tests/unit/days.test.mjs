import { check, done } from './lib.mjs';
import { localTime } from '../lib/clock.mjs';

const days = await import('../../src/days.js');
const { canClaim, claim, emptyDaily, normalizeDaily, streakAlive } = await import('../../src/daily.js');
const { msToNextDay } = await import('../../src/wikdle.js');
const { seasonAt } = await import('../../src/season.js');

const oldWeekly = (now) => {
  const next = new Date(now);
  next.setUTCHours(24, 0, 0, 0);
  next.setUTCDate(next.getUTCDate() + ((7 - next.getUTCDay()) % 7));
  return next.getTime() - now;
};

const ZONES = ['Europe/Paris', 'America/Los_Angeles', 'Pacific/Kiritimati', 'Pacific/Pago_Pago', 'Asia/Kolkata', 'UTC'];
const MOMENTS = [
  ['Europe/Paris', 2026, 10, 3, 0, 30],
  ['America/Los_Angeles', 2026, 10, 2, 20, 0],
  ['Pacific/Kiritimati', 2026, 10, 3, 1, 0],
  ['Pacific/Pago_Pago', 2026, 10, 2, 23, 30],
  ['Europe/Paris', 2026, 3, 29, 1, 30],
  ['Asia/Kolkata', 2026, 12, 31, 23, 50]
];

for (const zone of ZONES) {
  process.env.TZ = zone;
  for (const [mz, y, mo, d, hh, mm] of MOMENTS) {
    const now = localTime(mz, y, mo, d, hh, mm);
    const tag = `${zone}, ${new Date(now).toISOString()}`;
    const iso = new Date(now).toISOString();
    if (!(days.utcDay(now) === iso.slice(0, 10))) check(`the day is the UTC date (${tag})`, false, days.utcDay(now));
    if (!(days.utcDayIndex(now) === Math.floor(now / 86400000))) check(`the day index is UTC (${tag})`, false);
    if (!(days.msUntilNextUtcDay(now) === Date.parse(`${iso.slice(0, 10)}T00:00:00Z`) + 86400000 - now)) check(`the daily reset is the next UTC midnight (${tag})`, false);
    if (!(msToNextDay(now) === days.msUntilNextUtcDay(now))) check(`every daily clock agrees (${tag})`, false);
    if (!(days.msUntilNextUtcWeek(now) === oldWeekly(now))) check(`the weekly reset is Sunday 00:00 UTC (${tag})`, false, `${days.msUntilNextUtcWeek(now)} vs ${oldWeekly(now)}`);
    if (!(new Date(days.nextUtcWeekAt(now)).getUTCDay() === 0)) check(`a new week starts on a Sunday (${tag})`, false);
    if (!(days.utcWeek(now) === String(Math.floor((Math.floor(now / 86400000) + 4) / 7)))) check(`the week key matches the server (${tag})`, false);
    if (!(days.dayBefore(now) === days.dayBeforeDay(days.utcDay(now)))) check(`yesterday is one UTC day back (${tag})`, false);
    if (!(seasonAt(now).key === seasonAt(Date.parse(iso)).key)) check(`the season does not depend on the zone (${tag})`, false);
    const daily = emptyDaily();
    claim(daily, now);
    const later = days.nextUtcDayAt(now) - 1;
    const next = days.nextUtcDayAt(now);
    if (!(!canClaim(daily, later) && canClaim(daily, next) && streakAlive(daily, next))) check(`the gift turns over at UTC midnight (${tag})`, false);
    const v2 = { v: 2, day: 1, weeks: 0, lastDay: days.utcDayIndex(now), shownDay: days.utcDayIndex(now) };
    if (!(normalizeDaily(v2, now) === v2)) check(`a current record is never migrated (${tag})`, false);
  }
}
check('every helper uses UTC days in every zone and around every midnight', true);

check('a naive date and time reads as UTC', days.parseStamp('2026-10-03T00:00') === Date.UTC(2026, 9, 3) && days.parseStamp('2026-10-03 06:30:00') === Date.UTC(2026, 9, 3, 6, 30));
check('a bare date reads as UTC midnight', days.parseStamp('2026-10-03') === Date.UTC(2026, 9, 3));
check('a zoned stamp keeps its zone', days.parseStamp('2026-10-03T00:00:00+02:00') === Date.UTC(2026, 9, 2, 22) && days.parseStamp('2026-10-02T22:00:00.000Z') === Date.UTC(2026, 9, 2, 22));
check('numbers and blanks', days.parseStamp(5) === 5 && days.parseStamp('') === null && days.parseStamp(null) === null && days.parseStamp('soon') === null);

process.env.TZ = 'America/Los_Angeles';
check('a UTC calendar date prints as itself far west', days.utcDateText(Date.UTC(2027, 0, 1), 'en-GB') === '1 January');
process.env.TZ = 'Pacific/Kiritimati';
check('and far east', days.utcDateText(Date.UTC(2027, 2, 31, 23, 59), 'en-GB', { day: 'numeric', month: 'short' }) === '31 Mar');

done();
