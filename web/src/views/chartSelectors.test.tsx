import { describe, it, expect } from 'vitest'
import { renderHook } from '@testing-library/react'
import { ChartProvider } from './ChartContext'
import { useIsSelected, useIsCollapsed } from './chartSelectors'
import type { ReactNode } from 'react'

const stableActions = {
  onSelect: () => {},
  setNodeRef: () => () => {},
}

function wrapper(selectedIds: Set<string>, collapsedIds?: Set<string>) {
  return ({ children }: { children: ReactNode }) => (
    <ChartProvider data={{ selectedIds, collapsedIds }} actions={stableActions as any}>
      {children}
    </ChartProvider>
  )
}

describe('useIsSelected', () => {
  it('returns true when id is in selectedIds', () => {
    const { result } = renderHook(() => useIsSelected('a'), { wrapper: wrapper(new Set(['a'])) })
    expect(result.current).toBe(true)
  })
  it('returns false when id is not in selectedIds', () => {
    const { result } = renderHook(() => useIsSelected('a'), { wrapper: wrapper(new Set(['b'])) })
    expect(result.current).toBe(false)
  })
})

describe('useIsCollapsed', () => {
  it('returns true when id is in collapsedIds', () => {
    const { result } = renderHook(() => useIsCollapsed('a'), { wrapper: wrapper(new Set(), new Set(['a'])) })
    expect(result.current).toBe(true)
  })
  it('returns false when collapsedIds undefined', () => {
    const { result } = renderHook(() => useIsCollapsed('a'), { wrapper: wrapper(new Set()) })
    expect(result.current).toBe(false)
  })
})
