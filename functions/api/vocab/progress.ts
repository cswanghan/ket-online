interface Env {
  DB: D1Database;
  JWT_SECRET: string;
}

interface VocabProgressEntry {
  word?: string;
  topic?: string;
  seen?: number;
  streak?: number;
  mastered?: boolean;
  wrong?: number;
  favorite?: boolean;
  updatedAt?: string | number;
}

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const user = (context as any).data?.user || (context as any).user;
  const rows = await context.env.DB.prepare(
    `SELECT word_key, word, topic, seen, streak, mastered, wrong, favorite, updated_at
     FROM vocab_progress
     WHERE user_id = ?
     ORDER BY updated_at DESC, id DESC`
  ).bind(user.userId).all<any>();

  const progress = Object.fromEntries(
    (rows.results || []).map((row: any) => [
      row.word_key,
      {
        word: row.word,
        topic: row.topic,
        seen: row.seen || 0,
        streak: row.streak || 0,
        mastered: Boolean(row.mastered),
        wrong: row.wrong || 0,
        favorite: Boolean(row.favorite),
        updatedAt: row.updated_at || null,
      },
    ])
  );

  return json({
    progress,
    count: Object.keys(progress).length,
    syncedAt: new Date().toISOString(),
  });
};

export const onRequestPost: PagesFunction<Env> = async (context) => {
  const user = (context as any).data?.user || (context as any).user;
  const body = await context.request.json<{ progress?: Record<string, VocabProgressEntry> }>();
  const progress = body.progress || {};
  const entries = Object.entries(progress).filter(([wordKey, value]) => wordKey && value);

  if (!entries.length) {
    return json({ saved: 0, syncedAt: new Date().toISOString() });
  }

  if (entries.length > 1000) {
    return json({ error: '一次最多同步 1000 个词条' }, 400);
  }

  const statements = entries.map(([wordKey, value]) => {
    const updatedAt = normalizeUpdatedAt(value.updatedAt);
    return context.env.DB.prepare(
      `INSERT INTO vocab_progress (
         user_id, word_key, word, topic, seen, streak, mastered, wrong, favorite, updated_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(user_id, word_key) DO UPDATE SET
         word = excluded.word,
         topic = excluded.topic,
         seen = excluded.seen,
         streak = excluded.streak,
         mastered = excluded.mastered,
         wrong = excluded.wrong,
         favorite = excluded.favorite,
         updated_at = excluded.updated_at`
    ).bind(
      user.userId,
      wordKey,
      value.word || extractWordFromKey(wordKey),
      value.topic || extractTopicFromKey(wordKey),
      safeInt(value.seen),
      safeInt(value.streak),
      value.mastered ? 1 : 0,
      safeInt(value.wrong),
      value.favorite ? 1 : 0,
      updatedAt
    );
  });

  await context.env.DB.batch(statements);

  return json({
    saved: entries.length,
    syncedAt: new Date().toISOString(),
  });
};

function extractTopicFromKey(wordKey: string) {
  return wordKey.split('::')[0] || 'unknown';
}

function extractWordFromKey(wordKey: string) {
  return wordKey.split('::').slice(1).join('::') || wordKey;
}

function normalizeUpdatedAt(value?: string | number) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return new Date(value).toISOString();
  }
  if (typeof value === 'string' && value.trim()) {
    const date = new Date(value);
    if (!Number.isNaN(date.getTime())) return date.toISOString();
  }
  return new Date().toISOString();
}

function safeInt(value?: number) {
  return Number.isFinite(value) ? Math.max(0, Math.floor(Number(value))) : 0;
}

function json(data: any, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
