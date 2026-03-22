# Grove v2 Features

## Overview

Named snapshots with branching, autosave with dual persistence, manager info popovers with org metrics, a manager-only view that summarizes ICs, simplified toolbar, and a Pike-style identity for the app.

## 1. Pike-style Identity

### Upload/Empty State

Replace the current "Upload a CSV or XLSX file to get started" with:

> **grove** /ɡroʊv/ *n.* — a small group of trees, deliberately planted and carefully tended.
>
> Org planning for people who think in structures, not spreadsheets.

Followed by the upload button.

### CLI Help

The Cobra root command's `Long` description gets the same text.

## 2. Simplified Toolbar

Remove the view mode pill group entirely. Replace with a two-state toggle:

- **Detail** (default) — the current compact hierarchy view showing all people
- **Manager** — the new manager-only view with IC summaries

The `ViewMode` type changes from `'columns' | 'headcount'` to `'detail' | 'manager'`. The HeadcountView component (`web/src/views/HeadcountView.tsx` and its CSS) is deleted — its functionality is superseded by the Manager Only view's IC summary cards and the Manager Info Popover's metrics.

The data view toggle (Original / Working / Diff) remains. The export dropdown, reflow button, recycle bin, and upload button remain.

Add a **Snapshots** dropdown (see section 3).

## 3. Named Snapshots

Save, load, and branch between named versions of the org.

### Backend

Add to `OrgService`:

```
snapshots map[string]SnapshotData
```

Where `SnapshotData` holds `[]Person` (a deep copy of the working state at save time) plus metadata (creation timestamp).

**Methods:**
- `SaveSnapshot(name string)` — deep copies current working state into `snapshots[name]`. If a snapshot with that name already exists, it is silently overwritten.
- `LoadSnapshot(name string) (*OrgData, error)` — replaces working with the snapshot's data, returns new OrgData
- `DeleteSnapshot(name string)`
- `ListSnapshots() []SnapshotInfo` — returns names + timestamps

The original import is always available via `GetOrg().Original` — it's not stored as a snapshot, but the UI shows it as "Original" in the list.

Loading a snapshot replaces working and clears recycled (clean slate from that point).

**API Endpoints:**

| Method | Path | Payload | Response |
|--------|------|---------|----------|
| GET | /api/snapshots | — | `[]SnapshotInfo` (name + timestamp) |
| POST | /api/snapshots/save | `{name}` | `[]SnapshotInfo` |
| POST | /api/snapshots/load | `{name}` | `OrgData` |
| POST | /api/snapshots/delete | `{name}` | `[]SnapshotInfo` |

### Frontend

A dropdown in the toolbar labeled with the current snapshot name (or "Working" if no snapshot is loaded):

- **Save As...** — prompts for a name (browser `prompt()`), calls save endpoint
- **Snapshot list** — each entry shows name and timestamp. Click to load. Small x to delete.
- **"Original"** — always listed first. Loading it is a special case: copies `original` into `working` (not a call to `LoadSnapshot`). This is the reset-to-import action.

State in OrgContext:
- `snapshots: SnapshotInfo[]`
- `currentSnapshotName: string | null` (null = unsaved working state)
- Actions: `saveSnapshot(name)`, `loadSnapshot(name)`, `deleteSnapshot(name)`

