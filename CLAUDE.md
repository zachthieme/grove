# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Version Control

This project uses **jj** (Jujutsu) for version control, colocated with git. Use `jj` commands instead of `git` for all VCS operations (commit, branch, push, etc.).

## What This Is

**Grove** is an interactive web-based org chart tool. It runs as a single Go binary with an embedded React frontend (`grove serve`). Users upload CSV/XLSX files, then view, edit, and restructure org charts through drag-and-drop, with features like named snapshots, autosave, recycle bin, and multiple view modes.

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
```

### Running

```bash
./grove serve                   # Start on port 8080
./grove serve -p 3000           # Custom port
./grove serve --dev             # Dev mode (frontend served by Vite, not embedded)
```

### Testing

Follow TDD: write a failing test first, then implement the feature.

Go tests are colocated with their packages (`*_test.go`). Integration tests live in `integration_test.go` at the repo root. Frontend has no test framework yet — verify with `npm run build` (TypeScript compiler catches type errors).

## Architecture

Single Go binary serving a React SPA via `go:embed`.

### Go Backend (`internal/`)

- `internal/api/model.go` — API types: `Person` (with UUID `Id`, `ManagerId`), `OrgData`, `UploadResponse`, `SnapshotInfo`, `AutosaveData`, `MappedColumn`
- `internal/api/service.go` — `OrgService`: holds original/working/recycled state in memory. Methods: `Upload`, `ConfirmMapping`, `Move`, `Update`, `Add`, `Delete` (soft-delete to recycled), `Restore`, `EmptyBin`, `ResetToOriginal`
- `internal/api/snapshots.go` — Named snapshot save/load/delete/list on OrgService
- `internal/api/handlers.go` — HTTP handlers and router (`NewRouter`). REST API at `/api/*`
- `internal/api/autosave.go` — File persistence to `~/.grove/autosave.json`
- `internal/api/infer.go` — Column inference: `InferMapping` (exact/synonym/fuzzy matching), `AllRequiredHigh`
- `internal/api/convert.go` — Converts `model.Org` to API `[]Person` with UUIDs
- `internal/api/export.go` — Serializes `[]Person` back to CSV/XLSX bytes
- `internal/model/` — Core domain: `Person`, `Org`, `NewOrg` (validates fields, resolves managers, detects cycles). Duplicate names are allowed.
- `internal/parser/` — CSV/XLSX parsing via `BuildPeople` and `BuildPeopleWithMapping`. Backwards-compat: maps legacy "Hiring" → "Open", "Transfer" → "Transfer In".

### React Frontend (`web/`)

- `web/src/store/OrgContext.tsx` — Central state: original/working/recycled people, snapshots, autosave recovery, view mode, data view toggle
- `web/src/views/ColumnView.tsx` — Detail view: recursive tree with managers horizontal, ICs stacked vertical
- `web/src/views/ManagerView.tsx` — Manager-only view: managers as nodes, ICs as summary cards
- `web/src/views/shared.tsx` — Shared `DraggableNode`, `OrgNode`, `buildOrgTree`
- `web/src/components/PersonNode.tsx` — Person card with status styling, hover actions (+/edit/delete/info)
- `web/src/components/DetailSidebar.tsx` — Edit form with manager dropdown, status info popover
- `web/src/components/ColumnMappingModal.tsx` — Column mapping UI for non-standard CSV headers
- `web/src/hooks/` — `useOrgDiff`, `useIsManager`, `useOrgMetrics`, `useDragDrop`, `useAutosave`, `useExport`

### Build

- `embed.go` — `//go:embed web/dist` for the frontend assets
- `cmd/root.go` — Cobra root command
- `cmd/serve.go` — HTTP server, serves embedded SPA + API
- `Makefile` — `frontend`, `build`, `dev`, `clean` targets

### Key Concepts

- **Status types**: Active, Open, Pending Open, Transfer In, Transfer Out, Backfill, Planned — each gets different visual styling
- **Manager detection**: A person is a manager if they have direct reports OR their role matches VP/Director/Manager/Lead/Head/Chief/Principal
- **Snapshots**: Named save points for the working state. "Original" resets to the initial import.
- **Autosave**: Debounced to localStorage + `~/.grove/autosave.json` after every mutation
- **Diff mode**: Compares working vs original by stable UUID, annotates nodes with change type
- **Column inference**: Three-tier matching (exact → synonym → fuzzy) on upload headers
