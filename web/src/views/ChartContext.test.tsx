// Scenarios: VIEW-001
import { describe, it, expect, vi } from 'vitest'
import { render, renderHook } from '@testing-library/react'
import { ChartProvider, useChart, useChartData, useChartActions } from './ChartContext'
import type { ChartDataContextValue, ChartActionsContextValue } from './ChartContext'

function makeData(overrides?: Partial<ChartDataContextValue>): ChartDataContextValue {
  return {
    selectedIds: new Set<string>(),
    ...overrides,
  }
}

function makeActions(overrides?: Partial<ChartActionsContextValue>): ChartActionsContextValue {
  return {
    onSelect: vi.fn(),
    setNodeRef: vi.fn(() => vi.fn()),
    ...overrides,
  }
}

describe('ChartContext', () => {
  it('useChart throws when used outside ChartProvider', () => {
    expect(() => renderHook(() => useChart())).toThrow(
      'useChartData must be used within a ChartProvider',
    )
  })

  it('useChartData throws when used outside ChartProvider', () => {
    expect(() => renderHook(() => useChartData())).toThrow(
      'useChartData must be used within a ChartProvider',
    )
  })

  it('useChartActions throws when used outside ChartProvider', () => {
    expect(() => renderHook(() => useChartActions())).toThrow(
      'useChartActions must be used within a ChartProvider',
    )
  })

  it('useChart returns merged data and actions when used within ChartProvider', () => {
    const data = makeData({ selectedIds: new Set(['a']) })
    const actions = makeActions()
    const { result } = renderHook(() => useChart(), {
      wrapper: ({ children }) => (
        <ChartProvider data={data} actions={actions}>{children}</ChartProvider>
      ),
    })
    expect(result.current.selectedIds).toBe(data.selectedIds)
    expect(result.current.onSelect).toBe(actions.onSelect)
  })

  it('useChartData returns only data context', () => {
    const data = makeData({ selectedIds: new Set(['b']) })
    const actions = makeActions()
    const { result } = renderHook(() => useChartData(), {
      wrapper: ({ children }) => (
        <ChartProvider data={data} actions={actions}>{children}</ChartProvider>
      ),
    })
    expect(result.current.selectedIds).toBe(data.selectedIds)
    expect('onSelect' in result.current).toBe(false)
  })

  it('useChartActions returns only actions context', () => {
    const data = makeData()
    const actions = makeActions()
    const { result } = renderHook(() => useChartActions(), {
      wrapper: ({ children }) => (
        <ChartProvider data={data} actions={actions}>{children}</ChartProvider>
      ),
    })
    expect(result.current.onSelect).toBe(actions.onSelect)
    expect('selectedIds' in result.current).toBe(false)
  })

  it('ChartProvider passes value to children', () => {
    const onSelect = vi.fn()
    const data = makeData()
    const actions = makeActions({ onSelect })

    function Consumer() {
      const ctx = useChart()
      return <button onClick={() => ctx.onSelect('test-id')}>select</button>
    }

    const { getByText } = render(
      <ChartProvider data={data} actions={actions}>
        <Consumer />
      </ChartProvider>,
    )

    getByText('select').click()
    expect(onSelect).toHaveBeenCalledWith('test-id')
  })
})
