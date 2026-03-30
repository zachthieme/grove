# Split OrgDataContextValue & Extract DetailSidebar

## Problem

Two structural issues identified in code review:

1. **OrgDataContextValue is a god interface** (36 members: 11 state fields + 21 mutation functions + canUndo/canRedo + upload + createOrg). All consumers re-render on any state or mutation reference change, even the 6 components that only read `working` or `recycled`.

2. **DetailSidebar is a god component** (386 lines). Handles 5 distinct modes (pod delegation, single view, single edit, batch view, batch edit) with mirrored form state and mirrored save handlers.

## Design

### Part 1: Split OrgDataContextValue into two contexts

#### Types (`orgTypes.ts`)

Replace `OrgDataContextValue` with two interfaces:

```typescript
export interface OrgDataStateValue {
  original: Person[]
  working: Person[]
  recycled: Person[]
  pods: Pod[]
  originalPods: Pod[]
  settings: Settings
  loaded: boolean
  pendingMapping: PendingMapping
  snapshots: SnapshotInfo[]
  currentSnapshotName: string | null
  autosaveAvailable: AutosaveData | null
}

export interface OrgMutationsValue {
  upload: (file: File) => Promise<void>
  createOrg: (name: string) => Promise<string | undefined>
  move: (personId: string, newManagerId: string, newTeam: string, correlationId?: string, newPod?: string) => Promise<void>
  reparent: (personId: string, newManagerId: string, correlationId?: string) => Promise<void>
  reorder: (personIds: string[]) => Promise<void>
  update: (personId: string, fields: PersonUpdatePayload, correlationId?: string) => Promise<void>
  add: (person: Omit<Person, 'id'>) => Promise<void>
  addParent: (childId: string, name: string) => Promise<void>
  remove: (personId: string) => Promise<void>
  restore: (personId: string) => Promise<void>
  emptyBin: () => Promise<void>
  confirmMapping: (mapping: Record<string, string>) => Promise<void>
  cancelMapping: () => void
  saveSnapshot: (name: string) => Promise<void>
  loadSnapshot: (name: string) => Promise<void>
  deleteSnapshot: (name: string) => Promise<void>
  restoreAutosave: () => void
  dismissAutosave: () => Promise<void>
  updatePod: (podId: string, fields: PodUpdatePayload) => Promise<void>
  createPod: (managerId: string, name: string, team: string) => Promise<void>
  updateSettings: (settings: Settings) => Promise<void>
  undo: () => void
  redo: () => void
  canUndo: boolean
  canRedo: boolean
}
```

Remove the old `OrgDataContextValue` interface.

#### Provider (`OrgDataContext.tsx`)

Two contexts, one provider. The state value changes when data changes. The mutations value is mostly stable `useCallback` refs, though `undo`/`redo`/`canUndo`/`canRedo` change when the undo stack changes. This is still a large improvement: data-only consumers never re-render due to mutation changes.

```
OrgDataProvider
  -> OrgDataStateContext.Provider value={stateValue}
      -> OrgMutationsContext.Provider value={mutationsValue}
          -> {children}
```

Export `useOrgData()` returning `OrgDataStateValue` and `useOrgMutations()` returning `OrgMutationsValue`.

#### Composition layer (`OrgContext.tsx`)

- `useOrgData()` checks real `OrgDataStateContext`, falls back to `OrgOverrideContext` for tests, returns `OrgDataStateValue`
- `useOrgMutations()` checks real `OrgMutationsContext`, falls back to `OrgOverrideContext` for tests, returns `OrgMutationsValue`
- `OrgOverrideValue` becomes `OrgDataStateValue & OrgMutationsValue & UIContextValue & SelectionContextValue`
- Re-export both hooks from `OrgContext.tsx` so consumers import from `'../store/OrgContext'` (same pattern as existing `useOrgData`, `useUI`, `useSelection`)

#### Test helpers (`test-helpers.tsx`)

`makeOrgContext()` keeps the same shape. Update the `OrgTestContext` type alias to use the new interface names: `OrgDataStateValue & OrgMutationsValue & UIContextValue & SelectionContextValue`.

#### Consumer updates

