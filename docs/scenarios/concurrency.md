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
