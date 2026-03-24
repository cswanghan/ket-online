interface Env { DB: D1Database; JWT_SECRET: string; }

export const onRequestGet: PagesFunction<Env> = async (context) => {
  try {
    const users = await context.env.DB.prepare(`
      SELECT
        u.id,
        u.username,
        u.role,
        u.status,
        COUNT(qs.id) AS total_quizzes,
        ROUND(AVG(qs.score), 1) AS total_score,
        MAX(qs.created_at) AS last_quiz_at,
        COUNT(DISTINCT qs.level) AS levels_practiced
      FROM users u
      LEFT JOIN quiz_sessions qs ON qs.user_id = u.id
      GROUP BY u.id
      ORDER BY last_quiz_at DESC
    `).all();

    return new Response(JSON.stringify({ users: users.results }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e.message || 'Internal error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
