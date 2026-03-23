# Changelog

## v0.7.0

### Features
- **ZIP snapshot export**: Export all snapshots as a single ZIP in any format (CSV, XLSX, PNG, SVG) with numeric-prefixed filenames for round-trip ordering
- **ZIP snapshot import**: Upload a ZIP of CSV/XLSX files to restore a full snapshot set. Prefix convention: 0=original, 1=working, 2+=snapshots
- **Snapshot persistence**: Snapshots now saved to `~/.grove/snapshots.json` and survive server restarts
- **Auto-open browser**: `grove serve` opens your default browser automatically (skipped in `--dev` mode)
- **Tight image cropping**: PNG/SVG exports crop to chart content with 32px padding, removing dead space
- **Per-snapshot data export**: New `GET /api/export/snapshot` endpoint for exporting individual snapshots as CSV/XLSX
- **Lenient import**: Only the Name column is required — all other fields are optional and default to empty

### Bug Fixes
- SVG connector lines recompute on container resize (fixes shifted lines when sidebar opens/closes)
- Browser opens only after TCP port is bound (net.Listen before Serve)
- Snapshot persistence writes happen outside the mutex (no longer blocks concurrent API requests)
- Reserved `__export_temp__` snapshot name prevents data loss during image export
- `limitBody` (1MB) wired to all JSON mutation handlers (was only on autosave)
- Corrupt localStorage autosave no longer traps the app in a broken state
- Autosave suppression during snapshot export uses ref (synchronous) instead of state (async)
- Error messages don't leak user input (export format sanitized)

### Code Quality
- OrgContext.tsx split into orgTypes.ts + useDirtyTracking.ts (480 → 392 lines)
- 15 OrgContext integration tests covering upload, mutations, snapshots, and selection flows
- Snapshot store test globals properly cleaned up with defer
- CLAUDE.md updated to reflect current architecture

### Testing
- 240 total tests (152 Go + 88 frontend)
- Go test-to-production ratio: 1.66x
- Zero static analysis warnings (go vet + tsc)

---

## v0.6.0

### Bug Fixes
- Manager green bar now based solely on direct reports — role titles like "Lead" or "Manager" no longer trigger it without actual reports (fixes #1)
- Cross-team-connected teams (e.g. SEC and SEC-2) now render adjacent in the layout via affinity graph clustering (fixes #2)
- Root nodes no longer appear in "unparented" indicator; only truly orphaned people (those who lost their manager) are shown (fixes #3)
- Unparented indicator changed from full-width top bar to a small collapsible floating notice in the bottom-left corner

### Hardening
- Input field length validation (500 char max) on all API mutations
- Autosave handler body size limit (1MB)
- Graceful HTTP server shutdown on SIGINT with 5-second connection drain
- Read/write/idle timeouts on the HTTP server (30s/60s/120s)
- Health check endpoint (`GET /api/health`)
- Error messages no longer leak user input (export format error sanitized)

### Code Quality
- Extracted shared `validateManagerChange` helper — DRY'd cycle detection from Move and Update
- ColumnView/ManagerView no longer redraw SVG lines on selection changes (perf fix)
- DetailSidebar uses explicit template literal instead of JSON.stringify for dep tracking
- Toolbar export buttons use existing `exportDataUrl` helper instead of inline fetch
- `interface{}` → `any` in Go test files

### Testing
- Added field length validation tests (Update rejects/accepts, Add rejects)
- Added manager change validation tests (self-ref, cycle, nonexistent manager)
- Added health endpoint handler test
- Added export format sanitization test
- Added cross-team affinity layout test
- Updated isManager tests to reflect direct-reports-only behavior

---

## v0.5.0 — First Release

Grove is an interactive web-based org chart tool. Single Go binary, embedded React frontend.

### Views & Layout
- Detail view: managers horizontal, ICs stacked vertically, team-grouped columns
- Manager-only view: IC summary cards by discipline/status
- Cross-team people (with additional teams) render horizontally for dotted-line visibility
- Single-team ICs stack vertically under their manager
- Team header nodes with + button for adding to specific teams
- Dashed right-angle lines for cross-team relationships
- Drag overlay with green drop-target highlighting
- Subtree focus mode with breadcrumb navigation (Escape to exit)
- Scrollable canvas, consistent 160px node sizing, reflow button

### Editing
- Hover actions (+/edit/delete/info) on all nodes
- Detail sidebar with field editing, manager dropdown, status info popover
- Soft-delete with recycle bin drawer, restore, and empty bin
- Multi-select via Shift/Ctrl+click with batch edit form
- Multi-select drag-and-drop (all selected people reparent together)
- Employment type filter with show/hide toggles and hidden-count badge
- Employment type field with purple accent bar for non-FTE types

### Data Integrity
- Cycle detection prevents circular manager chains in Move and Update
- Status validation against 7 known types (Active, Open, Pending Open, Transfer In, Transfer Out, Backfill, Planned)
- All API returns are deep-copied — no mutation of internal state
- All frontend mutations surface errors to the UI
- Batch edit failures report count and allow retry

### Smart Upload
- Column inference with exact/synonym/fuzzy matching and confidence scores
- Fallback mapping UI with data preview when inference is uncertain
- Backwards-compatible parsing of legacy Hiring/Transfer values
- Graceful imports: broken rows get warning badges, not upload failures

### Snapshots & Persistence
- Named snapshots: save, load, delete, branch between org versions
- Autosave: debounced dual persistence (localStorage + ~/.grove/autosave.json)
- Restore previous session banner on reload
- Browser navigation guard for unsaved changes

### Export
- PNG and SVG via html-to-image with error handling and loading state
- CSV and XLSX download from working state

### Design
- Botanical design system: Fraunces + DM Sans fonts, warm earthy palette
- CSS modules throughout (no inline styles in production components)
- Grove tree icon, paper noise texture, green focus rings

### Error Handling
- React ErrorBoundary wraps the entire app with recovery UI
- JSON encoding errors logged server-side
- Export handler sets Content-Length, logs write failures
- Server autosave failure surfaced via warning banner

### Testing
- Go: 90%+ coverage — service, handlers, model, parser, infer, convert, export, snapshots, autosave
- Frontend: 69 vitest tests — hooks, components, tree building, layout, edge computation

### Architecture
- Single Go binary with `go:embed` for frontend assets
- Cobra CLI: `grove serve [-p port] [--dev]`
- Layered backend: model → service (mutex-protected) → HTTP handlers
- React 19, dnd-kit, Vite, TypeScript strict mode
- CI: GitHub Actions (test + lint), GoReleaser, Nix flake with auto-hash-update

---

## v0.0.1 — Prototype

Go CLI tool generating Mermaid flowchart diagrams from CSV/XLSX spreadsheets.

- People view and headcount view as Mermaid `flowchart TD`
- Cross-team edges, planned state flag
