import { describe, it, expect } from 'vitest'
import { renderHook } from '@testing-library/react'
import type { OrgNode } from '../api/types'
import { useHeadSubtree } from './useHeadSubtree'

const makeNode = (overrides: Partial<OrgNode> & { id: string; name: string }): OrgNode => ({
  role: 'Eng',
  discipline: 'Eng',
  managerId: '',
  team: 'Team',
  additionalTeams: [],
  status: 'Active',
  ...overrides,
})

const alice = makeNode({ id: '1', name: 'Alice' })
const bob = makeNode({ id: '2', name: 'Bob', managerId: '1' })
const carol = makeNode({ id: '3', name: 'Carol', managerId: '1' })
const dave = makeNode({ id: '4', name: 'Dave', managerId: '2' })
const eve = makeNode({ id: '5', name: 'Eve', managerId: '2' })
const frank = makeNode({ id: '6', name: 'Frank', managerId: '4' })

const everyone = [alice, bob, carol, dave, eve, frank]

describe('useHeadSubtree', () => {
  it('[FILTER-002] returns null when headPersonId is null', () => {
    const { result } = renderHook(() => useHeadSubtree(null, everyone))
    expect(result.current).toBeNull()
  })

  it('[FILTER-002] returns all descendant IDs including the head for a manager', () => {
    // Bob manages Dave and Eve; Dave manages Frank
    const { result } = renderHook(() => useHeadSubtree('2', everyone))
    expect(result.current).not.toBeNull()
    const ids = result.current!
    expect(ids.has('2')).toBe(true) // Bob (head)
    expect(ids.has('4')).toBe(true) // Dave (direct report)
    expect(ids.has('5')).toBe(true) // Eve (direct report)
    expect(ids.has('6')).toBe(true) // Frank (grandchild)
    expect(ids.size).toBe(4)
  })

  it('[FILTER-002] returns just the head ID for a leaf node', () => {
    const { result } = renderHook(() => useHeadSubtree('3', everyone))
    expect(result.current).not.toBeNull()
    const ids = result.current!
    expect(ids.has('3')).toBe(true) // Carol
    expect(ids.size).toBe(1)
  })

  it('[FILTER-002] returns the full tree when head is the root', () => {
    const { result } = renderHook(() => useHeadSubtree('1', everyone))
    expect(result.current).not.toBeNull()
    const ids = result.current!
    expect(ids.size).toBe(6)
    for (const p of everyone) {
      expect(ids.has(p.id)).toBe(true)
    }
  })

  it('[FILTER-002] handles empty working list with a non-null head', () => {
    const { result } = renderHook(() => useHeadSubtree('1', []))
    expect(result.current).not.toBeNull()
    const ids = result.current!
    // The head ID itself is always added even if no one lists it
    expect(ids.has('1')).toBe(true)
    expect(ids.size).toBe(1)
  })
})
