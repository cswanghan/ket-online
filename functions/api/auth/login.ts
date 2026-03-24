import { verifyPassword, signJWT } from '../../../src/auth';

interface Env { DB: D1Database; JWT_SECRET: string; }

export const onRequestPost: PagesFunction<Env> = async (context) => {
  const { username, password } = await context.request.json<{ username: string; password: string }>();

  if (!username || !password) {
    return json({ error: '请输入用户名和密码' }, 400);
  }

  const user = await context.env.DB.prepare(
    'SELECT id, username, password, role, status FROM users WHERE username = ?'
  ).bind(username).first<any>();

  if (!user) {
    return json({ error: '用户名或密码错误' }, 401);
  }

  if (user.status === 'pending') {
    return json({ error: '账号待审核，请耐心等待' }, 403);
  }

  if (user.status === 'rejected') {
    return json({ error: '账号审核未通过' }, 403);
  }

  const valid = await verifyPassword(password, user.password);
  if (!valid) {
    return json({ error: '用户名或密码错误' }, 401);
  }

  const token = await signJWT(
    { userId: user.id, username: user.username, role: user.role },
    context.env.JWT_SECRET
  );

  return json({ token, user: { id: user.id, username: user.username, role: user.role } });
};

function json(data: any, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
