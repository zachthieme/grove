# Split ViewDataContext into Granular Sub-Contexts

**Issue:** #46
**Scope:** Split `ViewDataContext` into 4 focused contexts. No behavior change.

## Problem

`ViewDataContext` broadcasts ~17 values to all consumers via a single context. Any change to any value (column visibility toggle, info popover open, person edit) triggers re-renders in every consumer — including the entire chart tree and table. With 500+ person orgs, this creates unnecessary DOM reconciliation.

## Design

### 4 Contexts

**PeopleContext** — derived data that changes when the org changes:
```typescript
interface PeopleContextValue {
  people: Person[]
  ghostPeople: Person[]
  managerSet: Set<string>
  readOnly: boolean
  pods: Pod[]
  showChanges: boolean
}
```

**ChangesContext** — diff map (changes when toggling diff view or editing):
```typescript
interface ChangesContextValue {
  changes: Map<string, PersonChange> | undefined
}
```

**ActionsContext** — callbacks and info popover (callbacks are stable, popover changes on click):
```typescript
interface ActionsContextValue {
  handleSelect: (id: string, event?: React.MouseEvent) => void
  handleAddReport: (parentId: string) => Promise<void>
  handleAddToTeam: (parentId: string, team: string, podName?: string) => Promise<void>
  handleDeletePerson: (personId: string) => Promise<void>
  handleShowInfo: (personId: string) => void
  handleFocus: (personId: string) => void
  infoPopoverId: string | null
  clearInfoPopover: () => void
}
```

**ColumnsContext** — table-specific column configuration:
```typescript
interface ColumnsContextValue {
  extraColumns: ColumnDef[]
  visibleColumns: Set<string>
  toggleColumnVisibility: (key: string) => void
}
```

### Provider Structure

`ViewDataProvider` stays as the single provider component. Internally it creates all 4 context values with separate `useMemo` calls and nests the 4 providers:

```tsx
export function ViewDataProvider({ children }: { children: ReactNode }) {
  // ... same hook setup as today ...

  const peopleValue = useMemo(() => ({
    people, ghostPeople, managerSet, readOnly, pods, showChanges,
  }), [people, ghostPeople, managerSet, readOnly, pods, showChanges])

  const changesValue = useMemo(() => ({
    changes: showChanges ? changes : undefined,
  }), [showChanges, changes])

  const actionsValue = useMemo(() => ({
    handleSelect, handleAddReport, handleAddToTeam, handleDeletePerson,
    handleShowInfo, handleFocus, infoPopoverId, clearInfoPopover,
  }), [handleSelect, handleAddReport, handleAddToTeam, handleDeletePerson,
       handleShowInfo, handleFocus, infoPopoverId, clearInfoPopover])

  const columnsValue = useMemo(() => ({
    extraColumns, visibleColumns, toggleColumnVisibility,
  }), [extraColumns, visibleColumns, toggleColumnVisibility])

  return (
    <PeopleCtx.Provider value={peopleValue}>
      <ChangesCtx.Provider value={changesValue}>
        <ActionsCtx.Provider value={actionsValue}>
          <ColumnsCtx.Provider value={columnsValue}>
            {children}
          </ColumnsCtx.Provider>
        </ActionsCtx.Provider>
      </ChangesCtx.Provider>
    </PeopleCtx.Provider>
  )
}
```

### Hooks

4 new granular hooks plus backward-compat `useViewData`:

```typescript
export function usePeople(): PeopleContextValue { ... }
export function useChanges(): ChangesContextValue { ... }
export function useActions(): ActionsContextValue { ... }
export function useColumns(): ColumnsContextValue { ... }

// Backward compat — composes all 4, re-renders on any change
export function useViewData(): ViewDataContextValue {
  return { ...usePeople(), ...useChanges(), ...useActions(), ...useColumns() }
}
```

### Consumer Updates

| Consumer | Before | After |
|----------|--------|-------|
| ChartShell.tsx | `useViewData()` | `usePeople()` + `useChanges()` + `useActions()` |
| TableView.tsx | `useViewData()` | `usePeople()` + `useChanges()` + `useColumns()` |
| App.tsx | `useViewData()` | `useActions()` |

### Test Helper

`renderWithViewData` in `test-helpers.tsx` currently accepts a partial `ViewDataContextValue`. Update it to provide all 4 context providers with the split values. Existing test call sites should work unchanged since the override shape hasn't changed — they pass partial objects and the helper fills in defaults.

## Re-render Impact

| Event | Before (1 context) | After (4 contexts) |
|-------|-------|-------|
| Toggle column visibility | All views | TableView only |
| Open info popover | All views | App.tsx only |
| Toggle diff view | All views | People + Changes consumers |
| Edit a person | All views | People consumers |

## Files Changed

| File | Change |
|------|--------|
| `web/src/store/ViewDataContext.tsx` | Split into 4 internal contexts, 4 hooks, keep ViewDataProvider |
| `web/src/views/ChartShell.tsx` | `usePeople()` + `useChanges()` + `useActions()` |
| `web/src/views/TableView.tsx` | `usePeople()` + `useChanges()` + `useColumns()` |
| `web/src/App.tsx` | `useActions()` |
| `web/src/test-helpers.tsx` | Update `renderWithViewData` to provide 4 contexts |

## Not in Scope

- Migrating to Zustand/Jotai (future consideration if 4 contexts still aren't granular enough)
- Splitting `ViewDataProvider` into separate files (it's ~180 lines, stays in one file)
- Performance profiling (this is a structural improvement, not a measured optimization)
