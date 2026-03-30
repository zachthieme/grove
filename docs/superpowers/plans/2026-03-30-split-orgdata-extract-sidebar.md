# Split OrgDataContextValue & Extract DetailSidebar Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Split the god interface `OrgDataContextValue` into separate data and mutations contexts, then extract the 386-line `DetailSidebar` into focused sub-components.

**Architecture:** Two React contexts replace one: `OrgDataStateContext` (11 state fields, changes on data updates) and `OrgMutationsContext` (25 mutation functions/flags, stable refs that rarely change). DetailSidebar becomes a thin router delegating to 4 mode-specific sub-components sharing a `SidebarShell` wrapper.

**Tech Stack:** React 18, TypeScript, CSS Modules, vitest

---

## File Map

### Part 1: Context Split
- **Modify:** `web/src/store/orgTypes.ts` — Replace `OrgDataContextValue` with `OrgDataStateValue` + `OrgMutationsValue`
- **Modify:** `web/src/store/OrgDataContext.tsx` — Two contexts, two `useMemo` values, one provider (rename internal `useOrgMutations` import to avoid collision)
- **Modify:** `web/src/store/OrgContext.tsx` — Add `useOrgMutations()` with override fallback, update `OrgOverrideValue`
- **Modify:** `web/src/test-helpers.tsx` — Update `OrgTestContext` type alias
- **Modify:** `web/src/store/OrgDataContext.test.tsx` — Update `useOrgDataWithError` helper to merge both hooks
- **Modify:** `web/src/store/OrgContext.integration.test.tsx` — Update type imports and `Harness` component
- **Modify:** 14 consumer files (destructuring updates)

### Part 2: Sidebar Extraction
- **Create:** `web/src/components/SidebarShell.tsx` — Shared aside + header + close button
- **Create:** `web/src/components/PersonViewSidebar.tsx` — Single person read-only
- **Create:** `web/src/components/PersonEditSidebar.tsx` — Single person edit form + save
- **Create:** `web/src/components/BatchViewSidebar.tsx` — Batch read-only with Mixed display
- **Create:** `web/src/components/BatchEditSidebar.tsx` — Batch edit form + save
- **Modify:** `web/src/components/DetailSidebar.tsx` — Thin router (~30 lines)

---

## Task 1: Split types in orgTypes.ts

**Files:**
- Modify: `web/src/store/orgTypes.ts`

- [ ] **Step 1: Replace OrgDataContextValue with two interfaces**

Replace the entire `OrgDataContextValue` interface (lines 54-91) with:

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

- [ ] **Step 2: Verify TypeScript compiles (expect errors in consumers)**

Run: `cd web && npx tsc --noEmit 2>&1 | head -40`
Expected: Errors referencing `OrgDataContextValue` in `OrgDataContext.tsx`, `OrgContext.tsx`, and `test-helpers.tsx`. This confirms the type was successfully removed and consumers need updating.

---

## Task 2: Split OrgDataContext.tsx into two contexts

**Files:**
- Modify: `web/src/store/OrgDataContext.tsx`

- [ ] **Step 1: Update imports, rename internal hook, and create two contexts**

Replace the import at line 5:
```typescript
import type { OrgDataContextValue } from './orgTypes'
```
With:
```typescript
import type { OrgDataStateValue, OrgMutationsValue } from './orgTypes'
```

Rename the internal hook import at line 9 to avoid collision with the new public `useOrgMutations` hook:
```typescript
import { useOrgMutations } from './useOrgMutations'
```
To:
```typescript
import { useOrgMutations as useMutationCallbacks } from './useOrgMutations'
```

Update the usage at line 202:
```typescript
  const mutations = useOrgMutations({ setState, getState, handleError, setError, captureForUndo })
```
To:
```typescript
  const mutations = useMutationCallbacks({ setState, getState, handleError, setError, captureForUndo })
```

Replace the context creation at line 30:
```typescript
export const OrgDataContext = createContext<OrgDataContextValue | null>(null)
```
With:
```typescript
export const OrgDataStateContext = createContext<OrgDataStateValue | null>(null)
export const OrgMutationsContext = createContext<OrgMutationsValue | null>(null)
```

- [ ] **Step 2: Update useOrgData hook and add useOrgMutations hook**

Replace the existing `useOrgData` function (lines 32-38) with two hooks:

```typescript
export function useOrgData(): OrgDataStateValue {
  const ctx = useContext(OrgDataStateContext)
  if (!ctx) {
    throw new Error('useOrgData must be used within an OrgDataProvider')
  }
  return ctx
}

export function useOrgMutations(): OrgMutationsValue {
  const ctx = useContext(OrgMutationsContext)
  if (!ctx) {
    throw new Error('useOrgMutations must be used within an OrgDataProvider')
  }
  return ctx
}
```

- [ ] **Step 3: Split the provider value into two useMemo blocks**

Replace the single `value` useMemo (lines 300-328) with two:

