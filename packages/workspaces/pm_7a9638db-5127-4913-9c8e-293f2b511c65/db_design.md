# Database Design Document: Analyst

**Project:** Analyst  
**Phase:** `db_design`  
**Date:** 2026-04-07  
**Input Artifacts:** `requirements.md`, `system_design.md`, `api_design.md`

## 0. Design Context And Assumptions

This database design is anchored to the current documented scope:

- Local-first, single-user v1
- Structured history must persist to disk
- Sessions support single-shot and follow-up conversational analysis
- Multiple input sources can be attached to one request
- Multi-model comparison is supported
- Uploads, charts, and exports are stored on the filesystem, with metadata in the database

Assumed defaults from the requirements and system design:

- Primary analysis domain: general-purpose business / technical analysis
- Persistence: SQLite for durable structured data
- Upload size: 10 MB default maximum
- Authentication: none in v1, but schema should not block a later multi-user upgrade

## 1. Database Selection

### 1.1 Chosen Approach

**Primary choice: RDBMS**

- **Engine for v1:** SQLite 3.x
- **Pattern:** Relational core + filesystem-backed blob storage

### 1.2 Justification

SQLite is the right v1 system of record because the product is explicitly local-first, single-user, and embedded inside the existing FastAPI gateway. The data model is strongly relational:

- sessions contain requests
- requests link to templates and many input sources
- each request can produce one or more model executions
- executions can have annotations, charts, and exports

This makes an RDBMS a better fit than a document store.

SQLite is preferred over a server-based RDBMS for v1 because it provides:

- ACID transactions with no separate service to operate
- good read performance for local history browsing
- WAL mode for concurrent reads during streaming writes
- straightforward backup by copying a small set of local files

The design deliberately stores large binary assets outside the database:

- uploads under `data/uploads/`
- generated exports under `data/exports/`
- generated charts under `data/charts/`

Only metadata, paths, hashes, and extracted text are stored in SQLite. This keeps the database small, queryable, and resilient.

### 1.3 Future Upgrade Path

If the product later becomes multi-user or network-accessible, the same logical schema can move to PostgreSQL with these type upgrades:

- `TEXT` UUIDs -> native `UUID`
- JSON text columns -> `JSONB`
- trigger-based timestamps -> server-side defaults and generated columns where appropriate

## 2. Entity-Relationship Diagram

### 2.1 Text ER Diagram

```text
app_setting

analysis_template
  1 ----< analysis_session.default_template_id
  1 ----< analysis_request.template_id

analysis_session
  1 ----< analysis_request

analysis_request
  1 ----< analysis_execution
  1 ----< analysis_request (self-reference via parent_request_id for follow-ups)
  >----< analysis_source (via analysis_request_source)

analysis_source
  >----< analysis_request (via analysis_request_source)

analysis_execution
  1 ----< analysis_annotation
  1 ----< analysis_chart
  1 ----< analysis_export

schema_migration
```

### 2.2 Entity Summary

**`app_setting`**
- Stores workspace-level defaults such as default model, upload limit, and retention period.

**`analysis_template`**
- Stores built-in and user-created templates, including prompts, output schema hints, and default parameters.

**`analysis_session`**
- Logical folder / thread for related analyses.

**`analysis_request`**
- One user-submitted analysis prompt within a session.
- Can be a first request or a follow-up request.

**`analysis_source`**
- Canonical metadata for any attached source material:
  text block, pasted data, uploaded file, or fetched URL.

**`analysis_request_source`**
- Junction table linking requests to one or more input sources in a defined order.

**`analysis_execution`**
- One model-specific execution result for a request.
- Supports single-model runs and multi-model comparisons.

**`analysis_annotation`**
- Manual notes attached to a specific execution result.

**`analysis_chart`**
- Generated chart artifacts associated with an execution.

**`analysis_export`**
- Export metadata for Markdown and PDF output files.

**`schema_migration`**
- Operational table recording applied schema migrations.

## 3. Table Definitions

### 3.1 `app_setting`

Stores system and workspace defaults. Key-value is appropriate here because the set of settings is small and changes infrequently.

| Column | Type | Constraints | Default | Description |
|---|---|---|---|---|
| `setting_key` | `TEXT` | `PRIMARY KEY` | none | Stable config key, e.g. `default_client` |
| `setting_value` | `TEXT` | `NOT NULL` | none | Serialized value |
| `value_type` | `TEXT` | `NOT NULL`, `CHECK (value_type IN ('string','integer','float','boolean','json'))` | none | Indicates how to interpret `setting_value` |
| `scope` | `TEXT` | `NOT NULL`, `CHECK (scope IN ('system','workspace'))` | `'workspace'` | Namespace for the setting |
| `description` | `TEXT` | nullable | `NULL` | Human-readable purpose |
| `updated_at` | `TEXT` | `NOT NULL` | `strftime('%Y-%m-%dT%H:%M:%fZ','now')` | Last update time in UTC |

**Primary key**
- `setting_key`

**Foreign keys**
- None

**Unique constraints**
- None beyond primary key

**Indexes**
- No extra index required; primary-key lookups dominate.

### 3.2 `analysis_template`

Templates are versioned so historical analyses keep pointing to the exact prompt definition used at runtime.

