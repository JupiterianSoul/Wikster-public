import { check, done } from './lib.mjs';

const { failureKind, retryAfterMs, retryDelay, RETRY_CAP_MS, RETRY_AFTER_MAX_MS } = await import('../../src/backoff.js');

const low = () => 0;
const high = () => 0.999999;
check('the first retry waits about a second', retryDelay(0, { random: low }) === 500 && retryDelay(0, { random: high }) === 1000);
check('each retry doubles the window', retryDelay(3, { random: high }) === 8000 && retryDelay(3, { random: low }) === 4000);
check('the wait is capped', retryDelay(30, { random: high }) === RETRY_CAP_MS && retryDelay(30, { random: low }) === RETRY_CAP_MS / 2);
const spread = new Set(Array.from({ length: 50 }, () => retryDelay(4)));
check('jitter spreads phones apart', spread.size > 10, String(spread.size));
check('a Retry-After longer than the backoff wins', retryDelay(0, { after: 20000, random: high }) === 20000);
check('but never more than two minutes', retryDelay(0, { after: 10 * 60000 }) === RETRY_AFTER_MAX_MS);
check('Retry-After in seconds is read', retryAfterMs('17') === 17000);
check('Retry-After as a date is read', retryAfterMs(new Date(Date.UTC(2026, 0, 1, 0, 0, 30)).toUTCString(), Date.UTC(2026, 0, 1, 0, 0, 0)) === 30000);
check('a missing or broken Retry-After is ignored', retryAfterMs(null) === null && retryAfterMs('soon') === null);

const err = (code, status = 0, extra = {}) => Object.assign(new Error(code), { status, ...extra });
check('a rate limit was never processed', failureKind(err('SLOW_DOWN', 429)) === 'unsent');
check('a gateway 503 was never processed', failureKind(err('CLOSED', 503)) === 'unsent');
check('a missing schema is not retried', failureKind(err('NOT_LIVE', 503)) === null);
check('a timeout may have landed', failureKind(err('TIMEOUT')) === 'unknown');
check('a server error may have landed', failureKind(err('FAILED', 500)) === 'unknown' && failureKind(err('CLOSED', 504)) === 'unknown');
check('a dropped connection may have landed', failureKind(err('CLOSED', 0, { network: true })) === 'unknown');
check('a refusal is final', failureKind(err('INSUFFICIENT_FUNDS', 400)) === null && failureKind(err('SIGN_IN', 401)) === null);
check('a function that is not there is final', failureKind(err('CLOSED', 404)) === null);
Object.defineProperty(globalThis, 'navigator', { value: { onLine: false }, configurable: true });
check('a request made offline never left', failureKind(err('CLOSED', 0, { network: true })) === 'unsent' && failureKind(err('TIMEOUT')) === 'unsent');

done();
