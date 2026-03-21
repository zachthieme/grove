import { useState, useCallback, useRef, type CSSProperties, type WheelEvent, type MouseEvent } from 'react'

interface Transform {
  x: number
  y: number
  scale: number
}

export default function useZoomPan() {
  const [transform, setTransform] = useState<Transform>({ x: 0, y: 0, scale: 1 })
  const dragging = useRef(false)
  const lastMouse = useRef({ x: 0, y: 0 })

  const onWheel = useCallback((e: WheelEvent) => {
    e.preventDefault()
    setTransform((t) => {
      const factor = e.deltaY > 0 ? 0.9 : 1.1
      const newScale = Math.min(3, Math.max(0.2, t.scale * factor))
      return { ...t, scale: newScale }
    })
  }, [])

  const onMouseDown = useCallback((e: MouseEvent) => {
    if (e.button !== 0) return
    dragging.current = true
    lastMouse.current = { x: e.clientX, y: e.clientY }
  }, [])

  const onMouseMove = useCallback((e: MouseEvent) => {
    if (!dragging.current) return
    const dx = e.clientX - lastMouse.current.x
    const dy = e.clientY - lastMouse.current.y
    lastMouse.current = { x: e.clientX, y: e.clientY }
    setTransform((t) => ({ ...t, x: t.x + dx, y: t.y + dy }))
  }, [])

  const onMouseUp = useCallback(() => {
    dragging.current = false
  }, [])

  const style: CSSProperties = {
    transform: `translate(${transform.x}px, ${transform.y}px) scale(${transform.scale})`,
    transformOrigin: '0 0',
  }

  const handlers = {
    onWheel,
    onMouseDown,
    onMouseMove,
    onMouseUp,
    onMouseLeave: onMouseUp,
  }

  return { style, handlers }
}
