interface Env { DB: D1Database; JWT_SECRET: string; }

export const onRequestGet: PagesFunction<Env> = async (context) => {
  try {
    const user = (context as any).user;
    const url = new URL(context.request.url);
    const level = url.searchParams.get('level');
    const year = url.searchParams.get('year');

    let query = 'SELECT id, level, year, total, correct, score, duration, created_at FROM quiz_sessions WHERE user_id = ?';
    const params: any[] = [user.userId];

    if (level) { query += ' AND level = ?'; params.push(level); }
    if (year) { query += ' AND year = ?'; params.push(parseInt(year)); }

    query += ' ORDER BY created_at DESC LIMIT 50';

    const sessions = await context.env.DB.prepare(query).bind(...params).all();

    return new Response(JSON.stringify({ sessions: sessions.results }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e.message || 'Internal error', stack: e.stack }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
