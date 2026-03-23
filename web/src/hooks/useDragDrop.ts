import { useCallback } from 'react'
import type { DragEndEvent } from '@dnd-kit/core'
import { useOrg } from '../store/OrgContext'

export function useDragDrop() {
  const { move, reparent, selectedIds } = useOrg()

  const onDragEnd = useCallback(async (event: DragEndEvent) => {
    const { active, over } = event
    if (!over || active.id === over.id) return

    const draggedId = active.id as string
    const targetId = over.id as string

    // If the dragged person is part of a multi-selection, move all selected people
    const idsToMove = selectedIds.has(draggedId) && selectedIds.size > 1
      ? [...selectedIds].filter((id) => id !== targetId)
      : [draggedId]

    if (targetId.startsWith('team::')) {
      const teamName = targetId.slice(6)
      for (const id of idsToMove) {
        await move(id, '', teamName)
      }
      return
    }

    for (const id of idsToMove) {
      await reparent(id, targetId)
    }
  }, [move, reparent, selectedIds])

  return { onDragEnd }
}
