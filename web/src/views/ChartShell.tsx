import { useEffect, useMemo, useCallback, useState, type ReactNode } from 'react'
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
import AddParentPopover from '../components/AddParentPopover'
import DeleteConfirmPopover from '../components/DeleteConfirmPopover'
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
  const actions = useActions()
  const selection = useSelection()

  const roots = useMemo(() => buildOrgTree(people), [people])
  const edges = useMemo(() => computeEdges(people, roots), [computeEdges, people, roots])

  const [collapsedIds, setCollapsedIds] = useState<Set<string>>(new Set())
  const [collapseKey, setCollapseKey] = useState(0)

  const { containerRef, nodeRefs, setNodeRef, lines, activeDragId, sensors, handleDragStart, handleDragEnd } = useChartLayout(edges, collapseKey)
  const handleToggleCollapse = useCallback((id: string) => {
    setCollapsedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
    setCollapseKey(k => k + 1)
  }, [])

  // Auto-scroll to keep selected node visible
  useEffect(() => {
    if (selection.selectedIds.size !== 1) return
    const id = [...selection.selectedIds][0]
    const el = nodeRefs.current.get(id)
    el?.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' })
  }, [selection.selectedIds, nodeRefs])

  const handleLassoSelect = useCallback((ids: Set<string>) => {
    selection.batchSelect?.(ids)
  }, [selection])

  const { lassoRect } = useLassoSelect({
    containerRef,
    nodeRefs,
    onSelect: handleLassoSelect,
    enabled: true,
  })

  const draggedPerson = activeDragId ? people.find((p) => p.id === activeDragId) : null

  const chartValue = useMemo(() => ({
    selectedIds: selection.selectedIds, changes, managerSet, pods,
    interactionMode: selection.interactionMode,
    editingPersonId: selection.editingPersonId,
    editBuffer: selection.editBuffer,
    onSelect: actions.handleSelect,
    onBatchSelect: selection.batchSelect,
    onAddReport: actions.handleAddReport,
    onAddParent: actions.handleAddParent,
    onAddToTeam: includeAddToTeam ? actions.handleAddToTeam : undefined,
    onDeletePerson: actions.handleDeletePerson,
    onInfo: actions.handleShowInfo,
    onFocus: actions.handleFocus,
    onEditMode: actions.handleEditMode,
    onPodSelect: selection.selectPod,
    onEnterEditing: selection.enterEditing,
    onUpdateBuffer: selection.updateBuffer,
    onCommitEdits: actions.handleCommitEdits,
    setNodeRef,
    collapsedIds,
    onToggleCollapse: handleToggleCollapse,
    onInlineEdit: actions.handleInlineEdit,
  }), [selection, actions, changes, managerSet, pods, includeAddToTeam, setNodeRef, collapsedIds, handleToggleCollapse])

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
              selectedIds={selection.selectedIds}
              onSelect={actions.handleSelect}
              changes={changes}
              setNodeRef={setNodeRef}
              managerSet={managerSet}
              onAddReport={actions.handleAddReport}
              onDeletePerson={actions.handleDeletePerson}
              onInfo={actions.handleShowInfo}
              styles={viewStyles}
              wrapInIcStack={wrapOrphansInIcStack}
              renderSubtree={renderOrphanSubtree ?? renderSubtree}
              renderTeamHeader={renderTeamHeader}
            />
          </div>
          {people.length === 1 && roots.length === 1 && roots[0].children.length === 0 && (
            <div className={styles.emptyHint}>
              Click <strong>+</strong> on the card to add your first report
            </div>
          )}
        </div>
        <DragBadgeOverlay draggedPerson={draggedPerson} selectedIds={selection.selectedIds} />
      </DndContext>
      {actions.addParentTargetId != null && (
        <AddParentPopover
          onSubmit={actions.submitAddParent}
          onCancel={() => actions.setAddParentTargetId(null)}
        />
      )}
      {actions.deleteTargetId != null && (() => {
        const person = people.find(p => p.id === actions.deleteTargetId)
        if (!person) return null
        const reportCount = people.filter(p => p.managerId === actions.deleteTargetId).length
        return (
          <DeleteConfirmPopover
            personName={person.name}
            reportCount={reportCount}
            onConfirm={actions.confirmDelete}
            onCancel={actions.cancelDelete}
          />
        )
      })()}
    </ChartProvider>
  )
}
