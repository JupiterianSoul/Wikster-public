import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { FILTER_SAMPLES } from '../lib/filtersamples.mjs';
import { screenText } from '../../src/wordfilter.js';

const url = process.env.WIKSTER_PG;
if (!url) {
  console.log('sql: WIKSTER_PG is not set, skipped');
  process.exit(0);
}
const psql = (args) => spawnSync('psql', [url, '-v', 'ON_ERROR_STOP=1', '-q', ...args], { encoding: 'utf8' });
const setup = psql(['-c', 'drop schema if exists public cascade', '-c', 'create schema public']);
if (setup.status !== 0) { console.error(setup.stderr); process.exit(1); }
const schema = join(mkdtempSync(join(tmpdir(), 'wikster-sql-')), 'schema.sql');
writeFileSync(schema, readFileSync('supabase/schema.sql', 'utf8').replace(/^create extension if not exists pg_cron;$/m, ''));
const quote = (v) => (v == null ? 'null' : `'${String(v).replace(/'/g, "''")}'`);
const samples = join(mkdtempSync(join(tmpdir(), 'wikster-sql-')), 'filter.sql');
writeFileSync(samples, FILTER_SAMPLES.map(([text, scope]) => {
  const want = screenText(text, scope);
  return `select t_is(${quote(`the database agrees with the game on ${scope}: ${text}`)}, text_flag(${quote(text)}, ${quote(scope)}) is not distinct from ${quote(want)});`;
}).join('\n'));
const steps = ['tests/sql/prelude.sql', schema, schema, 'tests/sql/econ.sql', 'tests/sql/p2p.sql', samples, 'tests/sql/safety.sql', 'tests/sql/leftovers.sql', 'tests/sql/push.sql', 'tests/sql/save.sql', 'tests/sql/live.sql', 'tests/sql/speed.sql', 'tests/sql/control.sql', 'tests/sql/liveops.sql', 'tests/sql/polish.sql', 'tests/sql/boosters.sql', 'tests/sql/claims.sql', 'tests/sql/social.sql', 'tests/sql/market.sql', 'tests/sql/danger.sql', 'tests/sql/custom.sql', 'tests/sql/appearance.sql', 'tests/sql/friends.sql', 'tests/sql/codes.sql', 'tests/sql/calls.sql', schema, 'tests/sql/friends2.sql'];
for (const file of steps) {
  const r = psql(['-f', file]);
  const lines = r.stderr.split('\n').filter((l) => /PASS|FAIL|ERROR/.test(l)).map((l) => l.replace(/^.*(NOTICE|ERROR):\s*/, ''));
  if (!file.endsWith('prelude.sql') && !file.endsWith('schema.sql')) for (const l of lines) console.log(l);
  if (r.status !== 0) {
    console.error(`sql: ${file} failed\n${r.stderr.split('\n').filter((l) => /ERROR|FAIL/.test(l)).join('\n')}`);
    process.exit(1);
  }
}
console.log('sql: ALL PASS');
