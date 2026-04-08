# API Design Document: Analyst

**Project:** Analyst — A Professional AI Analyst  
**Version:** 1.0.0  
**Date:** 2026-04-07  
**Status:** Finalized for v1 Implementation

---

## 1. API Overview

### 1.1 RESTful Conventions
The Analyst API follows RESTful principles for its HTTP endpoints. It uses standard HTTP methods (`GET`, `POST`, `PUT`, `DELETE`) to perform operations on resources like sessions, templates, and analyses.

- **Request Format**: `application/json` for most endpoints; `multipart/form-data` for uploads.
- **Response Format**: `application/json` or `application/x-ndjson` for streaming.
- **Timestamp Format**: ISO 8601 UTC (`YYYY-MM-DDTHH:MM:SSZ`).
- **Identifier Format**: UUID v4 for sessions, analyses, and uploads; slug-like strings for built-in templates.

### 1.2 Versioning Strategy
The API is versioned via the URL path. All Analyst-specific endpoints are prefixed with `/v1/analyst`.

- **Base URL**: `http://localhost:8000/v1/analyst`
- **Environment Support**: Local-first development and operation.

### 1.3 Response Wrappers
All successful REST responses (2xx) follow a consistent structure:

```json
{
  "success": true,
  "data": { ... },
  "metadata": { ... }
}
```

---

## 2. Authentication & Authorization

### 2.1 v1 Strategy (Local-Only)
For the initial release, the Analyst API is intended for **single-user local use**. It binds to `localhost:8000` and does not implement a formal authentication layer.

### 2.2 Future Strategy (v2+)
When extending to multi-user or network-accessible environments:
- **Auth Mechanism**: Bearer token (JWT) or API Key in the `X-API-Key` header.
- **RBAC**: 
  - `viewer`: Can list and view existing analyses and templates.
  - `analyst`: Can execute new analyses and upload files.
  - `admin`: Can manage user-defined templates and system settings.

---

## 3. Endpoint Specifications

### 3.1 Analysis Execution

#### `POST /analyse`
Execute a new analysis synchronously.

