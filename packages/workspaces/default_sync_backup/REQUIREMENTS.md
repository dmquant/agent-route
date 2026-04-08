# Requirements Document: Analyst

**Project:** Analyst — Professional AI Analyst Platform
**Version:** 2.0
**Date:** 2026-04-07
**Status:** Draft (Revised)

---

## 1. Executive Summary

Analyst is a professional multi-agent AI analysis platform built within the `cli_route` monorepo. The system orchestrates six specialized analyst agents — Macro, Technical, Fundamental, Sentiment, Risk, and Quantitative — to produce comprehensive, data-driven research reports on equities and market conditions.

The platform leverages an existing infrastructure stack comprising a React 19 frontend, a FastAPI WebSocket gateway (`api_bridge`), and integrations with multiple AI backends (Ollama, Claude, Gemini, Codex, MFLUX). Analysis results are streamed in real time, persisted to PostgreSQL with Redis caching, and published via Kafka event streaming.

**Current State (Phase 1):** The infrastructure foundation is operational — agent base classes, database schema (4 schemas, 6 tables), API scaffolding, health checks, and the routing gateway are in place. All six agents exist as placeholder implementations returning mock data.

**Target State (Phase 2):** Connect agents to LLMs with domain-specific prompt engineering, implement multi-agent orchestration and report consolidation, enable user feedback loops, build the task creation UI, and integrate external market data sources.

**Scope:** This document covers the full Analyst platform lifecycle from Phase 1 through production-ready Phase 2, including all services within the `default_sync` workspace and its integration points with the broader monorepo.

---

## 2. Functional Requirements

### 2.1 Agent Framework

| ID | Title | Description | Priority | Acceptance Criteria |
|---|---|---|---|---|
| FR-001 | Macro Analyst Agent | The system shall provide a macroeconomic analysis agent that evaluates GDP trends, interest rates, inflation, monetary policy, and geopolitical factors affecting a given stock or sector. | Must | Given a stock ticker and research task, the macro analyst produces a structured JSON report containing macro indicators, trend assessment, and impact score within the configured timeout. |
| FR-002 | Technical Analyst Agent | The system shall provide a technical analysis agent that evaluates price action, chart patterns, support/resistance levels, moving averages, and momentum indicators (RSI, MACD, Bollinger Bands). | Must | Given a stock ticker, the technical analyst returns a report with identified patterns, key price levels, indicator readings, and a directional bias with confidence level. |
| FR-003 | Fundamental Analyst Agent | The system shall provide a fundamental analysis agent that evaluates company financials including revenue, earnings, balance sheet health, valuation ratios (P/E, P/B, EV/EBITDA), DCF modeling, and competitive position. | Must | Given a stock ticker, the fundamental analyst returns a report with key financial metrics, peer comparison, valuation assessment, and a fair-value estimate or range. |
| FR-004 | Sentiment Analyst Agent | The system shall provide a sentiment analysis agent that evaluates news articles, social media mentions, analyst opinions, and market mood indicators. | Must | Given a stock ticker, the sentiment analyst returns a report with sentiment scores (-1.0 to +1.0 scale), source breakdown, trending topics, and sentiment trend direction. |
| FR-005 | Risk Analyst Agent | The system shall provide a risk assessment agent that evaluates volatility (historical and implied), drawdown potential, correlation risk, liquidity risk, and regulatory/legal exposure. | Must | Given a stock ticker, the risk analyst returns a report with risk scores across categories, a composite risk rating, VaR estimate, and identified risk triggers with probability estimates. |
| FR-006 | Quantitative Analyst Agent | The system shall provide a quantitative analysis agent that applies statistical models, factor analysis (momentum, value, quality, size), backtesting, and probabilistic forecasting. | Must | Given a stock ticker and optional parameters, the quant analyst returns a report with factor loadings, model confidence intervals, statistical metrics, and historical backtest results. |
| FR-007 | Agent Registry | The system shall maintain a registry mapping `AnalystType` enums to agent classes, enabling dynamic agent discovery and instantiation via `AGENT_REGISTRY`. | Must | All six analyst types are registered. `GET /api/v1/agents` returns metadata for all registered agents. New agents can be added by registering in `AGENT_REGISTRY` without modifying existing code. |
| FR-008 | Base Agent Lifecycle | Every agent shall follow a standardized execution lifecycle: validate input → mark task RUNNING → execute `analyze()` → cache result in Redis (TTL: 3600s) → publish to Kafka → mark COMPLETED (or FAILED on exception). | Must | Task status transitions are logged to PostgreSQL. Redis cache is populated with TTL. Kafka message is published to `research.results`. Failures record `error_message` and stack trace. |

