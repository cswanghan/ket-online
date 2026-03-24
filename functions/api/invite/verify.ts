interface Env { DB: D1Database; }

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const url = new URL(context.request.url);
  const code = url.searchParams.get('code');

  if (!code) {
    return json({ valid: false, error: '缺少邀请码' }, 400);
  }

  const invite = await context.env.DB.prepare(
    'SELECT id, max_uses, used_count, expires_at FROM invite_codes WHERE code = ?'
  ).bind(code).first<any>();

  if (!invite) {
    return json({ valid: false, error: '邀请码无效' });
  }

  if (invite.used_count >= invite.max_uses) {
    return json({ valid: false, error: '邀请码已用完' });
  }

  if (new Date(invite.expires_at) < new Date()) {
    return json({ valid: false, error: '邀请码已过期' });
  }

  return json({ valid: true, remaining: invite.max_uses - invite.used_count });
};

function json(data: any, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
