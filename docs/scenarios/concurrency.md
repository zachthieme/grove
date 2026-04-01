# Concurrency Scenarios

---

# Scenario: Concurrent mutations don't corrupt state

**ID**: CONC-001
**Area**: concurrency
**Tests**:
- `internal/api/concurrent_test.go` → "TestConcurrentMoves"
- `internal/api/concurrent_test.go` → "TestConcurrentUpdates"
- `internal/api/concurrent_test.go` → "TestConcurrentReadsAndWrites"
- `internal/api/concurrent_test.go` → "TestConcurrentDeleteRestore"
- `internal/api/concurrent_test.go` → "TestConcurrentSnapshotOperations"
- `internal/api/concurrent_test.go` → "TestConcurrentMixedOperations"

## Behavior
Multiple goroutines perform mutations simultaneously. The RWMutex on OrgService ensures no data races.

## Invariants
- No data races (verified with -race flag)
- All operations complete without panic
- State remains consistent after all operations

## Edge cases
- Mixed read/write operations
- Snapshot save during mutations

---

# Scenario: Large org performance

**ID**: CONC-002
**Area**: concurrency
**Tests**:
- `internal/api/stress_test.go` → "TestLargeOrg_Upload"
- `internal/api/stress_test.go` → "TestLargeOrg_MoveChain"
- `internal/api/stress_test.go` → "TestLargeOrg_BulkUpdate"
- `internal/api/stress_test.go` → "TestLargeOrg_ReorderAll"
- `internal/api/stress_test.go` → "TestLargeOrg_DeleteAndRestore"
- `internal/api/stress_test.go` → "TestLargeOrg_SnapshotRoundTrip"
- `internal/api/stress_test.go` → "TestLargeOrg_ExportCSV"
- `internal/api/stress_test.go` → "TestLargeOrg_500People"
- `internal/api/adversarial_test.go` → "TestAdversarial_MassivePeopleCount"

## Behavior
Operations on large orgs (200-500 people) complete correctly. Performance is tracked via benchmarks (not test assertions) to avoid CI flakiness.

## Invariants
- Upload, move, update, reorder, delete/restore, export, snapshot all produce correct results on 200+ person orgs
- State remains consistent after bulk operations
- Performance tracked via `make bench` and `benchstat` regression detection

## Edge cases
- 500-person org with all operations

---

# Scenario: Large org frontend rendering

**ID**: CONC-003
**Area**: concurrency
**Tests**:
- `web/e2e/performance.spec.ts` → "renders detail view with 200 people"
- `web/e2e/performance.spec.ts` → "switches views without hanging"
- `web/e2e/performance.spec.ts` → "exports CSV with all 200 people"

## Behavior
The frontend renders a 200-person org chart without errors or hangs. All three view modes (Detail, Manager, Table) display correctly. CSV export produces a file containing all people.

## Invariants
- Detail view renders person nodes after upload
- Switching between Detail, Manager, and Table views completes within 10 seconds each
- Table view renders all 200 rows
- CSV export produces a downloadable file

## Edge cases
- None

---

# Scenario: Upload/ConfirmMapping race returns conflict

**ID**: CONC-004
**Area**: concurrency
**Tests**:
- `internal/api/service_test.go` → "TestConfirmMapping_RejectsStaleEpoch"
- `internal/api/service_test.go` → "TestConfirmMapping_AcceptsCurrentEpoch"

## Behavior
When a user uploads File A (needs mapping), then uploads File B before confirming A, the ConfirmMapping for A's mapping returns a 409 conflict error. The user must re-confirm with B's mapping.

## Invariants
- ConfirmMapping with a stale epoch returns a conflict error
- ConfirmMapping with the current epoch succeeds normally
- No data is silently lost

## Edge cases
- None

---

# Scenario: Concurrent snapshot saves persist all snapshots

**ID**: CONC-005
**Area**: concurrency
**Tests**:
- `internal/api/concurrent_test.go` → "TestConcurrentSnapshotSaves_BothPersist"

## Behavior
Two concurrent SaveSnapshot calls both persist their data. Neither overwrites the other on disk.

## Invariants
- Both snapshots appear in ListSnapshots after concurrent saves
- Both snapshots are present in the persisted store
- Existing TestConcurrentSnapshotOperations still passes

## Edge cases
- None
