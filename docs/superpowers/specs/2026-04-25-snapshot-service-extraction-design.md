# Snapshot Service Extraction — Design

**Date:** 2026-04-25
**Status:** Approved (design phase)
**Goal:** Extract snapshot state and logic from `OrgService` into a standalone `SnapshotService` with its own mutex, so that snapshot disk I/O no longer blocks org-state edits.

## Motivation

Today, `OrgService.mu` (a single `sync.RWMutex`) protects working/original/recycled people slices, the pod manager, settings, pending-upload state, *and* the snapshot manager. All snapshot operations — including `SaveSnapshot`, which performs a synchronous disk write to `~/.grove/snapshots.json` — execute under this lock. While a snapshot is being persisted, every other org operation (Move, Update, GetOrg) waits.

Three motivations, in priority order:

1. **Architectural cleanliness (B).** The single mutex protects unrelated concerns. Snapshots are loosely coupled to the rest of the org state — capture-then-persist, restore-then-replace. The lock surface obscures this.
2. **Future scaling (C).** If Grove ever moves to a multi-user server deployment, every user's edits serialize through the same lock. Removing the longest-held op (snapshot persist) from that bottleneck preserves headroom.
3. **Perf/contention (A).** Today's single-user desktop case rarely contends, but `SlowSnapshotStore`-style backends (network FS, slow disk, encryption layers) would magnify the disk-write window.

Pod state is **not** being split. PodManager's state (pods slice) is mutated on every `Move` and `Update` via `Reassign`/`Cleanup`, so a separate pod lock would force every edit path to acquire two locks. Net loss.

## Architecture

Two structs, two mutexes, **never held together**.

```
OrgService                   SnapshotService
─────────────                ──────────────
mu_org sync.RWMutex          mu_snap sync.RWMutex
working []OrgNode            snaps map[string]snapshotData
original []OrgNode           store SnapshotStore
recycled []OrgNode           epoch uint64
idIndex map[string]int       org orgStateProvider  ← injected
podMgr *PodManager
settings Settings
pending+epochs
snapClearer SnapshotClearer  ← injected
```

### Cross-service contract (two narrow interfaces)

```go
// orgStateProvider is implemented by *OrgService. SnapshotService uses it
// to capture/apply org state during Save/Load.
type orgStateProvider interface {
    CaptureState() OrgState                // RLock mu_org → deep-copy → RUnlock
    ApplyState(OrgState)                   // Lock mu_org → replace → Unlock
    GetWorking(context.Context) []OrgNode  // for ExportSnapshot working
    GetOriginal(context.Context) []OrgNode // for ExportSnapshot original
}

// SnapshotClearer is implemented by *SnapshotService. OrgService uses it
// to clear/replace snapshots on Reset/Create/Upload — the only paths where
// org-side mutations need to invalidate snapshot state.
type SnapshotClearer interface {
    Clear() error                                     // bumps epoch + wipes file
    ReplaceAll(map[string]snapshotData) error         // bumps epoch + persists
}
```

### Ownership

- All snapshot methods (`Save`, `Load`, `Delete`, `List`, `Export`) move from `*OrgService` onto `*SnapshotService`.
- `OrgService.snaps *SnapshotManager` field is removed; replaced with `snapClearer SnapshotClearer`.
- `Services` aggregator (`interfaces.go`) holds both, wires mutual refs at construction.
- `SnapshotManager` type is deleted; its responsibilities are absorbed into `SnapshotService`.

### Load-bearing rule

> No goroutine ever holds `mu_org` and `mu_snap` simultaneously.

Enforced by code review. The two bridge methods (`CaptureState`, `ApplyState`) fully release `mu_org` before returning. `Clear`/`ReplaceAll` only touch `mu_snap`. Composite operations always sequence: acquire one → release → acquire other.

## Data Flow

### Operations on SnapshotService alone

`Delete(name)`, `List()` — `mu_snap` only.

### Cross-boundary operations

```
SaveSnapshot(name):
  state ← org.CaptureState()         // RLock mu_org → deep-copy → RUnlock
  validate(name)
  Lock mu_snap
    if epoch != captured_epoch: return errConflict("snapshot superseded")
    snaps[name] = state.toSnapshotData()
    store.Write(snaps)
  Unlock mu_snap

LoadSnapshot(name):
  Lock mu_snap
    snap ← snaps[name]; deep-copy out
  Unlock mu_snap
  if not found: return errNotFound
  org.ApplyState(snap)                // Lock mu_org → replace → Unlock

ExportSnapshot(name):
  if name == SnapshotWorking:  return org.GetWorking(ctx)
  if name == SnapshotOriginal: return org.GetOriginal(ctx)
  RLock mu_snap
    return deepCopyNodes(snaps[name].People)
  RUnlock mu_snap
```

