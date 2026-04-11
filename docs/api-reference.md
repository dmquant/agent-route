# API Reference — Agent Route API Bridge

> Complete reference for all REST endpoints and WebSocket protocol.  
> Base URL: `http://localhost:8000`

## Table of Contents

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

## Authentication

No authentication is required for local development. All endpoints are accessible without tokens.

> **Note:** For production deployment, add authentication middleware to the FastAPI app.

---

## 1. Session Management

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

## 2. Project Management

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

## 3. Agent Execution

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
  "output": "fn main() {\n    println!(\"Hello, World!\");\n}"
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

## 4. Multi-Agent Delegation

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

## 5. Background Tasks

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

## 6. Brain & Context Engine

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

## 7. Harness Configuration

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

## 8. Workflow Engine

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
      "order": 1
    }
  ],
  "config": {
    "timeout_per_step": 7200,
    "stop_on_failure": true
  }
}
```

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

## 9. Context Sharing & Forking

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

## 10. File & Workspace Management

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

## 11. Sandbox Pool

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

## 12. Reports & Analytics

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

## 13. Agent Discovery

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

## 14. WebSocket Protocol

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
