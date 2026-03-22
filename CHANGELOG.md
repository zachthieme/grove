# Changelog

## v2.1 — Full-Featured Org Planning

### Layout & Views
- Detail view: managers horizontal, ICs stacked, team-grouped columns
- Manager-only view: IC summary cards by discipline/status
- Team-aware IC positioning: cross-team people render next to teams they support
- Virtual team header nodes with + button for multi-team managers
- Dashed right-angle lines for cross-team (additional teams) relationships
- Drag overlay with green drop-target highlighting
- Scrollable canvas, consistent 160px node sizing
- Manager accent bar (green left border), reflow button

### Node CRUD & Data
- Hover actions (+/edit/delete/info) on all nodes
- Soft-delete with recycle bin drawer, restore, empty
- Multi-select via Shift/Ctrl+click with batch edit form
- Graceful imports: broken rows get warning badges, not upload failures
- Employment type field (FTE, PSP, CW, Evergreen, Intern, custom)
- Non-FTE types show purple right accent bar and inline abbreviation
- Other Teams field in sidebar for editing cross-team assignments
- Manager dropdown in sidebar, status info popover

### Smart Upload
- Column inference with exact/synonym/fuzzy matching and confidence scores
- Fallback mapping UI with data preview when inference is uncertain
- Duplicate names allowed, row ordering doesn't matter
- Upload errors surfaced via dismissable banner

### Snapshots & Persistence
- Named snapshots: save, load, branch between org versions
- Autosave: debounced dual persistence (localStorage + ~/.grove/autosave.json)
- Restore previous session banner on reload
- Browser navigation guard with deep field comparison

### Statuses
- 7 types: Active, Open, Pending Open, Transfer In, Transfer Out, Backfill, Planned
- Backwards-compatible parsing of legacy Hiring/Transfer values

### Design
- Botanical design system: Fraunces + DM Sans fonts, warm earthy palette
- Grove tree icon (favicon, toolbar, upload screen) and banner SVG
- Paper noise texture, green focus rings, backdrop blur on modals
- Pike-style identity on upload screen
- Save feedback (Saving.../Saved!) on sidebar

### Architecture
- Removed CLI commands, Mermaid renderer, views layer
- Simplified model: field validation only, no relationship checks
- Concurrency: mutations return state under same lock, deep-copied slices
- Consistent JSON error responses across all API endpoints
- 92% API coverage, 97% model coverage, 82% parser coverage
- 44 frontend tests (vitest: hooks + component render tests)
- ColumnView split into modules (columnEdges, columnLayout)
- Shared view components, O(n) manager detection

---

## v2.0 — Grove

Pivoted from CLI Mermaid generator to interactive web-based org chart tool.

- Single Go binary with embedded React frontend (`grove serve`)
- Compact hierarchy view with drag-and-drop
- Change detection with diff mode and ghost nodes
- Export to PNG, SVG, CSV, XLSX

---

## v1.0 — orgchart CLI

Go CLI tool generating Mermaid flowchart diagrams from CSV/XLSX spreadsheets.

- People view and headcount view as Mermaid `flowchart TD`
- Cross-team edges, planned state flag, cycle detection
