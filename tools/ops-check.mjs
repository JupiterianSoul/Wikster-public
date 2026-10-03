import { appendFileSync } from 'node:fs';

const SITE = process.env.SITE_URL || 'https://wikster.pages.dev/';
const PROJECT = (process.env.SUPABASE_URL || '').replace(/\/$/, '');
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

const LIMITS = {
  errors_hour: 300,
  error_players_hour: 25,
  urgent_reports: 0,
  top_earner_day: 250000,
  db_bytes: 400 * 1024 * 1024
};

const problems = [];
const lines = [];
const say = (s) => { lines.push(s); console.log(s); };

async function timed(label, run) {
  const started = Date.now();
  try {
    const result = await run();
    say(`- ${label}: ${result} (${Date.now() - started} ms)`);
  } catch (error) {
    problems.push(`${label}: ${error.message}`);
    say(`- ${label}: **${error.message}**`);
  }
}

const withTimeout = (ms) => AbortSignal.timeout(ms);

say(`## Wikster health, ${new Date().toISOString()}`);

await timed('site', async () => {
  const res = await fetch(SITE, { signal: withTimeout(15000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const html = await res.text();
  if (!html.includes('id="app"')) throw new Error('the page does not look like the game');
  return 'up';
});

if (!PROJECT || !SERVICE) {
  say('- server checks skipped: SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY is not set');
} else {
  const headers = { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, 'Content-Type': 'application/json' };
  await timed('economy function', async () => {
    const res = await fetch(`${PROJECT}/functions/v1/economy`, { method: 'POST', body: '{}', headers: { 'Content-Type': 'application/json' }, signal: withTimeout(15000) });
    if (res.status >= 500) throw new Error(`HTTP ${res.status}`);
    return `answers (${res.status})`;
  });
  let health = null;
  await timed('database', async () => {
    const res = await fetch(`${PROJECT}/rest/v1/rpc/ops_health`, { method: 'POST', headers, body: '{}', signal: withTimeout(15000) });
    if (!res.ok) throw new Error(`HTTP ${res.status} ${(await res.text()).slice(0, 120)}`);
    health = await res.json();
    return 'up';
  });
  if (health) {
    say('');
    say('| Measure | Now | Limit |');
    say('| --- | ---: | ---: |');
    for (const [key, value] of Object.entries(health)) {
      if (typeof value !== 'number' && typeof value !== 'string') continue;
      const limit = LIMITS[key];
      say(`| ${key} | ${value} | ${limit ?? ''} |`);
      if (limit != null && Number(value) > limit) problems.push(`${key} is ${value}, over ${limit}`);
    }
    if (Array.isArray(health.top_errors) && health.top_errors.length) {
      say('');
      say('Most frequent errors today:');
      for (const e of health.top_errors) say(`- ${e.n}x, ${e.players} player(s), ${e.kind}, build ${e.build ?? '?'}: ${String(e.message).replace(/\|/g, '/')}`);
    }
  }
}

if (problems.length) {
  say('');
  say('### Needs a look');
  for (const p of problems) say(`- ${p}`);
}
if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${lines.join('\n')}\n`);
if (problems.length) {
  for (const p of problems) console.log(`::error::${p}`);
  process.exit(1);
}