Loading a snapshot sets `currentSnapshotName`. Any mutation after loading clears it back to null (you've diverged).

## 4. Autosave

Automatic persistence of the current working state for recovery.

### Trigger

Every mutation (add, delete, move, update, restore, empty-bin) triggers an autosave after the API response returns successfully. Autosave is debounced — if multiple mutations fire in quick succession (e.g., during drag-and-drop), only the last one writes. Use a 2-second debounce timer. Snapshots are excluded from the autosave payload to keep size manageable — only original, working, recycled, and the current snapshot name are persisted.

### Dual Persistence

**Server-side:** `POST /api/autosave` after each mutation. The server writes `~/.grove/autosave.json` containing:
```json
{
  "original": [...],
  "working": [...],
  "recycled": [...],
  "snapshots": {...},
  "snapshotName": "Q1 Plan",
  "timestamp": "2026-03-21T..."
}
```

**localStorage:** Same data written to `localStorage.setItem('grove-autosave', JSON.stringify(...))` for instant recovery without a server round-trip.

### Recovery

On page load (in `OrgProvider` mount effect):
1. Check localStorage first (instant).
2. If not in localStorage, call `GET /api/autosave` to check server-side.
3. If autosave exists, show a banner: "Restore previous session? (saved at 2:15 PM)" with **Restore** and **Dismiss** buttons.
4. **Restore** loads the autosaved state into context (original, working, recycled, snapshots, snapshotName).
5. **Dismiss** clears both localStorage and server-side autosave.

### Clearing

- New file upload clears autosave (both localStorage and server-side).
- Dismiss clears it.

### Backend

- `POST /api/autosave` — accepts the full state, writes to `~/.grove/autosave.json`
- `GET /api/autosave` — returns the saved state or 204 if none
- `DELETE /api/autosave` — clears the file

The autosave file is independent of the OrgService's in-memory state — it's purely a persistence layer.

## 5. Manager Info Popover

An ℹ button on manager nodes (alongside the existing +/x/edit hover actions). Only visible on managers.

Clicking ℹ opens a popover card anchored to the node showing:

| Metric | Description | Scope |
|--------|-------------|-------|
| **Span of control** | Direct reports count | Direct only |
| **Total headcount** | All people under them | Recursive |
| **Recruiting** | Open + Backfill count | Recursive |
| **Planned** | Pending Open + Planned count | Recursive |
| **Transfers** | Transfer In + Transfer Out count | Recursive |
| **By discipline** | e.g., "Engineering: 5, Design: 2" | Recursive, Active people only |
| **By team** | e.g., "Platform: 8, Search: 3" | Recursive, all statuses |

Computed client-side from the working data. No API call needed.

### Frontend

New component: `ManagerInfoPopover`. Takes a `personId` and the full `working` array. Computes metrics by walking the tree recursively from that person.

Triggered by an ℹ button in `NodeActions` (shown only on managers, alongside +/edit/x). The `NodeActions` visibility logic needs updating — currently it checks `onAdd || onDelete` to decide whether to show. Add `onInfo` as an additional trigger so the actions overlay shows whenever any action is available. Clicking ℹ opens the popover. Closes on click-outside or Escape.

Positioned absolutely near the node, similar to how NodeActions works but as a larger card (200-250px wide).

## 6. Manager Only View

A new view mode showing the management hierarchy with ICs collapsed into summary counts.

### Layout

Same recursive tree layout as the current Detail view (managers spread horizontally, children below), but:

- **Manager nodes** render as full cards (name, team, role) — same as Detail view
- **Frontline managers** (all reports are ICs) show a **summary card** below them instead of individual IC nodes. The summary shows discipline counts: "Engineering: 3, Design: 1, Open: 2"
- **Mid-level managers** with sub-managers show those sub-managers as full nodes, plus a summary card for any direct ICs they have
- **DnD works** on manager nodes (drag to reparent managers)
- **Hover actions** (+/x/edit/ℹ) work on manager nodes
- **No individual IC nodes** are rendered

### Determining "manager" for this view

A person is shown as a node if they have at least one direct report in the working copy (regardless of role title). This is simpler than the isManager role-pattern matching — it's purely structural. A person with no reports is an IC and gets summarized.

### Summary card

A small card that replaces the IC list, styled differently from person nodes (lighter background, no border highlight):

```
Engineering: 3
Design: 1
Open: 2 (recruiting)
Planned: 1
```

Groups: Active by discipline, then Open+Backfill as "Recruiting", Pending Open+Planned as "Planned", Transfer In/Out as "Transfers". Only shows groups with count > 0.

### Component

New component: `ManagerView.tsx` — a recursive tree similar to `ColumnView.tsx`'s `SubtreeNode` but with IC summarization logic. Reuses `PersonNode`, `DraggableNode`, `NodeActions`, and `useDragDrop`.
