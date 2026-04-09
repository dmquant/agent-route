"""Environment-independent Session & Project persistence.

Uses a standalone SQLite database (sessions.db) that is fully
decoupled from workspace directories or agent-specific configs.
"""

import sqlite3
import os
import time
import json
from uuid import uuid4
from typing import Dict, List, Optional

DB_PATH = os.path.join(os.path.dirname(__file__), 'sessions.db')


def _get_conn() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA foreign_keys=ON")
    return conn


def init_session_db():
    """Create tables if they don't exist."""
    conn = _get_conn()
    c = conn.cursor()
    c.executescript('''
        CREATE TABLE IF NOT EXISTS projects (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            description TEXT DEFAULT '',
            color TEXT DEFAULT '#6366f1',
            created_at INTEGER NOT NULL,
            updated_at INTEGER NOT NULL
        );

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

        CREATE INDEX IF NOT EXISTS idx_sessions_project ON sessions(project_id);
        CREATE INDEX IF NOT EXISTS idx_messages_session ON messages(session_id);
        CREATE INDEX IF NOT EXISTS idx_messages_created ON messages(created_at);
    ''')
    conn.commit()

    # ─── Migration: add workspace_dir column if missing (existing DBs) ───
    try:
        c.execute("SELECT workspace_dir FROM sessions LIMIT 1")
    except sqlite3.OperationalError:
        c.execute("ALTER TABLE sessions ADD COLUMN workspace_dir TEXT")
        conn.commit()
        print("[Migration] Added workspace_dir column to sessions table.")

    conn.close()


def _get_workspace_base() -> str:
    """Return the base directory for per-session workspaces from env."""
    base = os.getenv(
        'SESSION_WORKSPACE_BASE',
        os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))), 'workspaces', 'sessions')
    )
    return base


def _provision_session_workspace(session_id: str) -> str:
    """Create an isolated working directory for a session and return its path."""
    base = _get_workspace_base()
    workspace = os.path.join(base, session_id)
    os.makedirs(workspace, exist_ok=True)
    return workspace


# ─── Projects ───────────────────────────────────────────────

def create_project(name: str, description: str = '', color: str = '#6366f1') -> Dict:
    conn = _get_conn()
    pid = uuid4().hex
    now = int(time.time() * 1000)
    conn.execute(
        'INSERT INTO projects (id, name, description, color, created_at, updated_at) VALUES (?,?,?,?,?,?)',
        (pid, name, description, color, now, now)
    )
    conn.commit()
    row = conn.execute('SELECT * FROM projects WHERE id=?', (pid,)).fetchone()
    conn.close()
    return dict(row)


def list_projects() -> List[Dict]:
    conn = _get_conn()
    rows = conn.execute('SELECT * FROM projects ORDER BY updated_at DESC').fetchall()
    result = []
    for r in rows:
        d = dict(r)
        # Attach session count
        cnt = conn.execute('SELECT COUNT(*) as c FROM sessions WHERE project_id=?', (r['id'],)).fetchone()
        d['session_count'] = cnt['c'] if cnt else 0
        result.append(d)
    conn.close()
    return result


def update_project(project_id: str, name: Optional[str] = None, description: Optional[str] = None, color: Optional[str] = None) -> Optional[Dict]:
    conn = _get_conn()
    existing = conn.execute('SELECT * FROM projects WHERE id=?', (project_id,)).fetchone()
    if not existing:
        conn.close()
        return None
    now = int(time.time() * 1000)
    conn.execute(
        'UPDATE projects SET name=?, description=?, color=?, updated_at=? WHERE id=?',
        (
            name if name is not None else existing['name'],
            description if description is not None else existing['description'],
            color if color is not None else existing['color'],
            now,
            project_id
        )
    )
    conn.commit()
    row = conn.execute('SELECT * FROM projects WHERE id=?', (project_id,)).fetchone()
    conn.close()
    return dict(row)


def delete_project(project_id: str) -> bool:
    conn = _get_conn()
    conn.execute('DELETE FROM projects WHERE id=?', (project_id,))
    conn.commit()
    conn.close()
    return True


# ─── Sessions ───────────────────────────────────────────────

def create_session(project_id: Optional[str] = None, title: str = 'New Session', agent_type: str = 'gemini') -> Dict:
    conn = _get_conn()
    sid = uuid4().hex
    now = int(time.time() * 1000)
    # Provision an isolated workspace directory for this session
    workspace = _provision_session_workspace(sid)
    conn.execute(
        'INSERT INTO sessions (id, project_id, title, agent_type, workspace_dir, created_at, updated_at) VALUES (?,?,?,?,?,?,?)',
        (sid, project_id, title, agent_type, workspace, now, now)
    )
    conn.commit()
    row = conn.execute('SELECT * FROM sessions WHERE id=?', (sid,)).fetchone()
    conn.close()
    return dict(row)


