# ViewDataProvider Design

**Date:** 2026-03-28
**Status:** Approved
**Issue:** #31

## Problem

App.tsx is a 250-line component that computes derived view data (filtered people, diffs, manager sets), assembles ~10 callback wrappers, then passes 14 props to ColumnView and 12 to ManagerView. The views immediately stuff these into ChartProvider — they're pass-through middlemen.

Adding a new computed property (like custom column visibility) means threading another prop through App → View → ChartProvider.

## Design

### New context: ViewDataContext

A `ViewDataProvider` sits between `OrgProvider` and the views. It:

1. Consumes `useOrg()` for raw state and mutations
2. Runs derived computations: `useOrgDiff`, `useManagerSet`, `useFilteredPeople`, `useSortedPeople`, `useHeadSubtree`
3. Builds action callbacks: `handleSelect`, `handleAddReport`, `handleAddToTeam`, `handleDeletePerson`, `handleShowInfo`, `handleFocus`
4. Exposes `extraColumns` (auto-discovered from `Person.extra`) and `visibleColumns` (user-togglable)

### Component tree

```
OrgProvider (raw state + mutations)
  └─ ViewDataProvider (derived state + actions + column config)
       ├─ Toolbar
       ├─ ColumnView  ← consumes useViewData(), no props
       ├─ ManagerView ← same
       ├─ TableView   ← same
       └─ DetailSidebar
```

### ViewDataContextValue interface

```typescript
interface ViewDataContextValue {
  // Derived data
  people: Person[]              // filtered + sorted
  ghostPeople: Person[]         // diff-mode ghosts
  changes: Map<string, PersonChange> | undefined
  managerSet: Set<string>
  showChanges: boolean
  readOnly: boolean             // dataView === 'original'

  // Actions (callbacks that compose OrgContext mutations)
  handleSelect: (id: string, event?: React.MouseEvent) => void
  handleAddReport: (parentId: string) => Promise<void>
  handleAddToTeam: (parentId: string, team: string, podName?: string) => Promise<void>
  handleDeletePerson: (personId: string) => Promise<void>
  handleShowInfo: (personId: string) => void
  handleFocus: (personId: string) => void

  // Info popover state (moved from App local state)
  infoPopoverId: string | null
  clearInfoPopover: () => void

  // Column configuration
  extraColumns: ColumnDef[]
  visibleColumns: Set<string>
  toggleColumnVisibility: (key: string) => void
}
```

### What stays in App.tsx

- Layout shell (error banners, breadcrumbs, sidebar, modals)
- Export hooks (`useExport`, `useSnapshotExport`) — these need `mainRef`
- `useAutosave` — needs suppression ref from snapshot export
- `useEscapeKey` — UI-level key handlers
- Logging state
- Wrapping content in `<ViewDataProvider>`

### What moves to ViewDataProvider

- `rawPeople`, `changes`, `managerSet`, `headSubtree`, `people`, `ghostPeople`, `sortedPeople`
- `handleSelect`, `handleAddReport`, `handleAddToTeam`, `handleDeletePerson`
- `handleShowInfo`, `handleFocus`, `infoPopoverId`
- Column discovery (`buildExtraColumns`) and visibility state

### View changes

**ColumnView:** Drops from 14 props to 0. Calls `useViewData()` internally, creates ChartProvider from that.

**ManagerView:** Drops from 12 props to 0. Same pattern.

**TableView:** Drops from 3 props to 0. Gets `people`, `changes`, `readOnly`, `extraColumns`, `visibleColumns` from context.

### Testing

- `ViewDataContext.test.tsx`: test derived computations, action callbacks, column visibility
- Existing view golden tests: update to use `ViewDataOverrideProvider` instead of direct props
- `renderWithViewData()` helper for test isolation

### Column visibility

- `extraColumns` auto-discovered from `Person.extra` keys via `buildExtraColumns`
- `visibleColumns` defaults to all standard columns + all discovered extra columns
- `toggleColumnVisibility(key)` adds/removes from the set
- TableView reads `visibleColumns` to filter which columns to render
- Persisted to localStorage (stretch goal, not in initial implementation)

## Migration strategy

1. Create `ViewDataContext.tsx` with all derived computations
2. Update each view one at a time to consume from context
3. Remove props from view interfaces
4. Slim App.tsx last (once all views are migrated)
5. Add column visibility state
6. Update tests

Each step should leave the app in a working state.
