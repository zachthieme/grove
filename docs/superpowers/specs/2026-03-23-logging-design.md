# Logging & Investigation Feature

## Purpose

A diagnostic logging system for Grove that captures HTTP traffic across both API (server) and web (client) layers, enabling investigation of bugs and unexpected behavior. Activated via `--log` flag. Designed to be inspectable by both humans and LLMs through a single structured JSON endpoint.

## Architecture

### Overview

When `--log` is passed, three things happen:

1. An HTTP logging middleware wraps the API mux, capturing all request/response pairs
2. A `/api/logs` endpoint is registered for querying, posting client-side entries, and truncating
3. A `GET /api/config` endpoint exposes `logging: true` so the frontend can show a log viewer button

All log entries are stored in an in-memory ring buffer (1000 entries). No disk persistence — logs are gone when the process stops.

### Components

```
┌─────────────────────────────────────┐
│  Frontend (web)                     │
│                                     │
│  fetchWithTimeout                   │
│    ├─ generates X-Correlation-ID    │
│    ├─ sends request                 │
│    └─ POSTs client log entry ───────┼──┐
│                                     │  │
│  LogPanel (UI, --log only)          │  │
│    ├─ GET /api/logs (view/filter)   │  │
│    ├─ DELETE /api/logs (clear)      │  │
│    └─ download as JSON              │  │
└─────────────────────────────────────┘  │
                                         │
┌─────────────────────────────────────┐  │
│  Backend (api)                      │  │
│                                     │  │
│  LoggingMiddleware                  │  │
│    ├─ intercepts /api/* requests    │  │
│    ├─ captures req body, resp body  │  │
│    ├─ reads X-Correlation-ID        │  │
│    └─ appends to LogBuffer          │  │
│                                     │  │
│  LogBuffer (in-memory ring buffer)  │  │
│    ├─ max 1000 entries              │◄─┘
│    ├─ thread-safe (sync.RWMutex)    │
│    └─ entries from both layers      │
│                                     │
│  /api/logs endpoints                │
│    ├─ GET  (query + filter)         │
│    ├─ POST (client-side entries)    │
│    └─ DELETE (truncate)             │
│                                     │
│  /api/config endpoint               │
│    └─ { "logging": true/false }     │
└─────────────────────────────────────┘
```

## CLI Flag

New `--log` boolean flag registered on the root command in `cmd/serve.go`, following the existing `--dev` pattern:

```go
rootCmd.Flags().BoolVar(&serveLog, "log", false, "enable request logging and log viewer")
```

When disabled: no middleware injected, no log endpoints registered, zero overhead.

## Log Entry Schema

```json
{
  "id": "unique-id",
  "timestamp": "2026-03-23T14:30:00.123Z",
  "correlationId": "corr-abc123",
  "source": "api | web",
  "method": "POST",
  "path": "/api/update",
  "requestBody": { "personId": "x", "fields": { "managerId": "" } },
  "responseStatus": 200,
  "responseBody": [ "..." ],
  "durationMs": 12
}
```