### 2.2 Research Task Management

| ID | Title | Description | Priority | Acceptance Criteria |
|---|---|---|---|---|
| FR-009 | Create Research Task | Users shall be able to create a new research task specifying a stock ticker, analyst type(s), optional custom prompt, and optional parameters. | Must | `POST /api/v1/tasks` creates a task with status PENDING, persists to `analysis.research_tasks`, and returns a task ID. |
| FR-010 | Execute Research Task | The system shall dispatch a research task to the appropriate agent(s) and track execution through QUEUED → RUNNING → COMPLETED/FAILED/TIMEOUT. | Must | Execution records are created in `agents.executions` with `started_at`, `completed_at`, `duration_ms`, and status. |
| FR-011 | Multi-Agent Orchestration | The system shall support dispatching a single research task to multiple analyst agents concurrently, using `asyncio.TaskGroup` for parallel execution. | Must | Given a task targeting all 6 analysts, all agents execute in parallel. The system awaits all completions (or timeouts) before producing a consolidated report. Total time is bounded by the slowest agent, not the sum. |
| FR-012 | Report Consolidation | The system shall consolidate individual agent reports into a unified analysis report stored in `analysis.analysis_reports`, synthesized by a consolidation LLM pass. | Must | The consolidated report includes sections from each agent, a synthesized overall assessment, confidence score, dissenting views, and completeness indicator (if any agents failed). |
| FR-013 | Task Cancellation | Users shall be able to cancel a running research task. | Could | `DELETE /api/v1/tasks/{id}` transitions task to CANCELLED. Running agent subprocesses are terminated gracefully. |
| FR-014 | Task History & Retrieval | Users shall be able to list and retrieve past research tasks and their results with filtering and pagination. | Must | `GET /api/v1/tasks` returns paginated task history with filtering by status, ticker, date range, and analyst type. `GET /api/v1/tasks/{id}` returns full detail including all agent reports. |
| FR-015 | Execution Timeout | Agent executions shall respect a configurable timeout (default: 120s). | Must | An agent exceeding the timeout transitions to TIMEOUT state, releases resources, and the task continues with remaining agents. |
| FR-016 | Agent Retry | Failed agent executions shall support configurable retry with exponential backoff. | Should | A transiently failed agent retries up to N times (default: 2) with exponential backoff before marking FAILED. Permanent failures (e.g., invalid ticker) do not retry. |

### 2.3 Data Layer

| ID | Title | Description | Priority | Acceptance Criteria |
|---|---|---|---|---|
| FR-020 | Stock Registry | The system shall maintain a registry of stock symbols in `market_data.stocks` with metadata (name, sector, exchange, market cap, metadata JSON). | Must | Stock records are queryable. CRUD operations available via internal service calls. |
| FR-021 | Execution Audit Trail | The system shall log all agent executions with timing, status, input, output, and error data in `agents.executions`. | Must | Every execution creates a record with `started_at`, `completed_at`, `duration_ms`, `status`, and full input/output payloads. |
| FR-022 | Event Logging | The system shall capture structured events (DEBUG, INFO, WARNING, ERROR) during agent execution in `agents.events`. | Must | Events are persisted with level, message, timestamp, and optional metadata JSON. Events are queryable by execution ID and level. |
| FR-023 | Result Caching | Agent results shall be cached in Redis with a configurable TTL (default: 3600s) using deterministic, invalidatable cache keys. | Should | Repeated requests for the same ticker + analyst type within TTL return cached results without re-execution. Cache can be manually invalidated. |
| FR-024 | Event Streaming | Agent results and lifecycle events shall be published to Kafka topics (`research.tasks`, `research.results`, `market.data`, `agent.events`). | Should | Consumers can subscribe to topics for real-time downstream processing. Publishing is non-blocking; Kafka unavailability does not block execution. |
| FR-025 | Market Data Ingestion | The system shall support ingesting market data (price, volume, fundamentals) from external providers for agent consumption. | Should | A data ingestion service populates market data tables and publishes events to Kafka topic `market.data`. Agents can query historical data by symbol and date range. |

