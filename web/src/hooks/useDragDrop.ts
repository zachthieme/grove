import { useCallback } from 'react'
import type { DragEndEvent } from '@dnd-kit/core'
import { useOrg } from '../store/OrgContext'
import { TEAM_DROP_PREFIX, POD_DROP_PREFIX } from '../constants'

export function useDragDrop() {
  const { move, reparent, selectedIds, pods } = useOrg()

  const onDragEnd = useCallback(async (event: DragEndEvent) => {
    const { active, over } = event
    if (!over || active.id === over.id) return

    const draggedId = active.id as string
    const targetId = over.id as string

    // If the dragged person is part of a multi-selection, move all selected people
    const idsToMove = selectedIds.has(draggedId) && selectedIds.size > 1
      ? [...selectedIds].filter((id) => id !== targetId)
      : [draggedId]

    if (targetId.startsWith(TEAM_DROP_PREFIX)) {
      const teamName = targetId.slice(TEAM_DROP_PREFIX.length)
      for (const id of idsToMove) {
        await move(id, '', teamName)
      }
      return
    }

    if (targetId.startsWith(POD_DROP_PREFIX)) {
      const rest = targetId.slice(POD_DROP_PREFIX.length)
      const colonIdx = rest.indexOf(':')
      const managerId = rest.slice(0, colonIdx)
      const podName = rest.slice(colonIdx + 1)
      const pod = pods.find((p) => p.managerId === managerId && p.name === podName)
      const team = pod?.team ?? podName
      for (const id of idsToMove) {
        await move(id, managerId, team, undefined, podName)
      }
      return
    }

    for (const id of idsToMove) {
      await reparent(id, targetId)
    }
  }, [move, reparent, selectedIds, pods])

  return { onDragEnd }
}
