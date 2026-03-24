interface Env { DB: D1Database; JWT_SECRET: string; }

export const onRequestGet: PagesFunction<Env> = async (context) => {
  try {
    const user = (context as any).user;
    const url = new URL(context.request.url);
    const level = url.searchParams.get('level');

    let query = `
      SELECT s.level, s.year, a.question, a.answer AS user_answer, a.correct AS correct_answer, s.created_at
      FROM quiz_answers a
      JOIN quiz_sessions s ON a.session_id = s.id
      WHERE s.user_id = ? AND a.is_right = 0
    `;
    const params: any[] = [user.userId];

    if (level) { query += ' AND s.level = ?'; params.push(level); }

    query += ' ORDER BY s.created_at DESC LIMIT 200';

    const results = await context.env.DB.prepare(query).bind(...params).all();

    // Deduplicate: keep latest attempt per level+year+question
    const seen = new Set<string>();
    const wrong: any[] = [];
    for (const r of results.results || []) {
      const key = `${(r as any).level}-${(r as any).year}-${(r as any).question}`;
      if (!seen.has(key)) {
        seen.add(key);
        wrong.push(r);
      }
    }

    return new Response(JSON.stringify({ wrong }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e.message || 'Internal error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
