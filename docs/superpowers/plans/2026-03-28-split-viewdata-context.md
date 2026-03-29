# Split ViewDataContext — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Split ViewDataContext into 3 focused contexts (People, Changes, Actions) to reduce unnecessary re-renders, and remove dead column config code.

**Architecture:** Keep `ViewDataProvider` as the single provider component. Create 3 internal contexts with separate `useMemo` calls. Export granular hooks (`usePeople`, `useChanges`, `useActions`). Update consumers to use the specific hooks they need. Keep `useViewData` as a backward-compat re-export.

**Tech Stack:** React 19, TypeScript

**Discovery note:** During planning, found that `extraColumns`, `visibleColumns`, and `toggleColumnVisibility` in ViewDataContext are dead code — TableView manages column state locally. Task 1 removes this dead code before the split.

---

### Task 1: Remove dead column config from ViewDataContext

The `extraColumns`, `visibleColumns`, and `toggleColumnVisibility` in ViewDataContext are never consumed by any component. TableView computes its own column config locally. Remove this dead code.

**Files:**
- Modify: `web/src/store/ViewDataContext.tsx`

- [ ] **Step 1: Remove column config from ViewDataContextValue interface**

Remove these 3 lines from the interface (lines 37-39):
```typescript
  extraColumns: ColumnDef[]
  visibleColumns: Set<string>
  toggleColumnVisibility: (key: string) => void
```

- [ ] **Step 2: Remove column config code from ViewDataProvider**

Remove from the provider function body (lines 132-157):
- The `extraColumns` useMemo
- The `visibleColumns` useState
- The `useEffect` for initializing visible columns
- The `toggleColumnVisibility` useCallback

Remove from the `value` useMemo (lines 175-177):
- `extraColumns`, `visibleColumns`, `toggleColumnVisibility`

Remove from the useMemo dependency array (line 182):
- `extraColumns, visibleColumns, toggleColumnVisibility`

- [ ] **Step 3: Remove unused imports**

Remove `buildExtraColumns` import and `ColumnDef` type import if they become unused.

- [ ] **Step 4: Run tests**

Run: `cd web && npm test`
Expected: All 548 pass — no consumer uses these values

- [ ] **Step 5: Commit**

```
jj describe -m "refactor: remove dead column config from ViewDataContext"
jj new
```

---

### Task 2: Split ViewDataContext into 3 internal contexts

Replace the single context with 3 focused contexts inside the same file. Keep `ViewDataProvider` as the single provider.

**Files:**
- Modify: `web/src/store/ViewDataContext.tsx`

- [ ] **Step 1: Define 3 context interfaces**

Replace the current `ViewDataContextValue` interface with 3 smaller ones:

```typescript
export interface PeopleContextValue {
  people: Person[]
  ghostPeople: Person[]
  managerSet: Set<string>
  readOnly: boolean
  pods: Pod[]
  showChanges: boolean
}

export interface ChangesContextValue {
  changes: Map<string, PersonChange> | undefined
}

export interface ActionsContextValue {
  handleSelect: (id: string, event?: React.MouseEvent) => void
  handleAddReport: (parentId: string) => Promise<void>
  handleAddToTeam: (parentId: string, team: string, podName?: string) => Promise<void>
  handleDeletePerson: (personId: string) => Promise<void>
  handleShowInfo: (personId: string) => void
  handleFocus: (personId: string) => void
  infoPopoverId: string | null
  clearInfoPopover: () => void
}

// Backward compat — union of all 3
export type ViewDataContextValue = PeopleContextValue & ChangesContextValue & ActionsContextValue
```

- [ ] **Step 2: Create 3 contexts**

Replace the single `ViewDataContext` with:

```typescript
const PeopleCtx = createContext<PeopleContextValue | null>(null)
const ChangesCtx = createContext<ChangesContextValue | null>(null)
const ActionsCtx = createContext<ActionsContextValue | null>(null)
```

- [ ] **Step 3: Add 3 granular hooks**

```typescript
export function usePeople(): PeopleContextValue {
  const ctx = useContext(PeopleCtx)
  if (!ctx) throw new Error('usePeople must be used within a ViewDataProvider')
  return ctx
}

export function useChanges(): ChangesContextValue {
  const ctx = useContext(ChangesCtx)
  if (!ctx) throw new Error('useChanges must be used within a ViewDataProvider')
  return ctx
}

export function useActions(): ActionsContextValue {
  const ctx = useContext(ActionsCtx)
  if (!ctx) throw new Error('useActions must be used within a ViewDataProvider')
  return ctx
}
```

- [ ] **Step 4: Update useViewData to compose all 3**

```typescript
export function useViewData(): ViewDataContextValue {
  return { ...usePeople(), ...useChanges(), ...useActions() }
}
```

- [ ] **Step 5: Update ViewDataProvider to create 3 values and nest 3 providers**

Replace the single `value` useMemo with 3 separate useMemo calls:

