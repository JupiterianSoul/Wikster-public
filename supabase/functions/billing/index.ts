import { json, callerId, admin } from '../_shared/caller.ts';
import { googleToken, serviceAccount } from '../_shared/google.ts';
import { AD_DAILY_CAP, AD_REWARDS, STEAM_SUPPORTER, grantsFor, productById } from './catalog.js';

const PACKAGE = Deno.env.get('PLAY_PACKAGE_NAME') ?? 'com.wikster.app';

async function rpc(name: string, args: Record<string, unknown>) {
  const res = await admin(`rpc/${name}`, { method: 'POST', body: JSON.stringify(args) });
  if (!res.ok) throw new Error(`${name} ${res.status} ${(await res.text()).slice(0, 200)}`);
  return await res.json();
}

async function hashId(userId: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`wikster:${userId}`));
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, '0')).join('').slice(0, 64);
}

async function google(userId: string, productId: string, purchaseToken: string) {
  const pack = productById(productId);
  if (!pack || productId === STEAM_SUPPORTER.product) return json({ error: 'UNKNOWN_PRODUCT' }, 400);
  if (!purchaseToken || purchaseToken.length > 4096) return json({ error: 'BAD_TOKEN' }, 400);
  const sa = serviceAccount();
  if (!sa) return json({ error: 'NOT_CONFIGURED' }, 503);
  const access = await googleToken(sa, 'https://www.googleapis.com/auth/androidpublisher');
  const base = `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${PACKAGE}/purchases/products/${encodeURIComponent(productId)}/tokens/${encodeURIComponent(purchaseToken)}`;
  const res = await fetch(base, { headers: { Authorization: `Bearer ${access}` } });
  if (!res.ok) return json({ error: 'NOT_VERIFIED', status: res.status }, 402);
  const purchase = await res.json();
  if (purchase.purchaseState === 2) return json({ status: 'pending' });
  if (purchase.purchaseState !== 0) return json({ error: 'NOT_PURCHASED' }, 402);
  if (purchase.obfuscatedExternalAccountId && purchase.obfuscatedExternalAccountId !== await hashId(userId)) {
    return json({ error: 'OTHER_ACCOUNT' }, 403);
  }
  const orderId = String(purchase.orderId ?? purchaseToken.slice(0, 120));
  const result = await rpc('record_purchase', {
    p_user: userId, p_platform: 'google', p_product: productId, p_order: orderId,
    p_token: purchaseToken, p_grants: grantsFor(productId)
  });
  if (result === 'other') return json({ error: 'OTHER_ACCOUNT' }, 403);
  if (purchase.acknowledgementState !== 1) {
    await fetch(`${base}:acknowledge`, {
      method: 'POST', headers: { Authorization: `Bearer ${access}`, 'Content-Type': 'application/json' }, body: '{}'
    }).catch((error) => console.error('billing: acknowledge failed', error));
  }
  return json({ status: result, product: productId });
}

async function steam(userId: string) {
  const key = Deno.env.get('STEAM_WEB_API_KEY') ?? '';
  const dlc = Deno.env.get('STEAM_SUPPORTER_APPID') ?? '';
  if (!key || !dlc) return json({ error: 'NOT_CONFIGURED' }, 503);
  const links = await admin(`steam_links?user_id=eq.${encodeURIComponent(userId)}&select=steam_id`).then((r) => r.json()).catch(() => []);
  const steamId = links?.[0]?.steam_id;
  if (!steamId) return json({ error: 'NO_STEAM' }, 400);
  const url = `https://partner.steam-api.com/ISteamUser/CheckAppOwnership/v4/?key=${encodeURIComponent(key)}&steamid=${encodeURIComponent(steamId)}&appid=${encodeURIComponent(dlc)}`;
  const res = await fetch(url);
  if (!res.ok) return json({ error: 'NOT_VERIFIED', status: res.status }, 502);
  const body = await res.json();
  const owns = body?.appownership?.ownsapp === true;
  if (!owns) return json({ status: 'not-owned' });
  const result = await rpc('record_purchase', {
    p_user: userId, p_platform: 'steam', p_product: STEAM_SUPPORTER.product, p_order: `${steamId}:${dlc}`,
    p_token: null, p_grants: grantsFor(STEAM_SUPPORTER.product)
  });
  if (result === 'other') return json({ error: 'OTHER_ACCOUNT' }, 403);
  return json({ status: result, product: STEAM_SUPPORTER.product });
}

