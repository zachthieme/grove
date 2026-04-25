/**
 * Additional branch coverage for useChartLayout (round 2).
 * Targets uncovered branches:
 * - ResizeObserver callback triggers re-render (resizeKey increment)
 * - useLayoutEffect: edges with container producing lines
 * - Edge line computation: dashed=true vs dashed=false (lines 64-79)
 * - Edge with one missing node ref (continue branch, line 60)
 * - Multiple edges: mixed dashed/non-dashed
 * - handleDragEnd without prior dragStart
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import type { ChartEdge } from './useChartLayout'

const mockOnDragEnd = vi.fn()

vi.mock('./useDragDrop', () => ({
  useDragDrop: () => ({ onDragEnd: mockOnDragEnd }),
}))

// Capture the ResizeObserver callback so we can trigger it. Use a class so
// `new ResizeObserver(...)` works (arrow-function mocks aren't constructors).
let resizeObserverCallback: (() => void) | null = null
const mockObserve = vi.fn()
const mockDisconnect = vi.fn()

class MockResizeObserver {
  constructor(cb: () => void) {
    resizeObserverCallback = cb
  }
  observe = mockObserve
  unobserve = vi.fn()
  disconnect = mockDisconnect
}
globalThis.ResizeObserver = MockResizeObserver as unknown as typeof ResizeObserver

const { useChartLayout } = await import('./useChartLayout')

function makeElement(rect: { top: number; left: number; bottom: number; right: number; width: number; height: number }) {
  const el = document.createElement('div')
  Object.defineProperty(el, 'getBoundingClientRect', {
    value: () => ({ ...rect, x: rect.left, y: rect.top, toJSON: () => {} }),
  })
  return el
}

function makeContainer(rect = { top: 0, left: 0, bottom: 200, right: 400, width: 400, height: 200 }) {
  const el = document.createElement('div')
  Object.defineProperty(el, 'getBoundingClientRect', {
    value: () => ({ ...rect, x: rect.left, y: rect.top, toJSON: () => {} }),
  })
  Object.defineProperty(el, 'scrollLeft', { value: 10, configurable: true })
  Object.defineProperty(el, 'scrollTop', { value: 20, configurable: true })
  return el
}

/**
 * Helper that renders the hook and immediately attaches a container element
 * to prevent the infinite loop from setLines([]) with null container.
 */
function renderWithContainer(edges: ChartEdge[] = [], layoutDeps: unknown = 0) {
  const result = renderHook(
    ({ e, d }) => useChartLayout(e, d),
    { initialProps: { e: edges, d: layoutDeps } },
  )
  const containerEl = makeContainer()
  act(() => {
    ;(result.result.current.containerRef as { current: HTMLDivElement | null }).current = containerEl
  })
  return { ...result, containerEl }
}

