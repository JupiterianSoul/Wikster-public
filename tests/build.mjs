import { execSync } from 'node:child_process';
import { existsSync, renameSync } from 'node:fs';

const mode = process.argv[2] ?? 'production';
const outDir = process.argv[3] ?? 'dist';
const env = { ...process.env };
const hidden = '.env.production.hidden';
const hide = mode !== 'production' && existsSync('.env.production');
if (hide) renameSync('.env.production', hidden);
if (mode === 'stub') {
  env.VITE_SUPABASE_URL = 'https://stub.supabase.co';
  env.VITE_SUPABASE_ANON_KEY = 'stub-anon-key';
} else if (mode === 'offline') {
  env.VITE_SUPABASE_URL = '';
  env.VITE_SUPABASE_ANON_KEY = '';
}
try {
  execSync(`npx vite build --outDir ${outDir}`, { stdio: 'pipe', env });
  console.log(`built ${mode} into ${outDir}`);
} finally {
  if (hide) renameSync(hidden, '.env.production');
}