- `source: "api"` — captured by server middleware
- `source: "web"` — posted by frontend client
- `correlationId` — ties related entries together (e.g., a batch edit's 5 API calls share one ID)

## Logging Middleware

New file: `internal/api/logging.go`

- Wraps `apiRouter` (the mux returned by `api.NewRouter()`) before it is mounted on the top-level mux in `cmd/serve.go`. This ensures only `/api/*` traffic is captured, not static file serving. `NewRouter` accepts the `*LogBuffer` (nil when logging is disabled) and conditionally registers log endpoints.
- Excludes `/api/logs` and `/api/config` from capture (all methods, not just GET) to avoid recursion — the frontend POSTs client-side entries to `/api/logs`, and that POST must not be logged either.
- Reads and re-buffers request body for capture
- Wraps `http.ResponseWriter` to intercept status code and response body
- **File uploads excluded from body capture** — `/api/upload` and `/api/upload/zip` requests only log path, method, status, and duration (no request body) to avoid buffering large files
- **Binary export responses excluded from response body capture** — `/api/export/*` responses log path, method, status, and duration but omit the response body (CSV/XLSX binary data is not useful in logs)
- Appends completed `LogEntry` to `LogBuffer`

## LogBuffer

In-memory ring buffer in `internal/api/logging.go`:

- Fixed capacity of 1000 entries
- Thread-safe via `sync.RWMutex`
- Oldest entries evicted when full
- Methods: `Add(entry)`, `Entries(filters) []LogEntry`, `Clear()`

## Frontend Correlation IDs

Changes to `web/src/api/client.ts`:

- `fetchWithTimeout` generates a short random correlation ID and attaches it as `X-Correlation-ID` header
- API functions accept an optional `correlationId` parameter; if provided, it overrides the auto-generated one
- After each API call completes, the client POSTs a log entry to `POST /api/logs` with `source: "web"`, capturing the client's view (request sent, response received, any error)

### Correlation ID Threading for Batch Operations

Batch operations (e.g., `BatchEditSidebar.handleBatchSave`) need all related API calls to share one correlation ID. The call chain is: `BatchEditSidebar` → `useOrg()` context methods (`reparent`, `update`) → `client.ts` API functions. To thread the correlation ID:

- `client.ts` API functions (`movePerson`, `updatePerson`, etc.) accept an optional `correlationId` parameter
- Context methods in `OrgDataContext.tsx` (`reparent`, `update`, etc.) accept an optional `correlationId` parameter and pass it through to the client functions
- `BatchEditSidebar.handleBatchSave` generates one correlation ID and passes it to each `reparent`/`update` call
- `DetailSidebar.handleSave` also generates one correlation ID when it makes sequential `reparent` + `update` calls for a manager change

### CORS in Dev Mode

The existing `corsDevMiddleware` in `cmd/serve.go` must be updated to allow the `X-Correlation-ID` header:

```go
w.Header().Set("Access-Control-Allow-Headers", "Content-Type, X-Correlation-ID")
```

Without this, the browser blocks the custom header in dev mode (Vite on a separate port).

## Log Endpoints

Only registered when `--log` is enabled.

### `GET /api/logs`

Returns filtered log entries. Used by both the UI log viewer and LLMs.

Query parameters (all optional):
- `correlationId` — filter to entries with this correlation ID
- `source` — filter by `api` or `web`
- `since` — ISO timestamp, only entries after this time
- `limit` — max entries to return (default: all)

Response:
```json
{
  "entries": [ ... ],
  "count": 42,
  "bufferSize": 1000
}
```

### `POST /api/logs`

Accepts a log entry from the frontend client. Body is a single `LogEntry` object (without `id`, which is assigned server-side). Uses `limitBody` (1MB) for consistency with all other POST handlers.

### `DELETE /api/logs`

Clears the ring buffer. Returns `204 No Content`.

## Config Endpoint

### `GET /api/config`

Returns feature flags for the frontend:

```json
{
  "logging": true
}
```

When `--log` is not passed, returns `{ "logging": false }`. The frontend checks this on load to decide whether to show the log viewer button.

The config endpoint is always registered (regardless of `--log`), since the frontend needs to check the flag. It is registered in `NewRouter()` in `handlers.go`, which receives the `--log` flag value as a parameter (alongside the existing `svc` parameter).

## UI Log Viewer

Conditional on `logging: true` from `/api/config`.

### Toolbar Button

A "Logs" button appears in the toolbar (same conditional pattern as existing feature-gated controls). Clicking it opens a log panel.

### Log Panel

A panel/modal with:

- Scrollable list of entries, most recent first
- Each row shows: timestamp, method, path, status, duration, source badge (api/web)
- Click to expand and see full request/response bodies (formatted JSON)
- Click a correlation ID to filter to that group
- "Clear" button — calls `DELETE /api/logs`
- "Download" button — fetches `GET /api/logs` and triggers browser download as `.json` file

### New Files

- `web/src/components/LogPanel.tsx` — the log viewer component
- `web/src/components/LogPanel.module.css` — styles

## Error Handling

- **Large request bodies**: File uploads (`/api/upload`, `/api/upload/zip`) excluded from request body capture. Binary export responses (`/api/export/*`) excluded from response body capture. Middleware checks path prefix to skip.
- **Memory**: 1000 entries with full request/response bodies. For typical Grove usage (small JSON payloads), this is well under 10MB. Acceptable for a diagnostic tool.
- **No auth**: Consistent with all other Grove endpoints (single-user local tool).
- **Frontend log POST failures**: Fire-and-forget. If the POST to `/api/logs` fails, the client silently ignores it — logging should never interfere with actual functionality.

## Testing

### Backend

- `internal/api/logging_test.go`:
  - `LogBuffer` unit tests: add, eviction, clear, filtering
  - Middleware integration test: make a request through the middleware, verify log entry captured with correct fields
  - Endpoint tests: GET with filters, POST client entry, DELETE truncation
  - Verify upload requests excluded from body capture

### Frontend

- `web/src/api/client.test.ts`: verify correlation ID header is attached to requests
- `web/src/components/LogPanel.test.tsx`: renders entries, filter by correlation ID, clear, download

## Files Changed

### New Files
- `internal/api/logging.go` — LogBuffer, LogEntry, middleware, log endpoints
- `internal/api/logging_test.go` — tests
- `web/src/components/LogPanel.tsx` — UI log viewer
- `web/src/components/LogPanel.module.css` — styles
- `web/src/components/LogPanel.test.tsx` — tests

### Modified Files
- `cmd/serve.go` — `--log` flag, conditional middleware injection, CORS header update for `X-Correlation-ID`
- `internal/api/handlers.go` — `NewRouter` accepts `*LogBuffer` param, registers config + log endpoints
- `web/src/store/OrgDataContext.tsx` — context methods accept optional `correlationId` param, pass through to client
- `web/src/api/client.ts` — correlation ID generation, optional param, client-side log posting
- `web/src/api/client.test.ts` — correlation ID tests
- `web/src/components/Toolbar.tsx` — conditional "Logs" button
- `web/src/App.tsx` — fetch config on load, pass logging state down
- `web/src/store/orgTypes.ts` — add `correlationId?: string` optional param to `reparent`, `update`, `move` type signatures; add logging flag to state
