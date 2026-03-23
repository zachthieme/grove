import { describe, it, expect } from 'vitest'
import { computeRenderItems } from './columnLayout'
import type { OrgNode } from './shared'
import type { Person } from '../api/types'

const makeNode = (overrides: Partial<Person> & { id: string; name: string }): OrgNode => ({
  person: {
    role: 'Engineer',
    discipline: 'Eng',
    managerId: '',
    team: 'Team A',
    additionalTeams: [],
    status: 'Active',
    ...overrides,
  },
  children: [],
})

describe('computeRenderItems', () => {
  it('returns empty for no managers and no ICs', () => {
    const items = computeRenderItems([], [])
    expect(items).toHaveLength(0)
  })

  it('returns managers only when no ICs', () => {
    const managers = [makeNode({ id: '1', name: 'Alice', team: 'Eng' })]
    const items = computeRenderItems(managers, [])
    expect(items).toHaveLength(1)
    expect(items[0].type).toBe('manager')
  })

  it('returns unaffiliated ICs after managers', () => {
    const managers = [makeNode({ id: '1', name: 'Alice', team: 'Eng' })]
    const ics = [makeNode({ id: '2', name: 'Bob', team: 'Eng' })]
    const items = computeRenderItems(managers, ics)
    expect(items).toHaveLength(2)
    expect(items[0].type).toBe('manager')
    expect(items[1].type).toBe('ic')
  })

  it('places affiliated IC after the highest-indexed connected manager', () => {
    const managers = [
      makeNode({ id: '1', name: 'Alice', team: 'Eng' }),
      makeNode({ id: '2', name: 'Bob', team: 'Design' }),
    ]
    const ics = [makeNode({ id: '3', name: 'Carol', team: 'Eng', additionalTeams: ['Design'] })]
    const items = computeRenderItems(managers, ics)
    // Carol should be after Bob (Design is index 1, which is highest)
    expect(items[0].type).toBe('manager') // Alice
    expect(items[1].type).toBe('manager') // Bob
    expect(items[2].type).toBe('ic')      // Carol (after Design manager)
    if (items[2].type === 'ic') {
      expect(items[2].node.person.name).toBe('Carol')
    }
  })

  it('groups unaffiliated ICs by team when multiple teams exist', () => {
    const managers = [makeNode({ id: '1', name: 'Alice', team: 'Eng' })]
    const ics = [
      makeNode({ id: '2', name: 'Bob', team: 'Design' }),
      makeNode({ id: '3', name: 'Carol', team: 'Product' }),
    ]
    const items = computeRenderItems(managers, ics)
    expect(items).toHaveLength(3)
    expect(items[1].type).toBe('icGroup')
    expect(items[2].type).toBe('icGroup')
    if (items[1].type === 'icGroup') {
      expect(items[1].team).toBe('Design')
    }
    if (items[2].type === 'icGroup') {
      expect(items[2].team).toBe('Product')
    }
  })

  it('does not group unaffiliated ICs when only one team', () => {
    const managers = [makeNode({ id: '1', name: 'Alice', team: 'Eng' })]
    const ics = [
      makeNode({ id: '2', name: 'Bob', team: 'Design' }),
      makeNode({ id: '3', name: 'Carol', team: 'Design' }),
    ]
    const items = computeRenderItems(managers, ics)
    // Should be individual ICs, not a group
    expect(items).toHaveLength(3)
    expect(items[1].type).toBe('ic')
    expect(items[2].type).toBe('ic')
  })

  it('reorders managers so cross-team-connected teams are adjacent', () => {
    // SEC and SEC-2 are connected by an IC with additionalTeams referencing both
    // IOT should not separate them
    const managers = [
      makeNode({ id: '1', name: 'Saransh', team: 'SEC' }),
      makeNode({ id: '2', name: 'Chris V', team: 'IOT' }),
      makeNode({ id: '3', name: 'TBH', team: 'SEC-2' }),
    ]
    const ics = [
      makeNode({ id: '4', name: 'Chris Launey', team: 'SEC and IOT', additionalTeams: ['SEC', 'SEC-2'] }),
    ]
    const items = computeRenderItems(managers, ics)
    // SEC and SEC-2 managers should be adjacent, with Chris Launey after SEC-2
    const managerTeams = items
      .filter((i): i is { type: 'manager'; node: OrgNode } => i.type === 'manager')
      .map((i) => i.node.person.team)
    const secIdx = managerTeams.indexOf('SEC')
    const sec2Idx = managerTeams.indexOf('SEC-2')
    expect(Math.abs(secIdx - sec2Idx)).toBe(1)
  })

  it('handles ICs only (no managers)', () => {
    const ics = [
      makeNode({ id: '1', name: 'Alice', team: 'Eng' }),
      makeNode({ id: '2', name: 'Bob', team: 'Design' }),
    ]
    const items = computeRenderItems([], ics)
    // All unaffiliated, multiple teams → icGroups
    expect(items).toHaveLength(2)
    expect(items[0].type).toBe('icGroup')
    expect(items[1].type).toBe('icGroup')
  })
})
