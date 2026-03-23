![grove](grove-banner.svg)

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
grove serve
grove serve -p 3000
```

Your browser opens automatically. Upload a CSV, XLSX, or ZIP of snapshots and start planning.

## File Format

Any spreadsheet with these columns works (headers are matched flexibly — "Job Title" maps to Role, "Department" maps to Team, etc.):

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

Only the Name column is required. All other columns are optional and default to empty if unmapped.

If Grove can't confidently match your columns, it shows a mapping screen with its best guesses for you to correct. Duplicate names are fine. Row ordering doesn't matter.

### Statuses

| Status       | Meaning                                 |
| ------------ | --------------------------------------- |
| Active       | Currently filled and working            |
| Open         | Approved headcount, actively recruiting |
| Pending Open | Headcount requested, not yet approved   |
| Transfer In  | Person coming from another team/org     |
| Transfer Out | Person leaving to another team/org      |
| Backfill     | Replacing someone who left              |
| Planned      | Future role in a reorg, not yet active  |

Legacy values `Hiring` and `Transfer` are automatically mapped to `Open` and `Transfer In`.

## Views

### Detail

The default view. Shows every person in a compact hierarchy — managers spread horizontally, ICs stacked vertically beneath them. When a manager has ICs on multiple teams, each team gets its own column with a header node. Drag any node onto another to reparent. Hover for quick actions (+/edit/delete).

### Manager

Shows only the management hierarchy. ICs are collapsed into summary cards showing discipline counts and recruiting/planned/transfer numbers. Good for seeing the shape of the org without the noise of individual contributors.

## Features

**Drag-and-drop** — Reparent people by dragging onto a new manager. Drop onto a team header to move someone to that team.

**Hover actions** — Every node shows +/edit/delete on hover. The + button creates a new direct report. Delete moves to the recycle bin. Managers also get an info button.

**Manager info** — Click ℹ on any manager to see span of control, total headcount, recruiting/planned/transfer counts, and breakdowns by discipline and team.

**Recycle bin** — Deleted people go to a slide-out bin with restore and empty actions. Nothing is permanently lost until you empty it.

**Snapshots** — Save named versions of your org ("Q1 Plan", "Option B"). Load any snapshot to switch contexts. "Original" always resets to the initial import. Snapshots persist to `~/.grove/snapshots.json` and survive server restarts.

**Autosave** — Every change is automatically saved to both localStorage and `~/.grove/autosave.json`. If the server restarts, you get a banner offering to restore your session.

**ZIP import/export** — Export all snapshots as a ZIP with numeric-prefixed filenames (`0-original.csv`, `1-working.csv`, `2-Q1-Plan.csv`). Import a ZIP to restore the full snapshot set. Supports CSV, XLSX, PNG, and SVG formats.

**Diff mode** — Toggle to see what changed since the original import. Added people get green borders, reporting changes get orange, reorgs get yellow. Deleted people appear as ghost nodes.

**Export** — PNG and SVG (captured from the rendered view, tight-cropped to content), CSV and XLSX (with manager names resolved back from UUIDs). Bulk export all snapshots as a ZIP.

**Employment types** — Track FTE, Contractor, Agency, Vendor, or any custom label. Non-FTE types show as a pill badge on the node.

## Configuration

Grove requires no configuration. It runs as a self-contained server. It writes to `~/.grove/` for autosave (`autosave.json`) and snapshot persistence (`snapshots.json`).

```
grove serve [flags]
```

| Flag     | Short | Default | Description                        |
| -------- | ----- | ------- | ---------------------------------- |
| `--port` | `-p`  | 8080    | Port to listen on                  |
| `--dev`  |       | false   | Dev mode (frontend served by Vite) |

## Development

```
make dev          # Vite dev server + Go server (hot reload)
make build        # Production build (single binary)
make frontend     # Build just the React frontend
make clean        # Remove build artifacts
```

### Testing

```
go test ./...                    # Go tests (model, parser, API, integration)
cd web && npm test               # Frontend tests (vitest)
```

### Architecture

Single Go binary serving a React SPA via `go:embed`.

```
grove
├── cmd/serve.go          # HTTP server
├── internal/
│   ├── api/              # REST handlers, service, inference, export, ZIP import
│   ├── model/            # Person, Org, field validation
│   └── parser/           # CSV/XLSX parsing with column mapping
├── web/src/
│   ├── views/            # ColumnView, ManagerView, layout algorithms
│   ├── components/       # PersonNode, DetailSidebar, modals
│   ├── hooks/            # useOrgDiff, useIsManager, useAutosave, useSnapshotExport
│   └── store/            # OrgContext, orgTypes, useDirtyTracking
└── embed.go              # go:embed web/dist
```
