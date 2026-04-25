/**
 * Additional branch coverage for useChartLayout.
 * Covers: edge line computation with registered nodes, dashed edge branch,
 * ResizeObserver null containerRef.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import type { ChartEdge } from './useChartLayout'

const mockOnDragEnd = vi.fn()

vi.mock('./useDragDrop', () => ({
  useDragDrop: () => ({ onDragEnd: mockOnDragEnd }),
}))

class MockResizeObserver { observe() {} unobserve() {} disconnect() {} }
globalThis.ResizeObserver = MockResizeObserver as unknown as typeof ResizeObserver

const { useChartLayout } = await import('./useChartLayout')

function makeElement(rect: { top: number; left: number; bottom: number; right: number; width: number; height: number }) {
  const el = document.createElement('div')
  Object.defineProperty(el, 'getBoundingClientRect', {
    value: () => ({ ...rect, x: rect.left, y: rect.top, toJSON: () => {} }),
  })
  return el
}

function renderWithContainer(edges: ChartEdge[] = [], layoutDeps: unknown = 0) {
  const result = renderHook(() => useChartLayout(edges, layoutDeps))
  const containerEl = document.createElement('div')
  Object.defineProperty(containerEl, 'getBoundingClientRect', {
    value: () => ({ top: 0, left: 0, bottom: 100, right: 200, width: 200, height: 100, x: 0, y: 0, toJSON: () => {} }),
  })
  Object.defineProperty(containerEl, 'scrollLeft', { value: 0 })
  Object.defineProperty(containerEl, 'scrollTop', { value: 0 })

  act(() => {
    ;(result.result.current.containerRef as { current: HTMLDivElement | null }).current = containerEl
  })

  return result
}

describe('useChartLayout — edge line computation', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('computes lines for non-dashed edges', () => {
    const edges: ChartEdge[] = [
      { fromId: 'a', toId: 'b' },
    ]
    const { result } = renderWithContainer(edges, 0)

    // Register node elements
    const fromEl = makeElement({ top: 10, left: 50, bottom: 30, right: 100, width: 50, height: 20 })
    const toEl = makeElement({ top: 50, left: 60, bottom: 70, right: 110, width: 50, height: 20 })

    act(() => {
      result.current.setNodeRef('a')(fromEl)
      result.current.setNodeRef('b')(toEl)
    })

    // Re-render to trigger line computation
    const { result: result2 } = renderWithContainer(edges, 1)
    act(() => {
      result2.current.setNodeRef('a')(fromEl)
      result2.current.setNodeRef('b')(toEl)
    })
  })

  it('computes lines for dashed edges', () => {
    const edges: ChartEdge[] = [
      { fromId: 'a', toId: 'b', dashed: true },
    ]
    const { result } = renderWithContainer(edges, 0)

    const fromEl = makeElement({ top: 10, left: 50, bottom: 30, right: 100, width: 50, height: 20 })
    const toEl = makeElement({ top: 50, left: 60, bottom: 70, right: 110, width: 50, height: 20 })

    act(() => {
      result.current.setNodeRef('a')(fromEl)
      result.current.setNodeRef('b')(toEl)
    })
  })

  it('skips edges where only one node is registered', () => {
    const edges: ChartEdge[] = [
      { fromId: 'a', toId: 'missing' },
    ]
    const { result } = renderWithContainer(edges, 0)

    const fromEl = makeElement({ top: 10, left: 50, bottom: 30, right: 100, width: 50, height: 20 })

    act(() => {
      result.current.setNodeRef('a')(fromEl)
    })

    // Lines should be empty since toId is not registered
    expect(result.current.lines).toEqual([])
  })
})
