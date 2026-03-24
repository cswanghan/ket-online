interface Env { DB: D1Database; JWT_SECRET: string; }

export const onRequestGet: PagesFunction<Env> = async (context) => {
  try {
    const user = (context as any).user || (context as any).data?.user;
    if (!user?.userId) {
      return new Response(JSON.stringify({ error: '未登录' }), {
        status: 401, headers: { 'Content-Type': 'application/json' },
      });
    }
    const userId = user.userId;

    // 1. Overall stats
    const overviewResult = await context.env.DB.prepare(
      `SELECT COUNT(*) as totalQuizzes,
              ROUND(AVG(score), 1) as avgScore,
              SUM(correct) as totalCorrect,
              SUM(total) as totalQuestions,
              MAX(score) as bestScore
       FROM quiz_sessions WHERE user_id = ?`
    ).bind(userId).first();

    const overview = {
      totalQuizzes: overviewResult?.totalQuizzes ?? 0,
      avgScore: overviewResult?.avgScore ?? 0,
      totalCorrect: overviewResult?.totalCorrect ?? 0,
      totalQuestions: overviewResult?.totalQuestions ?? 0,
      bestScore: overviewResult?.bestScore ?? 0,
    };

    // 2. By difficulty tier (divide each paper into 3 equal tiers)
    // 20q: Q1-7/Q8-14/Q15-20, 24q: Q1-8/Q9-16/Q17-24, 30q: Q1-10/Q11-20/Q21-30
    const difficultyResult = await context.env.DB.prepare(
      `SELECT
         CASE
           WHEN a.question * 3 <= s.total THEN '3pts'
           WHEN a.question * 3 <= s.total * 2 THEN '4pts'
           ELSE '5pts'
         END as tier,
         COUNT(*) as total,
         SUM(CASE WHEN a.is_right = 1 THEN 1 ELSE 0 END) as correct
       FROM quiz_answers a
       JOIN quiz_sessions s ON a.session_id = s.id
       WHERE s.user_id = ?
       GROUP BY 1
       ORDER BY 1`
    ).bind(userId).all();

    const byDifficulty = (difficultyResult.results || []).map((r: any) => ({
      tier: r.tier,
      total: r.total,
      correct: r.correct,
      rate: r.total > 0 ? Math.round((r.correct / r.total) * 10000) / 10000 : 0,
    }));

    // 3. Trend data: last 50 sessions
    const trendResult = await context.env.DB.prepare(
      `SELECT level, year, score, total, correct, created_at
       FROM quiz_sessions
       WHERE user_id = ?
       ORDER BY created_at DESC
       LIMIT 50`
    ).bind(userId).all();

    const trend = trendResult.results || [];

    // 4. By level stats
    const byLevelResult = await context.env.DB.prepare(
      `SELECT level,
              COUNT(*) as quizzes,
              ROUND(AVG(score), 1) as avgScore,
              ROUND(AVG(CASE WHEN total > 0 THEN CAST(correct AS REAL) / total ELSE 0 END), 4) as avgCorrectRate
       FROM quiz_sessions
       WHERE user_id = ?
       GROUP BY 1
       ORDER BY 1`
    ).bind(userId).all();

    const byLevel = (byLevelResult.results || []).map((r: any) => ({
      level: r.level,
      quizzes: r.quizzes,
      avgScore: r.avgScore,
      avgCorrectRate: r.avgCorrectRate,
    }));

    // 5. Wrong answer patterns: most frequently wrong questions
    const wrongResult = await context.env.DB.prepare(
      `SELECT a.question, COUNT(*) as wrongCount
       FROM quiz_answers a
       WHERE a.session_id IN (SELECT id FROM quiz_sessions WHERE user_id = ?)
         AND a.is_right = 0
       GROUP BY 1
       ORDER BY 2 DESC
       LIMIT 10`
    ).bind(userId).all();

    const frequentWrong = (wrongResult.results || []).map((r: any) => ({
      question: r.question,
      wrongCount: r.wrongCount,
    }));

    return new Response(JSON.stringify({ overview, byDifficulty, trend, byLevel, frequentWrong }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e.message || 'Internal error', stack: e.stack }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
