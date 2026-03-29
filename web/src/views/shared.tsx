import { useDraggable, useDroppable } from '@dnd-kit/core'
import type { Person } from '../api/types'
import type { PersonChange } from '../hooks/useOrgDiff'
import PersonNode from '../components/PersonNode'

export interface OrgNode {
  person: Person
  children: OrgNode[]
}

export function buildOrgTree(people: Person[]): OrgNode[] {
  const byId = new Map(people.map((p) => [p.id, p]))
  const childrenMap = new Map<string, Person[]>()

  for (const p of people) {
    if (p.managerId && byId.has(p.managerId)) {
      if (!childrenMap.has(p.managerId)) childrenMap.set(p.managerId, [])
      childrenMap.get(p.managerId)!.push(p)
    }
  }

  const roots = people.filter((p) => !p.managerId || !byId.has(p.managerId))

  function build(person: Person): OrgNode {
    const children = (childrenMap.get(person.id) || [])
      .sort((a, b) => (a.sortIndex ?? 0) - (b.sortIndex ?? 0))
      .map(build)
    return { person, children }
  }

  return roots.map(build)
}

export function DraggableNode({ person, selected, changes, showTeam, isManager, collapsed, onAdd, onAddParent, onDelete, onInfo, onFocus, onEditMode, onToggleCollapse, onSelect, onInlineEdit, nodeRef }: {
  person: Person
  selected: boolean
  changes?: PersonChange
  showTeam?: boolean
  isManager?: boolean
  collapsed?: boolean
  onAdd?: () => void
  onAddParent?: () => void
  onDelete?: () => void
  onInfo?: () => void
  onFocus?: () => void
  onEditMode?: () => void
  onToggleCollapse?: () => void
  onSelect: (e?: React.MouseEvent) => void
  onInlineEdit?: (field: string, value: string) => void
  nodeRef?: (el: HTMLDivElement | null) => void
}) {
  const { attributes, listeners, setNodeRef: setDragRef, isDragging } = useDraggable({
    id: person.id,
    data: { person },
  })
  const { setNodeRef: setDropRef, isOver } = useDroppable({
    id: person.id,
  })

  return (
    <div
      ref={(node) => {
        setDropRef(node)
        nodeRef?.(node)
      }}
      style={{
        outline: isOver && !isDragging ? '2px solid var(--grove-green, #3d6b35)' : 'none',
        outlineOffset: isOver && !isDragging ? 2 : 0,
        background: isOver && !isDragging ? 'var(--grove-green-soft, #e8f0e6)' : undefined,
        borderRadius: 6,
        transition: 'outline 0.15s, background 0.15s',
      }}
    >
      <div
        ref={setDragRef}
        {...listeners}
        {...attributes}
        role={undefined}
        tabIndex={undefined}
        data-dnd-draggable
        style={{
          opacity: isDragging ? 0.3 : 1,
          transition: 'opacity 0.15s',
          cursor: 'grab',
        }}
      >
        <PersonNode
          person={person}
          selected={selected}
          changes={changes}
          showTeam={showTeam}
          isManager={isManager}
          collapsed={collapsed}
          onAdd={onAdd}
          onAddParent={onAddParent}
          onDelete={onDelete}
          onInfo={onInfo}
          onFocus={onFocus}
          onEditMode={onEditMode}
          onToggleCollapse={onToggleCollapse}
          onClick={onSelect}
          onInlineEdit={onInlineEdit}
        />
      </div>
    </div>
  )
}
