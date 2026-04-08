# Requirements Document: Analyst

**Project:** Analyst — Professional AI Analyst Platform
**Version:** 3.0
**Date:** 2026-04-07
**Status:** Draft — Consolidated Specification
**Workspace:** `pm_7a9638db-5127-4913-9c8e-293f2b511c65`
**Lineage:** Synthesized from workspace `requirements.md` v1.0 (general-purpose analyst) and `default_sync/REQUIREMENTS.md` v2.0 (equity research agents)

---

## 1. Executive Summary

**Analyst** is a professional multi-agent AI analysis platform that combines general-purpose analytical capabilities with domain-specific equity research. The system orchestrates specialized analyst agents to produce comprehensive, data-driven reports — from free-form business analysis to structured multi-perspective equity research.

The platform operates within the `cli_route` monorepo, leveraging:

- **Frontend:** React 19 + Vite + TypeScript + Tailwind CSS for the interactive dashboard, task creation, report viewer, and analysis workspace.
- **Gateway:** FastAPI WebSocket gateway (`api_bridge`) for real-time bidirectional streaming and CLI subprocess management.
- **AI Backends:** Configurable LLM routing across Ollama (local), Claude Code CLI, Google Gemini CLI, OpenAI Codex, and MFLUX (image generation).
- **Data Layer:** PostgreSQL (4 schemas, 6+ tables) for persistence, Redis for caching, and Apache Kafka for event streaming.

### Dual Operating Modes

| Mode | Description | Use Case |
|------|-------------|----------|
| **General Analysis** | Free-form AI-powered analysis with templates (summarisation, SWOT, risk assessment, comparative analysis, trend identification) | Business analysts, project managers, researchers |
| **Equity Research** | Six specialized agents (Macro, Technical, Fundamental, Sentiment, Risk, Quantitative) orchestrated in parallel for multi-perspective stock analysis | Financial analysts, portfolio managers |

### Phase Roadmap

| Phase | Focus | Status |
|-------|-------|--------|
| **Phase 1** | Infrastructure — agent base classes, database schema, API scaffolding, health checks, routing gateway, mock agents | Complete |
| **Phase 2** | LLM-connected agents, domain-specific prompts, multi-agent orchestration, report consolidation, general analysis templates, task creation UI, feedback loops | In Progress |
| **Phase 3** | Multi-user support, scheduled analysis, cross-asset support, market data integration, advanced analytics, production hardening | Planned |

### Key Objectives

1. Deliver actionable analysis through both free-form queries and structured multi-agent research.
2. Stream analysis output in real time to users via WebSocket.
3. Support flexible LLM backend selection (local-first, cloud-optional) to balance cost, speed, and quality.
4. Provide auditable, disclaimered output that is clearly labeled as AI-generated.
5. Enable continuous quality improvement through user feedback loops.
6. Expose all capabilities via both the React UI and programmatic REST/WebSocket APIs.

---

## 2. Functional Requirements

### 2.1 Data Ingestion & Input

| ID | Title | Description | Priority | Acceptance Criteria |
|----|-------|-------------|----------|---------------------|
| FR-001 | Text Prompt Analysis | Users can submit free-text prompts describing an analysis task. | Must | System accepts text input up to 100,000 characters and routes to the selected AI model via the gateway. |
| FR-002 | Document Upload | Users can upload documents (PDF, CSV, TXT, DOCX, JSON) for analysis. | Should | Uploaded files are parsed, content extracted, and passed as context to the AI model; max file size configurable (default: 10 MB). |
| FR-003 | Data Paste Input | Users can paste structured data (tables, JSON, CSV) directly into the interface. | Must | Pasted data is validated, formatted, and included in the analysis prompt context. |
| FR-004 | URL/Source Reference | Users can provide URLs or external references for the analyst to consider. | Could | System fetches and summarises content from provided URLs as supplementary context. |
| FR-005 | Multi-Source Input | Users can combine multiple input sources (text + document + data) into a single analysis request. | Should | All inputs are merged into a coherent context payload before model dispatch. |
| FR-006 | Stock Ticker Input | Users can specify a stock ticker symbol to trigger equity research mode. | Must | Ticker is validated against allowed patterns. The system switches to multi-agent equity research when a ticker is the primary subject. |

### 2.2 General Analysis Capabilities

| ID | Title | Description | Priority | Acceptance Criteria |
|----|-------|-------------|----------|---------------------|
| FR-010 | Summarisation | Generate executive summaries from lengthy inputs. | Must | Output includes a structured summary with key points, conclusions, and confidence indicators. |
| FR-011 | Trend Analysis | Identify patterns and trends in quantitative or qualitative data. | Must | Output highlights trends with supporting evidence extracted from the input data. |
| FR-012 | Comparative Analysis | Compare two or more datasets, documents, or scenarios. | Should | Output presents a structured comparison table/matrix with dimensional scoring. |
| FR-013 | Risk Assessment | Identify and categorise risks from provided context. | Should | Output includes risk register format: risk ID, description, likelihood, impact, mitigation. |
| FR-014 | SWOT Analysis | Generate Strengths, Weaknesses, Opportunities, Threats analysis. | Should | Output follows standard SWOT matrix format with evidence-backed entries. |
| FR-015 | Sentiment Analysis | Analyse sentiment across text corpora. | Could | Output provides sentiment scores (positive/negative/neutral) with confidence levels. |
| FR-016 | Custom Analysis Templates | Users can define and save reusable analysis templates with predefined prompts and output schemas. | Could | Templates are persisted, can be selected from a library, and pre-populate the analysis form. |
| FR-017 | Multi-Model Cross-Analysis | Run the same analysis across multiple AI models and compare outputs. | Could | Results from each model are displayed side-by-side with a meta-analysis of divergence. |