### Org operations that affect snapshots

```
Create(name) | ResetToOriginal() | Upload(csv):
  Lock mu_org; mutate org state; Unlock mu_org
  snapClearer.Clear()                 // bumps snap epoch + wipes file

Upload(zip with embedded snapshots) | confirmMappingZip:
  Lock mu_org; mutate org state; Unlock mu_org
  snapClearer.ReplaceAll(parsedSnaps) // bumps epoch + persists new map
```

### Race guard — epoch counter

`SnapshotService.epoch uint64`, bumped on every `Clear`/`ReplaceAll`. `Save` captures the expected epoch under `mu_snap.RLock`, then commits under `mu_snap.Lock` only if epoch is unchanged — otherwise returns `errConflict("snapshot superseded")`.

This is the same pattern `OrgService` already uses for `pendingEpoch`/`confirmedEpoch` on imports. Cost: one `uint64` field, one branch on commit. No false positives in single-threaded happy path.

`Load` does **not** need an epoch guard. Even if a snapshot is deleted between read and apply, the data was valid at read time, and applying it is the user-requested mutation.

### Captured state value type

```go
// OrgState is a frozen, deep-copied view of org state at a point in time.
// Used both as the bridge format between OrgService and SnapshotService,
// and as the in-memory snapshot payload.
type OrgState struct {
    People   []OrgNode  // deep-copied working slice
    Pods     []Pod      // deep-copied pods
    Settings Settings
}
```

The existing private `snapshotData` type adds a `Timestamp` and remains internal to `SnapshotService`. `OrgState` ↔ `snapshotData` conversion is trivial (timestamp is set on Save).

## Concurrency Contract

**Lock-ordering invariant.** No goroutine holds `mu_org` and `mu_snap` simultaneously. The bridge interface design makes any nested usage a code-review-visible violation.

**Deadlock surface = 0.** Two locks, no nesting → no cycles possible.

**Race scenarios:**

| # | Scenario | Outcome |
|---|---|---|
| 1 | `Save` + concurrent `Save` (different names) | Both commit. Map insert serialized by `mu_snap`. |
| 2 | `Save` + concurrent `Save` (same name) | Last writer wins. Existing overwrite semantics preserved. |
| 3 | `Save` + concurrent `Move`/`Update` | `Save` captures point-in-time state; mutation runs before or after capture. Snapshot consistent. |
| 4 | `Save` + concurrent `Reset`/`Create`/`Upload` | Epoch guard aborts `Save` with `errConflict`. |
| 5 | `Load` + concurrent `Move`/`Update` | Both serialize on `mu_org`. Whichever lands second wins. |
| 6 | `Load` + concurrent `Delete` | Load already copied data under `mu_snap.RLock`; subsequent delete doesn't affect in-flight load. |
| 7 | `List` during `Save` persist | List takes `mu_snap.RLock`; `Save` persist holds `mu_snap.Lock` — list waits. Acceptable: list is rare. |
| 8 | `GetOrg`/`GetWorking` during `Save` persist | **The win.** Reads on `mu_org` no longer block on snapshot disk I/O. |
| 9 | `Move`/`Update` during `Save` persist | **The win.** Edits don't wait for snapshot fsync. |

**Edge cases:**
- `RestoreState` (autosave restore) only mutates `mu_org` state today. Stays unchanged. No snap interaction.
- Settings persisted in snapshots travel through `OrgState`. No new path.

**Public-error contract change:** `SaveSnapshot` may now return `errConflict` (was previously infallible after name validation). One new error path. `handleSaveSnapshot` already routes `Conflict` → 409 via `serviceError`. Frontend `client.ts` `saveSnapshot` does not currently expect 409 — needs minor handling (toast/banner: "snapshot couldn't be saved, try again").

## Testing

### New tests (3, focused on what the split changes)

