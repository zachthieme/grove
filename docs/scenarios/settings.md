# Settings Scenarios

---

# Scenario: Get and update settings

**ID**: SETTINGS-001
**Area**: settings
**Tests**:
- `internal/httpapi/handlers_test.go` → "TestSettingsHandler_GetAndPost"
- `internal/org/service_test.go` → "TestOrgService_UpdateSettings_Validation"
- `web/src/components/SettingsModal.test.tsx` → "SettingsModal"

## Behavior
User opens settings modal, modifies discipline order, and saves. Settings are validated and stored.

## Invariants
- Discipline names are trimmed of whitespace before storage
- Empty discipline names are rejected
- Duplicate discipline names are rejected
- Names with newlines/NUL are rejected
- Names exceeding 500 chars are rejected
- Empty list is valid (clears custom order)

## Edge cases
- Whitespace-only name rejected after trim
- Cancel button closes modal without saving

---

# Scenario: Upload derives settings

**ID**: SETTINGS-002
**Area**: settings
**Tests**:
- `internal/org/service_test.go` → "TestUpload_DerivesSettings"

## Behavior
On fresh upload, settings.disciplineOrder is derived from the unique disciplines in the data, sorted alphabetically.

## Invariants
- Only non-empty discipline values included
- Sorted alphabetically
- Overwritten on each new upload

## Edge cases
- No disciplines in data → empty order