### 2.3 Equity Research Agents

| ID | Title | Description | Priority | Acceptance Criteria |
|----|-------|-------------|----------|---------------------|
| FR-020 | Macro Analyst Agent | Macroeconomic analysis agent evaluating GDP trends, interest rates, inflation, monetary policy, and geopolitical factors. | Must | Produces structured JSON report with macro indicators, trend assessment, and impact score within the configured timeout. |
| FR-021 | Technical Analyst Agent | Technical analysis agent evaluating price action, chart patterns, support/resistance levels, moving averages, and momentum indicators (RSI, MACD, Bollinger Bands). | Must | Returns report with identified patterns, key price levels, indicator readings, and directional bias with confidence level. |
| FR-022 | Fundamental Analyst Agent | Fundamental analysis agent evaluating financials (revenue, earnings, balance sheet), valuation ratios (P/E, P/B, EV/EBITDA), DCF modeling, and competitive position. | Must | Returns report with key financial metrics, peer comparison, valuation assessment, and fair-value estimate or range. |
| FR-023 | Sentiment Analyst Agent | Sentiment analysis agent evaluating news articles, social media mentions, analyst opinions, and market mood indicators. | Must | Returns report with sentiment scores (-1.0 to +1.0), source breakdown, trending topics, and sentiment trend direction. |
| FR-024 | Risk Analyst Agent | Risk assessment agent evaluating volatility (historical/implied), drawdown potential, correlation risk, liquidity risk, and regulatory/legal exposure. | Must | Returns report with risk scores across categories, composite risk rating, VaR estimate, and risk triggers with probability estimates. |
| FR-025 | Quantitative Analyst Agent | Quantitative analysis agent applying statistical models, factor analysis (momentum, value, quality, size), backtesting, and probabilistic forecasting. | Must | Returns report with factor loadings, model confidence intervals, statistical metrics, and backtest results. |
| FR-026 | Agent Registry | Registry mapping `AnalystType` enums to agent classes, enabling dynamic discovery and instantiation via `AGENT_REGISTRY`. | Must | All six analyst types registered. `GET /api/v1/agents` returns metadata. New agents added without modifying existing code. |
| FR-027 | Base Agent Lifecycle | Standardized execution lifecycle: validate → RUNNING → `analyze()` → cache (Redis, TTL: 3600s) → publish (Kafka) → COMPLETED/FAILED. | Must | Status transitions logged to PostgreSQL. Redis cache populated. Kafka message published to `research.results`. Failures record error and stack trace. |

### 2.4 Research Task Management

| ID | Title | Description | Priority | Acceptance Criteria |
|----|-------|-------------|----------|---------------------|
| FR-030 | Create Research Task | Users create a research task specifying ticker, analyst type(s), optional custom prompt, and parameters. | Must | `POST /api/v1/tasks` creates task (PENDING), persists to `analysis.research_tasks`, returns task ID. |
| FR-031 | Execute Research Task | System dispatches to appropriate agent(s) and tracks through QUEUED → RUNNING → COMPLETED/FAILED/TIMEOUT. | Must | Execution records in `agents.executions` with `started_at`, `completed_at`, `duration_ms`, and status. |
| FR-032 | Multi-Agent Orchestration | Dispatch a single task to multiple agents concurrently via `asyncio.TaskGroup`. | Must | All agents execute in parallel. Total time bounded by slowest agent, not sum. Consolidated report produced after all complete/timeout. |
| FR-033 | Report Consolidation | Consolidate individual agent reports into a unified analysis, synthesized by a consolidation LLM pass. | Must | Consolidated report includes sections per agent, synthesized assessment, confidence score, dissenting views, and completeness indicator. |
| FR-034 | Task Cancellation | Users can cancel a running research task. | Could | `DELETE /api/v1/tasks/{id}` transitions to CANCELLED. Running subprocesses terminated gracefully. |
| FR-035 | Task History & Retrieval | List and retrieve past tasks with filtering and pagination. | Must | `GET /api/v1/tasks` returns paginated history filterable by status, ticker, date range, analyst type. `GET /api/v1/tasks/{id}` returns full detail. |
| FR-036 | Execution Timeout | Agent executions respect configurable timeout (default: 120s). | Must | Agent exceeding timeout transitions to TIMEOUT, releases resources. Task continues with remaining agents. |
| FR-037 | Agent Retry | Failed executions support configurable retry with exponential backoff. | Should | Retries up to N times (default: 2) with exponential backoff. Permanent failures (invalid ticker) do not retry. |

### 2.5 Data Layer

| ID | Title | Description | Priority | Acceptance Criteria |
|----|-------|-------------|----------|---------------------|
| FR-040 | Stock Registry | Registry of stock symbols in `market_data.stocks` with metadata (name, sector, exchange, market cap, metadata JSON). | Must | Records queryable. CRUD via internal service calls. |
| FR-041 | Execution Audit Trail | Log all agent executions with timing, status, input, output, and error data in `agents.executions`. | Must | Every execution creates a record with full I/O payloads and timing. |
| FR-042 | Event Logging | Capture structured events (DEBUG–ERROR) during agent execution in `agents.events`. | Must | Events persisted with level, message, timestamp, metadata. Queryable by execution ID and level. |
| FR-043 | Result Caching | Agent results cached in Redis with configurable TTL (default: 3600s) using deterministic, invalidatable keys. | Should | Repeated same-ticker same-analyst requests within TTL return cached results. Cache manually invalidatable. |
| FR-044 | Event Streaming | Results and lifecycle events published to Kafka topics (`research.tasks`, `research.results`, `market.data`, `agent.events`). | Should | Consumers can subscribe. Publishing is non-blocking; Kafka unavailability does not block execution. |
| FR-045 | Market Data Ingestion | Support ingesting market data (price, volume, fundamentals) from external providers. | Should | Data ingestion populates market data tables. Agents query historical data by symbol and date range. |
| FR-046 | Analysis History Persistence | General analysis sessions and results persisted to database. | Must | Users can view, re-open, and re-run past analyses. History persists across sessions. |

