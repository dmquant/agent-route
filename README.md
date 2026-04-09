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
| **Live Observability** | Real-time execution phases (connecting → executing → streaming → finalizing) with elapsed time and output metrics |
| **Durable Event Log** | 19 `EventType` categories persisted to SQLite for crash recovery and time-travel debugging |
| **Result Comparison** | Side-by-side multi-agent output comparison with agent-colored cards, winners, and expandable details |
| **Brain Inspector** | Premium dashboard for session event streams, context utilization, and harness configurations |
| **Session Management** | Persistent sessions organized by projects — survives restarts, grouped by color-coded projects |
| **Workspace Isolation** | Each session/agent gets its own working directory via the Sandbox Pool with TTL-based GC |
| **Context Engine** | 3 strategies (full replay, sliding window, compaction) for managing context windows |

### 🏗 Architecture

```
┌─────────────────────────────────────────────────────────────┐
│  Frontend (React + Vite)                                    │
│  ┌──────────┐  ┌────────────────┐  ┌──────────────────┐   │
│  │ Session   │  │ Chat + Status  │  │ Workspace Panel  │   │
│  │ Panel     │  │ Bar (phases,   │  │ (file browser,   │   │
│  │ (running  │  │ elapsed,       │  │  inline preview) │   │
│  │ indicators)│ │ output bytes)  │  │                  │   │
│  └──────────┘  └────────────────┘  └──────────────────┘   │
│          ↕ WebSocket (bidirectional, event-driven)          │
└─────────────────────────────────────────────────────────────┘
          ↕
┌─────────────────────────────────────────────────────────────┐
│  Backend (Python FastAPI)                                    │
│  ┌───────────────────┐  ┌──────────────────────────────┐   │
│  │ WebSocket Handler  │  │ BackgroundTaskManager        │   │
│  │ (non-blocking,     │  │ (asyncio.Task per execution, │   │
│  │  event subscriber) │  │  phase lifecycle, broadcast) │   │
│  └───────────────────┘  └──────────────────────────────┘   │
│          ↕                          ↕                       │
│  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────┐ │
│  │ Gemini  │ │ Claude  │ │ Codex   │ │ Ollama  │ │MFLUX│ │
│  │ Hand    │ │ Hand    │ │ Hand    │ │ Hand    │ │Hand │ │
│  └─────────┘ └─────────┘ └─────────┘ └─────────┘ └─────┘ │
│          ↕                                                  │
│  ┌──────────────────┐  ┌──────────────────────────────┐    │
│  │ SessionEventMgr  │  │ Sandbox Pool (TTL-based GC)  │    │
│  │ (19 event types) │  │ (per-session workspaces)      │    │
│  └──────────────────┘  └──────────────────────────────┘    │
│          ↕                                                  │
│  ┌──────────────────────────────────────────────────┐      │
│  │ sessions.db (SQLite — projects, sessions,        │      │
│  │   messages, events, harness configs)             │      │
│  └──────────────────────────────────────────────────┘      │
└─────────────────────────────────────────────────────────────┘
```

### 📦 Project Structure

