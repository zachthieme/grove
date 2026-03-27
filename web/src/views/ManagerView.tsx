// Scenarios: VIEW-002
import { useEffect, useMemo, useCallback } from 'react'
import { DndContext } from '@dnd-kit/core'
import type { Person, Pod } from '../api/types'
import type { PersonChange } from '../hooks/useOrgDiff'
import { useChartLayout } from '../hooks/useChartLayout'
import { useLassoSelect } from '../hooks/useLassoSelect'
import { DraggableNode, buildOrgTree, type OrgNode } from './shared'
import { OrphanGroup } from './OrphanGroup'
import { ChartProvider, useChart } from './ChartContext'
import { DragBadgeOverlay } from './DragBadgeOverlay'
import { LassoSvgOverlay } from './LassoSvgOverlay'
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
  onBatchSelect?: (ids: Set<string>) => void
}

function SummaryCard({ people, podName, publicNote, podId, onPodClick }: {
  people: Person[]
  podName?: string
  publicNote?: string
  podId?: string
  onPodClick?: (podId: string) => void
}) {
  const groups: { label: string; count: number }[] = []

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

  const recruiting = people.filter((p) => p.status === 'Open' || p.status === 'Backfill')
  if (recruiting.length > 0) {
    groups.push({ label: 'Recruiting', count: recruiting.length })
  }

  const planned = people.filter((p) => p.status === 'Pending Open' || p.status === 'Planned')
  if (planned.length > 0) {
    groups.push({ label: 'Planned', count: planned.length })
  }

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

function ManagerSubtree({ node }: { node: OrgNode }) {
  const { selectedIds, onSelect, changes, managerSet, pods, onAddReport, onDeletePerson, onInfo, onFocus, onPodSelect, setNodeRef } = useChart()
  const subManagers = node.children.filter((c) => c.children.length > 0)
  const ics = node.children.filter((c) => c.children.length === 0)

  const { unpoddedICs, icPodGroups } = useMemo(() => {
    if (ics.length === 0) return { unpoddedICs: [] as Person[], icPodGroups: [] as { team: string; people: Person[]; pod: Pod | undefined }[] }
    const unpodded: Person[] = []
    const podOrder: string[] = []
    const podMap = new Map<string, Person[]>()
    for (const ic of ics) {
      const podName = ic.person.pod
      if (!podName) {
        unpodded.push(ic.person)
        continue
      }
      if (!podMap.has(podName)) {
        podOrder.push(podName)
        podMap.set(podName, [])
      }
      podMap.get(podName)!.push(ic.person)
    }
    podOrder.sort((a, b) => a.localeCompare(b))
    return {
      unpoddedICs: unpodded,
      icPodGroups: podOrder.map((podName) => ({
        team: podName,
        people: podMap.get(podName)!,
        pod: pods?.find((p) => p.managerId === node.person.id && p.name === podName),
      })),
    }
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
          {subManagers.map((child) => (
            <ManagerSubtree key={child.person.id} node={child} />
          ))}
          {unpoddedICs.length > 0 && icPodGroups.length === 0 ? (
            <SummaryCard people={unpoddedICs} />
          ) : (
            <>
              {unpoddedICs.length > 0 && (
                <SummaryCard people={unpoddedICs} />
              )}
              {icPodGroups.map((group) => (
                <SummaryCard
                  key={group.team}
                  people={group.people}
                  podName={group.pod?.name}
                  publicNote={group.pod?.publicNote}
                  podId={group.pod?.id}
                  onPodClick={onPodSelect}
                />
              ))}
            </>
          )}
        </div>
      )}
    </div>
  )
}

export default function ManagerView({ people, selectedIds, onSelect, changes, managerSet, pods, onAddReport, onDeletePerson, onInfo, onFocus, onPodSelect, onBatchSelect }: ManagerViewProps) {
  const roots = useMemo(() => buildOrgTree(people), [people])

  const edges = useMemo(() => {
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

    for (const r of roots) {
      managerIds.add(r.person.id)
    }

    const result: { fromId: string; toId: string }[] = []
    function collectEdges(nodes: OrgNode[]) {
      for (const n of nodes) {
        for (const child of n.children) {
          if (child.children.length > 0) {
            result.push({ fromId: n.person.id, toId: child.person.id })
          }
        }
        collectEdges(n.children)
      }
    }
    collectEdges(roots)

    return result
  }, [roots])

  const { containerRef, nodeRefs, setNodeRef, lines, activeDragId, sensors, handleDragStart, handleDragEnd } = useChartLayout(edges, roots)

  // Auto-scroll to keep selected node visible (e.g. when sidebar opens and shrinks the chart)
  useEffect(() => {
    if (selectedIds.size !== 1) return
    const id = [...selectedIds][0]
    const el = nodeRefs.current.get(id)
    el?.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' })
  }, [selectedIds, nodeRefs])

  const handleLassoSelect = useCallback((ids: Set<string>) => {
    onBatchSelect?.(ids)
  }, [onBatchSelect])

  const { lassoRect } = useLassoSelect({
    containerRef,
    nodeRefs,
    onSelect: handleLassoSelect,
    enabled: !!onBatchSelect,
  })

  const draggedPerson = activeDragId ? people.find((p) => p.id === activeDragId) : null

  const chartValue = useMemo(() => ({
    selectedIds, changes, managerSet, pods,
    onSelect, onBatchSelect, onAddReport, onDeletePerson, onInfo, onFocus, onPodSelect,
    setNodeRef,
  }), [selectedIds, changes, managerSet, pods, onSelect, onBatchSelect, onAddReport, onDeletePerson, onInfo, onFocus, onPodSelect, setNodeRef])

  if (people.length === 0) {
    return <div className={styles.container}>No people to display.</div>
  }

  return (
    <ChartProvider value={chartValue}>
      <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
        <div className={styles.container} ref={containerRef} data-role="chart-container">
          <LassoSvgOverlay lassoRect={lassoRect} lines={lines} className={styles.svgOverlay} />
          <div className={styles.forest} data-role="forest">
            {roots.filter((r) => r.children.length > 0).map((root) => (
              <ManagerSubtree key={root.person.id} node={root} />
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
              renderSubtree={(node) => <ManagerSubtree key={node.person.id} node={node} />}
            />
          </div>
        </div>
        <DragBadgeOverlay draggedPerson={draggedPerson} selectedIds={selectedIds} />
      </DndContext>
    </ChartProvider>
  )
}
