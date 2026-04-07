interface Env { DB: D1Database; JWT_SECRET: string; }

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const url = new URL(context.request.url);
  const status = url.searchParams.get('status') || 'pending';

  const users = await context.env.DB.prepare(
    'SELECT id, username, email, phone, role, status, created_at FROM users WHERE status = ? ORDER BY created_at DESC'
  ).bind(status).all();

  return new Response(JSON.stringify({ users: users.results }), {
    headers: { 'Content-Type': 'application/json' },
  });
};
