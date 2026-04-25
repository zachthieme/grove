// Scenarios: VIEW-008
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import type { DragStartEvent, DragEndEvent } from '@dnd-kit/core'
import type { ChartEdge } from './useChartLayout'

const mockOnDragEnd = vi.fn()

vi.mock('./useDragDrop', () => ({
  useDragDrop: () => ({ onDragEnd: mockOnDragEnd }),
}))

class MockResizeObserver { observe() {} unobserve() {} disconnect() {} }
globalThis.ResizeObserver = MockResizeObserver as unknown as typeof ResizeObserver

// Dynamically import to apply mocks first
const { useChartLayout } = await import('./useChartLayout')

function makeDragStartEvent(id: string): DragStartEvent {
  return {
    active: { id, data: { current: undefined }, rect: { current: { initial: null, translated: null } } },
    activatorEvent: new Event('pointer'),
  } as unknown as DragStartEvent
}

function makeDragEndEvent(activeId: string, overId: string | null): DragEndEvent {
  return {
    active: { id: activeId, data: { current: undefined }, rect: { current: { initial: null, translated: null } } },
    over: overId ? { id: overId, data: { current: undefined }, rect: { width: 0, height: 0, top: 0, left: 0, right: 0, bottom: 0 }, disabled: false } : null,
    collisions: null,
    delta: { x: 0, y: 0 },
    activatorEvent: new Event('pointer'),
  } as unknown as DragEndEvent
}

/**
 * Renders useChartLayout with a container div already attached to containerRef.
 * This prevents the infinite useLayoutEffect loop in jsdom where setLines([])
 * triggers a re-render (new array reference) when containerRef.current is null.
 *
 * When containerRef.current exists but edges is empty, the hook returns early
 * with setLines([]) only once (React bails out because the result is the same
 * empty array). When containerRef exists and edges are provided, it computes
 * lines from getBoundingClientRect (all zeros in jsdom).
 */
function renderWithContainer(edges: ChartEdge[] = [], layoutDeps: unknown = 0) {
  const result = renderHook(() => useChartLayout(edges, layoutDeps))
  // After initial render, assign a container element so the useLayoutEffect
  // code path changes from "always setLines([])" to the computation branch.
  // For empty edges this still calls setLines([]) but only on that render.
  const containerEl = document.createElement('div')
  Object.defineProperty(containerEl, 'getBoundingClientRect', {
    value: () => ({ top: 0, left: 0, bottom: 0, right: 0, width: 0, height: 0, x: 0, y: 0, toJSON: () => {} }),
  })
  Object.defineProperty(containerEl, 'scrollLeft', { value: 0 })
  Object.defineProperty(containerEl, 'scrollTop', { value: 0 })

  act(() => {
    ;(result.result.current.containerRef as { current: HTMLDivElement | null }).current = containerEl
  })

  return result
}

describe('useChartLayout', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('[VIEW-008] returns empty lines and null activeDragId initially', () => {
    const { result } = renderWithContainer()

    expect(result.current.lines).toEqual([])
    expect(result.current.activeDragId).toBeNull()
  })

  it('[VIEW-008] setNodeRef sets element in nodeRefs and clears on null', () => {
    const { result } = renderWithContainer()

    const el = document.createElement('div')
    const refCallback = result.current.setNodeRef('node-1')

    act(() => {
      refCallback(el)
    })

    expect(result.current.nodeRefs.current.get('node-1')).toBe(el)

    act(() => {
      refCallback(null)
    })

    expect(result.current.nodeRefs.current.has('node-1')).toBe(false)
  })

  it('[VIEW-008] setNodeRef manages multiple nodes independently', () => {
    const { result } = renderWithContainer()

    const el1 = document.createElement('div')
    const el2 = document.createElement('div')

    act(() => {
      result.current.setNodeRef('node-a')(el1)
      result.current.setNodeRef('node-b')(el2)
    })

    expect(result.current.nodeRefs.current.get('node-a')).toBe(el1)
    expect(result.current.nodeRefs.current.get('node-b')).toBe(el2)
    expect(result.current.nodeRefs.current.size).toBe(2)

    act(() => {
      result.current.setNodeRef('node-a')(null)
    })

    expect(result.current.nodeRefs.current.has('node-a')).toBe(false)
    expect(result.current.nodeRefs.current.get('node-b')).toBe(el2)
  })

  it('[VIEW-008] handleDragStart sets activeDragId', () => {
    const { result } = renderWithContainer()

    act(() => {
      result.current.handleDragStart(makeDragStartEvent('person-1'))
    })

    expect(result.current.activeDragId).toBe('person-1')
  })

  it('[VIEW-008] handleDragEnd clears activeDragId and calls onDragEnd', () => {
    const { result } = renderWithContainer()

    act(() => {
      result.current.handleDragStart(makeDragStartEvent('person-1'))
    })

    expect(result.current.activeDragId).toBe('person-1')

    const event = makeDragEndEvent('person-1', 'person-2')
    act(() => {
      result.current.handleDragEnd(event)
    })

    expect(result.current.activeDragId).toBeNull()
    expect(mockOnDragEnd).toHaveBeenCalledTimes(1)
    expect(mockOnDragEnd).toHaveBeenCalledWith(event)
  })

  it('[VIEW-008] lines remain empty when edges array is empty', () => {
    const { result } = renderWithContainer([], 0)

    expect(result.current.lines).toEqual([])
  })

  it('[VIEW-008] sensors are configured', () => {
    const { result } = renderWithContainer()

    expect(result.current.sensors).toBeDefined()
    expect(result.current.sensors.length).toBeGreaterThan(0)
  })

  it('[VIEW-008] edges with missing node refs produce no lines', () => {
    const edges: ChartEdge[] = [
      { fromId: 'missing-a', toId: 'missing-b' },
    ]
    const { result } = renderWithContainer(edges, 0)

    // Node elements for 'missing-a' and 'missing-b' are not in nodeRefs,
    // so the edge is silently skipped and lines stays empty
    expect(result.current.lines).toEqual([])
  })

  it('[VIEW-008] containerRef is a mutable ref object', () => {
    const { result } = renderWithContainer()

    // containerRef is a ref object that can be attached to a DOM element
    expect(result.current.containerRef).toHaveProperty('current')
    // After renderWithContainer assigns the container element it is non-null
    expect(result.current.containerRef.current).toBeInstanceOf(HTMLDivElement)
  })
})