| Column | Type | Constraints | Default | Description |
|---|---|---|---|---|
| `id` | `TEXT` | `PRIMARY KEY` | application-generated UUID | Surrogate template identifier |
| `template_key` | `TEXT` | `NOT NULL` | none | Stable slug, e.g. `risk_assessment` |
| `version` | `INTEGER` | `NOT NULL`, `CHECK (version > 0)` | `1` | Monotonic template version |
| `name` | `TEXT` | `NOT NULL` | none | Display name |
| `description` | `TEXT` | nullable | `NULL` | User-facing description |
| `analysis_type` | `TEXT` | `NOT NULL`, `CHECK (analysis_type IN ('summarisation','trend','comparative','risk_assessment','swot','sentiment','custom'))` | none | Functional category |
| `origin` | `TEXT` | `NOT NULL`, `CHECK (origin IN ('builtin','user'))` | none | Built-in or user-defined |
| `status` | `TEXT` | `NOT NULL`, `CHECK (status IN ('active','archived'))` | `'active'` | Template lifecycle |
| `system_prompt` | `TEXT` | `NOT NULL` | none | System prompt content |
| `user_prompt_template` | `TEXT` | `NOT NULL` | none | Prompt template body with placeholders |
| `output_schema_json` | `TEXT` | nullable, `CHECK (output_schema_json IS NULL OR json_valid(output_schema_json))` | `NULL` | Advisory structured-output schema |
| `default_parameters_json` | `TEXT` | nullable, `CHECK (default_parameters_json IS NULL OR json_valid(default_parameters_json))` | `NULL` | Default temperature, max tokens, etc. |
| `recommended_models_json` | `TEXT` | `NOT NULL`, `CHECK (json_valid(recommended_models_json))` | `'[]'` | Recommended clients/models |
| `created_at` | `TEXT` | `NOT NULL` | `strftime('%Y-%m-%dT%H:%M:%fZ','now')` | Created timestamp |
| `updated_at` | `TEXT` | `NOT NULL` | `strftime('%Y-%m-%dT%H:%M:%fZ','now')` | Last update timestamp |

**Primary key**
- `id`

**Foreign keys**
- None

**Unique constraints**
- `UNIQUE (template_key, version)`

**Indexes**
- `idx_analysis_template_lookup (template_key, status, version DESC)`
  Reason: fast lookup of the latest active version for a template slug.
- `idx_analysis_template_type (analysis_type, status)`
  Reason: supports template-library filtering by analysis type.

### 3.3 `analysis_session`

Sessions group related requests and preserve conversational continuity.

| Column | Type | Constraints | Default | Description |
|---|---|---|---|---|
| `id` | `TEXT` | `PRIMARY KEY` | application-generated UUID | Session identifier exposed via API |
| `name` | `TEXT` | `NOT NULL` | none | Session title |
| `description` | `TEXT` | nullable | `NULL` | Optional session summary |
| `status` | `TEXT` | `NOT NULL`, `CHECK (status IN ('active','archived'))` | `'active'` | Session state |
| `default_template_id` | `TEXT` | nullable, `REFERENCES analysis_template(id) ON DELETE SET NULL` | `NULL` | Optional default template for new requests |
| `default_client` | `TEXT` | nullable | `NULL` | Optional default model client such as `claude` |
| `created_at` | `TEXT` | `NOT NULL` | `strftime('%Y-%m-%dT%H:%M:%fZ','now')` | Creation timestamp |
| `updated_at` | `TEXT` | `NOT NULL` | `strftime('%Y-%m-%dT%H:%M:%fZ','now')` | Metadata update timestamp |
| `last_activity_at` | `TEXT` | `NOT NULL` | `strftime('%Y-%m-%dT%H:%M:%fZ','now')` | Used for history sorting |
| `archived_at` | `TEXT` | nullable | `NULL` | Archive timestamp |

**Primary key**
- `id`

**Foreign keys**
- `default_template_id -> analysis_template(id)`

**Unique constraints**
- None

**Indexes**
- `idx_analysis_session_recent (status, last_activity_at DESC)`
  Reason: session history screens usually sort by recent activity.
- `idx_analysis_session_template (default_template_id)`
  Reason: supports reverse lookups and avoids FK scan cost.

### 3.4 `analysis_request`

Represents the user-side turn in a session. A single request may fan out to multiple executions when cross-model comparison is enabled.

| Column | Type | Constraints | Default | Description |
|---|---|---|---|---|
| `id` | `TEXT` | `PRIMARY KEY` | application-generated UUID | Request identifier |
| `session_id` | `TEXT` | `NOT NULL`, `REFERENCES analysis_session(id) ON DELETE CASCADE` | none | Owning session |
| `parent_request_id` | `TEXT` | nullable, `REFERENCES analysis_request(id) ON DELETE SET NULL` | `NULL` | Previous request for follow-up threading |
| `template_id` | `TEXT` | nullable, `REFERENCES analysis_template(id) ON DELETE SET NULL` | `NULL` | Template used for this request |
| `request_kind` | `TEXT` | `NOT NULL`, `CHECK (request_kind IN ('single','follow_up','comparison'))` | `'single'` | Interaction type |
| `prompt_text` | `TEXT` | `NOT NULL` | `''` | Free-form user prompt |
| `data_paste_text` | `TEXT` | nullable | `NULL` | Pasted CSV / JSON / tabular content |
| `requested_clients_json` | `TEXT` | `NOT NULL`, `CHECK (json_valid(requested_clients_json) AND json_array_length(requested_clients_json) > 0)` | none | Requested clients/models |
| `parameters_json` | `TEXT` | nullable, `CHECK (parameters_json IS NULL OR json_valid(parameters_json))` | `NULL` | User-specified execution parameters |
| `status` | `TEXT` | `NOT NULL`, `CHECK (status IN ('queued','running','completed','partial_failed','failed','cancelled'))` | `'queued'` | Request lifecycle |
| `created_at` | `TEXT` | `NOT NULL` | `strftime('%Y-%m-%dT%H:%M:%fZ','now')` | Submission time |
| `completed_at` | `TEXT` | nullable | `NULL` | Completion or terminal failure time |

**Primary key**
- `id`

**Foreign keys**
- `session_id -> analysis_session(id)`
- `parent_request_id -> analysis_request(id)`
- `template_id -> analysis_template(id)`

