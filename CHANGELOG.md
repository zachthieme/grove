# Changelog

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
