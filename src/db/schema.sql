CREATE TABLE IF NOT EXISTS users (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    username   TEXT    NOT NULL UNIQUE,
    password   TEXT    NOT NULL,
    email      TEXT,
    phone      TEXT,
    role       TEXT    NOT NULL DEFAULT 'user',
    status     TEXT    NOT NULL DEFAULT 'approved',
    invited_by INTEGER,
    created_at TEXT    NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT    NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (invited_by) REFERENCES users(id)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email ON users(email) WHERE email IS NOT NULL;

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

-- 单词背诵进度：按用户+词条存储，用于多端同步
CREATE TABLE IF NOT EXISTS vocab_progress (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id    INTEGER NOT NULL,
    word_key   TEXT    NOT NULL,
    word       TEXT    NOT NULL,
    topic      TEXT    NOT NULL,
    seen       INTEGER NOT NULL DEFAULT 0,
    streak     INTEGER NOT NULL DEFAULT 0,
    mastered   INTEGER NOT NULL DEFAULT 0,
    wrong      INTEGER NOT NULL DEFAULT 0,
    favorite   INTEGER NOT NULL DEFAULT 0,
    updated_at TEXT    NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(id),
    UNIQUE (user_id, word_key)
);

CREATE INDEX IF NOT EXISTS idx_vocab_progress_user ON vocab_progress(user_id);
CREATE INDEX IF NOT EXISTS idx_vocab_progress_user_topic ON vocab_progress(user_id, topic);

-- 用户体验监控事件：记录页面访问、关键操作、失败事件和停留时长
CREATE TABLE IF NOT EXISTS ux_events (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id   TEXT    NOT NULL,
    user_id      INTEGER,
    page_path    TEXT    NOT NULL,
    event_name   TEXT    NOT NULL,
    event_group  TEXT    NOT NULL DEFAULT 'behavior',
    label        TEXT,
    value        INTEGER,
    device_type  TEXT    NOT NULL DEFAULT 'desktop',
    meta_json    TEXT,
    created_at   TEXT    NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_ux_events_created ON ux_events(created_at);
CREATE INDEX IF NOT EXISTS idx_ux_events_page ON ux_events(page_path, created_at);
CREATE INDEX IF NOT EXISTS idx_ux_events_name ON ux_events(event_name, created_at);
CREATE INDEX IF NOT EXISTS idx_ux_events_session ON ux_events(session_id, created_at);
