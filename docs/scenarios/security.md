# Security Scenarios

---

# Scenario: CSRF protection

**ID**: SEC-001
**Area**: security
**Tests**:
- `internal/api/handlers_test.go` → "TestCSRFProtect_PostWithoutHeader_Returns403"
- `internal/api/handlers_test.go` → "TestCSRFProtect_PostWithHeader_Succeeds"
- `internal/api/handlers_test.go` → "TestCSRFProtect_GetWithoutHeader_Succeeds"
- `internal/api/handlers_test.go` → "TestCSRFProtect_DeleteWithoutHeader_Returns403"

## Behavior
All POST and DELETE requests must include the `X-Requested-With` header. Browsers do not add custom headers on cross-origin form submissions, so this header acts as a lightweight CSRF defense without requiring tokens. GET requests are not protected (they are read-only and safe). The frontend API client automatically includes `X-Requested-With: XMLHttpRequest` on all POST and DELETE requests.

## Invariants
- POST without `X-Requested-With` returns HTTP 403
- DELETE without `X-Requested-With` returns HTTP 403
- POST with `X-Requested-With: XMLHttpRequest` proceeds normally
- GET without `X-Requested-With` proceeds normally
- The 403 response has the standard `{"error": "..."}` JSON shape

## Edge cases
- Upload endpoints (multipart POST) also require the header
- Log endpoints (POST /api/logs, DELETE /api/logs) also require the header
- The header value is checked for presence only, not validated against a specific value
