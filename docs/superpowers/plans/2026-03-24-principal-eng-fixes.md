# Principal Engineer Review Fixes — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix all 6 issues from the principal engineer codebase review: constants extraction, view deduplication, accessibility, API client hardening, snapshot error surfacing, and component test coverage.

**Architecture:** Constants first (referenced by later tasks), then view deduplication (restructures components before a11y/tests touch them), then accessibility, API client, backend error surfacing, and finally tests that validate the final state.

**Tech Stack:** Go 1.25, React 19, TypeScript, @dnd-kit/core, Vitest, CSS Modules

---

## File Structure

| Action | Path | Responsibility |
|--------|------|----------------|
| Create | `web/src/constants.ts` | Magic strings, status types, sentinel values |
| Create | `web/src/views/OrphanGroup.tsx` | Shared orphan-by-team rendering |
| Modify | `web/src/views/ColumnView.tsx` | Import OrphanGroup, remove duplicated orphan logic |
| Modify | `web/src/views/ManagerView.tsx` | Import OrphanGroup, remove duplicated orphan logic |
| Modify | `web/src/grove.css` | Add `.sr-only` utility class |
| Modify | `web/src/components/PersonNode.tsx` | Add sr-only text for status emojis, aria-selected |
| Modify | `web/src/components/NodeActions.tsx` | Add aria-label to icon buttons |
| Modify | `web/src/components/DetailSidebar.tsx` | Use constants, add aria-label to close/save buttons |
| Modify | `web/src/components/Toolbar.tsx` | aria-label on icon buttons, aria-expanded on dropdowns |
| Modify | `web/src/components/SnapshotsDropdown.tsx` | aria-expanded, aria-label on delete buttons |
| Modify | `web/src/components/EmploymentTypeFilter.tsx` | aria-expanded, aria-checked on checkboxes |
| Modify | `web/src/components/RecycleBinDrawer.tsx` | role=complementary, aria-label |
| Modify | `web/src/components/RecycleBinButton.tsx` | aria-label, aria-pressed |
| Modify | `web/src/components/AutosaveBanner.tsx` | role=alert |
| Modify | `web/src/App.tsx` | role=alert on error banners, aria-live region |
| Modify | `web/src/views/shared.tsx` | aria-grabbed on draggable nodes |
| Modify | `web/src/api/client.ts` | Add timeout wrapper, AbortSignal support |
| Modify | `web/src/hooks/useDragDrop.ts` | Use constants for team prefix |
| Modify | `internal/api/service.go` | Return persistence warnings from Upload/ConfirmMapping |
| Modify | `internal/api/model.go` | Add PersistenceWarning to UploadResponse and OrgData |
| Modify | `internal/api/handlers.go` | Log persistence warnings in responses |
| Modify | `web/src/api/types.ts` | Add persistenceWarning to response types |
| Modify | `web/src/store/OrgDataContext.tsx` | Surface persistence warnings via setError |
| Create | `web/src/components/DetailSidebar.test.tsx` | DetailSidebar tests |
| Create | `web/src/views/ColumnView.test.tsx` | ColumnView tests |
| Create | `web/src/views/ManagerView.test.tsx` | ManagerView tests |

---

### Task 1: Extract Magic Strings to Constants

**Files:**
- Create: `web/src/constants.ts`
- Modify: `web/src/hooks/useDragDrop.ts`
- Modify: `web/src/components/DetailSidebar.tsx`

- [ ] **Step 1: Create constants file**

```typescript
// web/src/constants.ts

/** Drop target prefix for team-based drops */
export const TEAM_DROP_PREFIX = 'team::'

/** Internal snapshot name used during export */
export const EXPORT_TEMP_SNAPSHOT = '__export_temp__'

/** Sentinel value for mixed batch fields */
export const MIXED_VALUE = '__mixed__'

/** All valid person statuses */
export const STATUSES = [
  'Active', 'Open', 'Pending Open', 'Transfer In', 'Transfer Out', 'Backfill', 'Planned',
] as const

/** Human-readable descriptions for each status */
export const STATUS_DESCRIPTIONS: Record<string, string> = {
  'Active': 'Currently filled and working',
  'Open': 'Approved headcount, actively recruiting',
  'Pending Open': 'Headcount requested, not yet approved',
  'Transfer In': 'Person coming from another team/org',
  'Transfer Out': 'Person leaving to another team/org',
  'Backfill': 'Replacing someone who left',
  'Planned': 'Future role in a reorg, not yet active',
}
```

- [ ] **Step 2: Update useDragDrop.ts to use TEAM_DROP_PREFIX**

