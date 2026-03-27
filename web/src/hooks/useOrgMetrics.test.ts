import { describe, it, expect } from 'vitest'
import type { Person } from '../api/types'
import { computeOrgMetrics } from './useOrgMetrics'

const makePerson = (overrides: Partial<Person>): Person => ({
  id: '', name: '', role: '', discipline: 'Eng',
  managerId: '', team: 'Eng', additionalTeams: [], status: 'Active',
  ...overrides,
})

describe('computeOrgMetrics', () => {
  const alice = makePerson({ id: '1', name: 'Alice', role: 'VP' })
  const bob = makePerson({ id: '2', name: 'Bob', managerId: '1', discipline: 'Engineering' })
  const carol = makePerson({ id: '3', name: 'Carol', managerId: '1', discipline: 'Design', team: 'Design' })
  const open = makePerson({ id: '4', name: 'Open', managerId: '1', status: 'Open' })
  const planned = makePerson({ id: '5', name: 'Planned', managerId: '2', status: 'Pending Open' })
  const transfer = makePerson({ id: '6', name: 'Transfer', managerId: '1', status: 'Transfer In' })

  const all = [alice, bob, carol, open, planned, transfer]

  it('[VIEW-001] computes span of control (direct reports only)', () => {
    const metrics = computeOrgMetrics('1', all)
    expect(metrics.spanOfControl).toBe(4) // bob, carol, open, transfer (planned is under bob)
  })

  it('[VIEW-001] computes total headcount recursively', () => {
    const metrics = computeOrgMetrics('1', all)
    expect(metrics.totalHeadcount).toBe(5) // everyone except alice herself
  })

  it('[VIEW-001] computes recruiting count', () => {
    const metrics = computeOrgMetrics('1', all)
    expect(metrics.recruiting).toBe(1) // open
  })

  it('[VIEW-001] computes planned count', () => {
    const metrics = computeOrgMetrics('1', all)
    expect(metrics.planned).toBe(1) // planned (under bob, which is under alice)
  })

  it('[VIEW-001] computes transfer count', () => {
    const metrics = computeOrgMetrics('1', all)
    expect(metrics.transfers).toBe(1)
  })

  it('[VIEW-001] computes discipline breakdown for Active people', () => {
    const metrics = computeOrgMetrics('1', all)
    expect(metrics.byDiscipline.get('Engineering')).toBe(1)
    expect(metrics.byDiscipline.get('Design')).toBe(1)
  })

  it('[VIEW-001] computes team/pod breakdown with discipline sub-counts', () => {
    const metrics = computeOrgMetrics('1', all)
    const engGroup = metrics.byTeamPod.find(g => g.name === 'Eng')
    const designGroup = metrics.byTeamPod.find(g => g.name === 'Design')
    expect(engGroup).toBeDefined()
    expect(engGroup!.count).toBeGreaterThan(0)
    expect(designGroup).toBeDefined()
    expect(designGroup!.count).toBe(1)
    expect(designGroup!.byDiscipline.get('Design')).toBe(1)
  })
})
