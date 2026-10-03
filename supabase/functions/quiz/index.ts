import { writeQuiz } from '../_shared/quizgen.ts';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-region',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Max-Age': '7200'
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' }
  });

Deno.serve(async (req: Request) => {
  console.log(`quiz: ${req.method} in, auth=${req.headers.get('Authorization') ? 'yes' : 'no'}`);
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405);

  if (!(Deno.env.get('GROQ_API_KEY') ?? '').trim()) {
    console.error('quiz: no GROQ_API_KEY secret set on this project');
    return json({ error: 'QUIZ_UNSET' }, 503);
  }

  const authHeader = req.headers.get('Authorization') ?? '';
  const projectUrl = Deno.env.get('SUPABASE_URL') ?? '';
  const projectKey = Deno.env.get('SUPABASE_ANON_KEY')
    ?? Deno.env.get('SUPABASE_PUBLISHABLE_KEY')
    ?? req.headers.get('apikey')
    ?? '';
  if (!authHeader) {
    console.error('quiz: no authorization header on the request');
    return json({ error: 'UNAUTHORISED', detail: 'no authorization header' }, 401);
  }
  if (projectUrl && projectKey) {
    try {
      const who = await fetch(`${projectUrl}/auth/v1/user`, {
        headers: { Authorization: authHeader, apikey: projectKey }
      });
      if (!who.ok) {
        const detail = (await who.text()).slice(0, 200);
        console.error('quiz: caller rejected', who.status, detail);
        return json({ error: 'UNAUTHORISED', status: who.status, detail }, 401);
      }
    } catch (err) {
      console.error('quiz: auth lookup failed', String(err));
      return json({ error: 'UNAUTHORISED', detail: 'auth lookup failed' }, 401);
    }
  } else {
    console.warn('quiz: no project key available, skipping caller check');
  }

  let body: { title?: string; text?: string; rank?: number; count?: number; lang?: string };
  try {
    body = await req.json();
  } catch (err) {
    console.error('quiz: unreadable request body', String(err));
    return json({ error: 'BAD_REQUEST', detail: 'unreadable body' }, 400);
  }

  const title = String(body.title ?? '').slice(0, 200);
  const text = String(body.text ?? '').slice(0, 3500);
  const rank = Number.isFinite(body.rank) ? Number(body.rank) : 0;
  const count = Math.min(5, Math.max(3, Number(body.count) || 3));
  if (!title || text.length < 80) {
    console.error(`quiz: thin request, title=${Boolean(title)} textLength=${text.length}`);
    return json({ error: 'BAD_REQUEST', detail: `title=${Boolean(title)} text=${text.length} chars` }, 400);
  }

  const result = await writeQuiz({ title, text, rank, count, lang: body.lang === 'fr' ? 'fr' : 'en' });
  if (!result.ok) {
    const { http, ok: _ok, ...error } = result;
    return json(error, http);
  }
  return json({ questions: result.questions });
});
