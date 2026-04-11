"""
Workflow Executor — runs workflow steps through the unified task_manager pipeline.

Each step is executed as a proper BackgroundTask, with full message logging
and session event emission. This means:
- Brain Inspector works for workflow-triggered sessions
- Messages appear in session history (user prompt + agent response)
- Running tasks show in Dashboard / task list
- Session workspace is shared across all workflow steps
"""

import os
import json
import time
import asyncio
from typing import Dict, List, Any, Optional, Callable

from app.hands.registry import hand_registry
from app.workflow_store import update_run, get_run
from app.session_store import (
    create_session, get_session, get_session_workspace,
    add_message, auto_title_session,
)
from app.session.manager import session_events
from app.session.events import EventType
from app.tasks import task_manager, TaskPhase

# Default timeout per step: 1 hour (agents can take a while for complex tasks)
DEFAULT_STEP_TIMEOUT = 3600


class WorkflowExecutor:
    """Executes a workflow step-by-step, persisting results and streaming logs.
    
    Unified execution: each step runs through the same task_manager pipeline
    that powers session chat, ensuring Brain Inspector visibility and message
    persistence.
    """

    def __init__(self):
        self._running: Dict[str, asyncio.Task] = {}

    async def execute_workflow(
        self,
        run_id: str,
        workflow: Dict[str, Any],
        session_id: str,
        on_log: Optional[Callable[[str], Any]] = None,
    ) -> Dict[str, Any]:
        """Execute all steps in a workflow sequentially.

        Args:
            run_id: The workflow_run record ID
            workflow: Full workflow definition (id, name, steps[], config)
            session_id: Session to execute under (shared workspace)
            on_log: Optional callback for streaming log messages
        """
        steps = workflow.get("steps", [])
        if not steps:
            update_run(run_id, status="completed", results=[])
            return {"status": "completed", "results": []}

        # Get session workspace for file operations
        workspace = get_session_workspace(session_id)
        results: List[Dict[str, Any]] = []
        prev_output = ""

        # Log workflow start as a system message
        workflow_name = workflow.get("name", "Untitled Workflow")
        add_message(
            session_id, source='user',
            content=f"▶ Running workflow: **{workflow_name}** ({len(steps)} steps)",
            agent_type='workflow',
        )
        session_events.emit_event(
            session_id, EventType.AGENT_SELECTED,
            agent="workflow",
            metadata={
                "workflow_id": workflow.get("id"),
                "workflow_name": workflow_name,
                "total_steps": len(steps),
                "run_id": run_id,
            },
        )

        try:
            for i, step in enumerate(steps):
                # Check if run was cancelled
                run = get_run(run_id)
                if run and run["status"] == "cancelled":
                    if on_log:
                        await on_log(f"\n⛔ Workflow cancelled at step {i + 1}")
                    cancel_msg = f"⛔ Workflow cancelled at step {i + 1}/{len(steps)}"
                    add_message(session_id, source='agent', content=cancel_msg, agent_type='workflow')
                    update_run(run_id, status="cancelled", current_step=i, results=results)
                    return {"status": "cancelled", "results": results}

                step_id = step.get("id", f"step_{i}")
                agent = step.get("agent", "gemini")
                prompt = step.get("prompt", "")
                skills = step.get("skills", [])
                input_files = step.get("inputFiles", [])
                step_config = step.get("config", {})
                step_name = step.get("name") or f"Step {i + 1}"

                if on_log:
                    await on_log(f"\n═══ Step {i + 1}/{len(steps)}: {step_name} ({agent}) ═══\n")

                # Update run progress
                update_run(run_id, current_step=i, results=results)

                # Build the effective prompt
                effective_prompt = self._build_prompt(
                    prompt=prompt,
                    prev_output=prev_output,
                    skills=skills,
                    input_files=input_files,
                    workspace=workspace,
                    step_index=i,
                )

                # ─── Log user message for this step ─────
                step_label = f"[Workflow Step {i + 1}/{len(steps)} — {agent}]"
                add_message(
                    session_id, source='user',
                    content=f"{step_label}\n{prompt}",
                    agent_type=agent,
                )

                # Get the hand
                hand = hand_registry.get(agent)
                if not hand:
                    error_msg = f"Agent '{agent}' not available"
                    if on_log:
                        await on_log(f"❌ {error_msg}\n")
                    add_message(session_id, source='agent', content=f"❌ {error_msg}", agent_type=agent)
                    session_events.emit_event(
                        session_id, EventType.ERROR,
                        content=error_msg, agent=agent,
                    )
                    results.append({
                        "step_id": step_id,
                        "step_index": i,
                        "agent": agent,
                        "status": "error",
                        "error": error_msg,
                        "started_at": int(time.time() * 1000),
                        "finished_at": int(time.time() * 1000),
                    })
                    if not step_config.get("continue_on_error", False):
                        update_run(run_id, status="failed", results=results, error=error_msg)
                        return {"status": "failed", "results": results, "error": error_msg}
                    continue

                # ─── Create a background task (unified with session execution) ─────
                bg_task = task_manager.create_task(
                    session_id=session_id,
                    agent=agent,
                    prompt=prompt[:200],
                )
                task_id = bg_task.task_id

                # Emit session events (Brain Inspector compatible)
                session_events.emit_event(
                    session_id, EventType.AGENT_SELECTED,
                    agent=agent,
                    metadata={
                        "hand_type": hand.hand_type,
                        "task_id": task_id,
                        "workflow_step": i,
                        "workflow_step_name": step_name,
                        "run_id": run_id,
                    },
                )
                session_events.emit_event(
                    session_id, EventType.TOOL_CALL,
                    content=prompt, agent=agent,
                    metadata={
                        "hand_type": hand.hand_type,
                        "workspace": workspace,
                        "task_id": task_id,
                        "workflow_step": i,
                    },
                )

                # ─── Execute via Hand ─────
                step_start = int(time.time() * 1000)
                full_output_chunks: List[str] = []

                try:
                    timeout = step_config.get("timeout", DEFAULT_STEP_TIMEOUT)

                    # Phase tracking
                    await task_manager.update_phase(task_id, TaskPhase.CONNECTING)

                    first_chunk = True

                    async def stream_log_with_phase(chunk: str):
                        nonlocal first_chunk
                        full_output_chunks.append(chunk)
                        if first_chunk:
                            await task_manager.update_phase(task_id, TaskPhase.STREAMING)
                            first_chunk = False
                        await task_manager.emit_output(task_id, chunk, source="agent")
                        if on_log:
                            await on_log(chunk)

                    await task_manager.update_phase(task_id, TaskPhase.EXECUTING)

                    print(f"[Workflow:{workflow_name}] Step {i+1}/{len(steps)} — {hand.name} (task={task_id})")

                    result = await asyncio.wait_for(
                        hand.execute(
                            effective_prompt,
                            workspace_dir=workspace,
                            on_log=stream_log_with_phase,
                        ),
                        timeout=timeout,
                    )

                    step_end = int(time.time() * 1000)
                    agent_output = "".join(full_output_chunks)

                    # ─── Log agent response message ─────
                    add_message(
                        session_id, source='agent',
                        content=agent_output,
                        agent_type=agent,
                        image_b64=result.image_b64 if result.image_b64 else None,
                    )

                    # ─── Emit session events ─────
                    if result.success:
                        session_events.emit_event(
                            session_id, EventType.TOOL_RESULT,
                            content=result.output[:2000], agent=agent,
                            metadata={
                                "exit_code": result.exit_code,
                                "output_length": len(result.output),
                                "task_id": task_id,
                                "workflow_step": i,
                            },
                        )
                    else:
                        session_events.emit_event(
                            session_id, EventType.TOOL_ERROR,
                            content=result.output[:2000], agent=agent,
                            metadata={
                                "exit_code": result.exit_code,
                                "task_id": task_id,
                                "workflow_step": i,
                            },
                        )

                    session_events.emit_event(
                        session_id, EventType.AGENT_RESPONSE,
                        content=agent_output[:2000], agent=agent,
                        metadata={
                            "has_image": bool(result.image_b64),
                            "task_id": task_id,
                            "workflow_step": i,
                        },
                    )
                    session_events.emit_event(
                        session_id, EventType.METRIC,
                        agent=agent,
                        metadata={
                            "input_tokens": len(effective_prompt) // 4,
                            "output_tokens": len(result.output) // 4,
                            "task_id": task_id,
                            "workflow_step": i,
                        },
                    )

                    # ─── Handle image output ─────
                    if result.image_b64:
                        await task_manager.emit_event(task_id, {
                            "type": "node_execution_image",
                            "b64": result.image_b64,
                        })

                    # ─── Update task phase ─────
                    await task_manager.update_phase(task_id, TaskPhase.COMPLETED, exit_code=result.exit_code)

                    step_result = {
                        "step_id": step_id,
                        "step_index": i,
                        "agent": agent,
                        "status": "success" if result.success else "error",
                        "output": result.output,
                        "exit_code": result.exit_code,
                        "latency_ms": step_end - step_start,
                        "started_at": step_start,
                        "finished_at": step_end,
                        "task_id": task_id,
                    }

                    if result.image_b64:
                        step_result["has_image"] = True

                    results.append(step_result)

                    if result.success:
                        prev_output = result.output
                        if on_log:
                            await on_log(f"\n✅ Step {i + 1} completed ({(step_end - step_start) / 1000:.1f}s)\n")
                    else:
                        if on_log:
                            await on_log(f"\n❌ Step {i + 1} failed (exit code {result.exit_code})\n")
                        if not step_config.get("continue_on_error", False):
                            update_run(run_id, status="failed", results=results, error=f"Step {i + 1} failed")
                            return {"status": "failed", "results": results}

                except asyncio.TimeoutError:
                    step_end = int(time.time() * 1000)
                    error_msg = f"Step {i + 1} timed out after {timeout}s"
                    if on_log:
                        await on_log(f"\n⏱️ {error_msg}\n")
                    add_message(session_id, source='agent', content=f"⏱️ {error_msg}", agent_type=agent)
                    session_events.emit_event(
                        session_id, EventType.ERROR,
                        content=error_msg, agent=agent,
                        metadata={"task_id": task_id, "workflow_step": i},
                    )
                    await task_manager.update_phase(task_id, TaskPhase.FAILED, exit_code=1, error=error_msg)
                    results.append({
                        "step_id": step_id,
                        "step_index": i,
                        "agent": agent,
                        "status": "timeout",
                        "error": error_msg,
                        "started_at": step_start,
                        "finished_at": step_end,
                        "task_id": task_id,
                    })
                    if not step_config.get("continue_on_error", False):
                        update_run(run_id, status="failed", results=results, error=error_msg)
                        return {"status": "failed", "results": results, "error": error_msg}

                except Exception as e:
                    step_end = int(time.time() * 1000)
                    error_msg = str(e)
                    if on_log:
                        await on_log(f"\n💥 Step {i + 1} exception: {error_msg}\n")
                    add_message(session_id, source='agent', content=f"💥 Exception: {error_msg}", agent_type=agent)
                    session_events.emit_event(
                        session_id, EventType.ERROR,
                        content=error_msg, agent=agent,
                        metadata={"task_id": task_id, "workflow_step": i},
                    )
                    await task_manager.update_phase(task_id, TaskPhase.FAILED, exit_code=1, error=error_msg)
                    results.append({
                        "step_id": step_id,
                        "step_index": i,
                        "agent": agent,
                        "status": "error",
                        "error": error_msg,
                        "started_at": step_start,
                        "finished_at": step_end,
                        "task_id": task_id,
                    })
                    if not step_config.get("continue_on_error", False):
                        update_run(run_id, status="failed", results=results, error=error_msg)
                        return {"status": "failed", "results": results, "error": error_msg}

            # All steps completed
            completion_msg = f"✅ Workflow **{workflow_name}** completed — {len(results)} steps"
            add_message(session_id, source='agent', content=completion_msg, agent_type='workflow')
            session_events.emit_event(
                session_id, EventType.TOOL_RESULT,
                content=completion_msg, agent="workflow",
                metadata={"run_id": run_id, "total_steps": len(steps)},
            )
            update_run(run_id, status="completed", current_step=len(steps), results=results)
            if on_log:
                await on_log(f"\n🎉 Workflow completed — {len(results)} steps\n")
            return {"status": "completed", "results": results}

        except Exception as e:
            error_msg = f"Workflow error: {str(e)}"
            add_message(session_id, source='agent', content=f"💥 {error_msg}", agent_type='workflow')
            session_events.emit_event(
                session_id, EventType.ERROR,
                content=error_msg, agent="workflow",
                metadata={"run_id": run_id},
            )
            update_run(run_id, status="failed", results=results, error=str(e))
            return {"status": "failed", "results": results, "error": str(e)}

    def _build_prompt(
        self,
        prompt: str,
        prev_output: str,
        skills: List[str],
        input_files: List[str],
        workspace: str,
        step_index: int,
    ) -> str:
        """Build the effective prompt for a step with context injection."""
        parts = []

        # Inject previous step output as context (if not first step)
        if step_index > 0 and prev_output:
            parts.append(
                f"## Context from Previous Step\n"
                f"The previous step produced the following output:\n\n"
                f"```\n{prev_output[:8000]}\n```\n\n"
                f"---\n"
            )

        # Inject workspace context
        parts.append(f"Working directory: {workspace}\n")

        # Inject input files context
        if input_files:
            parts.append("## Input Files")
            for fpath in input_files:
                full_path = os.path.join(workspace, fpath) if not os.path.isabs(fpath) else fpath
                if os.path.isfile(full_path):
                    try:
                        with open(full_path, "r", errors="replace") as f:
                            content = f.read(4096)
                        parts.append(f"### {os.path.basename(fpath)}\n```\n{content}\n```\n")
                    except Exception:
                        parts.append(f"- {fpath} (unable to read)\n")
                else:
                    parts.append(f"- {fpath} (file not found)\n")

        # Inject skills hint
        if skills:
            parts.append(
                f"\nUse these skills/capabilities: {', '.join(skills)}\n"
            )

        # Main prompt
        if prompt:
            parts.append(f"\n## Task\n{prompt}")

        return "\n".join(parts)

    def cancel_run(self, run_id: str) -> bool:
        """Cancel a running workflow."""
        run = get_run(run_id)
        if run and run["status"] == "running":
            update_run(run_id, status="cancelled")
            # Also cancel the asyncio task if tracked
            task = self._running.pop(run_id, None)
            if task and not task.done():
                task.cancel()
            return True
        return False

    async def start_workflow(
        self,
        run_id: str,
        workflow: Dict[str, Any],
        session_id: str,
        on_log: Optional[Callable[[str], Any]] = None,
    ) -> asyncio.Task:
        """Start a workflow execution as a background task."""
        task = asyncio.create_task(
            self.execute_workflow(run_id, workflow, session_id, on_log)
        )
        self._running[run_id] = task

        def _cleanup(t):
            self._running.pop(run_id, None)

        task.add_done_callback(_cleanup)
        return task


# ─── Global Singleton ──────────────────────────────────
workflow_executor = WorkflowExecutor()
