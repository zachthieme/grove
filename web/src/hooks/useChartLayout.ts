import { useRef, useState, useEffect, useLayoutEffect, useCallback } from 'react'
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

  useLayoutEffect(() => {
    if (!containerRef.current || edges.length === 0) {
      setLines([])
      return
    }
    const rect = containerRef.current.getBoundingClientRect()
    const sl = containerRef.current.scrollLeft
    const st = containerRef.current.scrollTop
    const computed: ChartLine[] = []

    for (const { fromId, toId, dashed } of edges) {
      const fromEl = nodeRefs.current.get(fromId)
      const toEl = nodeRefs.current.get(toId)
      if (!fromEl || !toEl) continue
      const fr = fromEl.getBoundingClientRect()
      const tr = toEl.getBoundingClientRect()

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
  }, [edges, resizeKey, layoutDeps])

  return { containerRef, nodeRefs, setNodeRef, lines, activeDragId, sensors, handleDragStart, handleDragEnd }
}