### 2.6 User Feedback

| ID | Title | Description | Priority | Acceptance Criteria |
|----|-------|-------------|----------|---------------------|
| FR-050 | Report Feedback | Users rate reports (POSITIVE/NEUTRAL/NEGATIVE) with optional comments via `POST /api/v1/feedback`. | Should | Feedback persisted to `agents.feedbacks` linked to execution ID. Aggregate ratings queryable per agent type. |
| FR-051 | Feedback-Driven Improvement | Accumulated feedback surfaces for prompt tuning and model selection. | Could | Feedback stats available via API. Low-rated agents flagged. Pattern analysis on negative feedback. |

### 2.7 AI Backend Integration

| ID | Title | Description | Priority | Acceptance Criteria |
|----|-------|-------------|----------|---------------------|
| FR-060 | LLM Provider Routing | Each agent configurable to use a specific LLM backend (Ollama, Claude, Gemini, Codex) via environment/settings. | Must | Agent config includes `llm_provider`. Provider change requires no code changes. |
| FR-061 | Ollama Model Selection | Dynamic model discovery from `GET /models/ollama` and per-agent model configuration. | Must | Available models fetched dynamically. Config specifies which Ollama model each agent uses. |
| FR-062 | Streaming Agent Output | Stream intermediate results to frontend in real time via WebSocket using `node_execution_log` protocol. | Must | WebSocket emits typed messages (`started`, `log`, `completed`) as LLM generates tokens. |
| FR-063 | Domain-Specific Prompts | Each equity agent uses crafted system prompts and output schemas constraining LLM to structured, domain-appropriate analysis. | Must | Each agent has documented, version-controlled prompt template. Output parseable as structured JSON. |
| FR-064 | Image Generation | MFLUX-based image generation for chart visualizations and technical analysis diagrams. | Could | MFLUX returns Base64 PNG via `node_execution_image`. Image embedded in report. |
| FR-065 | Model Selection UI | Users can choose which AI model to use for general analysis. | Must | Dropdown shows all enabled models. Default model configurable by admin. |
| FR-066 | Model Parameters | Users can adjust model parameters (temperature, max tokens) per analysis. | Could | Parameters exposed in Advanced panel. Values validated before dispatch. |

### 2.8 API & Interface

| ID | Title | Description | Priority | Acceptance Criteria |
|----|-------|-------------|----------|---------------------|
| FR-070 | REST API | RESTful API for task creation, agent listing, report retrieval, feedback, and stock management. | Must | OpenAPI/Swagger at `/docs`. Consistent JSON responses with proper status codes and error schemas. |
| FR-071 | WebSocket Streaming | WebSocket at `ws://localhost:8000/ws/agent` for real-time bidirectional execution streaming. | Must | Supports `execute_node` commands and `node_execution_started/log/image/completed` responses. |
| FR-072 | Health Checks | Liveness (`GET /health`) and deep readiness (`GET /health/ready`) endpoints verifying PostgreSQL and Redis connectivity. | Must | Liveness: 200 if process running. Readiness: 200 if all critical deps reachable; 503 if degraded with component details. |
| FR-073 | Task Creation UI | React form for creating research tasks: stock symbol, agent selection (checkboxes), optional prompt, submit button. | Must | User creates task from dashboard. Task appears in active list with real-time status updates. |
| FR-074 | General Analysis UI | React workspace for general analysis: template selection, text/file/data input, model selection, streaming output. | Must | User can submit analysis and see streaming results. Analysis saved to history. |
| FR-075 | Dashboard Overview | Dashboard with active tasks, recent reports, agent execution status, and system health. | Should | Loads within 2s. Shows task statuses, report summaries, and health indicators. |
| FR-076 | Report Viewer | Render consolidated reports with navigable sections per analyst, markdown formatting. | Must | Reports viewable in browser. Partial reports indicate which agents completed/failed. |
| FR-077 | Report Export (Markdown) | Export analysis results as Markdown files. | Must | Downloaded .md preserves all formatting, tables, and structure. |
| FR-078 | Report Export (PDF) | Export reports as PDF documents. | Could | `GET /api/v1/tasks/{id}/report?format=pdf` returns well-formatted PDF with AI disclaimer. Filename includes symbol and date. |
| FR-079 | Follow-Up Queries | Users can ask follow-up questions within the same analysis context. | Must | Subsequent prompts include prior results as context. Conversation-style threading visible and scrollable. |
| FR-080 | Analysis Sessions | Named sessions grouping related queries that share context. | Should | Sessions act as folders. Analyses within a session can reference each other. |
| FR-081 | API-Driven Analysis | All analyst features accessible via REST and WebSocket APIs (not only the React UI). | Must | `POST /execute` and `POST /execute/stream` accept analyst payloads. Response format documented and machine-parseable. |

---

## 3. Non-Functional Requirements

### 3.1 Performance

