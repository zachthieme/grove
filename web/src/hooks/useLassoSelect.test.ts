import { describe, it, expect, vi, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { fireEvent } from '@testing-library/dom'
import { createRef } from 'react'
import { useLassoSelect } from './useLassoSelect'
import type { LassoRect } from './useLassoSelect'

// rectsIntersect is not exported, so we replicate it here for direct geometry testing
function rectsIntersect(
  a: LassoRect,
  b: { left: number; top: number; width: number; height: number },
  containerRect: { left: number; top: number },
  scrollLeft: number,
  scrollTop: number,
): boolean {
  const bx = b.left - containerRect.left + scrollLeft
  const by = b.top - containerRect.top + scrollTop
  const bw = b.width
  const bh = b.height
  return !(a.x + a.width < bx || bx + bw < a.x || a.y + a.height < by || by + bh < a.y)
}

describe('rectsIntersect (geometry)', () => {
  const container = { left: 0, top: 0 }

  it('returns true for overlapping rects', () => {
    const lasso: LassoRect = { x: 10, y: 10, width: 50, height: 50 }
    const node = { left: 30, top: 30, width: 40, height: 40 }
    expect(rectsIntersect(lasso, node, container, 0, 0)).toBe(true)
  })

  it('returns true when lasso fully contains node', () => {
    const lasso: LassoRect = { x: 0, y: 0, width: 200, height: 200 }
    const node = { left: 50, top: 50, width: 20, height: 20 }
    expect(rectsIntersect(lasso, node, container, 0, 0)).toBe(true)
  })

  it('returns true when node fully contains lasso', () => {
    const lasso: LassoRect = { x: 50, y: 50, width: 10, height: 10 }
    const node = { left: 0, top: 0, width: 200, height: 200 }
    expect(rectsIntersect(lasso, node, container, 0, 0)).toBe(true)
  })

  it('returns false when rects are separated horizontally', () => {
    const lasso: LassoRect = { x: 0, y: 0, width: 50, height: 50 }
    const node = { left: 100, top: 0, width: 50, height: 50 }
    expect(rectsIntersect(lasso, node, container, 0, 0)).toBe(false)
  })

  it('returns false when rects are separated vertically', () => {
    const lasso: LassoRect = { x: 0, y: 0, width: 50, height: 50 }
    const node = { left: 0, top: 100, width: 50, height: 50 }
    expect(rectsIntersect(lasso, node, container, 0, 0)).toBe(false)
  })

  it('returns true when rects share an edge (touching)', () => {
    const lasso: LassoRect = { x: 0, y: 0, width: 50, height: 50 }
    const node = { left: 50, top: 0, width: 50, height: 50 }
    // a.x + a.width == bx (50 == 50), so !(50 < 50) => !(false) => true for that check
    // but since they just touch, the first condition is false, so they intersect
    expect(rectsIntersect(lasso, node, container, 0, 0)).toBe(true)
  })

  it('accounts for container offset', () => {
    const lasso: LassoRect = { x: 10, y: 10, width: 50, height: 50 }
    const node = { left: 110, top: 110, width: 50, height: 50 }
    const offset = { left: 100, top: 100 }
    // node in container coords: bx = 110 - 100 + 0 = 10, by = 110 - 100 + 0 = 10
    expect(rectsIntersect(lasso, node, offset, 0, 0)).toBe(true)
  })

  it('accounts for scroll offset', () => {
    const lasso: LassoRect = { x: 500, y: 500, width: 50, height: 50 }
    const node = { left: 10, top: 10, width: 50, height: 50 }
    // node in container coords: bx = 10 - 0 + 500 = 510, by = 10 - 0 + 500 = 510
    expect(rectsIntersect(lasso, node, container, 500, 500)).toBe(true)
  })

  it('returns false when rects are far apart', () => {
    const lasso: LassoRect = { x: 0, y: 0, width: 10, height: 10 }
    const node = { left: 1000, top: 1000, width: 10, height: 10 }
    expect(rectsIntersect(lasso, node, container, 0, 0)).toBe(false)
  })
})

describe('useLassoSelect', () => {
  let container: HTMLDivElement

  afterEach(() => {
    if (container && container.parentNode) {
      container.parentNode.removeChild(container)
    }
  })

  function setup(enabled = true) {
    container = document.createElement('div')
    document.body.appendChild(container)

    // Mock getBoundingClientRect on the container
    container.getBoundingClientRect = () => ({
      left: 0, top: 0, right: 800, bottom: 600,
      width: 800, height: 600, x: 0, y: 0, toJSON: () => {},
    })
    // jsdom doesn't implement scrollLeft/scrollTop
    Object.defineProperty(container, 'scrollLeft', { value: 0, writable: true })
    Object.defineProperty(container, 'scrollTop', { value: 0, writable: true })

    const containerRef = createRef<HTMLDivElement>()
    ;(containerRef as { current: HTMLDivElement }).current = container

    const nodeRefs = createRef<Map<string, HTMLDivElement>>() as React.RefObject<Map<string, HTMLDivElement>>
    ;(nodeRefs as { current: Map<string, HTMLDivElement> }).current = new Map()

    const onSelect = vi.fn()

    const hookResult = renderHook(() =>
      useLassoSelect({ containerRef, nodeRefs, onSelect, enabled }),
    )

    return { containerRef, nodeRefs, onSelect, hookResult }
  }

  function addNode(nodeRefs: React.RefObject<Map<string, HTMLDivElement>>, id: string, rect: { left: number; top: number; width: number; height: number }) {
    const el = document.createElement('div')
    el.getBoundingClientRect = () => ({
      ...rect,
      right: rect.left + rect.width,
      bottom: rect.top + rect.height,
      x: rect.left,
      y: rect.top,
      toJSON: () => {},
    })
    nodeRefs.current!.set(id, el)
  }

  it('clears selection when clicking empty space without dragging', () => {
    const { onSelect } = setup()

    // mousedown on the container (empty space)
    fireEvent.mouseDown(container, { clientX: 100, clientY: 100, button: 0 })
    // mouseup immediately — no movement
    fireEvent.mouseUp(window)

    expect(onSelect).toHaveBeenCalledTimes(1)
    expect(onSelect).toHaveBeenCalledWith(new Set())
  })

  it('does not start lasso when movement is under 5px threshold', () => {
    const { onSelect } = setup()

    fireEvent.mouseDown(container, { clientX: 100, clientY: 100, button: 0 })
    // Move only 3px in each direction (under 5px threshold)
    fireEvent.mouseMove(window, { clientX: 103, clientY: 103 })

    // onSelect should not be called during mouse move (lasso not active)
    expect(onSelect).not.toHaveBeenCalled()

    fireEvent.mouseUp(window)
    // On mouseup without active lasso, it clears selection
    expect(onSelect).toHaveBeenCalledTimes(1)
    expect(onSelect).toHaveBeenCalledWith(new Set())
  })

  it('starts lasso after 5px movement threshold is exceeded', () => {
    const { nodeRefs, onSelect } = setup()

    addNode(nodeRefs, 'node-1', { left: 50, top: 50, width: 100, height: 30 })

    fireEvent.mouseDown(container, { clientX: 10, clientY: 10, button: 0 })
    // Move beyond 5px threshold
    fireEvent.mouseMove(window, { clientX: 200, clientY: 200 })

    // onSelect should have been called since lasso is now active
    expect(onSelect).toHaveBeenCalled()
  })

  it('selects nodes that intersect with lasso rect', () => {
    const { nodeRefs, onSelect } = setup()

    addNode(nodeRefs, 'node-1', { left: 50, top: 50, width: 100, height: 30 })
    addNode(nodeRefs, 'node-2', { left: 500, top: 500, width: 100, height: 30 })

    fireEvent.mouseDown(container, { clientX: 10, clientY: 10, button: 0 })
    // Drag to cover node-1 but not node-2
    fireEvent.mouseMove(window, { clientX: 200, clientY: 200 })

    const lastCall = onSelect.mock.calls[onSelect.mock.calls.length - 1]
    const selectedIds: Set<string> = lastCall[0]
    expect(selectedIds.has('node-1')).toBe(true)
    expect(selectedIds.has('node-2')).toBe(false)
  })

  it('skips pod header nodes (id starting with pod:)', () => {
    const { nodeRefs, onSelect } = setup()

    addNode(nodeRefs, 'node-1', { left: 50, top: 50, width: 100, height: 30 })
    addNode(nodeRefs, 'pod:header-1', { left: 60, top: 60, width: 100, height: 30 })

    fireEvent.mouseDown(container, { clientX: 0, clientY: 0, button: 0 })
    fireEvent.mouseMove(window, { clientX: 300, clientY: 300 })

    const lastCall = onSelect.mock.calls[onSelect.mock.calls.length - 1]
    const selectedIds: Set<string> = lastCall[0]
    expect(selectedIds.has('node-1')).toBe(true)
    expect(selectedIds.has('pod:header-1')).toBe(false)
  })

  it('does not start lasso on right click', () => {
    const { onSelect } = setup()

    fireEvent.mouseDown(container, { clientX: 100, clientY: 100, button: 2 })
    fireEvent.mouseMove(window, { clientX: 200, clientY: 200 })
    fireEvent.mouseUp(window)

    expect(onSelect).not.toHaveBeenCalled()
  })

  it('does not start lasso when clicking on a draggable element', () => {
    const { onSelect } = setup()

    const draggable = document.createElement('div')
    draggable.setAttribute('data-dnd-draggable', 'true')
    container.appendChild(draggable)

    fireEvent.mouseDown(draggable, { clientX: 100, clientY: 100, button: 0 })
    fireEvent.mouseMove(window, { clientX: 200, clientY: 200 })
    fireEvent.mouseUp(window)

    expect(onSelect).not.toHaveBeenCalled()
  })

  it('does not activate when enabled is false', () => {
    const { onSelect } = setup(false)

    fireEvent.mouseDown(container, { clientX: 100, clientY: 100, button: 0 })
    fireEvent.mouseMove(window, { clientX: 200, clientY: 200 })
    fireEvent.mouseUp(window)

    expect(onSelect).not.toHaveBeenCalled()
  })

  it('clears lasso rect on mouseup', () => {
    const { hookResult } = setup()

    fireEvent.mouseDown(container, { clientX: 0, clientY: 0, button: 0 })
    fireEvent.mouseMove(window, { clientX: 100, clientY: 100 })

    // During drag, lasso rect should be set (non-null)
    // After mouseup, it should be cleared
    act(() => {
      fireEvent.mouseUp(window)
    })

    expect(hookResult.result.current.lassoRect).toBeNull()
  })

  it('removes event listeners on unmount', () => {
    const { onSelect, hookResult } = setup()

    hookResult.unmount()

    fireEvent.mouseDown(container, { clientX: 100, clientY: 100, button: 0 })
    fireEvent.mouseUp(window)

    expect(onSelect).not.toHaveBeenCalled()
  })
})
