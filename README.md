![grove](docs/grove-banner.svg)

> **grove** /ɡroʊv/ *n.* — a small group of trees, deliberately planted and carefully tended. Org planning for people who think in structures, not spreadsheets.

---

Your org chart already exists in a spreadsheet somewhere — names, roles, teams, reporting lines. Grove takes that file, turns it into something you can see and touch, and lets you plan changes before they happen. Upload a CSV, drag people between teams, snapshot different reorg options, and export the result. One binary, no database, no account.

## Install

### Nix

```
nix run github:zachthieme/grove
nix profile install github:zachthieme/grove
```

### Build from source

```
git clone https://github.com/zachthieme/grove.git
cd grove
make build
```

This builds the React frontend and embeds it into a single Go binary (`grove`).

### Requirements (build only)

- Go 1.25+
- Node.js 18+

## Quick Start

```
grove
grove -p 3000
grove --log
```

Your browser opens automatically. Upload a CSV/XLSX/ZIP or start from scratch.

## Getting Started

### Import from a spreadsheet

Upload any CSV or XLSX with at least a Name column. Grove matches headers flexibly — "Job Title" maps to Role, "Department" maps to Team, etc. If it can't match confidently, you'll see a mapping screen with its best guesses.

### Start from scratch

Click "or start from scratch" on the landing page, enter a name, and build your org chart one person at a time. The sidebar opens immediately so you can fill in details. Click + on any person to add a report under them.

### Product tour

A guided walkthrough starts automatically on your first visit. Click the **?** button in the toolbar to replay it anytime.

## File Format

| Column           | Required | Description                   |
| ---------------- | -------- | ----------------------------- |
| Name             | yes      | Person's name                 |
| Role             | no       | Job title                     |
| Discipline       | no       | Engineering, Design, PM, etc. |
| Team             | no       | Team name                     |
| Status           | no       | See statuses below            |
| Manager          | no       | Name of their manager         |
| Employment Type  | no       | FTE, Contractor, Agency, etc. |
| Additional Teams | no       | Comma-separated               |

Only the Name column is required. All other columns are optional and default to empty if unmapped. Duplicate names are fine. Row ordering doesn't matter.

### Statuses

| Status       | Meaning                                      |
| ------------ | -------------------------------------------- |
| Active       | Currently filled and working                 |
| Open         | Approved headcount, actively recruiting      |
| Transfer In  | Person coming from another team/org          |
| Transfer Out | Person leaving to another team/org           |
| Backfill     | Replacing someone who left                   |
| Planned      | Future headcount, not yet approved or active |

## Views

### Detail

The default view. Shows every person in a compact hierarchy — managers spread horizontally, ICs stacked vertically beneath them. When a manager has ICs on multiple teams, each team gets its own column with a header node.

### Manager

Shows only the management hierarchy. ICs are collapsed into summary cards showing discipline counts and recruiting/planned/transfer numbers. Good for seeing the shape of the org without the noise of individual contributors.

### Table

A spreadsheet-style view. Inline editing, sortable columns, column filters, column visibility toggles, and a paste-from-clipboard button for bulk entry. Add draft rows with the + button.

## Features

**Create from scratch** — Start a new org chart without importing a file. Add people one at a time, build the hierarchy as you go.

**Add parent** — Click the up-arrow icon on any root-level person to add a manager above them.

**Drag-and-drop** — Reparent people by dragging onto a new manager. When you move a manager, their team cascades to their direct reports.

**Collapse/expand** — Click the chevron (v/>) below any manager to collapse or expand their subtree. Collapsed nodes show a report count.

**Hover actions** — Every node shows quick actions on hover: + (add report), edit, delete, info, focus. Root nodes also show an up-arrow to add a parent.

**Sidebar editing** — Click any person to open the detail sidebar. Edit name, role, discipline, team, status, employment type, level, pods, notes, and privacy. Save and Delete buttons are always visible (sticky header/footer).

**Multi-select** — Ctrl/Cmd-click or lasso-select multiple people. The sidebar switches to batch edit mode.

**Search** — Type in the search bar (or press **Cmd+K**) to find people by name. Select a result to jump to them in the chart.

**Undo/redo** — **Cmd+Z** to undo, **Cmd+Shift+Z** to redo. Toolbar buttons also available. Tracks the last 50 mutations.

**Manager info** — Click the info icon on any manager to see span of control, total headcount, and breakdowns by discipline, team, and status.

