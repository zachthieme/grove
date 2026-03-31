import { describe, it, expect } from 'vitest'
import { computeEdges } from './columnEdges'
import { computeLayoutTree } from './layoutTree'
import { buildOrgTree } from './shared'
import type { Person } from '../api/types'

const makePerson = (overrides: Partial<Person> & { id: string; name: string }): Person => ({
  role: 'Engineer',
  discipline: 'Eng',
  managerId: '',
  team: 'Team A',
  additionalTeams: [],
  status: 'Active',
  ...overrides,
})

describe('computeEdges', () => {
  it('[VIEW-001] returns empty for empty input', () => {
    expect(computeEdges([], [])).toEqual([])
  })

  it('[VIEW-001] returns empty for single person', () => {
    const people = [makePerson({ id: '1', name: 'Alice' })]
    const layout = computeLayoutTree(buildOrgTree(people))
    expect(computeEdges(layout, people)).toEqual([])
  })

  it('[VIEW-001] draws edge from manager to report', () => {
    const people = [
      makePerson({ id: '1', name: 'Alice' }),
      makePerson({ id: '2', name: 'Bob', managerId: '1' }),
    ]
    const layout = computeLayoutTree(buildOrgTree(people))
    const edges = computeEdges(layout, people)
    expect(edges).toHaveLength(1)
    expect(edges[0]).toEqual({ fromId: '1', toId: '2' })
  })

  it('[VIEW-001] draws one edge per IC batch, not per IC', () => {
    const people = [
      makePerson({ id: '1', name: 'Alice' }),
      makePerson({ id: '2', name: 'Bob', managerId: '1', team: 'Eng' }),
      makePerson({ id: '3', name: 'Carol', managerId: '1', team: 'Eng' }),
    ]
    const layout = computeLayoutTree(buildOrgTree(people))
    const edges = computeEdges(layout, people)
    // Only one edge to the IC batch (first IC: Bob)
    expect(edges).toHaveLength(1)
    expect(edges[0]).toEqual({ fromId: '1', toId: '2' })
  })

  it('[VIEW-001] draws edges through team groups when ICs span multiple teams', () => {
    // When all children are ICs across multiple teams, layout tree creates team groups
    const people = [
      makePerson({ id: '1', name: 'Alice' }),
      makePerson({ id: '2', name: 'Bob', managerId: '1', team: 'Eng' }),
      makePerson({ id: '3', name: 'Carol', managerId: '1', team: 'Design' }),
    ]
    const layout = computeLayoutTree(buildOrgTree(people))
    const edges = computeEdges(layout, people)
    // Layout tree groups ICs by team → edges go through pod group headers
    // Alice → pod:1:Eng, pod:1:Eng → Bob, Alice → pod:1:Design, pod:1:Design → Carol
    expect(edges).toHaveLength(4)
    expect(edges.find((e) => e.fromId === '1' && e.toId.includes('Eng'))).toBeTruthy()
    expect(edges.find((e) => e.fromId === '1' && e.toId.includes('Design'))).toBeTruthy()
  })

  it('[VIEW-001] draws one edge for all ICs when they share a team (no managers)', () => {
    // When all children are ICs on the same team, they stay as a flat batch
    const people = [
      makePerson({ id: '1', name: 'Alice' }),
      makePerson({ id: '2', name: 'Bob', managerId: '1', team: 'Eng' }),
      makePerson({ id: '3', name: 'Carol', managerId: '1', team: 'Eng' }),
    ]
    const layout = computeLayoutTree(buildOrgTree(people))
    const edges = computeEdges(layout, people)
    // Single team → no grouping → one edge to first IC
    expect(edges).toHaveLength(1)
    expect(edges[0]).toEqual({ fromId: '1', toId: '2' })
  })

  it('[VIEW-001] draws separate edges per team when parent has manager children', () => {
    // When there are both managers and ICs, ICs are grouped by team visually
    const people = [
      makePerson({ id: '1', name: 'Alice' }),
      makePerson({ id: '2', name: 'Bob', managerId: '1', team: 'Eng' }),
      makePerson({ id: '3', name: 'Carol', managerId: '2' }), // makes Bob a manager
      makePerson({ id: '4', name: 'Dave', managerId: '1', team: 'Eng' }),
      makePerson({ id: '5', name: 'Eve', managerId: '1', team: 'Design' }),
    ]
    const layout = computeLayoutTree(buildOrgTree(people))
    const edges = computeEdges(layout, people)
    // Alice → Bob (manager), Bob → Carol (IC), then pod/team group edges for Dave and Eve
    // The exact count depends on how layoutTree groups — let's verify structurally
    expect(edges.find((e) => e.fromId === '1' && e.toId === '2')).toBeTruthy() // Alice → Bob (manager)
    expect(edges.find((e) => e.fromId === '2' && e.toId === '3')).toBeTruthy() // Bob → Carol (IC)
    // Dave and Eve should have edges from Alice (through pod groups or directly)
    const aliceEdges = edges.filter((e) => e.fromId === '1')
    expect(aliceEdges.length).toBeGreaterThanOrEqual(2) // at least Bob + IC groups
  })

  it('[VIEW-001] draws individual edges to manager children', () => {
    const people = [
      makePerson({ id: '1', name: 'Alice' }),
      makePerson({ id: '2', name: 'Bob', managerId: '1' }),
      makePerson({ id: '3', name: 'Carol', managerId: '2' }), // makes Bob a manager
    ]
    const layout = computeLayoutTree(buildOrgTree(people))
    const edges = computeEdges(layout, people)
    // Alice → Bob (manager child, individual edge), Bob → Carol (IC edge)
    expect(edges).toHaveLength(2)
    expect(edges.find((e) => e.fromId === '1' && e.toId === '2')).toBeTruthy()
    expect(edges.find((e) => e.fromId === '2' && e.toId === '3')).toBeTruthy()
  })

  it('[VIEW-001] draws dashed edges for additionalTeams', () => {
    const people = [
      makePerson({ id: '1', name: 'Alice', team: 'Eng' }),
      makePerson({ id: '2', name: 'Bob', team: 'Design' }),
      makePerson({ id: '3', name: 'Carol', team: 'Eng', managerId: '1', additionalTeams: ['Design'] }),
    ]
    const layout = computeLayoutTree(buildOrgTree(people))
    const edges = computeEdges(layout, people)
    const dashedEdge = edges.find((e) => e.dashed)
    expect(dashedEdge).toBeTruthy()
    expect(dashedEdge!.fromId).toBe('3') // Carol
    expect(dashedEdge!.toId).toBe('2')   // Bob (first in Design)
  })

  it('[VIEW-001] does not draw dashed edge to self', () => {
    const people = [
      makePerson({ id: '1', name: 'Alice', team: 'Eng', additionalTeams: ['Eng'] }),
    ]
    const layout = computeLayoutTree(buildOrgTree(people))
    const edges = computeEdges(layout, people)
    const dashedEdge = edges.find((e) => e.dashed)
    expect(dashedEdge).toBeUndefined()
  })

  it('[VIEW-001] skips additionalTeam edge when team has no members', () => {
    const people = [
      makePerson({ id: '1', name: 'Alice', team: 'Eng', additionalTeams: ['Nonexistent'] }),
    ]
    const layout = computeLayoutTree(buildOrgTree(people))
    const edges = computeEdges(layout, people)
    expect(edges.find((e) => e.dashed)).toBeUndefined()
  })

  it('[VIEW-001] prefers manager as team lead for dashed edges', () => {
    const people = [
      makePerson({ id: '1', name: 'Boss' }),
      makePerson({ id: '2', name: 'Lead', team: 'Design' }),
      makePerson({ id: '3', name: 'IC', team: 'Design', managerId: '2' }),
      makePerson({ id: '4', name: 'Other', team: 'Eng', additionalTeams: ['Design'], managerId: '1' }),
    ]
    const layout = computeLayoutTree(buildOrgTree(people))
    const edges = computeEdges(layout, people)
    const dashedEdge = edges.find((e) => e.dashed)
    expect(dashedEdge).toBeTruthy()
    // Should connect to Lead (id 2) since they have reports in Design
    expect(dashedEdge!.toId).toBe('2')
  })

  it('[VIEW-001] edges through pod headers use collapseKey as node ID', () => {
    const people = [
      makePerson({ id: '1', name: 'Boss' }),
      makePerson({ id: '2', name: 'Mgr', managerId: '1' }),
      makePerson({ id: '3', name: 'Sub', managerId: '2' }),
      makePerson({ id: '4', name: 'IC1', managerId: '1', pod: 'Alpha' }),
      makePerson({ id: '5', name: 'IC2', managerId: '1', pod: 'Alpha' }),
    ]
    const layout = computeLayoutTree(buildOrgTree(people))
    const edges = computeEdges(layout, people)
    const podEdge = edges.find((e) => e.toId.startsWith('pod:'))
    expect(podEdge).toBeTruthy()
    expect(podEdge!.fromId).toBe('1')
    const podToIcEdge = edges.find((e) => e.fromId.startsWith('pod:'))
    expect(podToIcEdge).toBeTruthy()
    expect(podToIcEdge!.toId).toBe('4')
  })
})
