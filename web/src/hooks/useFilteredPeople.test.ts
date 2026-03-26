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
  it('returns all people when no filters are applied', () => {
    const all = [alice, bob, carol, dave]
    const { result } = renderHook(() =>
      useFilteredPeople(all, all, all, new Set(), null, false),
    )
    expect(result.current.people).toEqual(all)
    expect(result.current.ghostPeople).toEqual([])
  })

  it('filters out people matching hidden employment types', () => {
    const all = [alice, bob, carol, dave]
    const hidden = new Set(['Contractor'])
    const { result } = renderHook(() =>
      useFilteredPeople(all, all, all, hidden, null, false),
    )
    expect(result.current.people).toEqual([alice, carol, dave])
  })

  it('filters to only people in the head subtree', () => {
    const all = [alice, bob, carol, dave]
    const subtree = new Set(['2', '4']) // Bob and Dave
    const { result } = renderHook(() =>
      useFilteredPeople(all, all, all, new Set(), subtree, false),
    )
    expect(result.current.people).toEqual([bob, dave])
  })

  it('applies both employment type and head subtree filters together', () => {
    const all = [alice, bob, carol, dave]
    const hidden = new Set(['Contractor'])
    const subtree = new Set(['1', '2', '4']) // Alice, Bob, Dave — but Bob is Contractor
    const { result } = renderHook(() =>
      useFilteredPeople(all, all, all, hidden, subtree, false),
    )
    expect(result.current.people).toEqual([alice, dave])
  })

  it('returns empty ghostPeople when showChanges is false', () => {
    const original = [alice, bob]
    const working = [alice] // Bob removed
    const { result } = renderHook(() =>
      useFilteredPeople(working, original, working, new Set(), null, false),
    )
    expect(result.current.ghostPeople).toEqual([])
  })

  it('computes ghost people in diff mode (removed from working)', () => {
    const original = [alice, bob, carol]
    const working = [alice] // Bob and Carol removed
    const { result } = renderHook(() =>
      useFilteredPeople(working, original, working, new Set(), null, true),
    )
    expect(result.current.ghostPeople).toEqual([bob, carol])
  })

  it('filters ghost people by hidden employment types', () => {
    const original = [alice, bob, carol]
    const working = [alice] // Bob (Contractor) and Carol (FTE) removed
    const hidden = new Set(['Contractor'])
    const { result } = renderHook(() =>
      useFilteredPeople(working, original, working, hidden, null, true),
    )
    // Bob is filtered out because he's a Contractor
    expect(result.current.ghostPeople).toEqual([carol])
  })

  it('filters ghost people by head subtree', () => {
    const original = [alice, bob, carol]
    const working = [alice] // Bob and Carol removed
    const subtree = new Set(['1', '2']) // Only Alice and Bob in subtree
    const { result } = renderHook(() =>
      useFilteredPeople(working, original, working, new Set(), subtree, true),
    )
    // Carol is not in the subtree, so she's filtered out of ghosts
    expect(result.current.ghostPeople).toEqual([bob])
  })

  it('handles empty arrays', () => {
    const { result } = renderHook(() =>
      useFilteredPeople([], [], [], new Set(), null, false),
    )
    expect(result.current.people).toEqual([])
    expect(result.current.ghostPeople).toEqual([])
  })

  it('handles empty arrays with showChanges true', () => {
    const { result } = renderHook(() =>
      useFilteredPeople([], [], [], new Set(), null, true),
    )
    expect(result.current.people).toEqual([])
    expect(result.current.ghostPeople).toEqual([])
  })

  it('treats people with undefined employmentType correctly when filtering', () => {
    const noType = makePerson({ id: '5', name: 'Eve' }) // no employmentType
    const all = [alice, noType]
    // Hiding empty string should filter out people with no employmentType
    const hidden = new Set([''])
    const { result } = renderHook(() =>
      useFilteredPeople(all, all, all, hidden, null, false),
    )
    expect(result.current.people).toEqual([alice])
  })
})
