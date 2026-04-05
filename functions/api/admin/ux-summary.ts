interface Env {
  DB: D1Database;
  JWT_SECRET: string;
}

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const url = new URL(context.request.url);
  const days = clampDays(url.searchParams.get('days'));
  const since = new Date(Date.now() - days * 86400000).toISOString();

  const [
    overview,
    pages,
    friction,
    auth,
    quiz,
    vocab,
  ] = await Promise.all([
    loadOverview(context.env.DB, since),
    loadTopPages(context.env.DB, since),
    loadFriction(context.env.DB, since),
    loadAuth(context.env.DB, since),
    loadQuiz(context.env.DB, since),
    loadVocab(context.env.DB, since),
  ]);

  return json({
    days,
    since,
    overview,
    pages,
    friction,
    auth,
    quiz,
    vocab,
  });
};

async function loadOverview(db: D1Database, since: string) {
  const row = await db.prepare(
    `SELECT
       SUM(CASE WHEN event_name = 'page_view' THEN 1 ELSE 0 END) AS page_views,
       COUNT(DISTINCT session_id) AS active_sessions,
       SUM(CASE WHEN event_group = 'error' THEN 1 ELSE 0 END) AS errors,
       SUM(CASE WHEN event_name = 'page_leave' THEN COALESCE(value, 0) ELSE 0 END) AS total_duration_seconds,
       SUM(CASE WHEN event_name = 'low_engagement_bounce' THEN 1 ELSE 0 END) AS bounces
     FROM ux_events
     WHERE created_at >= ?`
  ).bind(since).first<any>();

  return {
    pageViews: row?.page_views || 0,
    activeSessions: row?.active_sessions || 0,
    errors: row?.errors || 0,
    avgDurationSeconds: row?.active_sessions ? Math.round((row.total_duration_seconds || 0) / row.active_sessions) : 0,
    bounces: row?.bounces || 0,
  };
}

async function loadTopPages(db: D1Database, since: string) {
  const rows = await db.prepare(
    `SELECT
       page_path,
       SUM(CASE WHEN event_name = 'page_view' THEN 1 ELSE 0 END) AS views,
       SUM(CASE WHEN event_name = 'page_leave' THEN COALESCE(value, 0) ELSE 0 END) AS total_duration,
       SUM(CASE WHEN event_name = 'low_engagement_bounce' THEN 1 ELSE 0 END) AS bounce_count
     FROM ux_events
     WHERE created_at >= ?
     GROUP BY page_path
     ORDER BY views DESC, total_duration DESC
     LIMIT 8`
  ).bind(since).all<any>();

  return (rows.results || []).map((row: any) => ({
    pagePath: row.page_path,
    views: row.views || 0,
    avgDurationSeconds: row.views ? Math.round((row.total_duration || 0) / row.views) : 0,
    bounceCount: row.bounce_count || 0,
  }));
}

async function loadFriction(db: D1Database, since: string) {
  const rows = await db.prepare(
    `SELECT event_name, COUNT(*) AS total
     FROM ux_events
     WHERE created_at >= ?
       AND event_name IN (
         'js_error',
         'promise_rejection',
         'page_load_slow',
         'auth_login_failure',
         'auth_register_failure',
         'quiz_auth_required',
         'quiz_submit_failed',
         'vocab_sync_failed',
         'low_engagement_bounce'
       )
     GROUP BY event_name
     ORDER BY total DESC`
  ).bind(since).all<any>();

  return (rows.results || []).map((row: any) => ({
    eventName: row.event_name,
    total: row.total || 0,
  }));
}

async function loadAuth(db: D1Database, since: string) {
  const row = await db.prepare(
    `SELECT
       SUM(CASE WHEN event_name = 'auth_login_attempt' THEN 1 ELSE 0 END) AS login_attempts,
       SUM(CASE WHEN event_name = 'auth_login_success' THEN 1 ELSE 0 END) AS login_success,
       SUM(CASE WHEN event_name = 'auth_login_failure' THEN 1 ELSE 0 END) AS login_failure,
       SUM(CASE WHEN event_name = 'auth_register_attempt' THEN 1 ELSE 0 END) AS register_attempts,
       SUM(CASE WHEN event_name = 'auth_register_success' THEN 1 ELSE 0 END) AS register_success,
       SUM(CASE WHEN event_name = 'auth_register_failure' THEN 1 ELSE 0 END) AS register_failure
     FROM ux_events
     WHERE created_at >= ?`
  ).bind(since).first<any>();

  return {
    loginAttempts: row?.login_attempts || 0,
    loginSuccess: row?.login_success || 0,
    loginFailure: row?.login_failure || 0,
    registerAttempts: row?.register_attempts || 0,
    registerSuccess: row?.register_success || 0,
    registerFailure: row?.register_failure || 0,
  };
}

async function loadQuiz(db: D1Database, since: string) {
  const row = await db.prepare(
    `SELECT
       SUM(CASE WHEN event_name = 'quiz_start' THEN 1 ELSE 0 END) AS starts,
       SUM(CASE WHEN event_name = 'quiz_submit_attempt' THEN 1 ELSE 0 END) AS submit_attempts,
       SUM(CASE WHEN event_name = 'quiz_submit_success' THEN 1 ELSE 0 END) AS submit_success,
       SUM(CASE WHEN event_name = 'quiz_submit_failed' THEN 1 ELSE 0 END) AS submit_failed,
       SUM(CASE WHEN event_name = 'quiz_auth_required' THEN 1 ELSE 0 END) AS auth_required,
       SUM(CASE WHEN event_name = 'quiz_progress_checkpoint' THEN 1 ELSE 0 END) AS checkpoints
     FROM ux_events
     WHERE created_at >= ?`
  ).bind(since).first<any>();

  return {
    starts: row?.starts || 0,
    submitAttempts: row?.submit_attempts || 0,
    submitSuccess: row?.submit_success || 0,
    submitFailed: row?.submit_failed || 0,
    authRequired: row?.auth_required || 0,
    checkpoints: row?.checkpoints || 0,
  };
}

async function loadVocab(db: D1Database, since: string) {
  const row = await db.prepare(
    `SELECT
       SUM(CASE WHEN event_name = 'vocab_session_start' THEN 1 ELSE 0 END) AS starts,
       SUM(CASE WHEN event_name = 'vocab_mode_change' THEN 1 ELSE 0 END) AS mode_changes,
       SUM(CASE WHEN event_name = 'vocab_filter_change' THEN 1 ELSE 0 END) AS filter_changes,
       SUM(CASE WHEN event_name = 'vocab_daily_focus' THEN 1 ELSE 0 END) AS daily_focus,
       SUM(CASE WHEN event_name = 'vocab_sync_failed' THEN 1 ELSE 0 END) AS sync_failed
     FROM ux_events
     WHERE created_at >= ?`
  ).bind(since).first<any>();

  return {
    starts: row?.starts || 0,
    modeChanges: row?.mode_changes || 0,
    filterChanges: row?.filter_changes || 0,
    dailyFocus: row?.daily_focus || 0,
    syncFailed: row?.sync_failed || 0,
  };
}

function clampDays(raw: string | null) {
  const value = Number(raw || 7);
  if (!Number.isFinite(value)) return 7;
  return Math.min(30, Math.max(1, Math.round(value)));
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
