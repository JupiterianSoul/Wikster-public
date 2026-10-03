import { json, callerId, admin, projectUrl, serviceKey } from '../_shared/caller.ts';

const APP_ID = Deno.env.get('STEAM_APP_ID') ?? '';
const KEY = Deno.env.get('STEAM_WEB_API_KEY') ?? '';

async function steamIdFor(ticket: string): Promise<string | null> {
  const url = `https://partner.steam-api.com/ISteamUserAuth/AuthenticateUserTicket/v1/?key=${encodeURIComponent(KEY)}`
    + `&appid=${encodeURIComponent(APP_ID)}&ticket=${encodeURIComponent(ticket)}&identity=wikster`;
  const res = await fetch(url);
  if (!res.ok) return null;
  const body = await res.json();
  const params = body?.response?.params;
  if (params?.result !== 'OK' || !/^[0-9]{5,20}$/.test(String(params?.steamid ?? ''))) return null;
  if (params.publisherbanned) return null;
  return String(params.steamid);
}

async function rpc(name: string, args: Record<string, unknown>) {
  const res = await admin(`rpc/${name}`, { method: 'POST', body: JSON.stringify(args) });
  if (!res.ok) throw new Error(`${name} ${res.status} ${(await res.text()).slice(0, 200)}`);
  return await res.json();
}

const authAdmin = (path: string, init: RequestInit = {}) => fetch(`${projectUrl()}/auth/v1/admin/${path}`, {
  ...init,
  headers: { apikey: serviceKey(), Authorization: `Bearer ${serviceKey()}`, 'Content-Type': 'application/json', ...(init.headers ?? {}) }
});

const emailFor = (steamId: string) => `${steamId}@steam.wikster.pages.dev`;

async function ensureUser(steamId: string): Promise<{ id: string; email: string } | null> {
  const linked = await admin(`steam_links?steam_id=eq.${steamId}&select=user_id`).then((r) => r.json()).catch(() => []);
  if (linked?.[0]?.user_id) {
    const res = await authAdmin(`users/${linked[0].user_id}`);
    if (res.ok) {
      const user = await res.json();
      if (user?.email) return { id: user.id, email: user.email };
    }
  }
  const password = crypto.randomUUID() + crypto.randomUUID();
  const made = await authAdmin('users', {
    method: 'POST',
    body: JSON.stringify({ email: emailFor(steamId), password, email_confirm: true, user_metadata: { provider: 'steam', steam_id: steamId } })
  });
  if (!made.ok) {
    console.error('steam-auth: create user failed', made.status, (await made.text()).slice(0, 200));
    return null;
  }
  const user = await made.json();
  const result = await rpc('link_steam', { p_user: user.id, p_steam: steamId });
  if (result === 'taken') return null;
  return { id: user.id, email: user.email };
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return json({}, 200);
  if (req.method !== 'POST') return json({ error: 'METHOD' }, 405);
  if (!APP_ID || !KEY || !serviceKey()) return json({ error: 'NOT_CONFIGURED' }, 503);
  try {
    const body = await req.json().catch(() => ({}));
    const ticket = String(body.ticket ?? '');
    if (!/^[0-9a-f]{20,4096}$/i.test(ticket)) return json({ error: 'BAD_TICKET' }, 400);
    const steamId = await steamIdFor(ticket);
    if (!steamId) return json({ error: 'STEAM_REFUSED' }, 401);

    if (body.link) {
      const userId = await callerId(req);
      if (!userId) return json({ error: 'UNAUTHORISED' }, 401);
      const result = await rpc('link_steam', { p_user: userId, p_steam: steamId });
      if (result === 'taken') return json({ error: 'STEAM_TAKEN' }, 409);
      return json({ linked: true, steamId });
    }

    const user = await ensureUser(steamId);
    if (!user) return json({ error: 'STEAM_TAKEN' }, 409);
    const link = await authAdmin('generate_link', { method: 'POST', body: JSON.stringify({ type: 'magiclink', email: user.email }) });
    if (!link.ok) {
      console.error('steam-auth: generate_link failed', link.status, (await link.text()).slice(0, 200));
      return json({ error: 'FAILED' }, 500);
    }
    const made = await link.json();
    const tokenHash = made?.hashed_token ?? made?.properties?.hashed_token;
    if (!tokenHash) return json({ error: 'FAILED' }, 500);
    return json({ token_hash: tokenHash, steamId });
  } catch (error) {
    console.error('steam-auth', error);
    return json({ error: 'FAILED' }, 500);
  }
});