| ID | Title | Description | Priority |
|----|-------|-------------|----------|
| NFR-001 | Agent Response Time | Individual equity agent analysis shall complete within 120 seconds. Local Ollama models target 60 seconds. | Must |
| NFR-002 | General Analysis Acknowledgement | Analysis request acknowledgement (`execution_started` signal) within 2 seconds of submission. | Must |
| NFR-003 | First Token Latency | First token of streaming output visible within 5 seconds of submission (model-dependent). | Must |
| NFR-004 | Concurrent Execution | Support at least 6 concurrent agent executions per equity task, and at least 10 concurrent sessions system-wide. | Must |
| NFR-005 | WebSocket Latency | Streaming messages from agent to frontend under 200ms from generation to display. | Should |
| NFR-006 | Cache Performance | Redis cached result retrieval within 10ms. >80% hit rate for repeated same-symbol queries within TTL. | Should |
| NFR-007 | API Response Time | Non-streaming REST calls respond within 200ms at p95 (excluding agent execution). | Must |
| NFR-008 | Document Parsing | Document parsing and context preparation within 10 seconds for files up to 10 MB. | Should |

### 3.2 Security

| ID | Title | Description | Priority |
|----|-------|-------------|----------|
| NFR-010 | Local-Only Default | Default to localhost-only binding. No external network exposure without explicit configuration. | Must |
| NFR-011 | Environment-Based Access Control | AI backend access controlled via `.env` feature flags (`ENABLE_*`). Disabled backends return 403. | Must |
| NFR-012 | Input Validation | All user inputs validated and sanitized. Tickers validated against allowed patterns. No command injection vectors. | Must |
| NFR-013 | Prompt Injection Prevention | Structured prompt templates prevent user input from overriding system instructions. User input in clearly delimited sections. | Must |
| NFR-014 | Secret Management | Credentials and API keys loaded from environment variables via Pydantic `BaseSettings`, never hardcoded. | Must |
| NFR-015 | Subprocess Sandboxing | CLI-spawned AI processes run with minimal privileges and configurable timeouts. | Should |
| NFR-016 | Rate Limiting | API rate limiting (default: 60 req/min per client). | Should |
| NFR-017 | Authentication | Optional API key or JWT-based authentication for multi-user deployments. | Could |
| NFR-018 | File Upload Validation | File type whitelist enforced. Malicious payloads rejected. No arbitrary file execution. | Must |
| NFR-019 | Data at Rest | Analysis history stored locally with filesystem-level permissions. No plaintext secrets. | Must |

### 3.3 Scalability

| ID | Title | Description | Priority |
|----|-------|-------------|----------|
| NFR-020 | Horizontal Agent Scaling | Agent execution supports horizontal scaling via Kafka consumer groups. | Should |
| NFR-021 | Database Connection Pooling | Async connection pooling (asyncpg) with configurable pool size (default: min 5, max 20). | Must |
| NFR-022 | Workspace Isolation | Multiple workspaces operate independently with separate configurations and data partitions. | Could |

### 3.4 Availability & Reliability

| ID | Title | Description | Priority |
|----|-------|-------------|----------|
| NFR-030 | Graceful Degradation | If an individual agent fails, remaining agents complete and produce a partial report with completeness indicator. | Must |
| NFR-031 | Service Recovery | Graceful recovery from PostgreSQL, Redis, or Kafka connection interruptions without crashing. | Should |
| NFR-032 | Startup Dependency Check | On startup, verify connectivity to all required services (PostgreSQL, Redis). Log warnings for unavailable optional services (Kafka). | Must |
| NFR-033 | Kafka Resilience | Kafka unavailability does not block execution. Events logged locally as fallback. | Should |
| NFR-034 | Data Durability | All tasks, executions, and reports persisted to PostgreSQL. Redis is cache-only — loss of Redis does not lose data. | Must |
| NFR-035 | Crash Recovery | Service uptime 99% during active local use with crash recovery and auto-restart capability. | Should |

### 3.5 Usability

| ID | Title | Description | Priority |
|----|-------|-------------|----------|
| NFR-040 | Structured Logging | Structured JSON logging (`structlog`) with correlation IDs (task ID, execution ID) for cross-service traceability. | Must |
| NFR-041 | Error Messages | User-facing errors include machine-readable error code and human-readable message. No raw stack traces in API responses. | Must |
| NFR-042 | API Documentation | Auto-generated OpenAPI/Swagger at `/docs` with request/response schemas. | Must |
| NFR-043 | Onboarding | New user can submit first analysis within 2 minutes of opening the interface. | Should |
| NFR-044 | Responsive UI | Interface usable on viewport widths >= 768px. | Should |

### 3.6 Compliance & Maintainability

| ID | Title | Description | Priority |
|----|-------|-------------|----------|
| NFR-050 | AI Disclaimer | All generated reports include automated disclaimer: AI-generated, not financial advice. | Must |
| NFR-051 | Audit Trail | All executions, inputs, outputs, and feedback logged for auditability. | Must |
| NFR-052 | AI-Generated Label | LLM-generated analysis clearly labeled as AI-generated in all output formats. | Must |
| NFR-053 | Schema Migrations | All database schema changes managed through Alembic versioned migrations. | Must |
| NFR-054 | Test Coverage | Unit tests cover agent logic and prompt construction. Integration tests verify DB, cache, and MQ interactions. Target: 80% on core services. | Should |
| NFR-055 | Configuration Validation | Settings validated at startup via Pydantic `BaseSettings` with clear error messages. | Must |
| NFR-056 | Data Privacy | User data stored locally. Not transmitted to third parties without explicit consent. | Must |
| NFR-057 | Modular Architecture | Analyst workspace code self-contained within `packages/workspaces/` conventions. | Must |
| NFR-058 | Gateway Compatibility | Integrates with existing FastAPI gateway without modifications to core routing logic. | Must |
| NFR-059 | Bilingual Support | UI supports English and Simplified Chinese. | Could |

