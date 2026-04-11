# How-To Guide — Agent Route API Bridge

> Practical recipes and examples for common tasks.

## Table of Contents

- [Getting Started](#getting-started)
- [Recipe 1: Run Your First Agent](#recipe-1-run-your-first-agent)
- [Recipe 2: Streaming Execution with NDJSON](#recipe-2-streaming-execution-with-ndjson)
- [Recipe 3: WebSocket Integration](#recipe-3-websocket-integration)
- [Recipe 4: Multi-Agent Comparison](#recipe-4-multi-agent-comparison)
- [Recipe 5: Session Management](#recipe-5-session-management)
- [Recipe 6: Build and Run a Workflow](#recipe-6-build-and-run-a-workflow)
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

## Getting Started

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
# Option 1: One-command start
./start.sh

# Option 2: Development mode (with hot reload)
cd packages/api_bridge
venv/bin/uvicorn app.main:app --port 8000 --reload
```

The API is now available at `http://localhost:8000`.

### Verify the service is running

```bash
curl http://localhost:8000/api/agents
```

You should see a JSON list of registered agents.

---

## Recipe 1: Run Your First Agent

The simplest way to execute an AI agent: **synchronous HTTP call**.

### Using curl

```bash
# Ask Gemini to write a Python function
curl -X POST http://localhost:8000/execute \
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
print(f"Output:\n{result['output']}")
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
# Claude Code
curl -X POST http://localhost:8000/execute \
  -d '{"client": "claude", "prompt": "Review this code for bugs"}'

# Codex
curl -X POST http://localhost:8000/execute \
  -d '{"client": "codex", "prompt": "Refactor this function"}'

# Ollama (local LLM)
curl -X POST http://localhost:8000/execute \
  -d '{"client": "ollama", "prompt": "Explain quantum computing", "model": "llama3"}'

# MFLUX (image generation)
curl -X POST http://localhost:8000/execute \
  -d '{"client": "mflux", "prompt": "A sunset over Tokyo skyline, cinematic"}'
# Response includes "image_b64" field with the generated image
```

---

## Recipe 2: Streaming Execution with NDJSON

For long-running tasks, use streaming to get output in real-time.

### Using curl

```bash
curl -X POST http://localhost:8000/execute/stream \
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
            print(f"\n\n✅ Done (exit code: {event['exitCode']})")
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
  
  const lines = decoder.decode(value).split("\n").filter(Boolean);
  for (const line of lines) {
    const event = JSON.parse(line);
    if (event.type === "node_execution_log") {
      process.stdout.write(event.log);
    }
  }
}
```

---

## Recipe 3: WebSocket Integration

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
      console.log(`\n✅ Done (exit ${data.exitCode})`);
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
                print(f"\n✅ Exit code: {event['exitCode']}")
                break

asyncio.run(main())
```

---

## Recipe 4: Multi-Agent Comparison

Run the same prompt against multiple agents and compare results.

### Run and Compare

```bash
curl -X POST http://localhost:8000/api/multi-agent/run \
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
    print(f"\n{'='*60}")
    print(f"Agent: {agent_result['agent']}")
    print(f"Success: {agent_result['success']}")
    print(f"Time: {agent_result['elapsed_ms']}ms")
    print(f"Output:\n{agent_result['output'][:500]}")
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

## Recipe 5: Session Management

Sessions provide persistent conversation history and isolated workspaces.

### Create and Use a Session

```bash
# Create a session
SESSION=$(curl -s -X POST http://localhost:8000/api/sessions \
  -H "Content-Type: application/json" \
  -d '{"title": "Research Session", "agent_type": "gemini"}' \
  | python3 -c "import sys,json; print(json.load(sys.stdin)['id'])")

echo "Created session: $SESSION"

# Execute in the session (via WebSocket or REST)
curl -X POST http://localhost:8000/execute \
  -d "{\"client\": \"gemini\", \"prompt\": \"Hello!\", \"workspace_id\": \"$SESSION\"}"

# View messages
curl http://localhost:8000/api/sessions/$SESSION/messages | python3 -m json.tool

# View session events (for Brain Inspector)
curl "http://localhost:8000/api/sessions/$SESSION/events?limit=50" | python3 -m json.tool
```

### Organize Sessions with Projects

```bash
# Create a project
PROJECT=$(curl -s -X POST http://localhost:8000/api/projects \
  -d '{"name": "AI Research", "description": "Daily research tasks", "color": "#6366f1"}' \
  | python3 -c "import sys,json; print(json.load(sys.stdin)['id'])")

# Create a session in the project
curl -X POST http://localhost:8000/api/sessions \
  -d "{\"project_id\": \"$PROJECT\", \"title\": \"Morning Research\", \"agent_type\": \"gemini\"}"

# List sessions filtered by project
curl "http://localhost:8000/api/sessions?project_id=$PROJECT"
```

### Session Lifecycle

```bash
# Wake a session (load state into memory)
curl -X POST http://localhost:8000/api/sessions/$SESSION/wake

# Checkpoint (save state for recovery)
curl -X POST http://localhost:8000/api/sessions/$SESSION/checkpoint

# Get session summary
curl http://localhost:8000/api/sessions/$SESSION/summary
```

---

## Recipe 6: Build and Run a Workflow

Workflows chain multiple agent steps together.

### Create a Workflow

```bash
curl -X POST http://localhost:8000/api/workflows \
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
# Option 1: New session (auto-created)
WORKFLOW_ID="your-workflow-id"
curl -X POST "http://localhost:8000/api/workflows/$WORKFLOW_ID/run" \
  -d '{"session_title": "AI News — April 11"}'

# Option 2: In existing session
curl -X POST "http://localhost:8000/api/sessions/$SESSION/run-workflow" \
  -d "{\"workflow_id\": \"$WORKFLOW_ID\"}"
```

### Monitor Execution

```bash
# Check run status
RUN_ID="your-run-id"
curl "http://localhost:8000/api/workflow-runs/$RUN_ID"

# View the session messages (workflow output appears here)
curl "http://localhost:8000/api/sessions/$SESSION/messages" | python3 -m json.tool

# Cancel a running workflow
curl -X POST "http://localhost:8000/api/workflow-runs/$RUN_ID/cancel"
```

---

## Recipe 7: Cross-Session Context Sharing

Link sessions to share context — the agent in one session can access knowledge from another.

### Link Two Sessions

```bash
# You have two sessions: a research session and an analysis session
RESEARCH_SESSION="sess_research_123"
ANALYSIS_SESSION="sess_analysis_456"

# Link: analysis session references research session
curl -X POST "http://localhost:8000/api/sessions/$ANALYSIS_SESSION/context-links" \
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
# Check context links
curl "http://localhost:8000/api/sessions/$ANALYSIS_SESSION/context-links" | python3 -m json.tool

# View linked messages
curl "http://localhost:8000/api/sessions/$ANALYSIS_SESSION/linked-messages" | python3 -m json.tool
```

### Use Shared Context in Agent Invocations

```bash
# The shared context endpoint merges linked session data:
curl "http://localhost:8000/api/brain/$ANALYSIS_SESSION/context/shared?agent=gemini" \
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
curl -X DELETE "http://localhost:8000/api/context-links/$LINK_ID"
```

---

## Recipe 8: Fork a Session

Create a branch of an existing session — copies recent messages and creates an automatic link.

### Fork with Message History

```bash
# Fork with the last 10 messages
curl -X POST "http://localhost:8000/api/sessions/$SESSION/fork" \
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
# Original session: researching a topic
# Fork to try a different angle
FORK=$(curl -s -X POST "http://localhost:8000/api/sessions/$SESSION/fork" \
  -d '{"title": "Alt approach: ML-based", "copy_messages": 5}' \
  | python3 -c "import sys,json; print(json.load(sys.stdin)['id'])")

# Now execute in the fork — it has context from the parent
# but changes here don't affect the original session
```

---

## Recipe 9: Use the Brain Inspector

The Brain Inspector provides deep visibility into session internals.

### Get Session Events (Event Log)

```bash
# All events
curl "http://localhost:8000/api/sessions/$SESSION/events"

# Filtered by type
curl "http://localhost:8000/api/sessions/$SESSION/events?event_types=message.user,message.agent"

# Since a specific event
curl "http://localhost:8000/api/sessions/$SESSION/events?since_id=42"
```

### Context Utilization

```bash
# How much context budget is used?
curl "http://localhost:8000/api/brain/$SESSION/context/stats?agent=gemini" \
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
# "What happened before event #42?"
curl "http://localhost:8000/api/brain/$SESSION/context/rewind?before_event_id=42&count=10"
```

### Harness Configuration

```bash
# View all agent harness configs
curl http://localhost:8000/api/harnesses | python3 -m json.tool

# View specific agent
curl http://localhost:8000/api/harnesses/gemini
```

---

## Recipe 10: File Upload and Workspace Management

### Upload Files to a Session

```bash
# Upload a document
curl -X POST "http://localhost:8000/api/upload/$SESSION" \
  -F "file=@/path/to/document.pdf"

# Upload multiple files
for f in *.py; do
  curl -X POST "http://localhost:8000/api/upload/$SESSION" \
    -F "file=@$f"
done
```

### Browse Session Workspace

```bash
# List all files
curl "http://localhost:8000/api/sessions/$SESSION/files" | python3 -m json.tool

# Read a specific file
curl "http://localhost:8000/api/sessions/$SESSION/workspace/read?path=output.py"

# Full workspace tree
curl "http://localhost:8000/api/sessions/$SESSION/workspace" | python3 -m json.tool
```

---

## Recipe 11: Generate Daily Reports

### Auto-Generate a Report

```bash
# Generate today's report using Gemini
curl -X POST http://localhost:8000/api/reports/generate \
  -H "Content-Type: application/json" \
  -d '{"agent": "gemini"}'

# Generate report for a specific date
curl -X POST http://localhost:8000/api/reports/generate \
  -d '{"date": "2026-04-10", "days": 1, "agent": "gemini"}'

# Generate a 7-day summary
curl -X POST http://localhost:8000/api/reports/generate \
  -d '{"days": 7, "agent": "claude"}'
```

### Browse Reports

```bash
# List all saved reports
curl http://localhost:8000/api/reports

# Get report by date
curl http://localhost:8000/api/reports/date/2026-04-10

# Raw daily stats (without AI narrative)
curl "http://localhost:8000/api/reports/daily?date=2026-04-10"
```

---

## Recipe 12: Agent Health Monitoring

### Check All Agents

```bash
curl http://localhost:8000/api/agents | python3 -c "
import sys, json
agents = json.load(sys.stdin)
for a in agents:
    status = '✅' if a.get('available', False) else '❌'
    print(f'{status} {a[\"name\"]:10} type={a.get(\"type\",\"?\")}')
"
```

### Health Check

```bash
curl http://localhost:8000/api/hands/health
```

### Discover Ollama Models

```bash
curl http://localhost:8000/models/ollama | python3 -c "
import sys, json
data = json.load(sys.stdin)
for m in data.get('models', []):
    print(f'  {m[\"name\"]:30} {m.get(\"size\",\"\")}')
"
```

---

## Recipe 13: Context Engine Debugging

### Compare Context Strategies

```python
import requests

session_id = "your-session-id"

# Try different agents (each has different context budgets)
for agent in ["gemini", "claude", "codex"]:
    stats = requests.get(
        f"http://localhost:8000/api/brain/{session_id}/context/stats",
        params={"agent": agent}
    ).json()
    
    print(f"\n{agent}:")
    print(f"  Budget:      {stats['budget']:>10,} tokens")
    print(f"  Used:        {stats['estimated_tokens']:>10,} tokens")
    print(f"  Utilization: {stats['utilization']:>9.1%}")
    print(f"  Strategy:    {stats['strategy_if_built']}")
```

### Inspect Shared Context

```python
import requests

session_id = "your-session-id"

# Regular context vs shared context
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

## Recipe 14: Build a Custom Integration

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

# Usage:
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
      for (const line of decoder.decode(value).split("\n").filter(Boolean)) {
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

## Troubleshooting

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
# Check context utilization
curl "http://localhost:8000/api/brain/$SESSION/context/stats?agent=gemini"
```

If utilization is > 80%, the context engine will auto-compact. You can also:
- Create a checkpoint: `POST /api/sessions/$SESSION/checkpoint`
- Fork the session with fewer messages: `POST /api/sessions/$SESSION/fork`

### Workflow Stuck

```bash
# Check run status
curl "http://localhost:8000/api/workflow-runs/$RUN_ID"

# Cancel if needed
curl -X POST "http://localhost:8000/api/workflow-runs/$RUN_ID/cancel"
```

### Port Already in Use

```bash
# Kill existing processes
lsof -ti:8000 | xargs kill -9   # Backend
lsof -ti:5173 | xargs kill -9   # Frontend
```
