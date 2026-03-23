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
  onFocus?: (id: string) => void
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

function SubtreeNode({ node, selectedIds, onSelect, changes, setNodeRef, managerSet, onAddReport, onAddToTeam, onDeletePerson, onInfo, onFocus }: {
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
  onFocus?: (id: string) => void
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
        onFocus={onFocus && managerSet?.has(child.person.id) ? () => onFocus(child.person.id) : undefined}
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
          onFocus={onFocus && managerSet?.has(node.person.id) ? () => onFocus(node.person.id) : undefined}
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
            (() => {
              // ICs with additionalTeams are cross-team connectors — render individually (horizontal).
              // ICs on a single team — batch into vertical stacks.
              const elements: React.ReactNode[] = []
              let icBatch: OrgNode[] = []

              const flushIcBatch = () => {
                if (icBatch.length === 0) return
                elements.push(
                  <div key={`ic-stack-${icBatch[0].person.id}`} className={styles.icStack}>
                    {icBatch.map((child) => renderIC(child))}
                  </div>
                )
                icBatch = []
              }

              const isCrossTeam = (n: OrgNode) =>
                (n.person.additionalTeams?.length ?? 0) > 0

              for (const item of renderItems) {
                if (item.type === 'ic') {
                  if (isCrossTeam(item.node)) {
                    flushIcBatch()
                    elements.push(renderIC(item.node))
                  } else {
                    icBatch.push(item.node)
                  }
                } else {
                  flushIcBatch()
                  if (item.type === 'manager') {
                    elements.push(
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
                        onFocus={onFocus}
                      />
                    )
                  } else if (item.type === 'icGroup') {
                    elements.push(
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
                }
              }
              flushIcBatch()
              return elements
            })()
          )}
        </div>
      )}
    </div>
  )
}

export default function ColumnView({ people, selectedIds, onSelect, changes, ghostPeople = [], managerSet, onAddReport, onAddToTeam, onDeletePerson, onInfo, onFocus }: ColumnViewProps) {
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
              const lowerY = Math.max(l.y1, l.y2)
              const midY = lowerY + 15
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
              onFocus={onFocus}
            />
          ))}
        </div>
      </div>
      <DragOverlay dropAnimation={null}>
        {draggedPerson && (
          <div style={{ width: 160, opacity: 0.9, pointerEvents: 'none', position: 'relative' }}>
            <PersonNode person={draggedPerson} selected={false} />
            {selectedIds.has(draggedPerson.id) && selectedIds.size > 1 && (
              <div style={{
                position: 'absolute', top: -8, right: -8,
                background: 'var(--grove-green)', color: '#fff', borderRadius: '50%',
                width: 20, height: 20, fontSize: 11, fontWeight: 700,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                {selectedIds.size}
              </div>
            )}
          </div>
        )}
      </DragOverlay>
    </DndContext>
  )
}
