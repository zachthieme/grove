import { describe, it, expect } from 'vitest'
import { renderHook } from '@testing-library/react'
import type { Person } from '../api/types'
import { useHeadSubtree } from './useHeadSubtree'

const makePerson = (overrides: Partial<Person> & { id: string; name: string }): Person => ({
  role: 'Eng',
  discipline: 'Eng',
  managerId: '',
  team: 'Team',
  additionalTeams: [],
  status: 'Active',
  ...overrides,
})

const alice = makePerson({ id: '1', name: 'Alice' })
const bob = makePerson({ id: '2', name: 'Bob', managerId: '1' })
const carol = makePerson({ id: '3', name: 'Carol', managerId: '1' })
const dave = makePerson({ id: '4', name: 'Dave', managerId: '2' })
const eve = makePerson({ id: '5', name: 'Eve', managerId: '2' })
const frank = makePerson({ id: '6', name: 'Frank', managerId: '4' })

const everyone = [alice, bob, carol, dave, eve, frank]

describe('useHeadSubtree', () => {
  it('returns null when headPersonId is null', () => {
    const { result } = renderHook(() => useHeadSubtree(null, everyone))
    expect(result.current).toBeNull()
  })

  it('returns all descendant IDs including the head for a manager', () => {
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

  it('returns just the head ID for a leaf node', () => {
    const { result } = renderHook(() => useHeadSubtree('3', everyone))
    expect(result.current).not.toBeNull()
    const ids = result.current!
    expect(ids.has('3')).toBe(true) // Carol
    expect(ids.size).toBe(1)
  })

  it('returns the full tree when head is the root', () => {
    const { result } = renderHook(() => useHeadSubtree('1', everyone))
    expect(result.current).not.toBeNull()
    const ids = result.current!
    expect(ids.size).toBe(6)
    for (const p of everyone) {
      expect(ids.has(p.id)).toBe(true)
    }
  })

  it('handles empty working list with a non-null head', () => {
    const { result } = renderHook(() => useHeadSubtree('1', []))
    expect(result.current).not.toBeNull()
    const ids = result.current!
    // The head ID itself is always added even if no one lists it
    expect(ids.has('1')).toBe(true)
    expect(ids.size).toBe(1)
  })
})
