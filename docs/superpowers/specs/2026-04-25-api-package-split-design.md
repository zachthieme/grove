# Split `internal/api/` into 7 packages — Design

**Status**: design approved, awaiting implementation plan
**Date**: 2026-04-25
**Author**: collaborative brainstorm

## Goal

Decompose the `internal/api/` god-package (30 files, ~16k LOC) into 7 focused packages with strict downward dependencies and no cycles. Tests move with their package. No backward-compatibility shim — external callers (`cmd/serve.go`, `integration_test.go`) update directly each PR.

## Why

Today `internal/api` mixes domain (`OrgService`), persistence (`SnapshotStore`, `AutosaveStore`), HTTP transport (handlers, middleware, CSRF), logging infrastructure (`LogBuffer`), and shared DTOs in one package. The boundaries exist conceptually (already broken out into multiple files) but aren't compile-time enforced. Roles can drift; cross-cutting changes touch unrelated tests; the largest test file is 1941 lines because everything that touches `OrgService` lives here.

The split makes the existing conceptual boundaries enforceable by the Go compiler, lets each domain evolve in isolation, and gives test files a more focused scope.

## Package Layout

```
internal/
├── apitypes/      # leaf — domain primitives (OrgNode, Pod, Settings, ...)
├── logbuf/        # leaf — log buffer + slog handler infrastructure
├── autosave/      # depends: apitypes
├── pod/           # depends: apitypes
├── snapshot/      # depends: apitypes
├── org/           # depends: apitypes, snapshot, pod
└── httpapi/       # depends: all of the above
```

**Strict downward dependency.** No cycles. Enforced by `go vet`.

`internal/api/` is **deleted** at the end of PR7 — no shim, no re-exports.

## Per-Package Contents

### `internal/apitypes` (leaf)
Pure data, no methods.
- Types: `OrgNode`, `OrgNodeUpdate`, `Pod`, `PodInfo`, `PodUpdate`, `Settings`, `MappedColumn`, `PendingUpload`.
- Source: carved from current `internal/api/model.go`.

### `internal/logbuf` (leaf)
HTTP-agnostic logging infrastructure.
- Types: `LogBuffer`, `LogEntry`, `LogFilter`, `BufferHandler`, `SlogWriter`.
- Constructors: `New` (LogBuffer), `NewBufferHandler`, `NewMultiHandler`, `SetLogger`.
- Source: `logging.go`, `logger.go`, `slog_handler.go` moved verbatim.

### `internal/autosave`
Persistence for the autosave document. HTTP handlers (`autosave_handlers.go`) live in `httpapi`, not here.
- Types: `AutosaveData`, `AutosaveStore` interface, `FileAutosaveStore`, `MemoryAutosaveStore`.
- Constructors: `NewMemoryStore`, `NewFileStore`.
- Source: `autosave.go` + the autosave half of `stores.go`.

### `internal/pod`
State machinery and pure helpers. No HTTP-facing methods (those stay on `*org.OrgService`).
- Types: `PodManager`.
- Pure functions: `SeedPods`, `CleanupEmptyPods`, `RenamePod`, `ReassignPersonPod`, `CopyPods`.
- The current `unsafe*` methods on `PodManager` are replaced with public methods that take read-only state arguments (e.g. `ListPods(working []apitypes.OrgNode) []PodInfo`). The `unsafe` prefix was a mutex-precondition contract within one package; across package boundaries, taking explicit state arguments enforces the precondition statically.
- Source: `pod_manager.go`, `pods.go`.

### `internal/snapshot`
Snapshot service, persistence, and the bridge interfaces back into org.
- Types: `SnapshotService`, `Info` (was `SnapshotInfo`), `SnapshotStore` interface, `FileSnapshotStore`, `MemorySnapshotStore`, `OrgState` (the bridge type), `OrgStateProvider` interface, `SnapshotClearer` interface.
- Constants: `SnapshotWorking`, `SnapshotOriginal`, `SnapshotExportTemp`.
- Constructors: `New`, `NewMemoryStore`, `NewFileStore`.
- Source: `snapshot_service.go`, `snapshot_store.go` + snapshot half of `stores.go`. `snapshots_delegate.go` is dissolved — its 5 delegating methods on `*OrgService` move into `org/service.go`.
- `OrgStateProvider` (currently lowercase `orgStateProvider`) is exported because `*org.OrgService` (in a different package) implements it.

