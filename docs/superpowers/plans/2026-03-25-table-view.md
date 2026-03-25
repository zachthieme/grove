# Table View Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an editable spreadsheet-style "Table" view as a third view mode, with inline editing, per-column Excel-style filters, column sorting, column visibility, row add/delete, and paste support.

**Architecture:** Pure frontend feature — no backend changes. TableView is a new React component rendered when `viewMode === 'table'`. It receives the same post-filtered, post-sorted `people` array as the other views and uses the existing `update()`, `add()`, `remove()` context actions. The table is decomposed into TableView (orchestrator), TableHeader (sort/filter), TableFilterDropdown, TableCell (editable cell with save feedback), and TableRow (navigation/diff).

**Tech Stack:** React, TypeScript, CSS Modules, vitest.

**Spec:** `docs/superpowers/specs/2026-03-25-table-view-design.md`

---

## File Map

### New Files
- `web/src/views/TableView.tsx` — Main table view: column config, filter/sort/visibility state, add/paste controls, renders header + rows
- `web/src/views/TableView.module.css` — Table styles
- `web/src/views/TableHeader.tsx` — Column headers with sort arrows and filter icons
- `web/src/views/TableFilterDropdown.tsx` — Per-column filter dropdown with search + checkboxes
- `web/src/views/TableCell.tsx` — Single editable cell: text/number/dropdown, blur-to-save, flash feedback
- `web/src/views/TableRow.tsx` — Row component: cells, expand icon, delete button, diff coloring, draft indicator
- `web/src/views/tableColumns.ts` — Column definition config (field key, label, cell type, dropdown options)
- `web/src/views/TableView.test.tsx` — Tests for table view

### Modified Files
- `web/src/store/orgTypes.ts` — Add `'table'` to `ViewMode`
- `web/src/App.tsx` — Render `TableView` when viewMode is `'table'`
- `web/src/components/Toolbar.tsx` — Add "Table" to view mode toggle, hide reflow button in table mode

---

## Task 1: ViewMode Update & Toolbar Wiring

Add `'table'` to ViewMode and wire into toolbar/App.tsx with a placeholder component.

**Files:**
- Modify: `web/src/store/orgTypes.ts`
- Modify: `web/src/components/Toolbar.tsx`
- Modify: `web/src/App.tsx`
- Create: `web/src/views/TableView.tsx` (placeholder)
- Create: `web/src/views/TableView.module.css` (minimal)

- [ ] **Step 1: Add 'table' to ViewMode**

In `web/src/store/orgTypes.ts`, change:
```typescript
export type ViewMode = 'detail' | 'manager'
```
to:
```typescript
export type ViewMode = 'detail' | 'manager' | 'table'
```

- [ ] **Step 2: Add Table to toolbar view modes**

In `web/src/components/Toolbar.tsx`, update the `viewModes` array:
```typescript
const viewModes = [
  { value: 'detail', label: 'Detail' },
  { value: 'manager', label: 'Manager' },
  { value: 'table', label: 'Table' },
] as const
```

Hide the reflow button in table mode. Change:
```tsx
<button className={styles.pill} onClick={() => reflow()} title="Re-layout" aria-label="Re-layout">
  ↻
</button>
```
to:
```tsx
{viewMode !== 'table' && (
  <button className={styles.pill} onClick={() => reflow()} title="Re-layout" aria-label="Re-layout">
    ↻
  </button>
)}
```

- [ ] **Step 3: Create placeholder TableView**

Create `web/src/views/TableView.tsx`:
```tsx
import type { Person, Pod } from '../api/types'
import type { PersonChange } from '../hooks/useOrgDiff'
import styles from './TableView.module.css'

interface TableViewProps {
  people: Person[]
  pods: Pod[]
  selectedIds: Set<string>
  onSelect: (id: string, event?: React.MouseEvent) => void
  changes?: Map<string, PersonChange>
  readOnly?: boolean
}

export default function TableView({ people }: TableViewProps) {
  return (
    <div className={styles.container}>
      <p>Table view — {people.length} people</p>
    </div>
  )
}
```

Create `web/src/views/TableView.module.css`:
```css
.container {
  padding: 16px;
  overflow: auto;
  height: 100%;
}
```

- [ ] **Step 4: Render TableView in App.tsx**

In `web/src/App.tsx`, import TableView:
```typescript
import TableView from './views/TableView'
```

In the view rendering section (around line 147-179), add table case. Change the ternary chain to:
```tsx
{!loaded ? (
  <UploadPrompt />
) : viewMode === 'table' ? (
  <TableView
    people={sortedPeople}
    pods={pods}
    selectedIds={selectedIds}
    onSelect={handleSelect}
    changes={showChanges ? changes : undefined}
    readOnly={dataView === 'original'}
  />
) : viewMode === 'manager' ? (
  ...existing ManagerView...
) : viewMode === 'detail' ? (
  ...existing ColumnView...
) : null}
```

