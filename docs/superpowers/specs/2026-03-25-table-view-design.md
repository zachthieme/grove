# Table View Design

## Summary

Add a spreadsheet-style "Table" view as a third view mode alongside Detail and Manager. Shows all people in an editable table with per-column Excel-style filters, column sorting, column visibility toggles, inline editing, row deletion, single/bulk row addition with paste support, and context-aware defaults.

## Motivation

The existing Detail and Manager views are optimized for visualizing org hierarchy. There's no way to scan all people as a flat list, quickly edit multiple fields, or bulk-add people. A table view provides a familiar spreadsheet experience for data-heavy operations.

## View Integration

### Third View Mode

Add `'table'` to the `ViewMode` type: `'detail' | 'manager' | 'table'`. The toolbar toggle gets a third "Table" option. When selected, `App.tsx` renders `<TableView>` instead of `ColumnView` or `ManagerView`.

### Data Flow

TableView receives the same post-filtered, post-sorted `people` array as the other views (via `useSortedPeople` applied after `useFilteredPeople`). It shows whichever snapshot is currently loaded — no special snapshot handling. Uses the same `update()`, `add()`, `remove()` actions from context.

Note: The table receives the already-filtered people array. This means global filters (employment type, head-subtree) are applied upstream. The table's per-column filters are an additional local layer. Values excluded by upstream filters will not appear in the table's column filter dropdowns — this is correct and intentional.

### Diff Mode

When `dataView` is `'diff'`, the table shows working data with changed **rows** color-coded using the change types from `useOrgDiff`. Coloring is at the row level (not per-cell), matching how the other views highlight entire PersonNode cards. The change types are: `added`, `removed`, `reporting`, `title`, `reorg`, `pod`. The row background color reflects the most significant change type.

### Original View Mode

When `dataView` is `'original'`, the table displays the original data and is **read-only**. Editing, add, delete, and paste are disabled. Cells render as plain text, not inputs. This matches the behavior of the other views where original mode is display-only (edits go through `update()` which mutates the working copy, not the original).

### Toolbar Adjustments

The re-layout button (`reflow()`) has no effect in table mode. Hide it when `viewMode === 'table'`. Other toolbar controls (view mode toggle, data view toggle, snapshots, employment type filter, export, settings) remain visible and functional.

## Columns

Every editable field in DetailSidebar becomes a column:

| Column | Cell Type | Field Key | Notes |
|--------|-----------|-----------|-------|
| Name | Text input | `name` | |
| Role | Text input | `role` | |
| Discipline | Text input | `discipline` | |
| Team | Text input | `team` | |
| Pod | Dropdown | `pod` | Filtered to pods under person's current manager. Updates when Manager column changes. |
| Manager | Dropdown | `managerId` | Shows manager names, resolved from IDs. Same list as sidebar. |
| Status | Dropdown | `status` | Same status options as sidebar. |
| Employment Type | Text input | `employmentType` | |
| Level | Number input | `level` | Stringified before calling `update()` (fields are `Record<string, string>`). |
| Public Note | Text input | `publicNote` | Truncated display, expands on focus. |
| Private Note | Text input | `privateNote` | Truncated display, expands on focus. |
| Additional Teams | Text input | `additionalTeams` | Comma-separated string, passed as-is to `update()` which handles splitting. |

Plus a non-editable delete button column at the end.

The `id`, `sortIndex`, `warning`, `newRole`, and `newTeam` fields are not shown.

### Cross-Column Dependencies

When the Manager dropdown changes, the Pod dropdown for that row must re-filter to show pods under the new manager. Implementation: when Manager cell saves successfully and the working data updates, the Pod cell's options re-derive from the updated person's `managerId`. If the person's current pod no longer exists under the new manager, the pod field is cleared by the backend's `ReassignPersonPod` logic.

### Column Visibility

A toggle button in the table header area opens a checklist of columns. All visible by default. User toggles hide/show individual columns. State is local — not persisted, resets on page reload.

## Filtering

### Per-Column Filters (Excel-style)

Each column header has a small filter icon. Clicking it opens a dropdown with:
- A text search input at the top (for quickly finding values in long lists)
- Checkboxes for all unique values in that column (all checked by default)

Unchecking values hides those rows. Multiple columns can be filtered simultaneously with AND logic — a row must match all active filters.

Filter state is local — resets when switching views or loading new data.

## Sorting

Clicking a column header cycles: unsorted -> ascending -> descending -> unsorted. Only one column sorted at a time. A small arrow indicator shows the current sort direction. Table-level sort overrides `useSortedPeople` order while active.

Sort state is local — resets when switching views.

## Editing

### Cell Editing

Click a cell to edit. Text inputs activate on click. Dropdowns open on click. On blur (clicking away or Tab), the edit saves via `update(personId, { fieldName: stringValue })`. All values are passed as strings (the backend parses ints for `level`).

Visual feedback: brief green flash on successful save, red flash + revert to previous value on error.

