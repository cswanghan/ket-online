import { verifyJWT } from '../../src/auth';

interface Env {
  DB: D1Database;
  JWT_SECRET: string;
}

const PUBLIC_PATHS = [
  '/api/auth/login',
  '/api/auth/register',
  '/api/invite/verify',
];

export const onRequest: PagesFunction<Env> = async (context) => {
  const url = new URL(context.request.url);
  const path = url.pathname;

  // CORS headers for all API responses
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  };

  if (context.request.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  // Public routes - skip auth
  if (PUBLIC_PATHS.some(p => path === p)) {
    const response = await context.next();
    return addCorsHeaders(response, corsHeaders);
  }

  // Extract and verify JWT
  const authHeader = context.request.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return json({ error: '未登录' }, 401, corsHeaders);
  }

  const token = authHeader.slice(7);
  const payload = await verifyJWT(token, context.env.JWT_SECRET);
  if (!payload) {
    return json({ error: '登录已过期' }, 401, corsHeaders);
  }

  // Attach user info to context (both ways for compatibility)
  (context as any).user = payload;
  (context as any).data = { ...(context as any).data, user: payload };

  // Admin route check
  if (path.startsWith('/api/admin') && payload.role !== 'admin') {
    return json({ error: '无权限' }, 403, corsHeaders);
  }

  const response = await context.next();
  return addCorsHeaders(response, corsHeaders);
};

function json(data: any, status: number, headers: Record<string, string>) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers },
  });
}

function addCorsHeaders(response: Response, corsHeaders: Record<string, string>) {
  const newResponse = new Response(response.body, response);
  Object.entries(corsHeaders).forEach(([k, v]) => newResponse.headers.set(k, v));
  return newResponse;
}
