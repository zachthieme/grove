import { describe, it, expect } from 'vitest'
import { computeEdges } from './columnEdges'
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
  it('returns empty for empty input', () => {
    expect(computeEdges([])).toEqual([])
  })

  it('returns empty for single person', () => {
    const people = [makePerson({ id: '1', name: 'Alice' })]
    expect(computeEdges(people)).toEqual([])
  })

  it('draws edge from manager to report', () => {
    const people = [
      makePerson({ id: '1', name: 'Alice' }),
      makePerson({ id: '2', name: 'Bob', managerId: '1' }),
    ]
    const edges = computeEdges(people)
    expect(edges).toHaveLength(1)
    expect(edges[0]).toEqual({ fromId: '1', toId: '2' })
  })

  it('draws one edge per IC team, not per IC', () => {
    const people = [
      makePerson({ id: '1', name: 'Alice' }),
      makePerson({ id: '2', name: 'Bob', managerId: '1', team: 'Eng' }),
      makePerson({ id: '3', name: 'Carol', managerId: '1', team: 'Eng' }),
    ]
    const edges = computeEdges(people)
    // Only one edge to team Eng (first IC: Bob)
    expect(edges).toHaveLength(1)
    expect(edges[0]).toEqual({ fromId: '1', toId: '2' })
  })

  it('draws one edge for all unpodded ICs when parent has no manager children', () => {
    // When all children are ICs, they render as one flat stack regardless of team
    const people = [
      makePerson({ id: '1', name: 'Alice' }),
      makePerson({ id: '2', name: 'Bob', managerId: '1', team: 'Eng' }),
      makePerson({ id: '3', name: 'Carol', managerId: '1', team: 'Design' }),
    ]
    const edges = computeEdges(people)
    expect(edges).toHaveLength(1)
    expect(edges[0]).toEqual({ fromId: '1', toId: '2' })
  })

  it('draws separate edges per team when parent has manager children', () => {
    // When there are both managers and ICs, ICs are grouped by team visually
    const people = [
      makePerson({ id: '1', name: 'Alice' }),
      makePerson({ id: '2', name: 'Bob', managerId: '1', team: 'Eng' }),
      makePerson({ id: '3', name: 'Carol', managerId: '2' }), // makes Bob a manager
      makePerson({ id: '4', name: 'Dave', managerId: '1', team: 'Eng' }),
      makePerson({ id: '5', name: 'Eve', managerId: '1', team: 'Design' }),
    ]
    const edges = computeEdges(people)
    // Alice → Bob (manager), Bob → Carol (IC), Alice → Dave (first Eng IC), Alice → Eve (first Design IC)
    expect(edges).toHaveLength(4)
  })

  it('draws individual edges to manager children', () => {
    const people = [
      makePerson({ id: '1', name: 'Alice' }),
      makePerson({ id: '2', name: 'Bob', managerId: '1' }),
      makePerson({ id: '3', name: 'Carol', managerId: '2' }), // makes Bob a manager
    ]
    const edges = computeEdges(people)
    // Alice → Bob (manager child, individual edge), Bob → Carol (IC edge)
    expect(edges).toHaveLength(2)
    expect(edges.find((e) => e.fromId === '1' && e.toId === '2')).toBeTruthy()
    expect(edges.find((e) => e.fromId === '2' && e.toId === '3')).toBeTruthy()
  })

  it('draws dashed edges for additionalTeams', () => {
    const people = [
      makePerson({ id: '1', name: 'Alice', team: 'Eng' }),
      makePerson({ id: '2', name: 'Bob', team: 'Design' }),
      makePerson({ id: '3', name: 'Carol', team: 'Eng', managerId: '1', additionalTeams: ['Design'] }),
    ]
    const edges = computeEdges(people)
    const dashedEdge = edges.find((e) => e.dashed)
    expect(dashedEdge).toBeTruthy()
    expect(dashedEdge!.fromId).toBe('3') // Carol
    expect(dashedEdge!.toId).toBe('2')   // Bob (first in Design)
  })

  it('does not draw dashed edge to self', () => {
    const people = [
      makePerson({ id: '1', name: 'Alice', team: 'Eng', additionalTeams: ['Eng'] }),
    ]
    const edges = computeEdges(people)
    const dashedEdge = edges.find((e) => e.dashed)
    expect(dashedEdge).toBeUndefined()
  })

  it('skips additionalTeam edge when team has no members', () => {
    const people = [
      makePerson({ id: '1', name: 'Alice', team: 'Eng', additionalTeams: ['Nonexistent'] }),
    ]
    const edges = computeEdges(people)
    expect(edges.find((e) => e.dashed)).toBeUndefined()
  })

  it('prefers manager as team lead for dashed edges', () => {
    const people = [
      makePerson({ id: '1', name: 'Boss' }),
      makePerson({ id: '2', name: 'Lead', team: 'Design' }),
      makePerson({ id: '3', name: 'IC', team: 'Design', managerId: '2' }),
      makePerson({ id: '4', name: 'Other', team: 'Eng', additionalTeams: ['Design'], managerId: '1' }),
    ]
    const edges = computeEdges(people)
    const dashedEdge = edges.find((e) => e.dashed)
    expect(dashedEdge).toBeTruthy()
    // Should connect to Lead (id 2) since they have reports in Design
    expect(dashedEdge!.toId).toBe('2')
  })
})
