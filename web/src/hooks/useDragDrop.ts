import { useCallback } from 'react'
import type { DragEndEvent } from '@dnd-kit/core'
import { useOrgData, useOrgMutations, useSelection } from '../store/OrgContext'
import { parseTeamDropId, parsePodDropId } from '../utils/ids'

function resolveManagerId(id: string): string {
  if (id.startsWith('__placeholder_')) {
    return id.slice('__placeholder_'.length)
  }
  return id
}

export function useDragDrop() {
  const { pods } = useOrgData()
  const { move, reparent } = useOrgMutations()
  const { selectedIds } = useSelection()

  const onDragEnd = useCallback(async (event: DragEndEvent) => {
    const { active, over } = event
    if (!over || active.id === over.id) return

    const draggedId = active.id as string
    const targetId = over.id as string
    const resolvedTargetId = resolveManagerId(targetId)

    // If dragging a group header, move all members
    const memberIds = active.data.current?.memberIds as string[] | undefined
    const idsToMove = memberIds
      ? memberIds.filter((id) => id !== resolvedTargetId)
      : selectedIds.has(draggedId) && selectedIds.size > 1
        ? [...selectedIds].filter((id) => id !== resolvedTargetId)
        : [draggedId]

    const teamName = parseTeamDropId(targetId)
    if (teamName !== null) {
      for (const id of idsToMove) {
        await move(id, '', teamName)
      }
      return
    }

    const podDrop = parsePodDropId(targetId)
    if (podDrop) {
      const pod = pods.find((p) => p.managerId === podDrop.managerId && p.name === podDrop.podName)
      const team = pod?.team ?? podDrop.podName
      for (const id of idsToMove) {
        await move(id, podDrop.managerId, team, undefined, podDrop.podName)
      }
      return
    }

    for (const id of idsToMove) {
      await reparent(id, resolvedTargetId)
    }
  }, [move, reparent, selectedIds, pods])

  return { onDragEnd }
}
