"""Background Task Manager — decouples execution from WebSocket viewing.

Sessions can run in the background. Switching the viewed session does not
interrupt running tasks. Each running task emits events to a queue that
any subscriber (WebSocket) can drain at any time.
"""

import asyncio
import time
import uuid
from dataclasses import dataclass, field
from typing import Dict, Optional, Callable, Any, List
from enum import Enum


class TaskPhase(str, Enum):
    """Execution phases for richer status reporting."""
    QUEUED = "queued"
    CONNECTING = "connecting"
    EXECUTING = "executing"
    STREAMING = "streaming"
    TOOL_CALLING = "tool_calling"
    FINALIZING = "finalizing"
    COMPLETED = "completed"
    FAILED = "failed"


@dataclass
class TaskStatus:
    """Live status of a running task."""
    task_id: str
    session_id: str
    agent: str
    prompt: str
    phase: TaskPhase
    started_at: float
    elapsed_ms: float = 0
    output_chunks: int = 0
    output_bytes: int = 0
    exit_code: Optional[int] = None
    error: Optional[str] = None

    def to_dict(self) -> dict:
        return {
            "task_id": self.task_id,
            "session_id": self.session_id,
            "agent": self.agent,
            "prompt": self.prompt[:80],
            "phase": self.phase.value,
            "started_at": self.started_at,
            "elapsed_ms": round(self.elapsed_ms),
            "output_chunks": self.output_chunks,
            "output_bytes": self.output_bytes,
            "exit_code": self.exit_code,
            "error": self.error,
        }


@dataclass
class BackgroundTask:
    """A background execution task with its event queue."""
    task_id: str
    session_id: str
    agent: str
    prompt: str
    status: TaskStatus
    event_queue: asyncio.Queue = field(default_factory=asyncio.Queue)
    asyncio_task: Optional[asyncio.Task] = None
    subscribers: List[asyncio.Queue] = field(default_factory=list)

    def add_subscriber(self, q: asyncio.Queue):
        """Add a WebSocket subscriber to receive events."""
        self.subscribers.append(q)

    def remove_subscriber(self, q: asyncio.Queue):
        """Remove a subscriber."""
        if q in self.subscribers:
            self.subscribers.remove(q)

    async def broadcast(self, event: dict):
        """Send event to all subscribers."""
        for q in self.subscribers:
            try:
                q.put_nowait(event)
            except asyncio.QueueFull:
                pass  # Drop if subscriber is slow


