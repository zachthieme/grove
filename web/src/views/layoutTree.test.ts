import { describe, it, expect } from 'vitest'
import { computeLayoutTree, type LayoutNode, type ManagerLayout, type ICLayout, type PodGroupLayout, type TeamGroupLayout } from './layoutTree'
import type { OrgNode } from './shared'
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

const makeNode = (
  overrides: Partial<Person> & { id: string; name: string },
  children: OrgNode[] = [],
): OrgNode => ({
  person: makePerson(overrides),
  children,
})

describe('computeLayoutTree', () => {
  it('[LAYOUT-001] returns empty array for empty roots', () => {
    expect(computeLayoutTree([])).toEqual([])
  })

  it('[LAYOUT-001] builds manager with IC children', () => {
    const ic1 = makeNode({ id: 'ic1', name: 'Bob' })
    const ic2 = makeNode({ id: 'ic2', name: 'Carol' })
    const mgr = makeNode({ id: 'mgr', name: 'Alice' }, [ic1, ic2])

    const result = computeLayoutTree([mgr])
    expect(result).toHaveLength(1)
    expect(result[0].type).toBe('manager')
    const m = result[0] as ManagerLayout
    expect(m.person.id).toBe('mgr')
    expect(m.children).toHaveLength(2)
    expect(m.children[0].type).toBe('ic')
    expect(m.children[1].type).toBe('ic')
  })

  it('[LAYOUT-001] builds nested manager hierarchy', () => {
    const ic = makeNode({ id: 'ic1', name: 'Carol' })
    const mid = makeNode({ id: 'mid', name: 'Bob' }, [ic])
    const root = makeNode({ id: 'root', name: 'Alice' }, [mid])

    const result = computeLayoutTree([root])
    expect(result).toHaveLength(1)
    const top = result[0] as ManagerLayout
    expect(top.children).toHaveLength(1)
    expect(top.children[0].type).toBe('manager')
    const midLayout = top.children[0] as ManagerLayout
    expect(midLayout.children).toHaveLength(1)
    expect(midLayout.children[0].type).toBe('ic')
  })

  it('[LAYOUT-001] classifies local ICs with no additionalTeams', () => {
    const ic = makeNode({ id: 'ic1', name: 'Bob', additionalTeams: [] })
    const mgr = makeNode({ id: 'mgr', name: 'Alice' }, [ic])

    const result = computeLayoutTree([mgr])
    const m = result[0] as ManagerLayout
    const child = m.children[0] as ICLayout
    expect(child.affiliation).toBe('local')
  })

  it('[LAYOUT-001] reorders managers by cross-team affinity', () => {
    const ic = makeNode({ id: 'ic1', name: 'Chris', team: 'X', additionalTeams: ['SEC', 'SEC-2'] })
    const m1 = makeNode({ id: 'm1', name: 'Saransh', team: 'SEC' }, [makeNode({ id: 'r1', name: 'R1' })])
    const m2 = makeNode({ id: 'm2', name: 'Chris V', team: 'IOT' }, [makeNode({ id: 'r2', name: 'R2' })])
    const m3 = makeNode({ id: 'm3', name: 'TBH', team: 'SEC-2' }, [makeNode({ id: 'r3', name: 'R3' })])
    const root = makeNode({ id: 'root', name: 'Boss' }, [m1, m2, m3, ic])

    const result = computeLayoutTree([root])
    const top = result[0] as ManagerLayout
    const managerChildren = top.children.filter((c): c is ManagerLayout => c.type === 'manager')
    const teams = managerChildren.map((m) => m.person.team)
    // SEC and SEC-2 should be adjacent
    const secIdx = teams.indexOf('SEC')
    const sec2Idx = teams.indexOf('SEC-2')
    expect(Math.abs(secIdx - sec2Idx)).toBe(1)
  })

  it('[LAYOUT-001] attaches single-affiliation cross-team IC to manager', () => {
    const ic = makeNode({ id: 'ic1', name: 'Carol', team: 'Eng', additionalTeams: ['Design'] })
    const m1 = makeNode({ id: 'm1', name: 'Alice', team: 'Eng' }, [makeNode({ id: 'r1', name: 'R1' })])
    const m2 = makeNode({ id: 'm2', name: 'Bob', team: 'Design' }, [makeNode({ id: 'r2', name: 'R2' })])
    const root = makeNode({ id: 'root', name: 'Boss' }, [m1, m2, ic])

    const result = computeLayoutTree([root])
    const top = result[0] as ManagerLayout
    // Carol should be in Bob's crossTeamICs (single match: Design)
    const bob = top.children.find(
      (c): c is ManagerLayout => c.type === 'manager' && c.person.id === 'm2',
    )!
    expect(bob.crossTeamICs).toHaveLength(1)
    expect(bob.crossTeamICs[0].person.id).toBe('ic1')
    expect(bob.crossTeamICs[0].affiliation).toBe('singleCrossTeam')
  })

  it('[LAYOUT-001] places multi-affiliation IC after highest-indexed manager', () => {
    const ic = makeNode({ id: 'ic1', name: 'Carol', team: 'X', additionalTeams: ['Eng', 'Design'] })
    const m1 = makeNode({ id: 'm1', name: 'Alice', team: 'Eng' }, [makeNode({ id: 'r1', name: 'R1' })])
    const m2 = makeNode({ id: 'm2', name: 'Bob', team: 'Design' }, [makeNode({ id: 'r2', name: 'R2' })])
    const m3 = makeNode({ id: 'm3', name: 'Dan', team: 'Ops' }, [makeNode({ id: 'r3', name: 'R3' })])
    const root = makeNode({ id: 'root', name: 'Boss' }, [m1, m2, m3, ic])

    const result = computeLayoutTree([root])
    const top = result[0] as ManagerLayout
    // Carol should appear after Bob (index 1) but before Dan (index 2)
    const types = top.children.map((c) => ({ type: c.type, id: c.type === 'ic' ? c.person.id : c.type === 'manager' ? c.person.id : '' }))
    const bobIdx = types.findIndex((t) => t.id === 'm2')
    const carolIdx = types.findIndex((t) => t.id === 'ic1')
    const danIdx = types.findIndex((t) => t.id === 'm3')
    expect(carolIdx).toBe(bobIdx + 1)
    expect(danIdx).toBe(carolIdx + 1)
  })

  it('[LAYOUT-001] groups unaffiliated ICs by pod', () => {
    const ic1 = makeNode({ id: 'ic1', name: 'Bob', team: 'Eng', pod: 'Alpha' })
    const ic2 = makeNode({ id: 'ic2', name: 'Carol', team: 'Eng', pod: 'Alpha' })
    const ic3 = makeNode({ id: 'ic3', name: 'Dave', team: 'Eng' })
    const m1 = makeNode({ id: 'm1', name: 'Lead', team: 'Design' }, [makeNode({ id: 'r1', name: 'R1' })])
    const root = makeNode({ id: 'mgr', name: 'Alice' }, [m1, ic1, ic2, ic3])

    const result = computeLayoutTree([root])
    const top = result[0] as ManagerLayout
    const podGroups = top.children.filter((c): c is PodGroupLayout => c.type === 'podGroup')
    expect(podGroups).toHaveLength(1)
    expect(podGroups[0].podName).toBe('Alpha')
    expect(podGroups[0].managerId).toBe('mgr')
    expect(podGroups[0].collapseKey).toBe('pod:mgr:Alpha')
    expect(podGroups[0].members).toHaveLength(2)
  })

  it('[LAYOUT-001] groups unaffiliated ICs by team when multiple teams and no pods', () => {
    const ic1 = makeNode({ id: 'ic1', name: 'Bob', team: 'Design' })
    const ic2 = makeNode({ id: 'ic2', name: 'Carol', team: 'Product' })
    const m1 = makeNode({ id: 'm1', name: 'Lead', team: 'Eng' }, [makeNode({ id: 'r1', name: 'R1' })])
    const root = makeNode({ id: 'mgr', name: 'Alice' }, [m1, ic1, ic2])

    const result = computeLayoutTree([root])
    const top = result[0] as ManagerLayout
    const podGroups = top.children.filter((c): c is PodGroupLayout => c.type === 'podGroup')
    expect(podGroups).toHaveLength(2)
  })

  it('[LAYOUT-001] does not group single-team unpodded ICs into a group', () => {
    const ic1 = makeNode({ id: 'ic1', name: 'Bob', team: 'Eng' })
    const ic2 = makeNode({ id: 'ic2', name: 'Carol', team: 'Eng' })
    const m1 = makeNode({ id: 'm1', name: 'Lead', team: 'Design' }, [makeNode({ id: 'r1', name: 'R1' })])
    const root = makeNode({ id: 'mgr', name: 'Alice' }, [m1, ic1, ic2])

    const result = computeLayoutTree([root])
    const top = result[0] as ManagerLayout
    const podGroups = top.children.filter((c) => c.type === 'podGroup')
    expect(podGroups).toHaveLength(0)
    const icChildren = top.children.filter((c) => c.type === 'ic')
    expect(icChildren).toHaveLength(2)
  })

  it('[LAYOUT-001] pod grouping within all-IC subtree', () => {
    const ic1 = makeNode({ id: 'ic1', name: 'Bob', pod: 'Alpha' })
    const ic2 = makeNode({ id: 'ic2', name: 'Carol', pod: 'Alpha' })
    const ic3 = makeNode({ id: 'ic3', name: 'Dave' })
    const root = makeNode({ id: 'mgr', name: 'Alice' }, [ic1, ic2, ic3])

    const result = computeLayoutTree([root])
    const top = result[0] as ManagerLayout
    const podGroups = top.children.filter((c): c is PodGroupLayout => c.type === 'podGroup')
    expect(podGroups).toHaveLength(1)
    expect(podGroups[0].podName).toBe('Alpha')
    const icChildren = top.children.filter((c) => c.type === 'ic')
    expect(icChildren).toHaveLength(1)
  })

  it('[LAYOUT-001] groups orphan roots into TeamGroupLayouts', () => {
    const o1 = makeNode({ id: 'o1', name: 'Alice', team: 'Eng' })
    const o2 = makeNode({ id: 'o2', name: 'Bob', team: 'Design' })
    const o3 = makeNode({ id: 'o3', name: 'Carol', team: 'Eng' })

    const result = computeLayoutTree([o1, o2, o3])
    const teamGroups = result.filter((c): c is TeamGroupLayout => c.type === 'teamGroup')
    expect(teamGroups).toHaveLength(2)
    const eng = teamGroups.find((g) => g.teamName === 'Eng')!
    expect(eng.collapseKey).toBe('orphan:Eng')
    expect(eng.members).toHaveLength(2)
    const design = teamGroups.find((g) => g.teamName === 'Design')!
    expect(design.collapseKey).toBe('orphan:Design')
    expect(design.members).toHaveLength(1)
  })

  it('[LAYOUT-001] uses Unassigned for orphans with empty team', () => {
    const o1 = makeNode({ id: 'o1', name: 'Alice', team: '' })
    const o2 = makeNode({ id: 'o2', name: 'Bob', team: '' })

    const result = computeLayoutTree([o1, o2])
    const teamGroups = result.filter((c): c is TeamGroupLayout => c.type === 'teamGroup')
    expect(teamGroups).toHaveLength(1)
    expect(teamGroups[0].teamName).toBe('Unassigned')
    expect(teamGroups[0].collapseKey).toBe('orphan:Unassigned')
  })

  it('[LAYOUT-001] single orphan with empty team becomes manager layout', () => {
    const o1 = makeNode({ id: 'o1', name: 'Alice', team: '' })

    const result = computeLayoutTree([o1])
    expect(result).toHaveLength(1)
    expect(result[0].type).toBe('manager')
  })

  it('[LAYOUT-001] single orphan with single root becomes manager layout', () => {
    const o1 = makeNode({ id: 'o1', name: 'Alice' })

    const result = computeLayoutTree([o1])
    expect(result).toHaveLength(1)
    expect(result[0].type).toBe('manager')
  })

  it('[LAYOUT-001] mixes managers and orphan groups', () => {
    const ic = makeNode({ id: 'ic1', name: 'Report' })
    const mgr = makeNode({ id: 'mgr', name: 'Manager' }, [ic])
    const orphan1 = makeNode({ id: 'o1', name: 'Orphan A', team: 'Eng' })
    const orphan2 = makeNode({ id: 'o2', name: 'Orphan B', team: 'Eng' })

    const result = computeLayoutTree([mgr, orphan1, orphan2])
    expect(result.filter((c) => c.type === 'manager')).toHaveLength(1)
    expect(result.filter((c) => c.type === 'teamGroup')).toHaveLength(1)
  })
})