Replace `targetId.startsWith('team::')` with `targetId.startsWith(TEAM_DROP_PREFIX)` and `targetId.slice(6)` with `targetId.slice(TEAM_DROP_PREFIX.length)`. Add import.

- [ ] **Step 3: Update DetailSidebar.tsx to use constants**

Replace the local `STATUSES`, `STATUS_DESCRIPTIONS`, and `MIXED` constants with imports from `../constants`. Remove the local definitions.

- [ ] **Step 4: Run tests to verify nothing broke**

Run: `cd web && npm test`

- [ ] **Step 5: Commit**

```bash
jj commit -m "refactor: extract magic strings to constants.ts"
```

---

### Task 2: Extract Shared Orphan Group Component

**Files:**
- Create: `web/src/views/OrphanGroup.tsx`
- Modify: `web/src/views/ColumnView.tsx`
- Modify: `web/src/views/ManagerView.tsx`

- [ ] **Step 1: Create OrphanGroup component**

Extract the orphan-by-team grouping logic shared between ColumnView (lines 292-354) and ManagerView (lines 207-269) into a reusable component:

```tsx
// web/src/views/OrphanGroup.tsx
import type { Person } from '../api/types'
import type { PersonChange } from '../hooks/useOrgDiff'
import type { OrgNode } from './shared'
import { DraggableNode } from './shared'

interface OrphanGroupProps {
  orphans: OrgNode[]
  roots: OrgNode[]
  selectedIds: Set<string>
  onSelect: (id: string, event?: React.MouseEvent) => void
  changes?: Map<string, PersonChange>
  setNodeRef: (id: string) => (el: HTMLDivElement | null) => void
  managerSet?: Set<string>
  onAddReport?: (id: string) => void
  onDeletePerson?: (id: string) => void
  onInfo?: (id: string) => void
  /** CSS module styles — keys: subtree, nodeSlot, teamHeader, children, and optionally icStack */
  styles: Record<string, string>
  /** Optional: render a single orphan as a full subtree component */
  renderSubtree: (node: OrgNode) => React.ReactNode
  /** Optional: team header component override (ColumnView uses TeamHeaderNode) */
  renderTeamHeader?: (team: string, memberCount: number) => React.ReactNode
  /** Wrap members in an icStack div? true for ColumnView, false for ManagerView */
  wrapInIcStack?: boolean
}

export function OrphanGroup({
  orphans, roots, selectedIds, onSelect, changes, setNodeRef,
  managerSet, onAddReport, onDeletePerson, onInfo,
  styles, renderSubtree, renderTeamHeader, wrapInIcStack = true,
}: OrphanGroupProps) {
  if (orphans.length === 0) return null

  const renderOrphanNode = (child: OrgNode) => (
    <div key={child.person.id} className={styles.nodeSlot}>
      <DraggableNode
        person={child.person}
        selected={selectedIds.has(child.person.id)}
        changes={changes?.get(child.person.id)}
        isManager={managerSet?.has(child.person.id)}
        onAdd={onAddReport ? () => onAddReport(child.person.id) : undefined}
        onDelete={onDeletePerson ? () => onDeletePerson(child.person.id) : undefined}
        onInfo={onInfo ? () => onInfo(child.person.id) : undefined}
        onSelect={(e) => onSelect(child.person.id, e)}
        nodeRef={setNodeRef(child.person.id)}
      />
    </div>
  )

  // Single orphan root (likely the only person) — render as normal subtree
  if (orphans.length === 1 && roots.length === 1) {
    return <>{renderSubtree(orphans[0])}</>
  }

  // Group orphans by team
  const teamOrder: string[] = []
  const teamMap = new Map<string, OrgNode[]>()
  for (const o of orphans) {
    const team = o.person.team || 'Unassigned'
    if (!teamMap.has(team)) {
      teamOrder.push(team)
      teamMap.set(team, [])
    }
    teamMap.get(team)!.push(o)
  }

  return (
    <>
      {teamOrder.map((team) => {
        const members = teamMap.get(team)!
        return (
          <div key={`orphan-${team}`} className={styles.subtree}>
            <div className={styles.nodeSlot}>
              {renderTeamHeader ? renderTeamHeader(team, members.length) : (
                <div className={styles.teamHeader}>
                  <strong>{team}</strong>
                  <div style={{ opacity: 0.6, fontSize: 11 }}>
                    {members.length} {members.length === 1 ? 'person' : 'people'}
                  </div>
                </div>
              )}
            </div>
            <div className={styles.children}>
              {wrapInIcStack ? (
                <div className={styles.icStack}>
                  {members.map((child) => renderOrphanNode(child))}
                </div>
              ) : (
                members.map((child) => renderOrphanNode(child))
              )}
            </div>
          </div>
        )
      })}
    </>
  )
}
```