```
agent-route/
├── init.sh                   # First-time environment setup
├── start.sh / stop.sh        # Service lifecycle
├── .env.example              # Configuration template
├── vibelog/                   # Daily engineering reports (EN + ZH)
├── packages/
│   ├── frontend/             # React + Vite dashboard
│   │   └── src/
│   │       ├── pages/
│   │       │   ├── Chat.tsx           # Main chat + execution status bar
│   │       │   ├── BrainInspector.tsx # Event log + context + harness viewer
│   │       │   ├── Agents.tsx         # Agent health + skill registry
│   │       │   └── ...
│   │       └── components/
│   │           ├── SessionPanel.tsx    # Session list with running indicators
│   │           ├── WorkspacePanel.tsx  # File browser for session workspace
│   │           └── OutputParser.tsx    # Rich markdown/code output renderer
│   │
│   ├── api_bridge/            # Python FastAPI backend
│   │   └── app/
│   │       ├── main.py              # REST + WebSocket endpoints
│   │       ├── tasks.py             # BackgroundTaskManager (phase lifecycle)
│   │       ├── session_store.py     # SQLite CRUD for sessions/projects/messages
│   │       ├── hands/               # Uniform Hand Protocol
│   │       │   ├── base.py          # Hand ABC + HandResult dataclass
│   │       │   ├── registry.py      # HandRegistry (auto-discovery)
│   │       │   ├── gemini_hand.py   # Google Gemini CLI
│   │       │   ├── claude_hand.py   # Anthropic Claude Code
│   │       │   ├── codex_hand.py    # OpenAI Codex
│   │       │   ├── ollama_hand.py   # Local Ollama HTTP
│   │       │   └── mflux_hand.py    # MFLUX image generation
│   │       ├── session/             # Durable Event Log
│   │       │   ├── events.py        # 19 EventType categories
│   │       │   └── manager.py       # SessionEventManager
│   │       ├── brain/               # Orchestrator + Context Engine
│   │       │   ├── orchestrator.py  # AgentOrchestrator (wake/run/pause/delegate)
│   │       │   ├── context.py       # 3 context strategies
│   │       │   └── harness.py       # Per-agent HarnessConfig
│   │       └── sandbox/             # Workspace management
│   │           └── pool.py          # SandboxPool (TTL, GC, quotas)
│   │
│   ├── backend/               # Cloudflare Workers edge API (optional)
│   └── workspaces/sessions/   # Per-session isolated directories
```

### 🧠 Hand Protocol

Every agent implements the same interface:

```python
class Hand(ABC):
    name: str          # "gemini", "claude", etc.
    hand_type: str     # "cli", "http", "sdk"

    async def execute(
        self,
        prompt: str,
        workspace_dir: str,
        on_log: Callable[[str], Awaitable[None]],
        **kwargs
    ) -> HandResult:
        ...

@dataclass
class HandResult:
    output: str
    exit_code: int
    success: bool
    image_b64: Optional[str] = None
```

### ⚡ Background Execution Lifecycle

When a prompt is submitted, execution follows this non-blocking flow:

```
User sends prompt via WebSocket
  → BackgroundTaskManager.create_task()
  → asyncio.create_task(run_task(...))         # Non-blocking!
  → WS loop remains responsive for new commands

Task phases broadcast to all WebSocket subscribers:
  QUEUED → CONNECTING → EXECUTING → STREAMING → FINALIZING → COMPLETED
                                                            ↘ FAILED

Session switching during execution:
  • Running tasks continue uninterrupted
  • Status bar persists showing all active tasks
  • Sidebar shows spinning indicator on running sessions
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

### 💻 API Reference

#### Session Management REST
| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/projects` | List all projects |
| `POST` | `/api/projects` | Create a project |
| `PUT` | `/api/projects/:id` | Update a project |
| `DELETE` | `/api/projects/:id` | Delete a project |
| `GET` | `/api/sessions` | List all sessions |
| `POST` | `/api/sessions` | Create a session (auto-provisions workspace) |
| `DELETE` | `/api/sessions/:id` | Delete session + cleanup workspace |
| `GET` | `/api/sessions/:id/messages` | Get conversation history |
| `GET` | `/api/sessions/:id/workspace` | List workspace files |
| `GET` | `/api/sessions/:id/workspace/read?path=` | Read file contents |

#### Background Task Management
| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/tasks` | List all running/recent background tasks |
| `GET` | `/api/tasks/running` | Get session IDs with active tasks |
| `GET` | `/api/tasks/{session_id}` | Get tasks for a specific session |

#### Agent & Brain APIs
| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/agents` | List registered hands with health status |
| `GET` | `/api/agents/:name/skills` | Get skills for an agent |
| `GET` | `/api/brain/events/:session_id` | Get session event stream |
| `GET` | `/api/brain/harness` | Get all harness configurations |
| `GET` | `/models/ollama` | Discover available Ollama models |

