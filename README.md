# AI Agents Route Service

A powerful, configuration-driven routing service built to unify and orchestrate multiple foundational AI Agent CLIs. This application serves as a localized, hyper-fast multiplexer leveraging a **Python FastAPI** backend to seamlessly structure and stream execution logs from headless Operating System binaries (like Google Gemini CLI, Anthropic Claude Code, and OpenAI Codex) directly into a modernized **React Frontend Dashboard** via WebSockets!

---

## Architecture Overview

The system operates as a unified Desktop-grade software suite bridging two core modules:

1. `packages/frontend`: The React Unified Dashboard. It streams user queries securely via WebSockets directly to the local Python gateway.
2. `packages/api_bridge`: A high-performance Python `FastAPI` instance serving on `http://localhost:8000`. It exposes strongly-typed validation wrappers (Pydantic), WebSockets, and synchronous REST Endpoints. It translates native network payloads down to local OS `child_process.exec` paths autonomously!

*(Note: The legacy Cloudflare `backend` and NodeJS `bridge` have been deprecated in favor of this hyper-localized, ultra-fast Python runtime.)*

---

## 🚀 Step-by-Step Quickstart

### 1. Global Setup Requirements
Ensure your system natively supports the core orchestration runtimes:
- [Node.js](https://nodejs.org/en) (v20+) for building the React SPA
- [Python 3.10+](https://www.python.org/) for building the localized FastAPI core.
- *Any target agents globally installed (e.g., Anthropic Claude Code, Google Gemini CLI)*

### 2. Prepare the Environment
Clone the repository and install the standard workspace dependencies:

```bash
cd cli_route
npm install
```

Copy the global configuration template into the root folder:
```bash
cp .env.example .env
```

### 3. Agent Configuration (.env)
This application scales seamlessly by only routing to AI agents you explicitly "turn on" inside the root configuration file. 
Edit `.env` to precisely enable or disable agents:

```env
ENABLE_CLAUDE_REMOTE_CONTROL=true
ENABLE_GEMINI_CLI=true
ENABLE_CODEX_SERVER=false
```

>*Note: If you disable an agent, the FastAPI bridge will proactively block traffic attempting to execute its OS pathways.*

### 4. Special Headless Authentications

#### • Claude Auth Login
Because this framework leverages autonomous headless Python execution mapping to `--dangerously-skip-permissions`, you **must** authenticate Claude interactively on your machine first natively through your web browser. Follow this standard sequence locally:
```bash
npx @anthropic-ai/claude-code auth login
```
*(Complete the browser login process! Once officially authorized, our background Python API handles everything seamlessly without interactive prompts!)*

### 5. Starting the Fleet
Because this pipeline relies on dual ecosystems, we created a single intelligent shell sequence designed to generate Python virtual environments autonomically and spin up React background sub-servers simultaneously cleanly!

```bash
./start.sh
```
*This sequence instantly daemonizes your Python `uvicorn` endpoints and React interface, natively isolating processes into the background while securely honoring your `.env` constraints!*

Local text processing logstreams are written natively to:
- `bridge.log` (Python Execution Pipeline logs!)
- `frontend.log` (React UI compilation warnings)

### 6. Operation
Navigate natively to `http://localhost:5173`. 
Select any dynamically active AI Engine on the sidebar, issue any prompt (e.g. "Draft me a python script in this folder"), and interact exactly as if you were running the agent recursively inside your own terminal! 

When you're finished using the routing bridge, permanently collapse the daemons:
```bash
./stop.sh
```

---

## 💻 External Developer Access
Because the underlying architecture leverages **FastAPI**, you are absolutely not constrained to use the React Graphic Interface natively! You can integrate any separate macro, tool, or script with the core executing routing layer synchronously:

**`POST http://127.0.0.1:8000/execute`**
```json
{
  "client": "gemini",
  "prompt": "Evaluate system stability."
}
```
