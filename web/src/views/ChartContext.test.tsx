// Scenarios: VIEW-001
import { describe, it, expect, vi } from 'vitest'
import { render, renderHook } from '@testing-library/react'
import { ChartProvider, useChart } from './ChartContext'
import type { ChartContextValue } from './ChartContext'

function makeValue(overrides?: Partial<ChartContextValue>): ChartContextValue {
  return {
    selectedIds: new Set<string>(),
    onSelect: vi.fn(),
    setNodeRef: vi.fn(() => vi.fn()),
    ...overrides,
  }
}

describe('ChartContext', () => {
  it('useChart throws when used outside ChartProvider', () => {
    expect(() => renderHook(() => useChart())).toThrow(
      'useChart must be used within a ChartProvider',
    )
  })

  it('useChart returns context value when used within ChartProvider', () => {
    const value = makeValue()
    const { result } = renderHook(() => useChart(), {
      wrapper: ({ children }) => (
        <ChartProvider value={value}>{children}</ChartProvider>
      ),
    })
    expect(result.current).toBe(value)
  })

  it('ChartProvider passes value to children', () => {
    const onSelect = vi.fn()
    const value = makeValue({ onSelect })

    function Consumer() {
      const ctx = useChart()
      return <button onClick={() => ctx.onSelect('test-id')}>select</button>
    }

    const { getByText } = render(
      <ChartProvider value={value}>
        <Consumer />
      </ChartProvider>,
    )

    getByText('select').click()
    expect(onSelect).toHaveBeenCalledWith('test-id')
  })
})
