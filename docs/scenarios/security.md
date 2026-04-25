# Security Scenarios

---

# Scenario: CSRF protection — XHR header gate

**ID**: SEC-001
**Area**: security
**Tests**:
- `internal/api/handlers_test.go` → "TestCSRFProtect_PostWithoutHeader_Returns403"
- `internal/api/handlers_test.go` → "TestCSRFProtect_PostWithHeader_Succeeds"
- `internal/api/handlers_test.go` → "TestCSRFProtect_GetWithoutHeader_Succeeds"
- `internal/api/handlers_test.go` → "TestCSRFProtect_DeleteWithoutHeader_Returns403"

## Behavior
All POST and DELETE requests must include the `X-Requested-With` header. Browsers do not add custom headers on cross-origin simple-request submissions (form/img/script), so this header blocks the cheapest class of CSRF attack without requiring tokens. GET requests are not protected (they are read-only and safe). The frontend API client automatically includes `X-Requested-With: XMLHttpRequest` on all POST and DELETE requests.

## Invariants
- POST without `X-Requested-With` returns HTTP 403
- DELETE without `X-Requested-With` returns HTTP 403
- POST with `X-Requested-With: XMLHttpRequest` proceeds normally (subject to SEC-002)
- GET without `X-Requested-With` proceeds normally
- The 403 response has the standard `{"error": "..."}` JSON shape

## Edge cases
- Upload endpoints (multipart POST) also require the header
- Log endpoints (POST /api/logs, DELETE /api/logs) also require the header
- The header value is checked for presence only, not validated against a specific value

---

# Scenario: CSRF protection — Origin/Referer host match

**ID**: SEC-002
**Area**: security
**Tests**:
- `internal/api/handlers_test.go` → "TestCSRFProtect_CrossOriginPost_Returns403"
- `internal/api/handlers_test.go` → "TestCSRFProtect_SameOriginPost_Succeeds"
- `internal/api/handlers_test.go` → "TestCSRFProtect_CrossOriginReferer_Returns403"
- `internal/api/handlers_test.go` → "TestCSRFProtect_MalformedOrigin_Returns403"

## Behavior
On POST and DELETE, after the SEC-001 XHR header gate, the server checks the request's `Origin` header (preferred) or `Referer` header. If either is present, its host must equal the request's `Host` header. Modern browsers always send `Origin` on POST, so a fetch-from-evil.com attack with a forged `X-Requested-With` is rejected at this layer. Non-browser clients (curl, tests) typically omit `Origin`/`Referer` and pass via SEC-001 alone — acceptable because they aren't subject to browser-level CSRF.

## Invariants
- POST with `Origin` whose host ≠ `Host` returns HTTP 403
- POST with `Referer` whose host ≠ `Host` returns HTTP 403 (when `Origin` absent)
- POST with `Origin` whose host == `Host` proceeds normally
- POST with neither `Origin` nor `Referer` falls through to SEC-001 only
- An unparseable `Origin`/`Referer` is treated as a mismatch (403)
- `Origin` is checked before `Referer`; only the first present header is consulted

## Edge cases
- `Origin: null` (sandboxed iframes, file://) parses with empty host → mismatch → 403
- Trailing slashes in `Referer` ignored (only host compared)
- IPv6 hosts compared verbatim (port included on both sides)