| Consumer | Hook(s) needed |
|----------|---------------|
| Breadcrumbs, UnparentedBar, SearchBar, EmploymentTypeFilter, PrivateToggle, RecycleBinButton | `useOrgData()` only (no change) |
| AutosaveBanner | `useOrgData()` + `useOrgMutations()` |
| DetailSidebar (and sub-components) | `useOrgData()` + `useOrgMutations()` |
| Toolbar | `useOrgData()` + `useOrgMutations()` |
| UploadPrompt | `useOrgMutations()` |
| ViewDataContext | `useOrgData()` + `useOrgMutations()` |
| App.tsx | `useOrgData()` + `useOrgMutations()` |
| SnapshotsDropdown | `useOrgData()` + `useOrgMutations()` |
| PodSidebar | `useOrgData()` + `useOrgMutations()` |
| RecycleBinDrawer | `useOrgData()` + `useOrgMutations()` |
| SettingsModal | `useOrgData()` + `useOrgMutations()` |
| useDragDrop | `useOrgData()` + `useOrgMutations()` |
| TableView | `useOrgData()` + `useOrgMutations()` (uses both directly for inline editing and draft rows) |

### Part 2: Extract DetailSidebar into sub-components

#### New file structure

```
components/
  DetailSidebar.tsx          # Thin router (~30 lines)
  PersonViewSidebar.tsx      # Single person read-only (~70 lines)
  PersonEditSidebar.tsx      # Single person edit form + save (~80 lines)
  BatchViewSidebar.tsx       # Batch read-only with Mixed handling (~60 lines)
  BatchEditSidebar.tsx       # Batch edit form + save (~70 lines)
  SidebarShell.tsx           # Shared aside + header + close button (~15 lines)
  PersonForm.tsx             # Already extracted, no changes
  PodSidebar.tsx             # Already extracted, no changes
  DetailSidebar.module.css   # Shared by all sidebar components, no changes
```

#### DetailSidebar.tsx (router)

```typescript
export default function DetailSidebar({ mode, onSetMode }: DetailSidebarProps) {
  const { selectedId, selectedIds, selectedPodId } = useSelection()
  const isBatch = selectedIds.size > 1

  if (selectedPodId && !selectedId && !isBatch) return <PodSidebar />
  if (isBatch) {
    const people = working.filter(p => selectedIds.has(p.id))
    if (people.length === 0) return null
    return mode === 'edit'
      ? <BatchEditSidebar onSetMode={onSetMode} />
      : <BatchViewSidebar onSetMode={onSetMode} />
  }
  if (selectedId) {
    if (!working.some(p => p.id === selectedId)) return null
    return mode === 'edit'
      ? <PersonEditSidebar personId={selectedId} onSetMode={onSetMode} />
      : <PersonViewSidebar personId={selectedId} onSetMode={onSetMode} />
  }
  return null
}
```

#### SidebarShell

Shared wrapper for the `<aside>` + header + close button used by all 4 sub-components:

```typescript
function SidebarShell({ heading, children }: { heading: string; children: ReactNode }) {
  const { clearSelection } = useSelection()
  return (
    <aside className={styles.sidebar}>
      <div className={styles.header}>
        <h3 data-testid="sidebar-heading">{heading}</h3>
        <button className={styles.closeBtn} onClick={clearSelection} aria-label="Close" title="Close">
          &times;
        </button>
      </div>
      {children}
    </aside>
  )
}
```

#### PersonViewSidebar

Takes `personId` prop. Looks up person from `working`. Renders read-only field list. Edit button calls `onSetMode('edit')`.

#### PersonEditSidebar

Takes `personId` prop. Owns `sidebarForm` state via `useState`, `handleSidebarChange`, `handleSingleSave`. Uses `PersonForm`. Has save button and delete button. Computes `managers` list internally.

#### BatchViewSidebar

Uses `selectedIds` from `useSelection()`. Computes `batchToForm()` for display. Shows "Mixed" for non-uniform fields. Edit button.

#### BatchEditSidebar

Uses `selectedIds` from `useSelection()`. Owns `batchForm`/`batchDirty` state, `handleBatchChange`, `handleBatchSave`. Uses `PersonForm` with `isBatch`/`mixedFields` props. Computes `managers` list internally (same as PersonEditSidebar). Save button with partial-failure reporting.

#### Test impact

All existing test files (`DetailSidebar.test.tsx`, `.a11y.test.tsx`, `.golden.test.tsx`, `.branches.test.tsx`) render `<DetailSidebar>` and test through the public interface. Since DetailSidebar remains the public component (now a router), all existing tests work unchanged. Sub-components are internal implementation details.

## Ordering

Part 1 (context split) first, then Part 2 (sidebar extraction). The sidebar extraction will use the new `useOrgMutations()` hook from Part 1.
