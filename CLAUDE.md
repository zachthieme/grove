# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Version Control

This project uses **jj** (Jujutsu) for version control, colocated with git. Use `jj` commands instead of `git` for all VCS operations (commit, branch, push, etc.).

## What This Is

**Grove** is an interactive web-based org chart tool. It runs as a single Go binary with an embedded React frontend (`grove`). Users upload CSV/XLSX/ZIP files, then view, edit, and restructure org charts through drag-and-drop, with features like named snapshots, autosave, recycle bin, and multiple view modes.

## Development

### Commands

```bash
make build                      # Build frontend + Go binary (produces ./grove)
make frontend                   # Build just the React frontend (web/dist/)
make dev                        # Run Vite dev server + Go server concurrently
make clean                      # Remove build artifacts
cd web && npm run build          # Frontend only (TypeScript check + Vite)
go test ./...                   # Run all Go tests
go test ./internal/httpapi/ -v  # Run HTTP layer tests
go test ./internal/org/ -v      # Run OrgService domain tests
cd web && npm test               # Run frontend tests (vitest)
```

### Running

```bash
./grove                         # Start on port 8080
./grove -p 3000                 # Custom port
./grove --dev                   # Dev mode (frontend served by Vite, not embedded)
```

### Testing

Follow TDD: write a failing test first, then implement the feature.

Go tests are colocated with their packages (`*_test.go`). Integration tests live in `integration_test.go` at the repo root. Frontend uses vitest with jsdom — tests in `*.test.ts` / `*.test.tsx` files colocated with source.

## Scenario Contract

Scenarios in `docs/scenarios/` are the source of truth for expected product behavior. They are not optional documentation — they are a contract.

### Rules
1. Before implementing any feature or refactor, read all scenario files in areas touched by the change.
2. Do not silently change behavior described in an existing scenario. If a scenario must change, update it explicitly and explain why.
3. When adding a new feature, write the scenario entry first, then implement.
4. All e2e test names and significant Go test names must be prefixed with their scenario ID: `[AREA-NNN] test name`.
5. Run `make check-scenarios` before considering any feature complete. A scenario without a corresponding test ID reference is a build failure.