- [ ] **Step 2: Update ColumnView to use OrphanGroup**

Replace the IIFE at lines 292-354 with:

```tsx
import { OrphanGroup } from './OrphanGroup'

// Inside the forest div, replace the orphan IIFE with:
<OrphanGroup
  orphans={roots.filter((r) => r.children.length === 0)}
  roots={roots}
  selectedIds={selectedIds}
  onSelect={onSelect}
  changes={changes}
  setNodeRef={setNodeRef}
  managerSet={managerSet}
  onAddReport={onAddReport}
  onDeletePerson={onDeletePerson}
  onInfo={onInfo}
  onFocus={onFocus}
  styles={styles}
  renderSubtree={(node) => (
    <SubtreeNode key={node.person.id} node={node} selectedIds={selectedIds} onSelect={onSelect}
      changes={changes} setNodeRef={setNodeRef} managerSet={managerSet}
      onAddReport={onAddReport} onAddToTeam={onAddToTeam} onDeletePerson={onDeletePerson}
      onInfo={onInfo} onFocus={onFocus} />
  )}
  renderTeamHeader={(team, count) => <TeamHeaderNode team={team} memberCount={count} />}
/>
```

- [ ] **Step 3: Update ManagerView to use OrphanGroup**

Replace the IIFE at lines 207-269 with:

```tsx
import { OrphanGroup } from './OrphanGroup'

// Inside the forest div, replace the orphan IIFE with:
<OrphanGroup
  orphans={roots.filter((r) => r.children.length === 0)}
  roots={roots}
  selectedIds={selectedIds}
  onSelect={onSelect}
  changes={changes}
  setNodeRef={setNodeRef}
  managerSet={managerSet}
  onAddReport={onAddReport}
  onDeletePerson={onDeletePerson}
  onInfo={onInfo}
  styles={styles}
  wrapInIcStack={false}
  renderSubtree={(node) => (
    <ManagerSubtree key={node.person.id} node={node} selectedIds={selectedIds} onSelect={onSelect}
      changes={changes} setNodeRef={setNodeRef} managerSet={managerSet}
      onAddReport={onAddReport} onDeletePerson={onDeletePerson}
      onInfo={onInfo} onFocus={onFocus} />
  )}
/>
```

- [ ] **Step 4: Run tests to verify nothing broke**

Run: `cd web && npm test`

- [ ] **Step 5: Commit**

```bash
jj commit -m "refactor: extract shared OrphanGroup component from ColumnView and ManagerView"
```

---

### Task 3: Accessibility — Screen Reader & ARIA

**Files:**
- Modify: `web/src/grove.css`
- Modify: `web/src/components/PersonNode.tsx`
- Modify: `web/src/components/NodeActions.tsx`
- Modify: `web/src/components/Toolbar.tsx`
- Modify: `web/src/components/SnapshotsDropdown.tsx`
- Modify: `web/src/components/EmploymentTypeFilter.tsx`
- Modify: `web/src/components/RecycleBinDrawer.tsx`
- Modify: `web/src/components/RecycleBinButton.tsx`
- Modify: `web/src/components/AutosaveBanner.tsx`
- Modify: `web/src/components/DetailSidebar.tsx`
- Modify: `web/src/App.tsx`
- Modify: `web/src/views/shared.tsx`

- [ ] **Step 1: Add sr-only CSS class to grove.css**

Append to `web/src/grove.css`:

```css
/* Screen reader only — visually hidden, accessible to assistive tech */
.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}
```

- [ ] **Step 2: Add screen reader text for status emojis in PersonNode**

In `PersonNode.tsx`, replace the emoji prefix line (line 64):
```tsx
const prefix = isRecruiting ? '\u{1F535} ' : isFuture ? '\u{2B1C} ' : isTransfer ? '\u{1F7E1} ' : ''
```
with sr-only status labels:
```tsx
const statusLabel = isRecruiting ? 'Recruiting' : isFuture ? 'Planned' : isTransfer ? 'Transfer' : null
const prefix = isRecruiting ? '\u{1F535} ' : isFuture ? '\u{2B1C} ' : isTransfer ? '\u{1F7E1} ' : ''
```

And update the name rendering (line 91) to include the sr-only label:
```tsx
<div className={styles.name}>
  {statusLabel && <span className="sr-only">{statusLabel}: </span>}
  {prefix}{person.name}
</div>
```

