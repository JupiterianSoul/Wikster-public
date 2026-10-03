export type ServiceAccount = { client_email: string; private_key: string; project_id?: string };

export function serviceAccount(): ServiceAccount | null {
  const raw = Deno.env.get('GOOGLE_SERVICE_ACCOUNT') ?? '';
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw.trim().startsWith('{') ? raw : atob(raw));
    if (!parsed?.client_email || !parsed?.private_key) return null;
    return parsed as ServiceAccount;
  } catch {
    return null;
  }
}

const enc = new TextEncoder();

export function b64url(input: Uint8Array | string): string {
  const bytes = typeof input === 'string' ? enc.encode(input) : input;
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function pemBody(pem: string): Uint8Array<ArrayBuffer> {
  const clean = pem.replace(/-----[^-]+-----/g, '').replace(/\s+/g, '');
  const bin = atob(clean);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

const cache = new Map<string, { token: string; until: number }>();

export async function googleToken(sa: ServiceAccount, scope: string): Promise<string> {
  const hit = cache.get(scope);
  if (hit && hit.until > Date.now() + 60_000) return hit.token;
  const now = Math.floor(Date.now() / 1000);
  const head = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claims = b64url(JSON.stringify({
    iss: sa.client_email, scope, aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3600
  }));
  const key = await crypto.subtle.importKey('pkcs8', pemBody(sa.private_key),
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']);
  const sig = new Uint8Array(await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, enc.encode(`${head}.${claims}`)));
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: `${head}.${claims}.${b64url(sig)}`
    })
  });
  if (!res.ok) throw new Error(`GOOGLE_AUTH ${res.status} ${(await res.text()).slice(0, 200)}`);
  const body = await res.json();
  cache.set(scope, { token: body.access_token, until: Date.now() + (body.expires_in ?? 3600) * 1000 });
  return body.access_token;
}

export function sameSecret(a: string, b: string): boolean {
  if (!a || !b || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
