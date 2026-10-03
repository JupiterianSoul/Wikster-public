import { check, done } from './lib.mjs';

const { PLAY_STEP, PROFILE_KEY, SYNC_KEYS, digest, dirtyKeys, graftValue, shapeValue, takeRow } = await import('../../src/savekeys.js');
const { ECON_KEYS } = await import('../../src/econ/core.js');

const DROP = [...ECON_KEYS, 'seasonDay', 'wikdleStats', 'games', 'quiz', 'versusDay'];
const profile = {
  playMs: PLAY_STEP * 3 + 4000, started: true, progress: { level: 9 }, todayBought: '2026-10-01',
  wikdleStats: { won: 3 }, showcase: ['en:Cat'], badgeLoadout: ['a'], settings: { sound: false }
};
const text = JSON.stringify(profile);

check('only the four device keys sync', SYNC_KEYS.length === 4 && SYNC_KEYS.includes(PROFILE_KEY) && !SYNC_KEYS.includes('wikster.collection.v3'));

const shaped = JSON.parse(shapeValue(PROFILE_KEY, text, DROP));
check('the shaped profile leaves out what the economy owns', !('started' in shaped) && !('progress' in shaped) && !('todayBought' in shaped));
check('and what the server mirrors', !('wikdleStats' in shaped));
check('but keeps what only the device knows', shaped.showcase?.[0] === 'en:Cat' && shaped.settings?.sound === false && shaped.badgeLoadout?.[0] === 'a');
check('play time is rounded down to fifteen minutes', shaped.playMs === PLAY_STEP * 3, String(shaped.playMs));
check('other keys pass through untouched', shapeValue('wikster.theme', 'noir', DROP) === 'noir');
check('a broken profile passes through as it is', shapeValue(PROFILE_KEY, '{oops', DROP) === '{oops');
check('a missing value shapes to nothing', shapeValue(PROFILE_KEY, null, DROP) === null);

const played = JSON.stringify({ ...profile, playMs: profile.playMs + 60000 });
check('a minute of play is not a change', shapeValue(PROFILE_KEY, played, DROP) === shapeValue(PROFILE_KEY, text, DROP));
const acked = { [PROFILE_KEY]: digest(shapeValue(PROFILE_KEY, text, DROP)) };
check('so the profile is not dirty', dirtyKeys({ [PROFILE_KEY]: shapeValue(PROFILE_KEY, played, DROP) }, acked).length === 0);
const later = JSON.stringify({ ...profile, playMs: PLAY_STEP * 4 + 1 });
check('crossing a quarter hour is', dirtyKeys({ [PROFILE_KEY]: shapeValue(PROFILE_KEY, later, DROP) }, acked).includes(PROFILE_KEY));
const renamed = JSON.stringify({ ...profile, showcase: ['en:Dog'] });
check('a real change is dirty', dirtyKeys({ [PROFILE_KEY]: shapeValue(PROFILE_KEY, renamed, DROP) }, acked).includes(PROFILE_KEY));
const bought = JSON.stringify({ ...profile, todayBought: '2026-10-02', progress: { level: 10 } });
check('a change only the economy owns is not', dirtyKeys({ [PROFILE_KEY]: shapeValue(PROFILE_KEY, bought, DROP) }, acked).length === 0);
check('a key never acked is dirty', dirtyKeys({ 'wikster.theme': 'noir' }, {}).includes('wikster.theme'));
check('the digest tells texts apart', digest('a') !== digest('b') && digest('abc') === digest('abc'));

const incoming = JSON.stringify({ playMs: PLAY_STEP, showcase: ['en:Owl'], settings: { sound: true } });
const grafted = JSON.parse(graftValue(PROFILE_KEY, incoming, text, DROP));
check('a profile from another device takes its own fields', grafted.showcase[0] === 'en:Owl' && grafted.settings.sound === true);
check('and keeps this device\'s economy fields', grafted.started === true && grafted.progress.level === 9 && grafted.todayBought === '2026-10-01');
check('and the larger play time', grafted.playMs === profile.playMs);
const seeded = JSON.stringify({ playMs: 0, progress: { level: 4 }, showcase: [] });
check('an economy field the device lacks is left as it came', JSON.parse(graftValue(PROFILE_KEY, seeded, JSON.stringify({ playMs: 5 }), DROP)).progress.level === 4);
check('other keys are taken as they are', graftValue('wikster.theme', 'noir', 'paper', DROP) === 'noir');

const row = { key: PROFILE_KEY, value: incoming, stamp: 500 };
const clean = takeRow(row, { local: text, localStamp: 900, clean: true, keep: DROP, drop: DROP, now: 1000 });
check('a clean device takes the server copy even with an older stamp', clean && clean.write);
check('and owes the server its larger play time', clean.ahead && clean.stamp === 1000);
const kept = takeRow(row, { local: renamed, localStamp: 900, clean: false, keep: DROP, drop: DROP, now: 1000 });
check('a device with a newer unsent change keeps it', kept === null);
const behind = takeRow({ ...row, stamp: 950 }, { local: renamed, localStamp: 900, clean: false, keep: DROP, drop: DROP, now: 1000 });
check('a newer server copy wins over an older unsent change', behind && behind.write);
const tie = takeRow({ key: 'wikster.theme', value: 'noir', stamp: 900 }, { local: 'paper', localStamp: 900, clean: false, now: 1000 });
check('a tie goes to the server', tie && tie.value === 'noir' && tie.stamp === 900 && !tie.ahead);
const fresh = takeRow({ key: 'wikster.theme', value: 'noir', stamp: 7 }, { local: null, clean: true, now: 1000 });
check('an empty device takes the key with its stamp', fresh.write && fresh.stamp === 7 && fresh.ack === digest('noir'));

done();
