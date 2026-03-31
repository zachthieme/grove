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
go test ./internal/api/ -v      # Run API package tests
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

### Go Backend (`internal/`)

- `internal/api/model.go` — API types: `Person` (with UUID `Id`, `ManagerId`), `OrgData`, `UploadResponse` (with optional `Snapshots`), `SnapshotInfo`, `AutosaveData`, `MappedColumn`, `PendingUpload`
- `internal/api/service.go` — `OrgService` struct definition, constructor, state queries (`GetOrg`, `GetWorking`, `GetRecycled`, `ResetToOriginal`, `RestoreState`), and shared helpers. Delegates snapshots to `SnapshotManager`.
- `internal/api/validate.go` — All validation: `validateFieldLengths`, `validateNoteLen`, `validateManagerChange`, `wouldCreateCycle`, `findInSlice`, `isFrontlineManager`. Also defines typed errors (`ValidationError`, `NotFoundError`, `ConflictError`) for proper HTTP status mapping.
- `internal/api/snapshot_manager.go` — `SnapshotManager` struct: owns snapshot map + `SnapshotStore`. NOT thread-safe — called under `OrgService.mu`. Constants: `SnapshotWorking`, `SnapshotOriginal`, `SnapshotExportTemp`.
- `internal/api/service_import.go` — Upload/import methods: `Upload`, `ConfirmMapping`
- `internal/api/service_people.go` — People mutation methods: `Move`, `Update`, `Add`, `Delete`, `Restore`, `EmptyBin`, `Reorder`
- `internal/api/service_pods.go` — Pod methods: `ListPods`, `UpdatePod`, `CreatePod`
- `internal/api/service_settings.go` — Settings methods: `GetSettings`, `UpdateSettings`
- `internal/api/snapshots.go` — Thin wrappers on OrgService that coordinate locking and delegate to `SnapshotManager`.
- `internal/api/snapshot_store.go` — File persistence for snapshots to `~/.grove/snapshots.json`
- `internal/api/zipimport.go` — ZIP upload: `parseZipFileList`, `parseZipEntries`, `UploadZip`. Numeric prefix convention (0=original, 1=working, 2+=snapshots).
- `internal/api/handlers.go` — HTTP handlers and router (`NewRouter`). REST API at `/api/*`. Uses `serviceError()` to map typed errors to HTTP status codes (404, 409, 422). Generic `jsonHandler[Req, Resp]` eliminates boilerplate for decode→call→respond handlers.
- `internal/api/autosave.go` — File persistence to `~/.grove/autosave.json`
- `internal/api/infer.go` — Column inference: `InferMapping` (exact/synonym/fuzzy matching), `AllRequiredHigh` (only `name` is required)
- `internal/api/convert.go` — Converts `model.Org` to API `[]Person` with UUIDs
- `internal/api/export.go` — Serializes `[]Person` back to CSV/XLSX bytes
- `internal/model/` — Core domain: `Person`, `Org`, `NewOrg` (validates fields, resolves managers, detects cycles). Duplicate names are allowed.
- `internal/parser/` — CSV/XLSX parsing via `BuildPeople` and `BuildPeopleWithMapping`.

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
- **Snapshots**: Named save points for the working state, persisted to `~/.grove/snapshots.json`. "Original" resets to the initial import.
- **Autosave**: Debounced to localStorage + `~/.grove/autosave.json` after every mutation
- **Diff mode**: Compares working vs original by stable UUID, annotates nodes with change type
- **Column inference**: Three-tier matching (exact → synonym → fuzzy) on upload headers. Only `name` is required; other fields optional.
- **ZIP import/export**: Numeric prefix convention (0-original, 1-working, 2+-snapshots) for round-trip fidelity