```typescript
  const stateValue: OrgDataStateValue = useMemo(() => ({
    original: state.original,
    working: state.working,
    recycled: state.recycled,
    pods: state.pods,
    originalPods: state.originalPods,
    settings: state.settings,
    loaded: state.loaded,
    pendingMapping: state.pendingMapping,
    snapshots: state.snapshots,
    currentSnapshotName: state.currentSnapshotName,
    autosaveAvailable: state.autosaveAvailable,
  }), [state])

  const mutationsValue: OrgMutationsValue = useMemo(() => ({
    upload,
    createOrg,
    ...mutations,
    confirmMapping,
    cancelMapping,
    restoreAutosave,
    dismissAutosave,
    undo,
    redo,
    canUndo,
    canRedo,
  }), [
    upload, createOrg, mutations,
    confirmMapping, cancelMapping,
    restoreAutosave, dismissAutosave,
    undo, redo, canUndo, canRedo,
  ])
```

- [ ] **Step 4: Update the provider JSX to nest two contexts**

Replace the single-context return (line 330) with:

```typescript
  return (
    <OrgDataStateContext.Provider value={stateValue}>
      <OrgMutationsContext.Provider value={mutationsValue}>
        {children}
      </OrgMutationsContext.Provider>
    </OrgDataStateContext.Provider>
  )
```

- [ ] **Step 5: Verify TypeScript compiles (expect errors in OrgContext.tsx)**

Run: `cd web && npx tsc --noEmit 2>&1 | head -40`
Expected: Errors in `OrgContext.tsx` referencing the old `OrgDataContext` export.

---

## Task 3: Update OrgContext.tsx composition layer

**Files:**
- Modify: `web/src/store/OrgContext.tsx`

- [ ] **Step 1: Update imports**

Replace line 2:
```typescript
import { OrgDataProvider, OrgDataContext, useOrgData as useOrgDataDirect } from './OrgDataContext'
```
With:
```typescript
import { OrgDataProvider, OrgDataStateContext, OrgMutationsContext, useOrgData as useOrgDataDirect, useOrgMutations as useOrgMutationsDirect } from './OrgDataContext'
```

Update line 5:
```typescript
import type { OrgDataContextValue, UIContextValue, SelectionContextValue } from './orgTypes'
```
To:
```typescript
import type { OrgDataStateValue, OrgMutationsValue, UIContextValue, SelectionContextValue } from './orgTypes'
```

- [ ] **Step 2: Update OrgOverrideValue type**

Replace line 7:
```typescript
interface OrgOverrideValue extends OrgDataContextValue, UIContextValue, SelectionContextValue {}
```
With:
```typescript
interface OrgOverrideValue extends OrgDataStateValue, OrgMutationsValue, UIContextValue, SelectionContextValue {}
```

- [ ] **Step 3: Update SelectionPruner to use new hook**

In `SelectionPruner` (line 17), replace:
```typescript
  const { working } = useOrgDataDirect()
```
With:
```typescript
  const { working } = useOrgDataDirect()
```
(No change needed — `useOrgDataDirect` now returns `OrgDataStateValue` which includes `working`.)

- [ ] **Step 4: Update useOrgData hook with override fallback**

Replace the existing `useOrgData` function (lines 59-65) with:
```typescript
export function useOrgData(): OrgDataStateValue {
  const override = useContext(OrgOverrideContext)
  const real = useContext(OrgDataStateContext)
  if (real) return real
  if (override) return override
  throw new Error('useOrgData must be used within an OrgDataProvider or OrgOverrideProvider')
}
```

- [ ] **Step 5: Add useOrgMutations hook with override fallback**

Add after the `useOrgData` function:
```typescript
export function useOrgMutations(): OrgMutationsValue {
  const override = useContext(OrgOverrideContext)
  const real = useContext(OrgMutationsContext)
  if (real) return real
  if (override) return override
  throw new Error('useOrgMutations must be used within an OrgDataProvider or OrgOverrideProvider')
}
```

- [ ] **Step 6: Verify TypeScript compiles (expect errors only in consumers)**

Run: `cd web && npx tsc --noEmit 2>&1 | head -40`
Expected: Errors in consumer files referencing mutations via `useOrgData()`.

---

## Task 4: Update test-helpers.tsx

**Files:**
- Modify: `web/src/test-helpers.tsx`

- [ ] **Step 1: Update type imports and OrgTestContext alias**

Replace line 7:
```typescript
import type { OrgDataContextValue, UIContextValue, SelectionContextValue } from './store/orgTypes'
```
With:
```typescript
import type { OrgDataStateValue, OrgMutationsValue, UIContextValue, SelectionContextValue } from './store/orgTypes'
```

Replace line 9:
```typescript
type OrgTestContext = OrgDataContextValue & UIContextValue & SelectionContextValue
```
With:
```typescript
type OrgTestContext = OrgDataStateValue & OrgMutationsValue & UIContextValue & SelectionContextValue
```

- [ ] **Step 2: Verify TypeScript compiles for test helpers**

