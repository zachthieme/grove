# Pod/Group Interactions Design — #97, #99, #98

Enable selection highlighting and drag on GroupHeaderNode (pods and team groups).

## #97 — Collapsible pods

Already working. ColumnView wires `collapsed`, `onToggleCollapse`, and `collapsedIds` to `GroupHeaderNode` for pod groups. `BaseNode` renders the collapse toggle. Close the issue.

## #99 — Selection highlighting on GroupHeaderNode

### Problem

`selectedPodId` exists in SelectionContext but isn't threaded through ChartContext. Views can't highlight the selected pod's GroupHeaderNode. Team groups have no selection wiring at all.

### Fix

1. Add `selectedPodId` to ChartContext value (from `selection.selectedPodId` in ChartShell)
2. In ColumnView `renderPodGroup`: pass `selected={selectedPodId === pod?.id}` to `GroupHeaderNode`
3. In ColumnView `LayoutTeamGroup`: wire `onClick` to add collapse key to `selectedIds` via `onSelect`
4. In ManagerView: wire selection for root-level team groups and within-subtree team/pod groups where applicable

### Files

- `web/src/views/ChartContext.tsx` — add `selectedPodId` to `ChartContextValue`
- `web/src/views/ChartShell.tsx` — thread `selection.selectedPodId` into chart value
- `web/src/views/ColumnView.tsx` — pass `selected` to pod GroupHeaderNode, wire team group onClick
- `web/src/views/ManagerView.tsx` — no changes needed (pods render as SummaryCard, team groups as SummaryCard — neither uses GroupHeaderNode in ManagerView)

## #98 — Drag source on GroupHeaderNode

### Problem

GroupHeaderNode is already `draggable` via BaseNode, but `useDragDrop.ts` treats the dragged ID as a person ID. When a group header is dragged, `active.id` is the collapse key (e.g., `pod:mgr-id:Alpha`) and the move fails silently.

### Fix

Pass member IDs as drag data from GroupHeaderNode consumers. In `useDragDrop.ts`, detect group drags via `active.data.current?.memberIds` and bulk-move all members.

1. In ColumnView `renderPodGroup`: pass `dragData={{ memberIds: group.members.map(m => m.person.id) }}` to `GroupHeaderNode`
2. Add `dragData` prop to `GroupHeaderNode` interface, pass through to `BaseNode`
3. In `useDragDrop.ts`: check `active.data.current?.memberIds` — if present, use those IDs instead of `[draggedId]` for the move targets

### Files

- `web/src/components/GroupHeaderNode.tsx` — add `dragData` prop, pass to BaseNode
- `web/src/views/ColumnView.tsx` — pass `dragData` with member IDs to pod and team group headers
- `web/src/hooks/useDragDrop.ts` — detect group drags via `memberIds` in drag data, bulk-move

## Testing

- Unit test: `useDragDrop` with `memberIds` in drag data moves all members
- Existing collapse tests cover #97
- Selection highlighting covered by checking `selected` prop propagation