Also add `aria-selected` to the node wrapper div (line 90):
```tsx
<div className={classNames} style={nodeStyle} onClick={(e) => onClick?.(e)} aria-selected={selected || false}>
```

- [ ] **Step 3: Add aria-labels to NodeActions icon buttons**

Replace each button in NodeActions.tsx with proper aria-labels:
```tsx
<button className={styles.btn} onClick={onFocus} aria-label="Focus on subtree" title="Focus on subtree">{'\u2299'}</button>
```
```tsx
<button className={styles.btn} onClick={onAdd} aria-label="Add direct report" title="Add direct report">+</button>
```
```tsx
<button className={styles.btn} onClick={onInfo} aria-label="Org metrics" title="Org metrics">{'\u2139'}</button>
```
```tsx
<button className={styles.btn} onClick={onEdit} aria-label="Edit" title="Edit">{'\u270E'}</button>
```
```tsx
<button className={`${styles.btn} ${styles.danger}`} onClick={onDelete} aria-label="Delete" title="Delete">{'\u00D7'}</button>
```

- [ ] **Step 4: Add ARIA to Toolbar**

In `Toolbar.tsx`:

Add `aria-label="Re-layout"` to the re-layout button (line 77):
```tsx
<button className={styles.pill} onClick={() => reflow()} title="Re-layout" aria-label="Re-layout">
```

Add `aria-expanded` and `aria-label` to the export dropdown button (line 102-106):
```tsx
<button
  className={styles.exportBtn}
  onClick={() => setExportOpen((o) => !o)}
  aria-expanded={exportOpen}
  aria-label="Export options"
>
```

Add `aria-label="Upload file"` to the Upload button (line 59):
```tsx
<button className={styles.uploadBtn} onClick={() => inputRef.current?.click()} aria-label="Upload file">
```

- [ ] **Step 5: Add ARIA to SnapshotsDropdown**

In `SnapshotsDropdown.tsx`:

Add `aria-expanded` to the trigger button (line 48):
```tsx
<button className={styles.trigger} onClick={() => setOpen((o) => !o)}
  title={`Snapshot: ${label}`} aria-expanded={open} aria-label={`Snapshot: ${label}`}>
```

Add `aria-label` to each delete button (line 74):
```tsx
<span className={styles.deleteBtn} role="button" tabIndex={0}
  onClick={(e) => handleDelete(e, snap.name)}
  onKeyDown={(e) => { if (e.key === 'Enter') handleDelete(e, snap.name) }}
  aria-label={`Delete snapshot ${snap.name}`}>
```

- [ ] **Step 6: Add ARIA to EmploymentTypeFilter**

In `EmploymentTypeFilter.tsx`:

Add `aria-expanded` to the trigger (line 33):
```tsx
<button className={styles.trigger} onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-label="Employment type filter">
```

Add `aria-checked` to each filter item (line 51):
```tsx
<button key={type} className={styles.menuItem} onClick={() => toggleEmploymentTypeFilter(type)}
  role="menuitemcheckbox" aria-checked={isVisible}>
```

- [ ] **Step 7: Add ARIA to RecycleBinDrawer and RecycleBinButton**

In `RecycleBinDrawer.tsx`, add `role="complementary"` and `aria-label` to the drawer:
```tsx
<div className={styles.drawer} role="complementary" aria-label="Recycle bin">
```

Add `aria-label` to close button (line 12):
```tsx
<button className={styles.closeBtn} onClick={() => setBinOpen(false)} aria-label="Close recycle bin">×</button>
```

In `RecycleBinButton.tsx`, add `aria-label` and `aria-pressed`:
```tsx
<button onClick={() => setBinOpen(!binOpen)}
  className={`${styles.btn} ${binOpen ? styles.open : styles.closed}`}
  aria-label={`Recycle bin${recycled.length > 0 ? ` (${recycled.length} items)` : ''}`}
  aria-pressed={binOpen}>
```

- [ ] **Step 8: Add role=alert to AutosaveBanner and App banners**

In `AutosaveBanner.tsx`, add `role="alert"`:
```tsx
<div className={styles.banner} role="alert">
```

In `App.tsx`, add `role="alert"` to the error banners:
```tsx
{error && (
  <div className={styles.errorBanner} role="alert">
```
```tsx
{exportError && (
  <div className={styles.errorBanner} role="alert">
```
```tsx
{serverSaveError && (
  <div className={styles.warnBanner} role="alert">
```

- [ ] **Step 9: Add ARIA to DetailSidebar close buttons**

