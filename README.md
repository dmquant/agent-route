# Agent Route — Managed AI Agent Workspace

[English](#english) | [简体中文](#简体中文)

---

<a id="english"></a>
## 🇬🇧 English Documentation

A **managed agent workspace** that unifies multiple AI agents behind a stateless orchestrator. Sessions run in the background, switching contexts never interrupts execution, and every phase of the agent lifecycle is visible in real time.

Built on **Python FastAPI** (backend) and **React + Vite** (frontend), the system manages 5 agent "Hands" — Gemini CLI, Claude Code, Codex, Ollama, and MFLUX — through a uniform interface-driven architecture.

### ✨ Key Capabilities

| Capability | Description |
|------------|-------------|
| **Uniform Hand Protocol** | 5 `Hand` implementations behind a shared `execute()` interface — swap agents without code changes |
| **Background Execution** | Sessions run as `asyncio.Task`s — switching sessions or disconnecting never kills running agents |
| **Multi-Agent Delegation** | Fan-out prompts to N agents in parallel, join with strategies: `first_success`, `best_effort`, `majority_vote`, `all` |
| **Workflow Engine** | Visual DAG workflow builder with ReactFlow canvas, topological execution, conditional branching, sub-workflows, and I/O port-based data flow |
| **Scheduled Jobs** | APScheduler-backed automated cron execution for workflows, enabling daily reports, recurring routines, and headless cron jobs |
| **Cross-Session Context** | Link, fork, and share context between sessions — linked messages auto-inject into the context window |
| **Live Observability** | Real-time execution phases (connecting → executing → streaming → finalizing) with elapsed time and output metrics |
| **Brain Inspector** | Premium dashboard for session event streams, context utilization, and harness configurations |
| **Durable Event Log** | 19 `EventType` categories persisted to SQLite for crash recovery and time-travel debugging |
| **Daily Reports** | AI-generated daily usage analytics with persistent storage and historical browsing |
| **Context Engine** | 3 strategies (full replay, sliding window, compaction) + cross-session shared context |
| **Workspace Isolation** | Each session/agent gets its own working directory via the Sandbox Pool with TTL-based GC |
| **Client Architecture** | Multi-tenant Client API integration via `X-API-Key` headers with frontend token management |

### 🔐 Authentication & Multi-Tenant Architecture

Agent Route securely isolates execution data across multi-tenant applications using **Strict API Key Validation**. 
Every single API endpoint (REST and WebSocket) strictly requires authentication.

**1. Register a Client & Get an API Key**
- Open the native Dashboard.
- Click on **API Keys** in the sidebar.
- Enter a name under **Register Client** and click **Generate Token**.
- Copy the newly generated API Key.

**2. Authenticate External Requests**
All backend REST and WebSocket integration applications MUST include this API key:
- REST API: Include in HTTP headers:
  ```http
  X-API-Key: sk_...
  ```
- WebSockets: Include as a query parameter `?api_key=sk_...`

*When provided, the backend fully restricts all retrieved models, runs, sessions, workflows, and jobs to that exact client scope.*

**3. Internal Secure Admin Interface**
The native frontend interface operates entirely as a Global Admin console. 
By securely provisioning the `ADMIN_API_KEY` (defaulting to `sk_admin_route_2025` if not overridden via environment variables), the frontend orchestrator bypasses tenant-barriers and retrieves all resources. Workflows, jobs, and sessions can then be visibly reassigned to specific clients via Admin Dashboard forms natively!

### 🏗 Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│  Frontend (React + Vite)                                            │
│  ┌──────────┐ ┌──────────────┐ ┌──────────┐ ┌────────────────────┐│
│  │ Session   │ │ Chat + Status│ │ Workspace│ │ Workflows / Brain  ││
│  │ Panel     │ │ Bar + Context│ │ Panel    │ │ Inspector / Reports││
│  └──────────┘ └──────────────┘ └──────────┘ └────────────────────┘│
│           ↕ WebSocket (bidirectional, event-driven)                 │
└─────────────────────────────────────────────────────────────────────┘
          ↕
┌─────────────────────────────────────────────────────────────────────┐
│  API Bridge (Python FastAPI · packages/api_bridge)                  │
│                                                                     │
│  ┌───────────────┐  ┌──────────────────┐  ┌──────────────────────┐│
│  │ WebSocket     │  │ REST API Layer   │  │ BackgroundTask       ││
│  │ Handler       │  │ (70+ endpoints)  │  │ Manager              ││
│  └───────────────┘  └──────────────────┘  └──────────────────────┘│
│          ↕                    ↕                     ↕               │
│   ┌─────────────────────────────────────────────────────────┐      │
│   │                  Orchestrator (Brain)                    │      │
│   │  ┌───────────┐ ┌──────────────┐ ┌──────────────────┐   │      │
│   │  │ Context   │ │ Harness      │ │ Multi-Agent      │   │      │
│   │  │ Engine    │ │ Manager      │ │ Delegation       │   │      │
│   │  └───────────┘ └──────────────┘ └──────────────────┘   │      │
│   └─────────────────────────────────────────────────────────┘      │
│          ↕                                                          │
│  ┌──────────┐ ┌──────────┐ ┌───────┐ ┌────────┐ ┌──────┐         │
│  │ Gemini   │ │ Claude   │ │ Codex │ │ Ollama │ │ MFLUX│         │
│  │ Hand     │ │ Hand     │ │ Hand  │ │ Hand   │ │ Hand │         │
│  └──────────┘ └──────────┘ └───────┘ └────────┘ └──────┘         │
│          ↕                    ↕                     ↕               │
│  ┌──────────────┐ ┌─────────────────┐ ┌───────────────────────┐   │
│  │ Session      │ │ Workflow        │ │ Report Engine +       │   │
│  │ Event Mgr    │ │ Executor        │ │ Analytics             │   │
│  └──────────────┘ └─────────────────┘ └───────────────────────┘   │
│          ↕                                                          │
│  ┌────────────────────────────────────────────────────────────┐    │
│  │ sessions.db (SQLite — sessions, projects, messages, events,│    │
│  │   context_links, workflows, runs, reports, harness, tasks) │    │
│  └────────────────────────────────────────────────────────────┘    │
│  ┌────────────────────────────────────────────────────────────┐    │
│  │ Sandbox Pool (per-session isolated workspaces, TTL GC)     │    │
│  └────────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────────┘
```

### 📦 Project Structure

```
agent-route/
├── init.sh / start.sh / stop.sh    # Service lifecycle
├── .env.example                    # Configuration template
├── docs/                           # ← Full documentation
│   ├── architecture.md             # System architecture deep-dive
│   ├── api-reference.md            # Complete API reference (70+ endpoints)
│   ├── how-to-guide.md             # Practical examples & recipes
│   └── workflow-guide.md           # Workflow API: schema, templates, best practices
├── vibelog/                        # Daily engineering reports (EN + ZH)
├── packages/
│   ├── frontend/                   # React + Vite dashboard
│   │   └── src/
│   │       ├── pages/
│   │       │   ├── Chat.tsx              # Chat + context sharing + execution
│   │       │   ├── BrainInspector.tsx    # Event log + context viewer
│   │       │   ├── Agents.tsx            # Agent health + skill registry
│   │       │   ├── Workflows.tsx         # DAG workflow builder (Canvas + List)
│   │       │   ├── DailyReports.tsx      # AI-generated usage analytics
│   │       │   └── Dashboard.tsx         # Overview dashboard
│   │       └── components/
│   │           ├── workflow/
│   │           │   ├── WorkflowCanvas.tsx    # ReactFlow DAG canvas + cycle detection
│   │           │   ├── StepNode.tsx          # Custom node with execution animations
│   │           │   ├── StepDetailPanel.tsx   # Step editor + context inspector
│   │           │   └── types.ts             # Shared types, ports, edge schema
│   │           ├── SessionPanel.tsx       # Session list with running indicators
│   │           ├── WorkspacePanel.tsx     # File browser for session workspace
│   │           └── OutputParser.tsx       # Rich markdown/code output renderer
│   │
│   ├── api_bridge/                 # Python FastAPI backend
│   │   └── app/
│   │       ├── main.py                   # REST + WebSocket endpoints
│   │       ├── tasks.py                  # BackgroundTaskManager (phase lifecycle)
│   │       ├── session_store.py          # SQLite CRUD + context links + forking
│   │       ├── workflow_store.py         # Workflow + edge + position persistence
│   │       ├── workflow_executor.py      # DAG executor (topo sort + linear fallback)
│   │       ├── scheduler.py              # APScheduler logic + persisted SQLite job store
│   │       ├── report_engine.py          # Daily stats aggregation
│   │       ├── report_store.py           # Report persistence
│   │       ├── task_analytics.py         # Execution analytics
│   │       ├── agent_registry.py         # Agent discovery + skills
│   │       ├── hands/                    # Uniform Hand Protocol
│   │       │   ├── base.py              # Hand ABC + HandResult
│   │       │   ├── registry.py          # HandRegistry (auto-discovery)
│   │       │   ├── gemini_hand.py       # Google Gemini CLI
│   │       │   ├── claude_hand.py       # Anthropic Claude Code
│   │       │   ├── codex_hand.py        # OpenAI Codex
│   │       │   ├── ollama_hand.py       # Local Ollama HTTP
│   │       │   └── mflux_hand.py        # MFLUX image generation
│   │       ├── session/                  # Durable Event Log
│   │       │   ├── events.py            # 19 EventType categories
│   │       │   └── manager.py           # SessionEventManager
│   │       ├── brain/                    # Orchestrator + Context Engine
│   │       │   ├── orchestrator.py      # AgentOrchestrator
│   │       │   ├── context.py           # 3 context strategies + shared context
│   │       │   └── harness.py           # Per-agent HarnessConfig
│   │       └── sandbox/                  # Workspace management
│   │           └── pool.py              # SandboxPool (TTL, GC, quotas)
│   │
│   ├── backend/                    # Cloudflare Workers edge API (optional)
│   └── workspaces/sessions/        # Per-session isolated directories
```

### 🚀 Quick Start

#### 1. First-Time Setup
```bash
git clone <repo-url>
cd agent-route
./init.sh
```

#### 2. Configure AI Engines (`.env`)
```env
ENABLE_GEMINI_CLI=true
ENABLE_CLAUDE_REMOTE_CONTROL=true
ENABLE_CODEX_SERVER=true
ENABLE_OLLAMA_API=true
OLLAMA_BASE_URL=http://localhost:11434
ENABLE_MFLUX_IMAGE=true
SESSION_WORKSPACE_BASE=./packages/workspaces/sessions
```

#### 3. Pre-Authenticate CLI Tools
```bash
npx @anthropic-ai/claude-code auth login
npx gemini auth login
```

#### 4. Start the Service
```bash
./start.sh
```
Navigate to **http://localhost:5173** to use the Dashboard.

#### 5. Manual Start (Development)
```bash
# Terminal 1: Python Backend
cd packages/api_bridge && venv/bin/uvicorn app.main:app --port 8000 --reload

# Terminal 2: React Frontend
npm run dev:frontend
```

## 📚 Architecture Guide

### Architecture Guide — API Bridge

> Deep-dive into every subsystem of the Agent Route API Bridge.

#### Table of Contents

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

#### System Overview

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

#### Hand Protocol

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
### hands/registry.py
class HandRegistry:
    def register(self, hand: Hand) -> None: ...
    def get(self, name: str) -> Optional[Hand]: ...
    def list_all(self) -> List[Hand]: ...
    def list_names(self) -> List[str]: ...

### Auto-registration checks .env gates:
###   ENABLE_GEMINI_CLI=true → gemini_hand registered
###   ENABLE_OLLAMA_API=true → ollama_hand registered
```

### Stream Processing

`hands/stream_processor.py` provides a unified stream processor that:
- Parses raw stdout/stderr from CLI agents into structured chunks
- Detects activity types (coding, analyzing, browsing, etc.) via `activity_classifier.py`
- Extracts token usage, file modifications, and tool invocations
- Normalizes output across different agent formats

---

#### Brain & Orchestrator

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

#### Context Engine

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

#### Session Event Log

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

#### Background Task Manager

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

#### Workflow Engine

> `packages/api_bridge/app/workflow_store.py` + `workflow_executor.py` + `scheduler.py`

The Workflow Engine enables multi-step, multi-agent orchestration with a **visual DAG canvas**, **dual-mode execution** (DAG + linear fallback), and **cron-based scheduling**.

### Scheduled Execution (Cron)

The system embeds `APScheduler` configured with `AsyncIOScheduler` and a persistent `SQLAlchemyJobStore`. The job store is mapped directly to the `sessions.db` SQLite database (under the `apscheduler_jobs` table). 

When a cron trigger fires, the scheduler spawns a detached asynchronous task invoking the `run_scheduled_workflow()` method. This runs identically to manual workflows, initializing a dedicated headless `Session` (`agent_type="workflow"`) to execute the DAG.

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

#### Context Sharing & Session Forking

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

#### Sandbox Pool

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

#### Report Engine

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

#### Data Model

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
| `scheduled_jobs` | Cron jobs configuration | `id`, `workflow_id`, `trigger_expr` (cron), `input_prompt`, `next_run_time` |
| `apscheduler_jobs` | APScheduler internal store | `id`, `next_run_time`, `job_state` (blob) |
| `reports` | AI-generated daily reports | `id`, `date`, `agent`, `content`, `stats` (JSON) |
| `sandboxes` | Workspace tracking | `id`, `session_id`, `path`, `ttl_seconds`, `expires_at` |
| `background_tasks` | Task execution tracking | `id`, `session_id`, `agent`, `phase`, `output_bytes` |

---

#### WebSocket Protocol

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


---

## 📚 API Reference

### API Reference — Agent Route API Bridge

> Complete reference for all REST endpoints and WebSocket protocol.  
> Base URL: `http://localhost:8000`

#### Table of Contents

- [Authentication](#authentication)
- [Session Management](#1-session-management)
- [Project Management](#2-project-management)
- [Agent Execution](#3-agent-execution)
- [Multi-Agent Delegation](#4-multi-agent-delegation)
- [Background Tasks](#5-background-tasks)
- [Brain & Context Engine](#6-brain--context-engine)
- [Harness Configuration](#7-harness-configuration)
- [Workflow Engine](#8-workflow-engine)
- [Context Sharing & Forking](#9-context-sharing--forking)
- [File & Workspace Management](#10-file--workspace-management)
- [Sandbox Pool](#11-sandbox-pool)
- [Reports & Analytics](#12-reports--analytics)
- [Agent Discovery](#13-agent-discovery)
- [WebSocket Protocol](#14-websocket-protocol)

---

#### Authentication

No authentication is required for local development. All endpoints are accessible without tokens.

> **Note:** For production deployment, add authentication middleware to the FastAPI app.

---

#### 1. Session Management

### List Sessions

```http
GET /api/sessions
```

**Query Parameters:**

| Name | Type | Default | Description |
|------|------|---------|-------------|
| `project_id` | string | null | Filter by project ID |

**Response:**
```json
{
  "sessions": [
    {
      "id": "e6a51475992144e193ce6c766445d452",
      "project_id": null,
      "title": "New Session",
      "agent_type": "gemini",
      "message_count": 6,
      "created_at": 1775835784887,
      "updated_at": 1775835784887,
      "workspace_dir": "/path/to/workspaces/sessions/{id}"
    }
  ]
}
```

### Create Session

```http
POST /api/sessions
Content-Type: application/json
```

**Request Body:**
```json
{
  "project_id": "optional_project_id",
  "title": "New Session",
  "agent_type": "gemini"
}
```

**Response:** Session object (same as list item).

### Get Session by ID

```http
GET /api/sessions/{session_id}
```

**Response:** Single session object with full details.

### Update Session

```http
PUT /api/sessions/{session_id}
Content-Type: application/json
```

**Request Body:**
```json
{
  "title": "Updated Title",
  "project_id": "new_project_id"
}
```

### Delete Session

```http
DELETE /api/sessions/{session_id}
```

Deletes the session, all messages, events, and cleans up the workspace directory.

### Get Messages

```http
GET /api/sessions/{session_id}/messages
```

**Query Parameters:**

| Name | Type | Default | Description |
|------|------|---------|-------------|
| `include_images` | bool | false | Include base64 image data in responses |

**Response:**
```json
[
  {
    "id": 1,
    "session_id": "abc123",
    "source": "user",
    "content": "Hello, write a Python function",
    "agent_type": null,
    "image_b64": null,
    "created_at": 1775835784887
  },
  {
    "id": 2,
    "session_id": "abc123",
    "source": "agent",
    "content": "Here's a Python function...",
    "agent_type": "gemini",
    "image_b64": null,
    "created_at": 1775835790000
  }
]
```

### Get Session Events

```http
GET /api/sessions/{session_id}/events
```

**Query Parameters:**

| Name | Type | Default | Description |
|------|------|---------|-------------|
| `event_types` | string | null | Comma-separated filter: `message.user,tool.call` |
| `since_id` | int | null | Only return events after this ID |
| `limit` | int | 200 | Max events to return |

**Response:**
```json
{
  "events": [
    {
      "id": 42,
      "session_id": "abc123",
      "event_type": "message.user",
      "agent": null,
      "content": "Hello",
      "metadata": {},
      "timestamp": 1775835784887
    }
  ]
}
```

### Wake Session

```http
POST /api/sessions/{session_id}/wake
```

Loads session state to memory, replays events, and prepares the context engine. Used for resuming suspended sessions.

### Checkpoint Session

```http
POST /api/sessions/{session_id}/checkpoint
```

Creates a context checkpoint event. Returns the checkpoint event ID for later rewinding.

### Get Session Summary

```http
GET /api/sessions/{session_id}/summary
```

Returns a summary of the session: event counts by type, message count, last activity timestamp, and context stats.

---

#### 2. Project Management

### List Projects

```http
GET /api/projects
```

**Response:**
```json
[
  {
    "id": "proj_abc123",
    "name": "Research Work",
    "description": "AI research sessions",
    "color": "#6366f1",
    "created_at": 1775835784887
  }
]
```

### Create Project

```http
POST /api/projects
Content-Type: application/json
```

**Request Body:**
```json
{
  "name": "Research Work",
  "description": "AI research sessions",
  "color": "#6366f1"
}
```

### Update Project

```http
PUT /api/projects/{project_id}
Content-Type: application/json
```

**Request Body:** Same as create (all fields optional).

### Delete Project

```http
DELETE /api/projects/{project_id}
```

---

#### 3. Agent Execution

### Synchronous Execution

```http
POST /execute
Content-Type: application/json
```

**Request Body:**
```json
{
  "client": "gemini",
  "prompt": "Write a Hello World program in Rust",
  "workspace_id": "optional_workspace",
  "model": "llama3"
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `client` | string | ✅ | Agent name: `gemini`, `claude`, `codex`, `ollama`, `mflux` |
| `prompt` | string | ✅ | The instruction to execute |
| `workspace_id` | string | ❌ | Workspace directory name (default: `default_sync`) |
| `model` | string | ❌ | Model name for Ollama (default: `llama3`) |

**Response:**
```json
{
  "exitCode": 0,
  "output": "fn main() {
    println!(\"Hello, World!\");
}"
}
```

### Streaming Execution (NDJSON)

```http
POST /execute/stream
Content-Type: application/json
```

Same request body as `/execute`. Returns `application/x-ndjson`:

```jsonl
{"type": "node_execution_started"}
{"type": "node_execution_log", "log": "Creating file..."}
{"type": "node_execution_log", "log": "fn main() {"}
{"type": "node_execution_log", "log": "    println!(\"Hello, World!\");"}
{"type": "node_execution_log", "log": "}"}
{"type": "node_execution_image", "b64": "iVBOR..."}
{"type": "node_execution_completed", "exitCode": 0}
```

---

#### 4. Multi-Agent Delegation

### Run Multi-Agent

```http
POST /api/multi-agent/run
Content-Type: application/json
```

**Request Body:**
```json
{
  "agents": ["gemini", "claude"],
  "prompt": "Write unit tests for auth.py",
  "session_id": "optional_session_id",
  "strategy": "first_success",
  "timeout": 300.0
}
```

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `agents` | string[] | — | List of agent names to execute |
| `prompt` | string | — | The instruction |
| `session_id` | string | auto-generated | Session to execute in |
| `strategy` | string | `first_success` | Join strategy (see below) |
| `timeout` | float | 300.0 | Max seconds per agent |

**Join Strategies:**

| Strategy | Behavior |
|----------|----------|
| `first_success` | Return the first agent that succeeds (fastest winner) |
| `best_effort` | Return all successful results, fallback to any |
| `majority_vote` | Success = majority of agents succeeded |
| `all` | Return all results regardless of outcome |

**Response:**
```json
{
  "success": true,
  "strategy": "first_success",
  "selected_agent": "gemini",
  "all_results": [
    {
      "agent": "gemini",
      "success": true,
      "output": "...",
      "elapsed_ms": 4200
    },
    {
      "agent": "claude",
      "success": true,
      "output": "...",
      "elapsed_ms": 5100
    }
  ]
}
```

---

#### 5. Background Tasks

### List All Tasks

```http
GET /api/tasks
```

Returns all running and recently completed tasks.

### Get Running Session IDs

```http
GET /api/tasks/running
```

**Response:**
```json
{
  "running": ["session_id_1", "session_id_2"]
}
```

### Get Tasks for Session

```http
GET /api/tasks/{session_id}
```

### Get Task History

```http
GET /api/tasks/history
```

**Query Parameters:**

| Name | Type | Default | Description |
|------|------|---------|-------------|
| `limit` | int | 100 | Max records |

---

#### 6. Brain & Context Engine

### Run Brain

```http
POST /api/brain/{session_id}/run
Content-Type: application/json
```

**Request Body:**
```json
{
  "agent": "gemini",
  "prompt": "Analyze this codebase",
  "workspace_dir": "/path/to/workspace"
}
```

### Wake Brain

```http
POST /api/brain/{session_id}/wake
```

### Pause Brain

```http
POST /api/brain/{session_id}/pause
```

### Delegate to Sub-Agent

```http
POST /api/brain/{session_id}/delegate
Content-Type: application/json
```

**Request Body:**
```json
{
  "from_agent": "gemini",
  "to_agent": "claude",
  "prompt": "Review the code changes"
}
```

### Get Brain Status

```http
GET /api/brain/{session_id}/status
```

### Build Context Window

```http
GET /api/brain/{session_id}/context?agent=gemini
```

**Response:**
```json
{
  "strategy": "full_replay",
  "events": [...],
  "included_events": 42,
  "estimated_tokens": 8500,
  "budget": 100000
}
```

### Get Context Stats

```http
GET /api/brain/{session_id}/context/stats?agent=gemini
```

**Response:**
```json
{
  "total_events": 42,
  "estimated_tokens": 8500,
  "budget": 100000,
  "utilization": 0.085,
  "needs_compaction": false,
  "strategy_if_built": "full_replay"
}
```

### Build Shared Context (with linked sessions)

```http
GET /api/brain/{session_id}/context/shared?agent=gemini
```

Same as `/context` but includes messages from linked sessions. Additional fields:

```json
{
  "strategy": "shared_full_replay",
  "linked_sessions": 2,
  "linked_context": [
    {
      "event_type": "context.linked",
      "content": "[Context from 'Research Session'] (agent): ...",
      "metadata": {
        "linked_from": "sess_456",
        "link_type": "reference"
      }
    }
  ]
}
```

### Rewind Context

```http
GET /api/brain/{session_id}/context/rewind?before_event_id=42&count=10
```

Returns N events leading up to the specified event ID. Used for time-travel debugging.

---

#### 7. Harness Configuration

### List All Harnesses

```http
GET /api/harnesses
```

**Response:**
```json
{
  "harnesses": [
    {
      "agent": "gemini",
      "max_context_tokens": 1000000,
      "auto_compact": true,
      "compact_threshold": 0.8,
      "compact_strategy": "tail",
      "retry_on_failure": true,
      "max_retries": 3,
      "timeout_seconds": 300,
      "skills": []
    }
  ]
}
```

### Get Harness for Agent

```http
GET /api/harnesses/{agent}
```

---

#### 8. Workflow Engine

### List Workflows

```http
GET /api/workflows
```

**Response:**
```json
{
  "workflows": [
    {
      "id": "wf_abc123",
      "name": "Daily Research Pipeline",
      "description": "Gather and analyze daily AI news",
      "steps": [...],
      "config": {"timeout_per_step": 7200},
      "created_at": 1775835784887
    }
  ]
}
```

### Create Workflow

```http
POST /api/workflows
Content-Type: application/json
```

**Request Body:**
```json
{
  "name": "My Workflow",
  "description": "Research and report",
  "steps": [
    {
      "id": "step_1",
      "agent": "gemini",
      "prompt": "Research AI news today",
      "skills": ["web_search"],
      "input_files": [],
      "order": 0
    },
    {
      "id": "step_2",
      "agent": "claude",
      "prompt": "Write a summary report",
      "skills": [],
      "input_files": [],
      "order": 1,
      "condition": {
        "type": "if_output_contains",
        "value": "news",
        "on_false": "skip"
      }
    }
  ],
  "config": {
    "timeout_per_step": 7200,
    "stop_on_failure": true
  }
}
```

**Step `condition` field (optional):**

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `type` | string | `always` | `always`, `if_output_contains`, `if_output_not_contains`, `if_exit_code`, `if_file_exists` |
| `value` | string | `""` | Comparison value (search text, exit code, or filename) |
| `on_false` | string | `skip` | Action when condition fails: `skip`, `goto`, `stop` |
| `goto_step` | string | `""` | Target step ID (only used with `goto`) |

### Get Workflow

```http
GET /api/workflows/{workflow_id}
```

### Update Workflow

```http
PUT /api/workflows/{workflow_id}
Content-Type: application/json
```

Same body as create (all fields optional).

### Delete Workflow

```http
DELETE /api/workflows/{workflow_id}
```

### Run Workflow

```http
POST /api/workflows/{workflow_id}/run
Content-Type: application/json
```

**Request Body:**
```json
{
  "session_id": "optional_existing_session_id",
  "session_title": "Workflow: Research Run"
}
```

If `session_id` is omitted, a new session is created automatically.

**Response:**
```json
{
  "run_id": "run_xyz",
  "session_id": "new_or_existing_session_id",
  "status": "running",
  "workflow": "Daily Research Pipeline"
}
```

### Run Workflow in Existing Session

```http
POST /api/sessions/{session_id}/run-workflow
Content-Type: application/json
```

**Request Body:**
```json
{
  "workflow_id": "wf_abc123"
}
```

This triggers workflow execution within an existing session's context and workspace.

### List Workflow Runs

```http
GET /api/workflows/{workflow_id}/runs?limit=50
```

### Get Workflow Run

```http
GET /api/workflow-runs/{run_id}
```

**Response:**
```json
{
  "id": "run_xyz",
  "workflow_id": "wf_abc123",
  "session_id": "sess_456",
  "status": "completed",
  "progress": {"completed": 2, "total": 2},
  "started_at": 1775835784887,
  "completed_at": 1775835800000,
  "error": null
}
```

### Cancel Workflow Run

```http
POST /api/workflow-runs/{run_id}/cancel
```

---

#### 8.5 Scheduled Jobs (Cron Workflows)

### List Scheduled Jobs

```http
GET /api/scheduled-jobs
```

**Response:**
```json
{
  "jobs": [
    {
      "id": "job_123456",
      "workflow_id": "wf_abc123",
      "trigger_expr": "0 * * * *",
      "input_prompt": "Run daily summary",
      "next_run_time": "2026-04-14T00:00:00+00:00"
    }
  ]
}
```

### Create Scheduled Job

```http
POST /api/scheduled-jobs
Content-Type: application/json
```

**Request Body:**
```json
{
  "workflow_id": "wf_abc123",
  "cron_expr": "0 0 * * *",
  "input_prompt": "Optional starting prompt"
}
```

**Response:**
```json
{
  "success": true,
  "job_id": "job_123456",
  "next_run_time": "2026-04-14T00:00:00+00:00"
}
```

### Delete Scheduled Job

```http
DELETE /api/scheduled-jobs/{job_id}
```

---

#### 9. Context Sharing & Forking

### Create Context Link

```http
POST /api/sessions/{session_id}/context-links
Content-Type: application/json
```

**Request Body:**
```json
{
  "target_session_id": "sess_target_456",
  "link_type": "reference",
  "label": "Research reference",
  "include_messages": true,
  "include_files": true,
  "max_messages": 50
}
```

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `target_session_id` | string | — | Session to link to |
| `link_type` | string | `reference` | `reference`, `fork`, or `shared_workspace` |
| `label` | string | `""` | Human-readable label |
| `include_messages` | bool | true | Pull messages from target |
| `include_files` | bool | true | Access target's workspace files |
| `max_messages` | int | 50 | Max messages to pull from target |

**Response:**
```json
{
  "id": "bd020e346889462a",
  "source_session_id": "sess_source_123",
  "target_session_id": "sess_target_456",
  "link_type": "reference",
  "label": "Research reference",
  "include_messages": 1,
  "include_files": 1,
  "max_messages": 50,
  "created_at": 1775835784887
}
```

### Get Context Links

```http
GET /api/sessions/{session_id}/context-links
```

**Response:**
```json
{
  "outgoing": [
    {
      "id": "bd020e346889462a",
      "source_session_id": "sess_source_123",
      "target_session_id": "sess_target_456",
      "link_type": "reference",
      "target_title": "Research Session",
      "target_agent": "gemini"
    }
  ],
  "incoming": [
    {
      "id": "abc123",
      "source_session_id": "sess_other_789",
      "target_session_id": "sess_source_123",
      "link_type": "fork",
      "source_title": "Forked Analysis"
    }
  ]
}
```

### Delete Context Link

```http
DELETE /api/context-links/{link_id}
```

### Get Linked Messages

```http
GET /api/sessions/{session_id}/linked-messages
```

**Query Parameters:**

| Name | Type | Default | Description |
|------|------|---------|-------------|
| `limit` | int | 50 | Max messages per linked session |

**Response:**
```json
{
  "messages": [
    {
      "id": 1,
      "session_id": "target_sess",
      "source": "agent",
      "content": "Here's the analysis...",
      "agent_type": "gemini",
      "_linked_from": "target_sess",
      "_linked_title": "Research Session",
      "_link_type": "reference"
    }
  ]
}
```

### Fork Session

```http
POST /api/sessions/{session_id}/fork
Content-Type: application/json
```

**Request Body:**
```json
{
  "title": "Forked: Research v2",
  "copy_messages": 10
}
```

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `title` | string | `"Fork of {original}"` | Title for the new session |
| `copy_messages` | int | 0 | Number of recent messages to copy |

**Response:** New session object. A `fork` type context link is automatically created.

---

#### 10. File & Workspace Management

### Upload File to Session

```http
POST /api/upload/{session_id}
Content-Type: multipart/form-data
```

**Form Fields:**

| Name | Type | Description |
|------|------|-------------|
| `file` | file | File to upload |

**Response:**
```json
{
  "filename": "document.pdf",
  "path": "/path/to/workspaces/sessions/{id}/document.pdf",
  "size": 12345,
  "session_id": "sess_123"
}
```

### List Session Files

```http
GET /api/sessions/{session_id}/files
```

**Response:**
```json
{
  "files": [
    {
      "name": "output.py",
      "path": "output.py",
      "size": 1234,
      "modified": 1775835784887,
      "is_dir": false
    }
  ],
  "workspace": "/path/to/workspaces/sessions/{id}"
}
```

### List Workspace (tree view)

```http
GET /api/sessions/{session_id}/workspace
```

Returns a recursive directory tree of the session workspace.

### Read Workspace File

```http
GET /api/sessions/{session_id}/workspace/read?path=output.py
```

**Response:**
```json
{
  "content": "print('hello world')",
  "path": "output.py",
  "size": 20,
  "is_binary": false
}
```

---

#### 11. Sandbox Pool

### Provision Sandbox

```http
POST /api/sandboxes
Content-Type: application/json
```

**Request Body:**
```json
{
  "session_id": "sess_123",
  "name": "research-workspace",
  "ttl_seconds": 86400
}
```

### List Active Sandboxes

```http
GET /api/sandboxes
```

### Get Sandbox Stats

```http
GET /api/sandboxes/stats
```

### Destroy Sandbox

```http
DELETE /api/sandboxes/{sandbox_id}
```

### Run Garbage Collection

```http
POST /api/sandboxes/gc
```

**Response:**
```json
{
  "destroyed": ["sandbox_1", "sandbox_2"],
  "count": 2
}
```

---

#### 12. Reports & Analytics

### Get Daily Stats

```http
GET /api/reports/daily?date=2026-04-10&days=1
```

Raw aggregated statistics (session count, message count, agent usage, etc.).

### Generate AI Report

```http
POST /api/reports/generate
Content-Type: application/json
```

**Request Body:**
```json
{
  "date": "2026-04-10",
  "days": 1,
  "agent": "gemini"
}
```

Generates an AI narrative report and persists it.

### List Saved Reports

```http
GET /api/reports
```

### Get Report by ID

```http
GET /api/reports/{report_id}
```

### Get Report by Date

```http
GET /api/reports/date/{date}?days=1
```

### Delete Report

```http
DELETE /api/reports/{report_id}
```

### Get Task Analytics

```http
GET /api/analytics?days=7
```

Returns execution analytics: success rates, average durations, agent comparison.

### Get Benchmark Comparison

```http
GET /api/analytics/benchmark?days=7
```

---

#### 13. Agent Discovery

### List Registered Agents

```http
GET /api/agents
```

**Response:**
```json
[
  {
    "name": "gemini",
    "type": "cli",
    "enabled": true,
    "available": true,
    "health": {
      "status": "healthy",
      "last_check": 1775835784887
    }
  }
]
```

### Get Agent Skills

```http
GET /api/agents/{agent_id}/skills
```

**Response:**
```json
{
  "agent": "gemini",
  "skills": [
    {"name": "web_search", "description": "Search the web"},
    {"name": "code_execution", "description": "Execute code in sandbox"}
  ]
}
```

### List Hands (Registry)

```http
GET /api/hands
```

### Hand Health Check

```http
GET /api/hands/health
```

### Discover Ollama Models

```http
GET /models/ollama
```

**Response:**
```json
{
  "models": [
    {"name": "llama3", "size": "4.7GB", "modified_at": "2026-04-01"},
    {"name": "qwen2.5-coder", "size": "4.4GB", "modified_at": "2026-03-15"}
  ]
}
```

---

#### 14. WebSocket Protocol

### Connection

```
ws://localhost:8000/ws/agent
```

### Client → Server Messages

#### Execute Prompt

```json
{
  "type": "execute_node",
  "client": "gemini",
  "prompt": "Write a Python function to calculate fibonacci",
  "sessionId": "sess_abc123"
}
```

#### Multi-Agent Fan-Out

```json
{
  "type": "multi_agent_run",
  "agents": ["gemini", "claude"],
  "prompt": "Write unit tests for auth.py",
  "sessionId": "sess_abc123",
  "strategy": "first_success",
  "timeout": 300.0
}
```

#### Query Running Tasks

```json
{
  "type": "query_running"
}
```

### Server → Client Messages

#### Task Status Update

Broadcast to ALL connected clients whenever a task changes phase:

```json
{
  "type": "task_status",
  "taskId": "task_xyz",
  "sessionId": "sess_abc123",
  "agent": "gemini",
  "phase": "streaming",
  "elapsed_ms": 12400,
  "output_bytes": 8192
}
```

**Phase values:** `queued`, `connecting`, `executing`, `streaming`, `finalizing`, `completed`, `failed`

#### Output Chunk

```json
{
  "type": "node_execution_log",
  "sessionId": "sess_abc123",
  "log": "Creating file main.rs..."
}
```

#### Execution Complete

```json
{
  "type": "node_execution_completed",
  "sessionId": "sess_abc123",
  "exitCode": 0
}
```

#### Image Result (MFLUX)

```json
{
  "type": "node_execution_image",
  "sessionId": "sess_abc123",
  "b64": "iVBORw0KGgo..."
}
```

#### Multi-Agent Started

```json
{
  "type": "multi_agent_started",
  "sessionId": "sess_abc123",
  "agents": ["gemini", "claude"],
  "strategy": "first_success"
}
```

#### Multi-Agent Completed

```json
{
  "type": "multi_agent_completed",
  "sessionId": "sess_abc123",
  "success": true,
  "selected_agent": "gemini",
  "all_results": [
    {
      "agent": "gemini",
      "success": true,
      "output": "...",
      "elapsed_ms": 4200
    },
    {
      "agent": "claude",
      "success": true,
      "output": "...",
      "elapsed_ms": 5100
    }
  ]
}
```

#### Running Tasks Response

```json
{
  "type": "running_tasks",
  "tasks": [
    {
      "taskId": "task_xyz",
      "sessionId": "sess_abc123",
      "agent": "gemini",
      "phase": "streaming",
      "elapsed_ms": 12400
    }
  ]
}
```

#### Error

```json
{
  "type": "error",
  "message": "agents and prompt required"
}
```


---

## 📚 How-To Guide

### How-To Guide — Agent Route API Bridge

> Practical recipes and examples for common tasks.

#### Table of Contents

- [Getting Started](#getting-started)
- [Recipe 1: Run Your First Agent](#recipe-1-run-your-first-agent)
- [Recipe 2: Streaming Execution with NDJSON](#recipe-2-streaming-execution-with-ndjson)
- [Recipe 3: WebSocket Integration](#recipe-3-websocket-integration)
- [Recipe 4: Multi-Agent Comparison](#recipe-4-multi-agent-comparison)
- [Recipe 5: Session Management](#recipe-5-session-management)
- [Recipe 6: Build and Run a Workflow](#recipe-6-build-and-run-a-workflow)
- [Recipe 6.5: Schedule a Workflow](#recipe-65-schedule-a-workflow)
- [Recipe 7: Cross-Session Context Sharing](#recipe-7-cross-session-context-sharing)
- [Recipe 8: Fork a Session](#recipe-8-fork-a-session)
- [Recipe 9: Use the Brain Inspector](#recipe-9-use-the-brain-inspector)
- [Recipe 10: File Upload and Workspace Management](#recipe-10-file-upload-and-workspace-management)
- [Recipe 11: Generate Daily Reports](#recipe-11-generate-daily-reports)
- [Recipe 12: Agent Health Monitoring](#recipe-12-agent-health-monitoring)
- [Recipe 13: Context Engine Debugging](#recipe-13-context-engine-debugging)
- [Recipe 14: Build a Custom Integration](#recipe-14-build-a-custom-integration)
- [Troubleshooting](#troubleshooting)

---

#### Getting Started

### Prerequisites

1. Python 3.11+ with a virtual environment
2. Node.js 18+
3. At least one AI CLI tool authenticated:
   ```bash
   npx gemini auth login          # Gemini CLI
   npx @anthropic-ai/claude-code auth login  # Claude Code
   ```

### Start the API Bridge

```bash
### Option 1: One-command start
./start.sh

### Option 2: Development mode (with hot reload)
cd packages/api_bridge
venv/bin/uvicorn app.main:app --port 8000 --reload
```

The API is now available at `http://localhost:8000`.

### Verify the service is running

```bash
curl -H "X-API-Key: $YOUR_API_KEY" http://localhost:8000/api/agents
```

You should see a JSON list of registered agents.


### 🔐 Authentication (Required)

All endpoints **require** authentication. You must register an API Key in the UI dashboard (or use the Global Admin key `sk_admin_route_2025` for full access).

**For REST APIs**, include the `X-API-Key` header:
```bash
curl -H "X-API-Key: sk_admin_route_2025" http://localhost:8000/api/...
```

**For WebSockets**, include the key as a query parameter:
```bash
websocat "ws://localhost:8000/ws/agent?api_key=sk_admin_route_2025"
```

---

#### Recipe 1: Run Your First Agent

The simplest way to execute an AI agent: **synchronous HTTP call**.

### Using curl

```bash
### Ask Gemini to write a Python function
curl -H "X-API-Key: $YOUR_API_KEY" -X POST http://localhost:8000/execute \
  -H "Content-Type: application/json" \
  -d '{
    "client": "gemini",
    "prompt": "Write a Python function that calculates the nth Fibonacci number. Include type hints and doctring."
  }'
```

### Using Python

```python
import requests

response = requests.post("http://localhost:8000/execute", json={
    "client": "gemini",
    "prompt": "Write a Python function that calculates the nth Fibonacci number.",
})

result = response.json()
print(f"Exit code: {result['exitCode']}")
print(f"Output:
{result['output']}")
```

### Using JavaScript/TypeScript

```typescript
const response = await fetch("http://localhost:8000/execute", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    client: "gemini",
    prompt: "Write a Python function that calculates the nth Fibonacci number.",
  }),
});

const result = await response.json();
console.log(`Exit code: ${result.exitCode}`);
console.log(`Output: ${result.output}`);
```

### Choosing Different Agents

```bash
### Claude Code
curl -H "X-API-Key: $YOUR_API_KEY" -X POST http://localhost:8000/execute \
  -d '{"client": "claude", "prompt": "Review this code for bugs"}'

### Codex
curl -H "X-API-Key: $YOUR_API_KEY" -X POST http://localhost:8000/execute \
  -d '{"client": "codex", "prompt": "Refactor this function"}'

### Ollama (local LLM)
curl -H "X-API-Key: $YOUR_API_KEY" -X POST http://localhost:8000/execute \
  -d '{"client": "ollama", "prompt": "Explain quantum computing", "model": "llama3"}'

### MFLUX (image generation)
curl -H "X-API-Key: $YOUR_API_KEY" -X POST http://localhost:8000/execute \
  -d '{"client": "mflux", "prompt": "A sunset over Tokyo skyline, cinematic"}'
### Response includes "image_b64" field with the generated image
```

---

#### Recipe 2: Streaming Execution with NDJSON

For long-running tasks, use streaming to get output in real-time.

### Using curl

```bash
curl -H "X-API-Key: $YOUR_API_KEY" -X POST http://localhost:8000/execute/stream \
  -H "Content-Type: application/json" \
  -d '{"client": "gemini", "prompt": "Write a complete REST API server in Python with FastAPI"}' \
  --no-buffer
```

Each line is a JSON event:

```
{"type": "node_execution_started"}
{"type": "node_execution_log", "log": "I'll create a REST API..."}
{"type": "node_execution_log", "log": "```python"}
{"type": "node_execution_log", "log": "from fastapi import FastAPI"}
...
{"type": "node_execution_completed", "exitCode": 0}
```

### Using Python with streaming

```python
import requests
import json

response = requests.post(
    "http://localhost:8000/execute/stream",
    json={"client": "gemini", "prompt": "Write a comprehensive test suite"},
    stream=True,
)

for line in response.iter_lines():
    if line:
        event = json.loads(line)
        if event["type"] == "node_execution_log":
            print(event["log"], end="", flush=True)
        elif event["type"] == "node_execution_completed":
            print(f"

✅ Done (exit code: {event['exitCode']})")
```

### Using JavaScript with fetch streaming

```javascript
const response = await fetch("http://localhost:8000/execute/stream", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    client: "gemini",
    prompt: "Build a React component",
  }),
});

const reader = response.body.getReader();
const decoder = new TextDecoder();

while (true) {
  const { done, value } = await reader.read();
  if (done) break;
  
  const lines = decoder.decode(value).split("
").filter(Boolean);
  for (const line of lines) {
    const event = JSON.parse(line);
    if (event.type === "node_execution_log") {
      process.stdout.write(event.log);
    }
  }
}
```

---

#### Recipe 3: WebSocket Integration

For full duplex, real-time communication — the primary protocol used by the frontend.

### JavaScript WebSocket Client

```javascript
const ws = new WebSocket("ws://localhost:8000/ws/agent");

ws.onopen = () => {
  console.log("Connected!");
  
  // Execute a prompt
  ws.send(JSON.stringify({
    type: "execute_node",
    client: "gemini",
    prompt: "Explain the observer pattern with a code example",
    sessionId: "my-session-123",
  }));
};

ws.onmessage = (event) => {
  const data = JSON.parse(event.data);
  
  switch (data.type) {
    case "task_status":
      console.log(`Phase: ${data.phase} | Elapsed: ${data.elapsed_ms}ms`);
      break;
    case "node_execution_log":
      process.stdout.write(data.log);
      break;
    case "node_execution_completed":
      console.log(`
✅ Done (exit ${data.exitCode})`);
      break;
    case "error":
      console.error(`Error: ${data.message}`);
      break;
  }
};

// Query all running tasks
function queryRunning() {
  ws.send(JSON.stringify({ type: "query_running" }));
}
```

### Python WebSocket Client

```python
import asyncio
import websockets
import json

async def main():
    async with websockets.connect("ws://localhost:8000/ws/agent") as ws:
        # Send execution request
        await ws.send(json.dumps({
            "type": "execute_node",
            "client": "gemini",
            "prompt": "Write a binary search implementation in Rust",
            "sessionId": "python-client-session",
        }))
        
        # Listen for events
        async for message in ws:
            event = json.loads(message)
            
            if event["type"] == "task_status":
                print(f"Phase: {event['phase']}")
            elif event["type"] == "node_execution_log":
                print(event["log"], end="", flush=True)
            elif event["type"] == "node_execution_completed":
                print(f"
✅ Exit code: {event['exitCode']}")
                break

asyncio.run(main())
```

---

#### Recipe 4: Multi-Agent Comparison

Run the same prompt against multiple agents and compare results.

### Run and Compare

```bash
curl -H "X-API-Key: $YOUR_API_KEY" -X POST http://localhost:8000/api/multi-agent/run \
  -H "Content-Type: application/json" \
  -d '{
    "agents": ["gemini", "claude", "codex"],
    "prompt": "Write a thread-safe producer-consumer queue in Python. Include type hints.",
    "strategy": "all",
    "timeout": 120.0
  }'
```

### Process Results

```python
import requests

response = requests.post("http://localhost:8000/api/multi-agent/run", json={
    "agents": ["gemini", "claude"],
    "prompt": "Implement a LRU cache in Python with O(1) operations",
    "strategy": "all",
    "timeout": 120.0,
})

result = response.json()

for agent_result in result["all_results"]:
    print(f"
{'='*60}")
    print(f"Agent: {agent_result['agent']}")
    print(f"Success: {agent_result['success']}")
    print(f"Time: {agent_result['elapsed_ms']}ms")
    print(f"Output:
{agent_result['output'][:500]}")
```

### Via WebSocket (with live status updates)

```javascript
ws.send(JSON.stringify({
  type: "multi_agent_run",
  agents: ["gemini", "claude"],
  prompt: "Implement a rate limiter",
  sessionId: "comparison-session",
  strategy: "best_effort",
  timeout: 120,
}));

// You'll receive:
// 1. { type: "multi_agent_started", agents: [...], strategy: "best_effort" }
// 2. { type: "task_status", ... } for each agent
// 3. { type: "node_execution_log", ... } output chunks
// 4. { type: "multi_agent_completed", success: true, all_results: [...] }
```

---

#### Recipe 5: Session Management

Sessions provide persistent conversation history and isolated workspaces.

### Create and Use a Session

```bash
### Create a session
SESSION=$(curl -H "X-API-Key: $YOUR_API_KEY" -s -X POST http://localhost:8000/api/sessions \
  -H "Content-Type: application/json" \
  -d '{"title": "Research Session", "agent_type": "gemini"}' \
  | python3 -c "import sys,json; print(json.load(sys.stdin)['id'])")

echo "Created session: $SESSION"

### Execute in the session (via WebSocket or REST)
curl -H "X-API-Key: $YOUR_API_KEY" -X POST http://localhost:8000/execute \
  -d "{\"client\": \"gemini\", \"prompt\": \"Hello!\", \"workspace_id\": \"$SESSION\"}"

### View messages
curl -H "X-API-Key: $YOUR_API_KEY" http://localhost:8000/api/sessions/$SESSION/messages | python3 -m json.tool

### View session events (for Brain Inspector)
curl -H "X-API-Key: $YOUR_API_KEY" "http://localhost:8000/api/sessions/$SESSION/events?limit=50" | python3 -m json.tool
```

### Organize Sessions with Projects

```bash
### Create a project
PROJECT=$(curl -H "X-API-Key: $YOUR_API_KEY" -s -X POST http://localhost:8000/api/projects \
  -d '{"name": "AI Research", "description": "Daily research tasks", "color": "#6366f1"}' \
  | python3 -c "import sys,json; print(json.load(sys.stdin)['id'])")

### Create a session in the project
curl -H "X-API-Key: $YOUR_API_KEY" -X POST http://localhost:8000/api/sessions \
  -d "{\"project_id\": \"$PROJECT\", \"title\": \"Morning Research\", \"agent_type\": \"gemini\"}"

### List sessions filtered by project
curl -H "X-API-Key: $YOUR_API_KEY" "http://localhost:8000/api/sessions?project_id=$PROJECT"
```

### Session Lifecycle

```bash
### Wake a session (load state into memory)
curl -H "X-API-Key: $YOUR_API_KEY" -X POST http://localhost:8000/api/sessions/$SESSION/wake

### Checkpoint (save state for recovery)
curl -H "X-API-Key: $YOUR_API_KEY" -X POST http://localhost:8000/api/sessions/$SESSION/checkpoint

### Get session summary
curl -H "X-API-Key: $YOUR_API_KEY" http://localhost:8000/api/sessions/$SESSION/summary
```

---

#### Recipe 6: Build and Run a Workflow

Workflows chain multiple agent steps together.

### Create a Workflow

```bash
curl -H "X-API-Key: $YOUR_API_KEY" -X POST http://localhost:8000/api/workflows \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Daily AI News Digest",
    "description": "Research, analyze, and summarize daily AI news",
    "steps": [
      {
        "id": "research",
        "agent": "gemini",
        "prompt": "Search for and summarize the top 5 AI news stories from today. Focus on model releases, industry shifts, and notable research papers.",
        "skills": ["web_search"],
        "order": 0
      },
      {
        "id": "analysis",
        "agent": "claude",
        "prompt": "Read the research output and write a concise executive briefing. Highlight market implications and technical significance. Format as markdown.",
        "skills": [],
        "order": 1
      }
    ],
    "config": {
      "timeout_per_step": 7200,
      "stop_on_failure": true
    }
  }'
```

### Run the Workflow

```bash
### Option 1: New session (auto-created)
WORKFLOW_ID="your-workflow-id"
curl -H "X-API-Key: $YOUR_API_KEY" -X POST "http://localhost:8000/api/workflows/$WORKFLOW_ID/run" \
  -d '{"session_title": "AI News — April 11"}'

### Option 2: In existing session
curl -H "X-API-Key: $YOUR_API_KEY" -X POST "http://localhost:8000/api/sessions/$SESSION/run-workflow" \
  -d "{\"workflow_id\": \"$WORKFLOW_ID\"}"
```

### Monitor Execution

```bash
### Check run status
RUN_ID="your-run-id"
curl -H "X-API-Key: $YOUR_API_KEY" "http://localhost:8000/api/workflow-runs/$RUN_ID"

### View the session messages (workflow output appears here)
curl -H "X-API-Key: $YOUR_API_KEY" "http://localhost:8000/api/sessions/$SESSION/messages" | python3 -m json.tool

### Cancel a running workflow
curl -H "X-API-Key: $YOUR_API_KEY" -X POST "http://localhost:8000/api/workflow-runs/$RUN_ID/cancel"
```

---

#### Recipe 6.5: Schedule a Workflow

You can automate workflow execution using standard cron expressions. Behind the scenes, `apscheduler` manages the recurring runs.

### Create a Scheduled Job

```bash
curl -H "X-API-Key: $YOUR_API_KEY" -X POST http://localhost:8000/api/scheduled-jobs \
  -H "Content-Type: application/json" \
  -d '{
    "workflow_id": "'"$WORKFLOW_ID"'",
    "cron_expr": "0 8 * * *",
    "input_prompt": "Run the daily brief"
  }'
```

*The example above `0 8 * * *` will trigger the workflow every day at 08:00 AM server time.*

### View Active Jobs

```bash
curl -H "X-API-Key: $YOUR_API_KEY" http://localhost:8000/api/scheduled-jobs | python3 -m json.tool
```

### Cancel a Job

```bash
JOB_ID="job_id_returned_from_creation"
curl -H "X-API-Key: $YOUR_API_KEY" -X DELETE "http://localhost:8000/api/scheduled-jobs/$JOB_ID"
```

---

#### Recipe 7: Cross-Session Context Sharing

Link sessions to share context — the agent in one session can access knowledge from another.

### Link Two Sessions

```bash
### You have two sessions: a research session and an analysis session
RESEARCH_SESSION="sess_research_123"
ANALYSIS_SESSION="sess_analysis_456"

### Link: analysis session references research session
curl -H "X-API-Key: $YOUR_API_KEY" -X POST "http://localhost:8000/api/sessions/$ANALYSIS_SESSION/context-links" \
  -H "Content-Type: application/json" \
  -d "{
    \"target_session_id\": \"$RESEARCH_SESSION\",
    \"link_type\": \"reference\",
    \"label\": \"Research data source\",
    \"max_messages\": 50
  }"
```

### Verify the Link

```bash
### Check context links
curl -H "X-API-Key: $YOUR_API_KEY" "http://localhost:8000/api/sessions/$ANALYSIS_SESSION/context-links" | python3 -m json.tool

### View linked messages
curl -H "X-API-Key: $YOUR_API_KEY" "http://localhost:8000/api/sessions/$ANALYSIS_SESSION/linked-messages" | python3 -m json.tool
```

### Use Shared Context in Agent Invocations

```bash
### The shared context endpoint merges linked session data:
curl -H "X-API-Key: $YOUR_API_KEY" "http://localhost:8000/api/brain/$ANALYSIS_SESSION/context/shared?agent=gemini" \
  | python3 -c "
import sys, json
ctx = json.load(sys.stdin)
print(f'Strategy: {ctx[\"strategy\"]}')
print(f'Linked sessions: {ctx[\"linked_sessions\"]}')
print(f'Linked events: {len(ctx[\"linked_context\"])}')
print(f'Total tokens: {ctx[\"estimated_tokens\"]}')
"
```

When the agent runs in the analysis session, it automatically sees context from the research session, prefixed with provenance labels:

```
[Context from 'Research Session'] (agent): Here's what I found about AI chip markets...
[Context from 'Research Session'] (user): Now search for NVIDIA earnings...
```

### Remove a Link

```bash
LINK_ID="bd020e346889462a"
curl -H "X-API-Key: $YOUR_API_KEY" -X DELETE "http://localhost:8000/api/context-links/$LINK_ID"
```

---

#### Recipe 8: Fork a Session

Create a branch of an existing session — copies recent messages and creates an automatic link.

### Fork with Message History

```bash
### Fork with the last 10 messages
curl -H "X-API-Key: $YOUR_API_KEY" -X POST "http://localhost:8000/api/sessions/$SESSION/fork" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Exploration Branch: Alternative Approach",
    "copy_messages": 10
  }'
```

The forked session:
1. Gets a new, isolated workspace
2. Contains the last 10 messages from the parent
3. Has a `fork` link back to the parent session
4. Can continue independently without affecting the parent

### Practical Use Case: Hypothesis Testing

```bash
### Original session: researching a topic
### Fork to try a different angle
FORK=$(curl -H "X-API-Key: $YOUR_API_KEY" -s -X POST "http://localhost:8000/api/sessions/$SESSION/fork" \
  -d '{"title": "Alt approach: ML-based", "copy_messages": 5}' \
  | python3 -c "import sys,json; print(json.load(sys.stdin)['id'])")

### Now execute in the fork — it has context from the parent
### but changes here don't affect the original session
```

---

#### Recipe 9: Use the Brain Inspector

The Brain Inspector provides deep visibility into session internals.

### Get Session Events (Event Log)

```bash
### All events
curl -H "X-API-Key: $YOUR_API_KEY" "http://localhost:8000/api/sessions/$SESSION/events"

### Filtered by type
curl -H "X-API-Key: $YOUR_API_KEY" "http://localhost:8000/api/sessions/$SESSION/events?event_types=message.user,message.agent"

### Since a specific event
curl -H "X-API-Key: $YOUR_API_KEY" "http://localhost:8000/api/sessions/$SESSION/events?since_id=42"
```

### Context Utilization

```bash
### How much context budget is used?
curl -H "X-API-Key: $YOUR_API_KEY" "http://localhost:8000/api/brain/$SESSION/context/stats?agent=gemini" \
  | python3 -c "
import sys, json
stats = json.load(sys.stdin)
print(f'Events: {stats[\"total_events\"]}')
print(f'Tokens: {stats[\"estimated_tokens\"]:,}')
print(f'Budget: {stats[\"budget\"]:,}')
print(f'Utilization: {stats[\"utilization\"]:.1%}')
print(f'Needs compaction: {stats[\"needs_compaction\"]}')
print(f'Recommended strategy: {stats[\"strategy_if_built\"]}')
"
```

### Time-Travel Debugging

```bash
### "What happened before event #42?"
curl -H "X-API-Key: $YOUR_API_KEY" "http://localhost:8000/api/brain/$SESSION/context/rewind?before_event_id=42&count=10"
```

### Harness Configuration

```bash
### View all agent harness configs
curl -H "X-API-Key: $YOUR_API_KEY" http://localhost:8000/api/harnesses | python3 -m json.tool

### View specific agent
curl -H "X-API-Key: $YOUR_API_KEY" http://localhost:8000/api/harnesses/gemini
```

---

#### Recipe 10: File Upload and Workspace Management

### Upload Files to a Session

```bash
### Upload a document
curl -H "X-API-Key: $YOUR_API_KEY" -X POST "http://localhost:8000/api/upload/$SESSION" \
  -F "file=@/path/to/document.pdf"

### Upload multiple files
for f in *.py; do
  curl -H "X-API-Key: $YOUR_API_KEY" -X POST "http://localhost:8000/api/upload/$SESSION" \
    -F "file=@$f"
done
```

### Browse Session Workspace

```bash
### List all files
curl -H "X-API-Key: $YOUR_API_KEY" "http://localhost:8000/api/sessions/$SESSION/files" | python3 -m json.tool

### Read a specific file
curl -H "X-API-Key: $YOUR_API_KEY" "http://localhost:8000/api/sessions/$SESSION/workspace/read?path=output.py"

### Full workspace tree
curl -H "X-API-Key: $YOUR_API_KEY" "http://localhost:8000/api/sessions/$SESSION/workspace" | python3 -m json.tool
```

---

#### Recipe 11: Generate Daily Reports

### Auto-Generate a Report

```bash
### Generate today's report using Gemini
curl -H "X-API-Key: $YOUR_API_KEY" -X POST http://localhost:8000/api/reports/generate \
  -H "Content-Type: application/json" \
  -d '{"agent": "gemini"}'

### Generate report for a specific date
curl -H "X-API-Key: $YOUR_API_KEY" -X POST http://localhost:8000/api/reports/generate \
  -d '{"date": "2026-04-10", "days": 1, "agent": "gemini"}'

### Generate a 7-day summary
curl -H "X-API-Key: $YOUR_API_KEY" -X POST http://localhost:8000/api/reports/generate \
  -d '{"days": 7, "agent": "claude"}'
```

### Browse Reports

```bash
### List all saved reports
curl -H "X-API-Key: $YOUR_API_KEY" http://localhost:8000/api/reports

### Get report by date
curl -H "X-API-Key: $YOUR_API_KEY" http://localhost:8000/api/reports/date/2026-04-10

### Raw daily stats (without AI narrative)
curl -H "X-API-Key: $YOUR_API_KEY" "http://localhost:8000/api/reports/daily?date=2026-04-10"
```

---

#### Recipe 12: Agent Health Monitoring

### Check All Agents

```bash
curl -H "X-API-Key: $YOUR_API_KEY" http://localhost:8000/api/agents | python3 -c "
import sys, json
agents = json.load(sys.stdin)
for a in agents:
    status = '✅' if a.get('available', False) else '❌'
    print(f'{status} {a[\"name\"]:10} type={a.get(\"type\",\"?\")}')
"
```

### Health Check

```bash
curl -H "X-API-Key: $YOUR_API_KEY" http://localhost:8000/api/hands/health
```

### Discover Ollama Models

```bash
curl -H "X-API-Key: $YOUR_API_KEY" http://localhost:8000/models/ollama | python3 -c "
import sys, json
data = json.load(sys.stdin)
for m in data.get('models', []):
    print(f'  {m[\"name\"]:30} {m.get(\"size\",\"\")}')
"
```

---

#### Recipe 13: Context Engine Debugging

### Compare Context Strategies

```python
import requests

session_id = "your-session-id"

### Try different agents (each has different context budgets)
for agent in ["gemini", "claude", "codex"]:
    stats = requests.get(
        f"http://localhost:8000/api/brain/{session_id}/context/stats",
        params={"agent": agent}
    ).json()
    
    print(f"
{agent}:")
    print(f"  Budget:      {stats['budget']:>10,} tokens")
    print(f"  Used:        {stats['estimated_tokens']:>10,} tokens")
    print(f"  Utilization: {stats['utilization']:>9.1%}")
    print(f"  Strategy:    {stats['strategy_if_built']}")
```

### Inspect Shared Context

```python
import requests

session_id = "your-session-id"

### Regular context vs shared context
regular = requests.get(
    f"http://localhost:8000/api/brain/{session_id}/context?agent=gemini"
).json()

shared = requests.get(
    f"http://localhost:8000/api/brain/{session_id}/context/shared?agent=gemini"
).json()

print(f"Regular: {regular['included_events']} events, {regular['estimated_tokens']} tokens")
print(f"Shared:  {len(shared.get('events',[]))} events, {shared['estimated_tokens']} tokens")
print(f"Linked:  {shared.get('linked_sessions', 0)} sessions, {len(shared.get('linked_context',[]))} events")
```

---

#### Recipe 14: Build a Custom Integration

### Minimal Python SDK

```python
"""Minimal Agent Route client."""
import requests
import json

class AgentRouteClient:
    def __init__(self, base_url="http://localhost:8000"):
        self.base = base_url
    
    def execute(self, agent: str, prompt: str, **kwargs) -> dict:
        """Synchronous execution."""
        return requests.post(f"{self.base}/execute", json={
            "client": agent, "prompt": prompt, **kwargs
        }).json()
    
    def stream(self, agent: str, prompt: str, **kwargs):
        """Streaming execution — yields chunks."""
        resp = requests.post(f"{self.base}/execute/stream", json={
            "client": agent, "prompt": prompt, **kwargs
        }, stream=True)
        for line in resp.iter_lines():
            if line:
                yield json.loads(line)
    
    def create_session(self, title="New Session", agent_type="gemini") -> dict:
        return requests.post(f"{self.base}/api/sessions", json={
            "title": title, "agent_type": agent_type
        }).json()
    
    def multi_agent(self, agents: list, prompt: str, strategy="all") -> dict:
        return requests.post(f"{self.base}/api/multi-agent/run", json={
            "agents": agents, "prompt": prompt, "strategy": strategy
        }).json()
    
    def link_sessions(self, source_id: str, target_id: str, link_type="reference"):
        return requests.post(
            f"{self.base}/api/sessions/{source_id}/context-links",
            json={"target_session_id": target_id, "link_type": link_type}
        ).json()
    
    def fork_session(self, session_id: str, title: str, copy_messages=10):
        return requests.post(
            f"{self.base}/api/sessions/{session_id}/fork",
            json={"title": title, "copy_messages": copy_messages}
        ).json()

### Usage:
client = AgentRouteClient()
result = client.execute("gemini", "Write hello world in Rust")
print(result["output"])
```

### Minimal JavaScript/TypeScript SDK

```typescript
class AgentRouteClient {
  constructor(private baseUrl = "http://localhost:8000") {}

  async execute(agent: string, prompt: string): Promise<{ exitCode: number; output: string }> {
    const res = await fetch(`${this.baseUrl}/execute`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ client: agent, prompt }),
    });
    return res.json();
  }

  async *stream(agent: string, prompt: string): AsyncGenerator<any> {
    const res = await fetch(`${this.baseUrl}/execute/stream`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ client: agent, prompt }),
    });
    const reader = res.body!.getReader();
    const decoder = new TextDecoder();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      for (const line of decoder.decode(value).split("
").filter(Boolean)) {
        yield JSON.parse(line);
      }
    }
  }

  createSession(title = "New Session", agentType = "gemini") {
    return fetch(`${this.baseUrl}/api/sessions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title, agent_type: agentType }),
    }).then(r => r.json());
  }

  connectWebSocket(): WebSocket {
    return new WebSocket(`ws://${new URL(this.baseUrl).host}/ws/agent`);
  }
}
```

---

#### Troubleshooting

### Agent Not Found

```
{"detail": "No hand registered for 'gemini'"}
```

**Fix:** Check `.env` file has the agent enabled:
```env
ENABLE_GEMINI_CLI=true
```

Also verify the CLI tool is installed and authenticated:
```bash
which gemini      # Should show a path
gemini --version  # Should work
```

### WebSocket Disconnections

The WebSocket drainer task restarts on reconnection. Running tasks are NOT affected by disconnections — they continue in the background.

### Context Window Too Large

If you see slow responses or truncation:

```bash
### Check context utilization
curl -H "X-API-Key: $YOUR_API_KEY" "http://localhost:8000/api/brain/$SESSION/context/stats?agent=gemini"
```

If utilization is > 80%, the context engine will auto-compact. You can also:
- Create a checkpoint: `POST /api/sessions/$SESSION/checkpoint`
- Fork the session with fewer messages: `POST /api/sessions/$SESSION/fork`

### Workflow Stuck

```bash
### Check run status
curl -H "X-API-Key: $YOUR_API_KEY" "http://localhost:8000/api/workflow-runs/$RUN_ID"

### Cancel if needed
curl -H "X-API-Key: $YOUR_API_KEY" -X POST "http://localhost:8000/api/workflow-runs/$RUN_ID/cancel"
```

### Port Already in Use

```bash
### Kill existing processes
lsof -ti:8000 | xargs kill -9   # Backend
lsof -ti:5173 | xargs kill -9   # Frontend
```


---

## 📚 Workflow Guide

### Workflow API — Best Practices & Complete Guide

> Build reliable, multi-agent orchestration pipelines via the Agent Route API Bridge.

#### Table of Contents

- [Overview](#overview)
- [Step Schema Reference](#step-schema-reference)
- [DAG Execution & Edges](#dag-execution--edges)
- [I/O Ports & Data Flow](#io-ports--data-flow)
- [Sub-Workflows](#sub-workflows)
- [Variable System](#variable-system)
- [Conditional Branching](#conditional-branching)
- [Visual DAG Canvas](#visual-dag-canvas)
- [Quick Start](#quick-start)
- [Creating Workflows via API](#creating-workflows-via-api)
- [Running Workflows](#running-workflows)
- [Monitoring & Observability](#monitoring--observability)
- [Best Practices](#best-practices)
- [Real-World Templates](#real-world-templates)
- [Troubleshooting](#troubleshooting)
- [API Reference](#api-reference)

---

#### Overview

Workflows are multi-step agent pipelines where each step runs a specific AI agent
with a defined prompt. The system supports **two execution modes**:

1. **DAG Mode** — When edges exist between steps, the executor uses **topological sorting**
   (Kahn's algorithm) to determine execution order. Steps share data through I/O ports.
2. **Linear Mode** — When no edges exist, steps execute sequentially in array order,
   sharing a session workspace for data continuity via files.

```
  DAG Mode (with edges)                    Linear Mode (no edges)
  ─────────────────────                    ──────────────────────

  ┌─────────┐                              ┌─────────┐
  │ Step 1  │                              │ Step 1  │
  │ gemini  │──┐                           │ gemini  │
  │ research│  │                           └────┬────┘
  └─────────┘  │                                │
               ▼                                ▼
  ┌─────────┐  ┌─────────┐                 ┌─────────┐
  │ Step 2  │  │ Step 3  │                 │ Step 2  │
  │ claude  │  │ ollama  │                 │ claude  │
  │ analyze │  │ enrich  │                 └────┬────┘
  └────┬────┘  └────┬────┘                      │
       │            │                           ▼
       └──────┬─────┘                      ┌─────────┐
              ▼                            │ Step 3  │
         ┌─────────┐                       │ gemini  │
         │ Step 4  │                       └─────────┘
         │ gemini  │
         │ report  │
         └─────────┘

         Shared Context                    Shared Workspace
         (port-based I/O)                  (session files)
```

### Key Concepts

| Concept | Description |
|---------|-------------|
| **Workflow** | A saved pipeline definition (name, steps, edges, positions, variables, config) |
| **Step** | One agent execution unit within a workflow |
| **Edge** | A directed connection between two steps, defining data flow in DAG mode |
| **I/O Port** | Named input/output connectors on each step for structured data passing |
| **Variable** | A named placeholder (`${VAR_NAME}`) substituted in step prompts at run time |
| **Run** | A single execution instance of a workflow |
| **Session** | The execution context; holds messages, workspace files, and history |
| **Workspace** | A directory on disk shared across all steps in a run |
| **Sub-Workflow** | A step that recursively executes another workflow |

---

#### Step Schema Reference

Each step in a workflow accepts the following fields:

```jsonc
{
  // Required
  "id": "step_unique_id",        // Unique ID for this step (used in logs & results)
  "agent": "gemini",             // Agent: gemini | claude | codex | ollama | sub_workflow
  "prompt": "Your task prompt",  // The instruction for this step

  // Optional
  "name": "Human-readable name", // Display name (falls back to id)
  "skills": ["web_search"],      // Skills to activate for this agent
  "input_files": [],             // Files to pre-load (relative to workspace)
  "order": 0,                    // Explicit ordering for linear mode (0-indexed)

  // I/O Ports (DAG mode)
  "inputs": [                    // Input ports — receive data from parent steps
    { "id": "input", "label": "Input", "type": "context" }
  ],
  "outputs": [                   // Output ports — send data to child steps
    { "id": "output", "label": "Output", "type": "text" }
  ],

  // Sub-workflow (when agent = "sub_workflow")
  "sub_workflow_id": "wf_abc",   // ID of the workflow to execute recursively

  // Branching
  "condition": {                 // Conditional branching (see section below)
    "type": "always",            //   Condition type
    "value": "",                 //   Comparison value
    "on_false": "skip",          //   Action when condition fails: skip | goto | stop
    "goto_step": ""              //   Target step ID (only for goto)
  },
  "config": {                    // Per-step configuration
    "timeout": 3600,             //   Timeout in seconds (default: 3600)
    "continue_on_error": false   //   Continue workflow if this step fails
  }
}
```

### Field Naming Convention

The API uses **snake_case** (`input_files`). The frontend UI uses **camelCase**
(`inputFiles`). Both are accepted by the backend and frontend — normalization
happens automatically.

| API (snake_case) | Frontend (camelCase) | Description |
|------------------|---------------------|-------------|
| `input_files` | `inputFiles` | Files to include |
| `continue_on_error` | `continue_on_error` | Same in both |
| `timeout` | `timeout` | Same in both |

### Available Agents

| Agent | ID | Best For | Skills Available |
|-------|----|----------|-----------------|
| Gemini CLI | `gemini` | Code generation, web search, tool use | `web_search`, custom skills |
| Claude Code | `claude` | Reasoning, analysis, review | `web_search` |
| Codex | `codex` | Code completion, refactoring | — |
| Ollama | `ollama` | Local LLM tasks, privacy-sensitive | — |
| MFLUX | `mflux` | Image generation | — |
| Sub-Workflow | `sub_workflow` | Nesting workflows recursively | — |

---

#### DAG Execution & Edges

When a workflow has **edges**, the executor automatically switches to DAG mode
with **level-based parallel execution**. Steps are grouped into topological
levels, and all steps within a level execute concurrently via `asyncio.gather()`.

### Edge Schema

```jsonc
{
  "id": "edge_abc",              // Unique edge ID
  "source": "step_1_id",         // Source step ID
  "target": "step_2_id",         // Target step ID
  "sourceHandle": "output",      // Source port (matches step.outputs[].id)
  "targetHandle": "input",       // Target port (matches step.inputs[].id)
  "condition": {                 // Optional: conditional edge
    "type": "if_output_contains",
    "value": "risk"
  }
}
```

### Execution Behavior

| Mode | Trigger | Execution Order | Parallelism | Data Sharing |
|------|---------|----------------|-------------|--------------|
| **DAG** | `edges` array is non-empty | Topological levels | Steps within same level run concurrently | Port-based context + shared workspace |
| **Linear** | No edges exist | Array order (by `order` field) | Sequential only | Shared workspace files only |

### Parallel Execution Model

Steps are grouped into **topological levels** using a modified Kahn's algorithm.
Steps at the same level have no mutual dependencies — they can run concurrently.

```
Level 1 (parallel):    [Step A]   [Step B]   [Step C]
                            \        |        /
Level 2 (parallel):    [Step D]   [Step E]
                            \        /
Level 3 (sequential):     [Step F]
```

Execution flow per level:
1. **Fan-out**: `asyncio.gather()` starts all steps in the level simultaneously
2. **Execute**: Each step resolves parent outputs, evaluates conditions, runs via Hand
3. **Fan-in**: Collect all results, store outputs in shared context dict
4. **Gate**: Check for failures → proceed to next level or abort

The `executing_steps` field in the run record tracks which step IDs are currently
active, enabling the frontend to animate multiple nodes simultaneously.

### Concurrency Safety

Parallel execution is safe because:
- **Context reads are from prior levels** — parents always complete before children
- **Workspace is shared** — file I/O may overlap; use unique filenames per step
- **Session messages are append-only** — concurrent `add_message()` calls are safe
- **Results are collected post-gather** — no concurrent writes to the results list

### Cycle Detection

The executor validates the graph **before execution**. If a cycle is detected:
- The run immediately fails with a descriptive error
- The UI highlights cycle-involved nodes with red pulsing borders
- Invalid connections are prevented client-side with instant feedback

### Input Resolution (DAG Mode)

When a step has parent edges, the executor automatically resolves parent outputs
into the child step's context:

```
Step A (output: "Research findings...")
    │
    │ edge: A.output → B.input
    ▼
Step B receives:
  context["step_a_output"] = "Research findings..."
  Effective prompt = original_prompt + "

## Input from Step A
" + parent_output
```

### Persisting Edges & Positions

Edges and node positions are stored alongside the workflow:

```json
{
  "name": "My DAG Workflow",
  "steps": [...],
  "edges": [...],
  "positions": {
    "step_1_id": { "x": 100, "y": 200 },
    "step_2_id": { "x": 400, "y": 200 }
  }
}
```

The `edges_json` and `positions_json` columns in the SQLite `workflows` table
store this data, with auto-migration for existing databases.

---

#### I/O Ports & Data Flow

Each step has **input** and **output** ports that define its data interface:

```
                    ┌─────────────────────┐
     input port ──▶ │      Step Node      │ ──▶ output port
   (type: context)  │  agent: gemini      │   (type: text)
                    │  prompt: "..."       │
                    └─────────────────────┘
```

### Port Schema

```jsonc
{
  "id": "input",         // Port identifier (unique within step)
  "label": "Input",      // Display label
  "type": "context"      // Data type: context | text | file | json
}
```

### Port Types

| Type | Description | Edge Label |
|------|-------------|------------|
| `context` | General context data (default input) | — |
| `text` | Plain text output | `text` |
| `file` | File reference | `file` |
| `json` | Structured JSON data | `json` |

### Default Ports

Every step gets default ports if none are specified:
- **Input**: `{ id: "input", label: "Input", type: "context" }`
- **Output**: `{ id: "output", label: "Output", type: "text" }`

---

#### Sub-Workflows

A step with `agent: "sub_workflow"` recursively executes another workflow.
This enables modular pipeline composition.

```json
{
  "id": "run_analysis",
  "agent": "sub_workflow",
  "sub_workflow_id": "wf_stock_analysis",
  "prompt": "Run the stock analysis pipeline for NVDA",
  "name": "Stock Analysis Sub-Flow"
}
```

### Behavior

1. The executor loads the referenced workflow by `sub_workflow_id`
2. A new `WorkflowExecutor` instance runs the child workflow **in the same session**
3. All child steps share the parent's workspace and context
4. The sub-workflow result is stored as the parent step's output
5. The child workflow's edges/positions are respected (DAG or linear)

### Canvas UI

Sub-workflow steps appear as special nodes in the canvas with a distinct icon.
Use the **Sub-Flow** button in the toolbar to add one.

---

#### Variable System

Workflow variables enable **template-style reuse** — define a workflow once, run it
with different parameters each time. Variables use `${VAR_NAME}` syntax in step
prompts and are substituted at run time.

```
┌──────────────────────────┐     ┌───────────────────────────┐
│ Workflow Definition      │     │ Run Request               │
│                          │     │                           │
│ variables: [             │     │ variables: {              │
│   {name: "TICKER",       │ ──▶ │   "TICKER": "AAPL",       │
│    default: "NVDA"}      │     │   "DATE": "2026-04-12"    │
│ ]                        │     │ }                         │
│                          │     │                           │
│ prompt: "Analyze         │     │ Effective prompt:         │
│   ${TICKER} as of        │ ──▶ │ "Analyze AAPL as of       │
│   ${DATE}"               │     │   2026-04-12"             │
└──────────────────────────┘     └───────────────────────────┘
```

### Variable Definition Schema

Each variable in the `variables` array accepts:

```jsonc
{
  "name": "TICKER",           // Used as ${TICKER} in prompts (UPPER_SNAKE_CASE)
  "label": "Stock Ticker",    // Human-readable label shown in UI
  "type": "string",           // string | number | text (multiline)
  "default": "NVDA",          // Default value (used if not overridden at run time)
  "required": true            // Whether the variable must be set at run time
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | string | ✅ | Variable name — used as `${NAME}` in prompts. Convention: `UPPER_SNAKE_CASE`. |
| `label` | string | ❌ | Human-readable label for the UI. Falls back to `name`. |
| `type` | string | ❌ | Input type: `string` (single line), `number`, or `text` (multiline). Default: `string`. |
| `default` | string | ❌ | Default value used when the variable is not overridden at run time. |
| `required` | boolean | ❌ | If `true`, the variable must be provided. Default: `false`. |

### Substitution Rules

1. **Syntax**: Both `${VAR_NAME}` and `$VAR_NAME` are supported.
2. **Scope**: Variables are substituted in **every step's prompt**, not just the first.
3. **Unresolved**: Variables not found in the resolved set are left as-is (no error).
4. **Resolution order**: Run-time override → default value → empty string (if required).

### Quick Variable Example

```bash
### Create a template workflow with variables
curl -H "X-API-Key: $YOUR_API_KEY" -X POST http://localhost:8000/api/workflows \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Stock Analysis: ${TICKER}",
    "description": "Parameterized equity research",
    "variables": [
      {"name": "TICKER", "label": "Stock Ticker", "type": "string", "default": "NVDA", "required": true},
      {"name": "FOCUS", "label": "Analysis Focus", "type": "text", "default": "overall business"}
    ],
    "steps": [
      {
        "id": "research",
        "agent": "gemini",
        "prompt": "Research ${TICKER} focusing on ${FOCUS}. Save to ${TICKER}_research.md",
        "skills": ["web_search"]
      },
      {
        "id": "report",
        "agent": "gemini",
        "prompt": "Read ${TICKER}_research.md. Write a summary report. Save to ${TICKER}_report.md"
      }
    ]
  }'

### Run with overrides
curl -H "X-API-Key: $YOUR_API_KEY" -X POST "http://localhost:8000/api/workflows/$WORKFLOW_ID/run" \
  -H "Content-Type: application/json" \
  -d '{
    "session_title": "AAPL AI Strategy",
    "variables": {"TICKER": "AAPL", "FOCUS": "AI and machine learning initiatives"}
  }'
```

---

#### Conditional Branching

Steps can include a `condition` field that controls whether they execute based
on the previous step's output, exit code, or workspace state. This enables
if-then-else logic in linear pipelines.

```
┌───────────┐     ┌─────────────────────────┐     ┌───────────┐
│  Step 1   │ ──▶ │  Step 2 (conditional)    │ ──▶ │  Step 3   │
│ research  │     │                         │     │  report   │
└───────────┘     │  condition:             │     └───────────┘
                  │    if output contains   │
                  │    "risk" → RUN          │
                  │    else  → SKIP          │
                  └─────────────────────────┘
```

### Condition Schema

```jsonc
{
  "condition": {
    "type": "if_output_contains",  // Condition type (see table below)
    "value": "risk",               // Comparison value
    "on_false": "skip",            // What to do when condition fails
    "goto_step": "step_id"         // Target step ID (only used with goto)
  }
}
```

### Condition Types

| Type | Evaluates | Value | Example |
|------|-----------|-------|---------|
| `always` | Always runs (default) | — | Default behavior |
| `if_output_contains` | Previous step output contains value | Search string (case-insensitive) | `"risk"`, `"error"`, `"PASS"` |
| `if_output_not_contains` | Previous step output does NOT contain value | Search string (case-insensitive) | `"failure"` |
| `if_exit_code` | Previous step exit code equals value | Integer as string | `"0"` (success), `"1"` (failure) |
| `if_file_exists` | File exists in workspace | Filename | `"report.md"`, `"data.csv"` |

### On-False Actions

When a condition evaluates to `false`, the `on_false` field determines what happens:

| Action | Behavior |
|--------|----------|
| `skip` | Skip this step, continue to next (default) |
| `goto` | Jump forward to the step specified by `goto_step` |
| `stop` | Stop the entire workflow (status: completed) |

> **Note:** `goto` only jumps **forward**. Backward jumps are ignored to prevent infinite loops.

### Examples

#### Skip a step based on output content

```json
{
  "id": "risk_analysis",
  "agent": "claude",
  "prompt": "Analyze risks found in research.md",
  "condition": {
    "type": "if_output_contains",
    "value": "risk",
    "on_false": "skip"
  }
}
```

#### Branch to a different step on failure

```json
[
  {
    "id": "validate",
    "agent": "gemini",
    "prompt": "Validate data.csv format and completeness"
  },
  {
    "id": "process_valid",
    "agent": "gemini",
    "prompt": "Process validated data",
    "condition": {
      "type": "if_exit_code",
      "value": "0",
      "on_false": "goto",
      "goto_step": "handle_invalid"
    }
  },
  {
    "id": "handle_invalid",
    "agent": "gemini",
    "prompt": "Data was invalid. Generate an error report.",
    "condition": {
      "type": "if_exit_code",
      "value": "1",
      "on_false": "skip"
    }
  }
]
```

#### Stop workflow early if condition not met

```json
{
  "id": "gate_check",
  "agent": "gemini",
  "prompt": "Check if report.md meets quality standards",
  "condition": {
    "type": "if_file_exists",
    "value": "report.md",
    "on_false": "stop"
  }
}
```

#### Conditional with variables

Variables and conditions work together:

```json
{
  "id": "deep_dive",
  "agent": "claude",
  "prompt": "Perform deep analysis of ${TICKER}",
  "condition": {
    "type": "if_output_contains",
    "value": "high risk",
    "on_false": "skip"
  }
}
```

---

#### Visual DAG Canvas

The workflow editor features a **ReactFlow-based visual canvas** for building
and monitoring DAG workflows. Toggle between Canvas and List views using the
view switcher in the toolbar.

### Canvas Layout

```
┌──────────────────────────────────────────────────────────────┐
│  [← Back]  Workflow Name              [🔍] [📊] [💾 Save] [▶ Run] │
├──────┬───────────────────────────────────────┬───────────────┤
│      │                                       │               │
│ Tool │      ReactFlow Canvas                 │  Step Detail  │
│ bar  │                                       │  Panel        │
│      │   [node] ──▶ [node] ──▶ [node]       │               │
│ Add  │       └──▶ [node (conditional)]       │  • Name       │
│ Step │                                       │  • Agent      │
│      │                                       │  • Prompt     │
│ Add  │   ┌──────────────────┐               │  • I/O Ports  │
│ Sub  │   │  DAG Info Panel  │               │  • Context    │
│      │   │  Nodes: 7        │               │    Inspector  │
│ Auto │   │  Edges: 5        │               │  • Condition  │
│ Layout   │  Mode: DAG       │               │  • Config     │
│      │   │  ✓ Valid DAG     │               │               │
├──────┴───┴──────────────────┴───────────────┴───────────────┤
│ Variables Panel                                              │
└──────────────────────────────────────────────────────────────┘
```

### Toolbar Actions

| Action | Description |
|--------|-------------|
| **Add Agent Node** | Click Gemini/Claude/Codex/Ollama/MFLUX to drop a new step |
| **Add Sub-Flow** | Opens a workflow selector to create a sub-workflow step |
| **Auto Layout** | Rearranges nodes using a dagre-style algorithm |

### DAG Info Panel

Displays real-time graph metadata:

- **Nodes**: Total step count
- **Edges**: Total connection count
- **Mode**: DAG (edges present) or Linear (no edges)
- **Validation**: ✓ Valid DAG or ⚠ Cycle detected
- **Execution progress**: Shows step completion bar during runs

### Context Inspector

Available in the Step Detail Panel, the Context Inspector shows:

1. **Incoming Data**: Lists parent nodes and their output data
2. **This Step's Output**: Preview of the step's execution result with copy-to-clipboard
3. **Downstream**: Lists child nodes that receive this step's output

### Execution Animations

During workflow execution, the canvas provides visual feedback:

| Animation | Trigger |
|-----------|---------|
| **Pulsing indigo border** | Step is currently executing |
| **Shimmer progress bar** | Active step progress indicator |
| **Green glow + ✓ icon** | Step completed successfully |
| **Red glow + ✕ icon** | Step failed |
| **Animated edge dashes** | Data flowing between executing steps |
| **Activity label** | Shows "Running..." on active nodes |

### Connecting Nodes

1. Drag from an **output handle** (right side of a node) to an **input handle** (left side)
2. The system validates the connection in real-time
3. If the connection would create a cycle, it's **rejected** with a toast message
4. Edge labels automatically show the data type (text, file, json)

---

#### Quick Start

### Minimal Workflow (2 steps)

```bash
curl -H "X-API-Key: $YOUR_API_KEY" -X POST http://localhost:8000/api/workflows \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Simple Research",
    "description": "Research and summarize a topic",
    "steps": [
      {
        "id": "research",
        "agent": "gemini",
        "prompt": "Research the latest developments in quantum computing. Save findings to research.md",
        "skills": ["web_search"]
      },
      {
        "id": "summarize",
        "agent": "gemini",
        "prompt": "Read research.md and write a 200-word executive summary. Save to summary.md"
      }
    ]
  }'
```

### Run it

```bash
### Extract the workflow ID from the response
WORKFLOW_ID="<id-from-above>"

curl -H "X-API-Key: $YOUR_API_KEY" -X POST "http://localhost:8000/api/workflows/$WORKFLOW_ID/run" \
  -H "Content-Type: application/json" \
  -d '{"session_title": "Quantum Computing Research"}'
```

---

#### Creating Workflows via API

### Python Client

```python
import requests

API = "http://localhost:8000"

def create_workflow(name: str, description: str, steps: list,
                    variables: list = None, config: dict = None):
    """Create a workflow via the API."""
    response = requests.post(f"{API}/api/workflows", json={
        "name": name,
        "description": description,
        "steps": steps,
        "variables": variables or [],
        "config": config or {},
    })
    response.raise_for_status()
    return response.json()


### Example: Parameterized multi-agent stock research workflow
workflow = create_workflow(
    name="深度研究: ${TICKER}",
    description="Comprehensive equity analysis pipeline with variables",
    variables=[
        {"name": "TICKER", "label": "Stock Ticker", "type": "string", "default": "NVDA", "required": True},
        {"name": "DEPTH", "label": "Analysis Depth", "type": "string", "default": "300 words"},
    ],
    steps=[
        {
            "id": "01_overview",
            "agent": "gemini",
            "prompt": (
                "# Role: Equity Research Analyst

"
                "Research ${TICKER} company overview: business model, revenue segments, "
                "competitive advantages. Keep under ${DEPTH}.

"
                "# Output
Save to ${TICKER}_01_overview.md"
            ),
            "skills": ["web_search"],
            "input_files": [],
            "order": 0,
        },
        {
            "id": "02_financials",
            "agent": "gemini",
            "prompt": (
                "# Role: Financial Analyst

"
                "Read ${TICKER}_01_overview.md for context. Analyze ${TICKER}'s latest "
                "quarterly financials: revenue, margins, guidance. Under ${DEPTH}.

"
                "# Output
Save to ${TICKER}_02_financials.md"
            ),
            "skills": ["web_search"],
            "input_files": [],
            "order": 1,
        },
        {
            "id": "03_risk",
            "agent": "claude",
            "prompt": (
                "# Role: Risk Analyst

"
                "Read all ${TICKER}_*.md files. Identify top 5 risks for ${TICKER}. "
                "Score severity 1-10.

"
                "# Output
Save to ${TICKER}_03_risks.md"
            ),
            "skills": [],
            "input_files": [],
            "order": 2,
        },
        {
            "id": "04_summary",
            "agent": "gemini",
            "prompt": (
                "# Role: Lead Analyst

"
                "Read all ${TICKER}_*.md files. Synthesize into a structured investment "
                "brief with: Summary, Bull Case, Bear Case, Verdict.

"
                "# Output
Save to ${TICKER}_investment_brief.md"
            ),
            "skills": [],
            "input_files": [],
            "order": 3,
        },
    ],
    config={
        "timeout_per_step": 7200,
        "stop_on_failure": False,
    },
)

print(f"Created workflow: {workflow['id']}")

### Run with different tickers
for ticker in ["NVDA", "AAPL", "MSFT"]:
    run = requests.post(f"{API}/api/workflows/{workflow['id']}/run", json={
        "session_title": f"Research: {ticker}",
        "variables": {"TICKER": ticker},
    }).json()
    print(f"  ▶ {ticker}: run_id={run['run_id']}")
```

### JavaScript/TypeScript Client

```typescript
const API = "http://localhost:8000";

interface WorkflowStep {
  id: string;
  agent: string;
  prompt: string;
  skills?: string[];
  input_files?: string[];
  order?: number;
}

interface WorkflowVariable {
  name: string;
  label?: string;
  type?: "string" | "number" | "text";
  default?: string;
  required?: boolean;
}

async function createWorkflow(
  name: string,
  description: string,
  steps: WorkflowStep[],
  variables?: WorkflowVariable[],
  config?: Record<string, any>
) {
  const res = await fetch(`${API}/api/workflows`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, description, steps, variables: variables || [], config: config || {} }),
  });
  return res.json();
}

// Example: Daily market report
const workflow = await createWorkflow(
  "Daily Market Report",
  "Automated post-close market analysis",
  [
    {
      id: "market_overview",
      agent: "gemini",
      prompt: "Generate today's market overview: indices, volume, sector rotation. Save to 01_market.md",
      skills: ["web_search"],
      order: 0,
    },
    {
      id: "event_analysis",
      agent: "gemini",
      prompt: "Read 01_market.md. Identify 3-5 key events. Save to 02_events.md",
      skills: ["web_search"],
      order: 1,
    },
    {
      id: "final_report",
      agent: "gemini",
      prompt: "Read all *.md files. Compile into a formatted daily report. Save to daily_report.md",
      order: 2,
    },
  ],
  { timeout_per_step: 7200 }
);
```

### Shell Script (Batch Creation)

```bash
#!/bin/bash
API="http://localhost:8000"

### Create workflow from a JSON file
create_workflow() {
  local json_file="$1"
  curl -H "X-API-Key: $YOUR_API_KEY" -s -X POST "$API/api/workflows" \
    -H "Content-Type: application/json" \
    -d @"$json_file" | python3 -c "
import sys, json
wf = json.load(sys.stdin)
print(f'✅ Created: {wf[\"name\"]} (id: {wf[\"id\"]})')
print(f'   Steps: {len(wf[\"steps\"])}')"
}

### Usage
create_workflow workflow_definitions/daily_report.json
create_workflow workflow_definitions/stock_research.json
```

---

#### Running Workflows

### Method 1: New Session (Recommended for fresh runs)

```bash
curl -H "X-API-Key: $YOUR_API_KEY" -X POST "http://localhost:8000/api/workflows/$WORKFLOW_ID/run" \
  -H "Content-Type: application/json" \
  -d '{
    "session_title": "NVDA Research — April 12"
  }'
```

Response:

```json
{
  "run_id": "abc123...",
  "session_id": "sess456...",
  "status": "running",
  "workflow": "深度研究: NVDA"
}
```

### Method 2: With Variables

Override workflow variables at run time to reuse a template with different parameters:

```bash
### Run a stock research template for AAPL instead of the default NVDA
curl -H "X-API-Key: $YOUR_API_KEY" -X POST "http://localhost:8000/api/workflows/$WORKFLOW_ID/run" \
  -H "Content-Type: application/json" \
  -d '{
    "session_title": "AAPL Deep Dive",
    "variables": {
      "TICKER": "AAPL",
      "DEPTH": "500 words"
    }
  }'
```

Variables are resolved by merging run-time overrides with the workflow's default values:

| Priority | Source | Example |
|----------|--------|---------|
| 1 (highest) | Run request `variables` | `{"TICKER": "AAPL"}` |
| 2 | Workflow definition `default` | `"default": "NVDA"` |
| 3 (lowest) | Empty string (if required) | `""` |

### Method 3: With Input Prompt & Files

Inject dynamic context into the workflow's first step at run time.
This can be **combined with variables**:

```bash
### Run with variables + input prompt + files
curl -H "X-API-Key: $YOUR_API_KEY" -X POST "http://localhost:8000/api/workflows/$WORKFLOW_ID/run" \
  -H "Content-Type: application/json" \
  -d '{
    "session_title": "NVDA Earnings Focus",
    "variables": {"TICKER": "NVDA"},
    "input_prompt": "Focus on Q1 2026 earnings and AI datacenter revenue segment. Compare with AMD.",
    "input_files": [
      {
        "filename": "context.md",
        "content_text": "# Prior Research
NVDA reported $44B revenue in FY2026...
"
      }
    ]
  }'
```

- `variables` — substituted as `${VAR}` in **all steps'** prompts.
- `input_prompt` — prepended to the **first step** only as a `## User Input` section.
- `input_files` — written to the session workspace **before** any step runs.

### Method 4: Existing Session (Reuse workspace context)

```bash
### Run in an existing session — preserves prior messages and files
curl -H "X-API-Key: $YOUR_API_KEY" -X POST "http://localhost:8000/api/sessions/$SESSION_ID/run-workflow" \
  -H "Content-Type: application/json" \
  -d '{
    "workflow_id": "'$WORKFLOW_ID'",
    "variables": {"TICKER": "TSLA"},
    "input_prompt": "Additionally analyze the impact of US export controls"
  }'
```

### Method 5: Python Automation

```python
import requests
import time

API = "http://localhost:8000"

def run_workflow(workflow_id: str, title: str = None, session_id: str = None,
                 variables: dict = None, input_prompt: str = None,
                 input_files: list = None):
    """Run a workflow and poll until completion."""
    payload = {}
    if session_id:
        payload["workflow_id"] = workflow_id
        if variables:
            payload["variables"] = variables
        if input_prompt:
            payload["input_prompt"] = input_prompt
        if input_files:
            payload["input_files"] = input_files
        res = requests.post(f"{API}/api/sessions/{session_id}/run-workflow",
                          json=payload)
    else:
        payload["session_title"] = title or "Workflow Run"
        if variables:
            payload["variables"] = variables
        if input_prompt:
            payload["input_prompt"] = input_prompt
        if input_files:
            payload["input_files"] = input_files
        res = requests.post(f"{API}/api/workflows/{workflow_id}/run",
                          json=payload)
    
    data = res.json()
    run_id = data["run_id"]
    session_id = data["session_id"]
    print(f"▶ Run started: {run_id}")
    print(f"  Session: {session_id}")
    
    # Poll until completion
    while True:
        run = requests.get(f"{API}/api/workflow-runs/{run_id}").json()
        status = run["status"]
        step = run.get("current_step", 0)
        total = len(run.get("results", []))
        
        print(f"  Status: {status} | Step: {step + 1} | Results: {total}")
        
        if status in ("completed", "failed", "cancelled"):
            break
        time.sleep(5)
    
    return run

### Basic run (uses default variable values)
result = run_workflow("your-workflow-id", title="NVDA Deep Dive")

### Parameterized run with variable overrides
result = run_workflow(
    "your-workflow-id",
    title="AAPL Deep Dive",
    variables={"TICKER": "AAPL", "DEPTH": "500 words"},
    input_prompt="Focus on iPhone 17 cycle and Services revenue.",
    input_files=[{
        "filename": "prior_research.md",
        "content_text": "# Previous Findings
Apple's Services revenue grew 20% YoY..."
    }],
)

### Batch run: same template for multiple tickers
for ticker in ["NVDA", "AAPL", "MSFT", "GOOGL"]:
    result = run_workflow(
        "your-workflow-id",
        title=f"{ticker} Analysis",
        variables={"TICKER": ticker},
    )
    print(f"  {ticker}: {result['status']}")

print(f"
{'='*60}")
print(f"Final status: {result['status']}")
for r in result.get("results", []):
    emoji = "✅" if r["status"] == "success" else "❌"
    print(f"  {emoji} {r['step_id']}: {r['status']} ({r.get('latency_ms', 0)/1000:.1f}s)")
```

---

#### Monitoring & Observability

### Check Run Status

```bash
curl -H "X-API-Key: $YOUR_API_KEY" "http://localhost:8000/api/workflow-runs/$RUN_ID" | python3 -m json.tool
```

Response structure:

```json
{
  "id": "run_abc123",
  "workflow_id": "wf_xyz",
  "session_id": "sess_456",
  "status": "running",            // pending | running | completed | failed | cancelled
  "current_step": 1,
  "results": [
    {
      "step_id": "01_overview",
      "step_index": 0,
      "agent": "gemini",
      "status": "success",
      "output": "# NVDA Company Overview...",
      "latency_ms": 45200,
      "started_at": 1775908200000,
      "finished_at": 1775908245200
    }
  ],
  "started_at": 1775908200000,
  "finished_at": null,
  "error": null
}
```

### List All Runs for a Workflow

```bash
curl -H "X-API-Key: $YOUR_API_KEY" "http://localhost:8000/api/workflows/$WORKFLOW_ID/runs?limit=20"
```

### Cancel a Running Workflow

```bash
curl -H "X-API-Key: $YOUR_API_KEY" -X POST "http://localhost:8000/api/workflow-runs/$RUN_ID/cancel"
```

### View Session Messages (Workflow Output)

Each step's prompt and response are logged as session messages:

```bash
curl -H "X-API-Key: $YOUR_API_KEY" "http://localhost:8000/api/sessions/$SESSION_ID/messages" \
  | python3 -c "
import sys, json
msgs = json.load(sys.stdin).get('messages', [])
for m in msgs:
    src = m['source']
    content = m['content'][:100]
    print(f'[{src:6}] {content}...')
"
```

### View in Brain Inspector

Workflow runs create full session event trails. Open the UI at
`http://localhost:5173/brain` and select the workflow session to see:

- Tool calls and file operations
- Step timing and phase transitions
- Agent selection events
- Error traces

---

#### Best Practices

### 1. Use Descriptive Step IDs

Step IDs appear in logs, run results, and the UI. Make them semantic:

```jsonc
// ✅ Good — scannable in logs and dashboards
{ "id": "01_market_overview", ... }
{ "id": "02_event_analysis", ... }
{ "id": "03_risk_assessment", ... }

// ❌ Bad — confusing in monitoring
{ "id": "step1", ... }
{ "id": "a", ... }
```

### 2. Chain Steps via File Output

Steps share a workspace directory. Write output to files, then read them
in subsequent steps:

```jsonc
// Step 1: Write output
{
  "id": "research",
  "prompt": "Research topic X. Save findings to research_results.md"
}

// Step 2: Read previous output
{
  "id": "analyze",
  "prompt": "Read research_results.md. Perform gap analysis. Save to analysis.md"
}

// Step 3: Synthesize all
{
  "id": "report",
  "prompt": "Read all *.md files in the workspace. Create a unified report."
}
```

### 3. Use `order` Field for Explicit Sequencing

While steps execute in array order, the `order` field makes intent explicit
and survives JSON serialization/deserialization:

```json
[
  { "id": "collect", "order": 0, ... },
  { "id": "analyze", "order": 1, ... },
  { "id": "report",  "order": 2, ... }
]
```

### 4. Set Appropriate Timeouts

Default timeout is 3600s (1 hour). Adjust per step based on complexity:

```jsonc
// Quick lookup — 5 minutes
{ "id": "price_check", "config": { "timeout": 300 }, ... }

// Deep research — 2 hours
{ "id": "deep_analysis", "config": { "timeout": 7200 }, ... }

// Code generation — 30 minutes
{ "id": "generate_code", "config": { "timeout": 1800 }, ... }
```

### 5. Use `continue_on_error` Strategically

```jsonc
// Non-critical enrichment step — OK to skip
{
  "id": "sentiment_bonus",
  "config": { "continue_on_error": true },
  "prompt": "Optional: analyze social media sentiment..."
}

// Critical data step — must succeed
{
  "id": "financial_data",
  "config": { "continue_on_error": false },
  "prompt": "Fetch and verify quarterly earnings..."
}
```

### 6. Assign the Right Agent to Each Step

Choose agents based on their strengths:

```jsonc
[
  // Gemini: best for web search and code generation
  { "id": "research", "agent": "gemini", "skills": ["web_search"], ... },

  // Claude: best for deep analysis and reasoning
  { "id": "analysis", "agent": "claude", ... },

  // Gemini: best for structured output and synthesis
  { "id": "report", "agent": "gemini", ... }
]
```

### 7. Include Role Prompts

Start each step prompt with a role definition for better output quality:

```jsonc
{
  "prompt": "# Your Role: Senior Equity Analyst

# Current Task
...

# Output Requirements
Save to filename.md"
}
```

### 8. Keep Workflow Config at the Top Level

Global settings go in the workflow `config`, not in individual steps:

```json
{
  "name": "Daily Report",
  "config": {
    "timeout_per_step": 7200,
    "stop_on_failure": false
  },
  "steps": [...]
}
```

### 9. Use Variables for Reusable Templates

Instead of duplicating workflows for each ticker/topic, parameterize with variables:

```jsonc
// ✅ Good — one workflow, infinite runs
{
  "name": "Research: ${TICKER}",
  "variables": [
    {"name": "TICKER", "label": "Stock Ticker", "default": "NVDA", "required": true},
    {"name": "DATE", "label": "Analysis Date", "default": "today"}
  ],
  "steps": [
    {"id": "research", "prompt": "Research ${TICKER} as of ${DATE}..."}
  ]
}
// Run: {"variables": {"TICKER": "AAPL"}}
// Run: {"variables": {"TICKER": "MSFT"}}

// ❌ Bad — hard-coded, requires separate workflow per ticker
{
  "name": "Research: NVDA",
  "steps": [
    {"id": "research", "prompt": "Research NVDA..."}
  ]
}
```

**Naming convention**: Use `UPPER_SNAKE_CASE` for variable names. The UI enforces this automatically.

**Default values**: Always provide sensible defaults so workflows can be run without overrides.

**Variables vs. input_prompt**: Use variables for structured parameters (`TICKER`, `DATE`, `DEPTH`). Use `input_prompt` for free-form additional context.

### 10. Use Conditions for Smart Pipelines

Add conditions to make workflows adaptive — skip unnecessary steps, branch
on output quality, or stop early when prerequisites are missing:

```jsonc
// ✅ Good — adaptive pipeline that skips unnecessary work
[
  {
    "id": "research",
    "agent": "gemini",
    "prompt": "Research ${TICKER}. Note any major risks.",
    "skills": ["web_search"]
  },
  {
    "id": "risk_deep_dive",
    "agent": "claude",
    "prompt": "Deep-dive into the risks found for ${TICKER}",
    "condition": {
      "type": "if_output_contains",
      "value": "risk",
      "on_false": "skip"
    }
  },
  {
    "id": "report",
    "agent": "gemini",
    "prompt": "Compile final report from all *.md files",
    "condition": {
      "type": "if_file_exists",
      "value": "research.md",
      "on_false": "stop"
    }
  }
]
```

**Keep conditions simple**: Conditions evaluate against the *previous* step's output,
not arbitrary steps. For complex branching, use multiple sequential gate steps.

**Prefer `skip` over `stop`**: Use `stop` only for hard prerequisites. `skip` keeps
the pipeline flowing and is more resilient.

---

#### Real-World Templates

### Template 1: Stock Research Pipeline (with Variables)

```json
{
  "name": "深度研究: ${TICKER}",
  "description": "Comprehensive equity analysis — parameterized template",
  "variables": [
    {"name": "TICKER", "label": "Stock Ticker", "type": "string", "default": "NVDA", "required": true},
    {"name": "DEPTH", "label": "Analysis Depth", "type": "string", "default": "300 words"},
    {"name": "FOCUS", "label": "Special Focus", "type": "text", "default": "overall business"}
  ],
  "steps": [
    {
      "id": "01_overview",
      "agent": "gemini",
      "prompt": "# Role: Equity Research Analyst

Analyze ${TICKER}: business model, revenue segments, competitive moat. Focus on ${FOCUS}. Under ${DEPTH}.

# Output
Save to ${TICKER}_01_overview.md",
      "skills": ["web_search"],
      "order": 0
    },
    {
      "id": "02_financials",
      "agent": "gemini",
      "prompt": "# Role: Financial Analyst

Read ${TICKER}_01_overview.md. Analyze latest quarterly financials: revenue, margins, FCF, guidance. Under ${DEPTH}.

# Output
Save to ${TICKER}_02_financials.md",
      "skills": ["web_search"],
      "order": 1
    },
    {
      "id": "03_risks",
      "agent": "claude",
      "prompt": "# Role: Risk Manager

Read all ${TICKER}_*.md files. Identify top 5 risks, score severity 1-10, suggest mitigations.

# Output
Save to ${TICKER}_03_risks.md",
      "order": 2
    },
    {
      "id": "04_valuation",
      "agent": "gemini",
      "prompt": "# Role: Valuation Analyst

Read all ${TICKER}_*.md files. Build DCF and relative valuation. Target price range.

# Output
Save to ${TICKER}_04_valuation.md",
      "skills": ["web_search"],
      "order": 3
    },
    {
      "id": "05_brief",
      "agent": "gemini",
      "prompt": "# Role: Chief Analyst

Read all ${TICKER}_*.md files. Synthesize into a structured investment brief: Summary, Bull/Bear Case, Verdict, Target.

# Output
Save to ${TICKER}_investment_brief.md",
      "order": 4
    }
  ],
  "config": {
    "timeout_per_step": 7200,
    "stop_on_failure": false
  }
}
```

**Usage examples:**

```bash
### Default: NVDA analysis
curl -H "X-API-Key: $YOUR_API_KEY" -X POST "$API/api/workflows/$WF/run" -H "Content-Type: application/json" \
  -d '{"session_title": "NVDA Research"}'

### Override: AAPL with AI focus
curl -H "X-API-Key: $YOUR_API_KEY" -X POST "$API/api/workflows/$WF/run" -H "Content-Type: application/json" \
  -d '{"variables": {"TICKER": "AAPL", "FOCUS": "AI and machine learning", "DEPTH": "500 words"}}'
```

### Template 2: Daily Market Report

```json
{
  "name": "每日日报",
  "description": "Post-close daily report: market overview, events, sentiment, risks, outlook",
  "steps": [
    {
      "id": "daily_1_market",
      "agent": "gemini",
      "prompt": "# Role: Macro Strategist

Generate today's post-close market overview: A-share indices, volume comparison, sector rotation, market style, key drivers. Under 200 words.

# Output
Save to 01_market.md",
      "skills": ["web_search"],
      "order": 0
    },
    {
      "id": "daily_2_events",
      "agent": "gemini",
      "prompt": "# Role: Event Analyst

Identify 3-5 most important market events today. For each: summary, impact assessment, affected tickers, investment implications.

# Output
Save to 02_events.md",
      "skills": ["web_search"],
      "order": 1
    },
    {
      "id": "daily_3_sentiment",
      "agent": "gemini",
      "prompt": "# Role: Sentiment Analyst

Generate today's sentiment index (0-100): funding, technicals, social media, policy sub-scores. Trend analysis.

# Output
Save to 03_sentiment.md",
      "skills": ["web_search"],
      "order": 2
    },
    {
      "id": "daily_4_outlook",
      "agent": "gemini",
      "prompt": "# Role: Chief Strategist

Read all *.md files. Compile into a formatted daily report with: Market Overview, Key Events, Sentiment Dashboard, Risk Alerts, Tomorrow's Watch.

# Output
Save to daily_report.md",
      "order": 3
    }
  ],
  "config": {
    "timeout_per_step": 7200,
    "stop_on_failure": false
  }
}
```

### Template 3: Code Review Pipeline

```json
{
  "name": "Code Review Pipeline",
  "description": "Multi-agent code review with different perspectives",
  "steps": [
    {
      "id": "security_review",
      "agent": "claude",
      "prompt": "# Role: Security Auditor

Review all code files in the workspace for security vulnerabilities: injection, auth bypass, data exposure, secrets. Generate SARIF-style findings.

# Output
Save to review_security.md",
      "order": 0
    },
    {
      "id": "architecture_review",
      "agent": "gemini",
      "prompt": "# Role: Software Architect

Read review_security.md for context. Review code architecture: SOLID principles, coupling, cohesion, scalability concerns.

# Output
Save to review_architecture.md",
      "order": 1
    },
    {
      "id": "summary",
      "agent": "gemini",
      "prompt": "# Role: Engineering Manager

Read review_security.md and review_architecture.md. Create a prioritized action plan with severity levels.

# Output
Save to review_summary.md",
      "order": 2
    }
  ]
}
```

---

#### Troubleshooting

### Workflow Appears Empty in UI

**Symptom**: API-created workflow shows no steps or crashes when opened in the editor.

**Cause**: Step fields use different naming conventions between API and UI.

**Fix**: The system now normalizes both `input_files` (API) and `inputFiles` (UI)
automatically. If you still encounter issues, ensure each step has at minimum:

```json
{ "id": "...", "agent": "...", "prompt": "..." }
```

### Step Fails with "Failed to spawn"

**Cause**: The subprocess can't find `npx` or `node` in its PATH.

**Fix**: The backend resolves CLI paths with macOS-aware fallbacks
(`/opt/homebrew/bin`, nvm). Ensure Node.js is installed:

```bash
### Verify
node --version
npx --version
```

### Workflow Run Stuck at "running"

**Cause**: A step timed out or the agent process hung.

**Fix**: Cancel the run and check the session messages:

```bash
### Cancel
curl -H "X-API-Key: $YOUR_API_KEY" -X POST "http://localhost:8000/api/workflow-runs/$RUN_ID/cancel"

### Check what happened
curl -H "X-API-Key: $YOUR_API_KEY" "http://localhost:8000/api/sessions/$SESSION_ID/messages" | python3 -m json.tool
```

### WebSocket Errors When Navigating

**Symptom**: Console shows "WebSocket is closed before the connection is established"

**Cause**: React StrictMode in development double-invokes effects, causing a brief
mount→unmount→remount cycle. The WebSocket opens on the first mount and gets
cleaned up on the unmount.

**Fix**: This is harmless in development. The hook now gracefully handles this by
checking `readyState` before closing. In production builds (without StrictMode),
this warning does not appear.

---

#### API Reference

### Workflow CRUD

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/workflows` | List all workflows |
| `POST` | `/api/workflows` | Create a workflow |
| `GET` | `/api/workflows/{id}` | Get workflow details |
| `PUT` | `/api/workflows/{id}` | Update a workflow |
| `DELETE` | `/api/workflows/{id}` | Delete a workflow |

### Workflow Execution

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/workflows/{id}/run` | Start a new run |
| `POST` | `/api/sessions/{id}/run-workflow` | Run workflow in existing session |
| `GET` | `/api/workflows/{id}/runs?limit=N` | List runs for a workflow |
| `GET` | `/api/workflow-runs/{id}` | Get run status and results |
| `POST` | `/api/workflow-runs/{id}/cancel` | Cancel a running workflow |

### Scheduled Execution

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/scheduled-jobs` | List all running scheduled cron jobs |
| `POST` | `/api/scheduled-jobs` | Schedule a workflow execution globally via Cron expressions (`{ "workflow_id": "...", "cron_expr": "0 * * * *" }`) |
| `DELETE` | `/api/scheduled-jobs/{id}` | Remove a schedule |

### Create Workflow Request

```http
POST /api/workflows
Content-Type: application/json

{
  "name": "string (required)",
  "description": "string (optional, default: '')",
  "variables": [
    {
      "name": "string (required) — UPPER_SNAKE_CASE, used as ${NAME} in prompts",
      "label": "string (optional) — human-readable label",
      "type": "string (optional): string | number | text (default: string)",
      "default": "string (optional) — default value",
      "required": "boolean (optional, default: false)"
    }
  ],
  "steps": [
    {
      "id": "string (recommended)",
      "agent": "string (required): gemini | claude | codex | ollama | mflux | sub_workflow",
      "prompt": "string (required) — supports ${VAR_NAME} placeholders",
      "skills": ["string (optional)"],
      "input_files": ["string (optional)"],
      "order": "number (optional — used in linear mode)",
      "inputs": [{"id": "string", "label": "string", "type": "context|text|file|json"}],
      "outputs": [{"id": "string", "label": "string", "type": "context|text|file|json"}],
      "sub_workflow_id": "string (optional — required when agent=sub_workflow)",
      "condition": {
        "type": "string: always | if_output_contains | if_output_not_contains | if_exit_code | if_file_exists",
        "value": "string — comparison value",
        "on_false": "string: skip | goto | stop (default: skip)",
        "goto_step": "string — target step ID (only for goto)"
      }
    }
  ],
  "edges": [
    {
      "id": "string (required)",
      "source": "string (required — step ID)",
      "target": "string (required — step ID)",
      "sourceHandle": "string (optional — output port ID, default: 'output')",
      "targetHandle": "string (optional — input port ID, default: 'input')",
      "condition": "object (optional — same as step condition schema)"
    }
  ],
  "positions": {
    "step_id": {"x": "number", "y": "number"}
  },
  "config": {
    "timeout_per_step": "number (optional, default: 3600)",
    "stop_on_failure": "boolean (optional, default: false)"
  }
}
```

### Run Workflow Request

```http
POST /api/workflows/{workflow_id}/run
Content-Type: application/json

{
  "session_id": "string (optional — reuse existing session)",
  "session_title": "string (optional — title for new session)",
  "variables": {
    "VAR_NAME": "string (optional — override variable values)"
  },
  "input_prompt": "string (optional — injected into first step as context)",
  "input_files": [
    {
      "filename": "string (required — filename in workspace)",
      "content_text": "string (optional — plain text content)",
      "content_b64": "string (optional — base64-encoded binary content)"
    }
  ]
}
```

> **Note:** `variables` overrides are merged with the workflow's default variable
> values. Unset variables fall back to their defaults. For each input file, provide
> either `content_text` (for text files) or `content_b64` (for binary files).

### Run Workflow in Session Request

```http
POST /api/sessions/{session_id}/run-workflow
Content-Type: application/json

{
  "workflow_id": "string (required)",
  "variables": {"VAR_NAME": "string (optional)"},
  "input_prompt": "string (optional)",
  "input_files": [{ "filename": "...", "content_text": "..." }]
}
```

### Run Response

```json
{
  "run_id": "string",
  "session_id": "string",
  "status": "running",
  "workflow": "string (workflow name)"
}
```

### Run Status Response

```json
{
  "id": "string",
  "workflow_id": "string",
  "session_id": "string",
  "status": "pending | running | completed | failed | cancelled",
  "current_step": 0,
  "results": [
    {
      "step_id": "string",
      "step_index": 0,
      "agent": "string",
      "status": "success | error | timeout | skipped",
      "output": "string (agent output)",
      "error": "string | null",
      "latency_ms": 0,
      "started_at": 0,
      "finished_at": 0
    }
  ],
  "started_at": 0,
  "finished_at": 0,
  "error": "string | null"
}
```


---


---

<a id="简体中文"></a>
## 🇨🇳 简体中文文档

一个**托管式 AI 智能体工作区**，将多个 AI 智能体统一在无状态编排器之后。会话在后台运行，切换上下文不会打断执行，智能体生命周期的每个阶段都可实时观察。

基于 **Python FastAPI**（后端）和 **React + Vite**（前端）构建，系统通过统一的接口驱动架构管理 5 个智能体 "手"（Hand）— Gemini CLI、Claude Code、Codex、Ollama 和 MFLUX。

### ✨ 核心能力

| 能力 | 说明 |
|------|------|
| **统一 Hand 协议** | 5 个 `Hand` 实现共享 `execute()` 接口 — 无需改代码即可切换智能体 |
| **后台执行** | 会话作为 `asyncio.Task` 运行 — 切换会话或断开连接不会终止正在运行的智能体 |
| **多智能体委派** | 将提示词扇出到 N 个智能体并行执行，支持四种合并策略 |
| **工作流引擎** | 可视化 DAG 工作流构建器，支持 ReactFlow 画布、拓扑排序执行、条件分支、子工作流和 I/O 端口数据流 |
| **跨会话上下文** | 链接、分叉和共享会话上下文 — 链接消息自动注入上下文窗口 |
| **实时可观测性** | 实时执行阶段 + 耗时和输出指标 |
| **大脑检查器** | 高级仪表板，展示会话事件流、上下文利用率和 Harness 配置 |
| **持久化事件日志** | 19 种 `EventType` 类别持久化到 SQLite，支持崩溃恢复和时间旅行调试 |
| **每日报告** | AI 生成的每日使用分析报告，支持持久化存储和历史浏览 |
| **上下文引擎** | 3 种策略（完整回放、滑动窗口、压缩）+ 跨会话共享上下文 |
| **工作区隔离** | 每个会话/智能体通过沙箱池获得独立工作目录，支持 TTL 自动回收 |
| **项目隔离与鉴权** | 客户端 API 接入强制要求 `X-API-Key`，支持自动生成令牌及项目级读写安全隔离 |

### 🔐 客户端项目隔离与鉴权

系统支持多租户与多项目数据完全隔离，由 **项目 API 令牌 (API Key)** 提供严密的后台读写限制保障。

**1. 在 UI 注册并获取 API 密钥**
- 在前端系统的 **Session Panel (会话左侧面板)** 中点击新项目下的 "文件夹" 图标。
- 输入名称并完成项目创建。
- **右键单击** 该项目标签，选择 **Copy API Key (复制 API 密钥)**。

**2. 通过 API 授权接入**
第三方的业务客户端在调用 REST / WebSocket 接口时，需在请求头中自带您的 API 密钥：
```http
X-API-Key: sk_4914a...
```
*(所有的请求将被后端严格限制在对应的项目空间中，只允许查询及控制该项目旗下的工作流、会话与任务等资源)*

### 🚀 快速开始

```bash
git clone <repo-url>
cd agent-route
./init.sh        # 首次安装
./start.sh       # 启动服务
```
打开浏览器访问 **http://localhost:5173**

### 📚 文档

所有核心架构、API端点、操作指南及工作流的详细文档已经合并在上方英文说明的中后段（请参阅 **Architecture Guide**, **API Reference**, **How-To Guide** 与 **Workflow Guide**）。
