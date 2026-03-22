# Node CRUD Operations

## Overview

Add inline hover actions (+, x, edit) to all org chart nodes, a recycle bin for soft-deleted people, and a manager dropdown in the detail sidebar. Replaces the current hard-delete behavior with soft-delete + restore.

## Hover Actions

Three icon buttons appear on hover over any node, in all views (tree, compact, headcount is read-only so no actions there).

### Plus (+) — Add Direct Report

**Visibility:** Only on nodes identified as managers. A person is a manager if:
1. They currently have at least one direct report in the working copy, OR
2. Their `role` field matches a manager pattern (case-insensitive regex): `VP`, `Director`, `Manager`, `Lead`, `Head`, `Chief`, `Principal`

This is computed dynamically — changing someone's role to "Engineering Manager" makes the plus button appear.

**Behavior:** Clicking plus creates a new person immediately with defaults:
- `name`: "New Person"
- `team`: same as parent's team
- `managerId`: parent's id
- `role`: ""
- `discipline`: ""
- `status`: "Active"

The new node appears in the tree instantly. It is auto-selected so the detail sidebar opens with the new person's fields ready for editing.

### X — Soft Delete

**Visibility:** All nodes.

**Behavior:** Clicking X moves the person to the recycle bin (soft delete). Their direct reports have `managerId` set to empty (becoming unparented). No confirmation dialog — the recycle bin makes deletion reversible. The unparented notification bar appears if applicable.

### Edit (pencil) — Open in Sidebar

**Visibility:** All nodes.

**Behavior:** Selects the node, opening it in the detail sidebar for editing. Equivalent to clicking the node itself.

## Recycle Bin

A slide-out drawer for reviewing and restoring deleted people.

**Toolbar:** A bin/trash icon in the toolbar. When items are in the bin, a badge shows the count.

**Drawer:** Clicking the bin icon opens a slide-out panel from the right side, overlaying the detail sidebar. Contains:
- Header: "Recycle Bin (N items)"
- List of deleted people, each shown as a card with: name, role, team
- "Restore" button on each card
- "Empty Bin" button at the bottom to permanently discard all

**Restore behavior:** Puts the person back into the working copy. If their original manager still exists in the working copy, `managerId` is restored. Otherwise, `managerId` is set to empty (unparented).

**Empty bin:** Permanently removes all recycled people. This is irreversible (within the session — the original import is always available via the Original view toggle).

## Detail Sidebar Enhancement

The existing detail sidebar gains a manager dropdown:

**Manager field:** Replace the free-text manager input with a `<select>` dropdown. Options:
- "(No manager)" — sets `managerId` to empty (root node)
- One option per person identified as a manager (same detection logic as the plus button), showing: `Name — Team`
- Sorted alphabetically by name
- The current manager is pre-selected

## Backend Changes

### OrgService Additions

The `OrgService` gains a `recycled []Person` field alongside `original` and `working`.

**Modified method:**
- `Delete(personId)` — moves person from `working` to `recycled` (instead of discarding). Unparents their direct reports.

**New methods:**
- `GetRecycled() []Person` — returns the recycled list.
- `Restore(personId)` — moves person from `recycled` back to `working`. If their original `managerId` still exists in `working`, it's preserved; otherwise set to empty.
- `EmptyBin()` — clears the `recycled` slice.

### New API Endpoints

| Method | Path | Payload | Response |
|--------|------|---------|----------|
| GET | /api/recycled | — | `[]Person` |
| POST | /api/restore | `{personId}` | `{working: []Person, recycled: []Person}` |
| POST | /api/empty-bin | — | `{recycled: []Person}` (empty array) |

The existing `POST /api/delete` endpoint's response changes to include both `working` and `recycled`:
```json
{
  "working": [...],
  "recycled": [...]
}
```

### Manager Detection (shared logic)

A utility function used by both frontend (hover button visibility, dropdown options) and exposed via API if needed:

```
isManager(person, allPeople) → boolean
```

Checks:
1. Does any person in `allPeople` have `managerId === person.id`?
2. Does `person.role` match the pattern `/\b(vp|director|manager|lead|head|chief|principal)\b/i`?

## Frontend Changes

### New Components

- `NodeActions` — hover overlay with +/x/edit icon buttons. Positioned absolutely over the node. Takes `isManager`, `onAdd`, `onDelete`, `onEdit` props.
- `RecycleBinDrawer` — slide-out panel listing recycled people with restore/empty actions.
- `RecycleBinButton` — toolbar icon with badge count.

### Modified Components

- `PersonNode` — wraps content with `NodeActions` on hover.
- `DetailSidebar` — manager field becomes a `<select>` dropdown.
- `Toolbar` — adds `RecycleBinButton`.
- `OrgContext` — adds `recycled` state, `restore(personId)`, `emptyBin()` actions. Updates `remove()` to handle the new response shape (working + recycled).

### API Client Additions

- `getRecycled(): Promise<Person[]>`
- `restorePerson(personId): Promise<{working: Person[], recycled: Person[]}>`
- `emptyBin(): Promise<{recycled: Person[]}>`
- Update `deletePerson` to return `{working: Person[], recycled: Person[]}`