**Unique constraints**
- None

**Indexes**
- `idx_analysis_request_session_created (session_id, created_at DESC)`
  Reason: fetching session history is a core read path.
- `idx_analysis_request_parent (parent_request_id)`
  Reason: follow-up thread reconstruction needs fast parent lookup.
- `idx_analysis_request_status (status, created_at DESC)`
  Reason: useful for background cleanup, retries, and monitoring.

### 3.5 `analysis_source`

Stores reusable metadata for all context sources. Large binaries stay on disk; extracted text and structured payloads stay queryable in the database.

| Column | Type | Constraints | Default | Description |
|---|---|---|---|---|
| `id` | `TEXT` | `PRIMARY KEY` | application-generated UUID | Source identifier |
| `source_type` | `TEXT` | `NOT NULL`, `CHECK (source_type IN ('upload','url','text','data_paste','derived_context'))` | none | Nature of the source |
| `title` | `TEXT` | nullable | `NULL` | Display label |
| `source_uri` | `TEXT` | nullable | `NULL` | Original URL when source type is `url` |
| `original_filename` | `TEXT` | nullable | `NULL` | Uploaded filename before sanitization |
| `mime_type` | `TEXT` | nullable | `NULL` | MIME type |
| `storage_path` | `TEXT` | nullable | `NULL` | Relative filesystem path to stored artifact |
| `sha256_hex` | `TEXT` | nullable | `NULL` | Content hash for dedupe and integrity |
| `size_bytes` | `INTEGER` | nullable, `CHECK (size_bytes IS NULL OR size_bytes >= 0)` | `NULL` | Raw byte size |
| `extracted_text` | `TEXT` | nullable | `NULL` | Parsed plain text used for prompting |
| `structured_payload_json` | `TEXT` | nullable, `CHECK (structured_payload_json IS NULL OR json_valid(structured_payload_json))` | `NULL` | Structured content such as JSON or parsed tables |
| `metadata_json` | `TEXT` | nullable, `CHECK (metadata_json IS NULL OR json_valid(metadata_json))` | `NULL` | Parser metadata such as page count or charset |
| `extraction_status` | `TEXT` | `NOT NULL`, `CHECK (extraction_status IN ('pending','ready','failed'))` | `'ready'` | Parsing state |
| `extraction_error` | `TEXT` | nullable | `NULL` | Failure details for rejected or failed sources |
| `retention_until` | `TEXT` | nullable | `NULL` | Cleanup boundary for temporary files |
| `created_at` | `TEXT` | `NOT NULL` | `strftime('%Y-%m-%dT%H:%M:%fZ','now')` | Creation timestamp |

**Primary key**
- `id`

**Foreign keys**
- None

**Unique constraints**
- Enforced through partial unique index on `sha256_hex`

**Indexes**
- `uidx_analysis_source_sha256 (sha256_hex) WHERE sha256_hex IS NOT NULL`
  Reason: deduplicates identical uploaded content.
- `idx_analysis_source_type_created (source_type, created_at DESC)`
  Reason: supports cleanup and source browsing by type.
- `idx_analysis_source_uri (source_uri)`
  Reason: supports URL dedupe and troubleshooting repeated fetches.

### 3.6 `analysis_request_source`

Junction table for many-to-many request/source association.

| Column | Type | Constraints | Default | Description |
|---|---|---|---|---|
| `request_id` | `TEXT` | `NOT NULL`, `REFERENCES analysis_request(id) ON DELETE CASCADE` | none | Owning request |
| `source_id` | `TEXT` | `NOT NULL`, `REFERENCES analysis_source(id) ON DELETE RESTRICT` | none | Attached source |
| `source_role` | `TEXT` | `NOT NULL`, `CHECK (source_role IN ('primary','supplemental','conversation_context'))` | `'primary'` | Semantic role in prompt assembly |
| `include_mode` | `TEXT` | `NOT NULL`, `CHECK (include_mode IN ('full_text','summary','excerpt'))` | `'full_text'` | How the source should be injected into context |
| `sort_order` | `INTEGER` | `NOT NULL`, `CHECK (sort_order >= 1)` | `1` | Stable prompt assembly order |
| `created_at` | `TEXT` | `NOT NULL` | `strftime('%Y-%m-%dT%H:%M:%fZ','now')` | Link creation timestamp |

**Primary key**
- `(request_id, source_id)`

**Foreign keys**
- `request_id -> analysis_request(id)`
- `source_id -> analysis_source(id)`

**Unique constraints**
- Composite primary key prevents duplicate links

**Indexes**
- `idx_analysis_request_source_order (request_id, sort_order)`
  Reason: sources must be assembled deterministically for prompt construction.
- `idx_analysis_request_source_source (source_id)`
  Reason: supports reverse lookups before deleting or expiring a source.

### 3.7 `analysis_execution`

One request can produce multiple executions, one per selected model. This is the central result table.

