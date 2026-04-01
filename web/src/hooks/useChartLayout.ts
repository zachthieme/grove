import { useRef, useState, useEffect, useCallback } from 'react'
import { MouseSensor, KeyboardSensor, useSensor, useSensors, type DragStartEvent } from '@dnd-kit/core'
import { useDragDrop } from './useDragDrop'

export interface ChartLine {
  x1: number; y1: number; x2: number; y2: number; dashed?: boolean
}

export interface ChartEdge {
  fromId: string; toId: string; dashed?: boolean
}

export function useChartLayout(edges: ChartEdge[], layoutDeps: unknown) {
  const { onDragEnd } = useDragDrop()
  const containerRef = useRef<HTMLDivElement>(null)
  const nodeRefs = useRef<Map<string, HTMLDivElement>>(new Map())
  const [lines, setLines] = useState<ChartLine[]>([])
  const [activeDragId, setActiveDragId] = useState<string | null>(null)

  const mouseSensor = useSensor(MouseSensor, { activationConstraint: { distance: 8 } })
  const keyboardSensor = useSensor(KeyboardSensor)
  const sensors = useSensors(mouseSensor, keyboardSensor)

  const handleDragStart = useCallback((event: DragStartEvent) => {
    setActiveDragId(event.active.id as string)
  }, [])

  const handleDragEnd = useCallback((event: Parameters<typeof onDragEnd>[0]) => {
    setActiveDragId(null)
    onDragEnd(event)
  }, [onDragEnd])

  const setNodeRef = useCallback((id: string) => (el: HTMLDivElement | null) => {
    if (el) nodeRefs.current.set(id, el)
    else nodeRefs.current.delete(id)
  }, [])

  const [resizeKey, setResizeKey] = useState(0)
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const observer = new ResizeObserver(() => setResizeKey((k) => k + 1))
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  const [scrollKey, setScrollKey] = useState(0)
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    let ticking = false
    const onScroll = () => {
      if (!ticking) {
        ticking = true
        requestAnimationFrame(() => {
          setScrollKey(k => k + 1)
          ticking = false
        })
      }
    }
    el.addEventListener('scroll', onScroll, { passive: true })
    return () => el.removeEventListener('scroll', onScroll)
  }, [])

  useEffect(() => {
    if (!containerRef.current || edges.length === 0) {
      setLines([])
      return
    }
    const container = containerRef.current
    const rect = container.getBoundingClientRect()
    const sl = container.scrollLeft
    const st = container.scrollTop
    const viewLeft = sl
    const viewRight = sl + rect.width
    const viewTop = st
    const viewBottom = st + rect.height
    const computed: ChartLine[] = []

    for (const { fromId, toId, dashed } of edges) {
      const fromEl = nodeRefs.current.get(fromId)
      const toEl = nodeRefs.current.get(toId)
      if (!fromEl || !toEl) continue
      const fr = fromEl.getBoundingClientRect()
      const tr = toEl.getBoundingClientRect()

      // Convert to container-relative coordinates
      const fx = fr.left - rect.left + sl
      const fy = fr.top - rect.top + st
      const tx = tr.left - rect.left + sl
      const ty = tr.top - rect.top + st

      // Skip edges where both endpoints are off-screen
      const fromVisible = fx + fr.width > viewLeft && fx < viewRight && fy + fr.height > viewTop && fy < viewBottom
      const toVisible = tx + tr.width > viewLeft && tx < viewRight && ty + tr.height > viewTop && ty < viewBottom
      if (!fromVisible && !toVisible) continue

      if (dashed) {
        computed.push({
          x1: fr.left + fr.width / 2 - rect.left + sl,
          y1: fr.bottom - rect.top + st,
          x2: tr.left + tr.width / 2 - rect.left + sl,
          y2: tr.bottom - rect.top + st,
          dashed: true,
        })
      } else {
        computed.push({
          x1: fr.left + fr.width / 2 - rect.left + sl,
          y1: fr.bottom - rect.top + st,
          x2: tr.left + tr.width / 2 - rect.left + sl,
          y2: tr.top - rect.top + st,
        })
      }
    }
    setLines(computed)
  }, [edges, resizeKey, scrollKey, layoutDeps])

  return { containerRef, nodeRefs, setNodeRef, lines, activeDragId, sensors, handleDragStart, handleDragEnd }
}