/** Collect all Person instances from a LayoutNode tree. */
function collectPersons(nodes: LayoutNode[]): Person[] {
  const result: Person[] = []
  for (const node of nodes) {
    switch (node.type) {
      case 'manager':
        result.push(node.person)
        result.push(...node.crossTeamICs.map((ic) => ic.person))
        result.push(...collectPersons(node.children))
        break
      case 'ic':
        result.push(node.person)
        break
      case 'podGroup':
        result.push(...node.members.map((m) => m.person))
        break
      case 'teamGroup':
        result.push(...node.members.map((m) => m.person))
        break
    }
  }
  return result
}

/** Collect all collapseKeys from a LayoutNode tree. */
function collectCollapseKeys(nodes: LayoutNode[]): string[] {
  const result: string[] = []
  for (const node of nodes) {
    if ('collapseKey' in node) result.push(node.collapseKey)
    if (node.type === 'manager') result.push(...collectCollapseKeys(node.children))
  }
  return result
}

/** Known allowed fields per LayoutNode type. */
const ALLOWED_FIELDS: Record<string, Set<string>> = {
  manager: new Set(['type', 'person', 'collapseKey', 'children', 'crossTeamICs']),
  ic: new Set(['type', 'person', 'affiliation']),
  podGroup: new Set(['type', 'podName', 'managerId', 'collapseKey', 'members']),
  teamGroup: new Set(['type', 'teamName', 'collapseKey', 'members']),
}