Clicking a cell to edit does **not** trigger person selection (no sidebar opens). The table is self-contained for editing. To open the DetailSidebar for a person from the table, provide a small "expand" icon at the start of each row that triggers `toggleSelect`.

### Keyboard Navigation

- Tab: move focus to next cell in the row
- Shift+Tab: move backward
- Enter: confirm current cell and move down to same column in next row

### Delete

Each row has a delete button (last column). Clicking calls `remove(personId)` — soft-deletes to recycle bin, same as PersonNode delete action.

### Single Row Add

A "+" button in the header area appends a new empty row. The row shows as a "draft" with a subtle visual indicator (e.g., dashed border or light background).

Draft row defaults for required fields:
- `status`: `'Active'`
- `employmentType`: `'FTE'`
- `team`: `''` (or inherited from filter, see below)
- `managerId`: `''`
- `discipline`: `''`
- `additionalTeams`: `[]`

On blur of any cell when `name` is non-empty, calls `add(person)` with the full `Omit<Person, 'id'>` object constructed from the draft row's current values.

### Context-Aware Defaults

New rows (both single add and paste) inherit values from active column filters. If the table is filtered to Team = "Platform" and Status = "Open", new rows pre-fill with those values (overriding the defaults above). This makes bulk-adding 30 people to a specific team easy: filter to the team, then add rows.

### Bulk Add via Paste

Paste tabular data (from Excel/Sheets/CSV) into the table. The table detects multi-row paste, parses rows using the **current visible column order** (left to right), creates draft rows with parsed values (plus context-aware defaults for empty fields), then batch-saves by calling `add()` sequentially for each row.

**Column alignment during paste:** Paste always maps to visible columns in order. If columns are hidden, pasted data maps to the remaining visible columns. A brief toast notification shows "Pasted N rows into [column names]" so the user can verify the mapping. If the paste seems wrong, Ctrl+Z reverts (each add is a separate operation in the undo sense — the user can also delete the rows).

Paste target: select the first cell of an empty draft row, or use a "Paste rows" button in the header area.

## Component Structure

### TableView (`web/src/views/TableView.tsx`)

Top-level view component. Receives `people`, `pods`, and change data as props (same pattern as ColumnView/ManagerView). Contains:
- Column visibility toggle
- Filter state management
- Sort state management
- Add/paste controls
- The `<table>` element with header and body rows

### TableHeader (`web/src/views/TableHeader.tsx`)

Renders column headers with sort indicators and filter icons. Each header cell handles click-to-sort and filter dropdown toggle.

### TableFilterDropdown (`web/src/views/TableFilterDropdown.tsx`)

The per-column filter dropdown. Shows search input + checkbox list of unique values. Manages its own open/closed state.

### TableCell (`web/src/views/TableCell.tsx`)

Renders a single editable cell. Determines cell type (text/number/dropdown) from the column definition. Handles focus, blur, save, and visual feedback (green/red flash). Passes string values to `update()`.

### TableRow (`web/src/views/TableRow.tsx`)

Renders a row of cells for a person. Handles Tab/Enter navigation between cells. Shows diff coloring when in diff mode (row-level). Draft rows (unsaved new rows) get a visual indicator. Includes expand icon for sidebar selection and delete button.

## File Map

### New Files
- `web/src/views/TableView.tsx` — Main table view component
- `web/src/views/TableView.module.css` — Table styles
- `web/src/views/TableHeader.tsx` — Column headers with sort/filter
- `web/src/views/TableFilterDropdown.tsx` — Per-column filter dropdown
- `web/src/views/TableCell.tsx` — Editable cell component
- `web/src/views/TableRow.tsx` — Row component with navigation

### Modified Files
- `web/src/store/orgTypes.ts` — Add `'table'` to `ViewMode`
- `web/src/App.tsx` — Render `TableView` when viewMode is `'table'`
- `web/src/components/Toolbar.tsx` — Add "Table" to view mode toggle, hide reflow button in table mode

## No Backend Changes

TableView uses existing `update()`, `add()`, `remove()` actions and the same `people` data flow. No new endpoints or server-side changes needed.

## Testing

### Frontend

- TableView renders correct columns from working data
- Cell edit triggers `update()` on blur with correct field/value (as string)
- Level cell stringifies number before saving
- Dropdown cells (pod, manager, status) show correct options
- Pod dropdown updates when manager changes in same row
- Per-column filter: checking/unchecking values hides/shows rows
- Filter AND logic: multiple column filters combine correctly
- Column sorting: ascending/descending/reset cycle
- Column visibility toggle hides/shows columns
- Delete button calls `remove()`
- Single row add with "+" button, applies defaults, saves on blur when name filled
- Context-aware defaults: new rows inherit values from active filters
- Paste parsing: multi-row tabular paste creates multiple draft rows
- Paste maps to visible columns in order
- Diff mode: changed rows get color coding (row-level, not cell-level)
- Original mode: table is read-only, no editing/add/delete
- Save feedback: green flash on success, red flash + revert on error
- Tab/Enter navigation between cells
- Draft row visual indicator
- Expand icon triggers person selection for sidebar
- Reflow button hidden in table mode