- [ ] **Step 5: Verify**

Run: `cd web && npx tsc --noEmit && npm test -- --run`
Expected: All pass.

- [ ] **Step 6: Commit**

```
feat(web): add table view mode with placeholder component
```

---

## Task 2: Column Definitions & TableCell

Create the column configuration and the editable cell component.

**Files:**
- Create: `web/src/views/tableColumns.ts`
- Create: `web/src/views/TableCell.tsx`

- [ ] **Step 1: Create column definitions**

Create `web/src/views/tableColumns.ts`:
```typescript
import type { Person } from '../api/types'

export type CellType = 'text' | 'number' | 'dropdown'

export interface ColumnDef {
  key: string
  label: string
  cellType: CellType
  /** For dropdowns: a function or static list is provided at render time */
  width?: string
}

// Helper: extract a person field value as string (used by TableRow and TableView for sorting/filtering)
export function getPersonValue(person: Person, key: string): string {
  switch (key) {
    case 'level': return person.level ? String(person.level) : ''
    case 'additionalTeams': return (person.additionalTeams ?? []).join(', ')
    default: return (person as Record<string, unknown>)[key] as string ?? ''
  }
}

export const TABLE_COLUMNS: ColumnDef[] = [
  { key: 'name', label: 'Name', cellType: 'text', width: '160px' },
  { key: 'role', label: 'Role', cellType: 'text', width: '140px' },
  { key: 'discipline', label: 'Discipline', cellType: 'text', width: '120px' },
  { key: 'team', label: 'Team', cellType: 'text', width: '120px' },
  { key: 'pod', label: 'Pod', cellType: 'dropdown', width: '120px' },
  { key: 'managerId', label: 'Manager', cellType: 'dropdown', width: '150px' },
  { key: 'status', label: 'Status', cellType: 'dropdown', width: '120px' },
  { key: 'employmentType', label: 'Emp Type', cellType: 'text', width: '90px' },
  { key: 'level', label: 'Level', cellType: 'number', width: '70px' },
  { key: 'publicNote', label: 'Public Note', cellType: 'text', width: '180px' },
  { key: 'privateNote', label: 'Private Note', cellType: 'text', width: '180px' },
  { key: 'additionalTeams', label: 'Additional Teams', cellType: 'text', width: '150px' },
]
```

- [ ] **Step 2: Create TableCell component**

Create `web/src/views/TableCell.tsx`:
```tsx
import { useState, useRef, useEffect, useCallback } from 'react'
import type { CellType } from './tableColumns'
import styles from './TableView.module.css'

interface TableCellProps {
  value: string
  cellType: CellType
  readOnly?: boolean
  options?: { value: string; label: string }[]
  onSave: (value: string) => Promise<void>
  onTab?: (shift: boolean) => void
  onEnter?: () => void
  cellRef?: (el: HTMLTableCellElement | null) => void
}

export default function TableCell({ value, cellType, readOnly, options, onSave, onTab, onEnter, cellRef }: TableCellProps) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value)
  const [flash, setFlash] = useState<'success' | 'error' | null>(null)
  const inputRef = useRef<HTMLInputElement | HTMLSelectElement | null>(null)

  useEffect(() => { setDraft(value) }, [value])
  useEffect(() => {
    if (flash) {
      const t = setTimeout(() => setFlash(null), 600)
      return () => clearTimeout(t)
    }
  }, [flash])

  const handleSave = useCallback(async () => {
    setEditing(false)
    if (draft === value) return
    try {
      await onSave(draft)
      setFlash('success')
    } catch {
      setDraft(value)
      setFlash('error')
    }
  }, [draft, value, onSave])

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Tab') {
      e.preventDefault()
      handleSave()
      onTab?.(e.shiftKey)
    } else if (e.key === 'Enter') {
      e.preventDefault()
      handleSave()
      onEnter?.()
    } else if (e.key === 'Escape') {
      setDraft(value)
      setEditing(false)
    }
  }, [handleSave, onTab, onEnter, value])

  const flashClass = flash === 'success' ? styles.flashSuccess : flash === 'error' ? styles.flashError : ''

  if (readOnly) {
    return (
      <td ref={cellRef} className={`${styles.cell} ${flashClass}`}>
        <span className={styles.cellText}>{cellType === 'dropdown' ? (options?.find(o => o.value === value)?.label ?? value) : value}</span>
      </td>
    )
  }

  if (!editing) {
    return (
      <td ref={cellRef} className={`${styles.cell} ${flashClass}`} onClick={() => setEditing(true)}>
        <span className={styles.cellText}>
          {cellType === 'dropdown' ? (options?.find(o => o.value === value)?.label ?? value) : value}
        </span>
      </td>
    )
  }

  if (cellType === 'dropdown') {
    return (
      <td ref={cellRef} className={`${styles.cell} ${styles.cellEditing}`}>
        <select
          ref={el => { inputRef.current = el }}
          className={styles.cellInput}
          value={draft}
          onChange={e => { setDraft(e.target.value); }}
          onBlur={handleSave}
          onKeyDown={handleKeyDown}
          autoFocus
        >
          <option value="">—</option>
          {options?.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      </td>
    )
  }

  return (
    <td ref={cellRef} className={`${styles.cell} ${styles.cellEditing}`}>
      <input
        ref={el => { inputRef.current = el }}
        className={styles.cellInput}
        type={cellType === 'number' ? 'number' : 'text'}
        value={draft}
        onChange={e => setDraft(e.target.value)}
        onBlur={handleSave}
        onKeyDown={handleKeyDown}
        autoFocus
      />
    </td>
  )
}
```

