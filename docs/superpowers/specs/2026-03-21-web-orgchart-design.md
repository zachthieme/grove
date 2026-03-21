# Web-Based Interactive Org Chart Tool

## Overview

Pivot the existing Go CLI org chart tool into a web application. Users upload CSV/XLSX files, interactively edit the org chart through drag-and-drop and forms, view the org in multiple layout modes, track changes against the original import, and export to image or spreadsheet formats.

The app ships as a single Go binary with the React frontend embedded via `go:embed`. No external dependencies or complicated install process.

## Goals

- **Interactive editing:** Add, remove, and restructure people and teams via drag-and-drop and a detail panel.
- **Multiple views:** Tree (top-down), compact columns (with hierarchy), and headcount summary — switchable at any time.
- **Change tracking:** Automatic visual annotations showing what changed relative to the original import. Toggle between original, working, and diff views.
- **Round-trip data:** Upload a spreadsheet, edit in the app, export back to spreadsheet. Also export views as PNG/SVG.
- **Single binary:** One `go build` produces a self-contained binary. No Node runtime, no database, no config files needed to run.
- **Growth path:** Starts as a personal tool; architecture allows adding persistence and multi-user later without a rewrite.

## Architecture

```
┌─────────────────────────────────────┐
│           Go Binary                 │
│                                     │
│  ┌──────────┐  ┌────────────────┐   │
│  │ API      │  │ Static Files   │   │
│  │ Handlers │  │ (go:embed)     │   │
│  └────┬─────┘  └───────┬────────┘   │
│       │                │            │
│  ┌────┴─────┐     React SPA         │
│  │ Org      │     (built at         │
│  │ Service  │      compile time)    │
│  ├──────────┤                       │
│  │ Parser   │                       │
│  │ (CSV/    │                       │
│  │  XLSX)   │                       │
│  └──────────┘                       │
└─────────────────────────────────────┘
```

### Go Backend

- Standard library `net/http` server. No web framework.
- REST API for: file upload/parsing, org data retrieval, mutations (move/update/add/delete), and data export (CSV/XLSX generation). Image export (PNG/SVG) happens entirely client-side via `html-to-image` — the backend is not involved.
- Reuses/adapts the existing parser package for CSV and XLSX (excelize).
- In-memory state: holds two snapshots of the org (original and working). Single-process, single-session — one org loaded at a time. Multiple browser tabs share the same state (they hit the same API). If the server restarts, state is lost; the user re-uploads their file. No database for v1.
- `//go:embed` serves the built frontend assets.

### React Frontend

- TypeScript SPA built with Vite.
- `d3-hierarchy` for tree layout computation (position math only, not d3 DOM manipulation).
- `dnd-kit` for drag-and-drop across all views.
- `html-to-image` for PNG/SVG export of rendered views.
- Vanilla CSS / CSS modules for styling. No UI component framework.
- Fetches org data from the Go API, renders views, sends mutations back.

### Build

- Makefile with targets:
  - `make frontend` — runs `npm run build` in `web/` directory.
  - `make build` — builds frontend, then `go build` to produce the single binary.
  - `make dev` — runs Vite dev server + Go server concurrently (hot reload on frontend, API proxied to Go).

## Data Model

### Org State

Two snapshots live in memory on the Go backend:

- **Original** — the parsed import, immutable until a new file is uploaded.
- **Working** — a deep copy that all mutations apply to.

Both are sent to the frontend as JSON on load. The frontend holds them in a React context/store.

### Person Schema (JSON)

```json
{
  "id": "string (stable UUID, assigned on parse or creation)",
  "name": "string",
  "role": "string",
  "discipline": "string",
  "managerId": "string (id reference, empty for root nodes)",
  "team": "string",
  "additionalTeams": ["string"],
  "status": "Active | Hiring | Open | Transfer",
  "newRole": "string (optional)",
  "newTeam": "string (optional)"
}
```

Each person gets a stable `id` (UUID) assigned when the file is first parsed or when a person is added via the UI. All internal references (manager, mutations, change detection) use `id`, not `name`. Names can be freely renamed without breaking references. The original snapshot and working snapshot share the same IDs for people that came from the import, enabling reliable diffing.

**Relationship to existing model:** The existing `model.Person` struct and `Org` indexes (`ByName`, `ByManager`) are designed for the CLI pipeline. The web app introduces a new `api` model with `Id` and `ManagerId` fields. The parser continues to produce the existing `model.Person` structs; a conversion layer in the service package maps them to the API model (assigning UUIDs, converting name-based manager references to ID-based). The existing CLI commands are unaffected — they continue using the existing model. The two models coexist.

### Mutations

Every edit sends a mutation to the API, which updates the working copy and returns the full working org (all people) as JSON. The frontend replaces its local working state with the response. The original snapshot is only sent once on initial load and never changes.

| Mutation | Payload | Effect |
|----------|---------|--------|
| `move` | personId, newManagerId, newTeam | Changes reporting line and/or team |
| `update` | personId, fields | Edits name, role, discipline, status, etc. |
| `add` | person fields (id auto-assigned) | Creates a new person in the working copy |
| `delete` | personId | Removes person; their direct reports have `managerId` set to empty (becoming root/unparented nodes) |

### Change Detection

Computed client-side by comparing working copy against original, matched by stable `id`:

| Condition | Annotation | Visual Treatment |
|-----------|-----------|-----------------|
| In working, not in original | **Added** | Green border/badge |
| In original, not in working | **Removed** | Ghost node (faded/strikethrough) in diff mode only |
| Manager field differs | **Reporting change** | Orange highlight |
| Role or discipline differs | **Title change** | Blue badge |
| Team differs | **Reorg** | Yellow tint |
| Status is Hiring/Open | **Hiring** | Dashed border |