| Column | Type | Constraints | Default | Description |
|---|---|---|---|---|
| `id` | `TEXT` | `PRIMARY KEY` | application-generated UUID | Execution identifier |
| `request_id` | `TEXT` | `NOT NULL`, `REFERENCES analysis_request(id) ON DELETE CASCADE` | none | Parent request |
| `gateway_node_id` | `TEXT` | nullable | `NULL` | Correlation ID for WebSocket / executor events |
| `provider_code` | `TEXT` | `NOT NULL` | none | Gateway client identifier such as `claude` |
| `model_name` | `TEXT` | nullable | `NULL` | Concrete model version if available |
| `is_primary` | `INTEGER` | `NOT NULL`, `CHECK (is_primary IN (0,1))` | `0` | Marks the preferred result in a comparison set |
| `status` | `TEXT` | `NOT NULL`, `CHECK (status IN ('queued','running','completed','failed','cancelled'))` | `'queued'` | Execution lifecycle |
| `system_prompt_snapshot` | `TEXT` | `NOT NULL` | none | Resolved system prompt used at runtime |
| `compiled_prompt_snapshot` | `TEXT` | `NOT NULL` | none | Full prompt sent to the executor |
| `raw_output_markdown` | `TEXT` | nullable | `NULL` | Final model output as Markdown/text |
| `structured_output_json` | `TEXT` | nullable, `CHECK (structured_output_json IS NULL OR json_valid(structured_output_json))` | `NULL` | Parsed report structure, scores, tables |
| `exit_code` | `INTEGER` | nullable | `NULL` | Executor exit code |
| `error_message` | `TEXT` | nullable | `NULL` | Model or execution failure detail |
| `duration_ms` | `INTEGER` | nullable, `CHECK (duration_ms IS NULL OR duration_ms >= 0)` | `NULL` | Total execution duration |
| `first_token_at` | `TEXT` | nullable | `NULL` | Timestamp for first streamed token |
| `started_at` | `TEXT` | nullable | `NULL` | Start timestamp |
| `completed_at` | `TEXT` | nullable | `NULL` | Terminal timestamp |
| `context_tokens_used` | `INTEGER` | nullable, `CHECK (context_tokens_used IS NULL OR context_tokens_used >= 0)` | `NULL` | Final prompt context size |
| `prompt_tokens` | `INTEGER` | nullable, `CHECK (prompt_tokens IS NULL OR prompt_tokens >= 0)` | `NULL` | Prompt token count if available |
| `completion_tokens` | `INTEGER` | nullable, `CHECK (completion_tokens IS NULL OR completion_tokens >= 0)` | `NULL` | Output token count if available |
| `temperature` | `REAL` | nullable | `NULL` | Execution temperature actually used |
| `max_tokens` | `INTEGER` | nullable, `CHECK (max_tokens IS NULL OR max_tokens > 0)` | `NULL` | Maximum completion tokens |
| `created_at` | `TEXT` | `NOT NULL` | `strftime('%Y-%m-%dT%H:%M:%fZ','now')` | Row creation time |

**Primary key**
- `id`

**Foreign keys**
- `request_id -> analysis_request(id)`

**Unique constraints**
- `UNIQUE (gateway_node_id)`

**Indexes**
- `idx_analysis_execution_request (request_id, created_at)`
  Reason: fetch all model results for a request quickly.
- `idx_analysis_execution_status (status, created_at DESC)`
  Reason: drives work queues, monitoring, and stuck-job detection.
- `idx_analysis_execution_provider (provider_code, created_at DESC)`
  Reason: supports model-level reporting and filters.
- `idx_analysis_execution_completed (completed_at DESC)`
  Reason: supports “recent analyses” and cleanup/reporting screens.

### 3.8 `analysis_annotation`

Stores manual analyst notes on top of model output.

| Column | Type | Constraints | Default | Description |
|---|---|---|---|---|
| `id` | `TEXT` | `PRIMARY KEY` | application-generated UUID | Annotation identifier |
| `execution_id` | `TEXT` | `NOT NULL`, `REFERENCES analysis_execution(id) ON DELETE CASCADE` | none | Annotated execution |
| `note_markdown` | `TEXT` | `NOT NULL` | none | Note body |
| `anchor_json` | `TEXT` | nullable, `CHECK (anchor_json IS NULL OR json_valid(anchor_json))` | `NULL` | Optional pointer into a section, table, or chart |
| `include_in_exports` | `INTEGER` | `NOT NULL`, `CHECK (include_in_exports IN (0,1))` | `1` | Whether exports should include the note |
| `created_at` | `TEXT` | `NOT NULL` | `strftime('%Y-%m-%dT%H:%M:%fZ','now')` | Creation timestamp |
| `updated_at` | `TEXT` | `NOT NULL` | `strftime('%Y-%m-%dT%H:%M:%fZ','now')` | Last update timestamp |

**Primary key**
- `id`

**Foreign keys**
- `execution_id -> analysis_execution(id)`

**Unique constraints**
- None

**Indexes**
- `idx_analysis_annotation_execution (execution_id, created_at)`
  Reason: annotations are always loaded in execution detail views.

### 3.9 `analysis_chart`

Metadata for generated visualizations.

| Column | Type | Constraints | Default | Description |
|---|---|---|---|---|
| `id` | `TEXT` | `PRIMARY KEY` | application-generated UUID | Chart identifier |
| `execution_id` | `TEXT` | `NOT NULL`, `REFERENCES analysis_execution(id) ON DELETE CASCADE` | none | Parent execution |
| `chart_type` | `TEXT` | `NOT NULL`, `CHECK (chart_type IN ('bar','line','pie','scatter','area','table','other'))` | none | Visualization type |
| `title` | `TEXT` | `NOT NULL` | none | Chart title |
| `spec_json` | `TEXT` | `NOT NULL`, `CHECK (json_valid(spec_json))` | none | Normalized chart definition used for rendering |
| `storage_path` | `TEXT` | nullable | `NULL` | Filesystem path to rendered image/SVG |
| `mime_type` | `TEXT` | `NOT NULL` | `'image/png'` | Artifact type |
| `created_at` | `TEXT` | `NOT NULL` | `strftime('%Y-%m-%dT%H:%M:%fZ','now')` | Creation timestamp |

**Primary key**
- `id`

**Foreign keys**
- `execution_id -> analysis_execution(id)`

**Unique constraints**
- None

**Indexes**
- `idx_analysis_chart_execution (execution_id)`
  Reason: charts are always fetched as children of an execution.

### 3.10 `analysis_export`

Tracks generated download artifacts.

