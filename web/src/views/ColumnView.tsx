import { useMemo, useRef, useLayoutEffect, useState, useCallback } from 'react'
import { DndContext, DragOverlay, MouseSensor, useSensor, useSensors, type DragStartEvent } from '@dnd-kit/core'
import type { Person } from '../api/types'
import type { PersonChange } from '../hooks/useOrgDiff'
import { useDragDrop } from '../hooks/useDragDrop'
import { DraggableNode, buildOrgTree, type OrgNode } from './shared'
import { computeEdges } from './columnEdges'
import { computeRenderItems } from './columnLayout'
import PersonNode from '../components/PersonNode'
import NodeActions from '../components/NodeActions'
import styles from './ColumnView.module.css'

interface ColumnViewProps {
  people: Person[]
  selectedIds: Set<string>
  onSelect: (id: string, event?: React.MouseEvent) => void
  changes?: Map<string, PersonChange>
  ghostPeople?: Person[]
  managerSet?: Set<string>
  onAddReport?: (id: string) => void
  onAddToTeam?: (parentId: string, team: string) => void
  onDeletePerson?: (id: string) => void
  onInfo?: (id: string) => void
}

function TeamHeaderNode({ team, memberCount, onAdd }: {
  team: string
  memberCount: number
  onAdd?: () => void
}) {
  const [hovered, setHovered] = useState(false)

  return (
    <div
      className={styles.teamHeaderWrapper}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {hovered && onAdd && (
        <NodeActions
          showAdd={true}
          showInfo={false}
          onAdd={(e) => { e.stopPropagation(); onAdd() }}
          onDelete={(e) => { e.stopPropagation() }}
          onEdit={(e) => { e.stopPropagation() }}
          onInfo={(e) => { e.stopPropagation() }}
        />
      )}
      <div className={styles.teamHeader}>
        <div className={styles.teamHeaderName}>{team}</div>
        <div className={styles.teamHeaderCount}>{memberCount} {memberCount === 1 ? 'person' : 'people'}</div>
      </div>
    </div>
  )
}

