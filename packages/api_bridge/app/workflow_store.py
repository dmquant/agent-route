"""
Workflow Store — SQLite persistence for workflow definitions.

Schema:
    workflows(
        id          TEXT PRIMARY KEY,
        name        TEXT NOT NULL,
        description TEXT DEFAULT '',
        steps_json  TEXT NOT NULL,      -- JSON array of WorkflowStep dicts
        config_json TEXT DEFAULT '{}',  -- Global workflow config
        created_at  INTEGER NOT NULL,
        updated_at  INTEGER NOT NULL
    )

    workflow_runs(
        id            TEXT PRIMARY KEY,
        workflow_id   TEXT NOT NULL,
        session_id    TEXT NOT NULL,     -- links to sessions table
        status        TEXT DEFAULT 'pending',  -- pending|running|completed|failed|cancelled
        current_step  INTEGER DEFAULT 0,
        results_json  TEXT DEFAULT '[]', -- per-step results
        started_at    INTEGER,
        finished_at   INTEGER,
        error         TEXT
    )
"""

import sqlite3
import os
import json
import uuid
import time
from typing import Dict, List, Any, Optional

DB_PATH = os.path.join(os.path.dirname(__file__), "sessions.db")


def _get_conn() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    return conn


def init_workflow_tables():
    """Create workflow tables if they don't exist."""
    conn = _get_conn()
    conn.executescript("""
        CREATE TABLE IF NOT EXISTS workflows (
            id          TEXT PRIMARY KEY,
            name        TEXT NOT NULL,
            description TEXT DEFAULT '',
            steps_json  TEXT NOT NULL DEFAULT '[]',
            config_json TEXT DEFAULT '{}',
            created_at  INTEGER NOT NULL,
            updated_at  INTEGER NOT NULL
        );

        CREATE TABLE IF NOT EXISTS workflow_runs (
            id            TEXT PRIMARY KEY,
            workflow_id   TEXT NOT NULL,
            session_id    TEXT NOT NULL,
            status        TEXT DEFAULT 'pending',
            current_step  INTEGER DEFAULT 0,
            results_json  TEXT DEFAULT '[]',
            started_at    INTEGER,
            finished_at   INTEGER,
            error         TEXT,
            FOREIGN KEY (workflow_id) REFERENCES workflows(id) ON DELETE CASCADE
        );

        CREATE INDEX IF NOT EXISTS idx_workflow_runs_workflow
            ON workflow_runs(workflow_id);
        CREATE INDEX IF NOT EXISTS idx_workflow_runs_session
            ON workflow_runs(session_id);
        CREATE INDEX IF NOT EXISTS idx_workflow_runs_status
            ON workflow_runs(status);
    """)
    conn.commit()
    conn.close()
    print("[WorkflowStore] Tables initialized.")


# ─── Workflow CRUD ──────────────────────────────────────

def _row_to_workflow(row: sqlite3.Row) -> Dict[str, Any]:
    return {
        "id": row["id"],
        "name": row["name"],
        "description": row["description"],
        "steps": json.loads(row["steps_json"]),
        "config": json.loads(row["config_json"]),
        "created_at": row["created_at"],
        "updated_at": row["updated_at"],
    }


def create_workflow(
    name: str,
    description: str = "",
    steps: Optional[List[Dict]] = None,
    config: Optional[Dict] = None,
) -> Dict[str, Any]:
    wf_id = uuid.uuid4().hex
    now = int(time.time() * 1000)
    conn = _get_conn()
    conn.execute(
        """INSERT INTO workflows (id, name, description, steps_json, config_json, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?)""",
        (wf_id, name, description, json.dumps(steps or []), json.dumps(config or {}), now, now),
    )
    conn.commit()
    row = conn.execute("SELECT * FROM workflows WHERE id = ?", (wf_id,)).fetchone()
    conn.close()
    return _row_to_workflow(row)


def list_workflows() -> List[Dict[str, Any]]:
    conn = _get_conn()
    rows = conn.execute("SELECT * FROM workflows ORDER BY updated_at DESC").fetchall()
    result = []
    for r in rows:
        wf = _row_to_workflow(r)
        # Attach run count
        cnt = conn.execute(
            "SELECT COUNT(*) as c FROM workflow_runs WHERE workflow_id = ?", (r["id"],)
        ).fetchone()
        wf["run_count"] = cnt["c"] if cnt else 0
        result.append(wf)
    conn.close()
    return result


def get_workflow(workflow_id: str) -> Optional[Dict[str, Any]]:
    conn = _get_conn()
    row = conn.execute("SELECT * FROM workflows WHERE id = ?", (workflow_id,)).fetchone()
    conn.close()
    return _row_to_workflow(row) if row else None