---

## 4. User Stories

### US-001: Single-Stock Multi-Agent Research
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

### US-002: Quick General Analysis
**As a** business analyst,
**I want** to paste raw data into the analyst and select "Trend Analysis",
**so that** I receive an AI-generated trend report without manually crafting a prompt.

**Acceptance Criteria:**
- Data paste area accepts CSV/JSON/plaintext
- Pre-built "Trend Analysis" template is selectable
- Report is generated and streamed within expected NFR timelines
- Output includes identified trends with supporting evidence

### US-003: Document Review
**As a** project manager,
**I want** to upload a project document and get a risk assessment,
**so that** I can quickly identify potential issues without reading the entire document.

**Acceptance Criteria:**
- PDF/DOCX upload is supported
- Risk assessment template produces output in risk-register format
- Each risk includes likelihood, impact, and suggested mitigation

### US-004: Real-Time Execution Monitoring
**As a** power user,
**I want to** watch agent execution output stream in real time,
**so that** I can understand the reasoning process and catch issues early.

**Acceptance Criteria:**
- WebSocket streams token-level output from each active agent
- Frontend displays log messages with agent type labels and color coding
- Connection status visible (green/red indicator)
- Each agent's status updates live (pending → running → completed/failed)
- Agent failures show reason without blocking others

### US-005: Comparative Decision Support
**As a** technical lead,
**I want** to submit two competing proposals and get a structured comparison,
**so that** I can present an objective analysis to stakeholders.

**Acceptance Criteria:**
- Two or more text/document inputs accepted simultaneously
- Comparative analysis output includes dimensional scoring matrix
- Results exportable to PDF for stakeholder distribution

### US-006: Iterative Deep-Dive
**As a** research analyst,
**I want** to ask follow-up questions about a previous analysis,
**so that** I can drill deeper without re-providing context each time.

**Acceptance Criteria:**
- Follow-up input field available after initial analysis completes
- Prior analysis context automatically included
- Conversation thread visible and scrollable

### US-007: Historical Research Lookup
**As a** portfolio manager,
**I want to** search past research reports by ticker, date, or analyst type,
**so that** I can track how analysis has evolved over time.

**Acceptance Criteria:**
- Search/filter by ticker symbol, date range, analyst type
- Results paginated and sorted by recency
- Each result links to full consolidated report

### US-008: Report Feedback
**As a** user,
**I want to** rate analysis reports and leave comments,
**so that** the system can improve quality over time.

**Acceptance Criteria:**
- Feedback widget (thumbs up/neutral/thumbs down) per report and per agent section
- Optional text comment
- Feedback saved and linked to specific execution
- Aggregate ratings viewable per agent type

### US-009: LLM Backend Configuration
**As a** system administrator,
**I want to** configure which LLM backend each agent uses,
**so that** I can optimize cost, speed, and quality per analyst type.

**Acceptance Criteria:**
- Agent → LLM provider mapping via `.env` or settings
- Changes take effect on restart, no code changes
- Ollama models discoverable dynamically
- Disabled backends clearly indicated

### US-010: Model Comparison
**As a** power user,
**I want** to run the same analysis across Claude and Gemini simultaneously,
**so that** I can compare how different models interpret the same data.

**Acceptance Criteria:**
- Multi-model selection available
- Results from each model stream independently
- Side-by-side comparison view rendered

### US-011: API-Driven Analysis
**As a** developer integrating analyst into an automation pipeline,
**I want** to trigger analyses via the REST API with structured JSON payloads,
**so that** I can embed AI analysis into my CI/CD or reporting workflows.

**Acceptance Criteria:**
- `POST /execute` and `POST /execute/stream` accept analyst-specific payloads
- Response format documented and machine-parseable
- Analysis templates selectable via API parameter

### US-012: Report Export
**As a** financial analyst,
**I want to** export a research report as a PDF,
**so that** I can share it with colleagues without platform access.

**Acceptance Criteria:**
- Download button produces well-formatted PDF
- PDF includes all analyst sections and AI-generated disclaimer
- Filename includes symbol and date (e.g., `AAPL_2026-04-07_report.pdf`)

---

## 5. Use Cases

### UC-001: Submit and Execute Equity Research Task

| Field | Value |
|---|---|
| **Actors** | Financial Analyst (primary), System (agents, LLM backends) |
| **Preconditions** | System running. At least one LLM backend enabled and healthy. PostgreSQL and Redis reachable. Valid stock ticker. |
| **Main Flow** | 1. User submits research request via `POST /api/v1/tasks` (or UI form) with ticker, agent selection, optional prompt. 2. System validates input, creates task (PENDING), persists to `analysis.research_tasks`. 3. System publishes to Kafka `research.tasks`. 4. System dispatches to selected agents in parallel via `asyncio.TaskGroup`. 5. Each agent constructs domain-specific prompt, sends to configured LLM, parses structured response. 6. Each agent caches result in Redis, persists to PostgreSQL. 7. System streams progress to frontend via WebSocket (`node_execution_log`). 8. When all agents complete/timeout, consolidation step synthesizes unified report. 9. Report persisted to `analysis.analysis_reports`, task → COMPLETED. 10. User views report in dashboard or retrieves via REST. |
| **Alternate Flows** | **A1: Agent Failure** — Agent marks FAILED; remaining continue; partial report with completeness warning. **A2: All Agents Fail** — Task → FAILED; error response with individual failure reasons. **A3: Timeout** — Agent terminated, marked TIMEOUT; task continues with remaining. **A4: Cache Hit** — Recent cached result returned without re-execution. **A5: WebSocket Disconnected** — Results persist; user retrieves via REST. |
| **Postconditions** | Task in terminal state (COMPLETED, COMPLETED_PARTIAL, FAILED). Execution records for all dispatched agents. Report persisted. Kafka events published. Audit trail complete. |

