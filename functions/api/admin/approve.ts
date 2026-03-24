interface Env { DB: D1Database; JWT_SECRET: string; }

export const onRequestPost: PagesFunction<Env> = async (context) => {
  const { userId, action } = await context.request.json<{ userId: number; action: 'approve' | 'reject' }>();

  if (!userId || !['approve', 'reject'].includes(action)) {
    return json({ error: '参数错误' }, 400);
  }

  const status = action === 'approve' ? 'approved' : 'rejected';

  const result = await context.env.DB.prepare(
    "UPDATE users SET status = ?, updated_at = datetime('now') WHERE id = ? AND status = 'pending'"
  ).bind(status, userId).run();

  if (result.meta.changes === 0) {
    return json({ error: '用户不存在或已处理' }, 404);
  }

  return json({ message: action === 'approve' ? '已通过' : '已拒绝' });
};

function json(data: any, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
