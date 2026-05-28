import { describe, it, expect } from 'vitest'
import { computeEdges } from './columnEdges'
import { computeLayoutTree } from './layoutTree'
import { buildOrgTree } from './shared'
import type { OrgNode } from '../api/types'

const makeNode = (overrides: Partial<OrgNode> & { id: string; name: string }): OrgNode => ({
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
    const people = [makeNode({ id: '1', name: 'Alice' })]
    const layout = computeLayoutTree(buildOrgTree(people))
    expect(computeEdges(layout, people)).toEqual([])
  })

  it('[VIEW-001] draws edge from manager to report', () => {
    const people = [
      makeNode({ id: '1', name: 'Alice' }),
      makeNode({ id: '2', name: 'Bob', managerId: '1' }),
    ]
    const layout = computeLayoutTree(buildOrgTree(people))
    const edges = computeEdges(layout, people)
    expect(edges).toHaveLength(1)
    expect(edges[0]).toEqual({ fromId: '1', toId: '2' })
  })

  it('[VIEW-001] draws one edge per IC batch, not per IC', () => {
    const people = [
      makeNode({ id: '1', name: 'Alice' }),
      makeNode({ id: '2', name: 'Bob', managerId: '1', team: 'Eng' }),
      makeNode({ id: '3', name: 'Carol', managerId: '1', team: 'Eng' }),
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
      makeNode({ id: '1', name: 'Alice' }),
      makeNode({ id: '2', name: 'Bob', managerId: '1', team: 'Eng' }),
      makeNode({ id: '3', name: 'Carol', managerId: '1', team: 'Design' }),
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
      makeNode({ id: '1', name: 'Alice' }),
      makeNode({ id: '2', name: 'Bob', managerId: '1', team: 'Eng' }),
      makeNode({ id: '3', name: 'Carol', managerId: '1', team: 'Eng' }),
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
      makeNode({ id: '1', name: 'Alice' }),
      makeNode({ id: '2', name: 'Bob', managerId: '1', team: 'Eng' }),
      makeNode({ id: '3', name: 'Carol', managerId: '2' }), // makes Bob a manager
      makeNode({ id: '4', name: 'Dave', managerId: '1', team: 'Eng' }),
      makeNode({ id: '5', name: 'Eve', managerId: '1', team: 'Design' }),
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
      makeNode({ id: '1', name: 'Alice' }),
      makeNode({ id: '2', name: 'Bob', managerId: '1' }),
      makeNode({ id: '3', name: 'Carol', managerId: '2' }), // makes Bob a manager
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
      makeNode({ id: '1', name: 'Alice', team: 'Eng' }),
      makeNode({ id: '2', name: 'Bob', team: 'Design' }),
      makeNode({ id: '3', name: 'Carol', team: 'Eng', managerId: '1', additionalTeams: ['Design'] }),
    ]
    const layout = computeLayoutTree(buildOrgTree(people))
    const edges = computeEdges(layout, people)
    const dashedEdge = edges.find((e) => e.dashed)
    expect(dashedEdge).toBeTruthy()
    expect(dashedEdge!.fromId).toBe('3') // Carol
    expect(dashedEdge!.toId).toBe('2')   // Bob (first in Design)
  })

  it('[VIEW-001] draws dashed edges for ALL additionalTeams, not just one', () => {
    // Reproduces #141: Chris Launey has two additional teams but only one edge drawn
    const people = [
      makeNode({ id: 'z', name: 'Zach', team: '' }),
      makeNode({ id: 'r', name: 'Roy', team: 'Deploy', managerId: 'z' }),
      makeNode({ id: 'r1', name: 'Roy-IC', team: 'Deploy', managerId: 'r' }), // makes Roy a manager
      makeNode({ id: 'm', name: 'Mike', team: 'Compute', managerId: 'z' }),
      makeNode({ id: 'm1', name: 'Mike-IC', team: 'Compute', managerId: 'm' }), // makes Mike a manager
      makeNode({ id: 'c', name: 'Chris', team: '', managerId: 'z', additionalTeams: ['Deploy', 'Compute'] }),
    ]
    const layout = computeLayoutTree(buildOrgTree(people))
    const edges = computeEdges(layout, people)
    const dashedEdges = edges.filter(e => e.dashed)
    // Chris should have TWO dashed edges: one to Roy (Deploy lead) and one to Mike (Compute lead)
    expect(dashedEdges).toHaveLength(2)
    const toIds = dashedEdges.map(e => e.toId).sort()
    expect(toIds).toEqual(['m', 'r'])
    // Both should originate from Chris
    expect(dashedEdges.every(e => e.fromId === 'c')).toBe(true)
  })

  it('[VIEW-001] draws dashed edges for multiCrossTeam IC with realistic org structure', () => {
    // Mirrors the real CSV: Zach has 3 manager reports + 1 IC (Chris L) with 2 additional teams
    // Plus other ICs with single additionalTeams to ensure no interference
    const people = [
      makeNode({ id: 'z', name: 'Zach', team: 'Edge Foundation Services' }),
      // Three managers under Zach, each with different teams
      makeNode({ id: 'mike', name: 'Mike Kloss', team: 'Store Edge Compute', managerId: 'z' }),
      makeNode({ id: 'roy', name: 'Roy Sam', team: 'Store Edge Deployment', managerId: 'z' }),
      makeNode({ id: 'chris-v', name: 'Chris Vasquez', team: 'IoT', managerId: 'z' }),
      // ICs under each manager (makes them managers)
      makeNode({ id: 'm1', name: 'Mike-IC1', team: 'Store Edge Compute', managerId: 'mike' }),
      makeNode({ id: 'r1', name: 'Roy-IC1', team: 'Store Edge Deployment', managerId: 'roy' }),
      makeNode({ id: 'r2', name: 'Roy-IC2', team: 'Store Edge Deployment', managerId: 'roy' }),
      makeNode({ id: 'cv1', name: 'CV-IC1', team: 'IoT', managerId: 'chris-v' }),
      // Chris Launey: IC under Zach, empty team, TWO additional teams
      makeNode({ id: 'chris-l', name: 'Chris Launey', team: '', managerId: 'z', additionalTeams: ['Store Edge Deployment', 'Store Edge Compute'] }),
      // Other ICs under Zach with single additional teams (shouldn't interfere)
      makeNode({ id: 'elliot', name: 'Elliot Smith', team: 'Retail Foundation Services', managerId: 'z', additionalTeams: ['IoT'] }),
      makeNode({ id: 'kurt', name: 'Kurt Wilhelmsen', team: 'Retail Foundation Services', managerId: 'z', additionalTeams: ['IoT'] }),
      makeNode({ id: 'mark-q', name: 'Mark Quilling', team: 'Retail Foundation Services', managerId: 'z', additionalTeams: ['IoT'] }),
    ]
    const layout = computeLayoutTree(buildOrgTree(people))
    const edges = computeEdges(layout, people)

    // Chris Launey should have exactly 2 dashed edges
    const chrisEdges = edges.filter(e => e.dashed && e.fromId === 'chris-l')
    expect(chrisEdges).toHaveLength(2)
    const targets = new Set(chrisEdges.map(e => e.toId))
    expect(targets.has('roy')).toBe(true)   // Store Edge Deployment lead
    expect(targets.has('mike')).toBe(true)  // Store Edge Compute lead

    // Elliot, Kurt, Mark should each have 1 dashed edge to Chris Vasquez (IoT lead)
    for (const id of ['elliot', 'kurt', 'mark-q']) {
      const personEdges = edges.filter(e => e.dashed && e.fromId === id)
      expect(personEdges).toHaveLength(1)
      expect(personEdges[0].toId).toBe('chris-v')
    }
  })

  it('[VIEW-001] does not draw dashed edge to self', () => {
    const people = [
      makeNode({ id: '1', name: 'Alice', team: 'Eng', additionalTeams: ['Eng'] }),
    ]
    const layout = computeLayoutTree(buildOrgTree(people))
    const edges = computeEdges(layout, people)
    const dashedEdge = edges.find((e) => e.dashed)
    expect(dashedEdge).toBeUndefined()
  })

  it('[VIEW-001] skips additionalTeam edge when team has no members', () => {
    const people = [
      makeNode({ id: '1', name: 'Alice', team: 'Eng', additionalTeams: ['Nonexistent'] }),
    ]
    const layout = computeLayoutTree(buildOrgTree(people))
    const edges = computeEdges(layout, people)
    expect(edges.find((e) => e.dashed)).toBeUndefined()
  })

  it('[VIEW-001] prefers manager as team lead for dashed edges', () => {
    const people = [
      makeNode({ id: '1', name: 'Boss' }),
      makeNode({ id: '2', name: 'Lead', team: 'Design' }),
      makeNode({ id: '3', name: 'IC', team: 'Design', managerId: '2' }),
      makeNode({ id: '4', name: 'Other', team: 'Eng', additionalTeams: ['Design'], managerId: '1' }),
    ]
    const layout = computeLayoutTree(buildOrgTree(people))
    const edges = computeEdges(layout, people)
    const dashedEdge = edges.find((e) => e.dashed)
    expect(dashedEdge).toBeTruthy()
    // Should connect to Lead (id 2) since they have reports in Design
    expect(dashedEdge!.toId).toBe('2')
  })

  it('[PROD-001] draws a direct edge from manager to the first product (no group header intermediate)', () => {
    const people = [
      makeNode({ id: '1', name: 'Alice' }),
      makeNode({ id: '2', name: 'Bob', managerId: '1' }),
      makeNode({ id: '3', name: 'Widget', managerId: '1', type: 'product' }),
      makeNode({ id: '4', name: 'Gadget', managerId: '1', type: 'product' }),
    ]
    const layout = computeLayoutTree(buildOrgTree(people))
    const edges = computeEdges(layout, people)
    // No intermediate "products:" collapseKey edge — header was removed.
    const intermediate = edges.find((e) => e.toId.startsWith('products:') || e.fromId.startsWith('products:'))
    expect(intermediate).toBeUndefined()
    // Manager has a direct edge to the first product.
    const directProductEdge = edges.find((e) => e.fromId === '1' && e.toId === '3')
    expect(directProductEdge).toBeTruthy()
  })

  it('[PROD-003] product nested in a pod gets a connector from the pod header', () => {
    // People and products render as two adjacent columns under the pod. Each
    // column needs its own edge from the pod header, otherwise the products
    // column visually dangles. The manager itself does NOT draw a direct
    // line to a pod-nested product — the pod header is the parent.
    const people = [
      makeNode({ id: '1', name: 'Alice' }),
      makeNode({ id: '2', name: 'Bob', managerId: '1', pod: 'Backend' }),
      makeNode({ id: '3', name: 'Widget', managerId: '1', type: 'product', pod: 'Backend' }),
    ]
    const layout = computeLayoutTree(buildOrgTree(people))
    const edges = computeEdges(layout, people)
    const directProductEdge = edges.find((e) => e.fromId === '1' && e.toId === '3')
    expect(directProductEdge).toBeUndefined()
    const podEdge = edges.find((e) => e.fromId === '1' && e.toId.startsWith('pod:'))
    expect(podEdge).toBeTruthy()
    // Pod-header -> first person (people column connector).
    const peopleConnector = edges.find((e) => e.fromId.startsWith('pod:') && e.toId === '2')
    expect(peopleConnector).toBeTruthy()
    // Pod-header -> first product (products column connector).
    const productsConnector = edges.find((e) => e.fromId.startsWith('pod:') && e.toId === '3')
    expect(productsConnector).toBeTruthy()
  })

  it('[VIEW-001] edges through pod headers use collapseKey as node ID', () => {
    const people = [
      makeNode({ id: '1', name: 'Boss' }),
      makeNode({ id: '2', name: 'Mgr', managerId: '1' }),
      makeNode({ id: '3', name: 'Sub', managerId: '2' }),
      makeNode({ id: '4', name: 'IC1', managerId: '1', pod: 'Alpha' }),
      makeNode({ id: '5', name: 'IC2', managerId: '1', pod: 'Alpha' }),
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
