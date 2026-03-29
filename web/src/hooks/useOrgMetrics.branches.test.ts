/**
 * Additional branch coverage for useOrgMetrics.
 * Covers: person with pod set (groupKey = pod), Unknown discipline for empty discipline,
 * Backfill counted as recruiting, Transfer Out counted as transfers,
 * person with no team or pod -> 'Unassigned'.
 */
import { describe, it, expect } from 'vitest'
import type { Person } from '../api/types'
import { computeOrgMetrics } from './useOrgMetrics'

const makePerson = (overrides: Partial<Person>): Person => ({
  id: '', name: '', role: '', discipline: 'Eng',
  managerId: '', team: 'Eng', additionalTeams: [], status: 'Active',
  ...overrides,
})

describe('computeOrgMetrics — additional branches', () => {
  it('groups by pod name when pod is set', () => {
    const mgr = makePerson({ id: 'mgr' })
    const ic = makePerson({ id: 'ic1', managerId: 'mgr', pod: 'Alpha Pod', status: 'Active' })
    const metrics = computeOrgMetrics('mgr', [mgr, ic])
    const group = metrics.byTeamPod.find(g => g.name === 'Alpha Pod')
    expect(group).toBeDefined()
    expect(group!.count).toBe(1)
  })

  it('uses "Unknown" discipline for active person with empty discipline', () => {
    const mgr = makePerson({ id: 'mgr' })
    const ic = makePerson({ id: 'ic1', managerId: 'mgr', discipline: '', status: 'Active' })
    const metrics = computeOrgMetrics('mgr', [mgr, ic])
    expect(metrics.byDiscipline.get('Unknown')).toBe(1)
  })

  it('counts Backfill as recruiting', () => {
    const mgr = makePerson({ id: 'mgr' })
    const ic = makePerson({ id: 'ic1', managerId: 'mgr', status: 'Backfill' })
    const metrics = computeOrgMetrics('mgr', [mgr, ic])
    expect(metrics.recruiting).toBe(1)
  })

  it('counts Transfer Out as transfers', () => {
    const mgr = makePerson({ id: 'mgr' })
    const ic = makePerson({ id: 'ic1', managerId: 'mgr', status: 'Transfer Out' })
    const metrics = computeOrgMetrics('mgr', [mgr, ic])
    expect(metrics.transfers).toBe(1)
  })

  it('uses "Unassigned" for people with no team and no pod', () => {
    const mgr = makePerson({ id: 'mgr' })
    const ic = makePerson({ id: 'ic1', managerId: 'mgr', team: '', pod: '', status: 'Active' })
    const metrics = computeOrgMetrics('mgr', [mgr, ic])
    const group = metrics.byTeamPod.find(g => g.name === 'Unassigned')
    expect(group).toBeDefined()
    expect(group!.count).toBe(1)
  })

  it('returns zero headcount for person with no reports', () => {
    const mgr = makePerson({ id: 'mgr' })
    const metrics = computeOrgMetrics('mgr', [mgr])
    expect(metrics.totalHeadcount).toBe(0)
    expect(metrics.spanOfControl).toBe(0)
  })

  it('handles deeply nested hierarchy', () => {
    const top = makePerson({ id: 'top' })
    const mid = makePerson({ id: 'mid', managerId: 'top' })
    const bottom = makePerson({ id: 'bot', managerId: 'mid' })
    const metrics = computeOrgMetrics('top', [top, mid, bottom])
    expect(metrics.totalHeadcount).toBe(2)
    expect(metrics.spanOfControl).toBe(1) // only 'mid' is a direct report
  })

  it('sorts byTeamPod by count descending', () => {
    const mgr = makePerson({ id: 'mgr' })
    const ic1 = makePerson({ id: 'ic1', managerId: 'mgr', team: 'Small' })
    const ic2 = makePerson({ id: 'ic2', managerId: 'mgr', team: 'Big' })
    const ic3 = makePerson({ id: 'ic3', managerId: 'mgr', team: 'Big' })
    const metrics = computeOrgMetrics('mgr', [mgr, ic1, ic2, ic3])
    expect(metrics.byTeamPod[0].name).toBe('Big')
    expect(metrics.byTeamPod[0].count).toBe(2)
    expect(metrics.byTeamPod[1].name).toBe('Small')
    expect(metrics.byTeamPod[1].count).toBe(1)
  })
})