#### Execution APIs
| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/execute` | Synchronous CLI execution |
| `POST` | `/execute/stream` | Streaming execution (ndjson) |
| `POST` | `/api/multi-agent/run` | Fan-out to N agents, join with strategy |
| `ws` | `/ws/agent` | WebSocket with background task support |

#### Multi-Agent Request Schema
```json
{
  "agents": ["gemini", "claude"],
  "prompt": "Write unit tests for auth.py",
  "session_id": "optional_session_id",
  "strategy": "first_success",
  "timeout": 300.0
}
```

**Join Strategies:**
| Strategy | Behavior |
|----------|----------|
| `first_success` | Return the first agent that succeeds (fastest winner) |
| `best_effort` | Return all successful results, fallback to any |
| `majority_vote` | Success = majority of agents succeeded |
| `all` | Return all results regardless of outcome |

#### WebSocket Protocol
```jsonc
// Client → Server: Execute a prompt
{ "type": "execute_node", "client": "gemini", "prompt": "...", "sessionId": "abc123" }

// Client → Server: Multi-agent fan-out
{ "type": "multi_agent_run", "agents": ["gemini", "claude"], "prompt": "...", "sessionId": "...", "strategy": "first_success" }

// Client → Server: Query running tasks
{ "type": "query_running" }

// Server → Client: Task status update (broadcast to all subscribers)
{ "type": "task_status", "taskId": "...", "phase": "streaming", "elapsed_ms": 12400, "output_bytes": 8192 }

// Server → Client: Multi-agent started
{ "type": "multi_agent_started", "sessionId": "...", "agents": ["gemini", "claude"], "strategy": "first_success" }

// Server → Client: Multi-agent completed (with per-agent results)
{ "type": "multi_agent_completed", "sessionId": "...", "success": true, "selected_agent": "gemini", "all_results": [...] }

// Server → Client: Output chunk
{ "type": "node_execution_log", "sessionId": "...", "log": "..." }

// Server → Client: Execution complete
{ "type": "node_execution_completed", "exitCode": 0 }
```

### 🗄 Storage Architecture

| Layer | Technology | Purpose |
|-------|-----------|---------|
| **Local** | SQLite (`sessions.db`) | Sessions, projects, messages, events, harness configs |
| **Edge** | Cloudflare D1 | Cloud persistence (optional, via `packages/backend`) |
| **Artifacts** | Cloudflare R2 | Binary assets, generated images |
| **Workspaces** | Filesystem (Sandbox Pool) | Per-session isolated directories with TTL-based GC |

### 🔧 Advanced Configuration

#### Ollama Remote Node
```bash
# On the remote machine, allow LAN access:
# macOS:  launchctl setenv OLLAMA_HOST "0.0.0.0"
# Linux:  Environment="OLLAMA_HOST=0.0.0.0" in systemd service
```

#### MFLUX Image Generation
- **Zero-Timeout:** The gateway explicitly disables timeouts for image generation.
- **Cold Boot:** First requests may take minutes while model weights download.

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
| **多智能体委派** | 将提示词扇出到 N 个智能体并行执行，支持 `first_success`、`best_effort`、`majority_vote`、`all` 四种合并策略 |
| **实时可观测性** | 实时执行阶段（connecting → executing → streaming → finalizing）+ 耗时和输出指标 |
| **持久化事件日志** | 19 种 `EventType` 类别持久化到 SQLite，支持崩溃恢复和时间旅行调试 |
| **结果对比** | 多智能体输出并排对比视图，支持代理颜色标识、胜者标记和可展开详情 |
| **大脑检查器** | 高级仪表板，展示会话事件流、上下文利用率和 Harness 配置 |
| **会话管理** | 按项目分组的持久化会话 — 重启不丢失，支持彩色标签分组 |
| **工作区隔离** | 每个会话/智能体通过沙箱池获得独立工作目录，支持 TTL 自动回收 |
| **上下文引擎** | 3 种策略（完整回放、滑动窗口、压缩）管理上下文窗口 |

### 🏗 架构系统流转图

```
┌─────────────────────────────────────────────────────────────┐
│  前端 (React + Vite)                                        │
│  ┌──────────┐  ┌────────────────┐  ┌──────────────────┐   │
│  │ 会话面板  │  │ 聊天 + 状态栏   │  │ 工作区面板       │   │
│  │ (运行状态 │  │ (阶段、耗时、   │  │ (文件浏览器、    │   │
│  │  指示器)  │  │  输出字节数)    │  │  内联预览)       │   │
│  └──────────┘  └────────────────┘  └──────────────────┘   │
│           ↕ WebSocket（双向、事件驱动）                      │
└─────────────────────────────────────────────────────────────┘
           ↕