```typescript
const peopleValue: PeopleContextValue = useMemo(() => ({
  people, ghostPeople, managerSet, readOnly, pods, showChanges,
}), [people, ghostPeople, managerSet, readOnly, pods, showChanges])

const changesValue: ChangesContextValue = useMemo(() => ({
  changes: showChanges ? changes : undefined,
}), [showChanges, changes])

const actionsValue: ActionsContextValue = useMemo(() => ({
  handleSelect, handleAddReport, handleAddToTeam, handleDeletePerson,
  handleShowInfo, handleFocus, infoPopoverId, clearInfoPopover,
}), [handleSelect, handleAddReport, handleAddToTeam, handleDeletePerson,
     handleShowInfo, handleFocus, infoPopoverId, clearInfoPopover])
```

Replace the single `<ViewDataContext.Provider>` with nested providers:

```tsx
return (
  <PeopleCtx.Provider value={peopleValue}>
    <ChangesCtx.Provider value={changesValue}>
      <ActionsCtx.Provider value={actionsValue}>
        {children}
      </ActionsCtx.Provider>
    </ChangesCtx.Provider>
  </PeopleCtx.Provider>
)
```

- [ ] **Step 6: Run tests**

Run: `cd web && npm test`
Expected: All pass — `useViewData()` still works as before since it composes all 3

- [ ] **Step 7: Commit**

```
jj describe -m "refactor: split ViewDataContext into People, Changes, Actions contexts"
jj new
```

---

### Task 3: Update ChartShell to use granular hooks

**Files:**
- Modify: `web/src/views/ChartShell.tsx`

- [ ] **Step 1: Replace useViewData with granular hooks**

Change the import:
```typescript
// FROM:
import { useViewData } from '../store/ViewDataContext'

// TO:
import { usePeople, useChanges, useActions } from '../store/ViewDataContext'
```

Change the hook calls (currently around line 40-43):
```typescript
// FROM:
const {
  people, ghostPeople, changes, managerSet, pods,
  handleSelect, handleAddReport, handleAddToTeam, handleDeletePerson, handleShowInfo, handleFocus,
} = useViewData()

// TO:
const { people, ghostPeople, managerSet, pods } = usePeople()
const { changes } = useChanges()
const { handleSelect, handleAddReport, handleAddToTeam, handleDeletePerson, handleShowInfo, handleFocus } = useActions()
```

- [ ] **Step 2: Run tests**

Run: `cd web && npm test`
Expected: All pass

- [ ] **Step 3: Commit**

```
jj describe -m "refactor: ChartShell uses granular usePeople/useChanges/useActions hooks"
jj new
```

---

### Task 4: Update TableView to use granular hooks

**Files:**
- Modify: `web/src/views/TableView.tsx`

- [ ] **Step 1: Replace useViewData with granular hooks**

Change the import:
```typescript
// FROM:
import { useViewData } from '../store/ViewDataContext'

// TO:
import { usePeople, useChanges } from '../store/ViewDataContext'
```

Change the hook call (line 36):
```typescript
// FROM:
const { people, changes, readOnly } = useViewData()

// TO:
const { people, readOnly } = usePeople()
const { changes } = useChanges()
```

- [ ] **Step 2: Run tests**

Run: `cd web && npm test`
Expected: All pass

- [ ] **Step 3: Commit**

```
jj describe -m "refactor: TableView uses granular usePeople/useChanges hooks"
jj new
```

---

### Task 5: Update App.tsx to use granular hooks

**Files:**
- Modify: `web/src/App.tsx`

- [ ] **Step 1: Replace useViewData with useActions**

Change the import:
```typescript
// FROM:
import { useViewData } from './store/ViewDataContext'

// TO:
import { useActions } from './store/ViewDataContext'
```

Change the hook call (line 28):
```typescript
// FROM:
const { infoPopoverId, clearInfoPopover } = useViewData()

// TO:
const { infoPopoverId, clearInfoPopover } = useActions()
```

- [ ] **Step 2: Run tests**

Run: `cd web && npm test`
Expected: All pass

- [ ] **Step 3: Commit**

```
jj describe -m "refactor: App.tsx uses granular useActions hook"
jj new
```

---

### Task 6: Update test helpers

Update `renderWithViewData` in test-helpers.tsx. Since `ViewDataProvider` still works unchanged (it creates all 3 internal contexts), the helper actually doesn't need changes — it wraps components in `ViewDataProvider` which provides all contexts. Verify this is the case.

**Files:**
- Verify: `web/src/test-helpers.tsx`

- [ ] **Step 1: Verify renderWithViewData still works**

Read `test-helpers.tsx`. The `renderWithViewData` function wraps components in `OrgOverrideProvider` + `ViewDataProvider`. Since `ViewDataProvider` now creates all 3 internal contexts, all consumers (including those using the granular hooks) get their values. No changes needed.

- [ ] **Step 2: Run full test suite to confirm**

Run: `cd web && npm test`
Expected: All 548 tests pass

- [ ] **Step 3: Verify no remaining useViewData in consumer files**

Grep for `useViewData` in consumer files (not ViewDataContext.tsx itself, not test-helpers.tsx):
```
grep -rn 'useViewData' web/src/ --include='*.tsx' | grep -v ViewDataContext | grep -v test-helpers | grep -v '\.test\.'
```
Expected: No matches (all consumers now use granular hooks)

- [ ] **Step 4: Run full stack test**

Run: `go test ./... && cd web && npm test`
Expected: All pass

- [ ] **Step 5: Commit if any cleanup needed**

```
refactor: verify ViewDataContext split — all consumers use granular hooks
```
