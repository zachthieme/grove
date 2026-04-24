// Scenarios: VIEW-003
import { describe, it, expect } from 'vitest'
import { getPersonValue, buildExtraColumns, TABLE_COLUMNS } from './tableColumns'
import type { OrgNode } from '../api/types'

// Helper to make a minimal person for testing
function makeNode(overrides: Partial<OrgNode> = {}): OrgNode {
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
  } as OrgNode
}

describe('getPersonValue', () => {
  it('returns standard string fields', () => {
    const p = makeNode({ name: 'Alice', role: 'VP', team: 'Exec' })
    expect(getPersonValue(p, 'name')).toBe('Alice')
    expect(getPersonValue(p, 'role')).toBe('VP')
    expect(getPersonValue(p, 'team')).toBe('Exec')
  })

  it('returns level as string or empty', () => {
    expect(getPersonValue(makeNode({ level: 5 }), 'level')).toBe('5')
    expect(getPersonValue(makeNode({ level: 0 }), 'level')).toBe('')
    expect(getPersonValue(makeNode(), 'level')).toBe('')
  })

  it('joins additionalTeams with comma', () => {
    const p = makeNode({ additionalTeams: ['Alpha', 'Beta'] })
    expect(getPersonValue(p, 'additionalTeams')).toBe('Alpha, Beta')
  })

  it('returns empty string for null additionalTeams', () => {
    const p = makeNode({ additionalTeams: undefined as unknown as string[] })
    expect(getPersonValue(p, 'additionalTeams')).toBe('')
  })

  it('returns private as string', () => {
    expect(getPersonValue(makeNode({ private: true }), 'private')).toBe('true')
    expect(getPersonValue(makeNode({ private: false }), 'private')).toBe('false')
    expect(getPersonValue(makeNode(), 'private')).toBe('false')
  })

  it('returns extra field values', () => {
    const p = makeNode({ extra: { 'Custom Field': 'custom value' } })
    expect(getPersonValue(p, 'extra:Custom Field')).toBe('custom value')
  })

  it('returns empty string for missing extra field', () => {
    const p = makeNode()
    expect(getPersonValue(p, 'extra:nonexistent')).toBe('')
  })

  it('returns empty string for unknown key', () => {
    const p = makeNode()
    expect(getPersonValue(p, 'nonexistent')).toBe('')
  })
})

describe('buildExtraColumns', () => {
  it('returns empty array when no people have extras', () => {
    const people = [makeNode(), makeNode()]
    expect(buildExtraColumns(people)).toEqual([])
  })

  it('collects unique extra keys sorted alphabetically', () => {
    const people = [
      makeNode({ extra: { Zebra: 'z', Alpha: 'a' } }),
      makeNode({ extra: { Alpha: 'a2', Beta: 'b' } }),
    ]
    const cols = buildExtraColumns(people)
    expect(cols.map(c => c.label)).toEqual(['Alpha', 'Beta', 'Zebra'])
    expect(cols.every(c => c.key.startsWith('extra:'))).toBe(true)
    expect(cols.every(c => c.cellType === 'text')).toBe(true)
  })

  it('handles people with no extra field', () => {
    const people = [
      makeNode(),
      makeNode({ extra: { Foo: 'bar' } }),
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
