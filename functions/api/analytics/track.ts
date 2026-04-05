import { verifyJWT } from '../../../src/auth';

interface Env {
  DB: D1Database;
  JWT_SECRET: string;
}

interface TrackEvent {
  pagePath?: string;
  eventName?: string;
  eventGroup?: string;
  label?: string;
  value?: number;
  deviceType?: string;
  meta?: Record<string, unknown>;
}

interface NormalizedEvent {
  pagePath: string;
  eventName: string;
  eventGroup: string;
  label: string | null;
  value: number | null;
  deviceType: string;
  meta: Record<string, unknown>;
}

export const onRequestPost: PagesFunction<Env> = async (context) => {
  const body = await context.request.json<{ events?: TrackEvent[] }>().catch(() => ({ events: [] }));
  const events = Array.isArray(body.events) ? body.events.slice(0, 50) : [];

  if (!events.length) {
    return json({ saved: 0 });
  }

  const authHeader = context.request.headers.get('Authorization');
  let userId: number | null = null;

  if (authHeader?.startsWith('Bearer ')) {
    const payload = await verifyJWT(authHeader.slice(7), context.env.JWT_SECRET);
    userId = typeof payload?.userId === 'number' ? payload.userId : null;
  }

  const sessionId = getSessionId(context.request.headers.get('X-Analytics-Session'));
  const statements = events
    .map((event) => normalizeEvent(event))
    .filter((event): event is NormalizedEvent => Boolean(event))
    .map((event) => context.env.DB.prepare(
      `INSERT INTO ux_events (
         session_id, user_id, page_path, event_name, event_group, label, value, device_type, meta_json
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(
      sessionId,
      userId,
      event.pagePath,
      event.eventName,
      event.eventGroup,
      event.label,
      event.value,
      event.deviceType,
      JSON.stringify(event.meta)
    ));

  if (!statements.length) {
    return json({ saved: 0 });
  }

  await context.env.DB.batch(statements);

  return json({ saved: statements.length });
};

function normalizeEvent(event: TrackEvent | null): NormalizedEvent | null {
  if (!event?.pagePath || !event.eventName) return null;
  return {
    pagePath: String(event.pagePath).slice(0, 120),
    eventName: String(event.eventName).slice(0, 80),
    eventGroup: String(event.eventGroup || 'behavior').slice(0, 40),
    label: event.label ? String(event.label).slice(0, 120) : null,
    value: Number.isFinite(event.value) ? Math.round(Number(event.value)) : null,
    deviceType: normalizeDeviceType(event.deviceType),
    meta: sanitizeMeta(event.meta || {}),
  };
}

function sanitizeMeta(meta: Record<string, unknown>) {
  const output: Record<string, unknown> = {};
  Object.entries(meta).slice(0, 20).forEach(([key, value]) => {
    if (value == null) return;
    if (typeof value === 'string') output[key] = value.slice(0, 300);
    else if (typeof value === 'number' || typeof value === 'boolean') output[key] = value;
  });
  return output;
}

function normalizeDeviceType(value?: string) {
  return ['mobile', 'tablet', 'desktop'].includes(String(value)) ? String(value) : 'desktop';
}

function getSessionId(value: string | null) {
  if (value && /^[a-zA-Z0-9_-]{8,80}$/.test(value)) return value;
  return crypto.randomUUID();
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
