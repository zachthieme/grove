import { describe, it, expect } from 'vitest'
import type { Person } from '../api/types'
import { isManager } from './useIsManager'

const makePerson = (overrides: Partial<Person> = {}): Person => ({
  id: '1', name: 'Alice', role: 'Engineer', discipline: 'Eng',
  managerId: '', team: 'Eng', additionalTeams: [], status: 'Active',
  ...overrides,
})

describe('isManager', () => {
  it('returns true when person has direct reports', () => {
    const alice = makePerson({ id: '1', role: 'Engineer' })
    const bob = makePerson({ id: '2', managerId: '1' })
    expect(isManager(alice, [alice, bob])).toBe(true)
  })

  it('returns false for IC with no reports', () => {
    const alice = makePerson({ id: '1', role: 'Engineer' })
    expect(isManager(alice, [alice])).toBe(false)
  })

  it('returns false for VP role without reports', () => {
    const alice = makePerson({ role: 'VP Engineering' })
    expect(isManager(alice, [alice])).toBe(false)
  })

  it('returns false for Director role without reports', () => {
    const alice = makePerson({ role: 'Director of Platform' })
    expect(isManager(alice, [alice])).toBe(false)
  })

  it('returns false for Engineering Manager role without reports', () => {
    const alice = makePerson({ role: 'Engineering Manager' })
    expect(isManager(alice, [alice])).toBe(false)
  })

  it('returns false for Lead role without reports', () => {
    const alice = makePerson({ role: 'Tech Lead' })
    expect(isManager(alice, [alice])).toBe(false)
  })

  it('returns false for Staff Engineer', () => {
    const alice = makePerson({ role: 'Staff Engineer' })
    expect(isManager(alice, [alice])).toBe(false)
  })

  it('returns true when role is IC but has direct reports', () => {
    const alice = makePerson({ id: '1', role: 'Engineer' })
    const bob = makePerson({ id: '2', managerId: '1', role: 'Intern' })
    expect(isManager(alice, [alice, bob])).toBe(true)
  })

  it('returns true for Director with reports', () => {
    const alice = makePerson({ id: '1', role: 'Director of Platform' })
    const bob = makePerson({ id: '2', managerId: '1' })
    expect(isManager(alice, [alice, bob])).toBe(true)
  })
})