| Column | Type | Constraints | Default | Description |
|---|---|---|---|---|
| `id` | `TEXT` | `PRIMARY KEY` | application-generated UUID | Export identifier |
| `execution_id` | `TEXT` | `NOT NULL`, `REFERENCES analysis_execution(id) ON DELETE CASCADE` | none | Source execution |
| `export_format` | `TEXT` | `NOT NULL`, `CHECK (export_format IN ('markdown','pdf'))` | none | Output type |
| `status` | `TEXT` | `NOT NULL`, `CHECK (status IN ('ready','failed'))` | `'ready'` | Export lifecycle |
| `storage_path` | `TEXT` | `NOT NULL` | none | Relative file path |
| `checksum_sha256` | `TEXT` | nullable | `NULL` | Artifact checksum |
| `size_bytes` | `INTEGER` | nullable, `CHECK (size_bytes IS NULL OR size_bytes >= 0)` | `NULL` | Artifact size |
| `options_json` | `TEXT` | nullable, `CHECK (options_json IS NULL OR json_valid(options_json))` | `NULL` | Export options such as branding or annotation inclusion |
| `error_message` | `TEXT` | nullable | `NULL` | Failure detail for unsuccessful exports |
| `created_at` | `TEXT` | `NOT NULL` | `strftime('%Y-%m-%dT%H:%M:%fZ','now')` | Creation timestamp |

**Primary key**
- `id`

**Foreign keys**
- `execution_id -> analysis_execution(id)`

**Unique constraints**
- None

**Indexes**
- `idx_analysis_export_execution (execution_id, created_at DESC)`
  Reason: export history is retrieved by execution.
- `idx_analysis_export_format (export_format, created_at DESC)`
  Reason: useful for cleanup and reporting by output type.

### 3.11 `schema_migration`

Operational ledger for forward-only schema migrations.

| Column | Type | Constraints | Default | Description |
|---|---|---|---|---|
| `version` | `TEXT` | `PRIMARY KEY` | none | Migration identifier, e.g. `001_initial` |
| `checksum_sha256` | `TEXT` | `NOT NULL` | none | File checksum for drift detection |
| `applied_at` | `TEXT` | `NOT NULL` | `strftime('%Y-%m-%dT%H:%M:%fZ','now')` | Applied timestamp |
| `execution_ms` | `INTEGER` | nullable, `CHECK (execution_ms IS NULL OR execution_ms >= 0)` | `NULL` | Runtime for observability |

**Primary key**
- `version`

**Foreign keys**
- None

**Unique constraints**
- None beyond primary key

**Indexes**
- No extra index required.

## 4. Relationships

### 4.1 One-to-Many

- `analysis_template 1 -> many analysis_session`
  via `analysis_session.default_template_id`
- `analysis_template 1 -> many analysis_request`
  via `analysis_request.template_id`
- `analysis_session 1 -> many analysis_request`
- `analysis_request 1 -> many analysis_execution`
- `analysis_execution 1 -> many analysis_annotation`
- `analysis_execution 1 -> many analysis_chart`
- `analysis_execution 1 -> many analysis_export`

### 4.2 Self-Referential One-to-Many

- `analysis_request 1 -> many analysis_request`
  via `parent_request_id`

This models follow-up questions and conversational branching without needing a separate thread table.

### 4.3 Many-to-Many

- `analysis_request many <-> many analysis_source`
  via `analysis_request_source`

This is required because:

- one request can include several files, URLs, and pasted blocks
- one uploaded or fetched source may be reused across later requests in the same session

### 4.4 One-to-One

No mandatory one-to-one tables are required in v1. The design intentionally avoids splitting sparse child tables unless a separate lifecycle exists.

## 5. Data Types And Modeling Rationale

### 5.1 UUID vs Serial

Use **UUIDs stored as `TEXT`** in SQLite for all externally visible identifiers:

- `analysis_session.id`
- `analysis_request.id`
- `analysis_execution.id`
- `analysis_source.id`
- `analysis_annotation.id`
- `analysis_chart.id`
- `analysis_export.id`
- `analysis_template.id`

Rationale:

- IDs are exposed through REST and WebSocket APIs
- UUIDs avoid leaking record counts or insertion order
- UUIDs simplify future merge/sync or migration to a remote store
- UUIDs keep client-side correlation straightforward

### 5.2 Timestamp Type

Use UTC ISO-8601 strings in `TEXT` columns rather than Unix epoch integers.

Rationale:

- aligns with the API design
- easier to inspect manually in SQLite tools
- portable across SQLite and PostgreSQL migrations

### 5.3 Boolean Representation

SQLite has no true boolean type, so booleans use `INTEGER` with `CHECK (col IN (0,1))`.

Used for:

- `analysis_execution.is_primary`
- `analysis_annotation.include_in_exports`

### 5.4 JSON Text vs Fully Normalized Tables

Use JSON text with `json_valid()` checks for flexible fields:

- `output_schema_json`
- `default_parameters_json`
- `recommended_models_json`
- `requested_clients_json`
- `parameters_json`
- `structured_payload_json`
- `metadata_json`
- `structured_output_json`
- `anchor_json`
- `spec_json`
- `options_json`

Rationale:

- these structures are variable and evolve faster than the core relational model
- they are mostly retrieved with the parent record rather than joined independently
- over-normalizing them would create write-heavy, low-value child tables

Normalization is still used for stable business entities and relationships:

- sessions
- requests
- sources
- executions
- annotations
- exports

### 5.5 File Content Storage

Do **not** store large uploads, PDFs, or chart binaries as database BLOBs.

Rationale:

- simpler backup and cleanup
- avoids database bloat
- faster export and file-serving behavior
- makes filesystem permission hardening straightforward

Only store:

- path
- hash
- mime type
- extracted text
- structured metadata