/** Recursively check that no LayoutNode has extra fields. */
function assertNoExtraFields(nodes: LayoutNode[]) {
  for (const node of nodes) {
    const allowed = ALLOWED_FIELDS[node.type]
    for (const key of Object.keys(node)) {
      expect(allowed.has(key), `Unexpected field "${key}" on ${node.type} node`).toBe(true)
    }
    if (node.type === 'manager') {
      assertNoExtraFields(node.children)
      for (const ic of node.crossTeamICs) {
        assertNoExtraFields([ic])
      }
    }
    if (node.type === 'podGroup' || node.type === 'teamGroup') {
      for (const m of node.members) {
        assertNoExtraFields([m])
      }
    }
  }
}

describe('abstraction leak guards', () => {
  // Test fixtures: a realistic org with managers, ICs, pods, cross-team, and orphans
  const r1 = makeNode({ id: 'r1', name: 'R1' })
  const r2 = makeNode({ id: 'r2', name: 'R2', pod: 'Alpha' })
  const r3 = makeNode({ id: 'r3', name: 'R3', pod: 'Alpha' })
  const r4 = makeNode({ id: 'r4', name: 'R4' })
  const crossIc = makeNode({ id: 'xic', name: 'Cross', team: 'Eng', additionalTeams: ['Design'] })
  const mgrA = makeNode({ id: 'mA', name: 'Mgr A', team: 'Eng' }, [r1, r2, r3])
  const mgrB = makeNode({ id: 'mB', name: 'Mgr B', team: 'Design' }, [r4])
  const root = makeNode({ id: 'root', name: 'Root' }, [mgrA, mgrB, crossIc])
  const orphan1 = makeNode({ id: 'o1', name: 'Orphan1', team: 'Ops' })
  const orphan2 = makeNode({ id: 'o2', name: 'Orphan2', team: 'Ops' })

  const allInputPeople = [root, mgrA, mgrB, r1, r2, r3, r4, crossIc, orphan1, orphan2].map((n) => n.person)
  const layoutResult = computeLayoutTree([root, orphan1, orphan2])

  it('[LAYOUT-002] no rendering hints — no extra fields on any node', () => {
    assertNoExtraFields(layoutResult)
  })

  it('[LAYOUT-002] exhaustiveness — every person appears exactly once', () => {
    const collected = collectPersons(layoutResult)
    const collectedIds = collected.map((p) => p.id).sort()
    const inputIds = allInputPeople.map((p) => p.id).sort()
    expect(collectedIds).toEqual(inputIds)
    // No duplicates
    expect(new Set(collectedIds).size).toBe(collectedIds.length)
  })

  it('[LAYOUT-002] grouping correctness — pod members have matching pod field', () => {
    function checkPodGroups(nodes: LayoutNode[]) {
      for (const node of nodes) {
        if (node.type === 'podGroup') {
          for (const m of node.members) {
            expect(m.person.pod || m.person.team).toBe(node.podName)
          }
        }
        if (node.type === 'manager') checkPodGroups(node.children)
      }
    }
    checkPodGroups(layoutResult)
  })

  it('[LAYOUT-002] grouping correctness — team group members have matching team', () => {
    for (const node of layoutResult) {
      if (node.type === 'teamGroup') {
        for (const m of node.members) {
          expect(m.person.team || 'Unassigned').toBe(node.teamName)
        }
      }
    }
  })

  it('[LAYOUT-002] grouping correctness — affiliation matches additionalTeams', () => {
    function checkAffiliation(nodes: LayoutNode[]) {
      for (const node of nodes) {
        if (node.type === 'ic') {
          if (node.affiliation === 'singleCrossTeam') {
            expect((node.person.additionalTeams || []).length).toBeGreaterThan(0)
          }
          if (node.affiliation === 'multiCrossTeam') {
            expect((node.person.additionalTeams || []).length).toBeGreaterThanOrEqual(2)
          }
        }
        if (node.type === 'manager') {
          for (const ic of node.crossTeamICs) {
            expect(ic.affiliation).toBe('singleCrossTeam')
            expect((ic.person.additionalTeams || []).length).toBeGreaterThan(0)
          }
          checkAffiliation(node.children)
        }
      }
    }
    checkAffiliation(layoutResult)
  })

  it('[LAYOUT-002] collapse key uniqueness', () => {
    const keys = collectCollapseKeys(layoutResult)
    expect(new Set(keys).size).toBe(keys.length)
  })

  it('[LAYOUT-002] collapse key format — managers use person ID', () => {
    function checkManagerKeys(nodes: LayoutNode[]) {
      for (const node of nodes) {
        if (node.type === 'manager') {
          expect(node.collapseKey).toBe(node.person.id)
          checkManagerKeys(node.children)
        }
      }
    }
    checkManagerKeys(layoutResult)
  })

  it('[LAYOUT-002] collapse key format — pod groups match pod:{managerId}:{podName}', () => {
    function checkPodKeys(nodes: LayoutNode[]) {
      for (const node of nodes) {
        if (node.type === 'podGroup') {
          expect(node.collapseKey).toBe(`pod:${node.managerId}:${node.podName}`)
        }
        if (node.type === 'manager') checkPodKeys(node.children)
      }
    }
    checkPodKeys(layoutResult)
  })

  it('[LAYOUT-002] collapse key format — team groups match orphan:{teamName}', () => {
    for (const node of layoutResult) {
      if (node.type === 'teamGroup') {
        expect(node.collapseKey).toBe(`orphan:${node.teamName}`)
      }
    }
  })

  it('[LAYOUT-002] stability — same input produces identical output', () => {
    const result1 = computeLayoutTree([root, orphan1, orphan2])
    const result2 = computeLayoutTree([root, orphan1, orphan2])
    expect(JSON.stringify(result1)).toBe(JSON.stringify(result2))
  })

  it('[LAYOUT-002] locality — adding unrelated person does not change existing subtrees', () => {
    const result1 = computeLayoutTree([root])
    const newOrphan = makeNode({ id: 'new', name: 'New', team: 'Other' })
    const result2 = computeLayoutTree([root, newOrphan])
    // The manager subtree should be identical
    const mgr1 = JSON.stringify(result1.find((n) => n.type === 'manager'))
    const mgr2 = JSON.stringify(result2.find((n) => n.type === 'manager'))
    expect(mgr1).toBe(mgr2)
  })
})
