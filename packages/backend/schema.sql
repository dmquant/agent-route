-- ============================================
-- AI Agents Route Service — Unified D1 Schema
-- Managed by Wrangler: npx wrangler d1 execute cli_db --local --file=./schema.sql
-- ============================================

-- Projects: logical grouping of sessions
CREATE TABLE IF NOT EXISTS projects (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT DEFAULT '',
    color TEXT DEFAULT '#6366f1',
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
);

-- Sessions: persistent conversation threads with isolated workspaces
CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    project_id TEXT,
    title TEXT DEFAULT 'New Session',
    agent_type TEXT DEFAULT 'gemini',
    workspace_dir TEXT,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE SET NULL
);

-- Messages: all user and agent messages within sessions
CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id TEXT NOT NULL,
    source TEXT NOT NULL,
    content TEXT NOT NULL,
    image_b64 TEXT,
    agent_type TEXT,
    created_at INTEGER NOT NULL,
    FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
);

-- Historical execution logs (legacy compatibility)
CREATE TABLE IF NOT EXISTS historical_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT,
    agent TEXT,
    status TEXT,
    timestamp INTEGER,
    fullContent TEXT
);

-- Performance indexes
CREATE INDEX IF NOT EXISTS idx_sessions_project ON sessions(project_id);
CREATE INDEX IF NOT EXISTS idx_messages_session ON messages(session_id);
CREATE INDEX IF NOT EXISTS idx_messages_created ON messages(created_at);
CREATE INDEX IF NOT EXISTS idx_logs_timestamp ON historical_logs(timestamp);