### 5.6 Prompt And Output Snapshots

Store `system_prompt_snapshot` and `compiled_prompt_snapshot` in `analysis_execution`.

Rationale:

- exact reproducibility of historical analyses
- debuggability when templates or context assembly rules change
- avoids ambiguity in multi-model comparisons

## 6. SQL DDL

The following DDL is the recommended v1 baseline for SQLite.

```sql
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;
PRAGMA busy_timeout = 5000;

CREATE TABLE IF NOT EXISTS app_setting (
    setting_key TEXT PRIMARY KEY,
    setting_value TEXT NOT NULL,
    value_type TEXT NOT NULL CHECK (value_type IN ('string','integer','float','boolean','json')),
    scope TEXT NOT NULL DEFAULT 'workspace' CHECK (scope IN ('system','workspace')),
    description TEXT,
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE IF NOT EXISTS analysis_template (
    id TEXT PRIMARY KEY,
    template_key TEXT NOT NULL,
    version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0),
    name TEXT NOT NULL,
    description TEXT,
    analysis_type TEXT NOT NULL CHECK (
        analysis_type IN ('summarisation','trend','comparative','risk_assessment','swot','sentiment','custom')
    ),
    origin TEXT NOT NULL CHECK (origin IN ('builtin','user')),
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','archived')),
    system_prompt TEXT NOT NULL,
    user_prompt_template TEXT NOT NULL,
    output_schema_json TEXT CHECK (output_schema_json IS NULL OR json_valid(output_schema_json)),
    default_parameters_json TEXT CHECK (default_parameters_json IS NULL OR json_valid(default_parameters_json)),
    recommended_models_json TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(recommended_models_json)),
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    UNIQUE (template_key, version)
);

CREATE TABLE IF NOT EXISTS analysis_session (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','archived')),
    default_template_id TEXT REFERENCES analysis_template(id) ON DELETE SET NULL,
    default_client TEXT,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    last_activity_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    archived_at TEXT
);

CREATE TABLE IF NOT EXISTS analysis_request (
    id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL REFERENCES analysis_session(id) ON DELETE CASCADE,
    parent_request_id TEXT REFERENCES analysis_request(id) ON DELETE SET NULL,
    template_id TEXT REFERENCES analysis_template(id) ON DELETE SET NULL,
    request_kind TEXT NOT NULL DEFAULT 'single' CHECK (request_kind IN ('single','follow_up','comparison')),
    prompt_text TEXT NOT NULL DEFAULT '',
    data_paste_text TEXT,
    requested_clients_json TEXT NOT NULL CHECK (
        json_valid(requested_clients_json) AND json_array_length(requested_clients_json) > 0
    ),
    parameters_json TEXT CHECK (parameters_json IS NULL OR json_valid(parameters_json)),
    status TEXT NOT NULL DEFAULT 'queued' CHECK (
        status IN ('queued','running','completed','partial_failed','failed','cancelled')
    ),
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    completed_at TEXT
);

CREATE TABLE IF NOT EXISTS analysis_source (
    id TEXT PRIMARY KEY,
    source_type TEXT NOT NULL CHECK (source_type IN ('upload','url','text','data_paste','derived_context')),
    title TEXT,
    source_uri TEXT,
    original_filename TEXT,
    mime_type TEXT,
    storage_path TEXT,
    sha256_hex TEXT,
    size_bytes INTEGER CHECK (size_bytes IS NULL OR size_bytes >= 0),
    extracted_text TEXT,
    structured_payload_json TEXT CHECK (structured_payload_json IS NULL OR json_valid(structured_payload_json)),
    metadata_json TEXT CHECK (metadata_json IS NULL OR json_valid(metadata_json)),
    extraction_status TEXT NOT NULL DEFAULT 'ready' CHECK (extraction_status IN ('pending','ready','failed')),
    extraction_error TEXT,
    retention_until TEXT,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE IF NOT EXISTS analysis_request_source (
    request_id TEXT NOT NULL REFERENCES analysis_request(id) ON DELETE CASCADE,
    source_id TEXT NOT NULL REFERENCES analysis_source(id) ON DELETE RESTRICT,
    source_role TEXT NOT NULL DEFAULT 'primary' CHECK (
        source_role IN ('primary','supplemental','conversation_context')
    ),
    include_mode TEXT NOT NULL DEFAULT 'full_text' CHECK (
        include_mode IN ('full_text','summary','excerpt')
    ),
    sort_order INTEGER NOT NULL DEFAULT 1 CHECK (sort_order >= 1),
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    PRIMARY KEY (request_id, source_id)
);

CREATE TABLE IF NOT EXISTS analysis_execution (
    id TEXT PRIMARY KEY,
    request_id TEXT NOT NULL REFERENCES analysis_request(id) ON DELETE CASCADE,
    gateway_node_id TEXT UNIQUE,
    provider_code TEXT NOT NULL,
    model_name TEXT,
    is_primary INTEGER NOT NULL DEFAULT 0 CHECK (is_primary IN (0,1)),
    status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','running','completed','failed','cancelled')),
    system_prompt_snapshot TEXT NOT NULL,
    compiled_prompt_snapshot TEXT NOT NULL,
    raw_output_markdown TEXT,
    structured_output_json TEXT CHECK (structured_output_json IS NULL OR json_valid(structured_output_json)),
    exit_code INTEGER,
    error_message TEXT,
    duration_ms INTEGER CHECK (duration_ms IS NULL OR duration_ms >= 0),
    first_token_at TEXT,
    started_at TEXT,
    completed_at TEXT,
    context_tokens_used INTEGER CHECK (context_tokens_used IS NULL OR context_tokens_used >= 0),
    prompt_tokens INTEGER CHECK (prompt_tokens IS NULL OR prompt_tokens >= 0),
    completion_tokens INTEGER CHECK (completion_tokens IS NULL OR completion_tokens >= 0),
    temperature REAL,
    max_tokens INTEGER CHECK (max_tokens IS NULL OR max_tokens > 0),
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE IF NOT EXISTS analysis_annotation (
    id TEXT PRIMARY KEY,
    execution_id TEXT NOT NULL REFERENCES analysis_execution(id) ON DELETE CASCADE,
    note_markdown TEXT NOT NULL,
    anchor_json TEXT CHECK (anchor_json IS NULL OR json_valid(anchor_json)),
    include_in_exports INTEGER NOT NULL DEFAULT 1 CHECK (include_in_exports IN (0,1)),
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE IF NOT EXISTS analysis_chart (
    id TEXT PRIMARY KEY,
    execution_id TEXT NOT NULL REFERENCES analysis_execution(id) ON DELETE CASCADE,
    chart_type TEXT NOT NULL CHECK (chart_type IN ('bar','line','pie','scatter','area','table','other')),
    title TEXT NOT NULL,
    spec_json TEXT NOT NULL CHECK (json_valid(spec_json)),
    storage_path TEXT,
    mime_type TEXT NOT NULL DEFAULT 'image/png',
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE IF NOT EXISTS analysis_export (
    id TEXT PRIMARY KEY,
    execution_id TEXT NOT NULL REFERENCES analysis_execution(id) ON DELETE CASCADE,
    export_format TEXT NOT NULL CHECK (export_format IN ('markdown','pdf')),
    status TEXT NOT NULL DEFAULT 'ready' CHECK (status IN ('ready','failed')),
    storage_path TEXT NOT NULL,
    checksum_sha256 TEXT,
    size_bytes INTEGER CHECK (size_bytes IS NULL OR size_bytes >= 0),
    options_json TEXT CHECK (options_json IS NULL OR json_valid(options_json)),
    error_message TEXT,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE IF NOT EXISTS schema_migration (
    version TEXT PRIMARY KEY,
    checksum_sha256 TEXT NOT NULL,
    applied_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    execution_ms INTEGER CHECK (execution_ms IS NULL OR execution_ms >= 0)
);

CREATE INDEX IF NOT EXISTS idx_analysis_template_lookup
    ON analysis_template (template_key, status, version DESC);

CREATE INDEX IF NOT EXISTS idx_analysis_template_type
    ON analysis_template (analysis_type, status);

CREATE INDEX IF NOT EXISTS idx_analysis_session_recent
    ON analysis_session (status, last_activity_at DESC);

CREATE INDEX IF NOT EXISTS idx_analysis_session_template
    ON analysis_session (default_template_id);

CREATE INDEX IF NOT EXISTS idx_analysis_request_session_created
    ON analysis_request (session_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_analysis_request_parent
    ON analysis_request (parent_request_id);

CREATE INDEX IF NOT EXISTS idx_analysis_request_status
    ON analysis_request (status, created_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS uidx_analysis_source_sha256
    ON analysis_source (sha256_hex)
    WHERE sha256_hex IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_analysis_source_type_created
    ON analysis_source (source_type, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_analysis_source_uri
    ON analysis_source (source_uri);

CREATE INDEX IF NOT EXISTS idx_analysis_request_source_order
    ON analysis_request_source (request_id, sort_order);

CREATE INDEX IF NOT EXISTS idx_analysis_request_source_source
    ON analysis_request_source (source_id);

CREATE INDEX IF NOT EXISTS idx_analysis_execution_request
    ON analysis_execution (request_id, created_at);

CREATE INDEX IF NOT EXISTS idx_analysis_execution_status
    ON analysis_execution (status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_analysis_execution_provider
    ON analysis_execution (provider_code, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_analysis_execution_completed
    ON analysis_execution (completed_at DESC);

CREATE INDEX IF NOT EXISTS idx_analysis_annotation_execution
    ON analysis_annotation (execution_id, created_at);

CREATE INDEX IF NOT EXISTS idx_analysis_chart_execution
    ON analysis_chart (execution_id);

CREATE INDEX IF NOT EXISTS idx_analysis_export_execution
    ON analysis_export (execution_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_analysis_export_format
    ON analysis_export (export_format, created_at DESC);
```

