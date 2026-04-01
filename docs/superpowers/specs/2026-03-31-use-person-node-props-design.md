# usePersonNodeProps Hook Design — #102

Extract the ChartContext-to-PersonNode prop mapping into a reusable hook.

## Problem

ColumnView and ManagerView each destructure 19-23 ChartContext properties to manually map them into PersonNode props. The mapping logic (`selected={selectedIds.has(id)}`, `editing={interactionMode === 'editing' && editingPersonId === id}`, etc.) is duplicated across both views and the `renderIC` callback.

## Fix

Create `usePersonNodeProps(person)` that reads from `useChart()` and returns all PersonNode props except `person`, `showTeam`, `collapsed`, and `onToggleCollapse` (which are view-specific). Consumers spread the result and add the view-specific props.

### Hook return type

```typescript
interface PersonNodeCommonProps {
  selected: boolean
  changes?: PersonChange
  isManager?: boolean
  editing: boolean
  editBuffer: EditBuffer | null
  focusField: 'name' | null
  onAdd?: () => void
  onAddParent?: () => void
  onDelete?: () => void
  onInfo?: () => void
  onFocus?: () => void
  onEditMode?: () => void
  onClick: (e?: React.MouseEvent) => void
  onEnterEditing?: () => void
  onUpdateBuffer?: (field: string, value: string) => void
  onCommitEdits?: () => void
  cardRef: (el: HTMLDivElement | null) => void
}
```

### Consumer usage

```typescript
// IC rendering (ColumnView renderIC, ManagerView)
const props = usePersonNodeProps(ic.person)
<PersonNode person={ic.person} {...props} />

// Manager rendering (ColumnView managerNodeEl, ManagerView)
const props = usePersonNodeProps(node.person)
<PersonNode person={node.person} showTeam={...} collapsed={...} onToggleCollapse={...} {...props} />
```

### Files

- Create: `web/src/hooks/usePersonNodeProps.ts`
- Modify: `web/src/views/ColumnView.tsx` — use hook in LayoutSubtree and LayoutTeamGroup
- Modify: `web/src/views/ManagerView.tsx` — use hook in ManagerLayoutSubtree
- Test: `web/src/hooks/usePersonNodeProps.test.tsx`
