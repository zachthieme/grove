import { describe, it, expect } from 'vitest'
import { sortPeople } from './useSortedPeople'
import type { OrgNode } from '../api/types'

const makeNode = (overrides: Partial<OrgNode>): OrgNode => ({
  id: '1', name: 'Test', role: '', discipline: '', managerId: '', team: '',
  additionalTeams: [], status: 'Active', ...overrides,
})

describe('sortPeople', () => {
  it('[FILTER-003] sorts FTEs before non-FTEs', () => {
    const people = [
      makeNode({ id: 'a', name: 'CW-Person', employmentType: 'CW', managerId: 'm1', team: 'T' }),
      makeNode({ id: 'b', name: 'FTE-Person', employmentType: 'FTE', managerId: 'm1', team: 'T' }),
    ]
    const sorted = sortPeople(people, [])
    expect(sorted[0].name).toBe('FTE-Person')
    expect(sorted[1].name).toBe('CW-Person')
  })

  it('[FILTER-003] sorts Interns with FTEs (tier 0)', () => {
    const people = [
      makeNode({ id: 'a', name: 'PSP', employmentType: 'PSP', managerId: 'm1', team: 'T' }),
      makeNode({ id: 'b', name: 'Intern', employmentType: 'Intern', managerId: 'm1', team: 'T' }),
    ]
    const sorted = sortPeople(people, [])
    expect(sorted[0].name).toBe('Intern')
  })

  it('[FILTER-003] sorts by discipline order within same tier', () => {
    const people = [
      makeNode({ id: 'a', name: 'Product-Person', discipline: 'Product', managerId: 'm1', team: 'T' }),
      makeNode({ id: 'b', name: 'Eng-Person', discipline: 'Eng', managerId: 'm1', team: 'T' }),
    ]
    const sorted = sortPeople(people, ['Eng', 'Product'])
    expect(sorted[0].name).toBe('Eng-Person')
    expect(sorted[1].name).toBe('Product-Person')
  })

  it('[FILTER-003] sorts unknown disciplines to end alphabetically', () => {
    const people = [
      makeNode({ id: 'a', name: 'Zzz', discipline: 'Zzz', managerId: 'm1', team: 'T' }),
      makeNode({ id: 'b', name: 'Eng', discipline: 'Eng', managerId: 'm1', team: 'T' }),
      makeNode({ id: 'c', name: 'Aaa', discipline: 'Aaa', managerId: 'm1', team: 'T' }),
    ]
    const sorted = sortPeople(people, ['Eng'])
    expect(sorted[0].name).toBe('Eng')
    expect(sorted[1].name).toBe('Aaa')
    expect(sorted[2].name).toBe('Zzz')
  })

  it('[FILTER-003] sorts by level descending within same discipline', () => {
    const people = [
      makeNode({ id: 'a', name: 'Junior', discipline: 'Eng', level: 2, managerId: 'm1', team: 'T' }),
      makeNode({ id: 'b', name: 'Senior', discipline: 'Eng', level: 6, managerId: 'm1', team: 'T' }),
    ]
    const sorted = sortPeople(people, ['Eng'])
    expect(sorted[0].name).toBe('Senior')
    expect(sorted[1].name).toBe('Junior')
  })

  it('[FILTER-003] sorts level 0 (unset) below set levels', () => {
    const people = [
      makeNode({ id: 'a', name: 'Unset', discipline: 'Eng', level: 0, managerId: 'm1', team: 'T' }),
      makeNode({ id: 'b', name: 'IC1', discipline: 'Eng', level: 1, managerId: 'm1', team: 'T' }),
    ]
    const sorted = sortPeople(people, ['Eng'])
    expect(sorted[0].name).toBe('IC1')
    expect(sorted[1].name).toBe('Unset')
  })

  it('[FILTER-003] preserves sortIndex order on ties', () => {
    const people = [
      makeNode({ id: 'a', name: 'Second', discipline: 'Eng', level: 3, sortIndex: 2, managerId: 'm1', team: 'T' }),
      makeNode({ id: 'b', name: 'First', discipline: 'Eng', level: 3, sortIndex: 1, managerId: 'm1', team: 'T' }),
    ]
    const sorted = sortPeople(people, ['Eng'])
    expect(sorted[0].name).toBe('First')
    expect(sorted[1].name).toBe('Second')
  })

  it('[FILTER-003] does not sort root nodes', () => {
    const people = [
      makeNode({ id: 'a', name: 'Root1', managerId: '' }),
      makeNode({ id: 'b', name: 'Root2', managerId: '' }),
    ]
    const sorted = sortPeople(people, [])
    expect(sorted[0].name).toBe('Root1')
    expect(sorted[1].name).toBe('Root2')
  })

  it('[FILTER-003] sorts independently per (managerId, team) group', () => {
    const people = [
      makeNode({ id: 'a', name: 'CW-T1', employmentType: 'CW', managerId: 'm1', team: 'T1' }),
      makeNode({ id: 'b', name: 'FTE-T1', employmentType: 'FTE', managerId: 'm1', team: 'T1' }),
      makeNode({ id: 'c', name: 'CW-T2', employmentType: 'CW', managerId: 'm1', team: 'T2' }),
      makeNode({ id: 'd', name: 'FTE-T2', employmentType: 'FTE', managerId: 'm1', team: 'T2' }),
    ]
    const sorted = sortPeople(people, [])
    const t1 = sorted.filter(p => p.team === 'T1')
    expect(t1[0].name).toBe('FTE-T1')
    const t2 = sorted.filter(p => p.team === 'T2')
    expect(t2[0].name).toBe('FTE-T2')
  })

  it('handles nodes with null additionalTeams', () => {
    const people = [
      makeNode({ id: '1', name: 'Alice', additionalTeams: null as unknown as string[] }),
      makeNode({ id: '2', name: 'Bob', managerId: 'm1', additionalTeams: [] }),
    ]
    const result = sortPeople(people, [])
    expect(result).toHaveLength(2)
  })

  it('handles null disciplineOrder', () => {
    const people = [
      makeNode({ id: 'm1', name: 'Manager', managerId: '' }),
      makeNode({ id: '1', name: 'Alice', discipline: 'Eng', managerId: 'm1', team: 'T' }),
      makeNode({ id: '2', name: 'Bob', discipline: 'PM', managerId: 'm1', team: 'T' }),
    ]
    const result = sortPeople(people, null as unknown as string[])
    expect(result).toHaveLength(3)
  })

  it('sorts stably when most nodes have empty discipline', () => {
    const people = [
      makeNode({ id: 'm1', name: 'Manager', managerId: '' }),
      makeNode({ id: 'a', name: 'Alice', discipline: '', managerId: 'm1', team: 'T' }),
      makeNode({ id: 'b', name: 'Bob', discipline: '', managerId: 'm1', team: 'T' }),
      makeNode({ id: 'c', name: 'Carol', discipline: 'Eng', managerId: 'm1', team: 'T' }),
      makeNode({ id: 'd', name: 'Dave', discipline: '', managerId: 'm1', team: 'T' }),
    ]
    const result = sortPeople(people, ['Eng'])
    // Carol (known discipline) sorts before the empty-discipline group
    const managed = result.filter(p => p.managerId === 'm1')
    expect(managed[0].name).toBe('Carol')
    // Empty-discipline nodes maintain stable order among themselves
    const empties = managed.filter(p => p.discipline === '')
    expect(empties.map(p => p.name)).toEqual(['Alice', 'Bob', 'Dave'])
  })
})