## 7. Migration Strategy

### 7.1 Initial Schema Creation

Recommended initial migration set:

1. `001_initial.sql`
   Creates all core tables, indexes, pragmas, and triggers.
2. `002_seed_builtin_templates.sql`
   Inserts built-in template rows for summarisation, trend, comparative, risk, SWOT, and sentiment.
3. `003_seed_settings.sql`
   Inserts default settings such as `default_client`, upload retention, and size limits.

### 7.2 Migration Tooling

Use **forward-only SQL migrations** applied at application startup.

Recommended rules:

- migrations are numbered and immutable
- each migration is wrapped in a transaction
- apply one migration at a time and log into `schema_migration`
- block startup if a migration checksum has changed unexpectedly

### 7.3 Future Schema Evolution

For backward-compatible changes:

- add nullable columns first
- backfill in batches
- switch reads/writes in application code
- add stronger constraints only after backfill

For risky changes:

- create a new table
- dual-write temporarily
- backfill historical data
- cut reads over
- retire the old table in a later migration

### 7.4 SQLite-Specific Migration Safety

- perform a filesystem backup of `analyst.db`, `analyst.db-wal`, and `analyst.db-shm` before each migration batch
- run migrations with `BEGIN IMMEDIATE`
- keep `PRAGMA foreign_keys = ON`
- run `PRAGMA integrity_check` after non-trivial structural migrations

## 8. Performance Considerations

### 8.1 Expected Query Patterns

Primary read patterns:

