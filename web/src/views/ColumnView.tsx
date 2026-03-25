import { useMemo, useState } from 'react'
import { DndContext, DragOverlay } from '@dnd-kit/core'
import type { Person, Pod } from '../api/types'
import type { PersonChange } from '../hooks/useOrgDiff'
import { useChartLayout } from '../hooks/useChartLayout'
import { DraggableNode, buildOrgTree, type OrgNode } from './shared'
import { OrphanGroup } from './OrphanGroup'
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
  pods?: Pod[]
  onAddReport?: (id: string) => void
  onAddToTeam?: (parentId: string, team: string) => void
  onDeletePerson?: (id: string) => void
  onInfo?: (id: string) => void
  onFocus?: (id: string) => void
  onPodSelect?: (podId: string) => void
}

function PodHeaderNode({ podName, memberCount, publicNote, onAdd, onClick }: {
  podName: string
  memberCount: number
  publicNote?: string
  onAdd?: () => void
  onClick?: () => void
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
      <div
        className={`${styles.teamHeader}${onClick ? ` ${styles.teamHeaderClickable}` : ''}`}
        onClick={onClick}
      >
        <div className={styles.teamHeaderName}>{podName}</div>
        {publicNote && (
          <div className={styles.podNote}>
            {publicNote.length > 50 ? publicNote.slice(0, 47) + '...' : publicNote}
          </div>
        )}
        <div className={styles.teamHeaderCount}>{memberCount} {memberCount === 1 ? 'person' : 'people'}</div>
      </div>
    </div>
  )
}

function SubtreeNode({ node, selectedIds, onSelect, changes, setNodeRef, managerSet, pods, onAddReport, onAddToTeam, onDeletePerson, onInfo, onFocus, onPodSelect }: {
  node: OrgNode
  selectedIds: Set<string>
  onSelect: (id: string, event?: React.MouseEvent) => void
  changes?: Map<string, PersonChange>
  setNodeRef: (id: string) => (el: HTMLDivElement | null) => void
  managerSet?: Set<string>
  pods?: Pod[]
  onAddReport?: (id: string) => void
  onAddToTeam?: (parentId: string, team: string) => void
  onDeletePerson?: (id: string) => void
  onInfo?: (id: string) => void
  onFocus?: (id: string) => void
  onPodSelect?: (podId: string) => void
}) {
  const managers = node.children.filter((c) => c.children.length > 0)
  const ics = node.children.filter((c) => c.children.length === 0)

  const renderItems = useMemo(() => computeRenderItems(managers, ics), [managers, ics])

  // Check if all render items are ICs (no managers) — use vertical stack
  const allICs = managers.length === 0

  // Look up pod by (managerId, team) pair
  const findPod = (managerId: string, team: string): Pod | undefined =>
    pods?.find((p) => p.managerId === managerId && p.team === team)

  const renderPodHeader = (managerId: string, team: string, memberCount: number) => {
    const pod = findPod(managerId, team)
    return (
      <PodHeaderNode
        podName={pod?.name ?? team}
        memberCount={memberCount}
        publicNote={pod?.publicNote}
        onAdd={onAddToTeam ? () => onAddToTeam(managerId, team) : undefined}
        onClick={pod && onPodSelect ? () => onPodSelect(pod.id) : undefined}
      />
    )
  }

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
              // Sort teams alphabetically by pod name
              teamOrder.sort((a, b) => {
                const podA = findPod(node.person.id, a)
                const podB = findPod(node.person.id, b)
                return (podA?.name ?? a).localeCompare(podB?.name ?? b)
              })
              if (teamOrder.length > 1) {
                return teamOrder.map((team) => {
                  const members = teamMap.get(team)!
                  return (
                    <div key={team} className={styles.subtree}>
                      <div className={styles.nodeSlot}>
                        {renderPodHeader(node.person.id, team, members.length)}
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
                        pods={pods}
                        onAddReport={onAddReport}
                        onAddToTeam={onAddToTeam}
                        onDeletePerson={onDeletePerson}
                        onInfo={onInfo}
                        onFocus={onFocus}
                        onPodSelect={onPodSelect}
                      />
                    )
                  } else if (item.type === 'icGroup') {
                    elements.push(
                      <div key={`group-${item.team}`} className={styles.subtree}>
                        <div className={styles.nodeSlot}>
                          {renderPodHeader(node.person.id, item.team, item.members.length)}
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

export default function ColumnView({ people, selectedIds, onSelect, changes, ghostPeople = [], managerSet, pods, onAddReport, onAddToTeam, onDeletePerson, onInfo, onFocus, onPodSelect }: ColumnViewProps) {
  const roots = useMemo(() => buildOrgTree(people), [people])
  const edges = useMemo(() => computeEdges(people), [people])

  const { containerRef, setNodeRef, lines, activeDragId, sensors, handleDragStart, handleDragEnd } = useChartLayout(edges, roots)

  const draggedPerson = activeDragId ? people.find((p) => p.id === activeDragId) : null

  if (people.length === 0 && ghostPeople.length === 0) {
    return <div className={styles.container}>No people to display.</div>
  }

  return (
    <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
      <div className={styles.container} ref={containerRef} data-role="chart-container">
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
        <div className={styles.forest} data-role="forest">
          {roots.filter((r) => r.children.length > 0).map((root) => (
            <SubtreeNode
              key={root.person.id}
              node={root}
              selectedIds={selectedIds}
              onSelect={onSelect}
              changes={changes}
              setNodeRef={setNodeRef}
              managerSet={managerSet}
              pods={pods}
              onAddReport={onAddReport}
              onAddToTeam={onAddToTeam}
              onDeletePerson={onDeletePerson}
              onInfo={onInfo}
              onFocus={onFocus}
              onPodSelect={onPodSelect}
            />
          ))}
          <OrphanGroup
            orphans={roots.filter((r) => r.children.length === 0)}
            roots={roots}
            selectedIds={selectedIds}
            onSelect={onSelect}
            changes={changes}
            setNodeRef={setNodeRef}
            managerSet={managerSet}
            onAddReport={onAddReport}
            onDeletePerson={onDeletePerson}
            onInfo={onInfo}
            styles={styles}
            renderSubtree={(node) => (
              <SubtreeNode key={node.person.id} node={node} selectedIds={selectedIds} onSelect={onSelect}
                changes={changes} setNodeRef={setNodeRef} managerSet={managerSet} pods={pods}
                onAddReport={onAddReport} onAddToTeam={onAddToTeam} onDeletePerson={onDeletePerson}
                onInfo={onInfo} onFocus={onFocus} onPodSelect={onPodSelect} />
            )}
            renderTeamHeader={(team, count) => <PodHeaderNode podName={team} memberCount={count} />}
          />
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
