"""Analyst FastAPI sub-router — mounted on the gateway at /analyst.

Thin orchestration layer that delegates to core/, ingest/, output/,
templates/, and storage/ modules.
"""

from __future__ import annotations

from fastapi import APIRouter, FastAPI

router = APIRouter(prefix="/analyst", tags=["analyst"])


# ------------------------------------------------------------------
# Route stubs — to be implemented in subsequent phases
# ------------------------------------------------------------------

@router.get("/health")
async def health():
    """Lightweight health / stats endpoint."""
    return {"status": "ok", "workspace": "analyst"}


@router.get("/sessions")
async def list_sessions():
    """List analysis sessions."""
    raise NotImplementedError


@router.get("/sessions/{session_id}")
async def get_session(session_id: str):
    """Retrieve a single analysis session."""
    raise NotImplementedError


@router.post("/analyse")
async def analyse():
    """Submit a synchronous analysis request."""
    raise NotImplementedError


@router.post("/analyse/stream")
async def analyse_stream():
    """Submit a streaming analysis request."""
    raise NotImplementedError


@router.post("/upload")
async def upload_document():
    """Upload a document for analysis context."""
    raise NotImplementedError


@router.post("/export")
async def export_report():
    """Export an analysis session as PDF / Markdown."""
    raise NotImplementedError


@router.get("/templates")
async def list_templates():
    """List available analysis templates."""
    raise NotImplementedError


@router.post("/templates")
async def create_template():
    """Create a user-defined template."""
    raise NotImplementedError


# ------------------------------------------------------------------
# Gateway registration
# ------------------------------------------------------------------

def register_analyst(app: FastAPI) -> None:
    """Mount the analyst router on an existing FastAPI application.

    Usage in ``api_bridge/app/main.py``::

        from packages.workspaces.analyst.router import register_analyst
        register_analyst(app)
    """
    app.include_router(router)
