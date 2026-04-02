import { useEffect, useState } from 'react'
import { DragOverlay } from '@dnd-kit/core'

interface DragBadgeOverlayProps {
  activeDragId: string | null
  selectedIds: Set<string>
}

/**
 * Renders a drag preview by cloning the visual content of the node being dragged.
 * Works uniformly for person nodes, pod groups, team groups — any BaseNode.
 */
export function DragBadgeOverlay({ activeDragId, selectedIds }: DragBadgeOverlayProps) {
  const [html, setHtml] = useState<string | null>(null)

  useEffect(() => {
    if (!activeDragId) { setHtml(null); return }
    const el = document.querySelector(`[data-person-id="${activeDragId}"] [role="button"]`)
    setHtml(el?.outerHTML ?? null)
  }, [activeDragId])

  const showBadge = activeDragId && selectedIds.has(activeDragId) && selectedIds.size > 1

  return (
    <DragOverlay dropAnimation={null}>
      {html && (
        <div style={{ width: 160, opacity: 0.92, pointerEvents: 'none', position: 'relative', transform: 'rotate(-2deg) scale(1.04)', filter: 'drop-shadow(0 8px 20px rgba(44, 36, 24, 0.18))', transition: 'transform 0.15s ease' }}>
          <div dangerouslySetInnerHTML={{ __html: html }} />
          {showBadge && (
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
