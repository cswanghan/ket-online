interface Env { DB: D1Database; JWT_SECRET: string; }

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const user = (context as any).user;
  const url = new URL(context.request.url);
  const sessionId = url.searchParams.get('id');

  if (!sessionId) return json({ error: '缺少 id' }, 400);

  // Verify ownership
  const session = await context.env.DB.prepare(
    'SELECT * FROM quiz_sessions WHERE id = ? AND user_id = ?'
  ).bind(parseInt(sessionId), user.userId).first();

  if (!session) return json({ error: '记录不存在' }, 404);

  const answers = await context.env.DB.prepare(
    'SELECT question, answer, correct, is_right FROM quiz_answers WHERE session_id = ? ORDER BY question'
  ).bind(parseInt(sessionId)).all();

  return json({ session, answers: answers.results });
};

function json(data: any, status = 200) {
  return new Response(JSON.stringify(data), {
    status, headers: { 'Content-Type': 'application/json' },
  });
}