def update_workflow(
    workflow_id: str,
    name: Optional[str] = None,
    description: Optional[str] = None,
    steps: Optional[List[Dict]] = None,
    config: Optional[Dict] = None,
) -> Optional[Dict[str, Any]]:
    conn = _get_conn()
    existing = conn.execute("SELECT * FROM workflows WHERE id = ?", (workflow_id,)).fetchone()
    if not existing:
        conn.close()
        return None

    now = int(time.time() * 1000)
    new_name = name if name is not None else existing["name"]
    new_desc = description if description is not None else existing["description"]
    new_steps = json.dumps(steps) if steps is not None else existing["steps_json"]
    new_config = json.dumps(config) if config is not None else existing["config_json"]

    conn.execute(
        """UPDATE workflows SET name=?, description=?, steps_json=?, config_json=?, updated_at=?
           WHERE id=?""",
        (new_name, new_desc, new_steps, new_config, now, workflow_id),
    )
    conn.commit()
    row = conn.execute("SELECT * FROM workflows WHERE id = ?", (workflow_id,)).fetchone()
    conn.close()
    return _row_to_workflow(row)


def delete_workflow(workflow_id: str) -> bool:
    conn = _get_conn()
    cursor = conn.execute("DELETE FROM workflows WHERE id = ?", (workflow_id,))
    conn.commit()
    deleted = cursor.rowcount > 0
    conn.close()
    return deleted


# ─── Workflow Runs ──────────────────────────────────────

def _row_to_run(row: sqlite3.Row) -> Dict[str, Any]:
    return {
        "id": row["id"],
        "workflow_id": row["workflow_id"],
        "session_id": row["session_id"],
        "status": row["status"],
        "current_step": row["current_step"],
        "results": json.loads(row["results_json"]),
        "started_at": row["started_at"],
        "finished_at": row["finished_at"],
        "error": row["error"],
    }


def create_run(workflow_id: str, session_id: str) -> Dict[str, Any]:
    run_id = uuid.uuid4().hex
    now = int(time.time() * 1000)
    conn = _get_conn()
    conn.execute(
        """INSERT INTO workflow_runs (id, workflow_id, session_id, status, current_step, results_json, started_at)
           VALUES (?, ?, ?, 'running', 0, '[]', ?)""",
        (run_id, workflow_id, session_id, now),
    )
    conn.commit()
    row = conn.execute("SELECT * FROM workflow_runs WHERE id = ?", (run_id,)).fetchone()
    conn.close()
    return _row_to_run(row)


def update_run(
    run_id: str,
    status: Optional[str] = None,
    current_step: Optional[int] = None,
    results: Optional[List[Dict]] = None,
    error: Optional[str] = None,
) -> Optional[Dict[str, Any]]:
    conn = _get_conn()
    existing = conn.execute("SELECT * FROM workflow_runs WHERE id = ?", (run_id,)).fetchone()
    if not existing:
        conn.close()
        return None

    new_status = status or existing["status"]
    new_step = current_step if current_step is not None else existing["current_step"]
    new_results = json.dumps(results) if results is not None else existing["results_json"]
    new_error = error if error is not None else existing["error"]
    finished = int(time.time() * 1000) if new_status in ("completed", "failed", "cancelled") else existing["finished_at"]

    conn.execute(
        """UPDATE workflow_runs
           SET status=?, current_step=?, results_json=?, error=?, finished_at=?
           WHERE id=?""",
        (new_status, new_step, new_results, new_error, finished, run_id),
    )
    conn.commit()
    row = conn.execute("SELECT * FROM workflow_runs WHERE id = ?", (run_id,)).fetchone()
    conn.close()
    return _row_to_run(row)


def get_run(run_id: str) -> Optional[Dict[str, Any]]:
    conn = _get_conn()
    row = conn.execute("SELECT * FROM workflow_runs WHERE id = ?", (run_id,)).fetchone()
    conn.close()
    return _row_to_run(row) if row else None


def list_runs(workflow_id: Optional[str] = None, limit: int = 50) -> List[Dict[str, Any]]:
    conn = _get_conn()
    if workflow_id:
        rows = conn.execute(
            "SELECT * FROM workflow_runs WHERE workflow_id = ? ORDER BY started_at DESC LIMIT ?",
            (workflow_id, limit),
        ).fetchall()
    else:
        rows = conn.execute(
            "SELECT * FROM workflow_runs ORDER BY started_at DESC LIMIT ?", (limit,)
        ).fetchall()
    conn.close()
    return [_row_to_run(r) for r in rows]
