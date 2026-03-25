import { useMemo } from 'react'
import { DndContext, DragOverlay } from '@dnd-kit/core'
import type { Person, Pod } from '../api/types'
import type { PersonChange } from '../hooks/useOrgDiff'
import { useChartLayout } from '../hooks/useChartLayout'
import { DraggableNode, buildOrgTree, type OrgNode } from './shared'
import { OrphanGroup } from './OrphanGroup'
import PersonNode from '../components/PersonNode'
import styles from './ManagerView.module.css'

interface ManagerViewProps {
  people: Person[]
  selectedIds: Set<string>
  onSelect: (id: string, event?: React.MouseEvent) => void
  changes?: Map<string, PersonChange>
  managerSet?: Set<string>
  pods?: Pod[]
  onAddReport?: (id: string) => void
  onDeletePerson?: (id: string) => void
  onInfo?: (id: string) => void
  onFocus?: (id: string) => void
  onPodSelect?: (podId: string) => void
}

function SummaryCard({ people, podName, publicNote, podId, onPodClick }: {
  people: Person[]
  podName?: string
  publicNote?: string
  podId?: string
  onPodClick?: (podId: string) => void
}) {
  const groups: { label: string; count: number }[] = []

  // Active people: count by discipline
  const active = people.filter((p) => p.status === 'Active')
  if (active.length > 0) {
    const byDiscipline = new Map<string, number>()
    for (const p of active) {
      const d = p.discipline || 'Other'
      byDiscipline.set(d, (byDiscipline.get(d) || 0) + 1)
    }
    for (const [discipline, count] of byDiscipline) {
      groups.push({ label: discipline, count })
    }
  }

  // Open + Backfill => Recruiting
  const recruiting = people.filter((p) => p.status === 'Open' || p.status === 'Backfill')
  if (recruiting.length > 0) {
    groups.push({ label: 'Recruiting', count: recruiting.length })
  }

  // Pending Open + Planned => Planned
  const planned = people.filter((p) => p.status === 'Pending Open' || p.status === 'Planned')
  if (planned.length > 0) {
    groups.push({ label: 'Planned', count: planned.length })
  }

  // Transfer In + Transfer Out => Transfers
  const transfers = people.filter((p) => p.status === 'Transfer In' || p.status === 'Transfer Out')
  if (transfers.length > 0) {
    groups.push({ label: 'Transfers', count: transfers.length })
  }

  if (groups.length === 0 && !podName) return null

  const isClickable = podId && onPodClick

  return (
    <div
      className={`${styles.summaryCard}${isClickable ? ` ${styles.summaryCardClickable}` : ''}`}
      onClick={isClickable ? () => onPodClick(podId) : undefined}
    >
      {podName && <div className={styles.podCardHeader}>{podName}</div>}
      {publicNote && (
        <div className={styles.podCardNote}>
          {publicNote.length > 50 ? publicNote.slice(0, 47) + '...' : publicNote}
        </div>
      )}
      {groups.map((g) => (
        <div key={g.label} className={styles.summaryRow}>
          <span className={styles.summaryLabel}>{g.label}</span>
          <span className={styles.summaryValue}>{g.count}</span>
        </div>
      ))}
    </div>
  )
}

