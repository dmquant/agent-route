# AI Agents Route Service (AI 终端控制网关)

[English](#english) | [简体中文](#简体中文)

---

<a id="english"></a>
## 🇬🇧 English Documentation

A powerful, configuration-driven routing service built to unify and orchestrate multiple foundational AI Agent CLIs. This application serves as a localized multiplexer leveraging a **Python FastAPI** backend to seamlessly structure and stream execution logs from headless Operating System binaries (like Google Gemini CLI, Anthropic Claude Code, and OpenAI Codex) directly into a modernized **React Frontend Dashboard** via WebSockets.

### 🏗 Architecture Overview

```mermaid
graph TD
    classDef ui fill:#4a90e2,stroke:#333,stroke-width:2px,color:#fff;
    classDef api fill:#50e3c2,stroke:#333,stroke-width:2px,color:#333;
    classDef os fill:#f5a623,stroke:#333,stroke-width:2px,color:#fff;

    A["Browser / Desktop UI"]:::ui -->|"WebSocket :8000/ws/agent"| B("Python FastAPI Gateway"):::api
    A -->|"Synchronous POST :8000/execute"| B
    
    subgraph Local Execution Orchestrator
    B -->|"Evaluate .env rules"| C{"Security Gateway"}:::api
    C -->|"Gemini Enabled"| G["npx gemini -p --output-format json"]:::os
    C -->|"Claude Enabled"| CL["npx claude-code --dangerously-skip-permissions"]:::os
    C -->|"Codex Enabled"| CO["npx codex exec --json"]:::os
    C -->|"Ollama Enabled"| OL["HTTP Stream (httpx) to 11434"]:::os
    end
```

#### Message Sequence Flowchart
```mermaid
sequenceDiagram
    autonumber
    actor User
    participant UI as React Frontend
    participant API as Python FastAPI
    participant ENV as .env Configuration
    participant CLI as Host Subprocess

    User->>UI: Selects Node & Submits Prompt
    UI->>API: JSON over WebSocket (type: execute_node)
    
    API->>ENV: Validate explicitly enabled flags
    alt Flag is Missing or False
        API-->>UI: WebSocket (node_execution_log): ❌ Route Disabled
    else Flag is True
        API->>UI: WebSocket (type: node_execution_started)
        API->>CLI: asyncio.create_subprocess_exec (inject strict flags)
        
        loop Process Execution Lifecycle
            CLI-->>API: stdout/stderr text chunks streamed natively
            API-->>UI: WebSocket (type: node_execution_log)
        end
        
        CLI-->>API: Exit code detected
        API-->>UI: WebSocket (type: node_execution_completed)
    end
```

1. `packages/frontend`: The React UI. It streams user queries securely via WebSockets directly to the local Python gateway.
2. `packages/api_bridge`: A high-performance Python `FastAPI` instance serving on `http://localhost:8000`. It translates native JSON network payloads down to local OS pathways autonomously.

### 🚀 Step-by-Step Quickstart

#### 1. System Requirements & Python Installation
- [Node.js](https://nodejs.org/en) (v20+) for building the React SPA
- **Python 3.10+** for the localized FastAPI core. If you do not have Python installed, please follow your system instructions below:

  **macOS (via Homebrew):**
  ```bash
  brew install python@3.11
  ```
  **Ubuntu / Debian:**
  ```bash
  sudo apt update && sudo apt install python3 python3-venv python3-pip
  ```
  **Windows:** Download the official installer from [Python.org](https://www.python.org/downloads/windows/) (ensure "Add python.exe to PATH" is checked during installation!).

- *Your target AI CLI tools installed globally (e.g., `npm i -g @anthropic-ai/claude-code`, etc)*

#### 2. Prepare the Environment
Clone the repository and install the standard workspace dependencies:
```bash
npm install
```

Copy the global configuration template into the root folder:
```bash
cp .env.example .env
```

If you are not using our automated `./start.sh` script, you **must** manually initialize the Python environment and install `uvicorn` and `fastapi`:
```bash
cd packages/api_bridge
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
```

#### 3. Manage Your AI Engines (.env)
Edit `.env` to precisely enable or disable agents. The local Python Daemon will block traffic to any agent set to `false`.
```env
ENABLE_CLAUDE_REMOTE_CONTROL=true
ENABLE_GEMINI_CLI=true
ENABLE_CODEX_SERVER=false
ENABLE_OLLAMA_API=true
OLLAMA_BASE_URL=http://localhost:11434
```

#### 4. Claude Pre-Authentication
If you intend to use Claude, you **must** authenticate it interactively on your machine first natively through your web browser. This generates the core session tokens so the Python Backend can securely bypass the interactive prompts in headless mode!
```bash
npx @anthropic-ai/claude-code auth login
```

#### 5. Starting the Application
```bash
./start.sh
```
*This smart script will automatically initialize the Python virtual environment (`venv`), install Python dependencies, start the FastAPI server on port 8000, and launch the React UI on port 5173 natively in the background.*

All system logs are completely safely configured to write to:
- `bridge.log`
- `frontend.log`

Navigate to `http://localhost:5173` to use the Dashboard! When finished, terminate all processes natively:
```bash
./stop.sh
```

#### 6. Advanced Ollama & MFLUX Remote Setup
If you are pointing the system to a remote node API (e.g., `http://192.168.0.2:8000` / `11434`) for generative tasks:

**Ollama Setup Guide:**
1. **Installation:** Download Ollama from [ollama.com](https://ollama.com).
2. **Download Models:** Run `ollama pull llama3` or `ollama pull mistral` natively on your target machine.
3. **Allowing LAN Access:** By default, Ollama only listens to `localhost`! To allow your Agent Route Service to see Ollama across the network, you must tell Ollama to bind to `0.0.0.0`:
   - **macOS:** Open Terminal and type `launchctl setenv OLLAMA_HOST "0.0.0.0"`, then completely restart the Ollama app.
   - **Linux:** Add `Environment="OLLAMA_HOST=0.0.0.0"` into the `[Service]` section of your `/etc/systemd/system/ollama.service` file, run `systemctl daemon-reload`, and `systemctl restart ollama`.

**MFLUX Image Generation Notes:**
- **Zero-Timeout:** The Python gateway explicitly disables timeouts for graphic generation.
- **Cold Booting:** The very first request you send to MFLUX may take up to several minutes! This occurs because the remote API node must download gigabytes of model weights into its Hugging Face cache.
- **Firewall:** Ensure you have allowed inbound Python traffic on your MacOS/Linux firewall (System Settings → Network → Firewall) for your chosen remote ports.

#### 7. Example Output (MFLUX Qwen-Image)
Here is an example of the Agent Route Service orchestrating a visual render over the LAN to the `mlx-community/Qwen-Image-2512-8bit` LLM node:

**Prompt:** `A futuristic cybernetic tiger roaming a neon city`

**Result:**
![QWen Image Result](public/images/download.png)

#### 8. Cloudflare Backend Initialization
If you intend to use the Hono (`packages/backend`) infrastructure for D1 SQLite databases, R2 storage, or Vectorize, you must initialize your Cloudflare environment first:
```bash
# 1. Authenticate with Wrangler
cd packages/backend
npx wrangler login

# 2. Provision Storage Infrastructure
npx wrangler d1 create cli_db
npx wrangler r2 bucket create cli-route-artifacts
npx wrangler vectorize create cli-route-idx --dimensions=1536 --metric=cosine

# 3. Update Configuration and Push DB Schema
# [IMPORTANT] Paste the new D1 database_id into wrangler.toml before running this!
npx wrangler d1 execute cli_db --local --file=./schema.sql

# 4. Deploy!
npm run dev
```

### 💻 External API Access (Integrations)
Because the core architecture leverages **FastAPI**, you can bypass the React UI entirely! This makes it incredibly easy to connect any desktop automation app, mobile app, or Python script directly to your Agent network.

#### 1. Synchronous REST Execution
**`POST http://127.0.0.1:8000/execute`**
Waits for the process to fully complete and returns the raw final output.
- **Payload (`application/json`):**
  ```json
  {
    "client": "gemini", // Options: "gemini", "claude", "codex", "ollama", "mflux"
    "prompt": "Evaluate system stability."
  }
  ```
  *(Note: If calling `"ollama"`, you must provide the `"model"` explicitly in the payload keys)*
  ```json
  {
    "client": "ollama",
    "prompt": "Why is the sky blue?",
    "model": "llama3"
  }
  ```
- **Response:**
  ```json
  {
    "output": "System is operating normally at 99%.",
    "exitCode": 0
  }
  ```

#### 2. Streaming REST Execution (ndjson)
**`POST http://127.0.0.1:8000/execute/stream`**
For apps that cannot use WebSockets but still need real-time chunked stream text. This natively yields `application/x-ndjson` blocks!
- **Payload (`application/json`):**
  *(Identical array to synchronous execution above)*
- **Response (`application/x-ndjson`):**
  ```json
  {"type": "node_execution_started"}
  {"type": "node_execution_log", "log": "Evaluating..."}
  {"type": "node_execution_completed", "exitCode": 0}
  ```
- **Terminal cURL Example (Gemini):**
  ```bash
  curl -N -X POST http://127.0.0.1:8000/execute/stream \
       -H "Content-Type: application/json" \
       -d '{"client":"gemini","prompt":"Why is water wet?"}'
  ```

#### 3. Dynamic Model Discovery
**`GET http://127.0.0.1:8000/models/ollama`**
If you have `Ollama` enabled, dynamically fetches the specific names of cached local models you can pass.
- **Response:**
  ```json
  {
    "models": ["llama3", "mistral"]
  }
  ```

#### 3. Realtime Streaming WebSockets (Advanced)
**`ws://127.0.0.1:8000/ws/agent`**
Used for real-time applications where you want instantaneous chunk-by-chunk log streaming or graphical binary payload tracking.
- **Client Sends:**
  ```json
  {
    "type": "execute_node",
    "client": "mflux",
    "prompt": "Cybernetic tiger",
    "model": "optional_model_name"
  }
  ```
- **Server Streams Back:**
  ```json
  // Initial Handshake
  { "type": "node_execution_started", "nodeId": "1234..." }

  // Streamed Chat Logs
  { "type": "node_execution_log", "nodeId": "1234...", "log": "[System] Connecting..." }

  // Graphical Render Layer (Base64)
  { "type": "node_execution_image", "nodeId": "1234...", "b64": "iVBORw0KGgo..." }

  // Termination Signal
  { "type": "node_execution_completed", "nodeId": "1234...", "exitCode": 0 }
  ```

---

<a id="简体中文"></a>
## 🇨🇳 简体中文文档

一个强大且基于配置驱动的路由网关，旨在统一管理与调用各类底层 AI Agent CLI（命令行工具）。本项目作为一个本地化的调度中心，通过 **Python FastAPI** 后端将底层无头命令行程序（如 Google Gemini CLI, Anthropic Claude Code, OpenAI Codex）的标准输出结构化，并通过 WebSocket 协议实时呈现在包含现代化交互的 **React 前端面板** 中。

### 🏗 架构系统流转图

```mermaid
graph TD
    classDef ui fill:#4a90e2,stroke:#333,stroke-width:2px,color:#fff;
    classDef api fill:#50e3c2,stroke:#333,stroke-width:2px,color:#333;
    classDef os fill:#f5a623,stroke:#333,stroke-width:2px,color:#fff;

    A["Browser / Desktop UI"]:::ui -->|"WebSocket实时流 :8000/ws/agent"| B("Python FastAPI 后端"):::api
    A -->|"POST 同步接口 :8000/execute"| B
    
    subgraph 本地核心执行环境
    B -->|"读取 .env 根配置"| C{"拦截控制器"}:::api
    C -->|"验证 Gemini 为启用"| G["npx gemini -p --output-format json"]:::os
    C -->|"验证 Claude 为启用"| CL["npx claude-code --dangerously-skip-permissions"]:::os
    C -->|"验证 Codex 为启用"| CO["npx codex exec --json"]:::os
    C -->|"验证 Ollama 为启用"| OL["原生 HTTP 流 (httpx) 通信 11434"]:::os
    end
```

#### 实时通信握手协议
```mermaid
sequenceDiagram
    autonumber
    actor 用户
    participant UI as React 视图
    participant API as FastAPI 进程
    participant ENV as 环境变量配置
    participant CLI as 操作系统子进程

    用户->>UI: 下发操作指令并选择大模型节点
    UI->>API: 经由 WebSocket 发送标准 JSON (execute_node)
    
    API->>ENV: 本地比对 ENABLE_XXX_CLI 配置项真伪
    alt 验证配置未开启或丢失
        API-->>UI: WebSocket回传流: ❌ 本地路由策略拒绝连接
    else 验证配置激活通过
        API->>UI: WebSocket下发: type: node_execution_started (执行开始信号)
        API->>CLI: 触发异步子进程任务（自动注入无头安全参数）
        
        loop 全生命周期状态同步
            CLI-->>API: 操作系统底层流式回传标准输出(stdout)文本块
            API-->>UI: 拦截并以 WebSocket 发送 (type: node_execution_log)
        end
        
        CLI-->>API: OS反馈子进程退出状态码
        API-->>UI: 触发结束动作 (type: node_execution_completed)
    end
```

1. `packages/frontend`: React 前端交互面板，通过 WebSocket 将用户的任务指令直接流式传输到本地 Python 网关。
2. `packages/api_bridge`: 运行在 `http://localhost:8000` 端口的高性能 Python `FastAPI` 后端。它负责将网络 JSON 载荷解析，并安全地生成对应的操作系统原生常驻子进程。

### 🚀 安装与运行步骤

#### 1. 系统要求与 Python 安装指南
- [Node.js](https://nodejs.org/en) (v20+)：用于构建 React 前端应用。
- **Python 3.10+**：用于部署本地的 FastAPI 核心桥接器。如果你还未安装 Python，请根据你的系统执行以下安装步骤：

  **macOS (推荐通过 Homebrew):**
  ```bash
  brew install python@3.11
  ```
  **Ubuntu / Debian (Linux):**
  ```bash
  sudo apt update && sudo apt install python3 python3-venv python3-pip
  ```
  **Windows:** 请前往 [Python.org](https://www.python.org/downloads/windows/) 下载官方安装包（**安装时务必勾选 "Add python.exe to PATH"**！）。

- *全局安装你想要使用的 AI 命令行工具 (例如：`npm i -g @anthropic-ai/claude-code` 等)*

#### 2. 环境初始化
克隆本项目，随后在根目录下安装工程核心依赖：
```bash
npm install
```

从示例中生成你的专属环境变量：
```bash
cp .env.example .env
```

如果您不打算使用我们自动化打包的 `./start.sh`，您首要的动作必须是**手动初始化** Python 的隔离环境并安装 `uvicorn` 与 `fastapi` 桥接依赖：
```bash
cd packages/api_bridge
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
```

#### 3. 灵活管理 AI 引擎开启状态 (.env)
打开 `.env` 文件，精确控制 AI 工具的运行权限。任何被设置为 `false` 的服务，本地 Python 防火墙将主动拒绝并拦截前往该工具的网络请求。
```env
ENABLE_CLAUDE_REMOTE_CONTROL=true
ENABLE_GEMINI_CLI=true
ENABLE_CODEX_SERVER=false
ENABLE_OLLAMA_API=true
OLLAMA_BASE_URL=http://localhost:11434
```

#### 4. Claude 账号预授权
由于框架基于底层的 `--dangerously-skip-permissions` 全自动权限跳过机制运行，在首次运行前，你 **必须** 至少进行一次手动终端身份验证，在浏览器内授权你的账号。
```bash
npx @anthropic-ai/claude-code auth login
```

#### 5. 一键启动服务
```bash
./start.sh
```
*这个执行脚本将自动创建 Python 的虚拟容器 (`venv`)，拉取依赖体系，在 8000 端口后台启动 FastAPI 网关，并在 5173 端口后台部署可视化的 React 界面。*

所有的系统运行日志将默认保存在根目录，供你随时调试：
- `bridge.log` （包含模型调用的所有 Python 执行记录）
- `frontend.log`

请在浏览器打开 `http://localhost:5173` 使用终端全功能！当你想关闭全部关联进程时，仅需执行：
```bash
./stop.sh
```

#### 6. Ollama 与 MFLUX 远程节点高级配置
如果您正在将系统指向局域网的远程 API 节点 (例如 `http://192.168.0.2:8000` 或 `11434`) 执行生成任务：

**Ollama 环境部署指南:**
1. **安装软件:** 前往 [ollama.com](https://ollama.com) 下载。
2. **预装模型:** 必须在目标机中提前运行 `ollama pull llama3` 或 `ollama pull mistral`。由于底层桥接器调用机制，面板会直接读取已缓存的模型列表。
3. **开启局域网唤醒:** 默认状况下，Ollama 仅限本机通信！如果要将其他机器的 Ollama 作为算力节点，您必须开启 `0.0.0.0` 绑定：
   - **macOS 宿主机:** 打开终端执行 `launchctl setenv OLLAMA_HOST "0.0.0.0"`，随后在状态栏彻底重启 Ollama 应用图标才会生效！
   - **Linux 宿主机:** 编辑 `/etc/systemd/system/ollama.service` 文件，在 `[Service]` 下方插入 `Environment="OLLAMA_HOST=0.0.0.0"`，然后分别执行 `systemctl daemon-reload` 和 `systemctl restart ollama`。

**MFLUX 图像生成网络避坑:**
- **无超时设定:** Python 网关已明确移除了对长时间图像生成任务的超时限制。
- **首次冷启动缓存:** 您向 MFLUX 发送的**第一条**图像请求可能会耗费数分钟的时间！因为这取决于远程节点通过 Hugging Face 完整下载并加载数百MB甚至数GB模型权重的速度。
- **防火墙设定:** 请确保您已在承载远程节点的电脑管家或 macOS 防火墙（系统设置 → 网络）中对相关端口放行了入站流量。

#### 7. 渲染示例 (MFLUX Qwen-Image)
以下是 Agent Route Service 通过局域网跨系统调用 `mlx-community/Qwen-Image-2512-8bit` 节点并实时传回前端的渲染结果展示：

**Prompt 提示词:** `A futuristic cybernetic tiger roaming a neon city`

**Result 渲染结果:**
![QWen Image Result](public/images/download.png)

#### 8. Cloudflare 边缘环境初始化
若您计划启用核心 Hono 后端 (`packages/backend`) 以关联 D1 数据库、R2 对象存储或 Vectorize 向量检索引擎，您必须优先初始化并绑定您的 Cloudflare 账号：
```bash
# 1. 登录并校验 Wrangler CLI
cd packages/backend
npx wrangler login

# 2. 创建核心资源环境
npx wrangler d1 create cli_db
npx wrangler r2 bucket create cli-route-artifacts
npx wrangler vectorize create cli-route-idx --dimensions=1536 --metric=cosine

# 3. 关联配置并推送初始数据表结构
# [非常重要] 在执行以下操作前，必须将上一步生成的 D1 database_id 映射替换至 wrangler.toml 文件中！
npx wrangler d1 execute cli_db --local --file=./schema.sql

# 4. 本地启动或边缘部署
npm run dev
```

### 💻 外部开发者 API 介入指南
由于底层使用 **FastAPI** 直接重构，你不受任何 React 用户界面的限制！你可以非常轻松地将任何桌面自动化工具、移动端 App 或外部 Python 脚本直接作为客户端接入底层桥接器。

#### 1. 同步阻塞执行接口 (REST)
**`POST http://127.0.0.1:8000/execute`**
挂起连接直至底层完全执行完毕并一次性返回最终结果。
- **发送载荷 (`application/json`):**
  ```json
  {
    "client": "gemini", // 支持: "gemini", "claude", "codex", "ollama", "mflux"
    "prompt": "Evaluate system stability."
  }
  ```
  *(注意：若您正在向后端发起 `"ollama"` 的通讯请求，请务必在底包中附带目标模型名称 `"model"：`)*
  ```json
  {
    "client": "ollama",
    "prompt": "天空为什么是蓝色的？",
    "model": "qwen"
  }
  ```
- **返回结果:**
  ```json
  {
    "output": "系统运行稳定，CPU 负载 5%。",
    "exitCode": 0
  }
  ```

#### 2. 流式单次阻塞请求 (ndjson)
**`POST http://127.0.0.1:8000/execute/stream`**
这是一个不需要管理 WebSocket 生命周期但依旧享有极速文本块传输的高级 REST 接口。它使用 `application/x-ndjson` 分块技术返回。
- **发送载荷 (`application/json`):**
  *(同上述同步发送载荷一致)*
- **返回结果逐行回传 (`application/x-ndjson`):**
  ```json
  {"type": "node_execution_started"}
  {"type": "node_execution_log", "log": "正在调用..."}
  {"type": "node_execution_completed", "exitCode": 0}
  ```
- **终端 cURL 测试指令指令 (以 Ollama 为例):**
  ```bash
  curl -N -X POST http://127.0.0.1:8000/execute/stream \
       -H "Content-Type: application/json" \
       -d '{"client":"ollama","prompt":"写一首关于秋天的诗。","model":"llama3"}'
  ```

#### 3. 动态模型发现接口
**`GET http://127.0.0.1:8000/models/ollama`**
如果您启用了 Ollama 节点，此接口可被用来自动扫描所有局域网电脑中实际已下载的模型。
- **返回结果:**
  ```json
  {
    "models": ["llama3", "mistral", "qwen"]
  }
  ```

#### 3. 全局实时 WebSocket 流 (高级功能)
**`ws://127.0.0.1:8000/ws/agent`**
专为需要毫秒级文本流截获或处理多媒体 Base64 发行的前端开发者而设。
- **客户端发送:**
  ```json
  {
    "type": "execute_node",
    "client": "mflux",
    "prompt": "Cybernetic tiger",
    "model": "选填的模型名称"
  }
  ```
- **服务端实时回传多包格式:**
  ```json
  // 发送握手信号
  { "type": "node_execution_started", "nodeId": "1234..." }

  // 纯文本日志块 (高频散列包)
  { "type": "node_execution_log", "nodeId": "1234...", "log": "[System] Connecting..." }

  // 图像数组渲染截获底包 (纯 Base64 )
  { "type": "node_execution_image", "nodeId": "1234...", "b64": "iVBORw0KGgo..." }

  // 任务生命周期终止信号
  { "type": "node_execution_completed", "nodeId": "1234...", "exitCode": 0 }
  ```