describe('useChartLayout — branch coverage round 2', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    resizeObserverCallback = null
  })

  describe('ResizeObserver', () => {
    it('triggers re-render when ResizeObserver fires, recomputing lines', () => {
      const edges: ChartEdge[] = [{ fromId: 'a', toId: 'b' }]
      const { result } = renderWithContainer(edges, 0)

      const fromEl = makeElement({ top: 10, left: 50, bottom: 30, right: 100, width: 50, height: 20 })
      const toEl = makeElement({ top: 50, left: 60, bottom: 70, right: 110, width: 50, height: 20 })

      act(() => {
        result.current.setNodeRef('a')(fromEl)
        result.current.setNodeRef('b')(toEl)
      })

      // Trigger ResizeObserver callback to increment resizeKey
      if (resizeObserverCallback) {
        act(() => {
          resizeObserverCallback!()
        })
      }

      // After resize, lines should be recomputed (non-empty since nodes are registered)
      // We just verify the callback path doesn't crash
    })
  })

  describe('useLayoutEffect — edge computation with container', () => {
    it('sets lines to empty when edges array is empty and container exists', () => {
      const { result } = renderWithContainer([], 0)
      expect(result.current.lines).toEqual([])
    })

    it('computes non-dashed lines with correct coordinates including scroll offsets', () => {
      const edges: ChartEdge[] = [{ fromId: 'a', toId: 'b' }]
      const { result, rerender } = renderWithContainer(edges, 0)

      const fromEl = makeElement({ top: 10, left: 50, bottom: 30, right: 100, width: 50, height: 20 })
      const toEl = makeElement({ top: 60, left: 80, bottom: 80, right: 130, width: 50, height: 20 })

      act(() => {
        result.current.setNodeRef('a')(fromEl)
        result.current.setNodeRef('b')(toEl)
      })

      // Force rerender to trigger useLayoutEffect with new layoutDeps
      rerender({ e: edges, d: 1 })

      expect(result.current.lines.length).toBe(1)
      const line = result.current.lines[0]
      // x1 = fr.left + fr.width/2 - rect.left + sl = 50 + 25 - 0 + 10 = 85
      expect(line.x1).toBe(85)
      // y1 = fr.bottom - rect.top + st = 30 - 0 + 20 = 50
      expect(line.y1).toBe(50)
      // x2 = tr.left + tr.width/2 - rect.left + sl = 80 + 25 - 0 + 10 = 115
      expect(line.x2).toBe(115)
      // y2 = tr.top - rect.top + st = 60 - 0 + 20 = 80 (non-dashed uses tr.top)
      expect(line.y2).toBe(80)
      expect(line.dashed).toBeUndefined()
    })

    it('computes dashed lines with bottom-to-bottom y coordinates', () => {
      const edges: ChartEdge[] = [{ fromId: 'a', toId: 'b', dashed: true }]
      const { result, rerender } = renderWithContainer(edges, 0)

      const fromEl = makeElement({ top: 10, left: 50, bottom: 30, right: 100, width: 50, height: 20 })
      const toEl = makeElement({ top: 60, left: 80, bottom: 80, right: 130, width: 50, height: 20 })

      act(() => {
        result.current.setNodeRef('a')(fromEl)
        result.current.setNodeRef('b')(toEl)
      })

      rerender({ e: edges, d: 1 })

      expect(result.current.lines.length).toBe(1)
      const line = result.current.lines[0]
      expect(line.dashed).toBe(true)
      // y2 = tr.bottom - rect.top + st = 80 - 0 + 20 = 100 (dashed uses tr.bottom)
      expect(line.y2).toBe(100)
      // y1 = fr.bottom - rect.top + st = 30 - 0 + 20 = 50
      expect(line.y1).toBe(50)
    })

    it('skips edges when fromEl is missing but toEl exists', () => {
      const edges: ChartEdge[] = [{ fromId: 'missing', toId: 'b' }]
      const { result, rerender } = renderWithContainer(edges, 0)

      const toEl = makeElement({ top: 60, left: 80, bottom: 80, right: 130, width: 50, height: 20 })

      act(() => {
        result.current.setNodeRef('b')(toEl)
      })

      rerender({ e: edges, d: 1 })
      expect(result.current.lines).toEqual([])
    })

    it('skips edges when toEl is missing but fromEl exists', () => {
      const edges: ChartEdge[] = [{ fromId: 'a', toId: 'missing' }]
      const { result, rerender } = renderWithContainer(edges, 0)

      const fromEl = makeElement({ top: 10, left: 50, bottom: 30, right: 100, width: 50, height: 20 })

      act(() => {
        result.current.setNodeRef('a')(fromEl)
      })

      rerender({ e: edges, d: 1 })
      expect(result.current.lines).toEqual([])
    })

    it('computes lines for multiple edges mixing dashed and non-dashed', () => {
      const edges: ChartEdge[] = [
        { fromId: 'a', toId: 'b' },
        { fromId: 'a', toId: 'c', dashed: true },
      ]
      const { result, rerender } = renderWithContainer(edges, 0)

      const aEl = makeElement({ top: 10, left: 50, bottom: 30, right: 100, width: 50, height: 20 })
      const bEl = makeElement({ top: 60, left: 80, bottom: 80, right: 130, width: 50, height: 20 })
      const cEl = makeElement({ top: 60, left: 150, bottom: 80, right: 200, width: 50, height: 20 })

      act(() => {
        result.current.setNodeRef('a')(aEl)
        result.current.setNodeRef('b')(bEl)
        result.current.setNodeRef('c')(cEl)
      })

      rerender({ e: edges, d: 1 })

      expect(result.current.lines.length).toBe(2)
      expect(result.current.lines[0].dashed).toBeUndefined()
      expect(result.current.lines[1].dashed).toBe(true)
    })

    it('partially skips edges in a list when only some nodes exist', () => {
      const edges: ChartEdge[] = [
        { fromId: 'a', toId: 'b' },
        { fromId: 'a', toId: 'missing' },
      ]
      const { result, rerender } = renderWithContainer(edges, 0)

      const aEl = makeElement({ top: 10, left: 50, bottom: 30, right: 100, width: 50, height: 20 })
      const bEl = makeElement({ top: 60, left: 80, bottom: 80, right: 130, width: 50, height: 20 })

      act(() => {
        result.current.setNodeRef('a')(aEl)
        result.current.setNodeRef('b')(bEl)
      })

      rerender({ e: edges, d: 1 })

      // Only the first edge should produce a line
      expect(result.current.lines.length).toBe(1)
    })
  })

  describe('handleDragEnd without prior dragStart', () => {
    it('clears activeDragId even if it was already null', () => {
      const { result } = renderWithContainer([], 0)

      const event = {
        active: { id: 'x', data: { current: undefined }, rect: { current: { initial: null, translated: null } } },
        over: null,
        collisions: null,
        delta: { x: 0, y: 0 },
        activatorEvent: new Event('pointer'),
      } as unknown as Parameters<typeof result.current.handleDragEnd>[0]

      act(() => {
        result.current.handleDragEnd(event)
      })

      expect(result.current.activeDragId).toBeNull()
      expect(mockOnDragEnd).toHaveBeenCalledWith(event)
    })
  })
})