In `DetailSidebar.tsx`, add `aria-label="Close"` to both close buttons (lines 252, 343):
```tsx
<button className={styles.closeBtn} onClick={handleClose} aria-label="Close">
```

- [ ] **Step 10: Run tests to verify**

Run: `cd web && npm test`

- [ ] **Step 11: Commit**

```bash
jj commit -m "feat: add comprehensive ARIA labels, screen reader support, and role attributes"
```

---

### Task 4: API Client Hardening — Timeouts and Abort Signals

**Files:**
- Modify: `web/src/api/client.ts`

- [ ] **Step 1: Add timeout and signal support to API client**

Add a `fetchWithTimeout` wrapper at the top of `client.ts`:

```typescript
const DEFAULT_TIMEOUT_MS = 30_000

function fetchWithTimeout(
  input: RequestInfo | URL,
  init?: RequestInit & { timeoutMs?: number },
): Promise<Response> {
  const { timeoutMs = DEFAULT_TIMEOUT_MS, ...fetchInit } = init ?? {}
  const timeoutSignal = AbortSignal.timeout(timeoutMs)

  // Combine caller signal (if any) with timeout signal
  if (fetchInit.signal) {
    const combined = AbortSignal.any([fetchInit.signal, timeoutSignal])
    return fetch(input, { ...fetchInit, signal: combined })
  }

  return fetch(input, { ...fetchInit, signal: timeoutSignal })
}
```

- [ ] **Step 2: Replace all `fetch()` calls with `fetchWithTimeout()`**

Update every `fetch(...)` call in the file to use `fetchWithTimeout(...)`. The signature is compatible — just change the function name. For upload functions, use a longer timeout:

```typescript
// For uploads (50MB max), use 120s timeout
const resp = await fetchWithTimeout(`${BASE}/upload`, { method: 'POST', body: form, timeoutMs: 120_000 })
```

- [ ] **Step 3: Run tests to verify**

Run: `cd web && npm test`

- [ ] **Step 4: Commit**

```bash
jj commit -m "feat: add request timeouts to API client (30s default, 120s uploads)"
```

---

### Task 5: Surface Snapshot Persistence Errors to UI

**Files:**
- Modify: `internal/api/model.go`
- Modify: `internal/api/service.go`
- Modify: `internal/api/handlers.go`
- Modify: `web/src/api/types.ts`
- Modify: `web/src/store/OrgDataContext.tsx`

- [ ] **Step 1: Add PersistenceWarning to Go response types**

In `model.go`, add a `PersistenceWarning` field to `UploadResponse`:
```go
type UploadResponse struct {
	Status             string                  `json:"status"`
	OrgData            *OrgData                `json:"orgData,omitempty"`
	Headers            []string                `json:"headers,omitempty"`
	Mapping            map[string]MappedColumn `json:"mapping,omitempty"`
	Preview            [][]string              `json:"preview,omitempty"`
	Snapshots          []SnapshotInfo          `json:"snapshots,omitempty"`
	PersistenceWarning string                  `json:"persistenceWarning,omitempty"`
}
```

Add `PersistenceWarning` to `OrgData`:
```go
type OrgData struct {
	Original           []Person `json:"original"`
	Working            []Person `json:"working"`
	PersistenceWarning string   `json:"persistenceWarning,omitempty"`
}
```

- [ ] **Step 2: Return persistence warnings from service methods**

In `service.go`, update `Upload()` (lines 62-63): Instead of silently discarding the delete error, collect it:
```go
s.snapshots = nil
var persistWarn string
if err := DeleteSnapshotStore(); err != nil {
    persistWarn = fmt.Sprintf("snapshot cleanup failed: %v", err)
}
s.original = people
s.working = deepCopyPeople(people)
s.recycled = nil
return &UploadResponse{
    Status:             "ready",
    OrgData:            &OrgData{Original: deepCopyPeople(s.original), Working: deepCopyPeople(s.working)},
    PersistenceWarning: persistWarn,
}, nil
```

Update `ConfirmMapping()` for ZIP path (lines 125-129):
```go
// Disk I/O outside the lock
var persistWarn string
if err := DeleteSnapshotStore(); err != nil {
    persistWarn = fmt.Sprintf("snapshot cleanup failed: %v", err)
}
if err := WriteSnapshots(snapCopy); err != nil {
    msg := fmt.Sprintf("snapshot persist error: %v", err)
    if persistWarn != "" {
        persistWarn += "; " + msg
    } else {
        persistWarn = msg
    }
}
resp.PersistenceWarning = persistWarn
return resp, nil
```