Run: `cd web && npx tsc --noEmit 2>&1 | grep test-helpers`
Expected: No errors in `test-helpers.tsx` (the `makeOrgContext` shape hasn't changed, only the type composition).

---

## Task 5: Update OrgDataContext.test.tsx

**Files:**
- Modify: `web/src/store/OrgDataContext.test.tsx`

- [ ] **Step 1: Update imports**

Replace line 3:
```typescript
import { OrgDataProvider, useOrgData } from './OrgDataContext'
```
With:
```typescript
import { OrgDataProvider, useOrgData, useOrgMutations } from './OrgDataContext'
```

- [ ] **Step 2: Update useOrgDataWithError helper**

The helper at lines 62-66 merges `useOrgData()` with UI error state. After the split, mutations are no longer on `useOrgData()`. Update to merge both hooks:

Replace:
```typescript
function useOrgDataWithError() {
  const orgData = useOrgData()
  const ui = useUI()
  return { ...orgData, error: ui.error }
}
```
With:
```typescript
function useOrgDataWithError() {
  const orgData = useOrgData()
  const mutations = useOrgMutations()
  const ui = useUI()
  return { ...orgData, ...mutations, error: ui.error }
}
```

- [ ] **Step 3: Verify tests still pass**

Run: `cd web && npx vitest run src/store/OrgDataContext.test.tsx`
Expected: All tests pass.

---

## Task 6: Update OrgContext.integration.test.tsx

**Files:**
- Modify: `web/src/store/OrgContext.integration.test.tsx`

- [ ] **Step 1: Update imports**

Replace line 3-4:
```typescript
import { OrgProvider, useOrgData, useUI, useSelection } from './OrgContext'
import type { OrgDataContextValue, UIContextValue, SelectionContextValue } from './orgTypes'
```
With:
```typescript
import { OrgProvider, useOrgData, useOrgMutations, useUI, useSelection } from './OrgContext'
import type { OrgDataStateValue, OrgMutationsValue, UIContextValue, SelectionContextValue } from './orgTypes'
```

- [ ] **Step 2: Update CapturedContext type and Harness component**

Replace:
```typescript
type CapturedContext = OrgDataContextValue & UIContextValue & SelectionContextValue
let captured: CapturedContext | null = null
function Harness() {
  const data = useOrgData()
  const ui = useUI()
  const selection = useSelection()
  captured = { ...data, ...ui, ...selection }
  return <div data-testid="loaded">{data.loaded ? 'yes' : 'no'}</div>
}
```
With:
```typescript
type CapturedContext = OrgDataStateValue & OrgMutationsValue & UIContextValue & SelectionContextValue
let captured: CapturedContext | null = null
function Harness() {
  const data = useOrgData()
  const mutations = useOrgMutations()
  const ui = useUI()
  const selection = useSelection()
  captured = { ...data, ...mutations, ...ui, ...selection }
  return <div data-testid="loaded">{data.loaded ? 'yes' : 'no'}</div>
}
```

- [ ] **Step 3: Verify tests still pass**

Run: `cd web && npx vitest run src/store/OrgContext.integration.test.tsx`
Expected: All tests pass.

---

## Task 7: Update consumers — data-only files (no changes needed)

**Files:** `Breadcrumbs.tsx`, `UnparentedBar.tsx`, `SearchBar.tsx`, `EmploymentTypeFilter.tsx`, `PrivateToggle.tsx`, `RecycleBinButton.tsx`

- [ ] **Step 1: Verify these files compile without changes**

These files only destructure data fields (`working`, `recycled`) from `useOrgData()`. Since `useOrgData()` now returns `OrgDataStateValue` which still has those fields, no changes are needed.

Run: `cd web && npx tsc --noEmit 2>&1 | grep -E '(Breadcrumbs|UnparentedBar|SearchBar|EmploymentTypeFilter|PrivateToggle|RecycleBinButton)'`
Expected: No errors for these files.

---

## Task 8: Update consumers — files needing useOrgMutations

**Files:**
- Modify: `web/src/components/AutosaveBanner.tsx`
- Modify: `web/src/components/Toolbar.tsx`
- Modify: `web/src/components/UploadPrompt.tsx`
- Modify: `web/src/components/SnapshotsDropdown.tsx`
- Modify: `web/src/components/PodSidebar.tsx`
- Modify: `web/src/components/RecycleBinDrawer.tsx`
- Modify: `web/src/components/SettingsModal.tsx`
- Modify: `web/src/components/DetailSidebar.tsx`
- Modify: `web/src/hooks/useDragDrop.ts`
- Modify: `web/src/store/ViewDataContext.tsx`
- Modify: `web/src/views/TableView.tsx`
- Modify: `web/src/App.tsx`

- [ ] **Step 1: Update AutosaveBanner.tsx**

Replace line 1:
```typescript
import { useOrgData } from '../store/OrgContext'
```
With:
```typescript
import { useOrgData, useOrgMutations } from '../store/OrgContext'
```

Replace line 14:
```typescript
  const { autosaveAvailable, restoreAutosave, dismissAutosave } = useOrgData()
```
With:
```typescript
  const { autosaveAvailable } = useOrgData()
  const { restoreAutosave, dismissAutosave } = useOrgMutations()
```

- [ ] **Step 2: Update Toolbar.tsx**

Replace line 2:
```typescript
import { useOrgData, useUI } from '../store/OrgContext'
```
With:
```typescript
import { useOrgData, useOrgMutations, useUI } from '../store/OrgContext'
```

Replace line 46:
```typescript
  const { upload, loaded, createOrg } = useOrgData()
```
With:
```typescript
  const { loaded } = useOrgData()
  const { upload, createOrg } = useOrgMutations()
```

- [ ] **Step 3: Update UploadPrompt.tsx**

Replace line 2:
```typescript
import { useOrgData, useSelection } from '../store/OrgContext'
```
With:
```typescript
import { useOrgMutations, useSelection } from '../store/OrgContext'
```

Replace line 6:
```typescript
  const { upload, createOrg } = useOrgData()
```
With:
```typescript
  const { upload, createOrg } = useOrgMutations()
```

- [ ] **Step 4: Update SnapshotsDropdown.tsx**

Replace line 2:
```typescript
import { useOrgData } from '../store/OrgContext'
```
With:
```typescript
import { useOrgData, useOrgMutations } from '../store/OrgContext'
```

Replace line 18:
```typescript
  const { snapshots, currentSnapshotName, saveSnapshot, loadSnapshot, deleteSnapshot } = useOrgData()
```
With:
```typescript
  const { snapshots, currentSnapshotName } = useOrgData()
  const { saveSnapshot, loadSnapshot, deleteSnapshot } = useOrgMutations()
```

- [ ] **Step 5: Update PodSidebar.tsx**

Replace line 2:
```typescript
import { useOrgData, useSelection } from '../store/OrgContext'
```
With:
```typescript
import { useOrgData, useOrgMutations, useSelection } from '../store/OrgContext'
```

Replace line 8:
```typescript
  const { pods, working, updatePod } = useOrgData()
```
With:
```typescript
  const { pods, working } = useOrgData()
  const { updatePod } = useOrgMutations()
```

- [ ] **Step 6: Update RecycleBinDrawer.tsx**

Replace line 2:
```typescript
import { useOrgData, useUI, useSelection } from '../store/OrgContext'
```
With:
```typescript
import { useOrgData, useOrgMutations, useUI, useSelection } from '../store/OrgContext'
```

Replace line 6:
```typescript
  const { recycled, restore, emptyBin } = useOrgData()
```
With:
```typescript
  const { recycled } = useOrgData()
  const { restore, emptyBin } = useOrgMutations()
```

- [ ] **Step 7: Update SettingsModal.tsx**

Replace line 2:
```typescript
import { useOrgData } from '../store/OrgContext'
```
With:
```typescript
import { useOrgData, useOrgMutations } from '../store/OrgContext'
```

Replace line 16:
```typescript
  const { working, settings, updateSettings } = useOrgData()
```
With:
```typescript
  const { working, settings } = useOrgData()
  const { updateSettings } = useOrgMutations()
```

- [ ] **Step 8: Update DetailSidebar.tsx**

Replace line 2:
```typescript
import { useOrgData, useUI, useSelection } from '../store/OrgContext'
```
With:
```typescript
import { useOrgData, useOrgMutations, useUI, useSelection } from '../store/OrgContext'
```

Replace line 25:
```typescript
  const { working, update, remove, reparent } = useOrgData()
```
With:
```typescript
  const { working } = useOrgData()
  const { update, remove, reparent } = useOrgMutations()
```

- [ ] **Step 9: Update useDragDrop.ts**

Replace line 3:
```typescript
import { useOrgData, useSelection } from '../store/OrgContext'
```
With:
```typescript
import { useOrgData, useOrgMutations, useSelection } from '../store/OrgContext'
```

Replace line 14:
```typescript
  const { move, reparent, pods } = useOrgData()
```
With:
```typescript
  const { pods } = useOrgData()
  const { move, reparent } = useOrgMutations()
```

- [ ] **Step 10: Update ViewDataContext.tsx**

Replace line 4:
```typescript
import { useOrgData, useUI, useSelection } from './OrgContext'
```
With:
```typescript
import { useOrgData, useOrgMutations, useUI, useSelection } from './OrgContext'
```

Replace line 70:
```typescript
  const { original, working, pods, settings, add, addParent, remove, update } = useOrgData()
```
With:
```typescript
  const { original, working, pods, settings } = useOrgData()
  const { add, addParent, remove, update } = useOrgMutations()
```

- [ ] **Step 11: Update TableView.tsx**

Replace line 3:
```typescript
import { useOrgData, useSelection } from '../store/OrgContext'
```
With:
```typescript
import { useOrgData, useOrgMutations, useSelection } from '../store/OrgContext'
```

Find the line that destructures from `useOrgData()` (near the top of the component function) and split mutations out. It should look like:
```typescript
  const { working } = useOrgData()
  const { update, remove, add } = useOrgMutations()
```

- [ ] **Step 12: Update App.tsx**

Replace line 3:
```typescript
import { OrgProvider, useOrgData, useUI, useSelection } from './store/OrgContext'
```
With:
```typescript
import { OrgProvider, useOrgData, useOrgMutations, useUI, useSelection } from './store/OrgContext'
```

In `AppOverlays` (line 75), replace:
```typescript
  const { working, pendingMapping, confirmMapping, cancelMapping } = useOrgData()
```
With:
```typescript
  const { working, pendingMapping } = useOrgData()
  const { confirmMapping, cancelMapping } = useOrgMutations()
```

In `AppWorkspace` (line 109), no change needed — it only uses `{ loaded }` from `useOrgData()`.

In `AppContent` (line 156), replace the large destructure:
```typescript
  const { loaded, original, working, recycled, pods, originalPods, settings, currentSnapshotName, snapshots, saveSnapshot, loadSnapshot, deleteSnapshot, undo, redo, canUndo, canRedo, remove, add, reparent } = useOrgData()
```
With:
```typescript
  const { loaded, original, working, recycled, pods, originalPods, settings, currentSnapshotName, snapshots } = useOrgData()
  const { saveSnapshot, loadSnapshot, deleteSnapshot, undo, redo, canUndo, canRedo, remove, add, reparent } = useOrgMutations()
```

- [ ] **Step 13: Verify TypeScript compiles clean**

Run: `cd web && npx tsc --noEmit`
Expected: No errors.

- [ ] **Step 14: Run all tests**

Run: `cd web && npm test`
Expected: All tests pass. No behavior changed — only the context split.

- [ ] **Step 15: Commit Part 1**

```bash
jj new -m "refactor: split OrgDataContextValue into OrgDataStateValue + OrgMutationsValue

Separates the god interface (36 members) into two contexts:
- OrgDataStateValue (11 data fields) — changes on data updates
- OrgMutationsValue (25 functions/flags) — stable callback refs

Data-only consumers (Breadcrumbs, SearchBar, etc.) no longer re-render
when mutation references change."
```

---

## Task 9: Create SidebarShell component

**Files:**
- Create: `web/src/components/SidebarShell.tsx`

- [ ] **Step 1: Create SidebarShell.tsx**

```typescript
import type { ReactNode } from 'react'
import { useSelection } from '../store/OrgContext'
import styles from './DetailSidebar.module.css'

interface SidebarShellProps {
  heading: string
  children: ReactNode
  onClose?: () => void
}

export default function SidebarShell({ heading, children, onClose }: SidebarShellProps) {
  const { clearSelection } = useSelection()
  return (
    <aside className={styles.sidebar}>
      <div className={styles.header}>
        <h3 data-testid="sidebar-heading">{heading}</h3>
        <button className={styles.closeBtn} onClick={onClose ?? clearSelection} aria-label="Close" title="Close">
          &times;
        </button>
      </div>
      {children}
    </aside>
  )
}
```

- [ ] **Step 2: Verify it compiles**

Run: `cd web && npx tsc --noEmit`
Expected: No errors.

---

## Task 10: Create PersonViewSidebar

**Files:**
- Create: `web/src/components/PersonViewSidebar.tsx`

- [ ] **Step 1: Create PersonViewSidebar.tsx**

```typescript
import { useMemo } from 'react'
import { useOrgData } from '../store/OrgContext'
import SidebarShell from './SidebarShell'
import styles from './DetailSidebar.module.css'

interface PersonViewSidebarProps {
  personId: string
  onSetMode?: (mode: 'view' | 'edit') => void
}

export default function PersonViewSidebar({ personId, onSetMode }: PersonViewSidebarProps) {
  const { working } = useOrgData()
  const person = useMemo(() => working.find(p => p.id === personId), [working, personId])

  if (!person) return null

  const manager = working.find(p => p.id === person.managerId)

  return (
    <SidebarShell heading={person.name || '(unnamed)'}>
      <div className={styles.viewBody}>
        <div className={styles.viewField}>
          <span className={styles.viewLabel}>Role</span>
          <span className={styles.viewValue}>{person.role || 'TBD'}</span>
        </div>
        <div className={styles.viewField}>
          <span className={styles.viewLabel}>Discipline</span>
          <span className={styles.viewValue}>{person.discipline || '\u2014'}</span>
        </div>
        <div className={styles.viewField}>
          <span className={styles.viewLabel}>Team</span>
          <span className={styles.viewValue}>{person.team || '\u2014'}</span>
        </div>
        {person.additionalTeams && person.additionalTeams.length > 0 && (
          <div className={styles.viewField}>
            <span className={styles.viewLabel}>Other Teams</span>
            <span className={styles.viewValue}>{person.additionalTeams.join(', ')}</span>
          </div>
        )}
        <div className={styles.viewField}>
          <span className={styles.viewLabel}>Manager</span>
          <span className={styles.viewValue}>{manager?.name || '(none)'}</span>
        </div>
        <div className={styles.viewField}>
          <span className={styles.viewLabel}>Status</span>
          <span className={styles.viewValue}>{person.status}</span>
        </div>
        {person.pod && (
          <div className={styles.viewField}>
            <span className={styles.viewLabel}>Pod</span>
            <span className={styles.viewValue}>{person.pod}</span>
          </div>
        )}
        <div className={styles.viewField}>
          <span className={styles.viewLabel}>Employment</span>
          <span className={styles.viewValue}>{person.employmentType || 'FTE'}</span>
        </div>
        {(person.level ?? 0) > 0 && (
          <div className={styles.viewField}>
            <span className={styles.viewLabel}>Level</span>
            <span className={styles.viewValue}>{person.level}</span>
          </div>
        )}
        {person.publicNote && (
          <div className={styles.viewField}>
            <span className={styles.viewLabel}>Note</span>
            <span className={styles.viewValue}>{person.publicNote}</span>
          </div>
        )}
        {person.private && (
          <div className={styles.viewField}>
            <span className={styles.viewLabel}>Visibility</span>
            <span className={styles.viewValue}>Private</span>
          </div>
        )}
      </div>
      <div className={styles.actions}>
        <button className={styles.editBtn} onClick={() => onSetMode?.('edit')}>Edit</button>
      </div>
    </SidebarShell>
  )
}
```

- [ ] **Step 2: Verify it compiles**

Run: `cd web && npx tsc --noEmit`
Expected: No errors.

---

## Task 11: Create PersonEditSidebar

**Files:**
- Create: `web/src/components/PersonEditSidebar.tsx`

- [ ] **Step 1: Create PersonEditSidebar.tsx**

```typescript
import { useState, useEffect, useMemo, useRef } from 'react'
import { useOrgData, useOrgMutations, useUI, useSelection } from '../store/OrgContext'
import { useSaveStatus } from '../hooks/useSaveStatus'
import { generateCorrelationId } from '../api/client'
import {
  type PersonFormValues,
  personToForm,
  blankForm,
  computeDirtyFields,
  dirtyToApiPayload,
} from '../utils/personFormUtils'
import PersonForm from './PersonForm'
import SidebarShell from './SidebarShell'
import styles from './DetailSidebar.module.css'

interface PersonEditSidebarProps {
  personId: string
  onSetMode?: (mode: 'view' | 'edit') => void
}

export default function PersonEditSidebar({ personId, onSetMode }: PersonEditSidebarProps) {
  const { working } = useOrgData()
  const { update, remove, reparent } = useOrgMutations()
  const { showPrivate } = useUI()
  const { setSelectedId } = useSelection()

  const person = useMemo(() => working.find(p => p.id === personId), [working, personId])

  const [sidebarForm, setSidebarForm] = useState<PersonFormValues>(() =>
    person ? personToForm(person) : blankForm()
  )
  const [showStatusInfo, setShowStatusInfo] = useState(false)
  const { saveStatus, saveError, markSaving, markSaved, markError } = useSaveStatus()
  const firstInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (person) {
      setSidebarForm(personToForm(person))
    }
  }, [person?.id])

  useEffect(() => {
    if (firstInputRef.current) {
      firstInputRef.current.focus()
    }
  }, [])

  const managers = useMemo(() => {
    const managerIds = new Set(working.filter(p => p.managerId).map(p => p.managerId))
    let mgrs = working.filter(p => managerIds.has(p.id))
    if (!showPrivate) {
      mgrs = mgrs.filter(p => !p.private)
    }
    return mgrs.sort((a, b) => a.name.localeCompare(b.name))
  }, [working, showPrivate])

  const handleChange = (field: keyof PersonFormValues, value: string | boolean) => {
    if (field === 'managerId') {
      const newManager = working.find(p => p.id === value as string)
      if (newManager) {
        setSidebarForm(f => ({ ...f, managerId: value as string, team: newManager.team }))
        return
      }
    }
    setSidebarForm(f => ({ ...f, [field]: value }))
  }

  const handleSave = async () => {
    if (!person) return
    markSaving()
    const dirty = computeDirtyFields(personToForm(person), sidebarForm)
    if (!dirty) { markSaved(); return }

    const corrId = generateCorrelationId()
    try {
      const managerChanged = dirty.managerId !== undefined && dirty.managerId !== person.managerId
      if (managerChanged) {
        await reparent(person.id, dirty.managerId as string, corrId)
      }
      const fields = dirtyToApiPayload(dirty)
      if (managerChanged) {
        delete (fields as Record<string, unknown>).team
      }
      if (Object.keys(fields).length > 0) {
        await update(person.id, fields, corrId)
      }
      markSaved()
    } catch {
      markError('Save failed')
    }
  }

  const handleDelete = async () => {
    if (!person) return
    try {
      await remove(person.id)
      setSelectedId(null)
    } catch { /* Error surfaced via OrgContext.error */ }
  }

  if (!person) return null

  return (
    <SidebarShell heading="Edit Person">
      <PersonForm
        values={sidebarForm}
        onChange={handleChange}
        managers={managers}
        showStatusInfo={showStatusInfo}
        onToggleStatusInfo={() => setShowStatusInfo(v => !v)}
        firstInputRef={firstInputRef}
      />
      {saveError && <div className={styles.saveError} style={{ padding: '4px 16px' }}>{saveError}</div>}
      <div className={styles.actions}>
        <button
          className={`${styles.saveBtn} ${saveStatus === 'saved' ? styles.saveBtnSaved : ''}`}
          onClick={handleSave}
          disabled={saveStatus === 'saving'}
          title="Save changes"
        >
          {saveStatus === 'saving' ? 'Saving...' : saveStatus === 'saved' ? 'Saved!' : saveStatus === 'error' ? 'Retry' : 'Save'}
        </button>
        <button className={styles.deleteBtn} onClick={handleDelete} title="Delete this person">Delete</button>
      </div>
    </SidebarShell>
  )
}
```

- [ ] **Step 2: Verify it compiles**

Run: `cd web && npx tsc --noEmit`
Expected: No errors.

---

## Task 12: Create BatchViewSidebar

**Files:**
- Create: `web/src/components/BatchViewSidebar.tsx`

- [ ] **Step 1: Create BatchViewSidebar.tsx**

```typescript
import { useMemo } from 'react'
import { useOrgData, useSelection } from '../store/OrgContext'
import { batchToForm } from '../utils/personFormUtils'
import { MIXED_VALUE } from '../constants'
import SidebarShell from './SidebarShell'
import styles from './DetailSidebar.module.css'

interface BatchViewSidebarProps {
  onSetMode?: (mode: 'view' | 'edit') => void
}

export default function BatchViewSidebar({ onSetMode }: BatchViewSidebarProps) {
  const { working } = useOrgData()
  const { selectedIds, clearSelection } = useSelection()

  const selectedPeople = useMemo(
    () => working.filter(p => selectedIds.has(p.id)),
    [working, selectedIds],
  )

  if (selectedPeople.length === 0) return null

  const batchView = batchToForm(selectedPeople)
  const show = (val: string, fallback = '\u2014') => val === MIXED_VALUE ? 'Mixed' : (val || fallback)
  const managerIds = new Set(selectedPeople.map(p => p.managerId).filter(Boolean))
  const managerLabel = managerIds.size === 1
    ? (working.find(p => p.id === [...managerIds][0])?.name || '(none)')
    : 'Mixed'

  return (
    <SidebarShell heading={`${selectedIds.size} people selected`}>
      <div className={styles.viewBody}>
        <div className={styles.viewField}>
          <span className={styles.viewLabel}>Role</span>
          <span className={styles.viewValue}>{show(batchView.role, 'TBD')}</span>
        </div>
        <div className={styles.viewField}>
          <span className={styles.viewLabel}>Discipline</span>
          <span className={styles.viewValue}>{show(batchView.discipline)}</span>
        </div>
        <div className={styles.viewField}>
          <span className={styles.viewLabel}>Team</span>
          <span className={styles.viewValue}>{show(batchView.team)}</span>
        </div>
        <div className={styles.viewField}>
          <span className={styles.viewLabel}>Manager</span>
          <span className={styles.viewValue}>{managerLabel}</span>
        </div>
        <div className={styles.viewField}>
          <span className={styles.viewLabel}>Status</span>
          <span className={styles.viewValue}>{show(batchView.status)}</span>
        </div>
        {batchView.pod && batchView.pod !== MIXED_VALUE && (
          <div className={styles.viewField}>
            <span className={styles.viewLabel}>Pod</span>
            <span className={styles.viewValue}>{batchView.pod}</span>
          </div>
        )}
        {batchView.pod === MIXED_VALUE && (
          <div className={styles.viewField}>
            <span className={styles.viewLabel}>Pod</span>
            <span className={styles.viewValue}>Mixed</span>
          </div>
        )}
        <div className={styles.viewField}>
          <span className={styles.viewLabel}>Employment</span>
          <span className={styles.viewValue}>{show(batchView.employmentType, 'FTE')}</span>
        </div>
      </div>
      <div className={styles.actions}>
        <button className={styles.editBtn} onClick={() => onSetMode?.('edit')}>Edit</button>
        <button className={styles.deleteBtn} onClick={clearSelection} title="Clear selection">Clear selection</button>
      </div>
    </SidebarShell>
  )
}
```

- [ ] **Step 2: Verify it compiles**

Run: `cd web && npx tsc --noEmit`
Expected: No errors.

---

## Task 13: Create BatchEditSidebar

**Files:**
- Create: `web/src/components/BatchEditSidebar.tsx`

- [ ] **Step 1: Create BatchEditSidebar.tsx**

```typescript
import { useState, useEffect, useMemo } from 'react'
import { useOrgData, useOrgMutations, useUI, useSelection } from '../store/OrgContext'
import { useSaveStatus } from '../hooks/useSaveStatus'
import { generateCorrelationId } from '../api/client'
import {
  type PersonFormValues,
  batchToForm,
  blankForm,
  batchDirtyToApiPayload,
} from '../utils/personFormUtils'
import { MIXED_VALUE } from '../constants'
import PersonForm from './PersonForm'
import SidebarShell from './SidebarShell'
import styles from './DetailSidebar.module.css'

interface BatchEditSidebarProps {
  onSetMode?: (mode: 'view' | 'edit') => void
}

export default function BatchEditSidebar({ onSetMode }: BatchEditSidebarProps) {
  const { working } = useOrgData()
  const { update, reparent } = useOrgMutations()
  const { showPrivate } = useUI()
  const { selectedIds, clearSelection } = useSelection()

  const selectedPeople = useMemo(
    () => working.filter(p => selectedIds.has(p.id)),
    [working, selectedIds],
  )

  const [batchForm, setBatchForm] = useState<PersonFormValues>(blankForm())
  const [batchDirty, setBatchDirty] = useState<Set<string>>(new Set())
  const [showStatusInfo, setShowStatusInfo] = useState(false)
  const { saveStatus, saveError, markSaving, markSaved, markError } = useSaveStatus()

  useEffect(() => {
    setBatchForm(batchToForm(selectedPeople))
    setBatchDirty(new Set())
  }, [selectedIds.size])

  const managers = useMemo(() => {
    const managerIds = new Set(working.filter(p => p.managerId).map(p => p.managerId))
    let mgrs = working.filter(p => managerIds.has(p.id))
    if (!showPrivate) {
      mgrs = mgrs.filter(p => !p.private)
    }
    return mgrs.sort((a, b) => a.name.localeCompare(b.name))
  }, [working, showPrivate])

  const handleChange = (field: keyof PersonFormValues, value: string | boolean) => {
    if (field === 'managerId') {
      const newManager = working.find(p => p.id === value as string)
      if (newManager) {
        setBatchForm(f => ({ ...f, managerId: value as string, team: newManager.team }))
        setBatchDirty(d => { const n = new Set(d); n.add('managerId'); n.add('team'); return n })
        return
      }
    }
    setBatchForm(f => ({ ...f, [field]: value }))
    setBatchDirty(d => new Set(d).add(field))
  }

  const handleSave = async () => {
    markSaving()
    const corrId = generateCorrelationId()

    if (batchDirty.size === 0) { markSaved(); return }
    const managerChanged = batchDirty.has('managerId') && batchForm.managerId !== MIXED_VALUE
    const fields = batchDirtyToApiPayload(batchDirty, batchForm, managerChanged)
    let failedCount = 0
    if (managerChanged) {
      for (const p of selectedPeople) {
        try { await reparent(p.id, batchForm.managerId, corrId) } catch { failedCount++ }
      }
    }
    if (Object.keys(fields).length > 0) {
      for (const p of selectedPeople) {
        try { await update(p.id, fields, corrId) } catch { failedCount++ }
      }
    }
    if (failedCount > 0) {
      markError(`${failedCount} of ${selectedPeople.length} updates failed`)
    } else {
      markSaved()
    }
  }

  const mixedFields = useMemo(() => {
    const s = new Set<string>()
    for (const key of Object.keys(batchForm) as (keyof PersonFormValues)[]) {
      if (typeof batchForm[key] === 'string' && batchForm[key] === MIXED_VALUE) {
        s.add(key)
      }
    }
    return s
  }, [batchForm])

  if (selectedPeople.length === 0) return null

  return (
    <SidebarShell heading={`Edit ${selectedIds.size} people`}>
      <PersonForm
        values={batchForm}
        onChange={handleChange}
        managers={managers}
        isBatch
        mixedFields={mixedFields}
        showStatusInfo={showStatusInfo}
        onToggleStatusInfo={() => setShowStatusInfo(v => !v)}
      />
      {saveError && <div className={styles.saveError} style={{ padding: '4px 16px' }}>{saveError}</div>}
      <div className={styles.actions}>
        <button
          className={`${styles.saveBtn} ${saveStatus === 'saved' ? styles.saveBtnSaved : ''}`}
          onClick={handleSave}
          disabled={batchDirty.size === 0 || saveStatus === 'saving'}
          title="Save changes"
        >
          {saveStatus === 'saving' ? 'Saving...' : saveStatus === 'saved' ? 'Saved!' : saveStatus === 'error' ? 'Retry' : 'Save'}
        </button>
        <button className={styles.deleteBtn} onClick={clearSelection} title="Clear selection">Clear selection</button>
      </div>
    </SidebarShell>
  )
}
```

- [ ] **Step 2: Verify it compiles**

Run: `cd web && npx tsc --noEmit`
Expected: No errors.

---

## Task 14: Replace DetailSidebar with thin router

**Files:**
- Modify: `web/src/components/DetailSidebar.tsx`

- [ ] **Step 1: Replace DetailSidebar.tsx with router**

Replace the entire file content with:

```typescript
import { useOrgData, useSelection } from '../store/OrgContext'
import PodSidebar from './PodSidebar'
import PersonViewSidebar from './PersonViewSidebar'
import PersonEditSidebar from './PersonEditSidebar'
import BatchViewSidebar from './BatchViewSidebar'
import BatchEditSidebar from './BatchEditSidebar'

interface DetailSidebarProps {
  mode?: 'view' | 'edit'
  onSetMode?: (mode: 'view' | 'edit') => void
}

export default function DetailSidebar({ mode = 'view', onSetMode }: DetailSidebarProps) {
  const { working } = useOrgData()
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

- [ ] **Step 2: Verify TypeScript compiles**

Run: `cd web && npx tsc --noEmit`
Expected: No errors.

- [ ] **Step 3: Run all tests**

Run: `cd web && npm test`
Expected: All tests pass. All existing DetailSidebar tests render the `<DetailSidebar>` component which is now a router — the tests exercise the same code paths through the sub-components.

- [ ] **Step 4: Commit Part 2**

```bash
jj new -m "refactor: extract DetailSidebar into focused sub-components

DetailSidebar (386 lines) -> thin router (35 lines) + 5 sub-components:
- SidebarShell: shared aside + header + close button
- PersonViewSidebar: single person read-only display
- PersonEditSidebar: single person edit form + save
- BatchViewSidebar: batch read-only with Mixed handling
- BatchEditSidebar: batch edit form + save

Each edit component owns its own form state and save handler,
eliminating the mirrored logic that was a maintenance risk."
```

---

## Task 15: Final verification

- [ ] **Step 1: Run full test suite**

Run: `cd web && npm test`
Expected: All tests pass.

- [ ] **Step 2: Run TypeScript check**

Run: `cd web && npx tsc --noEmit`
Expected: No errors.

- [ ] **Step 3: Build the frontend**

Run: `make frontend`
Expected: Build succeeds.

- [ ] **Step 4: Smoke test in browser**

Run: `make dev`
Verify:
1. Upload a CSV file — org chart renders
2. Click a person — view sidebar appears
3. Click Edit — edit sidebar with form
4. Select multiple people — batch view sidebar
5. Click Edit on batch — batch edit sidebar
6. Undo/redo work
7. Snapshots work
8. No console errors
