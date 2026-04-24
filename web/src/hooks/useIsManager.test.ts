// Scenarios: VIEW-001
import { describe, it, expect } from 'vitest'
import { renderHook } from '@testing-library/react'
import type { OrgNode } from '../api/types'
import { makeNode } from '../test-helpers'
import { useManagerSet } from './useIsManager'

describe('useManagerSet', () => {
  it('returns an empty set for an empty people array', () => {
    const { result } = renderHook(() => useManagerSet([]))
    expect(result.current.size).toBe(0)
  })

  it('includes IDs referenced as managerId', () => {
    const people: OrgNode[] = [
      makeNode({ id: 'mgr-1', name: 'Manager', managerId: '' }),
      makeNode({ id: 'ic-1', name: 'IC One', managerId: 'mgr-1' }),
      makeNode({ id: 'ic-2', name: 'IC Two', managerId: 'mgr-1' }),
    ]
    const { result } = renderHook(() => useManagerSet(people))
    expect(result.current.has('mgr-1')).toBe(true)
  })

  it('does not include IDs of people without a managerId', () => {
    const people: OrgNode[] = [
      makeNode({ id: 'root', name: 'Root', managerId: '' }),
      makeNode({ id: 'ic-1', name: 'IC One', managerId: 'root' }),
    ]
    const { result } = renderHook(() => useManagerSet(people))
    expect(result.current.has('ic-1')).toBe(false)
    expect(result.current.size).toBe(1)
  })

  it('deduplicates when multiple people share the same managerId', () => {
    const people: OrgNode[] = [
      makeNode({ id: 'mgr-1', name: 'Manager', managerId: '' }),
      makeNode({ id: 'ic-1', name: 'IC One', managerId: 'mgr-1' }),
      makeNode({ id: 'ic-2', name: 'IC Two', managerId: 'mgr-1' }),
      makeNode({ id: 'ic-3', name: 'IC Three', managerId: 'mgr-1' }),
    ]
    const { result } = renderHook(() => useManagerSet(people))
    expect(result.current.size).toBe(1)
    expect(result.current.has('mgr-1')).toBe(true)
  })

  it('returns a new set reference when people array changes', () => {
    const initial: OrgNode[] = [
      makeNode({ id: 'mgr-1', name: 'Manager', managerId: '' }),
      makeNode({ id: 'ic-1', name: 'IC', managerId: 'mgr-1' }),
    ]
    const { result, rerender } = renderHook(
      ({ people }) => useManagerSet(people),
      { initialProps: { people: initial } },
    )
    const firstSet = result.current

    const updated: OrgNode[] = [
      makeNode({ id: 'mgr-2', name: 'New Manager', managerId: '' }),
      makeNode({ id: 'ic-2', name: 'New IC', managerId: 'mgr-2' }),
    ]
    rerender({ people: updated })

    expect(result.current).not.toBe(firstSet)
    expect(result.current.has('mgr-2')).toBe(true)
    expect(result.current.has('mgr-1')).toBe(false)
  })
})