def list_sessions(project_id: Optional[str] = None) -> List[Dict]:
    conn = _get_conn()
    if project_id:
        rows = conn.execute(
            'SELECT * FROM sessions WHERE project_id=? ORDER BY updated_at DESC',
            (project_id,)
        ).fetchall()
    else:
        rows = conn.execute('SELECT * FROM sessions ORDER BY updated_at DESC').fetchall()
    
    result = []
    for r in rows:
        d = dict(r)
        cnt = conn.execute('SELECT COUNT(*) as c FROM messages WHERE session_id=?', (r['id'],)).fetchone()
        d['message_count'] = cnt['c'] if cnt else 0
        # Get last message preview
        last = conn.execute(
            'SELECT content, source FROM messages WHERE session_id=? ORDER BY created_at DESC LIMIT 1',
            (r['id'],)
        ).fetchone()
        d['last_message'] = dict(last) if last else None
        result.append(d)
    conn.close()
    return result


def get_session(session_id: str) -> Optional[Dict]:
    conn = _get_conn()
    row = conn.execute('SELECT * FROM sessions WHERE id=?', (session_id,)).fetchone()
    conn.close()
    return dict(row) if row else None


def update_session(session_id: str, title: Optional[str] = None, project_id: Optional[str] = '__UNSET__') -> Optional[Dict]:
    conn = _get_conn()
    existing = conn.execute('SELECT * FROM sessions WHERE id=?', (session_id,)).fetchone()
    if not existing:
        conn.close()
        return None
    now = int(time.time() * 1000)
    new_title = title if title is not None else existing['title']
    new_project = existing['project_id'] if project_id == '__UNSET__' else project_id
    conn.execute(
        'UPDATE sessions SET title=?, project_id=?, updated_at=? WHERE id=?',
        (new_title, new_project, now, session_id)
    )
    conn.commit()
    row = conn.execute('SELECT * FROM sessions WHERE id=?', (session_id,)).fetchone()
    conn.close()
    return dict(row)


def delete_session(session_id: str) -> bool:
    conn = _get_conn()
    # Optionally clean up the workspace directory
    row = conn.execute('SELECT workspace_dir FROM sessions WHERE id=?', (session_id,)).fetchone()
    if row and row['workspace_dir']:
        import shutil
        try:
            shutil.rmtree(row['workspace_dir'], ignore_errors=True)
        except Exception:
            pass
    conn.execute('DELETE FROM sessions WHERE id=?', (session_id,))
    conn.commit()
    conn.close()
    return True


def get_session_workspace(session_id: str) -> str:
    """Get the isolated workspace directory for a session.
    
    Always derived from the current SESSION_WORKSPACE_BASE env var + session_id.
    This ensures .env changes take effect immediately without stale DB paths.
    Updates the DB record if the stored path differs from the computed one.
    """
    workspace = _provision_session_workspace(session_id)
    
    # Update DB if stored path differs (env change or migration)
    conn = _get_conn()
    row = conn.execute('SELECT workspace_dir FROM sessions WHERE id=?', (session_id,)).fetchone()
    if row and row['workspace_dir'] != workspace:
        now = int(time.time() * 1000)
        conn.execute('UPDATE sessions SET workspace_dir=?, updated_at=? WHERE id=?', (workspace, now, session_id))
        conn.commit()
    conn.close()
    
    return workspace


# ─── Messages ───────────────────────────────────────────────

def add_message(session_id: str, source: str, content: str, agent_type: Optional[str] = None, image_b64: Optional[str] = None) -> Dict:
    conn = _get_conn()
    now = int(time.time() * 1000)
    c = conn.execute(
        'INSERT INTO messages (session_id, source, content, agent_type, image_b64, created_at) VALUES (?,?,?,?,?,?)',
        (session_id, source, content, agent_type, image_b64, now)
    )
    # Update session's updated_at timestamp
    conn.execute('UPDATE sessions SET updated_at=? WHERE id=?', (now, session_id))
    conn.commit()
    row = conn.execute('SELECT * FROM messages WHERE id=?', (c.lastrowid,)).fetchone()
    conn.close()
    return dict(row)


def get_messages(session_id: str, limit: int = 200, offset: int = 0) -> List[Dict]:
    conn = _get_conn()
    rows = conn.execute(
        'SELECT id, session_id, source, content, agent_type, created_at FROM messages WHERE session_id=? ORDER BY created_at ASC LIMIT ? OFFSET ?',
        (session_id, limit, offset)
    ).fetchall()
    conn.close()
    return [dict(r) for r in rows]


def get_messages_with_images(session_id: str, limit: int = 200, offset: int = 0) -> List[Dict]:
    """Full message fetch including image_b64 field."""
    conn = _get_conn()
    rows = conn.execute(
        'SELECT * FROM messages WHERE session_id=? ORDER BY created_at ASC LIMIT ? OFFSET ?',
        (session_id, limit, offset)
    ).fetchall()
    conn.close()
    return [dict(r) for r in rows]


def auto_title_session(session_id: str):
    """Auto-generate title from first user message if title is still default."""
    conn = _get_conn()
    session = conn.execute('SELECT title FROM sessions WHERE id=?', (session_id,)).fetchone()
    if session and session['title'] == 'New Session':
        first_msg = conn.execute(
            "SELECT content FROM messages WHERE session_id=? AND source='user' ORDER BY created_at ASC LIMIT 1",
            (session_id,)
        ).fetchone()
        if first_msg:
            title = first_msg['content'][:60]
            if len(first_msg['content']) > 60:
                title += '...'
            now = int(time.time() * 1000)
            conn.execute('UPDATE sessions SET title=?, updated_at=? WHERE id=?', (title, now, session_id))
            conn.commit()
    conn.close()
