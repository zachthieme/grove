# API Contract Scenarios

---

# Scenario: JSON contract stability

**ID**: CONTRACT-001
**Area**: api-contract
**Tests**:
- `internal/httpapi/contract_test.go` → "TestContractPersonFields"
- `internal/httpapi/contract_test.go` → "TestContractPodFields"
- `internal/httpapi/contract_test.go` → "TestContractPodInfoFields"
- `internal/httpapi/contract_test.go` → "TestContractOrgDataFields"
- `internal/httpapi/contract_test.go` → "TestContractAutosaveDataFields"
- `internal/httpapi/contract_test.go` → "TestContractSnapshotInfoFields"
- `internal/httpapi/contract_test.go` → "TestContractMappedColumnFields"
- `internal/httpapi/contract_test.go` → "TestContractUploadResponseFields"
- `internal/httpapi/contract_test.go` → "TestContractSettingsFields"
- `internal/httpapi/contract_test.go` → "TestContractPersonJSONRoundTrip"

## Behavior
API types have stable JSON field names. Adding fields is allowed; removing or renaming is a breaking change.

## Invariants
- Each struct has exactly the expected set of JSON tags
- JSON round-trip preserves all fields
- New fields must be added to contract tests

## Edge cases
- None

---

# Scenario: Handler error mapping

**ID**: CONTRACT-002
**Area**: api-contract
**Tests**:
- `internal/httpapi/handlers_test.go` → "TestMoveHandler_InvalidJSON"
- `internal/httpapi/handlers_test.go` → "TestUpdateHandler_InvalidJSON"
- `internal/httpapi/handlers_test.go` → "TestAddHandler_InvalidJSON"
- `internal/httpapi/handlers_test.go` → "TestDeleteHandler_InvalidJSON"
- `internal/httpapi/handlers_test.go` → "TestRestoreHandler_InvalidJSON"
- `internal/httpapi/handlers_test.go` → "TestConfirmMappingHandler_InvalidJSON"
- `internal/httpapi/handlers_test.go` → "TestSaveSnapshotHandler_InvalidJSON"
- `internal/httpapi/handlers_test.go` → "TestLoadSnapshotHandler_InvalidJSON"
- `internal/httpapi/handlers_test.go` → "TestDeleteSnapshotHandler_InvalidJSON"

## Behavior
Invalid JSON in request body returns 400. Typed service errors map to appropriate HTTP status codes.

## Invariants
- Invalid JSON → 400
- ValidationError → 422
- NotFoundError → 404
- ConflictError → 409
- Untyped errors → 500

## Edge cases
- Body size limit (1 MB for JSON endpoints, 50 MB for uploads)

---

# Scenario: Health endpoint

**ID**: CONTRACT-003
**Area**: api-contract
**Tests**:
- `internal/httpapi/handlers_test.go` → "TestHealthEndpoint"

## Behavior
GET /api/health returns 200 with {"status": "ok"}.

## Invariants
- Always returns 200
- Response body is {"status": "ok"}

## Edge cases
- None

---

# Scenario: Correlation ID tracking

**ID**: CONTRACT-004
**Area**: api-contract
**Tests**:
- `web/src/api/client.test.ts` → "correlation ID"
- `web/src/api/client.errors.test.ts` → "network error"
- `web/src/api/client.errors.test.ts` → "HTTP 500 response"
- `web/src/api/client.errors.test.ts` → "malformed JSON response"
- `web/src/api/client.errors.test.ts` → "request timeout"

## Behavior
Every API request includes an X-Correlation-ID header. Auto-generated if not provided. Used for log correlation.

## Invariants
- Header always present on requests
- Provided correlationId used when given
- Unique IDs generated for separate calls

## Edge cases
- Network errors, 500s, malformed JSON, and timeouts all propagate correctly

---

# Scenario: Logging infrastructure

**ID**: CONTRACT-005
**Area**: api-contract
**Tests**:
- `internal/logbuf/buffer_test.go` → buffer eviction + filter coverage
- `internal/logbuf/handler_test.go` → slog handler coverage
- `internal/httpapi/middleware_test.go` → request/response capture, body exclusions, config endpoint, log endpoint registration

## Behavior
Optional logging buffer captures request/response data. Filterable by correlation ID, source, time, limit.

## Invariants
- Buffer evicts oldest entries when full
- Upload body excluded from logging
- Export response body excluded
- Log endpoints excluded from logging
- Config endpoint reports whether logging is enabled
- Log endpoints only registered when buffer is non-nil

## Edge cases
- None

---

# Scenario: Deep copy isolation

**ID**: CONTRACT-006
**Area**: api-contract
**Tests**:
- `internal/org/service_test.go` → "TestOrgService_DeepCopyPeople_WithAdditionalTeams"
- `internal/org/service_test.go` → "TestOrgService_GetOrg_NoData"

## Behavior
All data returned from OrgService is deeply copied. Mutations on returned data don't affect service state.

## Invariants
- AdditionalTeams slices are independently copied
- Modifying returned Person doesn't affect service's internal slice
- GetOrg returns nil when no data loaded

## Edge cases
- None

---

# Scenario: Integration round-trip

**ID**: CONTRACT-007
**Area**: api-contract
**Tests**:
- `integration_test.go` → "TestIntegration_WebAPI_RoundTrip"

## Behavior
Full HTTP round-trip: upload CSV → get org → verify data matches.

