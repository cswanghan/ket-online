interface Env { DB: D1Database; JWT_SECRET: string; }

interface SubmitBody {
  level: string;
  year: number;
  answers: { question: number; answer: string; correct: string; isRight: boolean; points?: number }[];
  duration: number;
  score?: number;
}

export const onRequestPost: PagesFunction<Env> = async (context) => {
  const user = (context as any).data?.user || (context as any).user;
  const body = await context.request.json<SubmitBody>();

  if (!body.level || !body.year || !body.answers?.length) {
    return json({ error: '参数错误' }, 400);
  }

  const total = body.answers.length;
  const correctCount = body.answers.filter(a => a.isRight).length;
  // Use client-provided score (weighted by points) or fallback
  const score = body.score ?? body.answers.reduce((s, a) => s + (a.isRight ? (a.points || 1) : 0), 0);

  const session = await context.env.DB.prepare(
    'INSERT INTO quiz_sessions (user_id, level, year, total, correct, score, duration) VALUES (?, ?, ?, ?, ?, ?, ?) RETURNING id'
  ).bind(user.userId, body.level, body.year, total, correctCount, score, body.duration || 0).first<{ id: number }>();

  if (!session) return json({ error: '保存失败' }, 500);

  const stmts = body.answers.map(a =>
    context.env.DB.prepare(
      'INSERT INTO quiz_answers (session_id, question, answer, correct, is_right) VALUES (?, ?, ?, ?, ?)'
    ).bind(session.id, a.question, a.answer, a.correct, a.isRight ? 1 : 0)
  );

  await context.env.DB.batch(stmts);

  return json({ sessionId: session.id, correct: correctCount, total, score });
};

function json(data: any, status = 200) {
  return new Response(JSON.stringify(data), {
    status, headers: { 'Content-Type': 'application/json' },
  });
}