### `internal/org`
The domain service.
- Types: `OrgService`, `MoveResult`, `MutationResult`, `ValidationError`, `NotFoundError`, `ConflictError`, `UploadResponse`.
- Constructor: `New(snapshot.SnapshotStore) *OrgService`.
- Source: `service.go`, `service_import.go`, `service_people.go`, `service_pods.go`, `service_settings.go`, `validate.go`, `convert.go`, `export.go`, `infer.go`, `zipimport.go`, `errors.go`, `constants.go`. Plus the snapshot delegation methods folded back from `snapshots_delegate.go`.
- Imports `apitypes`, `snapshot`, `pod`. Never imports `httpapi` or `autosave` (autosave is HTTP-layer only).
- `*OrgService` implements `snapshot.OrgStateProvider`, `snapshot.SnapshotClearer`, and (via composition) all six role interfaces in `httpapi`.

### `internal/httpapi`
HTTP transport and orchestration.
- Types: `Services` struct (composition of role interfaces), role interfaces (`NodeService`, `OrgStateService`, `SnapshotOps`, `PodService`, `ImportService`, `SettingsService` — 6 today, kept as-is), `LoggingMiddleware`, response wrappers (`OrgData`, `WorkingResponse`, `AddResponse`, `MutationResponse`, `RecycledResponse`, `HealthResponse`, `ConfigResponse`).
- Constructor: `NewRouter(Services, *logbuf.LogBuffer, autosave.AutosaveStore) http.Handler`, `NewServices(*org.OrgService) Services`.
- Source: `handlers.go`, `autosave_handlers.go`, `interfaces.go` (renamed `services.go`), HTTP response types carved from `model.go`. `LoggingMiddleware` lives here (uses `logbuf`).

## Inter-Package Interfaces

Three interfaces cross package boundaries:

```go
// internal/snapshot — implemented by *org.OrgService
type OrgStateProvider interface {
    CaptureState() OrgState
    ApplyState(OrgState) error
}

// internal/snapshot — implemented by *org.OrgService
type SnapshotClearer interface {
    ClearSnapshots()
}
```

`OrgState` lives in `snapshot` (the package that owns the contract). `org` imports `snapshot.OrgState` for the bridge methods.

```go
// internal/httpapi
type Services struct {
    Org      OrgStateService
    People   NodeService
    Snaps    SnapshotOps
    Pods     PodService
    Import   ImportService
    Settings SettingsService
}
```

`*org.OrgService` satisfies all six role interfaces; `httpapi.NewServices(*org.OrgService) Services` wires them up. `cmd/serve.go` calls `httpapi.NewServices(svc)` once.

## Migration: 7 PRs (PR6 split into 3 commits)

Each PR: move files, fix imports, run `make ci`, update `cmd/serve.go` + `integration_test.go`, commit. No PR merges with broken tests. Each is independently revertable.

| PR | Package | Estimated effort |
|---|---|---|
| 1 | `apitypes` | ~1h |
| 2 | `logbuf` | ~30m |
| 3 | `autosave` | ~1h |
| 4 | `pod` (with `unsafe*` → public-with-state-args refactor) | ~1h |
| 5 | `snapshot` (defines `OrgState`, `OrgStateProvider`, `SnapshotClearer`) | ~1.5h |
| 6 | `org` — split into 3 commits: 6a helpers, 6b import/validate, 6c OrgService | ~3h |
| 7 | `httpapi` (handlers, middleware, response types); delete `internal/api/` | ~1.5h |

Total ~10h focused work across 9 commits.

### PR1 — apitypes
Carve types from `internal/api/model.go` into `internal/apitypes/types.go`. Update all `internal/api/*.go` to import `apitypes`. Update `cmd/serve.go` and `integration_test.go`.

### PR2 — logbuf
Move `logging.go`, `logger.go`, `slog_handler.go`. Rename `package api` → `package logbuf`. Update `cmd/serve.go` (`api.NewLogBuffer` → `logbuf.New`, etc.). `LoggingMiddleware` stays in `internal/api/` (deferred to PR7).

### PR3 — autosave
Move `autosave.go` + autosave half of `stores.go`. `autosave_handlers.go` stays in `internal/api/` for now.

### PR4 — pod
Move `pod_manager.go`, `pods.go`. Refactor `PodManager.unsafe*` methods to public methods that accept `[]apitypes.OrgNode` arguments. Update callers in `internal/api/service_pods.go`. Race tests must pass.

### PR5 — snapshot
Move `snapshot_service.go`, `snapshot_store.go`, snapshot half of `stores.go`. Define `OrgState`, `OrgStateProvider`, `SnapshotClearer` here. Dissolve `snapshots_delegate.go` — fold its 5 methods into `internal/api/service.go` as direct delegations to `s.snap.*`.

### PR6 — org (3 commits)
- **6a**: pure helpers — `errors.go`, `constants.go`, `convert.go`, `export.go`, `infer.go`. Create `internal/org/`.
- **6b**: import/validate flow — `validate.go`, `zipimport.go`, `service_import.go`.
- **6c**: `OrgService` itself — `service.go`, `service_people.go`, `service_pods.go`, `service_settings.go`. Moves the bulk of tests. Race tests with `-race`.

