CREATE TABLE IF NOT EXISTS users (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    username   TEXT    NOT NULL UNIQUE,
    password   TEXT    NOT NULL,
    phone      TEXT,
    role       TEXT    NOT NULL DEFAULT 'user',
    status     TEXT    NOT NULL DEFAULT 'pending',
    invited_by INTEGER,
    created_at TEXT    NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT    NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (invited_by) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS invite_codes (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    code       TEXT    NOT NULL UNIQUE,
    creator_id INTEGER NOT NULL,
    max_uses   INTEGER NOT NULL DEFAULT 1,
    used_count INTEGER NOT NULL DEFAULT 0,
    expires_at TEXT    NOT NULL,
    created_at TEXT    NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (creator_id) REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
CREATE INDEX IF NOT EXISTS idx_users_status ON users(status);
CREATE INDEX IF NOT EXISTS idx_invite_codes_code ON invite_codes(code);

-- 答题记录：每次完成一套卷的汇总
CREATE TABLE IF NOT EXISTS quiz_sessions (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id    INTEGER NOT NULL,
    level      TEXT    NOT NULL,
    year       INTEGER NOT NULL,
    total      INTEGER NOT NULL,
    correct    INTEGER NOT NULL,
    score      INTEGER NOT NULL DEFAULT 0,
    duration   INTEGER NOT NULL DEFAULT 0,
    created_at TEXT    NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(id)
);

-- 每道题的作答明细
CREATE TABLE IF NOT EXISTS quiz_answers (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id INTEGER NOT NULL,
    question   INTEGER NOT NULL,
    answer     TEXT    NOT NULL,
    correct    TEXT    NOT NULL,
    is_right   INTEGER NOT NULL DEFAULT 0,
    FOREIGN KEY (session_id) REFERENCES quiz_sessions(id)
);

CREATE INDEX IF NOT EXISTS idx_sessions_user ON quiz_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_level_year ON quiz_sessions(level, year);
CREATE INDEX IF NOT EXISTS idx_answers_session ON quiz_answers(session_id);
