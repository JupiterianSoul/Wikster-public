export const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-region',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Expose-Headers': 'retry-after',
  'Access-Control-Max-Age': '7200'
};

export const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json', ...headers } });

export const projectUrl = () => Deno.env.get('SUPABASE_URL') ?? '';
export const projectKey = (req: Request) =>
  Deno.env.get('SUPABASE_ANON_KEY') ?? Deno.env.get('SUPABASE_PUBLISHABLE_KEY') ?? req.headers.get('apikey') ?? '';
export const serviceKey = () => Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

export function tokenCaller(req: Request): string | null {
  const auth = req.headers.get('Authorization') ?? '';
  if (!auth.startsWith('Bearer ')) return null;
  const parts = auth.slice(7).split('.');
  if (parts.length !== 3) return null;
  try {
    const text = atob(parts[1].replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(parts[1].length / 4) * 4, '='));
    const claims = JSON.parse(text);
    if (claims?.role !== 'authenticated' || typeof claims?.sub !== 'string') return null;
    if (!Number.isFinite(claims.exp) || claims.exp * 1000 < Date.now()) return null;
    return claims.sub;
  } catch {
    return null;
  }
}

export async function callerId(req: Request): Promise<string | null> {
  const auth = req.headers.get('Authorization') ?? '';
  if (!auth.startsWith('Bearer ')) return null;
  try {
    const who = await fetch(`${projectUrl()}/auth/v1/user`, { headers: { Authorization: auth, apikey: projectKey(req) } });
    if (!who.ok) return null;
    const user = await who.json();
    return typeof user?.id === 'string' ? user.id : null;
  } catch {
    return null;
  }
}

export async function adminInsert(table: string, row: Record<string, unknown>): Promise<boolean> {
  const key = serviceKey();
  if (!key) { console.warn(`${table}: no service key, row not written`); return false; }
  try {
    const res = await fetch(`${projectUrl()}/rest/v1/${table}`, {
      method: 'POST',
      headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
      body: JSON.stringify(row)
    });
    if (!res.ok) console.error(`${table}: insert refused`, res.status, await res.text());
    return res.ok;
  } catch (err) {
    console.error(`${table}: insert failed`, err);
    return false;
  }
}

export async function admin(path: string, init: RequestInit = {}): Promise<Response> {
  const key = serviceKey();
  return fetch(`${projectUrl()}/rest/v1/${path}`, {
    ...init,
    headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', ...(init.headers ?? {}) }
  });
}

export function randomBelow(n: number): number {
  if (!Number.isInteger(n) || n <= 0) throw new Error('randomBelow: bad range');
  const limit = Math.floor(0x100000000 / n) * n;
  const buf = new Uint32Array(1);
  for (;;) {
    crypto.getRandomValues(buf);
    if (buf[0] < limit) return buf[0] % n;
  }
}

export const nonce = () => {
  const b = new Uint8Array(12);
  crypto.getRandomValues(b);
  return Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
};

export const utcDay = (now = Date.now()) => new Date(now).toISOString().slice(0, 10);
