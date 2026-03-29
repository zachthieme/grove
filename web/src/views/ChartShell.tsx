import { useEffect, useMemo, useCallback, type ReactNode } from 'react'
import { DndContext } from '@dnd-kit/core'
import type { Person } from '../api/types'
import type { ChartEdge } from '../hooks/useChartLayout'
import { useChartLayout } from '../hooks/useChartLayout'
import { useLassoSelect } from '../hooks/useLassoSelect'
import { buildOrgTree, type OrgNode } from './shared'
import { OrphanGroup } from './OrphanGroup'
import { ChartProvider } from './ChartContext'
import { DragBadgeOverlay } from './DragBadgeOverlay'
import { LassoSvgOverlay } from './LassoSvgOverlay'
import { usePeople, useChanges, useActions } from '../store/ViewDataContext'
import { useSelection } from '../store/OrgContext'
import styles from './ChartShell.module.css'

export interface ChartShellProps {
  computeEdges: (people: Person[], roots: OrgNode[]) => ChartEdge[]
  renderSubtree: (node: OrgNode) => ReactNode
  renderOrphanSubtree?: (node: OrgNode) => ReactNode
  renderTeamHeader?: (team: string, count: number) => ReactNode
  /** View-specific styles for OrphanGroup (subtree, nodeSlot, children, icStack, teamHeader) */
  viewStyles: Record<string, string>
  dashedEdges?: boolean
  useGhostPeople?: boolean
  includeAddToTeam?: boolean
  wrapOrphansInIcStack?: boolean
}

export default function ChartShell({
  computeEdges,
  renderSubtree,
  renderOrphanSubtree,
  renderTeamHeader,
  viewStyles,
  dashedEdges,
  useGhostPeople,
  includeAddToTeam,
  wrapOrphansInIcStack = true,
}: ChartShellProps) {
  const { people, ghostPeople, managerSet, pods } = usePeople()
  const { changes } = useChanges()
  const { handleSelect, handleAddReport, handleAddToTeam, handleDeletePerson, handleShowInfo, handleFocus } = useActions()
  const { selectedIds, batchSelect, selectPod } = useSelection()

  const roots = useMemo(() => buildOrgTree(people), [people])
  const edges = useMemo(() => computeEdges(people, roots), [computeEdges, people, roots])

  const { containerRef, nodeRefs, setNodeRef, lines, activeDragId, sensors, handleDragStart, handleDragEnd } = useChartLayout(edges, roots)

  // Auto-scroll to keep selected node visible
  useEffect(() => {
    if (selectedIds.size !== 1) return
    const id = [...selectedIds][0]
    const el = nodeRefs.current.get(id)
    el?.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' })
  }, [selectedIds, nodeRefs])

  const handleLassoSelect = useCallback((ids: Set<string>) => {
    batchSelect?.(ids)
  }, [batchSelect])

  const { lassoRect } = useLassoSelect({
    containerRef,
    nodeRefs,
    onSelect: handleLassoSelect,
    enabled: true,
  })

  const draggedPerson = activeDragId ? people.find((p) => p.id === activeDragId) : null

  const chartValue = useMemo(() => ({
    selectedIds, changes, managerSet, pods,
    onSelect: handleSelect,
    onBatchSelect: batchSelect,
    onAddReport: handleAddReport,
    onAddToTeam: includeAddToTeam ? handleAddToTeam : undefined,
    onDeletePerson: handleDeletePerson,
    onInfo: handleShowInfo,
    onFocus: handleFocus,
    onPodSelect: selectPod,
    setNodeRef,
  }), [selectedIds, changes, managerSet, pods, handleSelect, batchSelect, handleAddReport, includeAddToTeam, handleAddToTeam, handleDeletePerson, handleShowInfo, handleFocus, selectPod, setNodeRef])

  if (people.length === 0 && (!useGhostPeople || (ghostPeople ?? []).length === 0)) {
    return <div className={styles.container}>No people to display.</div>
  }

  return (
    <ChartProvider value={chartValue}>
      <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
        <div className={styles.container} ref={containerRef} data-role="chart-container">
          <LassoSvgOverlay lassoRect={lassoRect} lines={lines} className={styles.svgOverlay} dashedEdges={dashedEdges} />
          <div className={styles.forest} data-role="forest">
            {roots.filter((r) => r.children.length > 0).map((root) => (
              renderSubtree(root)
            ))}
            <OrphanGroup
              orphans={roots.filter((r) => r.children.length === 0)}
              roots={roots}
              selectedIds={selectedIds}
              onSelect={handleSelect}
              changes={changes}
              setNodeRef={setNodeRef}
              managerSet={managerSet}
              onAddReport={handleAddReport}
              onDeletePerson={handleDeletePerson}
              onInfo={handleShowInfo}
              styles={viewStyles}
              wrapInIcStack={wrapOrphansInIcStack}
              renderSubtree={renderOrphanSubtree ?? renderSubtree}
              renderTeamHeader={renderTeamHeader}
            />
          </div>
        </div>
        <DragBadgeOverlay draggedPerson={draggedPerson} selectedIds={selectedIds} />
      </DndContext>
    </ChartProvider>
  )
}