function SubtreeNode({ node, selectedIds, onSelect, changes, setNodeRef, managerSet, onAddReport, onAddToTeam, onDeletePerson, onInfo }: {
  node: OrgNode
  selectedIds: Set<string>
  onSelect: (id: string, event?: React.MouseEvent) => void
  changes?: Map<string, PersonChange>
  setNodeRef: (id: string) => (el: HTMLDivElement | null) => void
  managerSet?: Set<string>
  onAddReport?: (id: string) => void
  onAddToTeam?: (parentId: string, team: string) => void
  onDeletePerson?: (id: string) => void
  onInfo?: (id: string) => void
}) {
  const managers = node.children.filter((c) => c.children.length > 0)
  const ics = node.children.filter((c) => c.children.length === 0)

  const renderItems = useMemo(() => computeRenderItems(managers, ics), [managers, ics])

  // Check if all render items are ICs (no managers) — use vertical stack
  const allICs = managers.length === 0

  const renderIC = (child: OrgNode) => (
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

  return (
    <div className={styles.subtree}>
      <div className={styles.nodeSlot}>
        <DraggableNode
          person={node.person}
          selected={selectedIds.has(node.person.id)}
          changes={changes?.get(node.person.id)}
          showTeam={node.children.length > 0 || !!managerSet?.has(node.person.id)}
          isManager={managerSet?.has(node.person.id)}
          onAdd={onAddReport ? () => onAddReport(node.person.id) : undefined}
          onDelete={onDeletePerson ? () => onDeletePerson(node.person.id) : undefined}
          onInfo={onInfo ? () => onInfo(node.person.id) : undefined}
          onSelect={(e) => onSelect(node.person.id, e)}
          nodeRef={setNodeRef(node.person.id)}
        />
      </div>

      {node.children.length > 0 && (
        <div className={styles.children}>
          {allICs ? (
            (() => {
              // Group ICs by team — if multiple teams, each gets its own column
              const teamOrder: string[] = []
              const teamMap = new Map<string, OrgNode[]>()
              for (const ic of ics) {
                if (!teamMap.has(ic.person.team)) {
                  teamOrder.push(ic.person.team)
                  teamMap.set(ic.person.team, [])
                }
                teamMap.get(ic.person.team)!.push(ic)
              }
              if (teamOrder.length > 1) {
                return teamOrder.map((team) => {
                  const members = teamMap.get(team)!
                  return (
                    <div key={team} className={styles.subtree}>
                      <div className={styles.nodeSlot}>
                        <TeamHeaderNode
                          team={team}
                          memberCount={members.length}
                          onAdd={onAddToTeam ? () => onAddToTeam(node.person.id, team) : undefined}
                        />
                      </div>
                      <div className={styles.children}>
                        <div className={styles.icStack}>
                          {members.map((child) => renderIC(child))}
                        </div>
                      </div>
                    </div>
                  )
                })
              }
              return (
                <div className={styles.icStack}>
                  {ics.map((child) => renderIC(child))}
                </div>
              )
            })()
          ) : (
            renderItems.map((item) => {
              if (item.type === 'manager') {
                return (
                  <SubtreeNode
                    key={item.node.person.id}
                    node={item.node}
                    selectedIds={selectedIds}
                    onSelect={onSelect}
                    changes={changes}
                    setNodeRef={setNodeRef}
                    managerSet={managerSet}
                    onAddReport={onAddReport}
                    onAddToTeam={onAddToTeam}
                    onDeletePerson={onDeletePerson}
                    onInfo={onInfo}
                  />
                )
              }
              if (item.type === 'ic') {
                return renderIC(item.node)
              }
              if (item.type === 'icGroup') {
                return (
                  <div key={`group-${item.team}`} className={styles.subtree}>
                    <div className={styles.nodeSlot}>
                      <TeamHeaderNode
                        team={item.team}
                        memberCount={item.members.length}
                        onAdd={onAddToTeam ? () => onAddToTeam(node.person.id, item.team) : undefined}
                      />
                    </div>
                    <div className={styles.children}>
                      <div className={styles.icStack}>
                        {item.members.map((child) => renderIC(child))}
                      </div>
                    </div>
                  </div>
                )
              }
              return null
            })
          )}
        </div>
      )}
    </div>
  )
}

export default function ColumnView({ people, selectedIds, onSelect, changes, ghostPeople = [], managerSet, onAddReport, onAddToTeam, onDeletePerson, onInfo }: ColumnViewProps) {
  const { onDragEnd } = useDragDrop()
  const containerRef = useRef<HTMLDivElement>(null)
  const nodeRefs = useRef<Map<string, HTMLDivElement>>(new Map())
  const [lines, setLines] = useState<{ x1: number; y1: number; x2: number; y2: number; dashed?: boolean }[]>([])
  const [activeDragId, setActiveDragId] = useState<string | null>(null)

  const mouseSensor = useSensor(MouseSensor, { activationConstraint: { distance: 8 } })
  const sensors = useSensors(mouseSensor)

  const handleDragStart = useCallback((event: DragStartEvent) => {
    setActiveDragId(event.active.id as string)
  }, [])

  const handleDragEnd = useCallback((event: Parameters<typeof onDragEnd>[0]) => {
    setActiveDragId(null)
    onDragEnd(event)
  }, [onDragEnd])

  const draggedPerson = activeDragId ? people.find((p) => p.id === activeDragId) : null

  const setNodeRef = useCallback((id: string) => (el: HTMLDivElement | null) => {
    if (el) nodeRefs.current.set(id, el)
    else nodeRefs.current.delete(id)
  }, [])

  const roots = useMemo(() => buildOrgTree(people), [people])

  const edges = useMemo(() => computeEdges(people), [people])

  // Compute lines after layout
  useLayoutEffect(() => {
    if (!containerRef.current || edges.length === 0) {
      setLines([])
      return
    }
    const rect = containerRef.current.getBoundingClientRect()
    const sl = containerRef.current.scrollLeft
    const st = containerRef.current.scrollTop
    const computed: typeof lines = []

    for (const { fromId, toId, dashed } of edges) {
      const fromEl = nodeRefs.current.get(fromId)
      const toEl = nodeRefs.current.get(toId)
      if (!fromEl || !toEl) continue
      const fr = fromEl.getBoundingClientRect()
      const tr = toEl.getBoundingClientRect()

      if (dashed) {
        // Dashed lines: store endpoints, will route below content later
        computed.push({
          x1: fr.left + fr.width / 2 - rect.left + sl,
          y1: fr.bottom - rect.top + st,
          x2: tr.left + tr.width / 2 - rect.left + sl,
          y2: tr.bottom - rect.top + st,
          dashed: true,
        })
      } else {
        // Solid lines: bottom of parent to top of child
        computed.push({
          x1: fr.left + fr.width / 2 - rect.left + sl,
          y1: fr.bottom - rect.top + st,
          x2: tr.left + tr.width / 2 - rect.left + sl,
          y2: tr.top - rect.top + st,
        })
      }
    }
    setLines(computed)
  }, [edges, roots, selectedIds])

  if (people.length === 0 && ghostPeople.length === 0) {
    return <div className={styles.container}>No people to display.</div>
  }

  return (
    <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
      <div className={styles.container} ref={containerRef}>
        <svg className={styles.svgOverlay}>
          {lines.map((l, i) => {
            if (l.dashed) {
              // Dashed lines: right-angle path — down, across, up
              // Route below both boxes: halfway between the lower box bottom and 40px below it
              const lowerY = Math.max(l.y1, l.y2)
              const midY = lowerY + 20
              return (
                <path
                  key={i}
                  d={`M ${l.x1} ${l.y1} L ${l.x1} ${midY} L ${l.x2} ${midY} L ${l.x2} ${l.y2}`}
                  fill="none"
                  stroke="var(--grove-sage, #9cad8f)"
                  strokeWidth={1.2}
                  strokeDasharray="5 4"
                  opacity={0.6}
                />
              )
            }
            return (
              <path
                key={i}
                d={`M ${l.x1} ${l.y1} C ${l.x1} ${(l.y1 + l.y2) / 2}, ${l.x2} ${(l.y1 + l.y2) / 2}, ${l.x2} ${l.y2}`}
                fill="none"
                stroke="#b5a898"
                strokeWidth={1.5}
              />
            )
          })}
        </svg>
        <div className={styles.forest}>
          {roots.map((root) => (
            <SubtreeNode
              key={root.person.id}
              node={root}
              selectedIds={selectedIds}
              onSelect={onSelect}
              changes={changes}
              setNodeRef={setNodeRef}
              managerSet={managerSet}
              onAddReport={onAddReport}
              onAddToTeam={onAddToTeam}
              onDeletePerson={onDeletePerson}
              onInfo={onInfo}
            />
          ))}
        </div>
      </div>
      <DragOverlay dropAnimation={null}>
        {draggedPerson && (
          <div style={{ width: 160, opacity: 0.9, pointerEvents: 'none' }}>
            <PersonNode person={draggedPerson} selected={false} />
          </div>
        )}
      </DragOverlay>
    </DndContext>
  )
}