- **Description**: Submits data and instructions to an AI model and waits for the full response.
- **Request Body**: See `AnalysisRequest` in [Data Models](#4-data-models).
- **Response Codes**:
  - `200 OK`: Analysis completed successfully. Returns `AnalysisResponse`.
  - `400 Bad Request`: Invalid template ID or missing required inputs.
  - `413 Payload Too Large`: Input text exceeds `max_input_chars`.
  - `422 Unprocessable Entity`: Input validation failure (e.g., invalid model).
  - `500 Internal Server Error`: Model execution or gateway failure.

#### `POST /analyse/stream`
Execute a new analysis with real-time streaming.

- **Description**: Returns a stream of ndjson chunks as the model generates output.
- **Request Body**: Same as `/analyse`.
- **Response Codes**:
  - `200 OK`: Stream started. `Content-Type: application/x-ndjson`.
- **Stream Events**:
  - `started`: Initial message with `analysis_id` and `session_id`.
  - `chunk`: Incremental content chunk.
  - `error`: Error details if execution fails mid-stream.
  - `completed`: Final summary including exit code and duration.

### 3.2 Ingestion & Storage

#### `POST /upload`
Upload a document for context extraction.

- **Description**: Accepts a file, extracts its text, and stores it in a temporary cache.
- **Request Headers**: `Content-Type: multipart/form-data`
- **Request Body**: `file` (Binary)
- **Response Codes**:
  - `201 Created`: File uploaded and parsed. Returns `UploadResponse`.
  - `413 Payload Too Large`: File exceeds 10 MB limit.
  - `415 Unsupported Media Type`: File extension not in allowed list.

#### `GET /sessions`
List historical analysis sessions.

- **Description**: Returns a paginated list of sessions.
- **Query Parameters**: `limit`, `offset`.
- **Response Codes**:
  - `200 OK`: Returns `SessionListResponse`.

#### `GET /sessions/{session_id}`
Retrieve a specific session with full history.

- **Description**: Returns session metadata and a list of all turns (user queries and assistant responses).
- **Response Codes**:
  - `200 OK`: Returns `SessionDetailResponse`.
  - `404 Not Found`: Session ID does not exist.

### 3.3 Output & Templates

#### `POST /export`
Export a completed analysis to Markdown or PDF.

- **Description**: Renders a report based on a completed analysis ID.
- **Request Body**: `ExportRequest`.
- **Response Codes**:
  - `200 OK`: Returns binary file. `Content-Type` set to `text/markdown` or `application/pdf`.
  - `404 Not Found`: Analysis ID not found.

#### `GET /templates`
List all available analysis templates.

- **Description**: Returns built-in and user-defined templates.
- **Response Codes**:
  - `200 OK`: Returns `TemplateListResponse`.

#### `POST /templates`
Create a custom analysis template.

- **Description**: Persists a new template to the user's library.
- **Request Body**: `TemplateCreateRequest`.
- **Response Codes**:
  - `201 Created`: Template saved. Returns `TemplateResponse`.

---

## 4. Data Models

### 4.1 AnalysisRequest
```json
{
  "session_id": "string | null",
  "template_id": "string | null",
  "inputs": {
    "text": "string",
    "upload_ids": ["string"],
    "urls": ["string"],
    "data_paste": "string"
  },
  "client": "string (e.g. 'claude')",
  "model": "string | null",
  "parameters": {
    "temperature": "number (default: 0.3)",
    "max_tokens": "integer (default: 4096)"
  }
}
```

### 4.2 AnalysisResponse
```json
{
  "analysis_id": "string (uuid)",
  "session_id": "string (uuid)",
  "template_id": "string",
  "client": "string",
  "output": "string (markdown content)",
  "exit_code": "integer",
  "duration_ms": "integer",
  "context_tokens_used": "integer",
  "created_at": "string (iso8601)"
}
```

### 4.3 SessionDetail
```json
{
  "session_id": "string",
  "name": "string",
  "turns": [
    {
      "analysis_id": "string",
      "role": "enum('user', 'assistant')",
      "content": "string",
      "template_id": "string | null",
      "created_at": "string"
    }
  ]
}
```

### 4.4 TemplateDefinition
```json
{
  "id": "string",
  "name": "string",
  "description": "string",
  "analysis_type": "string",
  "system_prompt": "string",
  "user_prompt_template": "string",
  "output_schema": "string",
  "builtin": "boolean"
}
```

---

## 5. Pagination

The Analyst API uses standard **Offset-based Pagination** for listing resources (sessions, templates, history).

- **`limit`**: Maximum number of items to return (Default: 20, Max: 100).
- **`offset`**: Number of items to skip from the beginning (Default: 0).

**Example Response Metadata:**
```json
"metadata": {
  "total": 142,
  "limit": 20,
  "offset": 40,
  "next_offset": 60,
  "prev_offset": 20
}
```

---

## 6. Error Handling

### 6.1 Error Response Format
All errors return a non-2xx HTTP status code and a consistent JSON body:

```json
{
  "success": false,
  "error": {
    "code": "string_error_code",
    "message": "Human-readable description of the error.",
    "details": { ... }
  }
}
```

### 6.2 Standard Error Codes
| Code | HTTP Status | Description |
|------|-------------|-------------|
| `invalid_request` | 400 | The request body or parameters are malformed. |
| `unauthorized` | 401 | Missing or invalid authentication. |
| `forbidden` | 403 | Authenticated but insufficient permissions. |
| `not_found` | 404 | The requested resource (session/template) does not exist. |
| `payload_too_large` | 413 | Input exceeds size limits (10 MB file / 100k chars). |
| `unsupported_format` | 415 | File extension or media type not supported. |
| `model_error` | 500 | The underlying AI model returned an error or crashed. |
| `gateway_timeout` | 504 | The analysis took longer than the configured timeout. |

---

## 7. Rate Limiting

### 7.1 Local Concurrency Limits
Since the Analyst runs on a local machine, rate limiting is implemented as a **Concurrency Limit** rather than a traditional token-bucket/leaky-bucket strategy.

- **Maximum Concurrent Analyses**: 5 (Default). Subsequent requests will return `429 Too Many Requests`.
- **Response Headers**:
  - `X-RateLimit-Limit`: Maximum concurrent requests.
  - `X-RateLimit-Remaining`: Remaining slots available.

### 7.2 File Storage Quota
- **Total Storage Limit**: 1 GB.
- **Per-Upload Limit**: 10 MB.
- Uploads exceeding the total quota will return `507 Insufficient Storage`.

---

## 8. WebSocket Endpoints

### 8.1 Endpoint Path
`WS /ws/agent` (shared with the existing dashboard).

### 8.2 Analyst Message Protocol
Analyst-specific interactions use a dedicated message type `analyst_execute`.

#### **Client → Server: `analyst_execute`**
Identical to the `POST /analyse` request body, but wrapped in a WebSocket message envelope with `type: "analyst_execute"`.

#### **Server → Client: Progress Updates**
The server broadcasts standard `node_execution_log` messages. The frontend identifies Analyst logs by the `analyst_` prefix on the `nodeId`.

```json
{"type": "node_execution_log", "nodeId": "analyst_123", "log": "Processing document..."}
```

---

## 9. API Changelog

| Version | Date | Changes |
|---------|------|---------|
| 1.0.0   | 2026-04-07 | Initial release. Added sessions, templates, and streaming analysis support. |

---
