# Snapshot Scenarios

---

# Scenario: Save and list snapshots

**ID**: SNAP-001
**Area**: snapshots
**Tests**:
- `internal/org/snapshots_test.go` → "TestSnapshot_SaveAndList"
- `internal/httpapi/handlers_test.go` → "TestSnapshotHandlers_SaveAndList"
- `web/e2e/smoke.spec.ts` → "snapshot save and load"
- `web/src/store/OrgContext.integration.test.tsx` → "save snapshot updates snapshot list"

## Behavior
User saves a named snapshot. The current working state, pods, and settings are stored. The snapshot appears in the list sorted newest-first.

## Invariants
- Snapshot stores deep copies of working, pods, and settings
- Snapshot list is sorted by timestamp descending
- Export-temp snapshot is excluded from list
- Snapshots are persisted to disk

## Edge cases
- Reserved names (__working__, __original__) are rejected (SNAP-005)
- Overwriting an existing name replaces it (SNAP-003)
- Persistence error returns warning (SNAP-006)

---

# Scenario: Load snapshot

**ID**: SNAP-002
**Area**: snapshots
**Tests**:
- `internal/org/snapshots_test.go` → "TestSnapshot_Load"
- `internal/org/snapshots_test.go` → "TestSnapshot_LoadClearsRecycled"
- `internal/httpapi/handlers_test.go` → "TestSnapshotHandlers_Load"
- `web/src/store/OrgContext.integration.test.tsx` → "load snapshot updates working state"

## Behavior
User loads a named snapshot. Working state is replaced with the snapshot's data. Recycled is cleared.

## Invariants
- Working replaced with snapshot's people
- Pods replaced with snapshot's pods (or re-seeded if nil)
- Settings restored from snapshot (or re-derived if empty)
- Recycled is cleared
- Original is unchanged

## Edge cases
- Load nonexistent snapshot returns error (SNAP-004)

---

# Scenario: Overwrite snapshot

**ID**: SNAP-003
**Area**: snapshots
**Tests**:
- `internal/org/snapshots_test.go` → "TestSnapshot_Overwrite"

## Behavior
Saving a snapshot with an existing name replaces the previous snapshot.

## Invariants
- Only one snapshot per name
- Timestamp is updated to current time

## Edge cases
- None

---

# Scenario: Load nonexistent snapshot

**ID**: SNAP-004
**Area**: snapshots
**Tests**:
- `internal/org/snapshots_test.go` → "TestSnapshot_LoadNotFound"
- `internal/httpapi/handlers_test.go` → "TestSnapshotHandlers_LoadNotFound"

## Behavior
Loading a snapshot that doesn't exist returns a not-found error.

## Invariants
- No state mutation
- HTTP 404

## Edge cases
- None

---

# Scenario: Reserved snapshot names

**ID**: SNAP-005
**Area**: snapshots
**Tests**:
- `internal/org/service_test.go` → "TestOrgService_SaveSnapshot_RejectsReservedNames"

## Behavior
Saving a snapshot with a reserved name (__working__, __original__) returns a conflict error. The __export_temp__ name is used internally during snapshot ZIP export and is excluded from the user-visible list.

## Invariants
- HTTP 409 for reserved names (__working__, __original__)
- No state mutation on rejection
- __export_temp__ is used transiently during ZIP export (created, used, then deleted)
- __export_temp__ never appears in ListSnapshots results

## Edge cases
- User cannot save as __export_temp__ (rejected as reserved)
- Empty string name is rejected (see SNAP-009)

---

# Scenario: Snapshot persistence errors

**ID**: SNAP-006
**Area**: snapshots
**Tests**:
- `internal/httpapi/stores_test.go` → "TestSaveSnapshotHandler_PersistenceError"
- `internal/httpapi/stores_test.go` → "TestDeleteSnapshotHandler_PersistenceError"
- `internal/httpapi/stores_test.go` → "TestUpload_SnapshotDeleteError_ReturnsPersistenceWarning"

## Behavior
Disk I/O failures during snapshot persistence are returned as errors or persistence warnings, not silently swallowed.

## Invariants
- Save/delete persist errors return HTTP 500
- Upload snapshot cleanup errors surface as persistenceWarning field
- In-memory state is still updated even if persistence fails

## Edge cases
- None

---

# Scenario: Delete snapshot

**ID**: SNAP-007
**Area**: snapshots
**Tests**:
- `internal/org/snapshots_test.go` → "TestSnapshot_Delete"
- `internal/httpapi/handlers_test.go` → "TestSnapshotHandlers_Delete"
- `web/src/store/OrgContext.integration.test.tsx` → "delete snapshot removes from list"