### UC-002: Perform General Analysis

| Field | Value |
|---|---|
| **Actors** | End User, AI Model (via Gateway) |
| **Preconditions** | Gateway running. At least one AI model enabled. User has opened the Analyst workspace. |
| **Main Flow** | 1. User opens Analyst workspace. 2. User selects analysis type (Summarisation, Trend, SWOT, Risk, Comparative). 3. User provides input (text, file upload, or pasted data). 4. User selects target AI model (or accepts default). 5. User submits. 6. System validates and dispatches to gateway. 7. Gateway routes to selected model subprocess. 8. Streaming output rendered in real-time. 9. Completed analysis stored in history. |
| **Alternate Flows** | **A1: Model Disabled** — Error displayed with available alternatives. **A2: Input Validation Failure** — Descriptive error. **A3: Model Timeout/Failure** — Error log displayed with retry option. |
| **Postconditions** | Analysis displayed. Entry saved to history. Export options available. |

### UC-003: Real-Time Execution Streaming

| Field | Value |
|---|---|
| **Actors** | User (via frontend WebSocket) |
| **Preconditions** | WebSocket connected to `ws://localhost:8000/ws/agent`. Task in progress. |
| **Main Flow** | 1. Frontend connects via WebSocket. 2. System sends `node_execution_started` per agent. 3. System streams `node_execution_log` as LLM generates (1KB chunks). 4. System sends `node_execution_completed` per agent with exit code. 5. User observes live status transitions. |
| **Alternate Flows** | **A1: Connection Drop** — Auto-reconnect; state fetched via REST. **A2: Image Output** — `node_execution_image` with Base64 PNG. |
| **Postconditions** | Execution log persisted. User has observed real-time progress. |

### UC-004: Export Analysis Report

| Field | Value |
|---|---|
| **Actors** | End User |
| **Preconditions** | Completed analysis exists in current session or history. |
| **Main Flow** | 1. User views completed analysis. 2. User clicks Export, selects format (Markdown or PDF). 3. System renders in selected format. 4. Browser initiates download. |
| **Alternate Flows** | **A1: PDF Generation Failure** — Fallback to Markdown with notification. |
| **Postconditions** | File downloaded to user's machine. |

### UC-005: Submit Report Feedback

| Field | Value |
|---|---|
| **Actors** | User |
| **Preconditions** | Completed report exists. User viewing report. |
| **Main Flow** | 1. User views report. 2. Selects rating (POSITIVE/NEUTRAL/NEGATIVE) per agent section or overall. 3. Optionally enters comment. 4. System validates, persists to `agents.feedbacks`. 5. Publishes feedback event to Kafka `agent.events`. 6. Acknowledges submission. |
| **Alternate Flows** | **A1: Missing Rating** — Validation error. **A2: Update Feedback** — Old replaced. |
| **Postconditions** | Feedback persisted. Aggregates updated. Kafka event published. |

### UC-006: Configure and Monitor System

| Field | Value |
|---|---|
| **Actors** | System Administrator |
| **Preconditions** | Access to server and `.env` configuration. |
| **Main Flow** | 1. Admin edits `.env` for LLM backends and per-agent config. 2. Restarts service. 3. Pydantic validates at startup. 4. Admin checks `GET /health/ready`. 5. Monitors via health endpoints and structured logs. |
| **Alternate Flows** | **A1: Invalid Config** — Clear error, refuses to start. **A2: Dependency Down** — Degraded mode with warnings. |
| **Postconditions** | System running with desired config. Health endpoints reflect state. |

### UC-007: API-Triggered Analysis

| Field | Value |
|---|---|
| **Actors** | External System (API Client) |
| **Preconditions** | Gateway running. Client has network access to `localhost:8000`. |
| **Main Flow** | 1. Client sends `POST /execute` with model, prompt, and optional template. 2. Gateway validates and routes. 3. Model executes, returns structured output. 4. Gateway responds with result and exit code. |
| **Alternate Flows** | **A1: Streaming** — Client uses `POST /execute/stream` for ndjson chunks. **A2: Invalid Template** — 400 with available templates. |
| **Postconditions** | Result returned. Optionally stored in history. |

---

## 6. Constraints & Assumptions

### 6.1 Technical Constraints

| ID | Type | Description |
|----|------|-------------|
| C-001 | Runtime | Python 3.11+ required for `StrEnum`, `asyncio.TaskGroup`, modern typing. |
| C-002 | Runtime | Node.js 18+ required for Vite, React 19, and CLI AI tools. |
| C-003 | Infrastructure | PostgreSQL 14+, Redis 7, Kafka 7.6 (KRaft mode) as runtime dependencies via `docker-compose.yml`. |
| C-004 | Architecture | Must operate within `packages/workspaces/` monorepo conventions. Integrate with gateway without core modifications. |
| C-005 | Architecture | All AI model interactions routed through gateway subprocess model. No direct API calls from workspace. |
| C-006 | Architecture | All I/O async/await. No blocking calls in request path. |
| C-007 | Protocol | Must use existing WebSocket message protocol (`node_execution_started/log/image/completed`). |
| C-008 | Architecture | Local-first: all data processing and storage on user's machine. No cloud dependencies beyond AI providers. |
| C-009 | Resource | Document upload bounded by local memory and model context window limits. |
| C-010 | Quality | Agent analysis quality bounded by underlying LLM capabilities. Prompt engineering is primary quality lever. |
| C-011 | Resource | Ollama requires minimum 16GB RAM for 7B parameter models; GPU recommended. |