Update `ConfirmMapping()` for non-ZIP path (lines 156-157):
```go
var persistWarn string
if err := DeleteSnapshotStore(); err != nil {
    persistWarn = fmt.Sprintf("snapshot cleanup failed: %v", err)
}
resp.PersistenceWarning = persistWarn
return resp, nil
```

- [ ] **Step 3: Update frontend types**

In `web/src/api/types.ts`, add `persistenceWarning` to the relevant interfaces:
```typescript
export interface UploadResponse {
  status: 'ready' | 'needs_mapping'
  orgData?: OrgData
  headers?: string[]
  mapping?: Record<string, MappedColumn>
  preview?: string[][]
  snapshots?: SnapshotInfo[]
  persistenceWarning?: string
}

export interface OrgData {
  original: Person[]
  working: Person[]
  persistenceWarning?: string
}
```

- [ ] **Step 4: Surface warnings in OrgDataContext**

In `OrgDataContext.tsx`, after successful upload/confirmMapping, check for the warning:

In `upload` callback, after the `setState` call for `status === 'ready'` (around line 127):
```typescript
if (resp.persistenceWarning) {
  setError(`Warning: ${resp.persistenceWarning}`)
}
```

In `confirmMapping` callback, after the `setState` call (around line 152):
```typescript
if (data.persistenceWarning) {
  setError(`Warning: ${data.persistenceWarning}`)
}
```

- [ ] **Step 5: Run all tests**

Run: `go test ./... && cd web && npm test`

- [ ] **Step 6: Commit**

```bash
jj commit -m "fix: surface snapshot persistence errors to UI instead of swallowing them"
```

---

### Task 6: Component Tests — DetailSidebar

**Files:**
- Create: `web/src/components/DetailSidebar.test.tsx`

- [ ] **Step 1: Write DetailSidebar tests**

```tsx
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import DetailSidebar from './DetailSidebar'
import type { Person } from '../api/types'

const alice: Person = {
  id: 'a1', name: 'Alice', role: 'VP', discipline: 'Eng',
  managerId: '', team: 'Platform', additionalTeams: [], status: 'Active',
}
const bob: Person = {
  id: 'b2', name: 'Bob', role: 'Engineer', discipline: 'Eng',
  managerId: 'a1', team: 'Platform', additionalTeams: [], status: 'Active',
}

const mockOrg = {
  working: [alice, bob],
  selectedId: 'a1',
  selectedIds: new Set(['a1']),
  setSelectedId: vi.fn(),
  clearSelection: vi.fn(),
  update: vi.fn().mockResolvedValue(undefined),
  remove: vi.fn().mockResolvedValue(undefined),
  reparent: vi.fn().mockResolvedValue(undefined),
  // Other fields from useOrg not used by DetailSidebar
  original: [], recycled: [], loaded: true, viewMode: 'detail' as const,
  dataView: 'working' as const, binOpen: false, hiddenEmploymentTypes: new Set<string>(),
  headPersonId: null, layoutKey: 0, error: null, pendingMapping: null,
  snapshots: [], currentSnapshotName: null, autosaveAvailable: null,
  setViewMode: vi.fn(), setDataView: vi.fn(), toggleSelect: vi.fn(),
  upload: vi.fn(), move: vi.fn(), reorder: vi.fn(), add: vi.fn(),
  restore: vi.fn(), emptyBin: vi.fn(), setBinOpen: vi.fn(),
  confirmMapping: vi.fn(), cancelMapping: vi.fn(), reflow: vi.fn(),
  saveSnapshot: vi.fn(), loadSnapshot: vi.fn(), deleteSnapshot: vi.fn(),
  restoreAutosave: vi.fn(), dismissAutosave: vi.fn(),
  toggleEmploymentTypeFilter: vi.fn(), showAllEmploymentTypes: vi.fn(),
  hideAllEmploymentTypes: vi.fn(), setHead: vi.fn(), clearError: vi.fn(),
  setError: vi.fn(),
}

vi.mock('../store/OrgContext', () => ({
  useOrg: () => mockOrg,
}))

describe('DetailSidebar', () => {
  afterEach(() => { cleanup(); vi.clearAllMocks() })

  it('renders single-person edit form with person data', () => {
    render(<DetailSidebar />)
    const nameInput = screen.getByDisplayValue('Alice')
    expect(nameInput).toBeDefined()
    expect(screen.getByDisplayValue('VP')).toBeDefined()
  })

  it('renders batch edit form when multiple selected', () => {
    mockOrg.selectedIds = new Set(['a1', 'b2'])
    mockOrg.selectedId = null
    render(<DetailSidebar />)
    expect(screen.getByText(/Edit 2 people/)).toBeDefined()
    mockOrg.selectedIds = new Set(['a1'])
    mockOrg.selectedId = 'a1'
  })

  it('calls clearSelection when close button clicked', () => {
    render(<DetailSidebar />)
    const closeBtn = screen.getByLabelText('Close')
    fireEvent.click(closeBtn)
    expect(mockOrg.clearSelection).toHaveBeenCalled()
  })

  it('calls update on save with field values', async () => {
    render(<DetailSidebar />)
    const saveBtn = screen.getByText('Save')
    fireEvent.click(saveBtn)
    // handleSave calls update(personId, fields) where fields is a Record<string, string>
    // containing name, role, discipline, status, employmentType, additionalTeams,
    // plus team and managerId when manager didn't change
    await vi.waitFor(() => {
      expect(mockOrg.update).toHaveBeenCalledWith('a1', expect.objectContaining({
        name: 'Alice',
        role: 'VP',
        discipline: 'Eng',
        status: 'Active',
        team: 'Platform',
        managerId: '',
      }))
    })
  })

  it('calls remove on delete', async () => {
    render(<DetailSidebar />)
    const deleteBtn = screen.getByText('Delete')
    fireEvent.click(deleteBtn)
    await vi.waitFor(() => {
      expect(mockOrg.remove).toHaveBeenCalledWith('a1')
    })
  })

  it('returns null when no person selected', () => {
    mockOrg.selectedId = null
    mockOrg.selectedIds = new Set()
    const { container } = render(<DetailSidebar />)
    expect(container.innerHTML).toBe('')
    mockOrg.selectedId = 'a1'
    mockOrg.selectedIds = new Set(['a1'])
  })
})
```