- [ ] **Step 3: Add cell styles to TableView.module.css**

Append to `web/src/views/TableView.module.css`:
```css
.table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.85rem;
}

.cell {
  border: 1px solid var(--border, #e5e7eb);
  padding: 4px 8px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 200px;
  cursor: pointer;
  transition: background-color 0.3s;
}

.cellText {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
}

.cellEditing {
  padding: 2px 4px;
  background: var(--bg-input, #f9fafb);
}

.cellInput {
  width: 100%;
  border: 1px solid var(--accent, #3b82f6);
  border-radius: 2px;
  padding: 2px 4px;
  font-size: inherit;
  font-family: inherit;
  outline: none;
}

.flashSuccess {
  background-color: rgba(34, 197, 94, 0.15);
}

.flashError {
  background-color: rgba(239, 68, 68, 0.15);
}
```

- [ ] **Step 4: Verify**

Run: `cd web && npx tsc --noEmit`
Expected: Clean.

- [ ] **Step 5: Commit**

```
feat(web): add column definitions and TableCell component
```

---

## Task 3: TableRow & Basic Table Rendering

Wire TableRow into TableView, rendering all columns with working inline editing.

**Files:**
- Create: `web/src/views/TableRow.tsx`
- Modify: `web/src/views/TableView.tsx`

- [ ] **Step 1: Create TableRow**

Create `web/src/views/TableRow.tsx`:
```tsx
import { useCallback, useRef } from 'react'
import type { Person, Pod } from '../api/types'
import type { PersonChange } from '../hooks/useOrgDiff'
import type { ColumnDef } from './tableColumns'
import TableCell from './TableCell'
import { STATUSES } from '../constants'
import styles from './TableView.module.css'

interface TableRowProps {
  person: Person
  columns: ColumnDef[]
  pods: Pod[]
  managers: { value: string; label: string }[]
  change?: PersonChange
  readOnly?: boolean
  onUpdate: (personId: string, field: string, value: string) => Promise<void>
  onDelete: (personId: string) => void
  onExpand: (personId: string) => void
  isDraft?: boolean
}

// Import getPersonValue from tableColumns.ts (shared between TableRow and TableView)
import { getPersonValue } from './tableColumns'

function getDropdownOptions(key: string, person: Person, pods: Pod[], managers: { value: string; label: string }[]): { value: string; label: string }[] | undefined {
  switch (key) {
    case 'status':
      return STATUSES.map(s => ({ value: s, label: s }))
    case 'managerId':
      return managers
    case 'pod':
      return pods
        .filter(p => p.managerId === person.managerId)
        .map(p => ({ value: p.name, label: p.name }))
    default:
      return undefined
  }
}

export default function TableRow({ person, columns, pods, managers, change, readOnly, onUpdate, onDelete, onExpand, isDraft }: TableRowProps) {
  const cellRefs = useRef<(HTMLTableCellElement | null)[]>([])

  const handleTab = useCallback((colIdx: number, shift: boolean) => {
    const next = shift ? colIdx - 1 : colIdx + 1
    if (next >= 0 && next < columns.length) {
      cellRefs.current[next]?.click()
    }
  }, [columns.length])

  // Enter navigation requires coordination at TableView level.
  // TableRow accepts an onEnterNav prop that TableView provides:
  // onEnterNav(personId, colKey) → focuses the same column in the next row.

  const diffClass = change
    ? change.types.has('added') ? styles.rowAdded
    : change.types.has('removed') ? styles.rowRemoved
    : change.types.has('reporting') ? styles.rowReporting
    : change.types.has('title') ? styles.rowTitle
    : change.types.has('reorg') ? styles.rowReorg
    : change.types.has('pod') ? styles.rowPod
    : ''
    : ''

  return (
    <tr className={`${styles.row} ${diffClass} ${isDraft ? styles.rowDraft : ''}`}>
      <td className={styles.expandCell}>
        <button className={styles.expandBtn} onClick={() => onExpand(person.id)} title="Open in sidebar">
          ⤢
        </button>
      </td>
      {columns.map((col, i) => (
        <TableCell
          key={col.key}
          value={getPersonValue(person, col.key)}
          cellType={col.cellType}
          readOnly={readOnly}
          options={getDropdownOptions(col.key, person, pods, managers)}
          onSave={async (v) => onUpdate(person.id, col.key, v)}
          onTab={(shift) => handleTab(i, shift)}
          cellRef={(el) => { cellRefs.current[i] = el }}
        />
      ))}
      <td className={styles.deleteCell}>
        {!readOnly && (
          <button className={styles.deleteBtn} onClick={() => onDelete(person.id)} title="Delete">
            ×
          </button>
        )}
      </td>
    </tr>
  )
}
```