Multiple annotations can apply to the same node (e.g., a person who changed team AND title).

## View Modes

Three views, switchable via tabs in the toolbar. All render the same org data with consistent change annotations.

### Tree View (Top-Down)

- D3-hierarchy computes node positions.
- Rendered as positioned DOM elements (not canvas) for full CSS control.
- Edges drawn as SVG lines in an overlay behind nodes.
- Zoom and pan via CSS transforms on the container.
- **Drag-and-drop:** Drag a node onto a different parent to change reporting line. Drop onto a team region to change team.
- **Subtree drag:** Shift+drag a manager node to grab them and their entire subtree. Badge shows "Moving N people." Internal reporting structure preserved on drop.

### Compact Column View

- Each team rendered as a CSS grid column.
- Hierarchy preserved within columns via indentation: manager at top, direct reports indented one level, their reports indented further.
- Denser than tree view — better for large orgs.
- **Drag-and-drop:** Drag a person between columns to change team. Drag within a column onto a person to make them your new manager. Drag a team header to move the entire team.
- **Subtree drag:** Same shift+drag behavior as tree view.

### Headcount Summary View

- Team cards showing discipline counts per team (matches existing CLI `headcount` command).
- Read-only — no drag-and-drop.
- Clicking a team card is not interactive in v1. Future enhancement could highlight/filter that team in other views.

## UI Layout

### App Shell

- **Top toolbar:** File upload button, view mode tabs (Tree / Columns / Headcount), Original/Working/Diff toggle, "Add Person" button, export dropdown.
- **Main area:** The active view, filling available space.
- **Right sidebar (collapsible):** Detail/edit panel. Opens on node click. Shows all person fields as editable inputs, save/cancel buttons, and change annotations ("Reporting changed from X to Y").
- No left nav or multi-page routing. Single-purpose tool.

### Interaction Details

**Editing a node:**
- Click a node to open the detail sidebar with editable fields.
- Save applies an `update` mutation; cancel discards.

**Adding a node:**
- "Add Person" in toolbar opens sidebar with blank form.
- Right-click a node → "Add report" creates a new person reporting to them.

**Deleting a node:**
- Select + Delete key, or context menu.
- Confirmation prompt: "Remove Jane Doe? Their 3 reports will become unassigned."
- Reports of deleted person become unparented (root nodes).

**Unparented person tracking:**
- When a deletion (or re-upload) leaves people without a manager, a persistent notification bar appears: "3 people are now unparented" with a clickable list.
- Unparented people get a warning outline (red/orange) visible in all view modes.
- Notification persists until each unparented person is reassigned to a new manager or explicitly confirmed as a root node.

**Ghost nodes (diff mode):**
- People present in original but removed from working appear as faded/strikethrough nodes in diff mode, so you can see who's gone.

### View Toggle

A three-way toggle in the toolbar: **Original / Working / Diff.**
- **Original:** Renders the imported data as-is. Read-only.
- **Working:** Renders the current edited state. This is the default.
- **Diff:** Renders working state with all change annotations overlaid (added, removed, moved, etc.).

## Export

Dropdown in toolbar with four options:

- **PNG** — captures the current view as rendered via `html-to-image`. Includes change annotations if in diff mode.
- **SVG** — same as PNG but vector format.
- **CSV** — Go backend serializes the working copy to CSV format.
- **XLSX** — Go backend serializes the working copy to XLSX via excelize.

Data exports produce a spreadsheet matching the original import format, so the round-trip works: upload → edit → export → upload again.

## Technology Stack

| Layer | Choice | Rationale |
|-------|--------|-----------|
| Backend server | Go `net/http` | Already in the project, no framework needed for small API |
| File parsing | Existing parser + excelize | Reuse what works |
| Frontend framework | React + TypeScript | Widely supported, good ecosystem for interactive tools |
| Build tool | Vite | Fast builds, small bundles |
| Tree layout | d3-hierarchy | Battle-tested layout algorithms, used for math only |
| Drag-and-drop | dnd-kit | Modern, accessible, React-native DnD |
| Image export | html-to-image | Captures DOM to PNG/SVG |
| Styling | CSS modules | No UI framework overhead, full control |
| Asset embedding | go:embed | Single binary deployment |

## Project Structure

```
orgchart/
├── cmd/                    # CLI commands (existing, may keep for backwards compat)
├── internal/
│   ├── parser/             # CSV/XLSX parsing (existing, reused)
│   ├── model/              # Org domain model (existing, reused)
│   ├── api/                # HTTP handlers and routes
│   └── service/            # Org service: state management, mutations
├── web/                    # React frontend
│   ├── src/
│   │   ├── components/     # React components
│   │   ├── views/          # TreeView, ColumnView, HeadcountView
│   │   ├── store/          # Org state context/store
│   │   ├── hooks/          # Custom hooks (useDragDrop, useOrgDiff, etc.)
│   │   └── api/            # API client functions
│   ├── package.json
│   └── vite.config.ts
├── embed.go                # go:embed directives for web/dist
├── Makefile
└── main.go
```

## Non-Goals (v1)

- Multi-user / authentication — personal tool first.
- Persistent storage / database — in-memory state, export to save.
- Real-time collaboration.
- Undo/redo — possible future enhancement, not in scope. The Original snapshot and re-upload serve as the safety net.
- Mobile/responsive layout — desktop tool.