type VerifierKey = { keyId: number; base64: string };
let keys: { at: number; list: VerifierKey[] } | null = null;

async function admobKeys(): Promise<VerifierKey[]> {
  if (keys && Date.now() - keys.at < 12 * 3600_000) return keys.list;
  const res = await fetch('https://www.gstatic.com/admob/reward/verifier-keys.json');
  const body = await res.json();
  keys = { at: Date.now(), list: body.keys ?? [] };
  return keys.list;
}

const fromB64 = (s: string) => {
  const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(s.length / 4) * 4, '='));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
};

function derToRaw(der: Uint8Array): Uint8Array<ArrayBuffer> {
  let i = 2;
  if (der[1] & 0x80) i += der[1] & 0x7f;
  const part = () => {
    if (der[i] !== 0x02) throw new Error('bad signature');
    const len = der[i + 1];
    let bytes = der.slice(i + 2, i + 2 + len);
    i += 2 + len;
    while (bytes.length > 32 && bytes[0] === 0) bytes = bytes.slice(1);
    const out = new Uint8Array(32);
    out.set(bytes, 32 - bytes.length);
    return out;
  };
  const r = part();
  const s = part();
  const raw = new Uint8Array(64);
  raw.set(r, 0);
  raw.set(s, 32);
  return raw;
}

async function admob(req: Request) {
  const url = new URL(req.url);
  const query = url.search.slice(1);
  const cut = query.indexOf('&signature=');
  if (cut < 0) return new Response('NO_SIGNATURE', { status: 400 });
  const message = query.slice(0, cut);
  const signature = url.searchParams.get('signature') ?? '';
  const keyId = Number(url.searchParams.get('key_id'));
  const key = (await admobKeys()).find((k) => Number(k.keyId) === keyId);
  if (!key) return new Response('UNKNOWN_KEY', { status: 400 });
  const pub = await crypto.subtle.importKey('spki', fromB64(key.base64), { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']);
  const ok = await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, pub, derToRaw(fromB64(signature)), new TextEncoder().encode(message));
  if (!ok) return new Response('BAD_SIGNATURE', { status: 403 });

  const userId = url.searchParams.get('user_id') ?? '';
  const tx = url.searchParams.get('transaction_id') ?? '';
  const reward = url.searchParams.get('custom_data') ?? 'coins';
  if (!/^[0-9a-f-]{36}$/i.test(userId) || !tx) return new Response('OK');
  const kind = reward in AD_REWARDS ? reward : 'coins';
  const payload = (AD_REWARDS as Record<string, unknown>)[kind];
  const result = await rpc('record_ad_reward', {
    p_tx: tx.slice(0, 200), p_user: userId, p_reward: kind, p_cap: AD_DAILY_CAP,
    p_grant: { kind, payload, note_en: 'Thanks for watching.', note_fr: 'Merci d’avoir regardé.' }
  });
  return new Response(String(result));
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return json({}, 200);
  const path = new URL(req.url).pathname;
  try {
    if (req.method === 'GET' && path.endsWith('/admob')) return await admob(req);
    if (req.method !== 'POST') return json({ error: 'METHOD' }, 405);
    const userId = await callerId(req);
    if (!userId) return json({ error: 'UNAUTHORISED' }, 401);
    const body = await req.json().catch(() => ({}));
    if (body.action === 'google') return await google(userId, String(body.productId ?? ''), String(body.purchaseToken ?? ''));
    if (body.action === 'steam') return await steam(userId);
    if (body.action === 'account') return json({ account: await hashId(userId) });
    return json({ error: 'UNKNOWN_ACTION' }, 400);
  } catch (error) {
    console.error('billing', error);
    return json({ error: 'FAILED' }, 500);
  }
});
