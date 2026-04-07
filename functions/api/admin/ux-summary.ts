interface Env {
  DB: D1Database;
  JWT_SECRET: string;
}

type FunnelStep = {
  key: string;
  label: string;
  count: number;
};

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
    quizFunnel,
    vocabFunnel,
  ] = await Promise.all([
    loadOverview(context.env.DB, since),
    loadTopPages(context.env.DB, since),
    loadFriction(context.env.DB, since),
    loadAuth(context.env.DB, since),
    loadQuiz(context.env.DB, since),
    loadVocab(context.env.DB, since),
    loadQuizFunnel(context.env.DB, since),
    loadVocabFunnel(context.env.DB, since),
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
    quizFunnel,
    vocabFunnel,
  });
};

async function loadOverview(db: D1Database, since: string) {
  const row = await db.prepare(
    `SELECT
       SUM(CASE WHEN event_name = 'page_view' THEN 1 ELSE 0 END) AS page_views,
       COUNT(DISTINCT session_id) AS active_sessions,
       SUM(CASE WHEN event_name IN (
         'js_error',
         'promise_rejection',
         'auth_login_failure',
         'auth_register_failure',
         'quiz_submit_failed',
         'quiz_save_history_failed',
         'vocab_sync_failed'
       ) THEN 1 ELSE 0 END) AS errors,
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
         'quiz_in_progress_leave',
         'quiz_submit_failed',
         'quiz_save_history_failed',
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
       SUM(CASE WHEN event_name = 'quiz_guest_result_shown' THEN 1 ELSE 0 END) AS guest_results,
       SUM(CASE WHEN event_name = 'quiz_save_history_success' THEN 1 ELSE 0 END) AS save_history_success,
       COUNT(DISTINCT CASE WHEN event_name IN ('quiz_submit_success', 'quiz_save_history_success') THEN session_id END) AS persisted_sessions,
       SUM(CASE WHEN event_name = 'quiz_submit_failed' THEN 1 ELSE 0 END) AS submit_failed,
       SUM(CASE WHEN event_name = 'quiz_in_progress_leave' THEN 1 ELSE 0 END) AS in_progress_leave,
       SUM(CASE WHEN event_name = 'quiz_progress_checkpoint' THEN 1 ELSE 0 END) AS checkpoints
     FROM ux_events
     WHERE created_at >= ?`
  ).bind(since).first<any>();

  return {
    starts: row?.starts || 0,
    submitAttempts: row?.submit_attempts || 0,
    submitSuccess: row?.submit_success || 0,
    guestResults: row?.guest_results || 0,
    saveHistorySuccess: row?.save_history_success || 0,
    persistedSessions: row?.persisted_sessions || 0,
    submitFailed: row?.submit_failed || 0,
    inProgressLeave: row?.in_progress_leave || 0,
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
       SUM(CASE WHEN event_name = 'vocab_word_complete' THEN 1 ELSE 0 END) AS word_completions,
       SUM(CASE WHEN event_name = 'vocab_sync_failed' THEN 1 ELSE 0 END) AS sync_failed
     FROM ux_events
     WHERE created_at >= ?`
  ).bind(since).first<any>();

  return {
    starts: row?.starts || 0,
    modeChanges: row?.mode_changes || 0,
    filterChanges: row?.filter_changes || 0,
    dailyFocus: row?.daily_focus || 0,
    wordCompletions: row?.word_completions || 0,
    syncFailed: row?.sync_failed || 0,
  };
}

async function loadQuizFunnel(db: D1Database, since: string): Promise<FunnelStep[]> {
  const row = await db.prepare(
    `SELECT
       COUNT(DISTINCT CASE WHEN event_name = 'home_entry_click' AND json_extract(meta_json, '$.target') = 'quiz' THEN session_id END) AS home_click,
       COUNT(DISTINCT CASE WHEN event_name = 'quiz_selector_view' THEN session_id END) AS selector_view,
       COUNT(DISTINCT CASE WHEN event_name = 'quiz_test_select' THEN session_id END) AS test_select,
       COUNT(DISTINCT CASE WHEN event_name = 'quiz_start' THEN session_id END) AS quiz_start,
       COUNT(DISTINCT CASE WHEN event_name = 'quiz_progress_checkpoint' AND CAST(json_extract(meta_json, '$.percent') AS INTEGER) >= 50 THEN session_id END) AS mid_progress,
       COUNT(DISTINCT CASE WHEN event_name = 'quiz_submit_attempt' THEN session_id END) AS submit_attempt,
       COUNT(DISTINCT CASE WHEN event_name IN ('quiz_submit_success', 'quiz_guest_result_shown') THEN session_id END) AS result_view,
       COUNT(DISTINCT CASE WHEN event_name IN ('quiz_submit_success', 'quiz_save_history_success') THEN session_id END) AS save_history
     FROM ux_events
     WHERE created_at >= ?`
  ).bind(since).first<any>();

  return [
    { key: 'home_click', label: '首页点进测验', count: row?.home_click || 0 },
    { key: 'selector_view', label: '看到套卷列表', count: row?.selector_view || 0 },
    { key: 'test_select', label: '选择具体套卷', count: row?.test_select || 0 },
    { key: 'quiz_start', label: '开始作答', count: row?.quiz_start || 0 },
    { key: 'mid_progress', label: '做到 50%', count: row?.mid_progress || 0 },
    { key: 'submit_attempt', label: '点击交卷', count: row?.submit_attempt || 0 },
    { key: 'result_view', label: '看到结果页', count: row?.result_view || 0 },
    { key: 'save_history', label: '成绩入库', count: row?.save_history || 0 },
  ];
}

async function loadVocabFunnel(db: D1Database, since: string): Promise<FunnelStep[]> {
  const [row, engaged] = await Promise.all([
    db.prepare(
      `SELECT
         COUNT(DISTINCT CASE WHEN event_name = 'home_entry_click' AND json_extract(meta_json, '$.target') IN ('vocab', 'vocab_daily', 'vocab_dictation') THEN session_id END) AS home_click,
         COUNT(DISTINCT CASE WHEN event_name = 'vocab_session_start' THEN session_id END) AS vocab_start,
         COUNT(DISTINCT CASE WHEN event_name = 'vocab_daily_focus' THEN session_id END) AS daily_focus,
         COUNT(DISTINCT CASE WHEN event_name = 'vocab_word_complete' THEN session_id END) AS first_word
       FROM ux_events
       WHERE created_at >= ?`
    ).bind(since).first<any>(),
    db.prepare(
      `SELECT COUNT(*) AS engaged_sessions
       FROM (
         SELECT session_id
         FROM ux_events
         WHERE created_at >= ?
           AND event_name = 'vocab_word_complete'
         GROUP BY session_id
         HAVING COUNT(*) >= 5
       )`
    ).bind(since).first<any>(),
  ]);

  return [
    { key: 'home_click', label: '首页进入背词', count: row?.home_click || 0 },
    { key: 'vocab_start', label: '打开背词页', count: row?.vocab_start || 0 },
    { key: 'daily_focus', label: '进入每日 20 词', count: row?.daily_focus || 0 },
    { key: 'first_word', label: '完成至少 1 词', count: row?.first_word || 0 },
    { key: 'engaged_5', label: '完成至少 5 词', count: engaged?.engaged_sessions || 0 },
  ];
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