## Behavior
User deletes a named snapshot. It is removed from the list and persisted.

## Invariants
- Snapshot removed from in-memory map
- Change persisted to disk

## Edge cases
- Persistence error on delete (SNAP-006)

---

# Scenario: Export snapshot

**ID**: SNAP-008
**Area**: snapshots
**Tests**:
- `internal/org/service_test.go` → "TestOrgService_ExportSnapshot"
- `internal/httpapi/handlers_test.go` → "TestExportSnapshotHandler"

## Behavior
Client exports a specific snapshot as CSV or XLSX. Special names __working__ and __original__ return the current working or original data.

## Invariants
- __working__ returns current working people
- __original__ returns original people
- Named snapshot returns that snapshot's people
- Missing snapshot returns 404
- Returns deep copy (mutations don't affect service state)

## Edge cases
- Unsupported format returns 400

---

# Scenario: Snapshot name validation

**ID**: SNAP-009
**Area**: snapshots
**Tests**:
- `internal/org/snapshots_test.go` → "TestSnapshot_Save_EmptyName"
- `internal/org/snapshots_test.go` → "TestSnapshot_Save_PathTraversal"
- `internal/org/snapshots_test.go` → "TestSnapshot_Save_TooLong"
- `internal/org/snapshots_test.go` → "TestSnapshot_Save_ValidSpecialChars"
- `internal/org/snapshots_test.go` → "TestSnapshot_Save_InvalidChars"

## Behavior
Snapshot names are validated before saving. Names must be non-empty, at most 100 characters, and contain only letters, digits, spaces, hyphens, underscores, and dots. The name must start with a letter or digit.

## Invariants
- Empty name returns validation error (HTTP 422)
- Name over 100 characters returns validation error (HTTP 422)
- Names with path-traversal characters (e.g. `../`) are rejected
- Names with special characters (/, <, >, |, null bytes) are rejected
- Valid names with spaces, hyphens, underscores, dots are accepted

## Edge cases
- Name starting with a dot or space is rejected (must start with letter or digit)
- Exactly 100-character name is accepted
- 101-character name is rejected

---

# Scenario: Snapshot save aborts when org state is reset mid-save

**ID**: SNAP-010
**Area**: snapshots
**Tests**:
- `internal/snapshot/service_test.go` → "TestSnapshotService_Save_AbortsWhenEpochAdvances"
- `internal/org/concurrent_test.go` → "TestSnapshotSave_EpochGuard_Reset"
- `internal/org/concurrent_test.go` → "TestSnapshotSave_EpochGuard_UploadCSV"

## Behavior
When a SaveSnapshot races against ResetToOriginal, Create, Upload, ConfirmMapping, or UploadZip (which call Clear or ReplaceAll and bump the snapshot epoch), the SaveSnapshot aborts with HTTP 409 conflict ("snapshot superseded — org state was reset"). The epoch is read BEFORE CaptureState so that a Clear running after the read but before the commit-lock advances `ss.epoch` past the captured expectedEpoch and the commit aborts.

## Invariants
- Epoch is captured before CaptureState begins
- Any Clear or ReplaceAll that runs after epoch capture but before commit bumps epoch
- Commit compares captured epoch to current epoch under the write lock and aborts if they differ
- Aborted save returns HTTP 409 with message "snapshot superseded — org state was reset"
- No snapshot is written on abort

## Edge cases
- Race with Reset (epoch advances via Clear)
- Race with Upload/ConfirmMapping/UploadZip (epoch advances via ReplaceAll)

---

# Scenario: Frontend surfaces snapshot 409 conflict as user-visible error

**ID**: SNAP-011
**Area**: snapshots
**Tests**:
- `web/src/api/client.coverage.test.ts` → "[SNAP-011] saveSnapshot rejects with superseded message on 409 conflict"
- `web/src/store/OrgDataContext.test.tsx` → "[SNAP-011] surfaces 409 snapshot conflict as error banner text containing superseded"

## Behavior
When the backend returns HTTP 409 with body `{"error": "snapshot superseded …"}` from POST /api/snapshots/save, the frontend's API client throws an Error containing the message, the OrgDataContext mutation handler catches it and routes it to setError, and the UI surfaces a banner. The user sees a non-silent error rather than a swallowed failure.

## Invariants
- API client throws Error with the server's error message on HTTP 409
- OrgDataContext save-snapshot handler catches the error and calls setError
- The error message propagates to the UI error banner

## Edge cases
- Error must not be silently swallowed
