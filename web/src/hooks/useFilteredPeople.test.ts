import { describe, it, expect } from 'vitest'
import { renderHook } from '@testing-library/react'
import type { Person } from '../api/types'
import { useFilteredPeople } from './useFilteredPeople'

const makePerson = (overrides: Partial<Person> & { id: string; name: string }): Person => ({
  role: 'Eng',
  discipline: 'Eng',
  managerId: '',
  team: 'Team',
  additionalTeams: [],
  status: 'Active',
  ...overrides,
})

const alice = makePerson({ id: '1', name: 'Alice', employmentType: 'FTE' })
const bob = makePerson({ id: '2', name: 'Bob', employmentType: 'Contractor', managerId: '1' })
const carol = makePerson({ id: '3', name: 'Carol', employmentType: 'FTE', managerId: '1' })
const dave = makePerson({ id: '4', name: 'Dave', employmentType: 'Intern', managerId: '2' })

describe('useFilteredPeople', () => {
  it('[FILTER-001] returns all people when no filters are applied', () => {
    const all = [alice, bob, carol, dave]
    const { result } = renderHook(() =>
      useFilteredPeople(all, all, all, new Set(), null, false, true),
    )
    expect(result.current.people).toEqual(all)
    expect(result.current.ghostPeople).toEqual([])
  })

  it('[FILTER-001] filters out people matching hidden employment types', () => {
    const all = [alice, bob, carol, dave]
    const hidden = new Set(['Contractor'])
    const { result } = renderHook(() =>
      useFilteredPeople(all, all, all, hidden, null, false, true),
    )
    expect(result.current.people).toEqual([alice, carol, dave])
  })

  it('[FILTER-002] filters to only people in the head subtree', () => {
    const all = [alice, bob, carol, dave]
    const subtree = new Set(['2', '4']) // Bob and Dave
    const { result } = renderHook(() =>
      useFilteredPeople(all, all, all, new Set(), subtree, false, true),
    )
    expect(result.current.people).toEqual([bob, dave])
  })

  it('[FILTER-001] applies both employment type and head subtree filters together', () => {
    const all = [alice, bob, carol, dave]
    const hidden = new Set(['Contractor'])
    const subtree = new Set(['1', '2', '4']) // Alice, Bob, Dave — but Bob is Contractor
    const { result } = renderHook(() =>
      useFilteredPeople(all, all, all, hidden, subtree, false, true),
    )
    expect(result.current.people).toEqual([alice, dave])
  })

  it('[VIEW-004] returns empty ghostPeople when showChanges is false', () => {
    const original = [alice, bob]
    const working = [alice] // Bob removed
    const { result } = renderHook(() =>
      useFilteredPeople(working, original, working, new Set(), null, false, true),
    )
    expect(result.current.ghostPeople).toEqual([])
  })

  it('[VIEW-004] computes ghost people in diff mode (removed from working)', () => {
    const original = [alice, bob, carol]
    const working = [alice] // Bob and Carol removed
    const { result } = renderHook(() =>
      useFilteredPeople(working, original, working, new Set(), null, true, true),
    )
    expect(result.current.ghostPeople).toEqual([bob, carol])
  })

  it('[FILTER-001] filters ghost people by hidden employment types', () => {
    const original = [alice, bob, carol]
    const working = [alice] // Bob (Contractor) and Carol (FTE) removed
    const hidden = new Set(['Contractor'])
    const { result } = renderHook(() =>
      useFilteredPeople(working, original, working, hidden, null, true, true),
    )
    // Bob is filtered out because he's a Contractor
    expect(result.current.ghostPeople).toEqual([carol])
  })

  it('[FILTER-002] filters ghost people by head subtree', () => {
    const original = [alice, bob, carol]
    const working = [alice] // Bob and Carol removed
    const subtree = new Set(['1', '2']) // Only Alice and Bob in subtree
    const { result } = renderHook(() =>
      useFilteredPeople(working, original, working, new Set(), subtree, true, true),
    )
    // Carol is not in the subtree, so she's filtered out of ghosts
    expect(result.current.ghostPeople).toEqual([bob])
  })

  it('[FILTER-001] handles empty arrays', () => {
    const { result } = renderHook(() =>
      useFilteredPeople([], [], [], new Set(), null, false, true),
    )
    expect(result.current.people).toEqual([])
    expect(result.current.ghostPeople).toEqual([])
  })

  it('[VIEW-004] handles empty arrays with showChanges true', () => {
    const { result } = renderHook(() =>
      useFilteredPeople([], [], [], new Set(), null, true, true),
    )
    expect(result.current.people).toEqual([])
    expect(result.current.ghostPeople).toEqual([])
  })

  it('[FILTER-001] treats people with undefined employmentType correctly when filtering', () => {
    const noType = makePerson({ id: '5', name: 'Eve' }) // no employmentType
    const all = [alice, noType]
    // Hiding empty string should filter out people with no employmentType
    const hidden = new Set([''])
    const { result } = renderHook(() =>
      useFilteredPeople(all, all, all, hidden, null, false, true),
    )
    expect(result.current.people).toEqual([alice])
  })

  describe('private people filtering', () => {
    const eve = makePerson({ id: '5', name: 'Eve', managerId: '1', private: true })

    it('[FILTER-004] hides private people when showPrivate is false', () => {
      const all = [alice, bob, eve]
      const { result } = renderHook(() =>
        useFilteredPeople(all, all, all, new Set(), null, false, false),
      )
      expect(result.current.people.map(p => p.name)).toEqual(['Alice', 'Bob'])
    })

    it('[FILTER-004] shows private people when showPrivate is true', () => {
      const all = [alice, bob, eve]
      const { result } = renderHook(() =>
        useFilteredPeople(all, all, all, new Set(), null, false, true),
      )
      expect(result.current.people.map(p => p.name)).toEqual(['Alice', 'Bob', 'Eve'])
    })

    it('[FILTER-004] injects placeholder for hidden private manager with visible reports', () => {
      const eveManager = makePerson({ id: '5', name: 'Eve', private: true })
      const bobUnder = makePerson({ id: '2', name: 'Bob', managerId: '5' })
      const all = [eveManager, bobUnder]
      const { result } = renderHook(() =>
        useFilteredPeople(all, all, all, new Set(), null, false, false),
      )
      const names = result.current.people.map(p => p.name)
      expect(names).toContain('TBD Manager')
      expect(names).toContain('Bob')
      expect(names).not.toContain('Eve')
      const placeholder = result.current.people.find(p => p.name === 'TBD Manager')!
      expect((placeholder as any).isPlaceholder).toBe(true)
      const bob2 = result.current.people.find(p => p.name === 'Bob')!
      expect(bob2.managerId).toBe(placeholder.id)
    })

    it('[FILTER-004] does not inject placeholder when private manager has no visible reports', () => {
      const eveManager = makePerson({ id: '5', name: 'Eve', private: true })
      const all = [alice, eveManager]
      const { result } = renderHook(() =>
        useFilteredPeople(all, all, all, new Set(), null, false, false),
      )
      expect(result.current.people.map(p => p.name)).toEqual(['Alice'])
    })

    it('[FILTER-004] placeholder has stable deterministic ID', () => {
      const eveManager = makePerson({ id: '5', name: 'Eve', private: true })
      const bobUnder = makePerson({ id: '2', name: 'Bob', managerId: '5' })
      const all = [eveManager, bobUnder]
      const { result: r1 } = renderHook(() =>
        useFilteredPeople(all, all, all, new Set(), null, false, false),
      )
      const { result: r2 } = renderHook(() =>
        useFilteredPeople(all, all, all, new Set(), null, false, false),
      )
      const ph1 = r1.current.people.find(p => p.name === 'TBD Manager')!
      const ph2 = r2.current.people.find(p => p.name === 'TBD Manager')!
      expect(ph1.id).toBe(ph2.id)
    })

    it('[FILTER-004] filters private people from ghost people in diff mode', () => {
      const evePrivate = makePerson({ id: '5', name: 'Eve', private: true })
      const original = [alice, bob, evePrivate]
      const working = [alice]
      const { result } = renderHook(() =>
        useFilteredPeople(working, original, working, new Set(), null, true, false),
      )
      expect(result.current.ghostPeople.map(p => p.name)).toEqual(['Bob'])
    })
  })
})
