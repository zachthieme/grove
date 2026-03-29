import { DragOverlay } from '@dnd-kit/core'
import type { Person } from '../api/types'
import PersonNode from '../components/PersonNode'

interface DragBadgeOverlayProps {
  draggedPerson: Person | null | undefined
  selectedIds: Set<string>
}

export function DragBadgeOverlay({ draggedPerson, selectedIds }: DragBadgeOverlayProps) {
  return (
    <DragOverlay dropAnimation={null}>
      {draggedPerson && (
        <div style={{ width: 160, opacity: 0.92, pointerEvents: 'none', position: 'relative', transform: 'rotate(-2deg) scale(1.04)', filter: 'drop-shadow(0 8px 20px rgba(44, 36, 24, 0.18))', transition: 'transform 0.15s ease' }}>
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
  )
}