function ManagerSubtree({ node, selectedIds, onSelect, changes, setNodeRef, managerSet, pods, onAddReport, onDeletePerson, onInfo, onFocus, onPodSelect }: {
  node: OrgNode
  selectedIds: Set<string>
  onSelect: (id: string, event?: React.MouseEvent) => void
  changes?: Map<string, PersonChange>
  setNodeRef: (id: string) => (el: HTMLDivElement | null) => void
  managerSet?: Set<string>
  pods?: Pod[]
  onAddReport?: (id: string) => void
  onDeletePerson?: (id: string) => void
  onInfo?: (id: string) => void
  onFocus?: (id: string) => void
  onPodSelect?: (podId: string) => void
}) {
  const subManagers = node.children.filter((c) => c.children.length > 0)
  const ics = node.children.filter((c) => c.children.length === 0)

  // Group ICs by team (pod key) for separate summary cards
  const icPodGroups = useMemo(() => {
    if (ics.length === 0) return []
    const teamOrder: string[] = []
    const teamMap = new Map<string, Person[]>()
    for (const ic of ics) {
      const team = ic.person.team || ''
      if (!teamMap.has(team)) {
        teamOrder.push(team)
        teamMap.set(team, [])
      }
      teamMap.get(team)!.push(ic.person)
    }
    // Sort alphabetically by pod name
    teamOrder.sort((a, b) => {
      const podA = pods?.find((p) => p.managerId === node.person.id && p.team === a)
      const podB = pods?.find((p) => p.managerId === node.person.id && p.team === b)
      return (podA?.name ?? a).localeCompare(podB?.name ?? b)
    })
    return teamOrder.map((team) => ({
      team,
      people: teamMap.get(team)!,
      pod: pods?.find((p) => p.managerId === node.person.id && p.team === team),
    }))
  }, [ics, pods, node.person.id])

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
          {/* Sub-managers rendered as full subtrees */}
          {subManagers.map((child) => (
            <ManagerSubtree
              key={child.person.id}
              node={child}
              selectedIds={selectedIds}
              onSelect={onSelect}
              changes={changes}
              setNodeRef={setNodeRef}
              managerSet={managerSet}
              pods={pods}
              onAddReport={onAddReport}
              onDeletePerson={onDeletePerson}
              onInfo={onInfo}
              onFocus={onFocus}
              onPodSelect={onPodSelect}
            />
          ))}
          {/* ICs summarized — one card per pod group */}
          {icPodGroups.length === 1 && !icPodGroups[0].pod ? (
            <SummaryCard people={icPodGroups[0].people} />
          ) : (
            icPodGroups.map((group) => (
              <SummaryCard
                key={group.team}
                people={group.people}
                podName={group.pod?.name}
                publicNote={group.pod?.publicNote}
                podId={group.pod?.id}
                onPodClick={onPodSelect}
              />
            ))
          )}
        </div>
      )}
    </div>
  )
}

export default function ManagerView({ people, selectedIds, onSelect, changes, managerSet, pods, onAddReport, onDeletePerson, onInfo, onFocus, onPodSelect }: ManagerViewProps) {
  const roots = useMemo(() => buildOrgTree(people), [people])

  // Edges only between rendered manager nodes (not ICs, since they are summarized)
  const edges = useMemo(() => {
    // Build set of people who have children (managers in the tree)
    const managerIds = new Set<string>()
    function collectManagers(nodes: OrgNode[]) {
      for (const n of nodes) {
        if (n.children.length > 0) {
          managerIds.add(n.person.id)
          collectManagers(n.children)
        }
      }
    }
    collectManagers(roots)

    // Also include roots (even if they have no children, they are rendered as nodes)
    for (const r of roots) {
      managerIds.add(r.person.id)
    }

    // Edges: from manager parent to manager child (both must be rendered nodes)
    const result: { fromId: string; toId: string }[] = []
    function collectEdges(nodes: OrgNode[]) {
      for (const n of nodes) {
        for (const child of n.children) {
          if (child.children.length > 0) {
            // Sub-manager: draw edge from parent to child
            result.push({ fromId: n.person.id, toId: child.person.id })
          }
        }
        collectEdges(n.children)
      }
    }
    collectEdges(roots)

    return result
  }, [roots])

  const { containerRef, setNodeRef, lines, activeDragId, sensors, handleDragStart, handleDragEnd } = useChartLayout(edges, roots)

  const draggedPerson = activeDragId ? people.find((p) => p.id === activeDragId) : null

  if (people.length === 0) {
    return <div className={styles.container}>No people to display.</div>
  }

  return (
    <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
      <div className={styles.container} ref={containerRef} data-role="chart-container">
        <svg className={styles.svgOverlay}>
          {lines.map((l, i) => (
            <path
              key={i}
              d={`M ${l.x1} ${l.y1} C ${l.x1} ${(l.y1 + l.y2) / 2}, ${l.x2} ${(l.y1 + l.y2) / 2}, ${l.x2} ${l.y2}`}
              fill="none"
              stroke="#b5a898"
              strokeWidth={1.5}
            />
          ))}
        </svg>
        <div className={styles.forest} data-role="forest">
          {roots.filter((r) => r.children.length > 0).map((root) => (
            <ManagerSubtree
              key={root.person.id}
              node={root}
              selectedIds={selectedIds}
              onSelect={onSelect}
              changes={changes}
              setNodeRef={setNodeRef}
              managerSet={managerSet}
              pods={pods}
              onAddReport={onAddReport}
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
            wrapInIcStack={false}
            renderSubtree={(node) => (
              <ManagerSubtree key={node.person.id} node={node} selectedIds={selectedIds} onSelect={onSelect}
                changes={changes} setNodeRef={setNodeRef} managerSet={managerSet} pods={pods}
                onAddReport={onAddReport} onDeletePerson={onDeletePerson}
                onInfo={onInfo} onFocus={onFocus} onPodSelect={onPodSelect} />
            )}
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
