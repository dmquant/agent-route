# Agent Route — Managed AI Agent Workspace

[English](#english) | [简体中文](#简体中文) | [API Docs →](docs/api-reference.md) | [Architecture →](docs/architecture.md) | [How-To Guide →](docs/how-to-guide.md) | [Workflow Guide →](docs/workflow-guide.md)

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
| **Workflow Engine** | Drag-and-drop workflow builder with step sequencing, agent selection, parameterized runs (input prompt + files), and session-bound execution |
| **Cross-Session Context** | Link, fork, and share context between sessions — linked messages auto-inject into the context window |
| **Live Observability** | Real-time execution phases (connecting → executing → streaming → finalizing) with elapsed time and output metrics |
| **Brain Inspector** | Premium dashboard for session event streams, context utilization, and harness configurations |
| **Durable Event Log** | 19 `EventType` categories persisted to SQLite for crash recovery and time-travel debugging |
| **Daily Reports** | AI-generated daily usage analytics with persistent storage and historical browsing |
| **Context Engine** | 3 strategies (full replay, sliding window, compaction) + cross-session shared context |
| **Workspace Isolation** | Each session/agent gets its own working directory via the Sandbox Pool with TTL-based GC |

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
│   │       │   ├── Workflows.tsx         # Drag-and-drop workflow builder
│   │       │   ├── DailyReports.tsx      # AI-generated usage analytics
│   │       │   └── Dashboard.tsx         # Overview dashboard
│   │       └── components/
│   │           ├── SessionPanel.tsx       # Session list with running indicators
│   │           ├── WorkspacePanel.tsx     # File browser for session workspace
│   │           └── OutputParser.tsx       # Rich markdown/code output renderer
│   │
│   ├── api_bridge/                 # Python FastAPI backend
│   │   └── app/
│   │       ├── main.py                   # REST + WebSocket endpoints
│   │       ├── tasks.py                  # BackgroundTaskManager (phase lifecycle)
│   │       ├── session_store.py          # SQLite CRUD + context links + forking
│   │       ├── workflow_store.py         # Workflow persistence
│   │       ├── workflow_executor.py      # Async workflow step execution
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

### 📚 Documentation

| Document | Description |
|----------|-------------|
| **[Architecture Guide](docs/architecture.md)** | Deep-dive into all subsystems: Hand Protocol, Brain/Orchestrator, Context Engine, Workflow Engine, Session Event Log |
| **[API Reference](docs/api-reference.md)** | Complete reference for 70+ REST endpoints and WebSocket protocol, with request/response schemas |
| **[How-To Guide](docs/how-to-guide.md)** | Practical recipes: run your first agent, build workflows, share context, fork sessions, use multi-agent delegation |
| **[Workflow Guide](docs/workflow-guide.md)** | Workflow API deep-dive: step schema, parameterized runs (input_prompt + files), templates, and best practices |

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
| **工作流引擎** | 拖拽式工作流构建器，支持步骤排序、智能体选择、参数化运行（输入提示 + 文件）和会话绑定执行 |
| **跨会话上下文** | 链接、分叉和共享会话上下文 — 链接消息自动注入上下文窗口 |
| **实时可观测性** | 实时执行阶段 + 耗时和输出指标 |
| **大脑检查器** | 高级仪表板，展示会话事件流、上下文利用率和 Harness 配置 |
| **持久化事件日志** | 19 种 `EventType` 类别持久化到 SQLite，支持崩溃恢复和时间旅行调试 |
| **每日报告** | AI 生成的每日使用分析报告，支持持久化存储和历史浏览 |
| **上下文引擎** | 3 种策略（完整回放、滑动窗口、压缩）+ 跨会话共享上下文 |
| **工作区隔离** | 每个会话/智能体通过沙箱池获得独立工作目录，支持 TTL 自动回收 |

### 🚀 快速开始

```bash
git clone <repo-url>
cd agent-route
./init.sh        # 首次安装
./start.sh       # 启动服务
```
打开浏览器访问 **http://localhost:5173**

### 📚 文档

| 文档 | 说明 |
|------|------|
| **[架构指南](docs/architecture.md)** | 所有子系统详解：Hand 协议、Brain 编排器、上下文引擎、工作流引擎、会话事件日志 |
| **[API 参考](docs/api-reference.md)** | 70+ REST 端点和 WebSocket 协议完整参考，含请求/响应格式 |
| **[使用指南](docs/how-to-guide.md)** | 实用示例：运行智能体、构建工作流、共享上下文、分叉会话、多智能体委派 |
| **[工作流指南](docs/workflow-guide.md)** | 工作流 API 详解：步骤结构定义、参数化运行（输入提示 + 文件）、模板和最佳实践 |