- [ ] **Step 2: Run the test**

Run: `cd web && npm test -- DetailSidebar`
Expected: All tests pass.

- [ ] **Step 3: Commit**

```bash
jj commit -m "test: add DetailSidebar component tests"
```

---

### Task 7: Component Tests — ColumnView

**Files:**
- Create: `web/src/views/ColumnView.test.tsx`

- [ ] **Step 1: Write ColumnView tests**

```tsx
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import ColumnView from './ColumnView'
import type { Person } from '../api/types'

// Mock dnd-kit (ColumnView uses DndContext)
vi.mock('@dnd-kit/core', () => ({
  DndContext: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DragOverlay: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  useDraggable: () => ({ attributes: {}, listeners: {}, setNodeRef: vi.fn(), isDragging: false }),
  useDroppable: () => ({ setNodeRef: vi.fn(), isOver: false }),
  MouseSensor: class {},
  KeyboardSensor: class {},
  useSensor: () => ({}),
  useSensors: () => [],
}))

vi.mock('../hooks/useChartLayout', () => ({
  useChartLayout: () => ({
    containerRef: { current: null },
    setNodeRef: () => () => {},
    lines: [],
    activeDragId: null,
    sensors: [],
    handleDragStart: vi.fn(),
    handleDragEnd: vi.fn(),
  }),
}))

vi.mock('../hooks/useDragDrop', () => ({
  useDragDrop: () => ({ onDragEnd: vi.fn() }),
}))

vi.mock('../store/OrgContext', () => ({
  useOrg: () => ({ move: vi.fn(), reparent: vi.fn(), selectedIds: new Set() }),
}))

const alice: Person = {
  id: 'a1', name: 'Alice', role: 'VP', discipline: 'Eng',
  managerId: '', team: 'Platform', additionalTeams: [], status: 'Active',
}
const bob: Person = {
  id: 'b2', name: 'Bob', role: 'Engineer', discipline: 'Eng',
  managerId: 'a1', team: 'Platform', additionalTeams: [], status: 'Active',
}

describe('ColumnView', () => {
  afterEach(() => cleanup())

  it('renders people as tree nodes', () => {
    render(
      <ColumnView
        people={[alice, bob]}
        selectedIds={new Set()}
        onSelect={vi.fn()}
      />
    )
    expect(screen.getByText('Alice')).toBeDefined()
    expect(screen.getByText('Bob')).toBeDefined()
  })

  it('shows empty message when no people', () => {
    render(
      <ColumnView people={[]} selectedIds={new Set()} onSelect={vi.fn()} />
    )
    expect(screen.getByText('No people to display.')).toBeDefined()
  })

  it('renders orphans grouped by team', () => {
    const carol: Person = {
      id: 'c3', name: 'Carol', role: 'Designer', discipline: 'Design',
      managerId: '', team: 'Design', additionalTeams: [], status: 'Active',
    }
    const dave: Person = {
      id: 'd4', name: 'Dave', role: 'PM', discipline: 'Product',
      managerId: '', team: 'Product', additionalTeams: [], status: 'Active',
    }
    render(
      <ColumnView
        people={[carol, dave]}
        selectedIds={new Set()}
        onSelect={vi.fn()}
      />
    )
    expect(screen.getByText('Carol')).toBeDefined()
    expect(screen.getByText('Dave')).toBeDefined()
  })

  it('highlights selected nodes', () => {
    const { container } = render(
      <ColumnView
        people={[alice, bob]}
        selectedIds={new Set(['a1'])}
        onSelect={vi.fn()}
      />
    )
    const selectedNode = container.querySelector('[aria-selected="true"]')
    expect(selectedNode).not.toBeNull()
  })
})
```