### 2.4 User Feedback

| ID | Title | Description | Priority | Acceptance Criteria |
|---|---|---|---|---|
| FR-030 | Report Feedback | Users shall be able to rate analysis reports as POSITIVE, NEUTRAL, or NEGATIVE with optional text comments via `POST /api/v1/feedback`. | Should | Feedback is persisted to `agents.feedbacks` linked to the execution ID. Aggregate ratings are queryable per agent type. |
| FR-031 | Feedback-Driven Improvement | The system shall surface accumulated feedback data to inform agent prompt tuning and model selection. | Could | Feedback statistics are available via API. Agents with consistently low ratings are flagged for review. A feedback analysis pipeline identifies patterns in negative feedback. |

### 2.5 AI Backend Integration

| ID | Title | Description | Priority | Acceptance Criteria |
|---|---|---|---|---|
| FR-040 | LLM Provider Routing | Each analyst agent shall be configurable to use a specific LLM backend (Ollama, Claude, Gemini, or Codex) for its `analyze()` implementation, via environment or settings configuration. | Must | Agent configuration includes an `llm_provider` field. The agent delegates to the configured provider via the routing gateway. Changing providers does not require code changes. |
| FR-041 | Ollama Model Selection | When using Ollama, the system shall support dynamic model discovery from `GET /models/ollama` (proxying Ollama's `/api/tags`) and per-agent model configuration. | Must | Available models are fetched dynamically. Configuration specifies which Ollama model each agent uses. |
| FR-042 | Streaming Agent Output | Agent execution shall stream intermediate results to the frontend in real time via WebSocket using the existing `node_execution_log` protocol. | Must | The WebSocket emits typed messages (`started`, `log`, `completed`) as the LLM generates tokens. The frontend renders incremental output per agent. |
| FR-043 | Domain-Specific Prompt Engineering | Each agent type shall use carefully crafted system prompts and output schemas that constrain the LLM to produce structured, domain-appropriate analysis. | Must | Each agent has a documented prompt template. Output is parseable as structured JSON matching the agent's defined schema. Prompt templates are version-controlled. |
| FR-044 | Image Generation Support | The system shall support MFLUX-based image generation for chart visualizations and technical analysis diagrams. | Could | Given a chart description prompt, MFLUX returns a Base64 PNG via `node_execution_image`. The image is embedded in the analysis report. |

### 2.6 API & Interface

| ID | Title | Description | Priority | Acceptance Criteria |
|---|---|---|---|---|
| FR-050 | REST API | The system shall expose a RESTful API for task creation, agent listing, report retrieval, feedback submission, and stock management. | Must | OpenAPI/Swagger documentation is auto-generated at `/docs`. All endpoints return consistent JSON with proper HTTP status codes and error schemas. |
| FR-051 | WebSocket Streaming | The system shall provide a WebSocket endpoint at `ws://localhost:8000/ws/agent` for real-time bidirectional execution streaming using the typed message protocol. | Must | Supports `execute_node` commands from client and `node_execution_started/log/image/completed` responses from server. |
| FR-052 | Health Checks | The system shall expose liveness (`GET /health`) and deep readiness (`GET /health/ready`) endpoints that verify PostgreSQL and Redis connectivity. | Must | Liveness returns 200 if the process is running. Readiness returns 200 only if all critical dependencies (PostgreSQL, Redis) are reachable. Degraded state returns 503 with component details. |
| FR-053 | Task Creation UI | The React frontend shall provide a form to create research tasks: stock symbol input, analyst agent selection (checkboxes), optional custom prompt, and a submit button. | Must | User can create a task from the dashboard and see it appear in the active task list with real-time status updates. |
| FR-054 | Dashboard Overview | The frontend shall display a dashboard with active tasks, recent reports, agent execution status, and system health. | Should | Dashboard loads within 2s and shows current task statuses, recent report summaries, and agent health indicators. |
| FR-055 | Report Viewer | The frontend shall render consolidated reports with navigable sections for each analyst perspective, with markdown formatting. | Must | Completed reports are viewable in the browser with navigation between analyst sections. Partial reports clearly indicate which agents completed and which failed. |
| FR-056 | Report Export | Users shall be able to export reports in PDF and Markdown formats. | Could | `GET /api/v1/tasks/{id}/report?format=pdf` returns a downloadable, well-formatted PDF including all sections and the AI-generated disclaimer. |

---

## 3. Non-Functional Requirements

### 3.1 Performance

| ID | Title | Description | Priority |
|---|---|---|---|
| NFR-001 | Agent Response Time | Individual agent analysis shall complete within 120 seconds for standard queries. Local Ollama models should target 60 seconds. | Must |
| NFR-002 | Concurrent Execution | The system shall support at least 6 concurrent agent executions (one per analyst type) per task, and at least 10 concurrent research tasks system-wide. | Must |
| NFR-003 | WebSocket Latency | Streaming messages from agent to frontend shall have less than 200ms latency from generation to display. | Should |
| NFR-004 | Cache Performance | Cached result retrieval from Redis shall complete within 10ms. Redis cache shall achieve >80% hit rate for repeated queries on the same symbol within the TTL window. | Should |
| NFR-005 | API Response Time | Non-streaming REST API calls (health, agents list, report retrieval) shall respond within 200ms at p95, excluding agent execution time. | Must |

### 3.2 Security

| ID | Title | Description | Priority |
|---|---|---|---|
| NFR-010 | Local-Only Default | The system shall default to localhost-only binding, not exposing services to external networks without explicit configuration. | Must |
| NFR-011 | Environment-Based Access Control | AI backend access shall be controlled via `.env` feature flags (`ENABLE_*`). Disabled backends return 403 Forbidden. | Must |
| NFR-012 | Input Validation | All user inputs (tickers, prompts, parameters) shall be validated and sanitized before processing. Tickers shall be validated against allowed patterns. | Must |
| NFR-013 | Prompt Injection Prevention | Agent prompts shall be constructed using structured templates that prevent user input from overriding system instructions. User input is placed in clearly delimited sections. | Must |
| NFR-014 | Secret Management | Database credentials, API keys, and service URLs shall be loaded from environment variables via Pydantic `BaseSettings`, never hardcoded. | Must |
| NFR-015 | Subprocess Sandboxing | CLI-spawned AI processes shall run with minimal privileges and configurable timeouts to prevent resource exhaustion. | Should |
| NFR-016 | Rate Limiting | API endpoints shall enforce rate limiting (default: 60 requests/minute per client) to prevent abuse. | Should |
| NFR-017 | Authentication | The system shall support optional API key or JWT-based authentication for multi-user deployments. | Could |

### 3.3 Scalability

| ID | Title | Description | Priority |
|---|---|---|---|
| NFR-020 | Horizontal Agent Scaling | The agent execution layer shall support horizontal scaling via Kafka consumer groups, allowing agents to run on separate processes or machines. | Should |
| NFR-021 | Database Connection Pooling | PostgreSQL connections shall use async connection pooling (asyncpg) with configurable pool size (default: min 5, max 20). | Must |
| NFR-022 | Workspace Isolation | Multiple workspaces shall operate independently with separate configurations and data partitions. | Could |

### 3.4 Availability & Reliability

| ID | Title | Description | Priority |
|---|---|---|---|
| NFR-030 | Graceful Degradation | If an individual agent fails, the system shall complete the remaining agents and produce a partial report with a completeness indicator. | Must |
| NFR-031 | Service Recovery | The system shall recover gracefully from PostgreSQL, Redis, or Kafka connection interruptions without crashing. | Should |
| NFR-032 | Startup Dependency Check | On startup, the system shall verify connectivity to all required services (PostgreSQL, Redis) and log warnings for unavailable optional services (Kafka). | Must |
| NFR-033 | Kafka Resilience | If Kafka is unavailable, the system shall log events locally and continue operating. Event publishing is non-blocking and must not fail the request path. | Should |
| NFR-034 | Data Durability | All research tasks, execution records, and reports shall be persisted to PostgreSQL. Redis is a cache layer only — loss of Redis does not lose data. | Must |

### 3.5 Usability

| ID | Title | Description | Priority |
|---|---|---|---|
| NFR-040 | Structured Logging | All services shall use structured JSON logging (`structlog`) with correlation IDs (task ID, execution ID) for traceability across services. | Must |
| NFR-041 | Error Messages | User-facing API errors shall include a machine-readable error code and a human-readable message. No raw stack traces in API responses. | Must |
| NFR-042 | API Documentation | The FastAPI application shall auto-generate OpenAPI/Swagger documentation accessible at `/docs` with request/response schemas. | Must |

### 3.6 Compliance & Maintainability

| ID | Title | Description | Priority |
|---|---|---|---|
| NFR-050 | AI Disclaimer | All generated reports shall include an automated disclaimer that the output is AI-generated and does not constitute financial advice. | Must |
| NFR-051 | Audit Trail | All agent executions, inputs, outputs, and user feedback shall be logged for auditability. | Must |
| NFR-052 | AI-Generated Label | LLM-generated financial analysis must be clearly labeled as AI-generated in all output formats. | Must |
| NFR-053 | Schema Migrations | All database schema changes shall be managed through Alembic versioned migrations. | Must |
| NFR-054 | Test Coverage | Unit tests shall cover agent logic and prompt construction. Integration tests shall verify database, cache, and message queue interactions. | Should |
| NFR-055 | Configuration Validation | Application settings shall be validated at startup via Pydantic `BaseSettings` with clear error messages for missing or invalid values. | Must |
| NFR-056 | Data Privacy | User data (feedback, task history) shall be stored locally and not transmitted to third parties without explicit consent. | Must |

---

## 4. User Stories

### US-001: Single-Stock Research
**As a** financial analyst,
**I want to** submit a stock ticker and receive a comprehensive multi-agent analysis,
**so that** I can make informed investment decisions based on macro, technical, fundamental, sentiment, risk, and quantitative perspectives.

**Acceptance Criteria:**
- I can enter a ticker symbol (e.g., "AAPL") in the frontend
- I can select which analyst types to include (default: all 6)
- I can optionally provide a custom prompt or focus area
- I see real-time progress as each agent works
- I receive a consolidated report within 5 minutes (6-agent parallel execution)
- The report includes a synthesized assessment with confidence level and disclaimer

### US-002: Real-Time Execution Monitoring
**As a** power user,
**I want to** watch agent execution output stream in real time,
**so that** I can understand the reasoning process and catch issues early.

**Acceptance Criteria:**
- WebSocket streams token-level output from each active agent
- The frontend displays log messages with agent type labels and color coding
- Connection status is visible (green/red indicator)
- Each agent's status (pending, running, completed, failed) updates live
- If an agent fails, I see the failure reason without blocking other agents

### US-003: Historical Research Lookup
**As a** portfolio manager,
**I want to** search past research reports by ticker, date, or analyst type,
**so that** I can track how analysis has evolved over time and compare recommendations.

**Acceptance Criteria:**
- I can search/filter past tasks by ticker symbol
- I can filter by date range and analyst type
- Results are paginated and sorted by recency
- Each result links to the full consolidated report

### US-004: Report Feedback
**As a** user,
**I want to** rate analysis reports and leave comments,
**so that** the system can improve agent quality over time.

**Acceptance Criteria:**
- Each report and individual agent section has a feedback widget (thumbs up / neutral / thumbs down)
- I can add an optional text comment explaining what was good or lacking
- My feedback is saved and associated with the specific execution
- I can see aggregate ratings for each agent type

### US-005: LLM Backend Configuration
**As a** system administrator,
**I want to** configure which LLM backend each agent uses,
**so that** I can optimize cost, speed, and quality per analyst type.

**Acceptance Criteria:**
- Configuration allows mapping agent type → LLM provider via `.env` or settings
- Changes take effect on restart without code changes
- Available Ollama models are discoverable dynamically
- Disabled backends are clearly indicated and return appropriate errors

### US-006: Agent Health Monitoring
**As a** system operator,
**I want to** monitor agent health, execution times, and failure rates,
**so that** I can identify degraded agents and take corrective action.

**Acceptance Criteria:**
- Health endpoint reports per-agent execution statistics
- Execution duration is tracked and queryable
- Failed executions include error messages and context
- Event log provides DEBUG through ERROR level visibility per execution

### US-007: Report Export
**As a** financial analyst,
**I want to** export a research report as a PDF,
**so that** I can share it with colleagues who do not have platform access.

**Acceptance Criteria:**
- A download button produces a well-formatted PDF
- The PDF includes all analyst sections and the AI-generated disclaimer
- The filename includes the symbol and date (e.g., `AAPL_2026-04-07_report.pdf`)

---

## 5. Use Cases

### UC-001: Submit and Execute Stock Research Task

| Field | Value |
|---|---|
| **Actors** | Financial Analyst (primary), System (agents, LLM backends) |
| **Preconditions** | System is running. At least one LLM backend is enabled and healthy. PostgreSQL and Redis are reachable. Target stock is a valid ticker. |
| **Main Flow** | 1. User submits a research request via `POST /api/v1/tasks` with ticker, agent selection, and optional prompt. 2. System validates input and creates a research task (PENDING). 3. System publishes task to Kafka `research.tasks` topic. 4. System dispatches to selected agents in parallel via `asyncio.TaskGroup`. 5. Each agent constructs a domain-specific prompt, sends it to the configured LLM, and parses the structured response. 6. Each agent caches its result in Redis and persists to PostgreSQL. 7. System streams execution progress to the frontend via WebSocket (`node_execution_log`). 8. When all agents complete (or timeout), the consolidation step synthesizes a unified report. 9. System persists the report to `analysis.analysis_reports` and transitions task to COMPLETED. 10. User views the report in the dashboard or retrieves via REST. |
| **Alternate Flows** | **A1: Agent Failure** — Agent marks FAILED with error; remaining agents continue; partial report generated with completeness warning. **A2: All Agents Fail** — Task transitions to FAILED; error response returned with individual failure reasons. **A3: Timeout** — Agent exceeding timeout is terminated and marked TIMEOUT; task continues with remaining agents. **A4: Cache Hit** — Recent cached result exists for same ticker + agent type; cached result returned without re-execution. **A5: WebSocket Disconnected** — Results persist regardless; user retrieves via REST when reconnected. |
| **Postconditions** | Task is in terminal state (COMPLETED, COMPLETED_PARTIAL, or FAILED). Execution records exist for all dispatched agents. Report persisted. Kafka events published. Audit trail complete. |

### UC-002: Real-Time Execution Streaming

| Field | Value |
|---|---|
| **Actors** | Financial Analyst (via frontend WebSocket) |
| **Preconditions** | WebSocket connection established to `ws://localhost:8000/ws/agent`. A research task is in progress. |
| **Main Flow** | 1. Frontend connects via WebSocket. 2. System sends `node_execution_started` per agent with nodeId. 3. System streams `node_execution_log` messages as LLM tokens arrive (1KB chunks). 4. System sends `node_execution_completed` per agent with exit code. 5. User observes live status transitions in the UI. |
| **Alternate Flows** | **A1: Connection Drop** — Frontend reconnects automatically; current state fetched via REST. Results persist regardless of connection state. **A2: Image Output** — For MFLUX-generated charts, system sends `node_execution_image` with Base64 PNG payload. |
| **Postconditions** | Complete execution log is persisted. User has observed real-time progress. |

### UC-003: Submit Report Feedback

| Field | Value |
|---|---|
| **Actors** | Financial Analyst |
| **Preconditions** | A completed research report exists. User is viewing the report. |
| **Main Flow** | 1. User views a completed report. 2. User selects a rating (POSITIVE / NEUTRAL / NEGATIVE) for an individual agent section or the overall report. 3. User optionally enters a text comment. 4. System validates and persists feedback to `agents.feedbacks` linked to the execution ID. 5. System publishes feedback event to Kafka `agent.events`. 6. System acknowledges the submission. |
| **Alternate Flows** | **A1: Missing Rating** — System rejects with validation error (rating is required). **A2: Update Feedback** — User changes rating on previously rated report; old feedback is replaced. |
| **Postconditions** | Feedback record persisted. Aggregate statistics updated. Kafka event published. |

### UC-004: Configure and Monitor System

| Field | Value |
|---|---|
| **Actors** | System Administrator |
| **Preconditions** | Administrator has access to the server and `.env` configuration. |
| **Main Flow** | 1. Administrator edits `.env` to enable/disable LLM backends and set per-agent model configuration. 2. Administrator restarts the service. 3. System validates configuration at startup via Pydantic. 4. Administrator checks `GET /health/ready` to verify all dependencies are healthy. 5. Administrator monitors agent execution statistics via health endpoints and structured logs. |
| **Alternate Flows** | **A1: Invalid Config** — System logs a clear error message and refuses to start. **A2: Dependency Down** — System starts in degraded mode, logging warnings for unavailable optional services. |
| **Postconditions** | System is running with the desired configuration. Health endpoints reflect current state. |

---

## 6. Constraints & Assumptions

### 6.1 Technical Constraints

- **Python 3.11+:** Required for `StrEnum`, `asyncio.TaskGroup`, and modern typing features used throughout the codebase.
- **Node.js 18+:** Required for frontend build tooling (Vite, React 19) and CLI AI tools (Claude Code, Gemini CLI, Codex).
- **PostgreSQL 14+:** Required for schema support and asyncpg driver compatibility.
- **Infrastructure Dependencies:** PostgreSQL 15, Redis 7, and Kafka 7.6 (KRaft mode) are required runtime dependencies, deployable via the included `docker-compose.yml`.
- **Async-Only:** All I/O operations use async/await. No blocking calls in the request path.
- **Monorepo Integration:** The analyst platform runs within `packages/workspaces/default_sync/` and depends on the FastAPI gateway (`api_bridge`) for WebSocket routing and CLI subprocess management.
- **LLM Dependency:** Agent analysis quality is bounded by the capabilities of the underlying LLM. Prompt engineering is the primary lever for output quality.
- **Local LLM Resource Requirements:** Ollama requires sufficient system resources (minimum 16GB RAM for 7B parameter models, GPU recommended).

### 6.2 Business Constraints

- **Not Financial Advice:** The system produces analysis for informational purposes only. All output must include disclaimers. The platform provides research assistance, not investment recommendations.
- **Single-User Focus (Phase 1):** Multi-user authentication, authorization, and data isolation are deferred to Phase 2+.
- **Open-Source LLM Preference:** Primary LLM backend is Ollama (local models) to minimize API costs and data exposure. Cloud APIs are supported but optional.
- **Data Availability:** Real-time market data requires third-party provider integration (not yet implemented). Initial version relies on LLM general knowledge and user-provided context.

### 6.3 Assumptions

- Users have access to a machine with sufficient resources to run local LLMs via Ollama.
- PostgreSQL, Redis, and Kafka are available locally or via the included Docker Compose configuration.
- At least one LLM backend (Ollama recommended) is configured and operational.
- Users have basic financial literacy and understand the analyst perspectives presented.
- The target deployment environment is a developer workstation or small server (not a high-availability production cluster for v1).
- The CLI AI tools (Claude Code, Gemini CLI, Codex) are pre-installed and authenticated when used as LLM backends.
- Stock data sources for fundamental/technical analysis will be integrated in Phase 2 via external APIs (e.g., Yahoo Finance, Alpha Vantage, Polygon.io).

### 6.4 Regulatory Constraints

- LLM-generated financial analysis must be clearly labeled as AI-generated in all output formats.
- User data (feedback, task history) shall be stored locally and not transmitted to third parties without explicit consent.
- Compliance with applicable data protection regulations for any personally identifiable information.
- No buy/hold/sell recommendations unless explicitly configured with appropriate disclaimers.

---

## 7. Glossary

| Term | Definition |
|---|---|
| **Agent** | A specialized AI-powered analyst module that performs a specific type of analysis (e.g., macro, technical, sentiment). Inherits from `BaseAnalystAgent`. |
| **Analyst Type** | One of six specializations: MACRO, TECHNICAL, FUNDAMENTAL, SENTIMENT, RISK, QUANTITATIVE. Represented as `AnalystType` enum. |
| **Research Task** | A user-initiated request for analysis on a specific stock, dispatched to one or more agents. Stored in `analysis.research_tasks`. |
| **Execution** | A single run of one agent against one research task, tracked with status, timing, input, and output. Stored in `agents.executions`. |
| **Consolidated Report** | A unified document synthesizing outputs from multiple agent executions into a single analysis. Stored in `analysis.analysis_reports`. |
| **Routing Gateway** | The FastAPI service (`api_bridge`) that routes requests to the appropriate AI backend via WebSocket and REST. |
| **LLM Backend** | An AI language model provider (Ollama, Claude, Gemini, Codex) used by agents for generating analysis. |
| **MFLUX** | A remote image generation service used for chart visualization and technical analysis diagrams. |
| **Workspace** | An isolated execution environment within the monorepo (e.g., `default_sync`). Located at `packages/workspaces/{name}/`. |
| **Node** | A unit of execution identified by `nodeId` in the WebSocket streaming protocol. |
| **DCF** | Discounted Cash Flow — a valuation method estimating the present value of future cash flows. Used by the Fundamental Analyst. |
| **VaR** | Value at Risk — a statistical measure of maximum potential loss at a given confidence level. Used by the Risk Analyst. |
| **Factor Exposure** | A stock's sensitivity to systematic risk factors (momentum, value, quality, size). Used in quantitative analysis. |
| **TTL** | Time To Live — the duration a cached value remains valid in Redis before automatic expiration (default: 3600s). |
| **NDJSON** | Newline-Delimited JSON — a streaming format used by `POST /execute/stream` where each line is a valid JSON object. |
| **Kafka Topic** | A named message channel in Apache Kafka for event streaming (e.g., `research.tasks`, `research.results`, `market.data`, `agent.events`). |
| **KRaft** | Kafka Raft — Kafka's built-in consensus protocol replacing ZooKeeper for cluster metadata management. |
| **Durable Object** | A Cloudflare Workers primitive for stateful, single-threaded compute. Used in the optional Cloudflare backend component. |

---

## 8. Open Questions

| # | Question | Stakeholder | Impact |
|---|---|---|---|
| OQ-001 | Which external market data APIs will be integrated for real-time/delayed price and fundamental data (Yahoo Finance, Alpha Vantage, Polygon.io, etc.)? | Product Owner | Affects FR-025, agent data quality, and third-party cost. |
| OQ-002 | Should agent prompt templates be configurable via UI or config files, or hardcoded per analyst type? | Tech Lead | Affects extensibility and the ability to tune agent behavior without code deployments. |
| OQ-003 | What is the target LLM model size/family for production? (7B local vs. 70B local vs. cloud API) | Product Owner / Ops | Affects hardware requirements, response quality, latency, and cost projections. |
| OQ-004 | Is multi-user support (authentication, per-user task history, RBAC) planned for Phase 2 or later? | Product Owner | Affects database schema (user ownership), API design, and security model. |
| OQ-005 | Should the consolidated report include a final buy/hold/sell recommendation, or remain purely analytical? | Product Owner / Legal | Affects regulatory compliance, disclaimer requirements, and potential liability. |
| OQ-006 | What is the data retention policy for execution logs, reports, and user feedback? | Ops / Legal | Affects storage planning, database archival strategy, and compliance. |
| OQ-007 | Should agents be able to invoke each other (e.g., risk analyst requesting quant data)? | Tech Lead | Affects orchestration architecture: simple fan-out vs. agent-to-agent dependency graph. |
| OQ-008 | Is there a target for report update frequency? (On-demand only vs. scheduled periodic re-analysis) | Product Owner | Affects whether a scheduler/cron system is needed and cache invalidation strategy. |
| OQ-009 | What real-time data sources should sentiment analysis consume? (Twitter/X API, Reddit, news RSS, etc.) | Product Owner | Affects third-party API dependencies, rate limits, and cost. |
| OQ-010 | Should the system support asset classes beyond equities (crypto, forex, commodities, ETFs)? | Product Owner | Affects data model schema, agent prompt templates, and data source integrations. |
| OQ-011 | What is the acceptable monthly budget for LLM API calls when using cloud providers? | Finance | Affects model selection, caching aggressiveness, and rate limiting configuration. |
| OQ-012 | Are there specific regulatory frameworks (MiFID II, SEC regulations) that output must comply with? | Legal / Compliance | Affects report formatting, disclaimer language, and audit requirements. |

---

*Document generated from analysis of the `cli_route` monorepo and `default_sync` workspace codebase. Version 2.0 — 2026-04-07.*