### PR7 — httpapi
Move `handlers.go`, `autosave_handlers.go`, `interfaces.go` (rename `services.go`), `LoggingMiddleware`. Carve HTTP response wrappers from remaining `model.go`. Delete empty `internal/api/`.

## Test Strategy

Tests move with their package — forced by access to unexported fields (`svc.mu`, `svc.findWorking`, `svc.working`).

| PR | Tests moving |
|---|---|
| 1 | none — types have no tests |
| 2 | `logging_test.go`, `slog_handler_test.go` |
| 3 | `autosave_test.go`, autosave half of `stores_test.go` |
| 4 | `service_pods_test.go`, `service_products_test.go`, `pods_test.go`, pod-related fuzz tests |
| 5 | `snapshot_recovery_test.go`, `snapshot_service_test.go`, `snapshot_store_test.go`, `snapshots_test.go`, snapshot half of `stores_test.go` |
| 6 | `adversarial_test.go`, `concurrent_test.go`, `contract_test.go`, `convert_test.go`, `export_test.go`, `infer_test.go`, `service_test.go`, `service_import_test.go`, `service_settings_test.go`, `bench_test.go`, `bench_index_test.go`, `stress_test.go`, `zipimport_test.go`, remaining `fuzz_test.go` |
| 7 | `handlers_test.go` |

**Scenario IDs survive moves** — `make check-scenarios` greps by ID across all `*_test.go`, no path coupling. The check runs each PR.

**Race tests** (`-race`): `concurrent_test.go`, `stress_test.go` move with `org` (PR6c).

**Fuzz tests** consolidate into `internal/org/fuzz_test.go` after PR6.

**`integration_test.go`** at repo root stays — uses only public API. Updated each PR for renamed exports.

## Naming

- `apitypes` (vs `types`/`model`): chosen to disambiguate from `internal/model/` (the parser-domain Person/Org types).
- `logbuf` (vs `logging`/`loggerbuf`): short, accurate, no collision with stdlib `log`.
- `httpapi` (vs `server`/`http`/`apihttp`): clearly says "HTTP API layer"; `cmd/serve.go` is the binary, this is the library.
- `org`, `pod`, `snapshot`, `autosave`: domain names.

Constructor renames at use-sites:
- `api.NewOrgService` → `org.New`
- `api.NewMemorySnapshotStore` → `snapshot.NewMemoryStore`
- `api.NewMemoryAutosaveStore` → `autosave.NewMemoryStore`
- `api.NewLogBuffer` → `logbuf.New`
- `api.NewRouter` → `httpapi.NewRouter`
- `api.NewServices` → `httpapi.NewServices`

Type renames where stutter would result:
- `api.SnapshotInfo` → `snapshot.Info`

`apitypes.OrgNode`, `apitypes.Pod` etc. — kept as-is (no stutter, "Org" ≠ "apitypes").

## Risks + Mitigations

1. **Circular imports** (most likely org ↔ snapshot). Mitigation: `snapshot` owns `OrgState` + provider/clearer interfaces. `org` imports `snapshot`, never reverse. Compiler enforces.
2. **`unsafe*` pod refactor** (PR4) may surface latent bugs. Mitigation: behavior-preserving signature change only; race tests gate the PR.
3. **PR6c size**. Mitigation: pure file moves first (no logic change), separate commit if any signature touch needed. Bisectable via the 3-commit split.
4. **Tests accessing now-cross-package internals**. Mitigation: per-PR `go test ./...` check; export only what's strictly necessary, document each export.
5. **External breakage** in `cmd/serve.go` and `integration_test.go`. Mitigation: each PR's CI runs the integration test suite.
6. **Scenario coverage drift**. Mitigation: `make check-scenarios` is grep-based; runs each PR.
7. **Benchmark regression** from cross-package call boundaries. Mitigation: `make bench` pre/post PR6, fail if any benchmark > 5% slower.

## Out of Scope

- Renaming methods (e.g. `OrgService.Move` → `MovePerson`) — keep names.
- Adding new tests — only move existing.
- Changing public API shape (CSRF, endpoints, response schemas).
- Touching `internal/model/` or `internal/parser/` — already separate, untouched.

## Definition of Done

- All 7 packages exist; `internal/api/` deleted.
- `make ci` green on the final commit (typecheck, lint, test-all, e2e, bench, fuzz, check-scenarios).
- `make bench` shows no regression > 5% on existing benchmarks.
- Race tests (`-race`) pass on `concurrent_test.go` and `stress_test.go` after their move.
- `cmd/serve.go` + `integration_test.go` build and pass against new packages.
- `CLAUDE.md` "Architecture → Go Backend" section rewritten.
