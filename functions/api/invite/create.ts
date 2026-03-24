import { generateInviteCode } from '../../../src/auth';

interface Env { DB: D1Database; JWT_SECRET: string; }

export const onRequestPost: PagesFunction<Env> = async (context) => {
  const user = (context as any).user;
  const { maxUses = 1, expiresInDays = 7 } = await context.request.json<{
    maxUses?: number; expiresInDays?: number;
  }>().catch(() => ({}));

  const code = generateInviteCode();
  const expiresAt = new Date(Date.now() + expiresInDays * 86400000).toISOString();

  await context.env.DB.prepare(
    'INSERT INTO invite_codes (code, creator_id, max_uses, expires_at) VALUES (?, ?, ?, ?)'
  ).bind(code, user.userId, Math.min(maxUses, 50), expiresAt).run();

  return new Response(JSON.stringify({ code, expiresAt, maxUses }), {
    headers: { 'Content-Type': 'application/json' },
  });
};
