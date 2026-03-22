# Grove Fixes

## Overview

A batch of small improvements: rename the app to Grove, remove the tree view, add a reflow button, guard against accidental browser navigation, expand the status types, and add inline status descriptions.

## 1. Rename to Grove

- Makefile: build target produces `grove` binary instead of `orgchart`
- Cobra root command: `Use: "grove"`, `Short: "..."` updated
- Toolbar title: "Grove" instead of "Org Chart"
- HTML `<title>`: "Grove"
- Go module path (`github.com/zach/orgchart`) stays unchanged — no import path churn

## 2. Remove Tree View

- Remove `web/src/views/TreeView.tsx` and `web/src/views/TreeView.module.css`
- Remove `web/src/hooks/useZoomPan.ts` (only used by TreeView)
- Remove `'tree'` from the `ViewMode` type in `OrgContext.tsx`. Default `viewMode` becomes `'columns'`.
- Remove Tree tab from `Toolbar.tsx` view mode pills
- Remove TreeView import and rendering branch from `App.tsx`
- The `DraggableNode` wrapper in `TreeView.tsx` is duplicated in `ColumnView.tsx`, so removing TreeView has no impact on the column view.

## 3. Reflow Button

A toolbar button that forces the current view to re-layout.

- Add a `layoutKey: number` to OrgContext state (initial: 0).
- Add a `reflow()` action that increments `layoutKey`.
- Views use `layoutKey` as a React `key` prop so they fully remount and recalculate.
- Toolbar gets a "Reflow" button (or ↻ icon) that calls `reflow()`.

## 4. Browser Navigation Guard

Prevent accidental loss of edits when the user navigates away.

- In `OrgProvider`, add a `useEffect` that registers a `beforeunload` event listener when unsaved changes exist.
- "Unsaved changes" = `loaded` is true AND `working` differs from `original` (compare by length or JSON stringify of IDs — a cheap check, not deep equality).
- The browser shows its native confirmation dialog. No custom UI needed.
- Listener is cleaned up when changes are saved (export) or on unmount.

## 5. Expanded Statuses

Replace the current 4 statuses with 7:

| Status | Meaning | Visual Treatment |
|--------|---------|-----------------|
| **Active** | Currently filled and working | Solid border |
| **Open** | Approved headcount, actively recruiting | Dashed blue border |
| **Pending Open** | Headcount requested, not yet approved | Dashed gray border |
| **Transfer In** | Person coming from another team/org | Dashed amber border |
| **Transfer Out** | Person leaving to another team/org | Dashed amber border |
| **Backfill** | Replacing someone who left | Dashed blue border |
| **Planned** | Future role in a reorg, not yet active | Dashed gray border |

### Backend changes

- `internal/model/model.go`: Replace status constants:
  ```go
  StatusActive      = "Active"
  StatusOpen        = "Open"
  StatusPendingOpen = "Pending Open"
  StatusTransferIn  = "Transfer In"
  StatusTransferOut = "Transfer Out"
  StatusBackfill    = "Backfill"
  StatusPlanned     = "Planned"
  ```
- Update `NewOrg` validation: the valid statuses set uses the new constants. Blank Role/Discipline allowed for: Transfer In, Transfer Out, Pending Open, Planned (same exemption logic as current Transfer).
- **Backwards compatibility**: When parsing, if the status value is `"Hiring"` map it to `"Open"`. If `"Transfer"` (without In/Out), map it to `"Transfer In"` (existing data assumed to be incoming). This mapping lives in `BuildPeople` / `BuildPeopleWithMapping`.

### Frontend changes

- `web/src/api/types.ts`: Update the `status` union type on `Person`.
- `PersonNode.tsx` / `PersonNode.module.css`: Update styling logic:
  - `Open`, `Backfill` → dashed blue border, blue emoji prefix
  - `Pending Open`, `Planned` → dashed gray border, gray emoji prefix
  - `Transfer In`, `Transfer Out` → dashed amber border, yellow emoji prefix
  - `Active` → solid border (unchanged)
- `DetailSidebar.tsx`: Update the STATUSES array for the dropdown.
- `HeadcountView.tsx`: Group statuses in team cards — Active by discipline, then Open+Backfill as "Recruiting", Pending Open+Planned as "Planned", Transfer In/Out as "Transfers".

## 6. Status Info Popover

An inline info tooltip on the Status field in the detail sidebar.

- Small ℹ icon next to the "Status" label in `DetailSidebar.tsx`.
- On hover (or click on mobile), shows a popover/tooltip listing all statuses with their one-line descriptions.
- Styled as a small card with a list — same font size as the sidebar, positioned above/below the icon.
- No separate page or modal.

### Content:
```
Active — Currently filled and working
Open — Approved headcount, actively recruiting
Pending Open — Headcount requested, not yet approved
Transfer In — Person coming from another team/org
Transfer Out — Person leaving to another team/org
Backfill — Replacing someone who left
Planned — Future role in a reorg, not yet active
```
