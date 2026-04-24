import { describe, it, expect } from 'vitest'
import type { OrgNode } from '../api/types'
import { computeOrgMetrics } from './useOrgMetrics'

const makeNode = (overrides: Partial<OrgNode>): OrgNode => ({
  id: '', name: '', role: '', discipline: 'Eng',
  managerId: '', team: 'Eng', additionalTeams: [], status: 'Active',
  ...overrides,
})

// Scenarios: UI-016
describe('computeOrgMetrics', () => {
  const alice = makeNode({ id: '1', name: 'Alice', role: 'VP' })
  const bob = makeNode({ id: '2', name: 'Bob', managerId: '1', discipline: 'Engineering' })
  const carol = makeNode({ id: '3', name: 'Carol', managerId: '1', discipline: 'Design', team: 'Design' })
  const open = makeNode({ id: '4', name: 'Open', managerId: '1', status: 'Open' })
  const planned = makeNode({ id: '5', name: 'Planned', managerId: '2', status: 'Planned' })
  const transfer = makeNode({ id: '6', name: 'Transfer', managerId: '1', status: 'Transfer In' })

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

describe('computeOrgMetrics — products', () => {
  it('[PROD-009] products excluded from headcount', () => {
    const people = [
      makeNode({ id: '1', name: 'Alice', status: 'Active' }),
      makeNode({ id: '2', name: 'Bob', status: 'Active', managerId: '1' }),
      makeNode({ id: '3', name: 'Widget', type: 'product', status: 'Active', managerId: '1' }),
    ]
    const metrics = computeOrgMetrics('1', people)
    expect(metrics.totalHeadcount).toBe(1) // Only Bob
    expect(metrics.productCount).toBe(1) // Widget
  })

  it('[PROD-010] products excluded from span of control', () => {
    const people = [
      makeNode({ id: '1', name: 'Alice', status: 'Active' }),
      makeNode({ id: '2', name: 'Bob', status: 'Active', managerId: '1' }),
      makeNode({ id: '3', name: 'Widget', type: 'product', status: 'Active', managerId: '1' }),
      makeNode({ id: '4', name: 'Gadget', type: 'product', status: 'Active', managerId: '1' }),
    ]
    const metrics = computeOrgMetrics('1', people)
    expect(metrics.spanOfControl).toBe(1) // Only Bob, not products
    expect(metrics.productCount).toBe(2)
  })
})