1. **`TestSnapshotPersist_DoesNotBlockEdits`** — uses a `BlockingSnapshotStore` whose `Write` signals on a `started` channel and then blocks on a `release` channel. Goroutine A calls `SaveSnapshot`. Test waits for `started`, then goroutine B calls `Move` and the test asserts `Move` returns successfully *before* the test signals `release`. Deterministic — no wall-clock timing. Pre-split: B would deadlock on `mu_org` held during A's persist (test would time out). Post-split: B succeeds because `mu_org` was released after `CaptureState`.
2. **`TestSnapshotSave_EpochGuard_Reset`** — A captures state (paused via test hook before commit), B calls `ResetToOriginal`, A resumes and attempts commit → expect `errConflict("snapshot superseded")`.
3. **`TestSnapshotSave_EpochGuard_UploadZip`** — same shape, with zip `ReplaceAll` instead of `Reset`. Same expected `errConflict`.

### Existing tests — semantic equivalence

All should pass unchanged:
- `snapshots_test.go` — overwrite, reserved names, persistence, recovery
- `concurrent_test.go::TestConcurrentSnapshotOperations`, `TestConcurrentMixedOperations`
- `handlers_test.go` — wire format + status codes unchanged
- Frontend `useSnapshotExport.test.ts`, related component tests

### Race detector

Full `go test -race ./...` must remain clean.

## Migration

Single commit, big-bang. Intermediate states would have duplicated snap state that could diverge.

1. Add `OrgState` value type. Add `CaptureState()` / `ApplyState(OrgState)` methods on `*OrgService`. Define `orgStateProvider` interface.
2. Rename `internal/api/snapshot_manager.go` → `internal/api/snapshot_service.go`. Convert `SnapshotManager` → `SnapshotService`: own `sync.RWMutex`, `epoch uint64`, injected `orgStateProvider`. Replace `unsafeX` methods with public methods that take their own lock.
3. Move `Save` / `Load` / `Delete` / `List` / `Export` method bodies from `internal/api/snapshots.go` (currently on `*OrgService`) onto `*SnapshotService`. Delete `snapshots.go`.
4. Add `Clear()` / `ReplaceAll(map[string]snapshotData) error` on `*SnapshotService` with epoch bump. Define `SnapshotClearer` interface.
5. Remove `OrgService.snaps *SnapshotManager` field. Add `snapClearer SnapshotClearer` field. Update callers in `service.go` (`Create`, `ResetToOriginal`, `resetState`), `service_import.go` (`Upload`, `confirmMappingCSV`, `confirmMappingZip`), `zipimport.go` (`UploadZip`).
6. `interfaces.go`: `SnapshotService` interface implementation moves from `*OrgService` to `*SnapshotService`. Update compile-time assertions. Update `Services` struct + `NewServices` constructor to instantiate both and wire mutual refs.
7. Update `snapshots_test.go` and `snapshot_recovery_test.go` for new constructor / type name.
8. Add new tests #1–3 (in `concurrent_test.go` or a new `snapshot_isolation_test.go`).
9. Frontend `web/src/api/client.ts` `saveSnapshot`: catch 409 and surface as toast.

### Blast radius

- **Modified:** `snapshot_manager.go` → `snapshot_service.go` (rewrite), `service.go` (+CaptureState/ApplyState, -snaps field), `service_import.go`, `zipimport.go`, `interfaces.go`, `snapshots_test.go`, `snapshot_recovery_test.go`. Frontend: `client.ts` (one error path).
- **Deleted:** `snapshots.go` (methods moved to snapshot_service.go).
- **Unmodified:** `service_people.go`, `service_pods.go`, `service_settings.go`, `pod_manager.go`, all handler bodies in `handlers.go`.
- **Net LOC:** ~+200 (new tests + state value type + dual struct).

## Out of Scope

Deliberately not addressed in this design:

- **PodManager lock split.** Tight coupling with working slice (every `Move`/`Update` reassigns/cleans pods) means a per-pod lock would force every edit to acquire two locks. Net loss for the hot path.
- **Copy-on-write reads** (atomic.Value pointer swap for `working`). Different paradigm; not needed if the perf goal is met by isolating snapshot I/O.
- **Actor-model rewrite.** Massive refactor, no proportionate benefit.
- **Autosave changes.** Autosave already runs off the mutex on disk write (handler-level, not service-level).

## Open questions

None at design time. All edge cases enumerated; lock-ordering rule eliminates deadlock; epoch guard handles the only race-class introduced by the split.