- [ ] **Step 2: Run the test**

Run: `cd web && npm test -- ColumnView`
Expected: All tests pass.

- [ ] **Step 3: Commit**

```bash
jj commit -m "test: add ColumnView component tests"
```

---

### Task 8: Component Tests — ManagerView

**Files:**
- Create: `web/src/views/ManagerView.test.tsx`

- [ ] **Step 1: Write ManagerView tests**

```tsx
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import ManagerView from './ManagerView'
import type { Person } from '../api/types'

// Same dnd-kit mocks as ColumnView
vi.mock('@dnd-kit/core', () => ({
  DndContext: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DragOverlay: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  useDraggable: () => ({ attributes: {}, listeners: {}, setNodeRef: vi.fn(), isDragging: false }),
  useDroppable: () => ({ setNodeRef: vi.fn(), isOver: false }),
  MouseSensor: class {},
  KeyboardSensor: class {},
  useSensor: () => ({}),
  useSensors: () => [],
}))

vi.mock('../hooks/useChartLayout', () => ({
  useChartLayout: () => ({
    containerRef: { current: null },
    setNodeRef: () => () => {},
    lines: [],
    activeDragId: null,
    sensors: [],
    handleDragStart: vi.fn(),
    handleDragEnd: vi.fn(),
  }),
}))

vi.mock('../hooks/useDragDrop', () => ({
  useDragDrop: () => ({ onDragEnd: vi.fn() }),
}))

vi.mock('../store/OrgContext', () => ({
  useOrg: () => ({ move: vi.fn(), reparent: vi.fn(), selectedIds: new Set() }),
}))

const alice: Person = {
  id: 'a1', name: 'Alice', role: 'VP', discipline: 'Eng',
  managerId: '', team: 'Platform', additionalTeams: [], status: 'Active',
}
const bob: Person = {
  id: 'b2', name: 'Bob', role: 'Engineer', discipline: 'Eng',
  managerId: 'a1', team: 'Platform', additionalTeams: [], status: 'Active',
}
const carol: Person = {
  id: 'c3', name: 'Carol', role: 'Engineer', discipline: 'Eng',
  managerId: 'a1', team: 'Platform', additionalTeams: [], status: 'Open',
}

describe('ManagerView', () => {
  afterEach(() => cleanup())

  it('renders manager nodes', () => {
    render(
      <ManagerView
        people={[alice, bob]}
        selectedIds={new Set()}
        onSelect={vi.fn()}
      />
    )
    expect(screen.getByText('Alice')).toBeDefined()
  })

  it('summarizes ICs instead of rendering individually', () => {
    render(
      <ManagerView
        people={[alice, bob, carol]}
        selectedIds={new Set()}
        onSelect={vi.fn()}
        managerSet={new Set(['a1'])}
      />
    )
    // Manager Alice is rendered as a node
    expect(screen.getByText('Alice')).toBeDefined()
    // ICs are summarized, not rendered individually (no "Bob" text as a node name)
    // But SummaryCard shows discipline counts
    expect(screen.getByText('Eng')).toBeDefined()
    expect(screen.getByText('Recruiting')).toBeDefined()
  })

  it('shows empty message when no people', () => {
    render(
      <ManagerView people={[]} selectedIds={new Set()} onSelect={vi.fn()} />
    )
    expect(screen.getByText('No people to display.')).toBeDefined()
  })
})
```

- [ ] **Step 2: Run the test**

Run: `cd web && npm test -- ManagerView`
Expected: All tests pass.

- [ ] **Step 3: Run full test suite**

Run: `cd web && npm test && cd .. && go test ./...`

- [ ] **Step 4: Commit**

```bash
jj commit -m "test: add ManagerView component tests"
```
