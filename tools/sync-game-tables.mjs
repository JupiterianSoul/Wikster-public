import { readFileSync, writeFileSync } from 'node:fs';
import { QUESTS, QUEST_TIERS, QUESTS_PER_DAY } from '../src/data/quests.js';
import { FILTER_TERMS } from '../src/data/filterterms.js';
import { normText } from '../src/wordfilter.js';

writeFileSync('supabase/functions/_shared/quests.ts', `export const QUESTS: { id: string; tier: string; target: number }[] = ${JSON.stringify(QUESTS.map((q) => ({ id: q.id, tier: q.tier, target: q.target })))};
export const TIER_WEIGHTS: Record<string, number> = ${JSON.stringify(Object.fromEntries(Object.entries(QUEST_TIERS).map(([k, v]) => [k, v.weight])))};
export const QUESTS_PER_DAY = ${QUESTS_PER_DAY};
`);
console.log('wrote supabase/functions/_shared/quests.ts');

for (const [term] of FILTER_TERMS) {
  if (normText(term) !== term || !/^[a-z]+$/.test(term)) throw new Error(`filter term "${term}" is not in normal form`);
}
const START = 'insert into public.blocked_terms (term, tier, mode) values';
const END = 'on conflict (term) do update set tier = excluded.tier, mode = excluded.mode;';
const schema = readFileSync('supabase/schema.sql', 'utf8');
const a = schema.indexOf(START);
const b = schema.indexOf(END, a);
if (a < 0 || b < 0) throw new Error('the word list insert is missing from supabase/schema.sql');
const rows = FILTER_TERMS.map(([term, tier, mode]) => `('${term}', '${tier}', '${mode}')`);
const lines = [];
for (let i = 0; i < rows.length; i += 6) lines.push(`  ${rows.slice(i, i + 6).join(', ')}`);
writeFileSync('supabase/schema.sql', `${schema.slice(0, a)}${START}\n${lines.join(',\n')}\n${schema.slice(b)}`);
console.log(`wrote ${rows.length} filter terms into supabase/schema.sql`);
