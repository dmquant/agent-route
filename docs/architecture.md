# Architecture Guide — API Bridge

> Deep-dive into every subsystem of the Agent Route API Bridge.

## Table of Contents

- [System Overview](#system-overview)
- [Hand Protocol](#hand-protocol)
- [Brain & Orchestrator](#brain--orchestrator)
- [Context Engine](#context-engine)
- [Session Event Log](#session-event-log)
- [Background Task Manager](#background-task-manager)
- [Workflow Engine](#workflow-engine)
- [Context Sharing & Session Forking](#context-sharing--session-forking)
- [Sandbox Pool](#sandbox-pool)
- [Report Engine](#report-engine)
- [Data Model (SQLite)](#data-model)
- [WebSocket Protocol](#websocket-protocol)

---

## System Overview

The API Bridge is a **Python FastAPI** application that serves as the unified backend for agent orchestration. It exposes 70+ REST endpoints and a bidirectional WebSocket, manages 5 agent "Hands" through a uniform interface, and persists all state to SQLite.

```
┌─────────────────────────────────────────────────────────────────┐
│                      API Bridge (FastAPI)                        │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │                    main.py (Gateway)                     │   │
│  │  ┌──────────┐  ┌──────────┐  ┌───────────────────────┐│   │
│  │  │ REST API │  │ WebSocket│  │ Startup / Shutdown    ││   │
│  │  │ (70+     │  │ Handler  │  │ (init tables, GC,     ││   │
│  │  │ endpts)  │  │ (events) │  │  register hands)      ││   │
│  │  └──────────┘  └──────────┘  └───────────────────────┘│   │
│  └──────────────────────┬──────────────────────────────────┘   │
│                         │                                       │
│  ┌──────────────────────┼──────────────────────────────────┐   │
│  │            Orchestrator (brain/orchestrator.py)          │   │
│  │                      │                                   │   │
│  │  ┌─────────┐  ┌─────┴─────┐  ┌───────────────────┐    │   │
│  │  │ Context │  │ Harness   │  │ Multi-Agent       │    │   │
│  │  │ Engine  │  │ Manager   │  │ Delegation        │    │   │
│  │  │ (3+1    │  │ (per-agent│  │ (fan-out, join    │    │   │
│  │  │ strats) │  │  configs) │  │  w/ strategies)   │    │   │
│  │  └─────────┘  └───────────┘  └───────────────────┘    │   │
│  └─────────────────────────────────────────────────────────┘   │
│                         │                                       │
│  ┌──────────────────────┼──────────────────────────────────┐   │
│  │              Hand Protocol Layer                         │   │
│  │                      │                                   │   │
│  │  ┌────────┐ ┌───────┐ ┌──────┐ ┌───────┐ ┌──────┐     │   │
│  │  │Gemini  │ │Claude │ │Codex │ │Ollama │ │MFLUX │     │   │
│  │  │(CLI)   │ │(CLI)  │ │(CLI) │ │(HTTP) │ │(HTTP)│     │   │
│  │  └────────┘ └───────┘ └──────┘ └───────┘ └──────┘     │   │
│  └─────────────────────────────────────────────────────────┘   │
│                         │                                       │
│  ┌──────────┐ ┌─────────┴───┐ ┌──────────┐ ┌─────────────┐   │
│  │ Session  │ │ Background  │ │ Workflow │ │ Report      │   │
│  │ Store +  │ │ Task Mgr    │ │ Executor │ │ Engine      │   │
│  │ Events   │ │ (phases,GC) │ │ (async)  │ │ (analytics) │   │
│  └──────────┘ └─────────────┘ └──────────┘ └─────────────┘   │
│                         │                                       │
│              ┌──────────┴──────────┐                           │
│              │   sessions.db       │                           │
│              │   (SQLite)          │                           │
│              └─────────────────────┘                           │
└─────────────────────────────────────────────────────────────────┘
```

**Key file:** `packages/api_bridge/app/main.py` (52 KB, ~1386 lines)

---

## Hand Protocol

> `packages/api_bridge/app/hands/`

The Hand Protocol is the abstraction layer that makes all agents interchangeable. Every AI agent (Gemini, Claude, Codex, Ollama, MFLUX) implements the same `Hand` ABC.

### Interface

```python
class Hand(ABC):
    name: str          # "gemini", "claude", "codex", "ollama", "mflux"
    hand_type: str     # "cli", "http", "sdk"

    async def execute(
        self,
        prompt: str,
        workspace_dir: str,
        on_log: Callable[[str], Awaitable[None]] = None,
        **kwargs
    ) -> HandResult:
        ...

@dataclass
class HandResult:
    output: str
    exit_code: int
    success: bool
    elapsed_ms: int = 0
    image_b64: Optional[str] = None  # For MFLUX image generation
```

### Implementation Map

| Hand | Type | Backing Service | Key Behavior |
|------|------|----------------|--------------|
| `gemini_hand.py` | `cli` | `npx gemini` | Streams via subprocess stdout; supports skills and context files |
| `claude_hand.py` | `cli` | `npx claude` | JSON structured output; `--allowedTools` flag for sandboxing |
| `codex_hand.py` | `cli` | `npx codex` | `--full-auto` mode; workspace-aware with `--writable-root` |
| `ollama_hand.py` | `http` | `http://host:11434` | REST streaming via `/api/generate`; configurable model name |
| `mflux_hand.py` | `http` | Remote MFLUX node | Image generation; Base64 binary response; zero-timeout for cold boot |

### Registry

```python
# hands/registry.py
class HandRegistry:
    def register(self, hand: Hand) -> None: ...
    def get(self, name: str) -> Optional[Hand]: ...
    def list_all(self) -> List[Hand]: ...
    def list_names(self) -> List[str]: ...

# Auto-registration checks .env gates:
#   ENABLE_GEMINI_CLI=true → gemini_hand registered
#   ENABLE_OLLAMA_API=true → ollama_hand registered
```

### Stream Processing

`hands/stream_processor.py` provides a unified stream processor that:
- Parses raw stdout/stderr from CLI agents into structured chunks
- Detects activity types (coding, analyzing, browsing, etc.) via `activity_classifier.py`
- Extracts token usage, file modifications, and tool invocations
- Normalizes output across different agent formats

---

## Brain & Orchestrator

> `packages/api_bridge/app/brain/orchestrator.py`

The Orchestrator is the "brain" that coordinates agent execution, context management, and multi-agent delegation.

### Core Operations

```python
class AgentOrchestrator:
    # Session lifecycle
    async def wake(session_id: str) -> dict           # Load session state, replay events
    async def pause(session_id: str) -> dict          # Checkpoint and suspend
    
    # Execution
    async def run(session_id: str, agent: str,        # Execute prompt in session context
                  prompt: str, workspace_dir: str)
    
    # Multi-agent
    async def multi_agent_run(                         # Fan-out to N agents
        session_id: str,
        agents: List[str],
        prompt: str,
        strategy: str = "first_success",              # Join strategy
        timeout: float = 300.0
    )
    
    # Delegation
    async def delegate(session_id: str,               # Delegate to sub-agent
                       from_agent: str,
                       to_agent: str,
                       prompt: str)
```

### Multi-Agent Join Strategies

| Strategy | Behavior | Use Case |
|----------|----------|----------|
| `first_success` | Return first successful result (cancel others) | Speed-critical tasks |
| `best_effort` | Return all successful results | Quality comparison |
| `majority_vote` | Success if majority agree | Consensus tasks |
| `all` | Return all results regardless | Analysis/benchmarking |

```
                    ┌──── Gemini Task ──── ✅ Selected
User Prompt ───────►├──── Claude Task ──── ✅ 
                    └──── Codex Task  ──── ❌ 
                    
                    Strategy: first_success → Gemini wins (fastest)
```

---

## Context Engine

> `packages/api_bridge/app/brain/context.py`

**Design principle** (from Anthropic): "Irreversible decisions to selectively retain or discard context can lead to failures." The session event log stores ALL context durably. The Context Engine decides what to pass to the brain's context window for each turn.

### Strategies

| Strategy | Trigger | Behavior |
|----------|---------|----------|
| **Full Replay** | Token count < 50% budget | Replay all session events |
| **Sliding Window** | Token count > budget | Keep N most recent events |
| **Compaction** | Auto-compact enabled + threshold hit | Summarize older events, keep recent verbatim |
| **Shared Context** | Session has linked sessions | Inject linked session messages (20% budget reserved) |

### Context Window Assembly

```python
class ContextEngine:
    def build_context(session_id, harness) -> dict:
        """Build primary context from session events."""
        # Returns: {strategy, events, estimated_tokens, ...}
    
    def build_shared_context(session_id, harness) -> dict:
        """Build context enriched with linked session messages.
        
        1. Build primary context (session's own events)
        2. Fetch messages from all linked sessions
        3. Convert to synthetic events with provenance labels:
           "[Context from 'Research Session'] (agent): ..."
        4. Reserve 20% of token budget for linked context
        5. Prefix linked events before primary events
        """
    
    def get_context_stats(session_id, harness) -> dict:
        """Token utilization, compaction needs, strategy recommendation."""
    
    def rewind(session_id, before_event_id, count) -> List[dict]:
        """Time-travel: get N events leading up to a specific event."""
```

### Harness Configuration

Each agent has a `HarnessConfig` that controls context behavior:

```python
@dataclass
class HarnessConfig:
    agent: str                        # "gemini", "claude", etc.
    max_context_tokens: int = 100000  # Gemini: 1M, Claude: 200K, etc.
    auto_compact: bool = True
    compact_threshold: float = 0.8    # Compact at 80% usage
    compact_strategy: str = "tail"    # "full" | "tail" | "summary"
    retry_on_failure: bool = True
    max_retries: int = 3
    timeout_seconds: int = 300
    skills: List[str] = []
```

---

## Session Event Log

> `packages/api_bridge/app/session/events.py` + `manager.py`

Sessions are modeled as **append-only event logs** rather than simple message lists. This enables rewinding, filtering, crash recovery, and structured context management.

### 19 Event Types

```python
class EventType(str, Enum):
    # Lifecycle
    SESSION_CREATED    = "session.created"
    SESSION_RESUMED    = "session.resumed"
    SESSION_PAUSED     = "session.paused"
    
    # Messages
    USER_MESSAGE       = "message.user"
    AGENT_RESPONSE     = "message.agent"
    
    # Tool execution
    TOOL_CALL          = "tool.call"         # Brain → Hand
    TOOL_RESULT        = "tool.result"       # Hand → Brain
    TOOL_ERROR         = "tool.error"        # Hand failure
    
    # Context management
    CONTEXT_COMPACT    = "context.compact"
    CONTEXT_RESET      = "context.reset"
    CONTEXT_CHECKPOINT = "context.checkpoint"
    
    # Agent routing
    AGENT_SELECTED     = "agent.selected"
    AGENT_DELEGATED    = "agent.delegated"
    AGENT_JOINED       = "agent.joined"
    
    # Workspace
    SANDBOX_PROVISIONED = "sandbox.provisioned"
    SANDBOX_DESTROYED   = "sandbox.destroyed"
    FILE_CREATED        = "file.created"
    FILE_MODIFIED       = "file.modified"
    
    # System
    ERROR               = "error"
    METRIC              = "metric"
```

### SessionEventManager

```python
class SessionEventManager:
    def emit(session_id, event_type, content, agent=None, metadata=None)
    def get_events(session_id, event_types=None, since_id=None, limit=None)
    def get_recent_events(limit=100)
    def get_session_summary(session_id) -> dict
    def checkpoint(session_id) -> int   # Returns checkpoint event ID
```

---

## Background Task Manager

> `packages/api_bridge/app/tasks.py`

The task manager enables **non-blocking agent execution**. When a user sends a prompt, it's wrapped in an `asyncio.Task` and executed in the background. The WebSocket loop remains free to handle new commands or switch sessions.

### Phase Lifecycle

```
QUEUED → CONNECTING → EXECUTING → STREAMING → FINALIZING → COMPLETED
                                                           ↘ FAILED

Each phase transition is broadcast to all WebSocket subscribers.
```

### Task Status Schema

```json
{
  "taskId": "abc123",
  "sessionId": "sess_456",
  "agent": "gemini",
  "phase": "streaming",
  "elapsed_ms": 12400,
  "output_bytes": 8192,
  "created_at": 1775835784887
}
```

### Key Properties

- **Session-independent:** Switching sessions never stops running tasks
- **Broadcast:** All connected clients receive status updates
- **GC:** Completed tasks are garbage-collected after 5 minutes
- **Resumable:** Task state persists across WebSocket reconnections

---

## Workflow Engine

> `packages/api_bridge/app/workflow_store.py` + `workflow_executor.py`

The Workflow Engine enables multi-step, multi-agent orchestration with a **visual DAG canvas** and **dual-mode execution** (DAG + linear fallback).

### Data Model

```json
{
  "id": "wf_abc123",
  "name": "Daily Research Pipeline",
  "description": "Gather and analyze daily AI news",
  "steps": [
    {
      "id": "step_1",
      "agent": "gemini",
      "prompt": "Research the latest AI news",
      "skills": ["web_search"],
      "inputs": [{"id": "input", "label": "Input", "type": "context"}],
      "outputs": [{"id": "output", "label": "Output", "type": "text"}]
    },
    {
      "id": "step_2", 
      "agent": "claude",
      "prompt": "Synthesize a report from the research",
      "inputs": [{"id": "input", "label": "Input", "type": "context"}],
      "outputs": [{"id": "output", "label": "Output", "type": "text"}]
    }
  ],
  "edges": [
    {
      "id": "edge_1",
      "source": "step_1",
      "target": "step_2",
      "sourceHandle": "output",
      "targetHandle": "input"
    }
  ],
  "positions": {
    "step_1": {"x": 100, "y": 200},
    "step_2": {"x": 500, "y": 200}
  },
  "config": {
    "timeout_per_step": 7200,
    "stop_on_failure": true
  }
}
```

### Dual-Mode Execution

```
Workflow has edges?
  ├─ YES → DAG Mode (Parallel, Level-Based)
  │   ├─ Validate: cycle detection
  │   ├─ Build topological levels via Kahn's algorithm
  │   ├─ For each level:
  │   │   ├─ Fan-out: asyncio.gather() all steps in level
  │   │   ├─ Fan-in: collect results, update context
  │   │   └─ Check for failures before next level
  │   └─ Resolve parent outputs → child inputs via context
  │
  └─ NO → Linear Mode (backward compatible)
      └─ Execute steps in array order
```

The DAG executor:
1. **Validates** the graph for cycles before execution
2. **Groups** steps into topological levels using `topological_levels()` (modified Kahn's algorithm)
3. **Executes levels in parallel** — steps within the same level run concurrently via `asyncio.gather()`
4. **Resolves inputs** by collecting parent step outputs and injecting them into the child step's prompt
5. **Stores outputs** in a shared `context` dictionary keyed by step ID (safe because parents always complete before children)
6. **Tracks parallel state** via `executing_steps` field, enabling the frontend to animate multiple nodes simultaneously
7. **Supports sub-workflows** via `agent: "sub_workflow"` steps that recursively execute child flows

### Execution Flow

```
User clicks "Run Workflow"
  ├─ (Option A) New Session created automatically
  └─ (Option B) Existing session reused
      │
  ┌───▼──────────────────────────────────┐
  │ workflow_executor.start_workflow()    │
  │   ├─ Create run record               │
  │   ├─ Detect mode (DAG vs Linear)     │
  │   ├─ If DAG: build topological levels│
  │   ├─ For each level:                 │
  │   │   ├─ Set executing_steps = [ids] │
  │   │   ├─ asyncio.gather(*steps)      │
  │   │   │   ├─ Resolve parent outputs  │
  │   │   │   ├─ Evaluate condition      │
  │   │   │   ├─ Execute via Hand Proto  │
  │   │   │   └─ Return step result      │
  │   │   ├─ Collect results, update ctx │
  │   │   └─ Clear executing_steps       │
  │   └─ Mark run completed/failed       │
  └──────────────────────────────────────┘
```

### Session Integration

Workflow execution happens **inside a session**, meaning:
- All step outputs appear as messages in the session chat
- Workspace files are shared across steps
- Brain Inspector shows workflow event logs
- Context Engine can replay full workflow history

### Visual Canvas

The frontend provides a **ReactFlow-based DAG canvas** with:
- Custom `StepNode` components with execution animations
- Custom `DataFlowEdge` with smooth-step paths and glow effects
- Client-side cycle detection preventing invalid connections
- DAG Info panel showing nodes/edges/validation/progress
- Context Inspector in the Step Detail Panel
- Dual-view toggle between Canvas and List modes

---

## Context Sharing & Session Forking

> `packages/api_bridge/app/session_store.py` (lines 314-518)

Sessions can reference, fork, or share workspaces with each other via `session_context_links`.

### Link Types

| Type | Behavior |
|------|----------|
| `reference` | Read-only access to target session's messages. Linked messages injected into context window. |
| `fork` | Created automatically when forking. Copies N recent messages into the new session. |
| `shared_workspace` | Sessions mount the same filesystem directory, enabling persistent file sharing. |

### Data Flow

```
Session A ──[reference]──► Session B
     │
     └─ ContextEngine.build_shared_context():
           1. Load Session A's own events
           2. Fetch messages from Session B (via get_linked_messages)
           3. Convert to synthetic events:
              "[Context from 'Session B'] (agent): ..."
           4. Inject BEFORE primary events
           5. Token budget: 80% primary / 20% linked
```

### Session Forking

```
POST /api/sessions/{session_id}/fork
  Body: { "copy_messages": 10, "title": "Forked: Research v2" }

Result:
  1. New session created
  2. Last N messages copied from parent
  3. Auto-link created (type: "fork")
  4. New session workspace provisioned
```

---

## Sandbox Pool

> `packages/api_bridge/app/sandbox/pool.py`

The Sandbox Pool manages isolated filesystem workspaces for each session.

```python
class SandboxPool:
    def provision(session_id, name=None, ttl_seconds=86400) -> Sandbox
    def destroy(sandbox_id) -> bool
    def gc() -> List[str]           # Destroy expired sandboxes
    def list_active() -> List[Sandbox]
    def get_stats() -> dict         # utilization metrics
```

### Properties
- **Isolation:** Each session gets its own directory
- **TTL:** Sandboxes auto-expire after configurable TTL (default: 24h)
- **GC Loop:** Background coroutine runs every 60 seconds
- **Path:** `packages/workspaces/sessions/{session_id}/`

---

## Report Engine

> `packages/api_bridge/app/report_engine.py` + `report_store.py`

The Report Engine generates AI-powered daily usage analytics.

### Flow

```
1. get_daily_stats(date, days)  →  Aggregate session/task/agent metrics
2. build_report_prompt(stats)   →  Construct LLM prompt with data
3. hand.execute(prompt)         →  Send to chosen agent (e.g., gemini)
4. save_report(...)             →  Persist to report_store (SQLite)
```

### Stored Reports

- Each report has: `id`, `date`, `days`, `agent`, `content` (markdown), `stats` (raw JSON), `created_at`
- Reports have unique constraint on `(date, days)` — regenerating overwrites
- Front-end displays reports with historical browsing and date filtering

---

## Data Model

All state is persisted to a single SQLite database (`sessions.db`).

### Tables

| Table | Purpose | Key Columns |
|-------|---------|-------------|
| `projects` | Group sessions by project | `id`, `name`, `description`, `color` |
| `sessions` | Chat sessions | `id`, `project_id`, `title`, `agent_type`, `workspace_dir` |
| `messages` | Chat messages | `id`, `session_id`, `source`, `content`, `agent_type`, `image_b64` |
| `session_events` | Durable event log | `id`, `session_id`, `event_type`, `agent`, `content`, `metadata` |
| `session_context_links` | Cross-session links | `id`, `source_session_id`, `target_session_id`, `link_type` |
| `workflows` | Saved workflow definitions | `id`, `name`, `description`, `steps` (JSON), `edges_json`, `positions_json`, `variables_json`, `config` (JSON) |
| `workflow_runs` | Workflow execution records | `id`, `workflow_id`, `session_id`, `status`, `progress` |
| `reports` | AI-generated daily reports | `id`, `date`, `agent`, `content`, `stats` (JSON) |
| `sandboxes` | Workspace tracking | `id`, `session_id`, `path`, `ttl_seconds`, `expires_at` |
| `background_tasks` | Task execution tracking | `id`, `session_id`, `agent`, `phase`, `output_bytes` |

---

## WebSocket Protocol

> `main.py` line 1051: `/ws/agent`

The WebSocket is the primary real-time communication channel between the frontend and backend.

### Client → Server Messages

| Type | Purpose | Key Fields |
|------|---------|------------|
| `execute_node` | Execute a prompt | `client`, `prompt`, `sessionId` |
| `multi_agent_run` | Multi-agent fan-out | `agents`, `prompt`, `sessionId`, `strategy` |
| `query_running` | Query all active tasks | — |

### Server → Client Messages

| Type | Purpose | Key Fields |
|------|---------|------------|
| `task_status` | Phase transition update | `taskId`, `phase`, `elapsed_ms`, `output_bytes` |
| `node_execution_log` | Output chunk | `sessionId`, `log` |
| `node_execution_completed` | Task finished | `exitCode` |
| `node_execution_image` | Image result (MFLUX) | `b64` |
| `multi_agent_started` | Multi-agent begun | `agents`, `strategy` |
| `multi_agent_completed` | Multi-agent done | `success`, `selected_agent`, `all_results` |
| `running_tasks` | Response to query | `tasks: [...]` |
| `error` | Error message | `message` |

### Connection Lifecycle

```
Client connects to ws://localhost:8000/ws/agent
  → Server calls accept()
  → Server creates subscriber queue for this connection  
  → Background drainer task forwards events to client

Client can send messages at any time (non-blocking)
  → Tasks execute as asyncio.Tasks
  → Status updates broadcast to ALL connected clients
  → Client disconnection does NOT stop running tasks
```
