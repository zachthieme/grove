import { useEffect, useMemo, useCallback, useState, type ReactNode } from 'react'
import { DndContext } from '@dnd-kit/core'
import type { OrgNode } from '../api/types'
import type { ChartEdge } from '../hooks/useChartLayout'
import { useChartLayout } from '../hooks/useChartLayout'
import { useLassoSelect } from '../hooks/useLassoSelect'
import { buildOrgTree, type TreeNode } from './shared'
import type { LayoutNode } from './layoutTree'
import { ChartProvider } from './ChartContext'
import { DragBadgeOverlay } from './DragBadgeOverlay'
import { LassoSvgOverlay } from './LassoSvgOverlay'
import { usePeople, useChanges, useActions } from '../store/ViewDataContext'
import { useSelection } from '../store/OrgContext'
import AddParentPopover from '../components/AddParentPopover'
import DeleteConfirmPopover from '../components/DeleteConfirmPopover'
import styles from './ChartShell.module.css'

export interface ChartShellProps {
  computeEdges: (people: OrgNode[], roots: TreeNode[], layoutRoots?: LayoutNode[]) => ChartEdge[]
  computeLayout: (roots: TreeNode[]) => LayoutNode[]
  renderLayoutNode: (node: LayoutNode) => ReactNode
  dashedEdges?: boolean
  useGhostPeople?: boolean
  includeAddToTeam?: boolean
}

export default function ChartShell({
  computeEdges,
  computeLayout,
  renderLayoutNode,
  dashedEdges,
  useGhostPeople,
  includeAddToTeam,
}: ChartShellProps) {
  const { people, ghostPeople, managerSet, pods } = usePeople()
  const { changes } = useChanges()
  const actions = useActions()
  const selection = useSelection()

  const roots = useMemo(() => buildOrgTree(people), [people])
  const layoutTree = useMemo(
    () => computeLayout(roots),
    [computeLayout, roots],
  )
  const edges = useMemo(
    () => computeEdges(people, roots, layoutTree),
    [computeEdges, people, roots, layoutTree],
  )

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

  // Destructure individual callbacks so chartActions memo (and handleLassoSelect) only
  // rebuild when the actual functions change, not when the aggregate selection/actions
  // objects do (e.g. selectedIds change updates selection reference but not these callbacks).
  const {
    handleSelect, handleAddReport, handleAddProduct, handleAddParent,
    handleAddToTeam, handleDeletePerson, handleShowInfo, handleFocus,
    handleCommitEdits, handleInlineEdit,
  } = actions
  const { selectedIds, interactionMode, editingPersonId, editBuffer, batchSelect, enterEditing, updateBuffer } = selection

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

  // activeDragId is used directly by DragBadgeOverlay (works for any node type)

  const chartData = useMemo(() => ({
    selectedIds, changes, managerSet, pods,
    interactionMode,
    editingPersonId,
    editBuffer,
    collapsedIds,
  }), [selectedIds, interactionMode, editingPersonId, editBuffer, changes, managerSet, pods, collapsedIds])

  const chartActions = useMemo(() => ({
    onSelect: handleSelect,
    onBatchSelect: batchSelect,
    onAddReport: handleAddReport,
    onAddProduct: handleAddProduct,
    onAddParent: handleAddParent,
    onAddToTeam: includeAddToTeam ? handleAddToTeam : undefined,
    onDeletePerson: handleDeletePerson,
    onInfo: handleShowInfo,
    onFocus: handleFocus,
    onEnterEditing: enterEditing,
    onUpdateBuffer: updateBuffer,
    onCommitEdits: handleCommitEdits,
    setNodeRef,
    onToggleCollapse: handleToggleCollapse,
    onInlineEdit: handleInlineEdit,
  }), [handleSelect, batchSelect, handleAddReport, handleAddProduct, handleAddParent,
       handleAddToTeam, handleDeletePerson, handleShowInfo, handleFocus,
       enterEditing, updateBuffer, handleCommitEdits, setNodeRef, handleToggleCollapse,
       handleInlineEdit, includeAddToTeam])

  if (people.length === 0 && (!useGhostPeople || (ghostPeople ?? []).length === 0)) {
    return <div className={styles.container}>No people to display.</div>
  }

  return (
    <ChartProvider data={chartData} actions={chartActions}>
      <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
        <div className={styles.container} ref={containerRef} data-role="chart-container">
          <LassoSvgOverlay lassoRect={lassoRect} lines={lines} className={styles.svgOverlay} dashedEdges={dashedEdges} />
          <div className={styles.forest} data-role="forest">
            {layoutTree.map((n) => renderLayoutNode(n))}
          </div>
          {people.length === 1 && roots.length === 1 && roots[0].children.length === 0 && (
            <div className={styles.emptyHint}>
              Click <strong>+</strong> on the card to add your first report
            </div>
          )}
        </div>
        <DragBadgeOverlay activeDragId={activeDragId} selectedIds={selection.selectedIds} />
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
