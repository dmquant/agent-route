-- Initial schema for the Analyst workspace
-- Applied automatically by storage.database.Database.initialize()

CREATE TABLE IF NOT EXISTS analysis_sessions (
    id          TEXT PRIMARY KEY,
    title       TEXT NOT NULL DEFAULT '',
    model       TEXT NOT NULL DEFAULT 'claude',
    template_id TEXT,
    metadata    TEXT NOT NULL DEFAULT '{}',   -- JSON
    created_at  TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS analysis_turns (
    id          TEXT PRIMARY KEY,
    session_id  TEXT NOT NULL REFERENCES analysis_sessions(id) ON DELETE CASCADE,
    role        TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
    content     TEXT NOT NULL,
    created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_turns_session ON analysis_turns(session_id);

CREATE TABLE IF NOT EXISTS user_templates (
    id            TEXT PRIMARY KEY,
    name          TEXT NOT NULL,
    description   TEXT NOT NULL DEFAULT '',
    category      TEXT NOT NULL DEFAULT 'custom',
    system_prompt TEXT NOT NULL,
    output_schema TEXT NOT NULL DEFAULT '{}',  -- JSON
    created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);
