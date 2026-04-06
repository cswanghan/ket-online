interface Env { DB: D1Database; JWT_SECRET: string; }

export const onRequestPost: PagesFunction<Env> = async (context) => {
  try {
    const user = (context as any).data?.user || (context as any).user;
    if (!user?.userId) {
      return json({ error: '未登录' }, 401);
    }

    const body = await context.request.json<{
      maxUses?: number; expiresInDays?: number;
    }>().catch(() => ({ maxUses: 1, expiresInDays: 7 }));

    const maxUses = clampInt(body.maxUses, 1, 50, 5);
    const expiresInDays = clampInt(body.expiresInDays, 1, 90, 7);
    const expiresAt = new Date(Date.now() + expiresInDays * 86400000).toISOString();

    let code = '';
    let inserted = false;
    let lastError: unknown = null;

    for (let i = 0; i < 5 && !inserted; i += 1) {
      code = makeInviteCode();
      try {
        await context.env.DB.prepare(
          'INSERT INTO invite_codes (code, creator_id, max_uses, expires_at) VALUES (?, ?, ?, ?)'
        ).bind(code, user.userId, maxUses, expiresAt).run();
        inserted = true;
      } catch (error) {
        lastError = error;
        if (!String(error).includes('UNIQUE')) throw error;
      }
    }

    if (!inserted) {
      throw lastError || new Error('invite insert failed');
    }

    return json({ code, expiresAt, maxUses });
  } catch (error: any) {
    console.error('invite/create failed', error);
    return json({ error: error?.message || '生成邀请码失败' }, 500);
  }
};

function makeInviteCode() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  return Array.from(bytes, (byte) => alphabet[byte % alphabet.length]).join('');
}

function clampInt(value: unknown, min: number, max: number, fallback: number) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, Math.round(parsed)));
}

function json(data: any, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
