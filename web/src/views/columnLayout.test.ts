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
  it('[VIEW-001] returns empty for no managers and no ICs', () => {
    const items = computeRenderItems([], [])
    expect(items).toHaveLength(0)
  })

  it('[VIEW-001] returns managers only when no ICs', () => {
    const managers = [makeNode({ id: '1', name: 'Alice', team: 'Eng' })]
    const items = computeRenderItems(managers, [])
    expect(items).toHaveLength(1)
    expect(items[0].type).toBe('manager')
  })

  it('[VIEW-001] returns unaffiliated ICs after managers', () => {
    const managers = [makeNode({ id: '1', name: 'Alice', team: 'Eng' })]
    const ics = [makeNode({ id: '2', name: 'Bob', team: 'Eng' })]
    const items = computeRenderItems(managers, ics)
    expect(items).toHaveLength(2)
    expect(items[0].type).toBe('manager')
    expect(items[1].type).toBe('ic')
  })

  it('[VIEW-001] places affiliated IC after the highest-indexed connected manager', () => {
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

  it('[VIEW-001] groups unaffiliated ICs by team when multiple teams exist', () => {
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

  it('[VIEW-001] does not group unaffiliated ICs when only one team', () => {
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

  it('[VIEW-001] reorders managers so cross-team-connected teams are adjacent', () => {
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

  it('[VIEW-001] handles ICs only (no managers)', () => {
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

  it('[VIEW-001] groups unaffiliated ICs by pod when pod is set, even if same team', () => {
    const managers = [makeNode({ id: '1', name: 'Saransh', team: 'SEC' })]
    const ics = [
      makeNode({ id: '2', name: 'Chandani', team: 'SEC & IOT', pod: 'MachineQ' }),
      makeNode({ id: '3', name: 'Poonam', team: 'SEC & IOT', pod: 'MachineQ' }),
      makeNode({ id: '4', name: 'TBH', team: 'SEC-2' }),
    ]
    const items = computeRenderItems(managers, ics)
    const groups = items.filter((i) => i.type === 'icGroup')
    expect(groups).toHaveLength(2)
    // Pod group should use the pod name, not the team name
    const machineQ = groups.find((g) => g.type === 'icGroup' && g.team === 'MachineQ')
    expect(machineQ).toBeTruthy()
    if (machineQ && machineQ.type === 'icGroup') {
      expect(machineQ.podName).toBe('MachineQ')
      expect(machineQ.members).toHaveLength(2)
    }
    // Team group should use team name, no podName
    const sec2 = groups.find((g) => g.type === 'icGroup' && g.team === 'SEC-2')
    expect(sec2).toBeTruthy()
    if (sec2 && sec2.type === 'icGroup') {
      expect(sec2.podName).toBeUndefined()
    }
  })

  it('[VIEW-001] creates icGroup for single pod even when only one group exists', () => {
    const managers = [makeNode({ id: '1', name: 'Boss', team: 'Eng' })]
    const ics = [
      makeNode({ id: '2', name: 'Alice', team: 'Support', pod: 'PodA' }),
      makeNode({ id: '3', name: 'Bob', team: 'Support', pod: 'PodA' }),
    ]
    const items = computeRenderItems(managers, ics)
    // Even though there's only one group, it should be an icGroup because pod edges need the header node
    const groups = items.filter((i) => i.type === 'icGroup')
    expect(groups).toHaveLength(1)
    if (groups[0].type === 'icGroup') {
      expect(groups[0].podName).toBe('PodA')
      expect(groups[0].team).toBe('PodA')
    }
  })
})
