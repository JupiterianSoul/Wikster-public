const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';
const GROQ_MODELS_URL = 'https://api.groq.com/openai/v1/models';

const MODEL_PREFERENCE = [
  'openai/gpt-oss-20b',
  'qwen/qwen3.8-27b',
  'qwen/qwen3.6-27b',
  'openai/gpt-oss-120b',
  'llama-3.1-8b-instant',
  'llama-3.3-70b-versatile',
  'allam-2-7b',
  'groq/compound-mini'
];

const NOT_CHAT = /whisper|tts|guard|embed|vision-only|distil|safeguard|orpheus/i;

let warmModel = '';

export function difficultyFor(rank: number): string {
  if (rank >= 6) return 'Ask expert-level questions about fine details of the text. No giveaway wording.';
  if (rank >= 4) return 'Ask hard questions about specifics in the text. No giveaway wording.';
  if (rank >= 3) return 'Ask moderately hard questions that need a careful read of the text.';
  if (rank >= 2) return 'Mix easy and moderate questions; at most one needs a careful read.';
  return 'Ask straightforward questions a casual reader could answer after skimming the text.';
}

export type QuizAsk = { title: string; text: string; rank: number; count: number; lang: string };
export type QuizResult =
  | { ok: true; questions: { question: string; choices: string[]; answer: number }[] }
  | { ok: false; http: number; error: string; status?: number; detail?: string };

export async function writeQuiz({ title, text, rank, count, lang }: QuizAsk): Promise<QuizResult> {
  const key = (Deno.env.get('GROQ_API_KEY') ?? '').trim();
  if (!key) {
    console.error('quiz: no GROQ_API_KEY secret set on this project');
    return { ok: false, http: 503, error: 'QUIZ_UNSET' };
  }
  const language = lang === 'fr' ? 'French' : 'English';
  const prompt = [
    `Write a ${count}-question multiple-choice quiz about "${title}", in ${language}.`,
    difficultyFor(rank),
    'Use ONLY facts stated in the article text below.',
    'Each question has exactly 4 choices and exactly one correct choice. Vary which position holds the correct one.',
    'Respond with JSON only, shaped exactly as:',
    '{"questions":[{"question":"...","choices":["...","...","...","..."],"answer":0}]}',
    'where "answer" is the zero-based index of the correct choice.',
    '',
    'ARTICLE TEXT:',
    text
  ].join('\n');

  async function ask(model: string, jsonMode: boolean) {
    const body: Record<string, unknown> = {
      model,
      temperature: 0.6,
      messages: [
        { role: 'system', content: 'You write quiz questions. You respond with valid JSON only.' },
        { role: 'user', content: prompt }
      ]
    };
    if (jsonMode) body.response_format = { type: 'json_object' };
    const res = await fetch(GROQ_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
      body: JSON.stringify(body)
    });
    if (res.ok) return { ok: true as const, res };
    return { ok: false as const, status: res.status, detail: (await res.text()).slice(0, 400) };
  }

  async function liveModels(): Promise<string[]> {
    try {
      const res = await fetch(GROQ_MODELS_URL, { headers: { Authorization: `Bearer ${key}` } });
      if (!res.ok) return [];
      const data = await res.json();
      return (data?.data ?? [])
        .map((m: { id?: string }) => String(m?.id ?? ''))
        .filter((id: string) => id && !NOT_CHAT.test(id));
    } catch {
      return [];
    }
  }

  const configured = Deno.env.get('GROQ_MODEL');
  const candidates = [...new Set([warmModel, configured, ...MODEL_PREFERENCE].filter(Boolean))] as string[];
  let upstream: Response | null = null;
  let lastStatus = 0;
  let lastDetail = '';
  let usedModel = '';
  let asked = false;

  for (let round = 0; round < 2 && !upstream; round++) {
    const list = round === 0 ? candidates : (await liveModels()).slice(0, 4);
    for (const model of list) {
      let attempt;
      try {
        attempt = await ask(model, true);
      } catch (err) {
        console.error('quiz: could not reach the model', String(err));
        return { ok: false, http: 502, error: 'UPSTREAM', detail: 'could not reach the model' };
      }
      asked = true;
      if (!attempt.ok && (attempt.status === 401 || attempt.status === 403)) {
        console.error('quiz: the Groq key was refused', attempt.status, attempt.detail);
        return { ok: false, http: 502, error: 'UPSTREAM', status: attempt.status, detail: 'Groq refused the key' };
      }
      if (!attempt.ok && /response_format|json_object/i.test(attempt.detail)) {
        try {
          attempt = await ask(model, false);
        } catch {
        }
      }
      if (attempt.ok) { upstream = attempt.res; usedModel = model; warmModel = model; break; }
      lastStatus = attempt.status;
      lastDetail = attempt.detail;
      if (attempt.status === 429 && warmModel === model) warmModel = '';
      console.warn(`quiz: ${model} refused (${attempt.status})`);
    }
  }

  if (!upstream) {
    console.error('quiz: no model would answer', lastStatus, lastDetail);
    return {
      ok: false, http: 502, error: 'UPSTREAM', status: lastStatus || 502,
      detail: asked ? `no model would answer: ${lastDetail}` : 'no model available'
    };
  }
  console.log(`quiz: answered by ${usedModel}`);

  let parsed: { questions?: unknown };
  try {
    const data = await upstream.json();
    const content = String(data?.choices?.[0]?.message?.content ?? '{}')
      .replace(/^[^{]*```(?:json)?/i, '')
      .replace(/```[^}]*$/, '')
      .trim();
    parsed = JSON.parse(content.slice(content.indexOf('{'), content.lastIndexOf('}') + 1) || '{}');
  } catch (err) {
    console.error('quiz: unreadable answer', String(err));
    return { ok: false, http: 502, error: 'SHAPE', detail: 'unreadable answer' };
  }

  const questions = (Array.isArray(parsed.questions) ? parsed.questions : [])
    .filter((q: any) => q && typeof q.question === 'string'
      && Array.isArray(q.choices) && q.choices.length === 4
      && Number.isInteger(q.answer) && q.answer >= 0 && q.answer < 4)
    .slice(0, count)
    .map((q: any) => ({
      question: String(q.question).trim(),
      choices: q.choices.map((c: unknown) => String(c).trim()),
      answer: q.answer
    }));

  console.log(`quiz: writing ${questions.length} questions about "${title}"`);
  if (questions.length < 3) {
    console.error('quiz: too few usable questions', questions.length);
    return { ok: false, http: 502, error: 'SHAPE', detail: `only ${questions.length} usable questions` };
  }
  return { ok: true, questions };
}