- [ ] **Step 2: Update TableView to render full table**

Replace the placeholder `TableView.tsx` with the full implementation (without filter/sort/add/paste for now — those come in later tasks):

```tsx
import { useMemo, useCallback } from 'react'
import type { Person, Pod } from '../api/types'
import type { PersonChange } from '../hooks/useOrgDiff'
import { useOrg } from '../store/OrgContext'
import { TABLE_COLUMNS } from './tableColumns'
import TableRow from './TableRow'
import styles from './TableView.module.css'

interface TableViewProps {
  people: Person[]
  pods: Pod[]
  selectedIds: Set<string>
  onSelect: (id: string, event?: React.MouseEvent) => void
  changes?: Map<string, PersonChange>
  readOnly?: boolean
}

export default function TableView({ people, pods, changes, readOnly }: TableViewProps) {
  const { update, remove, toggleSelect, working } = useOrg()

  const managers = useMemo(() => {
    const managerIds = new Set(working.filter(p => p.managerId).map(p => p.managerId))
    return working
      .filter(p => managerIds.has(p.id))
      .sort((a, b) => a.name.localeCompare(b.name))
      .map(p => ({ value: p.id, label: p.name }))
  }, [working])

  const handleUpdate = useCallback(async (personId: string, field: string, value: string) => {
    await update(personId, { [field]: value })
  }, [update])

  const handleDelete = useCallback(async (personId: string) => {
    await remove(personId)
  }, [remove])

  const handleExpand = useCallback((personId: string) => {
    toggleSelect(personId, false)
  }, [toggleSelect])

  const columns = TABLE_COLUMNS

  return (
    <div className={styles.container}>
      <div className={styles.toolbar}>
        <span className={styles.rowCount}>{people.length} people</span>
      </div>
      <div className={styles.tableWrapper}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th className={styles.headerCell} style={{ width: '32px' }} />
              {columns.map(col => (
                <th key={col.key} className={styles.headerCell} style={{ width: col.width }}>
                  {col.label}
                </th>
              ))}
              <th className={styles.headerCell} style={{ width: '40px' }} />
            </tr>
          </thead>
          <tbody>
            {people.map(person => (
              <TableRow
                key={person.id}
                person={person}
                columns={columns}
                pods={pods}
                managers={managers}
                change={changes?.get(person.id)}
                readOnly={readOnly}
                onUpdate={handleUpdate}
                onDelete={handleDelete}
                onExpand={handleExpand}
              />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Add remaining styles to TableView.module.css**

Append:
```css
.toolbar {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 0;
}

