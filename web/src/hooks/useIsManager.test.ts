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

  it('returns true for VP role even without reports', () => {
    const alice = makePerson({ role: 'VP Engineering' })
    expect(isManager(alice, [alice])).toBe(true)
  })

  it('returns true for Director role', () => {
    const alice = makePerson({ role: 'Director of Platform' })
    expect(isManager(alice, [alice])).toBe(true)
  })

  it('returns true for Engineering Manager role', () => {
    const alice = makePerson({ role: 'Engineering Manager' })
    expect(isManager(alice, [alice])).toBe(true)
  })

  it('returns true for Lead role', () => {
    const alice = makePerson({ role: 'Tech Lead' })
    expect(isManager(alice, [alice])).toBe(true)
  })

  it('returns false for Staff Engineer', () => {
    const alice = makePerson({ role: 'Staff Engineer' })
    expect(isManager(alice, [alice])).toBe(false)
  })

  it('returns false for Senior Engineer', () => {
    const alice = makePerson({ role: 'Senior Engineer' })
    expect(isManager(alice, [alice])).toBe(false)
  })

  it('returns false for Principal Engineer', () => {
    const alice = makePerson({ role: 'Principal Engineer' })
    expect(isManager(alice, [alice])).toBe(false)
  })

  it('returns true for Head of Design', () => {
    const alice = makePerson({ role: 'Head of Design' })
    expect(isManager(alice, [alice])).toBe(true)
  })

  it('returns true for Chief Technology Officer', () => {
    const alice = makePerson({ role: 'Chief Technology Officer' })
    expect(isManager(alice, [alice])).toBe(true)
  })

  it('returns false for empty role with no reports', () => {
    const alice = makePerson({ role: '' })
    expect(isManager(alice, [alice])).toBe(false)
  })

  it('prefers direct reports over role pattern', () => {
    // Even with an IC title, having a direct report makes you a manager
    const alice = makePerson({ id: '1', role: 'Engineer' })
    const bob = makePerson({ id: '2', managerId: '1', role: 'Intern' })
    expect(isManager(alice, [alice, bob])).toBe(true)
  })
})
