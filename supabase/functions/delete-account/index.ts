const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-region',
      'Access-Control-Allow-Methods': 'POST, OPTIONS'
    }
  });

type Admin = { apikey: string; Authorization: string };

async function cleanup(projectUrl: string, admin: Admin, userId: string, withAuth: boolean) {
  const res = await fetch(`${projectUrl}/rest/v1/rpc/delete_account`, {
    method: 'POST',
    headers: { ...admin, 'Content-Type': 'application/json' },
    body: JSON.stringify({ p_user: userId, p_auth: withAuth })
  });
  const text = await res.text();
  let body: any = null;
  try { body = JSON.parse(text); } catch { body = null; }
  return { ok: res.ok, status: res.status, body, text: text.slice(0, 300) };
}

async function dropUser(projectUrl: string, admin: Admin, userId: string) {
  const gone = await fetch(`${projectUrl}/auth/v1/admin/users/${userId}`, { method: 'DELETE', headers: admin });
  if (gone.ok || gone.status === 404) return null;
  return { status: gone.status, detail: (await gone.text()).slice(0, 200) };
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return json({}, 200);
  if (req.method !== 'POST') return json({ error: 'METHOD' }, 405);

  const projectUrl = Deno.env.get('SUPABASE_URL') ?? '';
  const serviceKey = Deno.env.get('SERVICE_ROLE_KEY')
    ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')
    ?? Deno.env.get('ANON_KEY')
    ?? Deno.env.get('SUPABASE_PUBLISHABLE_KEY') ?? '';
  const authHeader = req.headers.get('Authorization') ?? '';

  if (!projectUrl || !serviceKey) {
    console.error('delete-account: not configured');
    return json({ error: 'NOT_CONFIGURED' }, 500);
  }
  if (!authHeader) return json({ error: 'UNAUTHORISED' }, 401);

  let userId = '';
  try {
    const headers: Record<string, string> = { Authorization: authHeader };
    if (anonKey) headers.apikey = anonKey;
    const who = await fetch(`${projectUrl}/auth/v1/user`, { headers });
    if (!who.ok) {
      const detail = (await who.text()).slice(0, 200);
      console.error('delete-account: caller rejected', who.status, detail);
      return json({ error: 'UNAUTHORISED', status: who.status, detail }, 401);
    }
    userId = (await who.json())?.id ?? '';
  } catch (err) {
    console.error('delete-account: auth lookup failed', String(err));
    return json({ error: 'UNAUTHORISED' }, 401);
  }
  if (!userId) return json({ error: 'UNAUTHORISED' }, 401);

  const admin: Admin = { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` };

  try {
    const whole = await cleanup(projectUrl, admin, userId, true);
    if (whole.ok) {
      console.log('delete-account: removed', userId);
      return json({ ok: true, ...(whole.body && typeof whole.body === 'object' ? { done: whole.body } : {}) });
    }
    const missing = whole.status === 404 || /PGRST202|delete_account|schema cache/.test(whole.text);
    const denied = /permission denied|privilege/i.test(whole.text);
    if (!missing && !denied) {
      console.error('delete-account: cleanup failed', whole.status, whole.text);
      return json({ error: 'DELETE_FAILED', status: whole.status }, 500);
    }
    if (denied) {
      const part = await cleanup(projectUrl, admin, userId, false);
      if (!part.ok) {
        console.error('delete-account: cleanup failed', part.status, part.text);
        return json({ error: 'DELETE_FAILED', status: part.status }, 500);
      }
    } else {
      console.warn('delete-account: delete_account is missing, run schema.sql');
    }
    const failed = await dropUser(projectUrl, admin, userId);
    if (failed) {
      console.error('delete-account: user delete failed', failed.status, failed.detail);
      return json({ error: 'DELETE_FAILED', ...failed }, 500);
    }
    await fetch(`${projectUrl}/rest/v1/cards_gone?user_id=eq.${userId}`, { method: 'DELETE', headers: admin }).catch(() => null);
  } catch (err) {
    console.error('delete-account: failed', String(err));
    return json({ error: 'DELETE_FAILED' }, 500);
  }

  console.log('delete-account: removed', userId);
  return json({ ok: true });
});