### Adding a scenario
Copy the schema from an existing docs/scenarios/*.md file. Assign the next available ID in the area. Add the Tests field once the test exists.

## Architecture

Single Go binary serving a React SPA via `go:embed`.

### Go Backend

The backend is split into 7 focused packages with strict downward dependencies (no cycles):

- `internal/apitypes/types.go` — leaf package: shared DTO primitives (`OrgNode`, `Pod`, `Settings`, `OrgNodeUpdate`, `PodUpdate`, `PodInfo`, `MappedColumn`, `PendingUpload`).
- `internal/logbuf/` — leaf package: log buffer + slog handler infrastructure (`LogBuffer`, `LogEntry`, `LogFilter`, `BufferHandler`, `MultiHandler`, `SlogWriter`, package logger via `Logger`/`SetLogger`).
- `internal/autosave/` — depends on apitypes: `AutosaveData`, `AutosaveStore` interface plus `MemoryStore` and `FileStore` (persisting to `~/.grove/autosave.json`).
- `internal/pod/` — depends on apitypes: `pod.Manager` (NOT thread-safe; caller-owned locking) plus pure helpers (`SeedPods`, `CleanupEmpty`, `Rename`, `Reassign`, `Copy`).
- `internal/snapshot/` — depends on apitypes: pure key-value store. `snapshot.Service` owns the snapshot map + `snapshot.Store` under its own `sync.RWMutex`. Holds NO callback into org — `Save` takes `OrgState` and `expectedEpoch` by value; `Load` returns `OrgState` by value. Caller orchestrates the epoch protocol (`epoch := snap.Epoch(); state := org.CaptureState(); snap.Save(ctx, name, state, epoch)`). `epoch uint64` race guard: `Clear`/`ReplaceAll` bump it; `Save` aborts with `*snapshot.ConflictError` if epoch advanced past `expectedEpoch`. Defines `snapshot.Clearer` (used by OrgService to invalidate snapshots on Reset/Create/Upload), `snapshot.OrgState` (bridge value type), `snapshot.Data`, `snapshot.Info`, reserved-name constants `snapshot.Working`, `snapshot.Original`, `snapshot.ExportTemp`. `MemoryStore` + `FileStore` (persisting to `~/.grove/snapshots.json`). Cross-mutex deadlock with org is structurally impossible — Service goroutines never need `mu_org`.
- `internal/org/` — depends on apitypes, snapshot, pod: the `OrgService` domain. Constructor `org.New(snapshot.Store)`. Files include service.go (state queries, `CaptureState`/`ApplyState`, snapshot orchestration via `SaveSnapshot`/`LoadSnapshot`/`ExportSnapshot` — the only place reserved-name routing for Working/Original lives), people.go (`Move`, `Update`, `Add`, `AddParent`, `Delete`, `Restore`, `EmptyBin`, `Reorder`), pods.go (`ListPods`, `UpdatePod`, `CreatePod`, `GetPodExportData`), settings.go (`GetSettings`, `UpdateSettings`), import.go (`Upload`, `ConfirmMapping`, `UploadZip`), validate.go (typed errors `ValidationError`, `NotFoundError`, `ConflictError` plus the `ServiceError` HTTP mapper), convert.go, export.go, infer.go, zipimport.go. OrgService never calls `s.snap.*` while holding `s.mu` — the only remaining lock-order discipline (auditable via grep, since the snapshot side cannot violate).
- `internal/httpapi/` — depends on all above: HTTP transport layer. router.go (`NewRouter`), handlers.go (all `handle*` functions, `jsonHandlerCtx` generic, `readUploadedFile`, `writeJSON`/`writeError`, `exportByFormat`, `limitBody`, `sanitizeFilename`), csrf.go (`csrfProtect`, `sameOriginOrAbsent`), middleware.go (`LoggingMiddleware` + `responseCapture` + log endpoints), services.go (`Services` struct + 6 role interfaces `NodeService`/`OrgStateService`/`SnapshotOps`/`ImportService`/`PodService`/`SettingsService` + `NewServices` ctor + compile-time assertions), responses.go (`WorkingResponse`, `AddResponse`, `MutationResponse`, `RecycledResponse`, `HealthResponse`, `ConfigResponse`), autosave_handlers.go.
- `internal/model/` — core domain (`Person`, `Org`, `NewOrg`) — unchanged.
- `internal/parser/` — CSV/XLSX parsing via `BuildPeople` and `BuildPeopleWithMapping` — unchanged.

### React Frontend (`web/`)

- `web/src/store/OrgContext.tsx` — Context aggregator: exports `useOrg()` (mega-context), plus granular hooks `useOrgData()`, `useUI()`, `useSelection()` for focused consumers
- `web/src/store/OrgDataContext.tsx` — Data state provider: org data, mutations, snapshots, autosave
- `web/src/store/UIContext.tsx` — UI state provider: view mode, data view, filters, head person
- `web/src/store/SelectionContext.tsx` — Selection state provider: selected IDs, pod selection
- `web/src/store/orgTypes.ts` — Type definitions: `OrgContextValue`, `OrgDataContextValue`, `UIContextValue`, `SelectionContextValue`
- `web/src/store/useDirtyTracking.ts` — beforeunload guard and dirty state tracking
- `web/src/views/ChartContext.tsx` — `ChartProvider` / `useChart()`: shared context for tree-view callbacks and state, consumed by recursive subtree components to avoid prop drilling
- `web/src/views/DragBadgeOverlay.tsx` — Shared drag overlay with multi-select badge, used by ColumnView and ManagerView
- `web/src/views/LassoSvgOverlay.tsx` — Shared SVG overlay for lasso selection rect and edge lines
- `web/src/views/ColumnView.tsx` — Detail view: recursive tree with managers horizontal, ICs stacked vertical
- `web/src/views/ManagerView.tsx` — Manager-only view: managers as nodes, ICs as summary cards
- `web/src/views/shared.tsx` — Shared `DraggableNode`, `OrgNode`, `buildOrgTree`
- `web/src/views/layoutTree.ts` — Unified layout computation: `computeLayoutTree` transforms OrgNode trees into LayoutNode trees (manager affinity reordering, cross-team IC placement, pod/team grouping, orphan grouping, collapse key construction)
- `web/src/components/PersonNode.tsx` — Person card with status styling, hover actions (+/edit/delete/info)
- `web/src/components/DetailSidebar.tsx` — Edit form with manager dropdown, status info popover
- `web/src/components/ColumnMappingModal.tsx` — Column mapping UI for non-standard CSV headers
- `web/src/hooks/` — `useOrgDiff`, `useIsManager`, `useOrgMetrics`, `useDragDrop`, `useAutosave`, `useExport`, `useSnapshotExport`
- `web/src/utils/snapshotExportUtils.ts` — Filename sanitization and deduplication for ZIP export
- `web/src/utils/ids.ts` — Drop-target ID construction/parsing: `buildTeamDropId`, `parseTeamDropId`, `buildPodDropId`, `parsePodDropId`

### Build

- `embed.go` — `//go:embed web/dist` for the frontend assets
- `cmd/root.go` — Cobra root command
- `cmd/serve.go` — HTTP server, serves embedded SPA + API
- `Makefile` — `frontend`, `build`, `dev`, `clean` targets

### Key Concepts

- **Status types**: Active, Open, Transfer In, Transfer Out, Backfill, Planned — each gets different visual styling
- **Manager detection**: A person is a manager if they have direct reports (role title matching removed)
- **Snapshots**: Named save points for the working state, persisted to `~/.grove/snapshots.json` by `internal/snapshot`. "Original" resets to the initial import.
- **Autosave**: Debounced to localStorage + `~/.grove/autosave.json` after every mutation
- **Diff mode**: Compares working vs original by stable UUID, annotates nodes with change type
- **Column inference**: Three-tier matching (exact → synonym → fuzzy) on upload headers. Only `name` is required; other fields optional.
- **ZIP import/export**: Numeric prefix convention (0-original, 1-working, 2+-snapshots) for round-trip fidelity
