import { useCallback } from 'react'
import type { DragEndEvent } from '@dnd-kit/core'
import { useOrgData, useOrgMutations, useSelection } from '../store/OrgContext'
import { moveToTarget } from '../utils/moveToTarget'

export function useDragDrop() {
  const { pods } = useOrgData()
  const { move, reparent } = useOrgMutations()
  const { selectedIds } = useSelection()

  const onDragEnd = useCallback(async (event: DragEndEvent) => {
    const { active, over } = event
    if (!over || active.id === over.id) return

    const draggedId = active.id as string
    const targetId = over.id as string

    // If dragging a group header, move all members
    const memberIds = active.data.current?.memberIds as string[] | undefined
    const idsToMove = memberIds
      ? memberIds.filter((id) => id !== targetId)
      : selectedIds.has(draggedId) && selectedIds.size > 1
        ? [...selectedIds].filter((id) => id !== targetId)
        : [draggedId]

    await moveToTarget(idsToMove, targetId, { move, reparent }, pods)
  }, [move, reparent, selectedIds, pods])

  return { onDragEnd }
}
