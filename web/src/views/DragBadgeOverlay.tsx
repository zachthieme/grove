import { useEffect, useRef } from 'react'
import { DragOverlay } from '@dnd-kit/core'

interface DragBadgeOverlayProps {
  activeDragId: string | null
  selectedIds: Set<string>
}

const wrapperStyle: React.CSSProperties = {
  width: 160,
  opacity: 0.92,
  pointerEvents: 'none',
  position: 'relative',
  transform: 'rotate(-2deg) scale(1.04)',
  filter: 'drop-shadow(0 8px 20px rgba(44, 36, 24, 0.18))',
  transition: 'transform 0.15s ease',
}

const badgeStyle: React.CSSProperties = {
  position: 'absolute',
  top: -8,
  right: -8,
  background: 'var(--grove-green)',
  color: '#fff',
  borderRadius: '50%',
  width: 20,
  height: 20,
  fontSize: 11,
  fontWeight: 700,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
}

/**
 * Drag preview that mirrors the dragged node's visual via DOM cloneNode.
 * Avoids dangerouslySetInnerHTML — no string parsing, no XSS surface.
 */
export function DragBadgeOverlay({ activeDragId, selectedIds }: DragBadgeOverlayProps) {
  const containerRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    container.replaceChildren()
    if (!activeDragId) return
    for (const host of document.querySelectorAll<HTMLElement>('[data-person-id]')) {
      if (host.dataset.personId !== activeDragId) continue
      const source = host.querySelector('[role="button"]')
      if (source) container.appendChild(source.cloneNode(true))
      break
    }
  }, [activeDragId])

  const showBadge = !!activeDragId && selectedIds.has(activeDragId) && selectedIds.size > 1

  return (
    <DragOverlay dropAnimation={null}>
      {activeDragId && (
        <div style={wrapperStyle}>
          <div ref={containerRef} />
          {showBadge && <div style={badgeStyle}>{selectedIds.size}</div>}
        </div>
      )}
    </DragOverlay>
  )
}
