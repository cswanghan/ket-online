interface Env { DB: D1Database; JWT_SECRET: string; }

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const user = (context as any).data?.user || (context as any).user;

  const codes = await context.env.DB.prepare(
    'SELECT code, max_uses, used_count, expires_at, created_at FROM invite_codes WHERE creator_id = ? ORDER BY created_at DESC'
  ).bind(user.userId).all();

  return new Response(JSON.stringify({ codes: codes.results }), {
    headers: { 'Content-Type': 'application/json' },
  });
};