.rowCount {
  font-size: 0.8rem;
  color: var(--text-secondary, #6b7280);
}

.tableWrapper {
  overflow: auto;
  max-height: calc(100vh - 160px);
}

.headerCell {
  position: sticky;
  top: 0;
  background: var(--bg-secondary, #f3f4f6);
  /* position: relative needed for filter dropdown positioning */
  border: 1px solid var(--border, #e5e7eb);
  padding: 6px 8px;
  text-align: left;
  font-weight: 600;
  font-size: 0.8rem;
  white-space: nowrap;
  z-index: 1;
}

.row:hover {
  background: var(--bg-hover, #f9fafb);
}

.expandCell, .deleteCell {
  border: 1px solid var(--border, #e5e7eb);
  padding: 2px;
  text-align: center;
  width: 32px;
}

.expandBtn, .deleteBtn {
  background: none;
  border: none;
  cursor: pointer;
  font-size: 0.9rem;
  color: var(--text-secondary, #9ca3af);
  padding: 2px 4px;
  border-radius: 2px;
}

.expandBtn:hover { color: var(--accent, #3b82f6); }
.deleteBtn:hover { color: var(--danger, #ef4444); }

.rowDraft {
  background: var(--bg-draft, #fffbeb);
  border-left: 2px dashed var(--warning, #f59e0b);
}

.rowAdded { background: rgba(34, 197, 94, 0.08); }
.rowRemoved { background: rgba(239, 68, 68, 0.08); text-decoration: line-through; }
.rowReporting { background: rgba(59, 130, 246, 0.08); }
.rowTitle { background: rgba(168, 85, 247, 0.08); }
.rowReorg { background: rgba(245, 158, 11, 0.08); }
.rowPod { background: rgba(20, 184, 166, 0.08); }
```

- [ ] **Step 4: Verify**

Run: `cd web && npx tsc --noEmit && npm test -- --run`
Expected: All pass.

- [ ] **Step 5: Commit**

```
feat(web): add TableRow and render editable table
```

---

## Task 4: Column Sorting & Column Visibility

Add click-to-sort on headers and column visibility toggle.

**Files:**
- Create: `web/src/views/TableHeader.tsx`
- Modify: `web/src/views/TableView.tsx`

- [ ] **Step 1: Create TableHeader**

Create `web/src/views/TableHeader.tsx`:
```tsx
import type { ColumnDef } from './tableColumns'
import styles from './TableView.module.css'

type SortDir = 'asc' | 'desc' | null

interface TableHeaderProps {
  columns: ColumnDef[]
  sortKey: string | null
  sortDir: SortDir
  onSort: (key: string) => void
  filterActive: Set<string>
  onFilterClick: (key: string) => void
}

export default function TableHeader({ columns, sortKey, sortDir, onSort, filterActive, onFilterClick }: TableHeaderProps) {
  return (
    <tr>
      <th className={styles.headerCell} style={{ width: '32px' }} />
      {columns.map(col => (
        <th key={col.key} className={styles.headerCell} style={{ width: col.width }}>
          <div className={styles.headerContent}>
            <span className={styles.headerLabel} onClick={() => onSort(col.key)}>
              {col.label}
              {sortKey === col.key && (
                <span className={styles.sortArrow}>{sortDir === 'asc' ? ' ▲' : ' ▼'}</span>
              )}
            </span>
            <button
              className={`${styles.filterBtn} ${filterActive.has(col.key) ? styles.filterActive : ''}`}
              onClick={(e) => { e.stopPropagation(); onFilterClick(col.key) }}
              title={`Filter ${col.label}`}
            >
              ▼
            </button>
          </div>
        </th>
      ))}
      <th className={styles.headerCell} style={{ width: '40px' }} />
    </tr>
  )
}
```

- [ ] **Step 2: Add sort and visibility state to TableView**

In `web/src/views/TableView.tsx`, add state for sorting and column visibility:

```typescript
const [sortKey, setSortKey] = useState<string | null>(null)
const [sortDir, setSortDir] = useState<'asc' | 'desc' | null>(null)
const [hiddenCols, setHiddenCols] = useState<Set<string>>(new Set())
const [showColToggle, setShowColToggle] = useState(false)
```

Add sort cycling handler:
```typescript
const handleSort = useCallback((key: string) => {
  if (sortKey === key) {
    if (sortDir === 'asc') setSortDir('desc')
    else if (sortDir === 'desc') { setSortKey(null); setSortDir(null) }
  } else {
    setSortKey(key)
    setSortDir('asc')
  }
}, [sortKey, sortDir])
```

Add sorted/filtered people computation:
```typescript
const visibleColumns = useMemo(() => TABLE_COLUMNS.filter(c => !hiddenCols.has(c.key)), [hiddenCols])

const sortedPeople = useMemo(() => {
  if (!sortKey || !sortDir) return people
  const sorted = [...people]
  sorted.sort((a, b) => {
    const aVal = getPersonValue(a, sortKey)
    const bVal = getPersonValue(b, sortKey)
    const cmp = aVal.localeCompare(bVal, undefined, { numeric: true })
    return sortDir === 'asc' ? cmp : -cmp
  })
  return sorted
}, [people, sortKey, sortDir])
```

Move `getPersonValue` to `tableColumns.ts` so both TableView and TableRow can use it.

Add column visibility toggle UI in the toolbar area:
```tsx
<button className={styles.colToggleBtn} onClick={() => setShowColToggle(v => !v)}>
  Columns ▾
</button>
{showColToggle && (
  <div className={styles.colToggleDropdown}>
    {TABLE_COLUMNS.map(col => (
      <label key={col.key} className={styles.colToggleItem}>
        <input
          type="checkbox"
          checked={!hiddenCols.has(col.key)}
          onChange={() => setHiddenCols(prev => {
            const next = new Set(prev)
            next.has(col.key) ? next.delete(col.key) : next.add(col.key)
            return next
          })}
        />
        {col.label}
      </label>
    ))}
  </div>
)}
```

Replace the `<thead>` with `<TableHeader>` component.

- [ ] **Step 3: Add header styles**

Append to `TableView.module.css`:
```css
.headerContent {
  display: flex;
  align-items: center;
  gap: 4px;
}

.headerLabel {
  cursor: pointer;
  flex: 1;
  user-select: none;
}

.sortArrow {
  font-size: 0.7rem;
}

.filterBtn {
  background: none;
  border: none;
  cursor: pointer;
  font-size: 0.6rem;
  color: var(--text-secondary, #9ca3af);
  padding: 2px;
  opacity: 0.5;
}

.filterBtn:hover, .filterActive {
  opacity: 1;
  color: var(--accent, #3b82f6);
}

.colToggleBtn {
  font-size: 0.8rem;
  padding: 4px 8px;
  border: 1px solid var(--border, #e5e7eb);
  border-radius: 4px;
  background: var(--bg-primary, #fff);
  cursor: pointer;
}

.colToggleDropdown {
  position: absolute;
  background: var(--bg-primary, #fff);
  border: 1px solid var(--border, #e5e7eb);
  border-radius: 4px;
  padding: 8px;
  box-shadow: 0 4px 12px rgba(0,0,0,0.1);
  z-index: 10;
}

.colToggleItem {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 0;
  font-size: 0.8rem;
  cursor: pointer;
}
```

- [ ] **Step 4: Verify**

Run: `cd web && npx tsc --noEmit && npm test -- --run`
Expected: All pass.

- [ ] **Step 5: Commit**

```
feat(web): add column sorting and visibility toggle to table view
```

---

## Task 5: Per-Column Filters (Excel-style)

Add per-column filter dropdowns with search + checkboxes.

**Files:**
- Create: `web/src/views/TableFilterDropdown.tsx`
- Modify: `web/src/views/TableView.tsx`

- [ ] **Step 1: Create TableFilterDropdown**

Create `web/src/views/TableFilterDropdown.tsx`:
```tsx
import { useState, useMemo, useRef, useEffect } from 'react'
import styles from './TableView.module.css'

interface TableFilterDropdownProps {
  columnKey: string
  values: string[]
  selected: Set<string>
  onSelectionChange: (columnKey: string, selected: Set<string>) => void
  onClose: () => void
}

export default function TableFilterDropdown({ columnKey, values, selected, onSelectionChange, onClose }: TableFilterDropdownProps) {
  const [search, setSearch] = useState('')
  const ref = useRef<HTMLDivElement>(null)

  const uniqueValues = useMemo(() =>
    Array.from(new Set(values)).sort((a, b) => a.localeCompare(b)),
    [values]
  )

  const filtered = useMemo(() =>
    search ? uniqueValues.filter(v => v.toLowerCase().includes(search.toLowerCase())) : uniqueValues,
    [uniqueValues, search]
  )

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [onClose])

  const allSelected = filtered.every(v => selected.has(v))

  const toggleAll = () => {
    const next = new Set(selected)
    if (allSelected) {
      filtered.forEach(v => next.delete(v))
    } else {
      filtered.forEach(v => next.add(v))
    }
    onSelectionChange(columnKey, next)
  }

  const toggleOne = (value: string) => {
    const next = new Set(selected)
    next.has(value) ? next.delete(value) : next.add(value)
    onSelectionChange(columnKey, next)
  }

  return (
    <div ref={ref} className={styles.filterDropdown}>
      <input
        className={styles.filterSearch}
        type="text"
        placeholder="Search..."
        value={search}
        onChange={e => setSearch(e.target.value)}
        autoFocus
      />
      <label className={styles.filterItem}>
        <input type="checkbox" checked={allSelected} onChange={toggleAll} />
        <strong>(Select All)</strong>
      </label>
      <div className={styles.filterList}>
        {filtered.map(v => (
          <label key={v} className={styles.filterItem}>
            <input type="checkbox" checked={selected.has(v)} onChange={() => toggleOne(v)} />
            {v || <em>(empty)</em>}
          </label>
        ))}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Wire filters into TableView**

Add filter state:
```typescript
// Map from column key to the set of CHECKED values (visible)
const [columnFilters, setColumnFilters] = useState<Map<string, Set<string>>>(new Map())
const [openFilter, setOpenFilter] = useState<string | null>(null)
```

When a filter dropdown opens for a column with no existing filter entry, initialize `selected` to all unique values for that column (so everything starts checked):
```typescript
const handleFilterClick = useCallback((key: string) => {
  if (openFilter === key) { setOpenFilter(null); return }
  // Initialize filter with all values if not yet set
  if (!columnFilters.has(key)) {
    const allVals = new Set(people.map(p => getPersonValue(p, key)))
    setColumnFilters(prev => new Map(prev).set(key, allVals))
  }
  setOpenFilter(key)
}, [openFilter, columnFilters, people])
```

Build the filter-active set for TableHeader:
```typescript
const filterActive = useMemo(() => {
  const active = new Set<string>()
  for (const [key, selected] of columnFilters) {
    const allValues = new Set(people.map(p => getPersonValue(p, key)))
    if (selected.size < allValues.size) active.add(key)
  }
  return active
}, [columnFilters, people])
```

Apply filters after sorting:
```typescript
const filteredPeople = useMemo(() => {
  if (columnFilters.size === 0) return sortedPeople
  return sortedPeople.filter(person => {
    for (const [key, selected] of columnFilters) {
      const val = getPersonValue(person, key)
      if (!selected.has(val)) return false
    }
    return true
  })
}, [sortedPeople, columnFilters])
```

Render `filteredPeople` in the table body instead of `sortedPeople`. Update the row count display.

Render `TableFilterDropdown` when `openFilter` is set (positioned relative to the header cell).

- [ ] **Step 3: Add filter styles**

Append to `TableView.module.css`:
```css
.filterDropdown {
  position: absolute;
  top: 100%;
  left: 0;
  background: var(--bg-primary, #fff);
  border: 1px solid var(--border, #e5e7eb);
  border-radius: 4px;
  padding: 8px;
  min-width: 180px;
  max-height: 300px;
  box-shadow: 0 4px 12px rgba(0,0,0,0.15);
  z-index: 20;
}

.filterSearch {
  width: 100%;
  padding: 4px 8px;
  border: 1px solid var(--border, #e5e7eb);
  border-radius: 4px;
  font-size: 0.8rem;
  margin-bottom: 6px;
  outline: none;
}

.filterList {
  max-height: 200px;
  overflow-y: auto;
}

.filterItem {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 3px 0;
  font-size: 0.8rem;
  cursor: pointer;
}
```

- [ ] **Step 4: Verify**

Run: `cd web && npx tsc --noEmit && npm test -- --run`
Expected: All pass.

- [ ] **Step 5: Commit**

```
feat(web): add per-column Excel-style filters to table view
```

---

## Task 6: Add Row & Context-Aware Defaults

Add single-row add and bulk paste support.

**Files:**
- Modify: `web/src/views/TableView.tsx`

- [ ] **Step 1: Add draft row state and add button**

In TableView, add draft row management:
```typescript
interface DraftRow {
  id: string // temp ID
  values: Record<string, string>
}

const [drafts, setDrafts] = useState<DraftRow[]>([])

const contextDefaults = useMemo(() => {
  const defaults: Record<string, string> = {}
  for (const [key, selected] of columnFilters) {
    if (selected.size === 1) {
      defaults[key] = Array.from(selected)[0]
    }
  }
  return defaults
}, [columnFilters])

const addDraftRow = useCallback(() => {
  const id = `draft-${Date.now()}`
  const values: Record<string, string> = {
    name: '', role: '', discipline: '', team: '', pod: '',
    managerId: '', status: 'Active', employmentType: 'FTE',
    level: '', publicNote: '', privateNote: '', additionalTeams: '',
    ...contextDefaults,
  }
  setDrafts(prev => [...prev, { id, values }])
}, [contextDefaults])
```

Add "+" button and "Paste rows" button to the toolbar:
```tsx
{!readOnly && (
  <>
    <button className={styles.addBtn} onClick={addDraftRow} title="Add row">+</button>
    <button className={styles.addBtn} onClick={handlePaste} title="Paste rows">Paste</button>
  </>
)}
```

- [ ] **Step 2: Render draft rows**

After the people rows in `<tbody>`, render draft rows:
```tsx
{drafts.map(draft => (
  <DraftTableRow
    key={draft.id}
    draft={draft}
    columns={visibleColumns}
    pods={pods}
    managers={managers}
    onUpdate={(field, value) => {
      setDrafts(prev => prev.map(d =>
        d.id === draft.id ? { ...d, values: { ...d.values, [field]: value } } : d
      ))
    }}
    onSave={async () => {
      if (!draft.values.name) return
      await add({
        name: draft.values.name,
        role: draft.values.role,
        discipline: draft.values.discipline,
        team: draft.values.team,
        managerId: draft.values.managerId,
        status: (draft.values.status || 'Active') as Person['status'],
        additionalTeams: draft.values.additionalTeams ? draft.values.additionalTeams.split(',').map(s => s.trim()).filter(Boolean) : [],
        employmentType: draft.values.employmentType || 'FTE',
        level: draft.values.level ? parseInt(draft.values.level) : undefined,
        pod: draft.values.pod,
        publicNote: draft.values.publicNote,
        privateNote: draft.values.privateNote,
      })
      setDrafts(prev => prev.filter(d => d.id !== draft.id))
    }}
    onDiscard={() => setDrafts(prev => prev.filter(d => d.id !== draft.id))}
  />
))}
```

For draft rows, render a `<tr>` directly in TableView with inline editable cells. Each cell is a controlled input updating draft state via `onUpdate`. On blur of any cell, check if `draft.values.name` is non-empty — if so, call `onSave`. Add a discard "×" button at the end. This is simpler than reusing `TableRow` since drafts don't call `update()` per-cell — they accumulate local state and save once.

Also extract the `Omit<Person, 'id'>` construction into a helper `draftToPerson(values: Record<string, string>)` to avoid duplication between single-add and paste flows:

```typescript
function draftToPerson(values: Record<string, string>): Omit<Person, 'id'> {
  return {
    name: values.name,
    role: values.role,
    discipline: values.discipline,
    team: values.team,
    managerId: values.managerId,
    status: (values.status || 'Active') as Person['status'],
    additionalTeams: values.additionalTeams ? values.additionalTeams.split(',').map(s => s.trim()).filter(Boolean) : [],
    employmentType: values.employmentType || 'FTE',
    level: values.level ? parseInt(values.level) : undefined,
    pod: values.pod,
    publicNote: values.publicNote,
    privateNote: values.privateNote,
  }
}
```

- [ ] **Step 3: Add paste handler**

```typescript
const handlePaste = useCallback(async () => {
  try {
    const text = await navigator.clipboard.readText()
    const lines = text.split('\n').filter(l => l.trim())
    if (lines.length === 0) return

    const cols = visibleColumns
    const newDrafts: DraftRow[] = lines.map((line, i) => {
      const cells = line.split('\t')
      const values: Record<string, string> = {
        name: '', role: '', discipline: '', team: '', pod: '',
        managerId: '', status: 'Active', employmentType: 'FTE',
        level: '', publicNote: '', privateNote: '', additionalTeams: '',
        ...contextDefaults,
      }
      cells.forEach((cell, j) => {
        if (j < cols.length) {
          values[cols[j].key] = cell.trim()
        }
      })
      return { id: `paste-${Date.now()}-${i}`, values }
    })

    // Auto-save drafts with names
    for (const draft of newDrafts) {
      if (draft.values.name) {
        await add({
          name: draft.values.name,
          role: draft.values.role,
          discipline: draft.values.discipline,
          team: draft.values.team,
          managerId: draft.values.managerId,
          status: (draft.values.status || 'Active') as Person['status'],
          additionalTeams: draft.values.additionalTeams ? draft.values.additionalTeams.split(',').map(s => s.trim()).filter(Boolean) : [],
          employmentType: draft.values.employmentType || 'FTE',
          level: draft.values.level ? parseInt(draft.values.level) : undefined,
          pod: draft.values.pod,
          publicNote: draft.values.publicNote,
          privateNote: draft.values.privateNote,
        })
      }
    }
  } catch {
    // Clipboard API may fail — ignore
  }
}, [visibleColumns, contextDefaults, add])
```

- [ ] **Step 4: Add button styles**

Append to `TableView.module.css`:
```css
.addBtn {
  font-size: 0.85rem;
  padding: 4px 12px;
  border: 1px solid var(--border, #e5e7eb);
  border-radius: 4px;
  background: var(--bg-primary, #fff);
  cursor: pointer;
}

.addBtn:hover {
  background: var(--bg-hover, #f9fafb);
}
```

- [ ] **Step 5: Verify**

Run: `cd web && npx tsc --noEmit && npm test -- --run`
Expected: All pass.

- [ ] **Step 6: Commit**

```
feat(web): add row creation and paste support to table view
```

---

## Task 7: Tests

Add comprehensive tests for the table view.

**Files:**
- Create: `web/src/views/TableView.test.tsx`

- [ ] **Step 1: Write tests**

Create `web/src/views/TableView.test.tsx` with tests covering:

1. **Renders columns** — TableView shows expected column headers
2. **Renders people data** — TableView shows person name/role/team in cells
3. **Read-only in original mode** — when readOnly=true, cells are not editable
4. **Column visibility** — hidden columns don't render
5. **Diff mode row coloring** — rows with changes get appropriate CSS classes
6. **Filter hides rows** — after filtering a column, matching rows are hidden
7. **Sort by column** — clicking header sorts data

Use the testing patterns from existing view tests. Mock `useOrg` to provide `update`, `remove`, `toggleSelect`, `working`, `pods`, `settings`.

- [ ] **Step 2: Run tests**

Run: `cd web && npm test -- --run`
Expected: All pass.

- [ ] **Step 3: Full build verification**

Run: `make clean && make build`
Expected: Clean build.

- [ ] **Step 4: Commit**

```
test(web): add table view tests
```
