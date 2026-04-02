import { useState, useCallback, useEffect, useRef } from 'react'

export interface LassoRect {
  x: number
  y: number
  width: number
  height: number
}

interface UseLassoSelectOptions {
  containerRef: React.RefObject<HTMLDivElement | null>
  nodeRefs: React.RefObject<Map<string, HTMLDivElement>>
  onSelect: (ids: Set<string>) => void
  enabled?: boolean
}

function rectsIntersect(a: LassoRect, b: DOMRect, containerRect: DOMRect, scrollLeft: number, scrollTop: number): boolean {
  // Convert node's viewport rect to container-relative coords (accounting for scroll)
  const bx = b.left - containerRect.left + scrollLeft
  const by = b.top - containerRect.top + scrollTop
  const bw = b.width
  const bh = b.height

  return !(a.x + a.width < bx || bx + bw < a.x || a.y + a.height < by || by + bh < a.y)
}

export function useLassoSelect({ containerRef, nodeRefs, onSelect, enabled = true }: UseLassoSelectOptions) {
  const [lassoRect, setLassoRect] = useState<LassoRect | null>(null)
  const startRef = useRef<{ x: number; y: number } | null>(null)
  const activeRef = useRef(false)

  const handleMouseDown = useCallback((e: MouseEvent) => {
    if (!enabled) return
    // Only start lasso on primary button, on empty space
    if (e.button !== 0) return
    // Check if click is on a person node (has draggable ancestor) — if so, let DnD handle it
    const target = e.target as HTMLElement
    if (target.closest('[data-dnd-draggable]') || target.closest('button') || target.closest('input') || target.closest('select') || target.closest('a')) return

    const container = containerRef.current
    if (!container) return

    const rect = container.getBoundingClientRect()
    const x = e.clientX - rect.left + container.scrollLeft
    const y = e.clientY - rect.top + container.scrollTop

    startRef.current = { x, y }
    activeRef.current = false
    // Don't set lasso rect yet — wait for movement threshold
  }, [containerRef, enabled])

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!startRef.current) return
    const container = containerRef.current
    if (!container) return

    const rect = container.getBoundingClientRect()
    const x = e.clientX - rect.left + container.scrollLeft
    const y = e.clientY - rect.top + container.scrollTop

    const dx = x - startRef.current.x
    const dy = y - startRef.current.y

    // Require 5px movement to start lasso (avoid accidental selection on click)
    if (!activeRef.current && Math.abs(dx) < 5 && Math.abs(dy) < 5) return
    activeRef.current = true

    const lasso: LassoRect = {
      x: Math.min(startRef.current.x, x),
      y: Math.min(startRef.current.y, y),
      width: Math.abs(dx),
      height: Math.abs(dy),
    }
    setLassoRect(lasso)

    // Compute which person nodes intersect
    const containerRect = container.getBoundingClientRect()
    const sl = container.scrollLeft
    const st = container.scrollTop
    const selected = new Set<string>()
    for (const [id, el] of nodeRefs.current) {
      // Skip group node IDs (pod, team, orphan collapseKeys all contain ':'; person UUIDs don't)
      if (id.includes(':')) continue
      const nodeRect = el.getBoundingClientRect()
      if (rectsIntersect(lasso, nodeRect, containerRect, sl, st)) {
        selected.add(id)
      }
    }
    onSelect(selected)
  }, [containerRef, nodeRefs, onSelect])

  const handleMouseUp = useCallback(() => {
    if (startRef.current && !activeRef.current) {
      // Simple click on empty space (no drag) — clear selection
      onSelect(new Set())
    }
    startRef.current = null
    activeRef.current = false
    setLassoRect(null)
  }, [onSelect])

  useEffect(() => {
    const container = containerRef.current
    if (!container || !enabled) return

    container.addEventListener('mousedown', handleMouseDown)
    window.addEventListener('mousemove', handleMouseMove)
    window.addEventListener('mouseup', handleMouseUp)
    return () => {
      container.removeEventListener('mousedown', handleMouseDown)
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('mouseup', handleMouseUp)
    }
  }, [containerRef, enabled, handleMouseDown, handleMouseMove, handleMouseUp])

  return { lassoRect }
}