### 6.2 Business Constraints

- **Not Financial Advice:** Output is informational only. All reports must include disclaimers. No investment recommendations.
- **Single-User Focus (Phase 1-2):** Multi-user auth, RBAC, and data isolation deferred to Phase 3.
- **Open-Source LLM Preference:** Ollama (local) as primary to minimize API costs and data exposure. Cloud APIs optional.
- **Data Availability:** Real-time market data requires third-party integration (Phase 2). Initial version uses LLM knowledge and user context.

### 6.3 Assumptions

| ID | Description |
|----|-------------|
| A-001 | Users have machine with sufficient resources for local LLMs via Ollama. |
| A-002 | PostgreSQL, Redis, Kafka available locally or via included Docker Compose. |
| A-003 | At least one LLM backend (Ollama recommended) configured and operational. |
| A-004 | Users have basic domain literacy for their chosen analysis type. |
| A-005 | Target deployment is developer workstation or small server (not HA cluster for v1). |
| A-006 | CLI AI tools (Claude, Gemini, Codex) pre-installed and authenticated when used. |
| A-007 | Gateway and React frontend infrastructure remain stable and backward-compatible. |
| A-008 | Users have sufficient technical literacy to configure `.env` and run shell scripts. |
| A-009 | Analysis quality depends on underlying AI model; platform provides structure, not accuracy guarantees. |
| A-010 | External market data APIs (Yahoo Finance, Alpha Vantage, Polygon.io) integrated in Phase 2. |

### 6.4 Regulatory Constraints

- LLM-generated analysis must be clearly labeled as AI-generated in all output formats.
- User data stored locally. Not transmitted to third parties without explicit consent.
- Compliance with applicable data protection regulations for PII.
- No buy/hold/sell recommendations unless explicitly configured with appropriate disclaimers.

---

## 7. Glossary

| Term | Definition |
|------|------------|
| **Agent** | A specialized AI-powered analyst module performing a specific type of analysis. Equity agents inherit from `BaseAnalystAgent`. |
| **Analyst Type** | One of six equity specializations: MACRO, TECHNICAL, FUNDAMENTAL, SENTIMENT, RISK, QUANTITATIVE. Represented as `AnalystType` enum. |
| **Analysis Template** | A predefined configuration specifying analysis type, prompt structure, and expected output schema (for general analysis mode). |
| **Analysis Session** | A named grouping of related analysis queries sharing conversational context. |
| **Research Task** | A user-initiated equity research request dispatched to one or more agents. Stored in `analysis.research_tasks`. |
| **Execution** | A single run of one agent against one task, tracked with status, timing, I/O. Stored in `agents.executions`. |
| **Consolidated Report** | A unified document synthesizing outputs from multiple agent executions. Stored in `analysis.analysis_reports`. |
| **Routing Gateway** | The FastAPI service (`api_bridge`) routing requests to AI backends via WebSocket and REST. |
| **LLM Backend** | An AI language model provider (Ollama, Claude, Gemini, Codex) used for generating analysis. |
| **Model Node** | An enabled AI CLI tool registered in the gateway's `.env` configuration. |
| **MFLUX** | Remote image generation service for chart visualization and technical diagrams. |
| **Workspace** | An isolated feature module within `packages/workspaces/{name}/`. |
| **Node** | A unit of execution identified by `nodeId` in the WebSocket streaming protocol. |
| **DCF** | Discounted Cash Flow — valuation method estimating present value of future cash flows. |
| **VaR** | Value at Risk — statistical measure of maximum potential loss at a given confidence level. |
| **Factor Exposure** | A stock's sensitivity to systematic risk factors (momentum, value, quality, size). |
| **TTL** | Time To Live — duration a cached value remains valid in Redis (default: 3600s). |
| **NDJSON** | Newline-Delimited JSON — streaming format where each line is a valid JSON object. |
| **Kafka Topic** | Named message channel for event streaming (e.g., `research.tasks`, `research.results`, `market.data`, `agent.events`). |
| **KRaft** | Kafka Raft — Kafka's built-in consensus protocol replacing ZooKeeper. |
| **SWOT** | Strategic analysis framework: Strengths, Weaknesses, Opportunities, Threats. |
| **Risk Register** | Structured output listing identified risks with likelihood, impact, and mitigation. |
| **Context Window** | Maximum input size (in tokens) an AI model can process in a single request. |

---

## 8. Open Questions