class BackgroundTaskManager:
    """Manage running tasks across sessions.

    - Tasks run independently of WebSocket connections
    - Switching sessions does NOT stop running tasks
    - WebSocket subscribers can attach/detach to any running task
    - Status updates and output are buffered for late joiners
    """

    def __init__(self):
        self._tasks: Dict[str, BackgroundTask] = {}
        # session_id → list of active task_ids
        self._session_tasks: Dict[str, List[str]] = {}
        # Global subscriber for all events (the main WS connection)
        self._global_subscribers: List[asyncio.Queue] = []

    def create_task(
        self,
        session_id: str,
        agent: str,
        prompt: str,
    ) -> BackgroundTask:
        """Create a new background task (but don't start it yet)."""
        task_id = uuid.uuid4().hex[:12]
        now = time.time() * 1000

        status = TaskStatus(
            task_id=task_id,
            session_id=session_id,
            agent=agent,
            prompt=prompt,
            phase=TaskPhase.QUEUED,
            started_at=now,
        )

        bg_task = BackgroundTask(
            task_id=task_id,
            session_id=session_id,
            agent=agent,
            prompt=prompt,
            status=status,
        )

        self._tasks[task_id] = bg_task

        if session_id not in self._session_tasks:
            self._session_tasks[session_id] = []
        self._session_tasks[session_id].append(task_id)

        return bg_task

    def get_task(self, task_id: str) -> Optional[BackgroundTask]:
        return self._tasks.get(task_id)

    def get_session_tasks(self, session_id: str) -> List[BackgroundTask]:
        """Get all tasks (running or completed) for a session."""
        task_ids = self._session_tasks.get(session_id, [])
        return [self._tasks[tid] for tid in task_ids if tid in self._tasks]

    def get_running_tasks(self) -> List[BackgroundTask]:
        """Get all currently running tasks across all sessions."""
        return [
            t for t in self._tasks.values()
            if t.status.phase not in (TaskPhase.COMPLETED, TaskPhase.FAILED)
        ]

    def get_running_session_ids(self) -> List[str]:
        """Get session IDs that have actively running tasks."""
        return list(set(
            t.session_id for t in self._tasks.values()
            if t.status.phase not in (TaskPhase.COMPLETED, TaskPhase.FAILED)
        ))

    async def update_phase(self, task_id: str, phase: TaskPhase, **extra):
        """Update task phase and broadcast to subscribers."""
        task = self._tasks.get(task_id)
        if not task:
            return

        task.status.phase = phase
        task.status.elapsed_ms = time.time() * 1000 - task.status.started_at

        if phase == TaskPhase.COMPLETED:
            task.status.exit_code = extra.get("exit_code", 0)
        elif phase == TaskPhase.FAILED:
            task.status.exit_code = extra.get("exit_code", 1)
            task.status.error = extra.get("error", "Unknown error")

        event = {
            "type": "task_status",
            "taskId": task_id,
            "sessionId": task.session_id,
            **task.status.to_dict(),
        }

        await task.broadcast(event)
        await self._broadcast_global(event)

    async def emit_output(self, task_id: str, chunk: str, source: str = "agent"):
        """Emit an output chunk and broadcast."""
        task = self._tasks.get(task_id)
        if not task:
            return

        task.status.output_chunks += 1
        task.status.output_bytes += len(chunk)
        task.status.elapsed_ms = time.time() * 1000 - task.status.started_at

        event = {
            "type": "node_execution_log",
            "taskId": task_id,
            "sessionId": task.session_id,
            "nodeId": task_id,
            "log": chunk,
            "source": source,
        }

        await task.broadcast(event)
        await self._broadcast_global(event)

    async def emit_event(self, task_id: str, event: dict):
        """Emit arbitrary event (images, completion, etc.)."""
        task = self._tasks.get(task_id)
        if not task:
            return

        event["taskId"] = task_id
        event["sessionId"] = task.session_id

        await task.broadcast(event)
        await self._broadcast_global(event)

    def add_global_subscriber(self, q: asyncio.Queue):
        """Subscribe to all task events (main WebSocket connection)."""
        self._global_subscribers.append(q)

    def remove_global_subscriber(self, q: asyncio.Queue):
        if q in self._global_subscribers:
            self._global_subscribers.remove(q)

    async def _broadcast_global(self, event: dict):
        for q in self._global_subscribers:
            try:
                q.put_nowait(event)
            except asyncio.QueueFull:
                pass

    def cleanup_completed(self, max_age_ms: float = 300000):
        """Remove completed tasks older than max_age_ms (default 5 min)."""
        now = time.time() * 1000
        to_remove = []
        for tid, task in self._tasks.items():
            if task.status.phase in (TaskPhase.COMPLETED, TaskPhase.FAILED):
                if now - task.status.started_at > max_age_ms:
                    to_remove.append(tid)

        for tid in to_remove:
            task = self._tasks.pop(tid, None)
            if task and task.session_id in self._session_tasks:
                self._session_tasks[task.session_id] = [
                    t for t in self._session_tasks[task.session_id] if t != tid
                ]

    def get_all_status(self) -> List[dict]:
        """Get status of all active tasks."""
        now = time.time() * 1000
        result = []
        for t in self._tasks.values():
            t.status.elapsed_ms = now - t.status.started_at
            result.append(t.status.to_dict())
        return result


# Global singleton
task_manager = BackgroundTaskManager()
