import { hashPassword } from '../../../src/auth';

interface Env { DB: D1Database; JWT_SECRET: string; }

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const onRequestPost: PagesFunction<Env> = async (context) => {
  const { username, password, email, phone, inviteCode } = await context.request.json<{
    username: string; password: string; email: string; phone?: string; inviteCode?: string;
  }>();

  if (!username || !password || !email) {
    return json({ error: '用户名、邮箱和密码不能为空' }, 400);
  }

  if (username.length < 3 || username.length > 20) {
    return json({ error: '用户名长度 3-20 字符' }, 400);
  }

  if (password.length < 6) {
    return json({ error: '密码至少 6 位' }, 400);
  }

  const normalizedEmail = email.trim().toLowerCase();
  if (!EMAIL_REGEX.test(normalizedEmail) || normalizedEmail.length > 120) {
    return json({ error: '邮箱格式不正确' }, 400);
  }

  // Check username exists
  const existingUser = await context.env.DB.prepare(
    'SELECT id FROM users WHERE username = ?'
  ).bind(username).first();

  if (existingUser) {
    return json({ error: '用户名已存在' }, 409);
  }

  // Check email exists
  const existingEmail = await context.env.DB.prepare(
    'SELECT id FROM users WHERE email = ?'
  ).bind(normalizedEmail).first();

  if (existingEmail) {
    return json({ error: '邮箱已被注册' }, 409);
  }

  // 默认直接放行（访客模式）；邀请码注册同样放行，并记录邀请人
  let invitedBy: number | null = null;

  if (inviteCode) {
    const code = await context.env.DB.prepare(
      'SELECT id, creator_id, max_uses, used_count, expires_at FROM invite_codes WHERE code = ?'
    ).bind(inviteCode).first<any>();

    if (!code) {
      return json({ error: '邀请码无效' }, 400);
    }

    if (code.used_count >= code.max_uses) {
      return json({ error: '邀请码已用完' }, 400);
    }

    if (new Date(code.expires_at) < new Date()) {
      return json({ error: '邀请码已过期' }, 400);
    }

    invitedBy = code.creator_id;

    await context.env.DB.prepare(
      'UPDATE invite_codes SET used_count = used_count + 1 WHERE id = ?'
    ).bind(code.id).run();
  }

  const hashedPassword = await hashPassword(password);

  await context.env.DB.prepare(
    'INSERT INTO users (username, password, email, phone, status, invited_by) VALUES (?, ?, ?, ?, ?, ?)'
  ).bind(username, hashedPassword, normalizedEmail, phone || null, 'approved', invitedBy).run();

  return json({ message: '注册成功，可直接登录' });
};

function json(data: any, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
