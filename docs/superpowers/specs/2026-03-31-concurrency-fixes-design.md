# Concurrency Fixes Design — #107 and #108

Fixes two silent-data-loss concurrency bugs in the Go backend.

## #107 — Upload/ConfirmMapping race

### Problem

`ConfirmMapping` uses a three-phase unlock/relock pattern. Between Phase 1 (grab + clear `s.pending`) and Phase 3 (commit via `resetState`), a concurrent `Upload` can set new `s.pending`. Phase 3 then calls `resetState`, wiping the new pending data. The user's second upload vanishes with no error.

### Fix

Add `pendingEpoch uint64` to `OrgService`. `Upload()` increments it when setting `s.pending`. `ConfirmMapping()` captures the epoch in Phase 1. Phase 3 (in both `confirmMappingCSV` and `confirmMappingZip`) checks `s.pendingEpoch == epoch` before committing. If mismatched, return a conflict error: `"upload superseded by a newer upload"`.

No API or frontend changes. The conflict error maps to HTTP 409 via the existing `serviceError()` path.

### Files

- `internal/api/service.go` — add `pendingEpoch uint64` field
- `internal/api/service_import.go` — increment epoch in `Upload`, check epoch in `confirmMappingCSV` and `confirmMappingZip` before calling `resetState` (under same lock acquisition)

### Tests

- Upload A, Upload B, ConfirmMapping(A's mapping) returns conflict error
- Upload, ConfirmMapping succeeds normally (regression guard)

## #108 — Snapshot persistence race

### Problem

`SaveSnapshot` and `DeleteSnapshot` call `CopyAll()` under the lock, then `PersistCopy()` outside it. Two concurrent saves can each copy, then persist in either order — the last write wins, potentially losing the other's snapshot on disk.

### Fix

Persist under the lock. Add `PersistAll()` to `SnapshotManager` that calls `sm.store.Write(sm.snapshots)` directly. Replace the CopyAll + PersistCopy pattern in `SaveSnapshot`, `DeleteSnapshot`, and `confirmMappingZip`.

Remove `CopyAll` and `PersistCopy` from `SnapshotManager` — no longer needed.

Remove `safeMemorySnapshotStore` from `concurrent_test.go` — all store access now happens under `s.mu`, so the wrapper mutex is unnecessary.

### Files

- `internal/api/snapshot_manager.go` — add `PersistAll()`, remove `CopyAll()` and `PersistCopy()`
- `internal/api/snapshots.go` — `SaveSnapshot` and `DeleteSnapshot` use `defer s.mu.Unlock()` and call `s.snaps.PersistAll()` under lock
- `internal/api/service_import.go` — `confirmMappingZip` calls `s.snaps.PersistAll()` inside the existing lock acquisition (same block as `resetState`) instead of CopyAll + PersistCopy outside it
- `internal/api/concurrent_test.go` — remove `safeMemorySnapshotStore`, use `NewMemorySnapshotStore()` directly

### Tests

- Two concurrent `SaveSnapshot` calls, assert both present in `ListSnapshots` and in the store
- Existing `TestConcurrentSnapshotOperations` becomes a regression test
