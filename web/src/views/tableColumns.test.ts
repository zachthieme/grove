// Scenarios: VIEW-003
import { describe, it, expect } from 'vitest'
import { getPersonValue, buildExtraColumns, TABLE_COLUMNS } from './tableColumns'
import type { Person } from '../api/types'

// Helper to make a minimal person for testing
function makePerson(overrides: Partial<Person> = {}): Person {
  return {
    id: 'test-id',
    name: 'Test Person',
    role: 'Engineer',
    discipline: 'Engineering',
    managerId: '',
    team: 'Platform',
    additionalTeams: [],
    status: 'Active',
    ...overrides,
  } as Person
}

describe('getPersonValue', () => {
  it('returns standard string fields', () => {
    const p = makePerson({ name: 'Alice', role: 'VP', team: 'Exec' })
    expect(getPersonValue(p, 'name')).toBe('Alice')
    expect(getPersonValue(p, 'role')).toBe('VP')
    expect(getPersonValue(p, 'team')).toBe('Exec')
  })

  it('returns level as string or empty', () => {
    expect(getPersonValue(makePerson({ level: 5 }), 'level')).toBe('5')
    expect(getPersonValue(makePerson({ level: 0 }), 'level')).toBe('')
    expect(getPersonValue(makePerson(), 'level')).toBe('')
  })

  it('joins additionalTeams with comma', () => {
    const p = makePerson({ additionalTeams: ['Alpha', 'Beta'] })
    expect(getPersonValue(p, 'additionalTeams')).toBe('Alpha, Beta')
  })

  it('returns empty string for null additionalTeams', () => {
    const p = makePerson({ additionalTeams: undefined as unknown as string[] })
    expect(getPersonValue(p, 'additionalTeams')).toBe('')
  })

  it('returns private as string', () => {
    expect(getPersonValue(makePerson({ private: true }), 'private')).toBe('true')
    expect(getPersonValue(makePerson({ private: false }), 'private')).toBe('false')
    expect(getPersonValue(makePerson(), 'private')).toBe('false')
  })

  it('returns extra field values', () => {
    const p = makePerson({ extra: { 'Custom Field': 'custom value' } })
    expect(getPersonValue(p, 'extra:Custom Field')).toBe('custom value')
  })

  it('returns empty string for missing extra field', () => {
    const p = makePerson()
    expect(getPersonValue(p, 'extra:nonexistent')).toBe('')
  })

  it('returns empty string for unknown key', () => {
    const p = makePerson()
    expect(getPersonValue(p, 'nonexistent')).toBe('')
  })
})

describe('buildExtraColumns', () => {
  it('returns empty array when no people have extras', () => {
    const people = [makePerson(), makePerson()]
    expect(buildExtraColumns(people)).toEqual([])
  })

  it('collects unique extra keys sorted alphabetically', () => {
    const people = [
      makePerson({ extra: { Zebra: 'z', Alpha: 'a' } }),
      makePerson({ extra: { Alpha: 'a2', Beta: 'b' } }),
    ]
    const cols = buildExtraColumns(people)
    expect(cols.map(c => c.label)).toEqual(['Alpha', 'Beta', 'Zebra'])
    expect(cols.every(c => c.key.startsWith('extra:'))).toBe(true)
    expect(cols.every(c => c.cellType === 'text')).toBe(true)
  })

  it('handles people with no extra field', () => {
    const people = [
      makePerson(),
      makePerson({ extra: { Foo: 'bar' } }),
    ]
    const cols = buildExtraColumns(people)
    expect(cols).toHaveLength(1)
    expect(cols[0].label).toBe('Foo')
  })
})

describe('TABLE_COLUMNS', () => {
  it('includes all expected standard columns', () => {
    const keys = TABLE_COLUMNS.map(c => c.key)
    expect(keys).toContain('name')
    expect(keys).toContain('role')
    expect(keys).toContain('discipline')
    expect(keys).toContain('team')
    expect(keys).toContain('managerId')
    expect(keys).toContain('status')
    expect(keys).toContain('level')
    expect(keys).toContain('pod')
    expect(keys).toContain('publicNote')
    expect(keys).toContain('privateNote')
    expect(keys).toContain('private')
  })

  it('has unique keys', () => {
    const keys = TABLE_COLUMNS.map(c => c.key)
    expect(new Set(keys).size).toBe(keys.length)
  })

  it('has non-empty labels', () => {
    for (const col of TABLE_COLUMNS) {
      expect(col.label.length).toBeGreaterThan(0)
    }
  })

  it('has valid cell types', () => {
    const validTypes = ['text', 'number', 'dropdown', 'checkbox']
    for (const col of TABLE_COLUMNS) {
      expect(validTypes).toContain(col.cellType)
    }
  })
})