┌─────────────────────────────────────────────────────────────┐
│  后端 (Python FastAPI)                                      │
│  ┌───────────────────┐  ┌──────────────────────────────┐   │
│  │ WebSocket 处理器   │  │ 后台任务管理器               │   │
│  │ (非阻塞、事件订阅) │  │ (每执行一个 asyncio.Task，  │   │
│  │                    │  │  阶段生命周期、事件广播)     │   │
│  └───────────────────┘  └──────────────────────────────┘   │
│           ↕                                                 │
│  ┌──────────┐ ┌──────────┐ ┌──────┐ ┌──────┐ ┌─────┐     │
│  │ Gemini   │ │ Claude   │ │Codex │ │Ollama│ │MFLUX│     │
│  │ Hand     │ │ Hand     │ │Hand  │ │Hand  │ │Hand │     │
│  └──────────┘ └──────────┘ └──────┘ └──────┘ └─────┘     │
│           ↕                                                 │
│  ┌──────────────────┐  ┌──────────────────────────────┐    │
│  │ 会话事件管理器    │  │ 沙箱池（TTL 自动回收）       │    │
│  │ (19 种事件类型)   │  │ (每会话隔离工作区)           │    │
│  └──────────────────┘  └──────────────────────────────┘    │
│           ↕                                                 │
│  ┌──────────────────────────────────────────────────┐      │
│  │ sessions.db (SQLite — 项目、会话、消息、事件、配置) │      │
│  └──────────────────────────────────────────────────┘      │
└─────────────────────────────────────────────────────────────┘
```

### ⚡ 后台执行生命周期

```
用户通过 WebSocket 提交提示词
  → BackgroundTaskManager.create_task()
  → asyncio.create_task(run_task(...))         # 非阻塞！
  → WS 循环保持响应，可接收新命令

任务阶段广播到所有 WebSocket 订阅者:
  QUEUED → CONNECTING → EXECUTING → STREAMING → FINALIZING → COMPLETED
                                                            ↘ FAILED

执行期间切换会话:
  • 正在运行的任务继续不受干扰
  • 状态栏持续显示所有活跃任务
  • 侧边栏在运行中的会话上显示旋转指示器
```

### 🚀 快速开始

#### 1. 首次安装
```bash
git clone <repo-url>
cd agent-route
./init.sh
```

`init.sh` 脚本将自动完成：
- 安装 Node.js 工作区依赖
- 从 `.env.example` 创建 `.env` 配置文件
- 创建 Python 虚拟环境并安装依赖包
- 初始化数据库架构
- 创建工作区目录
- 检测可用的 AI CLI 工具

#### 2. 配置 AI 引擎 (`.env`)
```env
ENABLE_GEMINI_CLI=true
ENABLE_CLAUDE_REMOTE_CONTROL=true
ENABLE_CODEX_SERVER=true
ENABLE_OLLAMA_API=true
ENABLE_MFLUX_IMAGE=true
SESSION_WORKSPACE_BASE=./packages/workspaces/sessions
```

#### 3. CLI 工具预授权
```bash
npx @anthropic-ai/claude-code auth login
npx gemini auth login
```

#### 4. 一键启动
```bash
./start.sh
```
打开浏览器访问 **http://localhost:5173**

#### 5. 开发模式手动启动
```bash
# 终端 1: Python 后端
cd packages/api_bridge && venv/bin/uvicorn app.main:app --port 8000 --reload

