# Snapshot Scenarios

---

# Scenario: Save and list snapshots

**ID**: SNAP-001
**Area**: snapshots
**Tests**:
- `internal/api/snapshots_test.go` → "TestSnapshot_SaveAndList"
- `internal/api/handlers_test.go` → "TestSnapshotHandlers_SaveAndList"
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
- `internal/api/snapshots_test.go` → "TestSnapshot_Load"
- `internal/api/snapshots_test.go` → "TestSnapshot_LoadClearsRecycled"
- `internal/api/handlers_test.go` → "TestSnapshotHandlers_Load"
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
- `internal/api/snapshots_test.go` → "TestSnapshot_Overwrite"

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
- `internal/api/snapshots_test.go` → "TestSnapshot_LoadNotFound"
- `internal/api/handlers_test.go` → "TestSnapshotHandlers_LoadNotFound"

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
- `internal/api/service_test.go` → "TestOrgService_SaveSnapshot_RejectsReservedNames"

## Behavior
Saving a snapshot with a reserved name (__working__, __original__) returns a conflict error.

## Invariants
- HTTP 409 for reserved names
- No state mutation

## Edge cases
- __export_temp__ is not user-creatable but is also excluded from list

---

# Scenario: Snapshot persistence errors

**ID**: SNAP-006
**Area**: snapshots
**Tests**:
- `internal/api/stores_test.go` → "TestSaveSnapshotHandler_PersistenceError"
- `internal/api/stores_test.go` → "TestDeleteSnapshotHandler_PersistenceError"
- `internal/api/stores_test.go` → "TestUpload_SnapshotDeleteError_ReturnsPersistenceWarning"

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
- `internal/api/snapshots_test.go` → "TestSnapshot_Delete"
- `internal/api/handlers_test.go` → "TestSnapshotHandlers_Delete"
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
- `internal/api/service_test.go` → "TestOrgService_ExportSnapshot"
- `internal/api/handlers_test.go` → "TestExportSnapshotHandler"

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