- list recent sessions
- open one session and load all requests + executions chronologically
- load one request with its sources and model outputs
- retrieve recent analyses by model or status
- fetch one execution with annotations, charts, and exports
- deduplicate uploads by SHA-256

Primary write patterns:

- insert request at submission time
- insert one or more executions immediately after dispatch
- update execution rows during and after streaming
- create export/chart/annotation rows after completion

### 8.2 Index Strategy

The index plan is intentionally narrow:

- compound indexes follow the dominant WHERE + ORDER BY shapes
- no speculative indexes on large text columns
- JSON fields are not indexed in v1 because query patterns do not justify it

### 8.3 Text Search

For v1, session history can be browsed without full-text search.

If search becomes important, add SQLite FTS5 virtual tables:

- `analysis_request_fts` over `prompt_text`
- `analysis_execution_fts` over `raw_output_markdown`
- optionally include session name

This should be introduced as a later migration because FTS maintenance adds write overhead.

### 8.4 Partitioning

No table partitioning is needed in v1.

Reason:

- single-user local workload
- expected row counts remain modest
- SQLite does not provide native partitioning

If the product later moves to PostgreSQL and row counts exceed roughly 1M executions, partition by month on:

- `analysis_execution.created_at`
- `analysis_source.created_at`

### 8.5 Read Replicas

Not applicable for SQLite v1.

If a future PostgreSQL deployment is introduced:

- primary handles writes
- one read replica can serve history, reporting, and export browsing

### 8.6 SQLite Runtime Settings

Recommended runtime configuration:

- WAL mode enabled
- `busy_timeout = 5000`
- single-writer async queue for request/execution state transitions
- periodic `VACUUM` during maintenance windows
- `ANALYZE` after large backfills or bulk imports

## 9. Data Integrity

### 9.1 Declarative Constraints

Use the database to enforce:

- all parent-child relationships via foreign keys
- lifecycle values through `CHECK` constraints
- JSON validity through `json_valid(...)`
- dedupe on content hash through a partial unique index
- non-negative durations, token counts, and sizes

### 9.2 Cascading Rules

- deleting a session cascades to its requests, executions, annotations, charts, and exports
- deleting a request cascades to its executions and request-source links
- deleting an execution cascades to annotations, charts, and exports
- deleting a source is restricted while it is still referenced by any request
- deleting a template sets template references to `NULL` rather than deleting history

### 9.3 Triggers

Recommended triggers:

1. `updated_at` maintenance on mutable tables
2. touch `analysis_session.last_activity_at` whenever a request is inserted
3. touch `analysis_session.last_activity_at` whenever an execution reaches a terminal state

Example:

```sql
CREATE TRIGGER IF NOT EXISTS trg_analysis_session_touch_after_request
AFTER INSERT ON analysis_request
FOR EACH ROW
BEGIN
    UPDATE analysis_session
       SET last_activity_at = NEW.created_at,
           updated_at = NEW.created_at
     WHERE id = NEW.session_id;
END;
```

### 9.4 Stored Procedures

Not required in SQLite.

Application-level transactions should handle higher-level business rules such as:

- creating a request and its execution rows atomically
- marking request status based on aggregate child execution status
- deleting expired upload files only after DB state is updated

## 10. Backup And Recovery

### 10.1 What Must Be Backed Up

Back up all of the following together:

- `data/analyst.db`
- `data/analyst.db-wal`
- `data/analyst.db-shm`
- `data/uploads/`
- `data/exports/`
- `data/charts/`
- any on-disk template source directory if YAML templates remain user-editable outside the DB

### 10.2 Backup Strategy

Recommended baseline for local-first v1:

- on application shutdown: consistent SQLite backup using the SQLite backup API or a quiesced file copy
- daily scheduled snapshot while idle
- pre-migration backup before any schema upgrade
- optional rolling retention: 7 daily, 4 weekly, 3 monthly backups

### 10.3 Recovery Strategy

Recovery steps:

1. stop the application
2. restore the database file set and related asset directories from the same backup point
3. run `PRAGMA integrity_check`
4. verify asset paths and checksums on a sample of uploads and exports
5. restart the application

### 10.4 Corruption Handling

If SQLite corruption is detected:

- preserve the corrupt files for forensic inspection
- restore the latest known-good snapshot
- replay any recoverable files from uploads/exports if they postdate the DB snapshot

## 11. Seed Data

### 11.1 Required Seed Records

**Templates**

- `summarisation`
- `trend_analysis`
- `comparative_analysis`
- `risk_assessment`
- `swot`
- `sentiment_analysis`

Each seed template should include:

- `template_key`
- `version = 1`
- prompt definitions
- advisory output schema
- recommended models list

**Settings**

- `default_client = "claude"`
- `default_temperature = 0.3`
- `default_max_tokens = 4096`
- `max_upload_size_mb = 10`
- `upload_retention_days = 7`
- `history_retention_days = 365` or `0` for no automatic purge
- `default_locale = "en"`

### 11.2 Optional Seed Data

- starter example session and example analyses for demos only
- disabled by default outside local demo mode

### 11.3 Seed Loading Strategy

- built-in templates originate in version-controlled YAML
- startup seed process inserts them into `analysis_template` if missing
- if YAML changes, create a new template version row instead of mutating history in place

## 12. Final Recommendation

Use **SQLite as the primary relational store** with the schema above and keep all large artifacts on the filesystem. This design satisfies the current Analyst requirements while avoiding a rewrite when the product adds:

- more templates
- cross-model execution comparison
- richer exports and charting
- history search
- a future PostgreSQL-backed multi-user mode

Compared with the minimal schema in the current system appendix, this design adds the missing domain structures needed for a professional analyst product:

- reusable multi-source inputs
- versioned templates
- request vs execution separation
- many-model fan-out
- annotations
- charts
- export metadata
- operational migration tracking
