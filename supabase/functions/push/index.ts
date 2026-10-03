import { googleToken, sameSecret, serviceAccount, type ServiceAccount } from '../_shared/google.ts';

type Kind = 'message' | 'friend' | 'gift' | 'trade' | 'guild' | 'outbid' | 'won' | 'sold';
type Target = { token: string; platform: string; lang: 'en' | 'fr' };

const TEXT: Record<'en' | 'fr', Record<Kind, [string, string]>> = {
  en: {
    message: ['{name}', '{body}'],
    friend: ['Friend request', '{name} wants to be your friend.'],
    gift: ['A gift arrived', '{name} sent you something.'],
    trade: ['Trade offer', '{name} proposed a trade.'],
    guild: ['Guild invitation', '{name} invited you to their guild.'],
    outbid: ['Outbid', 'Someone bid more for {body}. Your coins are back.'],
    won: ['Auction won', '{body} is yours.'],
    sold: ['Sold', '{body} found a buyer.']
  },
  fr: {
    message: ['{name}', '{body}'],
    friend: ['Demande d’ami', '{name} veut devenir votre ami.'],
    gift: ['Un cadeau est arrivé', '{name} vous a envoyé quelque chose.'],
    trade: ['Proposition d’échange', '{name} vous propose un échange.'],
    guild: ['Invitation de guilde', '{name} vous invite dans sa guilde.'],
    outbid: ['Enchère dépassée', 'Quelqu’un a misé plus sur {body}. Vos pièces vous sont rendues.'],
    won: ['Enchère remportée', '{body} est à vous.'],
    sold: ['Vendu', '{body} a trouvé preneur.']
  }
};

const fill = (s: string, vars: Record<string, string>) => s.replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? '');

async function sendOne(sa: ServiceAccount, access: string, projectUrl: string, db: Record<string, string>, target: Target, message: Record<string, unknown>) {
  const res = await fetch(`https://fcm.googleapis.com/v1/projects/${sa.project_id}/messages:send`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${access}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ message: { token: target.token, ...message } })
  });
  if (res.ok) return true;
  const detail = await res.text();
  if (res.status === 404 || /UNREGISTERED|INVALID_ARGUMENT/.test(detail)) {
    await fetch(`${projectUrl}/rest/v1/push_tokens?token=eq.${encodeURIComponent(target.token)}`, { method: 'DELETE', headers: db });
  } else {
    console.error('push: send failed', res.status, detail.slice(0, 200));
  }
  return false;
}

async function broadcast(sa: ServiceAccount, projectUrl: string, db: Record<string, string>, id: string) {
  const job = await fetch(`${projectUrl}/rest/v1/rpc/push_broadcast_targets`, {
    method: 'POST', headers: db, body: JSON.stringify({ p_id: id })
  }).then((r) => (r.ok ? r.json() : null)).catch(() => null);
  const targets: Target[] = Array.isArray(job?.targets) ? job.targets : [];
  if (!targets.length) return 0;
  const access = await googleToken(sa, 'https://www.googleapis.com/auth/firebase.messaging');
  const message = {
    notification: { title: String(job.title ?? '').slice(0, 80), body: String(job.body ?? '').slice(0, 240) },
    data: { kind: 'broadcast', ref: String(job.url ?? '') },
    android: { priority: 'high', notification: { channel_id: 'wikster.social', tag: `broadcast:${id}` } }
  };
  let sent = 0;
  for (let i = 0; i < targets.length; i += 20) {
    const done = await Promise.all(targets.slice(i, i + 20).map((target) => sendOne(sa, access, projectUrl, db, target, message).catch(() => false)));
    sent += done.filter(Boolean).length;
  }
  await fetch(`${projectUrl}/rest/v1/rpc/push_broadcast_done`, { method: 'POST', headers: db, body: JSON.stringify({ p_id: id, p_sent: sent }) }).catch(() => null);
  return sent;
}

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') return new Response('METHOD', { status: 405 });
  const secret = Deno.env.get('PUSH_SECRET') ?? '';
  if (!sameSecret(req.headers.get('x-push-secret') ?? '', secret)) return new Response('NO', { status: 401 });

  const projectUrl = Deno.env.get('SUPABASE_URL') ?? '';
  const serviceKey = Deno.env.get('SERVICE_ROLE_KEY') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  const sa = serviceAccount();
  if (!projectUrl || !serviceKey || !sa?.project_id) return new Response('NOT_CONFIGURED', { status: 500 });

  const { user, kind, from, ref, broadcast: job } = await req.json().catch(() => ({}));
  const db = { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, 'Content-Type': 'application/json' };
  if (kind === 'broadcast') {
    if (!/^[0-9a-f-]{36}$/i.test(String(job ?? ''))) return new Response('BAD', { status: 400 });
    const sent = await broadcast(sa, projectUrl, db, String(job));
    return new Response(JSON.stringify({ sent }), { headers: { 'Content-Type': 'application/json' } });
  }
  if (!user || !(kind in TEXT.en)) return new Response('BAD', { status: 400 });

  const targets: Target[] = await fetch(`${projectUrl}/rest/v1/rpc/push_targets`, {
    method: 'POST', headers: db, body: JSON.stringify({ p_user: user })
  }).then((r) => (r.ok ? r.json() : [])).catch(() => []);
  if (!targets.length) return new Response(JSON.stringify({ sent: 0 }));

  const who = await fetch(`${projectUrl}/rest/v1/profiles?id=eq.${encodeURIComponent(from)}&select=username`, { headers: db })
    .then((r) => (r.ok ? r.json() : [])).catch(() => []);
  let body = '';
  if (kind === 'message' && ref) {
    const rows = await fetch(`${projectUrl}/rest/v1/messages?id=eq.${encodeURIComponent(ref)}&select=body`, { headers: db })
      .then((r) => (r.ok ? r.json() : [])).catch(() => []);
    body = String(rows?.[0]?.body ?? '').slice(0, 140);
  } else if ((kind === 'outbid' || kind === 'won' || kind === 'sold') && /^[0-9a-f-]{36}$/i.test(String(ref ?? ''))) {
    const rows = await fetch(`${projectUrl}/rest/v1/auctions?id=eq.${encodeURIComponent(ref)}&select=title`, { headers: db })
      .then((r) => (r.ok ? r.json() : [])).catch(() => []);
    body = String(rows?.[0]?.title ?? '').slice(0, 140);
  }
  const name = who?.[0]?.username ?? 'Wikster';

  const access = await googleToken(sa, 'https://www.googleapis.com/auth/firebase.messaging');
  let sent = 0;
  for (const target of targets) {
    const [title, text] = TEXT[target.lang === 'fr' ? 'fr' : 'en'][kind as Kind];
    const ok = await sendOne(sa, access, projectUrl, db, target, {
      notification: { title: fill(title, { name, body }), body: fill(text, { name, body }) },
      data: { kind: String(kind), ref: String(ref ?? '') },
      android: { priority: 'high', notification: { channel_id: 'wikster.social', tag: `${kind}:${from ?? ref}` } }
    });
    if (ok) sent++;
  }
  return new Response(JSON.stringify({ sent }), { headers: { 'Content-Type': 'application/json' } });
});
