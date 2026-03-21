import { useCallback } from 'react'
import type { DragEndEvent } from '@dnd-kit/core'
import { useOrg } from '../store/OrgContext'

export function useDragDrop() {
  const { move, working } = useOrg()

  const onDragEnd = useCallback(async (event: DragEndEvent) => {
    const { active, over } = event
    if (!over || active.id === over.id) return

    const draggedId = active.id as string
    const targetId = over.id as string

    // Team header drop — make the person a root in that team
    if (targetId.startsWith('team::')) {
      const teamName = targetId.slice(6)
      await move(draggedId, '', teamName)
      return
    }

    // Person-to-person drop
    const target = working.find((p) => p.id === targetId)
    if (!target) return

    await move(draggedId, targetId, target.team)
  }, [move, working])

  return { onDragEnd }
}
