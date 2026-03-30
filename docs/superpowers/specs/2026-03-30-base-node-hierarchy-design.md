# BaseNode Hierarchy Design

## Problem

The org chart renders four logical node types (IC, manager, pod header, orphan team header) using two components (PersonNode, PodHeaderNode) with ~15 conditional flags controlling behavior. Shared capabilities — note icon positioning, collapse toggle, edge anchoring, hover actions, drag/drop — are implemented independently in each component, creating a class of bugs where fixing a behavior in one node type doesn't fix it in the other.

Recent examples:
- Note icon positioned relative to wrapper (includes collapse toggle) instead of card — fixed separately in PersonNode and PodHeaderNode
- Edge lines anchoring to wrapper bottom instead of card bottom — required threading a `cardRef` prop through DraggableNode to PersonNode
- Collapse toggle added to pods required duplicating the same button/CSS from PersonNode
- Orphan team headers lacked collapse support because they used a different render path

Each new feature (drag on groups, selection on groups) requires wiring the same capability into a separate component, increasing the surface for inconsistency.

## Design

### Node Type Hierarchy

Three concrete node types, one shared base:

```
BaseNode (shared wrapper, capabilities, structure)
├── PersonNode (IC or Manager)
└── GroupHeaderNode (pod headers and orphan team groups)
```

PersonNode handles both IC and manager rendering via a `variant` prop. The visual difference (green left border, team label, larger name font) doesn't warrant a separate component — it's a styling variant of the same structure.

### Capability Matrix

Each capability is opt-in via BaseNode props. Concrete types declare which capabilities they use.

| Capability | PersonNode (IC) | PersonNode (Manager) | GroupHeaderNode |
|---|---|---|---|
| Card shell (border, shadow, hover lift) | yes | yes | yes |
| Note icon + panel | yes | yes | yes |
| Collapse toggle | no | yes | yes |
| Hover action buttons | yes | yes | yes |
| Warning dot | yes | yes | no |
| Private icon | yes | yes | no |
| Drag source | yes | yes | yes |
| Drop target | yes | yes | yes |
| Edge anchor (cardRef) | yes | yes | yes |
| Inline editing | yes | yes | no |
| Selection highlight | yes | yes | yes |
| Status styling (dashed border, prefix) | yes | yes | no |
| Employment type accent (right border) | yes | yes | no |

**Justification for "no" entries:**

- **Collapse toggle on IC:** ICs have no children to collapse.
- **Warning dot on GroupHeader:** Warnings come from person-level data validation (missing manager, duplicate name). Groups don't have person-level fields to validate.
- **Private icon on GroupHeader:** Privacy is a person attribute. A group containing private people isn't itself private.
- **Inline editing on GroupHeader:** Group details (pod name, notes) are edited via the sidebar, not inline on the card.
- **Status styling on GroupHeader:** Status (Active, Backfill, Transfer) is a person attribute. Groups don't have a status.
- **Emp type accent on GroupHeader:** Employment type is a person attribute.

### BaseNode Component Structure

BaseNode owns the DOM structure that today is duplicated across PersonNode and PodHeaderNode:

```
BaseNode wrapper (.wrapper)
  [hover] ActionBar (positioned above card)
  [conditional] WarningDot (absolute, top-left of wrapper)
  [conditional] PrivateIcon (absolute, top-right of wrapper)
  .cardArea (position: relative - note icon anchors here)
    .node (the card - cardRef anchors here for edge lines)
      {children} - concrete type injects content here
    [conditional] NoteIcon (absolute, bottom-right of cardArea)
    [conditional] NotePanel (normal flow inside cardArea)
  [conditional] CollapseToggle (outside cardArea, doesn't affect note/edge positioning)
  [integrated] DragHandle + DropTarget (dnd-kit, when draggable/droppable enabled)
```

This structure guarantees:
- Note icon always positions relative to `.cardArea`, not the wrapper
- Edge lines always anchor to `.node` via `cardRef`, unaffected by collapse toggle or note panel
- Collapse toggle never shifts note icon or edge anchor points
- No nested interactive controls (a11y compliance)

### BaseNode Props Interface

```ts
interface BaseNodeProps {
  // Identity
  nodeId: string

  // Content
  children: ReactNode

  // Visual variant
  variant?: 'default' | 'manager' | 'group'
  statusStyle?: 'recruiting' | 'planned' | 'transfer'
  empAccent?: string  // right border color (CSS color value)

  // Capabilities (opt-in)
  noteText?: string
  collapsed?: boolean
  onToggleCollapse?: () => void
  selected?: boolean
  onClick?: (e?: React.MouseEvent) => void
  warning?: string
  isPrivate?: boolean
  draggable?: boolean
  droppable?: boolean
  cardRef?: (el: HTMLDivElement | null) => void

  // Hover actions — which buttons to show, with callbacks
  actions?: {
    onAdd?: (e: React.MouseEvent) => void
    onAddParent?: (e: React.MouseEvent) => void
    onDelete?: (e: React.MouseEvent) => void
    onEdit?: (e: React.MouseEvent) => void
    onInfo?: (e: React.MouseEvent) => void
    onFocus?: (e: React.MouseEvent) => void
  }

  // Inline editing
  editing?: boolean
  editBuffer?: EditBuffer | null
  onEnterEditing?: () => void
  onUpdateBuffer?: (field: string, value: string) => void
  onCommitEdits?: () => void
}
```

### Concrete Types

**PersonNode** — thin wrapper providing card body content:

