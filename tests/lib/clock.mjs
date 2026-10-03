import { chromium } from 'playwright';

const RealDate = Date;
let offset = 0;
let zone = '';

function zoneOffset(at, tz) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', {
    timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit'
  }).formatToParts(new RealDate(at)).map((p) => [p.type, p.value]));
  const asUtc = RealDate.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day), Number(parts.hour), Number(parts.minute), Number(parts.second));
  return asUtc - Math.floor(at / 1000) * 1000;
}

export function localTime(tz, y, m, d, hh, mm) {
  const guess = RealDate.UTC(y, m - 1, d, hh, mm);
  let at = guess - zoneOffset(guess, tz);
  at = guess - zoneOffset(at, tz);
  return at;
}

export function resolveNow(spec, tz = zone || 'UTC', real = RealDate.now()) {
  if (spec == null || spec === '') return null;
  const text = String(spec).trim();
  if (/^\d{9,}$/.test(text)) return Number(text);
  const clock = /^(\d{1,2}):(\d{2})$/.exec(text);
  if (clock) {
    const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' })
      .formatToParts(new RealDate(real)).map((p) => [p.type, p.value]));
    return localTime(tz, Number(parts.year), Number(parts.month), Number(parts.day), Number(clock[1]), Number(clock[2]));
  }
  const at = RealDate.parse(text);
  if (!Number.isFinite(at)) throw new Error(`WIKSTER_NOW is not a time: ${text}`);
  return at;
}

class ShiftedDate extends RealDate {
  constructor(...args) {
    if (args.length === 0) super(RealDate.now() + offset);
    else super(...args);
  }

  static now() { return RealDate.now() + offset; }
}

export function useClock({ tz = '', now = null } = {}) {
  zone = tz || '';
  if (zone) process.env.TZ = zone;
  else delete process.env.TZ;
  const at = typeof now === 'number' ? now : resolveNow(now, zone || 'UTC');
  offset = at == null ? 0 : at - RealDate.now();
  globalThis.Date = offset ? ShiftedDate : RealDate;
  return { tz: zone, now: at, offset };
}

export const clockNote = () => `${zone || 'machine zone'} at ${new RealDate(RealDate.now() + offset).toISOString()}${offset ? ' (shifted)' : ''}`;

const browserType = Object.getPrototypeOf(chromium);
if (!browserType.__wiksterClock) {
  browserType.__wiksterClock = true;
  const launch = browserType.launch;
  browserType.launch = async function patchedLaunch(...args) {
    const browser = await launch.apply(this, args);
    const newContext = browser.newContext.bind(browser);
    browser.newContext = async (options = {}) => {
      const ctx = await newContext({ ...(zone ? { timezoneId: zone } : {}), ...options });
      if (offset) {
        const time = RealDate.now() + offset;
        globalThis.Date = RealDate;
        try { await ctx.clock.install({ time }); } finally { globalThis.Date = offset ? ShiftedDate : RealDate; }
      }
      return ctx;
    };
    browser.newPage = async (options = {}) => {
      const ctx = await browser.newContext(options);
      const page = await ctx.newPage();
      page.once('close', () => { ctx.close().catch(() => {}); });
      return page;
    };
    return browser;
  };
}

if (process.env.WIKSTER_TZ || process.env.WIKSTER_NOW) {
  useClock({ tz: process.env.WIKSTER_TZ ?? '', now: process.env.WIKSTER_NOW ?? null });
  console.log(`clock: ${clockNote()}`);
}