| # | Question | Stakeholder | Impact | Suggested Default |
|---|----------|-------------|--------|-------------------|
| OQ-001 | Which external market data APIs will be integrated (Yahoo Finance, Alpha Vantage, Polygon.io)? | Product Owner | Affects FR-045, agent data quality, third-party cost. | Defer to Phase 2; LLM knowledge for now. |
| OQ-002 | Should agent prompt templates be configurable via UI, config files, or hardcoded? | Tech Lead | Affects extensibility and tuning without deployments. | Config files; UI editing in Phase 3. |
| OQ-003 | What is the target LLM model size/family for production? (7B vs. 70B local vs. cloud) | Product Owner / Ops | Affects hardware, quality, latency, cost. | 7B local default, cloud optional. |
| OQ-004 | Is multi-user support planned for Phase 2 or Phase 3? | Product Owner | Affects schema (user ownership), API design, security. | Phase 3. |
| OQ-005 | Should consolidated reports include buy/hold/sell recommendations? | Product Owner / Legal | Affects regulatory compliance and liability. | No; purely analytical. |
| OQ-006 | What is the data retention policy for logs, reports, and feedback? | Ops / Legal | Affects storage, archival, compliance. | Indefinite local retention for v1. |
| OQ-007 | Should agents invoke each other (e.g., risk → quant)? | Tech Lead | Affects orchestration: fan-out vs. dependency graph. | Simple fan-out for Phase 2. |
| OQ-008 | Should the system support scheduled/periodic re-analysis? | Product Owner | Affects scheduler requirement and cache invalidation. | On-demand only for Phase 2. |
| OQ-009 | What real-time data sources for sentiment (Twitter/X, Reddit, news RSS)? | Product Owner | Affects third-party dependencies, rate limits, cost. | LLM general knowledge for Phase 2. |
| OQ-010 | Support asset classes beyond equities (crypto, forex, commodities, ETFs)? | Product Owner | Affects data model, prompts, and data sources. | Equities only for Phase 2. |
| OQ-011 | Acceptable monthly budget for cloud LLM API calls? | Finance | Affects model selection, caching aggressiveness, rate limits. | Local-first; cloud on opt-in. |
| OQ-012 | Specific regulatory frameworks (MiFID II, SEC) to comply with? | Legal / Compliance | Affects report formatting, disclaimers, audit. | General AI disclaimer only for v1. |
| OQ-013 | Should analysis history use SQLite, PostgreSQL, or JSON files? | Tech Lead | Affects data architecture for general analysis mode. | PostgreSQL (shared with equity research). |
| OQ-014 | Maximum document upload size? | Product Owner / Ops | Affects infrastructure and context window management. | 10 MB. |
| OQ-015 | Should the analyst support image/chart input (e.g., screenshot analysis)? | Product Owner | Affects parsing requirements and model selection (vision). | Defer to Phase 3. |
| OQ-016 | Preferred charting library for visualization? | Tech Lead | Affects frontend dependencies. | Recharts (React-native). |
| OQ-017 | Is there a curated library of built-in templates, or user-editable only? | Product Owner | Affects content creation and UX. | Both: built-in defaults + user-created. |

---

## Appendix A: Requirements Traceability Matrix

| User Story | Functional Requirements | Non-Functional Requirements |
|---|---|---|
| US-001 (Equity Research) | FR-020–FR-027, FR-030–FR-033, FR-060, FR-063 | NFR-001, NFR-004, NFR-030, NFR-050 |
| US-002 (Quick Analysis) | FR-001, FR-003, FR-010, FR-011, FR-016 | NFR-002, NFR-003, NFR-007 |
| US-003 (Document Review) | FR-002, FR-013 | NFR-008, NFR-018 |
| US-004 (Real-Time Monitoring) | FR-062, FR-071 | NFR-005 |
| US-005 (Comparative Analysis) | FR-005, FR-012 | NFR-007 |
| US-006 (Iterative Deep-Dive) | FR-079, FR-080 | NFR-002, NFR-003 |
| US-007 (Historical Lookup) | FR-035, FR-046 | NFR-007, NFR-021 |
| US-008 (Feedback) | FR-050, FR-051 | NFR-041, NFR-051 |
| US-009 (LLM Configuration) | FR-060, FR-061, FR-065 | NFR-011, NFR-014, NFR-055 |
| US-010 (Model Comparison) | FR-017, FR-065 | NFR-004 |
| US-011 (API-Driven) | FR-070, FR-081 | NFR-007, NFR-012, NFR-058 |
| US-012 (Report Export) | FR-077, FR-078 | NFR-050, NFR-052 |

## Appendix B: Database Schema Summary

| Schema | Table | Purpose |
|---|---|---|
| `analysis` | `research_tasks` | Tracks user-submitted research requests with status lifecycle |
| `analysis` | `analysis_reports` | Stores consolidated multi-agent reports |
| `analysis` | `general_analyses` | Stores general analysis sessions and results |
| `agents` | `executions` | Records individual agent runs with timing and I/O payloads |
| `agents` | `events` | Structured log events per execution (DEBUG–ERROR) |
| `agents` | `feedbacks` | User ratings and comments linked to executions |
| `market_data` | `stocks` | Stock symbol registry with metadata |

## Appendix C: API Endpoint Summary

| Method | Path | Description | FR |
|---|---|---|---|
| `POST` | `/api/v1/tasks` | Create equity research task | FR-030 |
| `GET` | `/api/v1/tasks` | List tasks (paginated, filterable) | FR-035 |
| `GET` | `/api/v1/tasks/{id}` | Get task detail with reports | FR-035 |
| `DELETE` | `/api/v1/tasks/{id}` | Cancel running task | FR-034 |
| `GET` | `/api/v1/tasks/{id}/report` | Get consolidated report (optional format) | FR-076, FR-078 |
| `GET` | `/api/v1/agents` | List registered agents | FR-026 |
| `POST` | `/api/v1/feedback` | Submit report feedback | FR-050 |
| `POST` | `/execute` | Execute general analysis (sync) | FR-081 |
| `POST` | `/execute/stream` | Execute general analysis (streaming ndjson) | FR-081 |
| `GET` | `/health` | Liveness check | FR-072 |
| `GET` | `/health/ready` | Deep readiness check | FR-072 |
| `GET` | `/models/ollama` | List available Ollama models | FR-061 |
| `WS` | `/ws/agent` | Bidirectional execution streaming | FR-071 |
| `GET` | `/docs` | OpenAPI/Swagger documentation | FR-070 |

---

*Document version 3.0 — 2026-04-07. Consolidated from workspace v1.0 (general-purpose analyst) and default_sync v2.0 (equity research agents). This is a living artifact subject to stakeholder review.*