```tsx
function PersonNode({ person, isManager, ...capabilities }) {
  return (
    <BaseNode
      nodeId={person.id}
      variant={isManager ? 'manager' : 'default'}
      statusStyle={getStatusStyle(person.status)}
      empAccent={getEmpColor(person.employmentType)}
      warning={person.warning}
      isPrivate={person.private}
      noteText={person.publicNote}
      draggable
      droppable
      {...capabilities}
    >
      <NameLine>{person.name}</NameLine>
      {isManager && <TeamLine>{person.team}</TeamLine>}
      <RoleLine>{person.role}{empAbbrev}</RoleLine>
    </BaseNode>
  )
}
```

**GroupHeaderNode** — name + count:

```tsx
function GroupHeaderNode({ name, count, noteText, ...capabilities }) {
  return (
    <BaseNode
      variant="group"
      noteText={noteText}
      draggable
      droppable
      {...capabilities}
    >
      <NameLine>{name}</NameLine>
      <CountLine>{count} {count === 1 ? 'person' : 'people'}</CountLine>
    </BaseNode>
  )
}
```

### DraggableNode Absorption

The current `DraggableNode` wrapper in `shared.tsx` is absorbed into BaseNode. When `draggable` or `droppable` is true, BaseNode internally calls `useDraggable` / `useDroppable` from dnd-kit and wires the refs. The separate DraggableNode component is removed.

This means:
- `nodeRef` from ChartLayout always targets `.node` (via `cardRef`) regardless of drag/drop state
- Drop target styling (green outline on hover) is handled inside BaseNode
- Drag opacity (0.3 when dragging) is handled inside BaseNode

### CSS Variant System

BaseNode uses a single CSS module (`BaseNode.module.css`) with variant classes:

```css
.node { /* shared card styles */ }
.manager { border-left: 3.5px solid var(--grove-green); }
.manager .name { font-size: 13.5px; }
.group { border-left: 3.5px solid var(--grove-green); }
.selected { border-color: var(--grove-green); box-shadow: var(--shadow-focus); }
.recruiting { border-style: dashed; background: var(--grove-green-soft); }
.planned { border-style: dashed; background: var(--surface-sunken); }
.transfer { border-style: dashed; background: var(--grove-gold-light); }
```

Status, selection, and variant classes compose. PersonNode and GroupHeaderNode don't need their own CSS modules for card structure — only for content-specific styling if needed.

## Migration Strategy

Four phases, each a separate commit that passes all tests.

### Phase 1: Build BaseNode

Create `BaseNode.tsx` and `BaseNode.module.css` as new files alongside existing components. No existing code changes. Write unit tests for BaseNode covering every capability and variant combination.

### Phase 2: Migrate PersonNode

Replace PersonNode's internal wrapper/cardArea/node/noteIcon/collapseToggle structure with BaseNode composition. PersonNode becomes a thin wrapper passing content as children. Absorb DraggableNode into BaseNode. Update shared.tsx to export PersonNode directly without DraggableNode wrapping.

All existing PersonNode tests pass without changes (same behavior, same props interface to callers). Update golden snapshots for new DOM structure.

### Phase 3: Migrate PodHeaderNode to GroupHeaderNode

Replace PodHeaderNode with GroupHeaderNode built on BaseNode. Update all import sites (ColumnView, OrphanGroup, ChartShell). Add drag source (#98) and selection highlight (#99) as part of this migration since BaseNode already provides them. Remove PodHeaderNode files.

### Phase 4: Remove dead code

Delete unused PersonNode wrapper/cardArea CSS, old PodHeaderNode component and CSS, DraggableNode from shared.tsx. Clean up any remaining references.

## Testing Strategy

### BaseNode Unit Tests

One test per capability, parameterized across variants where applicable:

| Test | Verifies |
|---|---|
| renders card shell with correct variant class | `default`, `manager`, `group` each get right border/font |
| note icon appears only when noteText provided | no noteText = no icon |
| note icon positions relative to cardArea | bottom of card, not wrapper |
| note panel toggles on icon click | open/close, aria-expanded |
| collapse toggle appears only when onToggleCollapse provided | no callback = no button |
| collapse toggle doesn't affect cardRef bounding rect | edge anchor stability |
| warning dot appears only when warning provided | conditional rendering |
| private icon appears only when isPrivate true | conditional rendering |
| selection highlight applied when selected | green border class |
| status styling applies dashed borders | recruiting/planned/transfer variants |
| drag handle active when draggable true | dnd-kit integration |
| drop target active when droppable true | dnd-kit integration |
| cardRef targets .node element | edge anchoring correctness |
| hover shows action bar | buttons appear on mouseenter |
| no nested interactive controls | a11y: no button-inside-role-button |

### Concrete Type Tests

Thin tests verifying content rendering and correct BaseNode delegation:

| Test | Verifies |
|---|---|
| PersonNode renders name, role, team content | correct children |
| PersonNode passes manager variant when isManager | delegates to BaseNode |
| PersonNode passes status/emp styling | correct props forwarded |
| GroupHeaderNode renders name and count | correct children |
| GroupHeaderNode passes group variant | delegates to BaseNode |

### Regression

Existing golden and a11y tests for PersonNode and PodHeaderNode serve as regression guards during migration. Updated in Phase 2/3 for new DOM structure, then continue validating behavior.

## Out of Scope

- **Layout placement logic** (columnLayout.ts, affinity reordering, cross-team IC positioning, orphan grouping) — separate spec to follow
- **ManagerView SummaryCard** — aggregation card, not a node in the same hierarchy
- **TableView cells** — different rendering paradigm, not card-based
