# Autosave Scenarios

---

# Scenario: Autosave triggers and storage

**ID**: AUTO-001
**Area**: autosave
**Tests**:
- `web/e2e/autosave.spec.ts` → "autosave is triggered after editing a person"
- `web/src/hooks/useAutosave.test.ts` → "saves to localStorage and calls writeAutosave after debounce"
- `web/src/hooks/useAutosave.test.ts` → "debounces multiple rapid changes into a single save"
- `web/src/hooks/useAutosave.test.ts` → "includes pods and settings in the autosave data"
- `web/src/hooks/useAutosave.test.ts` → "stores the currentSnapshotName in autosave data"

## Behavior
After any mutation, autosave fires (debounced). Data is written to both localStorage and the server.

## Invariants
- Debounced — multiple rapid changes produce one save
- Saves to localStorage AND server via writeAutosave API
- Includes: original, working, recycled, pods, originalPods, settings, snapshotName
- Does not save when loaded=false or working array has zero elements
- Does not save when suppressAutosaveRef.current is true (snapshot export in progress)

## Edge cases
- Server save failure sets serverSaveError flag (AUTO-002)
- Timer cleaned up on unmount
- Snapshot name stored as empty string when currentSnapshotName is null
- localStorage write failure logged to console but does not throw

---

# Scenario: Autosave server error handling

**ID**: AUTO-002
**Area**: autosave
**Tests**:
- `web/src/hooks/useAutosave.test.ts` → "sets serverSaveError to true when writeAutosave rejects"
- `web/src/hooks/useAutosave.test.ts` → "clears serverSaveError on a subsequent successful save"

## Behavior
When the server autosave endpoint fails, the error flag is set. On the next successful save, it clears.

## Invariants
- serverSaveError is true when last server write failed
- serverSaveError clears on next successful write
- localStorage save is independent of server save

## Edge cases
- None

---

# Scenario: Autosave recovery on reload

**ID**: AUTO-003
**Area**: autosave
**Tests**:
- `web/e2e/autosave.spec.ts` → "recovery banner appears and restores state on Restore click"
- `web/e2e/autosave.spec.ts` → "recovery banner appears from server autosave when localStorage is cleared"
- `web/src/components/AutosaveBanner.test.tsx` → "AutosaveBanner"

## Behavior
On app load, if autosave data exists (localStorage first, then server), a recovery banner appears. User can restore or dismiss.

## Invariants
- localStorage checked first, then server
- Restore: full state loaded, backend synced via restoreState API
- Restore clears autosaveAvailable
- Banner shows Restore and Dismiss buttons

## Edge cases
- Corrupt localStorage data is cleared automatically
- Server autosave check only happens if no localStorage data

---

# Scenario: Dismiss autosave

**ID**: AUTO-004
**Area**: autosave
**Tests**:
- `web/e2e/autosave.spec.ts` → "dismiss button clears autosave and shows clean upload state"
- `web/e2e/autosave.spec.ts` → "dismiss clears server-side autosave via DELETE endpoint"

## Behavior
User clicks Dismiss on the recovery banner. Autosave data is cleared from both localStorage and server. App returns to fresh upload state.

## Invariants
- localStorage cleared
- Server DELETE /api/autosave called
- All state reset to empty/default
- loaded set to false

## Edge cases
- Server delete failure is ignored (best-effort)

---

# Scenario: Dirty state tracking

**ID**: AUTO-005
**Area**: autosave
**Tests**:
- `web/src/store/useDirtyTracking.ts` (tested via integration)

## Behavior
When loaded data has been modified, the browser shows a beforeunload warning to prevent accidental navigation.

## Invariants
- beforeunload handler registered when loaded=true and working reference changes
- Handler removed on unmount

## Edge cases
- Initial load does not trigger dirty state

---

# Scenario: Autosave store operations

**ID**: AUTO-006
**Area**: autosave
**Tests**:
- `internal/api/autosave_test.go` → "TestAutosave_WriteAndRead"
- `internal/api/autosave_test.go` → "TestAutosave_ReadMissing"
- `internal/api/autosave_test.go` → "TestAutosave_Delete"
- `internal/api/autosave_test.go` → "TestAutosave_DeleteMissing"
- `internal/api/stores_test.go` → "TestAutosaveHandler_RoundTrip"
- `internal/api/stores_test.go` → "TestAutosaveHandler_WriteError"
- `internal/api/stores_test.go` → "TestAutosaveHandler_ReadError"
- `internal/api/stores_test.go` → "TestAutosaveHandler_DeleteError"

## Behavior
Server-side autosave store supports write, read, and delete operations. Errors are surfaced to the handler layer.

## Invariants
- Write stores JSON data to ~/.grove/autosave.json
- Read returns nil (not error) when file doesn't exist
- Delete is idempotent (missing file is not an error)
- I/O errors are returned to callers

## Edge cases
- None

---

# Scenario: Restore state from autosave

**ID**: AUTO-007
**Area**: autosave
**Tests**:
- `internal/api/service_test.go` → "TestOrgService_RestoreState_FullState"
- `internal/api/service_test.go` → "TestOrgService_RestoreState_OperationsWork"
- `internal/api/service_test.go` → "TestOrgService_RestoreState_NilSettings"
- `internal/api/handlers_test.go` → "TestRestoreStateHandler_Valid"
- `internal/api/handlers_test.go` → "TestRestoreStateHandler_InvalidJSON"

## Behavior
Frontend sends full autosave payload to POST /api/restore-state. Backend replaces all state (original, working, recycled, pods, settings).

## Invariants
- All state replaced atomically
- Nil settings defaults to derived discipline order
- Subsequent mutations work normally after restore

## Edge cases
- Invalid JSON returns 400
