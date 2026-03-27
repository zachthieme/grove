import { describe, it, expect } from 'vitest'
import { sortPeople } from './useSortedPeople'
import type { Person } from '../api/types'

const makePerson = (overrides: Partial<Person>): Person => ({
  id: '1', name: 'Test', role: '', discipline: '', managerId: '', team: '',
  additionalTeams: [], status: 'Active', ...overrides,
})

describe('sortPeople', () => {
  it('[FILTER-003] sorts FTEs before non-FTEs', () => {
    const people = [
      makePerson({ id: 'a', name: 'CW-Person', employmentType: 'CW', managerId: 'm1', team: 'T' }),
      makePerson({ id: 'b', name: 'FTE-Person', employmentType: 'FTE', managerId: 'm1', team: 'T' }),
    ]
    const sorted = sortPeople(people, [])
    expect(sorted[0].name).toBe('FTE-Person')
    expect(sorted[1].name).toBe('CW-Person')
  })

  it('[FILTER-003] sorts Interns with FTEs (tier 0)', () => {
    const people = [
      makePerson({ id: 'a', name: 'PSP', employmentType: 'PSP', managerId: 'm1', team: 'T' }),
      makePerson({ id: 'b', name: 'Intern', employmentType: 'Intern', managerId: 'm1', team: 'T' }),
    ]
    const sorted = sortPeople(people, [])
    expect(sorted[0].name).toBe('Intern')
  })

  it('[FILTER-003] sorts by discipline order within same tier', () => {
    const people = [
      makePerson({ id: 'a', name: 'Product-Person', discipline: 'Product', managerId: 'm1', team: 'T' }),
      makePerson({ id: 'b', name: 'Eng-Person', discipline: 'Eng', managerId: 'm1', team: 'T' }),
    ]
    const sorted = sortPeople(people, ['Eng', 'Product'])
    expect(sorted[0].name).toBe('Eng-Person')
    expect(sorted[1].name).toBe('Product-Person')
  })

  it('[FILTER-003] sorts unknown disciplines to end alphabetically', () => {
    const people = [
      makePerson({ id: 'a', name: 'Zzz', discipline: 'Zzz', managerId: 'm1', team: 'T' }),
      makePerson({ id: 'b', name: 'Eng', discipline: 'Eng', managerId: 'm1', team: 'T' }),
      makePerson({ id: 'c', name: 'Aaa', discipline: 'Aaa', managerId: 'm1', team: 'T' }),
    ]
    const sorted = sortPeople(people, ['Eng'])
    expect(sorted[0].name).toBe('Eng')
    expect(sorted[1].name).toBe('Aaa')
    expect(sorted[2].name).toBe('Zzz')
  })

  it('[FILTER-003] sorts by level descending within same discipline', () => {
    const people = [
      makePerson({ id: 'a', name: 'Junior', discipline: 'Eng', level: 2, managerId: 'm1', team: 'T' }),
      makePerson({ id: 'b', name: 'Senior', discipline: 'Eng', level: 6, managerId: 'm1', team: 'T' }),
    ]
    const sorted = sortPeople(people, ['Eng'])
    expect(sorted[0].name).toBe('Senior')
    expect(sorted[1].name).toBe('Junior')
  })

  it('[FILTER-003] sorts level 0 (unset) below set levels', () => {
    const people = [
      makePerson({ id: 'a', name: 'Unset', discipline: 'Eng', level: 0, managerId: 'm1', team: 'T' }),
      makePerson({ id: 'b', name: 'IC1', discipline: 'Eng', level: 1, managerId: 'm1', team: 'T' }),
    ]
    const sorted = sortPeople(people, ['Eng'])
    expect(sorted[0].name).toBe('IC1')
    expect(sorted[1].name).toBe('Unset')
  })

  it('[FILTER-003] preserves sortIndex order on ties', () => {
    const people = [
      makePerson({ id: 'a', name: 'Second', discipline: 'Eng', level: 3, sortIndex: 2, managerId: 'm1', team: 'T' }),
      makePerson({ id: 'b', name: 'First', discipline: 'Eng', level: 3, sortIndex: 1, managerId: 'm1', team: 'T' }),
    ]
    const sorted = sortPeople(people, ['Eng'])
    expect(sorted[0].name).toBe('First')
    expect(sorted[1].name).toBe('Second')
  })

  it('[FILTER-003] does not sort root nodes', () => {
    const people = [
      makePerson({ id: 'a', name: 'Root1', managerId: '' }),
      makePerson({ id: 'b', name: 'Root2', managerId: '' }),
    ]
    const sorted = sortPeople(people, [])
    expect(sorted[0].name).toBe('Root1')
    expect(sorted[1].name).toBe('Root2')
  })

  it('[FILTER-003] sorts independently per (managerId, team) group', () => {
    const people = [
      makePerson({ id: 'a', name: 'CW-T1', employmentType: 'CW', managerId: 'm1', team: 'T1' }),
      makePerson({ id: 'b', name: 'FTE-T1', employmentType: 'FTE', managerId: 'm1', team: 'T1' }),
      makePerson({ id: 'c', name: 'CW-T2', employmentType: 'CW', managerId: 'm1', team: 'T2' }),
      makePerson({ id: 'd', name: 'FTE-T2', employmentType: 'FTE', managerId: 'm1', team: 'T2' }),
    ]
    const sorted = sortPeople(people, [])
    const t1 = sorted.filter(p => p.team === 'T1')
    expect(t1[0].name).toBe('FTE-T1')
    const t2 = sorted.filter(p => p.team === 'T2')
    expect(t2[0].name).toBe('FTE-T2')
  })
})