## Invariants
- Upload returns 200 with "ready" status
- GET /api/org returns the uploaded data
- Person count matches CSV row count

## Edge cases
- None

---

# Scenario: Snapshot store persistence

**ID**: CONTRACT-008
**Area**: api-contract
**Tests**:
- `internal/snapshot/store_test.go` → "TestSnapshotStore_WriteAndRead"
- `internal/snapshot/store_test.go` → "TestSnapshotStore_ReadMissing"
- `internal/snapshot/store_test.go` → "TestSnapshotStore_Delete"
- `internal/httpapi/stores_test.go` → "TestNewOrgService_SnapshotReadError_StartsEmpty"
- `internal/httpapi/stores_test.go` → "TestNewOrgService_LoadsPreviousSnapshots"
- `internal/autosave/stores_test.go` → "TestMemoryAutosaveStore_BasicOperations"
- `internal/autosave/stores_test.go` → "TestMemoryAutosaveStore_Implements_Interface"

## Behavior
Snapshot store reads/writes JSON to ~/.grove/snapshots.json. Memory store provides test-friendly implementation.

## Invariants
- Write then Read returns same data
- Read on missing file returns nil (not error)
- Delete removes the file
- OrgService starts empty if store read fails
- OrgService loads previous snapshots on startup

## Edge cases
- None

---

# Scenario: Model validation

**ID**: CONTRACT-009
**Area**: api-contract
**Tests**:
- `internal/model/model_test.go` → all tests
- `internal/parser/parser_test.go` → all tests

## Behavior
Domain model validates people on construction. Parser converts CSV rows to domain model.

## Invariants
- Duplicate names allowed
- Dangling manager references allowed (with warning)
- Invalid status generates warning (doesn't reject)
- Only Name and Status are required fields; missing either generates a warning
- Team, Role, and Discipline are optional for all statuses (blank allowed)

## Edge cases
- Empty input → empty org
- Multiple warnings on same person
- Warning doesn't block other rows

---

# Scenario: Negative e2e behaviors

**ID**: CONTRACT-010
**Area**: api-contract
**Tests**:
- `web/e2e/negative.spec.ts` → all tests

## Behavior
Server errors during mutations don't lose data or crash the app.

## Invariants
- Server error during update shows error state
- Server error during delete keeps person visible
- Server error during move keeps org intact
- Network timeout shows error
- Snapshot save with server error doesn't lose data

## Edge cases
- None

---

# Scenario: Accessibility

**ID**: CONTRACT-011
**Area**: api-contract
**Tests**:
- `web/e2e/accessibility.spec.ts` → all tests

## Behavior
Core views pass axe-core critical accessibility checks.

## Invariants
- Upload prompt: no critical violations
- Detail view: no critical violations
- Table view: no critical violations
- Manager view: no critical violations

## Edge cases
- None

---

# Scenario: Content-Disposition filename sanitization

**ID**: CONTRACT-012
**Area**: api-contract
**Tests**:
- `internal/httpapi/handlers_test.go` → "TestSanitizeFilename"
- `internal/httpapi/handlers_test.go` → "TestWriteFileResponse_SanitizedHeader"

## Behavior
Export response filenames are sanitized to prevent HTTP header injection. Control characters, quotes, and backslashes are stripped.

## Invariants
- No control characters (0x00-0x1f, 0x7f) in Content-Disposition filename
- Filename wrapped in double quotes per RFC 6266
- Empty filename after sanitization defaults to "download"
- Unicode characters preserved

## Edge cases
- CRLF injection attempt produces clean filename
- All-control-char filename falls back to "download"

---

# Scenario: Response shape validation

**ID**: CONTRACT-013
**Area**: api-contract
**Tests**:
- `internal/httpapi/contract_test.go` → "TestContractPersonFieldTypes"
- `internal/httpapi/contract_test.go` → "TestContractErrorResponseShape"
- `internal/httpapi/contract_test.go` → "TestContractGetOrgResponseShape"
- `internal/httpapi/contract_test.go` → "TestContractUploadResponseShape"

## Behavior
API responses conform to expected JSON shapes. Person fields have correct types, error responses always have `{"error": "message"}` structure, and endpoint responses contain required keys with correct types.

## Invariants
- Person string fields serialize as JSON strings
- Person array fields serialize as JSON arrays (never null)
- Person numeric fields serialize as JSON numbers
- All error responses have single "error" key with non-empty string value
- GET /api/org returns object with original, working, pods, settings keys
- POST /api/upload returns status string and orgData object on success

## Edge cases
- Zero-value omitempty fields may be absent from JSON

---

# Scenario: Content-Type validation on JSON endpoints

**ID**: CONTRACT-014
**Area**: api-contract
**Tests**:
- `internal/httpapi/handlers_test.go` → "TestContentTypeValidation"
- `internal/httpapi/handlers_test.go` → "TestContentTypeValidation_ErrorShape"

## Behavior
POST endpoints that expect JSON validate the Content-Type header. Non-JSON Content-Types are rejected with 415 Unsupported Media Type.

## Invariants
- `application/json` accepted
- `application/json; charset=utf-8` accepted
- Empty Content-Type accepted (backwards compatibility)
- All other Content-Types return 415
- 415 response has standard `{"error": "message"}` shape

## Edge cases
- File upload endpoints (multipart) are not affected