**Recycle bin** — Deleted people go to a slide-out bin with restore and empty actions. Nothing is permanently lost until you empty it.

**Snapshots** — Save named versions of your org ("Q1 Plan", "Option B"). Load any snapshot to switch contexts. "Original" always resets to the initial import. Snapshots persist to `~/.grove/snapshots.json`.

**Autosave** — Every change is automatically saved to both localStorage and `~/.grove/autosave.json`. If the server restarts, you get a banner offering to restore your session.

**ZIP import/export** — Export all snapshots as a ZIP with numeric-prefixed filenames (`0-original.csv`, `1-working.csv`, `2-Q1-Plan.csv`). Import a ZIP to restore the full snapshot set.

**Diff mode** — Toggle to see what changed since the original import. Added people get green borders, reporting changes get orange, reorgs get yellow. Deleted people appear as ghost nodes.

**Export** — PNG, SVG (tight-cropped to content), CSV, and XLSX. Bulk export all snapshots as a ZIP.

**Pods** — Group people into named pods within a team. Pods show as headers in the detail view with their own notes.

**Employment types** — Track FTE, Contractor, Agency, Vendor, or any custom label. Non-FTE types show as a colored accent bar. Filter by employment type in the toolbar.

**Dark mode** — Automatically follows your system preference. Full warm dark palette.

**Request logging** — Run with `--log` to enable the request log viewer. See all API calls with timing, correlation IDs, and request/response bodies. Copy or download logs for debugging.

## Keyboard Shortcuts

| Shortcut            | Action                            |
| ------------------- | --------------------------------- |
| Cmd+K / Ctrl+K      | Focus search                      |
| Cmd+Z / Ctrl+Z      | Undo                              |
| Cmd+Shift+Z         | Redo                              |
| Escape              | Deselect / close                  |
| /                   | Focus search (vim mode)           |
| h / j / k / l       | Navigate tree (vim mode)          |
| o                   | Add report (vim mode)             |
| x                   | Delete selected (vim mode)        |

Vim keys are off by default. Enable in Settings (hamburger menu > Settings > "Vim navigation keys").

## Configuration

Grove requires no configuration. It runs as a self-contained server writing to `~/.grove/` for persistence.

```
grove [flags]
```

| Flag     | Short | Default | Description                                |
| -------- | ----- | ------- | ------------------------------------------ |
| `--port` | `-p`  | 8080    | Port to listen on                          |
| `--dev`  |       | false   | Dev mode (frontend served by Vite)         |
| `--log`  |       | false   | Enable request logging and log viewer      |

## Accessibility

- ARIA labels and hover tooltips on all interactive controls
- Screen reader text for status indicators
- Keyboard navigation (Tab, Enter, Escape, arrow keys)
- Optional vim keybindings
- Semantic HTML with proper roles
- Focus ring indicators
- `role="alert"` for error/warning banners

## Development

```
make dev          # Vite dev server + Go server (hot reload)
make build        # Production build (single binary)
make frontend     # Build just the React frontend
make typecheck    # TypeScript type check (no build)
make clean        # Remove build artifacts
```

### Testing

```
go test ./...                    # Go tests (model, parser, API, integration)
cd web && npm test               # Frontend tests (vitest, 1000+ tests)
cd web && npm test -- --coverage # With coverage report
make check-scenarios             # Verify scenario contract coverage
make e2e                         # Playwright end-to-end tests
make bench                       # Go benchmarks
make fuzz                        # Fuzz testing
```

### Architecture

Single Go binary serving a React SPA via `go:embed`.

```
grove
├── cmd/                  # CLI entry point + HTTP server
├── internal/
│   ├── api/              # REST handlers, service, inference, export, ZIP import
│   ├── model/            # Person, Org, field validation
│   └── parser/           # CSV/XLSX parsing with column mapping
├── web/src/
│   ├── views/            # ColumnView, ManagerView, TableView, ChartShell
│   ├── components/       # PersonNode, DetailSidebar, SearchBar, modals
│   ├── hooks/            # useChartLayout, useOrgDiff, useAutosave, useUndoRedo, useVimNav
│   └── store/            # OrgDataContext, UIContext, SelectionContext, ViewDataContext
├── docs/scenarios/       # Scenario contracts (source of truth for behavior)
└── embed.go              # go:embed web/dist
```