# 终端 2: React 前端
npm run dev:frontend
```

### 💻 API 参考

#### 会话管理 REST
| 方法 | 端点 | 说明 |
|------|------|------|
| `GET` | `/api/projects` | 获取所有项目 |
| `POST` | `/api/projects` | 创建项目 |
| `GET` | `/api/sessions` | 获取所有会话 |
| `POST` | `/api/sessions` | 创建会话（自动配置隔离工作区） |
| `DELETE` | `/api/sessions/:id` | 删除会话并清理工作区 |
| `GET` | `/api/sessions/:id/messages` | 获取会话聊天记录 |
| `GET` | `/api/sessions/:id/workspace` | 列出工作区文件 |

#### 后台任务管理
| 方法 | 端点 | 说明 |
|------|------|------|
| `GET` | `/api/tasks` | 列出所有运行中/近期后台任务 |
| `GET` | `/api/tasks/running` | 获取有活跃任务的会话 ID |
| `GET` | `/api/tasks/{session_id}` | 获取指定会话的任务 |

#### 智能体与大脑 API
| 方法 | 端点 | 说明 |
|------|------|------|
| `GET` | `/api/agents` | 列出已注册的 Hand 及健康状态 |
| `GET` | `/api/brain/events/:session_id` | 获取会话事件流 |
| `GET` | `/api/brain/harness` | 获取所有 Harness 配置 |
| `GET` | `/models/ollama` | 发现可用的 Ollama 模型 |

#### 执行 API
| 方法 | 端点 | 说明 |
|------|------|------|
| `POST` | `/execute` | 同步 CLI 执行 |
| `POST` | `/execute/stream` | 流式执行（ndjson） |
| `POST` | `/api/multi-agent/run` | 多智能体扇出执行，配合合并策略 |
| `ws` | `/ws/agent` | WebSocket 后台任务支持 |

#### 多智能体请求格式
```json
{
  "agents": ["gemini", "claude"],
  "prompt": "为 auth.py 编写单元测试",
  "session_id": "可选会话ID",
  "strategy": "first_success",
  "timeout": 300.0
}
```

**合并策略：**
| 策略 | 行为 |
|------|------|
| `first_success` | 返回第一个成功的智能体（最快胜出） |
| `best_effort` | 返回所有成功结果，无成功则回退 |
| `majority_vote` | 多数智能体成功即为成功 |
| `all` | 无论结果如何返回所有结果 |

#### WebSocket 协议
```jsonc
// 客户端 → 服务器: 执行提示词
{ "type": "execute_node", "client": "gemini", "prompt": "...", "sessionId": "abc123" }

// 客户端 → 服务器: 多智能体扇出
{ "type": "multi_agent_run", "agents": ["gemini", "claude"], "prompt": "...", "sessionId": "...", "strategy": "first_success" }

// 客户端 → 服务器: 查询运行中任务
{ "type": "query_running" }

// 服务器 → 客户端: 任务状态更新（广播到所有订阅者）
{ "type": "task_status", "taskId": "...", "phase": "streaming", "elapsed_ms": 12400, "output_bytes": 8192 }

// 服务器 → 客户端: 多智能体启动
{ "type": "multi_agent_started", "sessionId": "...", "agents": ["gemini", "claude"], "strategy": "first_success" }

// 服务器 → 客户端: 多智能体完成（含各智能体结果）
{ "type": "multi_agent_completed", "sessionId": "...", "success": true, "selected_agent": "gemini", "all_results": [...] }

// 服务器 → 客户端: 输出块
{ "type": "node_execution_log", "sessionId": "...", "log": "..." }

// 服务器 → 客户端: 执行完成
{ "type": "node_execution_completed", "exitCode": 0 }
```

### 🗄 存储架构

| 层 | 技术 | 用途 |
|----|------|------|
| **本地** | SQLite (`sessions.db`) | 会话、项目、消息、事件、Harness 配置 |
| **边缘** | Cloudflare D1 | 可选云端持久化（通过 `packages/backend`） |
| **制品** | Cloudflare R2 | 二进制素材、生成的图片 |
| **工作区** | 文件系统（沙箱池） | 每会话隔离目录，TTL 自动回收 |
