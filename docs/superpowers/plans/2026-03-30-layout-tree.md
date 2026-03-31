# Layout Tree Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace duplicated layout/placement logic in ColumnView, ManagerView, and OrphanGroup with a single `computeLayoutTree()` function that both views consume.

**Architecture:** A new `layoutTree.ts` module computes a `LayoutNode` tree from `OrgNode` roots. It absorbs `columnLayout.ts` (manager affinity reordering, render item computation), pod grouping from both views, orphan team grouping, and collapse key construction. Views become pure renderers that switch on `LayoutNode.type`. Edge computation functions are updated to walk LayoutNodes instead of re-deriving the tree.

**Tech Stack:** TypeScript, Vitest (unit tests, no DOM)

---

## File Map

| Action | File | Responsibility |
|--------|------|---------------|
| Create | `web/src/views/layoutTree.ts` | `computeLayoutTree()` + LayoutNode types + all layout logic |
| Create | `web/src/views/layoutTree.test.ts` | Unit tests + negative abstraction-leak tests |
| Modify | `web/src/views/ColumnView.tsx` | Consume LayoutNodes instead of self-grouping |
| Modify | `web/src/views/ManagerView.tsx` | Consume LayoutNodes instead of self-grouping |
| Modify | `web/src/views/OrphanGroup.tsx` | Receive `TeamGroupLayout[]` instead of raw `OrgNode[]` |
| Modify | `web/src/views/ChartShell.tsx` | Pass layout tree down, compute orphan groups via layout tree |
| Modify | `web/src/views/columnEdges.ts` | Walk LayoutNodes instead of rebuilding childrenMap |
| Modify | `web/src/views/columnEdges.test.ts` | Update to use LayoutNode-based API |
| Delete | `web/src/views/columnLayout.ts` | Absorbed into layoutTree.ts |
| Delete | `web/src/views/columnLayout.test.ts` | Replaced by layoutTree.test.ts |

---

### Task 1: Create LayoutNode Types and `computeLayoutTree` Skeleton

**Files:**
- Create: `web/src/views/layoutTree.ts`
- Create: `web/src/views/layoutTree.test.ts`

- [ ] **Step 1: Write the failing test — empty input returns empty output**

Create `web/src/views/layoutTree.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { computeLayoutTree, type LayoutNode } from './layoutTree'
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
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd web && npx vitest run src/views/layoutTree.test.ts`
Expected: FAIL — module `./layoutTree` does not exist

- [ ] **Step 3: Create types and minimal implementation**

Create `web/src/views/layoutTree.ts`:

```ts
import type { Person } from '../api/types'
import type { OrgNode } from './shared'

export type Affiliation = 'local' | 'singleCrossTeam' | 'multiCrossTeam'

export interface ManagerLayout {
  type: 'manager'
  person: Person
  collapseKey: string
  children: LayoutNode[]
  crossTeamICs: ICLayout[]
}

export interface ICLayout {
  type: 'ic'
  person: Person
  affiliation: Affiliation
}

export interface PodGroupLayout {
  type: 'podGroup'
  podName: string
  managerId: string
  collapseKey: string
  members: ICLayout[]
}

export interface TeamGroupLayout {
  type: 'teamGroup'
  teamName: string
  collapseKey: string
  members: ICLayout[]
}

export type LayoutNode = ManagerLayout | ICLayout | PodGroupLayout | TeamGroupLayout

export function computeLayoutTree(roots: OrgNode[]): LayoutNode[] {
  return roots.map((root) => buildManagerLayout(root))
}

function buildManagerLayout(node: OrgNode): ManagerLayout {
  return {
    type: 'manager',
    person: node.person,
    collapseKey: node.person.id,
    children: [],
    crossTeamICs: [],
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd web && npx vitest run src/views/layoutTree.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
jj describe -m "feat: add layoutTree types and computeLayoutTree skeleton"
jj new
```

---

### Task 2: Implement Manager/IC Split and Recursive Tree Building

**Files:**
- Modify: `web/src/views/layoutTree.ts`
- Modify: `web/src/views/layoutTree.test.ts`

- [ ] **Step 1: Write failing test — manager with IC children**

Add to `layoutTree.test.ts` inside the `describe('computeLayoutTree')` block:

```ts
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd web && npx vitest run src/views/layoutTree.test.ts`
Expected: FAIL — children array is empty, affiliation not set

- [ ] **Step 3: Implement recursive tree building**

Update `buildManagerLayout` in `layoutTree.ts`:

```ts
function classifyAffiliation(person: Person, siblingManagers: OrgNode[]): Affiliation {
  const addl = person.additionalTeams || []
  if (addl.length === 0) return 'local'

  const managerTeams = new Set(siblingManagers.map((m) => m.person.team))
  const matchCount = addl.filter((t) => managerTeams.has(t)).length

  if (matchCount === 0) return 'local'
  if (matchCount === 1) return 'singleCrossTeam'
  return 'multiCrossTeam'
}

function buildICLayout(node: OrgNode, siblingManagers: OrgNode[]): ICLayout {
  return {
    type: 'ic',
    person: node.person,
    affiliation: classifyAffiliation(node.person, siblingManagers),
  }
}

function buildManagerLayout(node: OrgNode): ManagerLayout {
  const managers = node.children.filter((c) => c.children.length > 0)
  const ics = node.children.filter((c) => c.children.length === 0)

  const children: LayoutNode[] = [
    ...managers.map((m) => buildManagerLayout(m)),
    ...ics.map((ic) => buildICLayout(ic, managers)),
  ]

  return {
    type: 'manager',
    person: node.person,
    collapseKey: node.person.id,
    children,
    crossTeamICs: [],
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd web && npx vitest run src/views/layoutTree.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
jj describe -m "feat: implement recursive tree building with IC affiliation classification"
jj new
```

---

### Task 3: Implement Manager Affinity Reordering and Cross-Team IC Placement

**Files:**
- Modify: `web/src/views/layoutTree.ts`
- Modify: `web/src/views/layoutTree.test.ts`

- [ ] **Step 1: Write failing tests for affinity reordering and cross-team IC placement**

Add to `layoutTree.test.ts`:

```ts
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd web && npx vitest run src/views/layoutTree.test.ts`
Expected: FAIL — managers not reordered, crossTeamICs empty, multi-affiliation IC not placed correctly

- [ ] **Step 3: Port affinity reordering and cross-team placement from columnLayout.ts**

Replace the body of `buildManagerLayout` in `layoutTree.ts` with the full implementation. Add the `reorderManagersByAffinity` function (copied from `columnLayout.ts`) as a private function in `layoutTree.ts`:

```ts
function reorderManagersByAffinity(managers: OrgNode[], ics: OrgNode[]): OrgNode[] {
  if (managers.length <= 2) return managers

  const teamToIdx = new Map<string, number>()
  for (let i = 0; i < managers.length; i++) {
    teamToIdx.set(managers[i].person.team, i)
  }

  const adj = new Map<number, Set<number>>()
  for (const ic of ics) {
    const teams = ic.person.additionalTeams || []
    const indices = teams
      .map((t) => teamToIdx.get(t))
      .filter((i): i is number => i !== undefined)
    for (const a of indices) {
      for (const b of indices) {
        if (a !== b) {
          if (!adj.has(a)) adj.set(a, new Set())
          adj.get(a)!.add(b)
        }
      }
    }
  }

  if (adj.size === 0) return managers

  const visited = new Set<number>()
  const result: OrgNode[] = []

  for (let i = 0; i < managers.length; i++) {
    if (visited.has(i)) continue
    visited.add(i)

    const component: number[] = [i]
    const queue = [i]
    while (queue.length > 0) {
      const cur = queue.shift()!
      for (const neighbor of adj.get(cur) || []) {
        if (!visited.has(neighbor)) {
          visited.add(neighbor)
          component.push(neighbor)
          queue.push(neighbor)
        }
      }
    }

    component.sort((a, b) => a - b)
    for (const idx of component) {
      result.push(managers[idx])
    }
  }

  return result
}
```

Then update `buildManagerLayout`:

```ts
function buildManagerLayout(node: OrgNode): ManagerLayout {
  const managers = node.children.filter((c) => c.children.length > 0)
  const ics = node.children.filter((c) => c.children.length === 0)

  const reorderedManagers = reorderManagersByAffinity(managers, ics)

  const managerByTeam = new Map<string, OrgNode>()
  const managerIndex = new Map<string, number>()
  for (let i = 0; i < reorderedManagers.length; i++) {
    managerByTeam.set(reorderedManagers[i].person.team, reorderedManagers[i])
    managerIndex.set(reorderedManagers[i].person.id, i)
  }

  // Classify cross-team ICs
  const withinManager = new Map<number, ICLayout[]>()
  const afterManager = new Map<number, ICLayout[]>()
  const unaffiliated: ICLayout[] = []

  for (const ic of ics) {
    const addlTeams = ic.person.additionalTeams || []
    if (addlTeams.length === 0) {
      unaffiliated.push(buildICLayout(ic, reorderedManagers))
      continue
    }

    const matchedIndices: number[] = []
    for (const at of addlTeams) {
      const mgr = managerByTeam.get(at)
      if (mgr) {
        const idx = managerIndex.get(mgr.person.id)
        if (idx !== undefined && !matchedIndices.includes(idx)) {
          matchedIndices.push(idx)
        }
      }
    }

    const icLayout = buildICLayout(ic, reorderedManagers)

    if (matchedIndices.length === 0) {
      unaffiliated.push(icLayout)
    } else if (matchedIndices.length === 1) {
      const idx = matchedIndices[0]
      const list = withinManager.get(idx) || []
      list.push(icLayout)
      withinManager.set(idx, list)
    } else {
      const bestIdx = Math.max(...matchedIndices)
      const list = afterManager.get(bestIdx) || []
      list.push(icLayout)
      afterManager.set(bestIdx, list)
    }
  }

  // Build children array: managers (with cross-team ICs attached), then
  // multi-affiliation ICs interleaved, then unaffiliated ICs at the end
  const children: LayoutNode[] = []
  for (let i = 0; i < reorderedManagers.length; i++) {
    const mgrLayout = buildManagerLayout(reorderedManagers[i])
    mgrLayout.crossTeamICs = withinManager.get(i) || []
    children.push(mgrLayout)

    const multiIcs = afterManager.get(i)
    if (multiIcs) {
      children.push(...multiIcs)
    }
  }

  children.push(...unaffiliated)

  return {
    type: 'manager',
    person: node.person,
    collapseKey: node.person.id,
    children,
    crossTeamICs: [],
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd web && npx vitest run src/views/layoutTree.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
jj describe -m "feat: add manager affinity reordering and cross-team IC placement to layoutTree"
jj new
```

---

### Task 4: Implement Pod and Team Grouping for Unaffiliated ICs

**Files:**
- Modify: `web/src/views/layoutTree.ts`
- Modify: `web/src/views/layoutTree.test.ts`

- [ ] **Step 1: Write failing tests for pod/team grouping**

Add to `layoutTree.test.ts`:

```ts
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
    // Should have pod group + unpodded IC
    const podGroups = top.children.filter((c): c is PodGroupLayout => c.type === 'podGroup')
    expect(podGroups).toHaveLength(1)
    expect(podGroups[0].podName).toBe('Alpha')
    const icChildren = top.children.filter((c) => c.type === 'ic')
    expect(icChildren).toHaveLength(1)
  })
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd web && npx vitest run src/views/layoutTree.test.ts`
Expected: FAIL — no pod groups in output

- [ ] **Step 3: Implement pod/team grouping for unaffiliated ICs**

Update the unaffiliated IC handling in `buildManagerLayout` (the section after classifying cross-team ICs). Replace `children.push(...unaffiliated)` with:

```ts
  // Group unaffiliated ICs by pod/team
  if (unaffiliated.length > 0) {
    const groupOrder: string[] = []
    const groupMap = new Map<string, { members: ICLayout[]; podName?: string }>()
    for (const ic of unaffiliated) {
      const hasPod = !!ic.person.pod
      const key = hasPod ? `pod:${ic.person.pod}` : `team:${ic.person.team}`
      if (!groupMap.has(key)) {
        groupOrder.push(key)
        groupMap.set(key, { members: [], podName: hasPod ? ic.person.pod! : undefined })
      }
      groupMap.get(key)!.members.push(ic)
    }

    let hasPodGroups = false
    for (const g of groupMap.values()) {
      if (g.podName) { hasPodGroups = true; break }
    }

    if (groupOrder.length > 1 || hasPodGroups) {
      for (const key of groupOrder) {
        const { members, podName } = groupMap.get(key)!
        const groupName = podName ?? members[0].person.team
        children.push({
          type: 'podGroup',
          podName: groupName,
          managerId: node.person.id,
          collapseKey: `pod:${node.person.id}:${groupName}`,
          members,
        })
      }
    } else {
      children.push(...unaffiliated)
    }
  }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd web && npx vitest run src/views/layoutTree.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
jj describe -m "feat: add pod/team grouping for unaffiliated ICs in layoutTree"
jj new
```

---

### Task 5: Implement Orphan Team Grouping

**Files:**
- Modify: `web/src/views/layoutTree.ts`
- Modify: `web/src/views/layoutTree.test.ts`

- [ ] **Step 1: Write failing tests for orphan grouping**

Add to `layoutTree.test.ts`:

```ts
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

    const result = computeLayoutTree([o1])
    const teamGroups = result.filter((c): c is TeamGroupLayout => c.type === 'teamGroup')
    expect(teamGroups).toHaveLength(1)
    expect(teamGroups[0].teamName).toBe('Unassigned')
    expect(teamGroups[0].collapseKey).toBe('orphan:Unassigned')
  })

  it('[LAYOUT-001] single orphan with single root becomes manager layout', () => {
    const o1 = makeNode({ id: 'o1', name: 'Alice' })

    const result = computeLayoutTree([o1])
    // Single root with no children — still a ManagerLayout (the view decides how to render it)
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd web && npx vitest run src/views/layoutTree.test.ts`
Expected: FAIL — orphans become ManagerLayout with empty children instead of TeamGroupLayout

- [ ] **Step 3: Implement orphan grouping in computeLayoutTree**

Update `computeLayoutTree`:

```ts
export function computeLayoutTree(roots: OrgNode[]): LayoutNode[] {
  const withChildren = roots.filter((r) => r.children.length > 0)
  const orphans = roots.filter((r) => r.children.length === 0)

  const result: LayoutNode[] = withChildren.map((root) => buildManagerLayout(root))

  // Single orphan + single root: render as manager (view decides presentation)
  if (orphans.length === 1 && roots.length === 1) {
    return [buildManagerLayout(orphans[0])]
  }

  if (orphans.length > 0) {
    const teamOrder: string[] = []
    const teamMap = new Map<string, ICLayout[]>()
    for (const o of orphans) {
      const team = o.person.team || 'Unassigned'
      if (!teamMap.has(team)) {
        teamOrder.push(team)
        teamMap.set(team, [])
      }
      teamMap.get(team)!.push({
        type: 'ic',
        person: o.person,
        affiliation: 'local',
      })
    }
    for (const team of teamOrder) {
      result.push({
        type: 'teamGroup',
        teamName: team,
        collapseKey: `orphan:${team}`,
        members: teamMap.get(team)!,
      })
    }
  }

  return result
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd web && npx vitest run src/views/layoutTree.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
jj describe -m "feat: add orphan team grouping to computeLayoutTree"
jj new
```

---

### Task 6: Add Negative Abstraction-Leak Tests

**Files:**
- Modify: `web/src/views/layoutTree.test.ts`

- [ ] **Step 1: Write all five categories of negative tests**

Add a new `describe` block to `layoutTree.test.ts`:

```ts
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
          const addl = node.person.additionalTeams || []
          if (node.affiliation === 'local') {
            // local means no matched managers — addl may be non-empty but no sibling manager match
            // (we can't fully check this without context, but we CAN check the reverse)
          }
          if (node.affiliation === 'singleCrossTeam') {
            expect(addl.length).toBeGreaterThan(0)
          }
          if (node.affiliation === 'multiCrossTeam') {
            expect(addl.length).toBeGreaterThanOrEqual(2)
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
```

- [ ] **Step 2: Run tests to verify they pass**

Run: `cd web && npx vitest run src/views/layoutTree.test.ts`
Expected: PASS (these are contract tests against already-working implementation)

- [ ] **Step 3: Commit**

```bash
jj describe -m "test: add negative abstraction-leak tests for layoutTree"
jj new
```

---

### Task 7: Migrate ColumnView to Consume LayoutNodes

**Files:**
- Modify: `web/src/views/ColumnView.tsx`
- Modify: `web/src/views/ChartShell.tsx:17-19` (ChartShellProps)

- [ ] **Step 1: Run existing ColumnView tests to establish baseline**

Run: `cd web && npx vitest run src/views/ColumnView.test.tsx src/views/ColumnView.golden.test.tsx src/views/ColumnView.branches.test.tsx src/views/ColumnView.branches2.test.tsx`
Expected: All PASS

- [ ] **Step 2: Update ChartShellProps to accept a layout tree**

In `web/src/views/ChartShell.tsx`, update the `ChartShellProps` interface to accept a `computeLayout` function alongside the existing `renderSubtree`. Add the import and new prop:

```ts
// Add import at top of ChartShell.tsx
import type { LayoutNode } from './layoutTree'

// Update ChartShellProps (add computeLayout, keep existing props)
export interface ChartShellProps {
  computeEdges: (people: Person[], roots: OrgNode[]) => ChartEdge[]
  computeLayout?: (roots: OrgNode[]) => LayoutNode[]
  renderSubtree: (node: OrgNode) => ReactNode
  renderOrphanSubtree?: (node: OrgNode) => ReactNode
  renderTeamHeader?: (team: string, count: number, options?: { collapsed?: boolean; onToggleCollapse?: () => void }) => ReactNode
  renderLayoutNode?: (node: LayoutNode) => ReactNode
  viewStyles: Record<string, string>
  dashedEdges?: boolean
  useGhostPeople?: boolean
  includeAddToTeam?: boolean
  wrapOrphansInIcStack?: boolean
}
```

In the `ChartShell` function body, add the layout computation and update the forest rendering to use it when available:

```ts
// After existing: const roots = useMemo(...)
const layoutTree = useMemo(
  () => computeLayout ? computeLayout(roots) : null,
  [computeLayout, roots],
)
```

Update the forest rendering to use `renderLayoutNode` when the layout tree is available:

```ts
<div className={styles.forest} data-role="forest">
  {layoutTree && renderLayoutNode ? (
    <>
      {layoutTree.filter((n) => n.type === 'manager').map((n) => renderLayoutNode(n))}
      {layoutTree.filter((n) => n.type === 'teamGroup').map((n) => renderLayoutNode(n))}
    </>
  ) : (
    <>
      {roots.filter((r) => r.children.length > 0).map((root) => (
        renderSubtree(root)
      ))}
      <OrphanGroup
        orphans={roots.filter((r) => r.children.length === 0)}
        roots={roots}
        selectedIds={selection.selectedIds}
        onSelect={actions.handleSelect}
        changes={changes}
        setNodeRef={setNodeRef}
        managerSet={managerSet}
        onAddReport={actions.handleAddReport}
        onDeletePerson={actions.handleDeletePerson}
        onInfo={actions.handleShowInfo}
        styles={viewStyles}
        wrapInIcStack={wrapOrphansInIcStack}
        renderSubtree={renderOrphanSubtree ?? renderSubtree}
        renderTeamHeader={renderTeamHeader}
        collapsedIds={collapsedIds}
        onToggleCollapse={handleToggleCollapse}
      />
    </>
  )}
</div>
```

- [ ] **Step 3: Rewrite ColumnView to use computeLayoutTree**

Replace the contents of `web/src/views/ColumnView.tsx`:

```tsx
import { useMemo, useCallback, type ReactNode } from 'react'
import type { Pod } from '../api/types'
import type { EditBuffer } from '../store/useInteractionState'
import { computeEdges } from './columnEdges'
import { computeLayoutTree, type LayoutNode, type ManagerLayout, type ICLayout, type PodGroupLayout, type TeamGroupLayout } from './layoutTree'
import { type OrgNode } from './shared'
import PersonNode from '../components/PersonNode'
import GroupHeaderNode from '../components/GroupHeaderNode'
import { useChart } from './ChartContext'
import ChartShell from './ChartShell'
import styles from './ColumnView.module.css'

function LayoutSubtree({ node, crossTeamICs }: { node: ManagerLayout; crossTeamICs?: ICLayout[] }) {
  const { selectedIds, onSelect, changes, managerSet, pods, interactionMode, editingPersonId, editBuffer, onAddReport, onAddParent, onAddToTeam, onDeletePerson, onInfo, onFocus, onEditMode, onPodSelect, onEnterEditing, onUpdateBuffer, onCommitEdits, setNodeRef, collapsedIds, onToggleCollapse } = useChart()

  const findPod = (managerId: string, podName: string): Pod | undefined =>
    pods?.find((p) => p.managerId === managerId && p.name === podName)

  const renderIC = useCallback((ic: ICLayout) => {
    const isEditing = interactionMode === 'editing' && editingPersonId === ic.person.id
    return (
      <div key={ic.person.id} className={styles.nodeSlot}>
        <PersonNode
          person={ic.person}
          selected={selectedIds.has(ic.person.id)}
          changes={changes?.get(ic.person.id)}
          isManager={managerSet?.has(ic.person.id)}
          editing={isEditing}
          editBuffer={isEditing ? editBuffer : null}
          focusField={isEditing ? 'name' : null}
          onAdd={onAddReport ? () => onAddReport(ic.person.id) : undefined}
          onAddParent={onAddParent ? () => onAddParent(ic.person.id) : undefined}
          onDelete={onDeletePerson ? () => onDeletePerson(ic.person.id) : undefined}
          onInfo={onInfo ? () => onInfo(ic.person.id) : undefined}
          onFocus={onFocus && managerSet?.has(ic.person.id) ? () => onFocus(ic.person.id) : undefined}
          onEditMode={onEditMode ? () => onEditMode(ic.person.id) : undefined}
          onClick={(e) => onSelect(ic.person.id, e)}
          onEnterEditing={onEnterEditing ? () => onEnterEditing(ic.person) : undefined}
          onUpdateBuffer={onUpdateBuffer ? (field: string, value: string) => onUpdateBuffer(field as keyof EditBuffer, value) : undefined}
          onCommitEdits={onCommitEdits}
          cardRef={setNodeRef(ic.person.id)}
        />
      </div>
    )
  }, [selectedIds, changes, managerSet, interactionMode, editingPersonId, editBuffer, onAddReport, onAddParent, onDeletePerson, onInfo, onFocus, onEditMode, onSelect, onEnterEditing, onUpdateBuffer, onCommitEdits, setNodeRef])

  const renderPodGroup = useCallback((group: PodGroupLayout) => {
    const pod = findPod(group.managerId, group.podName)
    const podCollapsed = collapsedIds?.has(group.collapseKey) ?? false
    return (
      <div key={group.collapseKey} className={styles.subtree}>
        <div className={styles.nodeSlot}>
          <GroupHeaderNode
            nodeId={group.collapseKey}
            name={group.podName}
            count={group.members.length}
            noteText={pod?.publicNote}
            onAdd={onAddToTeam ? () => onAddToTeam(group.managerId, pod?.team ?? group.podName, group.podName) : undefined}
            onInfo={pod && onPodSelect ? () => onPodSelect(pod.id) : undefined}
            onClick={pod && onPodSelect ? () => onPodSelect(pod.id) : undefined}
            cardRef={setNodeRef(group.collapseKey)}
            droppableId={group.collapseKey}
            collapsed={podCollapsed}
            onToggleCollapse={onToggleCollapse ? () => onToggleCollapse(group.collapseKey) : undefined}
          />
        </div>
        {!podCollapsed && (
          <div className={styles.children}>
            <div className={styles.icStack}>
              {group.members.map((ic) => renderIC(ic))}
            </div>
          </div>
        )}
      </div>
    )
  }, [pods, collapsedIds, onAddToTeam, onPodSelect, setNodeRef, onToggleCollapse, renderIC])

  const childElements = useMemo((): ReactNode[] => {
    const elements: ReactNode[] = []
    let icBatch: ICLayout[] = []

    const flushIcBatch = () => {
      if (icBatch.length === 0) return
      elements.push(
        <div key={`ic-stack-${icBatch[0].person.id}`} className={styles.icStack}>
          {icBatch.map((ic) => renderIC(ic))}
        </div>
      )
      icBatch = []
    }

    for (const child of node.children) {
      switch (child.type) {
        case 'manager':
          flushIcBatch()
          elements.push(
            <LayoutSubtree key={child.person.id} node={child} crossTeamICs={child.crossTeamICs} />
          )
          break
        case 'ic':
          if (child.affiliation !== 'local') {
            flushIcBatch()
            elements.push(renderIC(child))
          } else {
            icBatch.push(child)
          }
          break
        case 'podGroup':
          flushIcBatch()
          elements.push(renderPodGroup(child))
          break
        default:
          break
      }
    }
    flushIcBatch()
    return elements
  }, [node.children, renderIC, renderPodGroup])

  const isCollapsed = collapsedIds?.has(node.collapseKey) ?? false
  const isNodeEditing = interactionMode === 'editing' && editingPersonId === node.person.id

  const hasCrossTeam = !!(crossTeamICs && crossTeamICs.length > 0 && !isCollapsed)

  const managerNodeEl = (
    <div className={styles.nodeSlot}>
      <PersonNode
        person={node.person}
        selected={selectedIds.has(node.person.id)}
        changes={changes?.get(node.person.id)}
        showTeam={node.children.length > 0 || !!managerSet?.has(node.person.id)}
        isManager={managerSet?.has(node.person.id)}
        collapsed={node.children.length > 0 ? isCollapsed : undefined}
        editing={isNodeEditing}
        editBuffer={isNodeEditing ? editBuffer : null}
        focusField={isNodeEditing ? 'name' : null}
        onAdd={onAddReport ? () => onAddReport(node.person.id) : undefined}
        onAddParent={onAddParent ? () => onAddParent(node.person.id) : undefined}
        onDelete={onDeletePerson ? () => onDeletePerson(node.person.id) : undefined}
        onInfo={onInfo ? () => onInfo(node.person.id) : undefined}
        onFocus={onFocus && managerSet?.has(node.person.id) ? () => onFocus(node.person.id) : undefined}
        onEditMode={onEditMode ? () => onEditMode(node.person.id) : undefined}
        onToggleCollapse={node.children.length > 0 && onToggleCollapse ? () => onToggleCollapse(node.collapseKey) : undefined}
        onClick={(e) => onSelect(node.person.id, e)}
        onEnterEditing={onEnterEditing ? () => onEnterEditing(node.person) : undefined}
        onUpdateBuffer={onUpdateBuffer ? (field: string, value: string) => onUpdateBuffer(field as keyof EditBuffer, value) : undefined}
        onCommitEdits={onCommitEdits}
        cardRef={setNodeRef(node.person.id)}
      />
    </div>
  )

  return (
    <div className={`${styles.subtree} ${hasCrossTeam ? styles.subtreeLeftAligned : ''}`}>
      {hasCrossTeam ? (
        <div className={styles.managerWithCrossTeam}>
          {managerNodeEl}
          {crossTeamICs!.map((ic) => renderIC(ic))}
        </div>
      ) : managerNodeEl}
      {node.children.length > 0 && !isCollapsed && (
        <div className={styles.children}>
          {childElements}
        </div>
      )}
      {node.children.length > 0 && isCollapsed && (
        <div className={styles.collapsedCount}>{node.children.length} report{node.children.length !== 1 ? 's' : ''}</div>
      )}
    </div>
  )
}

function LayoutTeamGroup({ group }: { group: TeamGroupLayout }) {
  const { selectedIds, onSelect, changes, managerSet, setNodeRef, onAddReport, onDeletePerson, onInfo, collapsedIds, onToggleCollapse } = useChart()
  const isCollapsed = collapsedIds?.has(group.collapseKey) ?? false

  return (
    <div className={styles.subtree}>
      <div className={styles.nodeSlot}>
        <GroupHeaderNode
          nodeId={group.collapseKey}
          name={group.teamName}
          count={group.members.length}
          collapsed={isCollapsed}
          onToggleCollapse={onToggleCollapse ? () => onToggleCollapse(group.collapseKey) : undefined}
        />
      </div>
      {!isCollapsed && (
        <div className={styles.children}>
          <div className={styles.icStack}>
            {group.members.map((ic) => (
              <div key={ic.person.id} className={styles.nodeSlot}>
                <PersonNode
                  person={ic.person}
                  selected={selectedIds.has(ic.person.id)}
                  changes={changes?.get(ic.person.id)}
                  isManager={managerSet?.has(ic.person.id)}
                  onAdd={onAddReport ? () => onAddReport(ic.person.id) : undefined}
                  onDelete={onDeletePerson ? () => onDeletePerson(ic.person.id) : undefined}
                  onInfo={onInfo ? () => onInfo(ic.person.id) : undefined}
                  onClick={(e) => onSelect(ic.person.id, e)}
                  cardRef={setNodeRef(ic.person.id)}
                />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

export default function ColumnView() {
  const renderLayoutNode = useCallback((node: LayoutNode) => {
    switch (node.type) {
      case 'manager':
        return <LayoutSubtree key={node.person.id} node={node} crossTeamICs={node.crossTeamICs} />
      case 'teamGroup':
        return <LayoutTeamGroup key={node.collapseKey} group={node} />
      default:
        return null
    }
  }, [])

  return (
    <ChartShell
      computeEdges={(people) => computeEdges(people)}
      computeLayout={computeLayoutTree}
      renderSubtree={() => null}
      renderLayoutNode={renderLayoutNode}
      viewStyles={styles}
      dashedEdges
      useGhostPeople
      includeAddToTeam
    />
  )
}
```

- [ ] **Step 4: Run all ColumnView tests to verify they pass**

Run: `cd web && npx vitest run src/views/ColumnView.test.tsx src/views/ColumnView.golden.test.tsx src/views/ColumnView.branches.test.tsx src/views/ColumnView.branches2.test.tsx`
Expected: All PASS

- [ ] **Step 5: Run full test suite to check for regressions**

Run: `cd web && npx vitest run`
Expected: All PASS

- [ ] **Step 6: Commit**

```bash
jj describe -m "refactor: migrate ColumnView to consume LayoutNodes from computeLayoutTree"
jj new
```

---

### Task 8: Migrate ManagerView to Consume LayoutNodes

**Files:**
- Modify: `web/src/views/ManagerView.tsx`

- [ ] **Step 1: Run existing ManagerView tests to establish baseline**

Run: `cd web && npx vitest run src/views/ManagerView.test.tsx src/views/ManagerView.golden.test.tsx src/views/ManagerView.branches.test.tsx`
Expected: All PASS

- [ ] **Step 2: Rewrite ManagerView to use computeLayoutTree**

Replace the contents of `web/src/views/ManagerView.tsx`:

```tsx
// Scenarios: VIEW-002
import { useMemo, useCallback } from 'react'
import type { Person, Pod } from '../api/types'
import type { ChartEdge } from '../hooks/useChartLayout'
import type { EditBuffer } from '../store/useInteractionState'
import { isRecruitingStatus, isPlannedStatus, isTransferStatus } from '../constants'
import { useChart } from './ChartContext'
import { computeLayoutTree, type LayoutNode, type ManagerLayout, type PodGroupLayout } from './layoutTree'
import type { OrgNode } from './shared'
import PersonNode from '../components/PersonNode'
import ChartShell from './ChartShell'
import styles from './ManagerView.module.css'


function computeManagerEdges(_people: Person[], roots: OrgNode[]): ChartEdge[] {
  const result: ChartEdge[] = []
  function collectEdges(nodes: OrgNode[]) {
    for (const n of nodes) {
      for (const child of n.children) {
        if (child.children.length > 0) {
          result.push({ fromId: n.person.id, toId: child.person.id })
        }
      }
      collectEdges(n.children)
    }
  }
  collectEdges(roots)
  return result
}

/** Build summary groups from a list of people, bucketing by status. */
function buildStatusGroups(people: Person[]): { label: string; count: number }[] {
  const groups: { label: string; count: number }[] = []

  const active = people.filter((p) => p.status === 'Active')
  if (active.length > 0) {
    const byDiscipline = new Map<string, number>()
    for (const p of active) {
      const d = p.discipline || 'Other'
      byDiscipline.set(d, (byDiscipline.get(d) || 0) + 1)
    }
    for (const [discipline, count] of byDiscipline) {
      groups.push({ label: discipline, count })
    }
  }

  const recruiting = people.filter((p) => isRecruitingStatus(p.status))
  if (recruiting.length > 0) {
    groups.push({ label: 'Recruiting', count: recruiting.length })
  }

  const planned = people.filter((p) => isPlannedStatus(p.status))
  if (planned.length > 0) {
    groups.push({ label: 'Planned', count: planned.length })
  }

  const transfers = people.filter((p) => isTransferStatus(p.status))
  if (transfers.length > 0) {
    groups.push({ label: 'Transfers', count: transfers.length })
  }

  return groups
}

function SummaryCard({ people, podName, publicNote, podId, onPodClick }: {
  people: Person[]
  podName?: string
  publicNote?: string
  podId?: string
  onPodClick?: (podId: string) => void
}) {
  const groups = buildStatusGroups(people)

  if (groups.length === 0 && !podName) return null

  const isClickable = podId && onPodClick

  return (
    <div
      className={`${styles.summaryCard}${isClickable ? ` ${styles.summaryCardClickable}` : ''}`}
      onClick={isClickable ? () => onPodClick(podId) : undefined}
    >
      {podName && <div className={styles.podCardHeader}>{podName}</div>}
      {publicNote && (
        <div className={styles.podCardNote}>
          {publicNote.length > 50 ? publicNote.slice(0, 47) + '...' : publicNote}
        </div>
      )}
      {groups.map((g) => (
        <div key={g.label} className={styles.summaryRow}>
          <span className={styles.summaryLabel}>{g.label}</span>
          <span className={styles.summaryValue}>{g.count}</span>
        </div>
      ))}
    </div>
  )
}

function ManagerLayoutSubtree({ node }: { node: ManagerLayout }) {
  const { selectedIds, onSelect, changes, managerSet, pods, interactionMode, editingPersonId, editBuffer, onAddReport, onAddParent, onDeletePerson, onInfo, onFocus, onEditMode, onPodSelect, onEnterEditing, onUpdateBuffer, onCommitEdits, setNodeRef, collapsedIds, onToggleCollapse } = useChart()

  const isCollapsed = collapsedIds?.has(node.collapseKey) ?? false
  const isNodeEditing = interactionMode === 'editing' && editingPersonId === node.person.id

  // Collect ICs for summary cards: unpodded from direct IC children, podded from podGroups
  const { unpoddedPeople, podCards } = useMemo(() => {
    const unpodded: Person[] = []
    const cardList: { people: Person[]; podName?: string; publicNote?: string; podId?: string }[] = []

    for (const child of node.children) {
      if (child.type === 'ic') {
        unpodded.push(child.person)
      } else if (child.type === 'podGroup') {
        const pod = pods?.find((p) => p.managerId === child.managerId && p.name === child.podName)
        cardList.push({
          people: child.members.map((m) => m.person),
          podName: pod?.name ?? child.podName,
          publicNote: pod?.publicNote,
          podId: pod?.id,
        })
      }
    }

    return { unpoddedPeople: unpodded, podCards: cardList }
  }, [node.children, pods])

  return (
    <div className={styles.subtree}>
      <div className={styles.nodeSlot}>
        <PersonNode
          person={node.person}
          selected={selectedIds.has(node.person.id)}
          changes={changes?.get(node.person.id)}
          showTeam={node.children.length > 0 || !!managerSet?.has(node.person.id)}
          isManager={managerSet?.has(node.person.id)}
          collapsed={node.children.length > 0 ? isCollapsed : undefined}
          editing={isNodeEditing}
          editBuffer={isNodeEditing ? editBuffer : null}
          focusField={isNodeEditing ? 'name' : null}
          onAdd={onAddReport ? () => onAddReport(node.person.id) : undefined}
          onAddParent={onAddParent ? () => onAddParent(node.person.id) : undefined}
          onDelete={onDeletePerson ? () => onDeletePerson(node.person.id) : undefined}
          onInfo={onInfo ? () => onInfo(node.person.id) : undefined}
          onFocus={onFocus && managerSet?.has(node.person.id) ? () => onFocus(node.person.id) : undefined}
          onEditMode={onEditMode ? () => onEditMode(node.person.id) : undefined}
          onToggleCollapse={node.children.length > 0 && onToggleCollapse ? () => onToggleCollapse(node.collapseKey) : undefined}
          onClick={(e) => onSelect(node.person.id, e)}
          onEnterEditing={onEnterEditing ? () => onEnterEditing(node.person) : undefined}
          onUpdateBuffer={onUpdateBuffer ? (field: string, value: string) => onUpdateBuffer(field as keyof EditBuffer, value) : undefined}
          onCommitEdits={onCommitEdits}
          cardRef={setNodeRef(node.person.id)}
        />
      </div>

      {node.children.length > 0 && !isCollapsed && (
        <div className={styles.children}>
          {node.children
            .filter((c): c is ManagerLayout => c.type === 'manager')
            .map((child) => (
              <ManagerLayoutSubtree key={child.person.id} node={child} />
            ))}
          {unpoddedPeople.length > 0 && (
            <SummaryCard people={unpoddedPeople} />
          )}
          {podCards.map((card) => (
            <SummaryCard
              key={card.podName}
              people={card.people}
              podName={card.podName}
              publicNote={card.publicNote}
              podId={card.podId}
              onPodClick={onPodSelect}
            />
          ))}
        </div>
      )}
      {node.children.length > 0 && isCollapsed && (
        <div className={styles.collapsedCount}>{node.children.length} report{node.children.length !== 1 ? 's' : ''}</div>
      )}
    </div>
  )
}

export default function ManagerView() {
  const renderLayoutNode = useCallback((node: LayoutNode) => {
    if (node.type === 'manager') {
      return <ManagerLayoutSubtree key={node.person.id} node={node} />
    }
    return null
  }, [])

  return (
    <ChartShell
      computeEdges={computeManagerEdges}
      computeLayout={computeLayoutTree}
      renderSubtree={() => null}
      renderLayoutNode={renderLayoutNode}
      viewStyles={styles}
      wrapOrphansInIcStack={false}
    />
  )
}
```

- [ ] **Step 3: Run all ManagerView tests**

Run: `cd web && npx vitest run src/views/ManagerView.test.tsx src/views/ManagerView.golden.test.tsx src/views/ManagerView.branches.test.tsx`
Expected: All PASS

- [ ] **Step 4: Run full test suite**

Run: `cd web && npx vitest run`
Expected: All PASS

- [ ] **Step 5: Commit**

```bash
jj describe -m "refactor: migrate ManagerView to consume LayoutNodes from computeLayoutTree"
jj new
```

---

### Task 9: Update Edge Computation to Walk LayoutNodes

**Files:**
- Modify: `web/src/views/columnEdges.ts`
- Modify: `web/src/views/columnEdges.test.ts`
- Modify: `web/src/views/ChartShell.tsx` (update computeEdges signature)
- Modify: `web/src/views/ColumnView.tsx` (pass layout tree to edge computation)

This task updates edge computation to consume LayoutNodes. The `computeEdges` function changes signature from `(people: Person[]) => EdgeDef[]` to `(layoutRoots: LayoutNode[]) => EdgeDef[]`. The dashed cross-team edges still need the full people list for team lead lookup, so we keep that as a second parameter.

- [ ] **Step 1: Run existing edge tests**

Run: `cd web && npx vitest run src/views/columnEdges.test.ts`
Expected: All PASS

- [ ] **Step 2: Update columnEdges.ts to walk LayoutNodes**

Replace the contents of `web/src/views/columnEdges.ts`:

```ts
import type { Person } from '../api/types'
import type { LayoutNode, ManagerLayout, ICLayout } from './layoutTree'

export interface EdgeDef {
  fromId: string
  toId: string
  dashed?: boolean
}

/**
 * Compute all edges for the column view by walking the LayoutNode tree.
 * Reporting edges (solid) come from the tree structure.
 * Additional-team edges (dashed) require the full people list for team lead lookup.
 */
export function computeEdges(layoutRoots: LayoutNode[], people: Person[]): EdgeDef[] {
  const result: EdgeDef[] = []

  function walkManager(node: ManagerLayout) {
    let icBatch: ICLayout[] = []

    const flushIcBatch = () => {
      if (icBatch.length > 0) {
        result.push({ fromId: node.person.id, toId: icBatch[0].person.id })
        icBatch = []
      }
    }

    for (const child of node.children) {
      switch (child.type) {
        case 'manager':
          flushIcBatch()
          result.push({ fromId: node.person.id, toId: child.person.id })
          walkManager(child)
          break
        case 'ic':
          if (child.affiliation !== 'local') {
            flushIcBatch()
            // Multi/single cross-team ICs rendered individually — edge to each
            result.push({ fromId: node.person.id, toId: child.person.id })
          } else {
            icBatch.push(child)
          }
          break
        case 'podGroup':
          flushIcBatch()
          // Edge: manager → pod header → first IC
          result.push({ fromId: node.person.id, toId: child.collapseKey })
          if (child.members.length > 0) {
            result.push({ fromId: child.collapseKey, toId: child.members[0].person.id })
          }
          break
      }
    }
    flushIcBatch()
  }

  for (const root of layoutRoots) {
    if (root.type === 'manager') walkManager(root)
  }

  // Dashed cross-team edges
  const byTeam = new Map<string, Person[]>()
  for (const p of people) {
    if (!byTeam.has(p.team)) byTeam.set(p.team, [])
    byTeam.get(p.team)!.push(p)
  }

  const hasReports = new Set<string>()
  for (const p of people) {
    if (p.managerId) hasReports.add(p.managerId)
  }

  for (const p of people) {
    if (p.additionalTeams && p.additionalTeams.length > 0) {
      for (const addlTeam of p.additionalTeams) {
        const lead = findTeamLead(byTeam, hasReports, addlTeam)
        if (lead && lead.id !== p.id) {
          result.push({ fromId: p.id, toId: lead.id, dashed: true })
        }
      }
    }
  }

  return result
}

function findTeamLead(
  byTeam: Map<string, Person[]>,
  hasReports: Set<string>,
  teamName: string,
): Person | undefined {
  const members = byTeam.get(teamName)
  if (!members || members.length === 0) return undefined
  const lead = members.find((m) => hasReports.has(m.id))
  return lead || members[0]
}
```

- [ ] **Step 3: Update ChartShellProps to pass people + layout to computeEdges**

In `web/src/views/ChartShell.tsx`, update the `computeEdges` type in `ChartShellProps`:

```ts
export interface ChartShellProps {
  computeEdges: (people: Person[], roots: OrgNode[], layoutRoots?: LayoutNode[]) => ChartEdge[]
  // ... rest unchanged
}
```

And update the edge computation in the function body:

```ts
const edges = useMemo(
  () => computeEdges(people, roots, layoutTree ?? undefined),
  [computeEdges, people, roots, layoutTree],
)
```

- [ ] **Step 4: Update ColumnView to pass the new computeEdges**

In `web/src/views/ColumnView.tsx`, update the `computeEdges` prop:

```ts
<ChartShell
  computeEdges={(people, _roots, layoutRoots) =>
    layoutRoots ? computeEdges(layoutRoots, people) : []
  }
  // ... rest unchanged
/>
```

- [ ] **Step 5: Update columnEdges.test.ts to use LayoutNode-based API**

Replace `web/src/views/columnEdges.test.ts`:

```ts
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
    expect(edges).toHaveLength(1)
    expect(edges[0]).toEqual({ fromId: '1', toId: '2' })
  })

  it('[VIEW-001] draws individual edges to manager children', () => {
    const people = [
      makePerson({ id: '1', name: 'Alice' }),
      makePerson({ id: '2', name: 'Bob', managerId: '1' }),
      makePerson({ id: '3', name: 'Carol', managerId: '2' }),
    ]
    const layout = computeLayoutTree(buildOrgTree(people))
    const edges = computeEdges(layout, people)
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
    expect(dashedEdge!.fromId).toBe('3')
    expect(dashedEdge!.toId).toBe('2')
  })

  it('[VIEW-001] does not draw dashed edge to self', () => {
    const people = [
      makePerson({ id: '1', name: 'Alice', team: 'Eng', additionalTeams: ['Eng'] }),
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
    // Should have: Boss→Mgr, Mgr→Sub, Boss→pod:1:Alpha, pod:1:Alpha→IC1
    const podEdge = edges.find((e) => e.toId.startsWith('pod:'))
    expect(podEdge).toBeTruthy()
    expect(podEdge!.fromId).toBe('1')
    const podToIcEdge = edges.find((e) => e.fromId.startsWith('pod:'))
    expect(podToIcEdge).toBeTruthy()
    expect(podToIcEdge!.toId).toBe('4')
  })
})
```

- [ ] **Step 6: Run all edge and view tests**

Run: `cd web && npx vitest run src/views/columnEdges.test.ts src/views/ColumnView.test.tsx src/views/ColumnView.golden.test.tsx src/views/ManagerView.test.tsx src/views/ManagerView.golden.test.tsx`
Expected: All PASS

- [ ] **Step 7: Run full test suite**

Run: `cd web && npx vitest run`
Expected: All PASS

- [ ] **Step 8: Commit**

```bash
jj describe -m "refactor: update columnEdges to walk LayoutNodes instead of rebuilding tree"
jj new
```

---

### Task 10: Cleanup — Delete Old Code and Remove Legacy Paths

**Files:**
- Delete: `web/src/views/columnLayout.ts`
- Delete: `web/src/views/columnLayout.test.ts`
- Modify: `web/src/views/ChartShell.tsx` — remove `OrphanGroup` import, remove legacy rendering path, simplify props
- Modify: `web/src/views/ColumnView.tsx` — remove unused `renderSubtree` dummy
- Modify: `web/src/views/ManagerView.tsx` — remove unused `renderSubtree` dummy

- [ ] **Step 1: Delete columnLayout.ts and its tests**

```bash
rm web/src/views/columnLayout.ts web/src/views/columnLayout.test.ts
```

- [ ] **Step 2: Simplify ChartShellProps — remove legacy path**

Remove the non-layout rendering path from `ChartShell.tsx`. The final `ChartShellProps`:

```ts
export interface ChartShellProps {
  computeEdges: (people: Person[], roots: OrgNode[], layoutRoots?: LayoutNode[]) => ChartEdge[]
  computeLayout: (roots: OrgNode[]) => LayoutNode[]
  renderLayoutNode: (node: LayoutNode) => ReactNode
  viewStyles: Record<string, string>
  dashedEdges?: boolean
  useGhostPeople?: boolean
  includeAddToTeam?: boolean
}
```

Remove the `OrphanGroup` import and its rendering block from the forest. Remove `renderSubtree`, `renderOrphanSubtree`, `renderTeamHeader`, `wrapOrphansInIcStack` props. The forest rendering becomes:

```tsx
<div className={styles.forest} data-role="forest">
  {layoutTree.map((n) => renderLayoutNode(n))}
</div>
```

- [ ] **Step 3: Update ColumnView and ManagerView to match simplified props**

Remove `renderSubtree={() => null}` from both. Example for ColumnView:

```tsx
<ChartShell
  computeEdges={(people, _roots, layoutRoots) =>
    layoutRoots ? computeEdges(layoutRoots, people) : []
  }
  computeLayout={computeLayoutTree}
  renderLayoutNode={renderLayoutNode}
  viewStyles={styles}
  dashedEdges
  useGhostPeople
  includeAddToTeam
/>
```

- [ ] **Step 4: Run full test suite**

Run: `cd web && npx vitest run`
Expected: All PASS (OrphanGroup tests may need updating since OrphanGroup is no longer imported by ChartShell — check if they test OrphanGroup in isolation or through ChartShell)

- [ ] **Step 5: Fix any failing OrphanGroup tests**

If OrphanGroup tests fail because the component is no longer used, either:
- Keep `OrphanGroup.tsx` and its tests as-is if other code still imports it
- Delete `OrphanGroup.tsx` and `OrphanGroup.test.tsx` if no longer imported anywhere

Check: `grep -r "OrphanGroup" web/src/ --include="*.ts" --include="*.tsx" | grep -v test | grep -v ".test."`

If only test files reference it, delete both. If something else imports it, keep it.

- [ ] **Step 6: Verify no imports reference deleted files**

```bash
cd web && npx tsc --noEmit
```
Expected: No errors

- [ ] **Step 7: Run full test suite one final time**

Run: `cd web && npx vitest run`
Expected: All PASS

- [ ] **Step 8: Commit**

```bash
jj describe -m "refactor: delete columnLayout.ts, remove legacy ChartShell rendering path, clean up OrphanGroup"
jj new
```

---

### Task 11: Final Verification

- [ ] **Step 1: Run TypeScript check**

```bash
cd web && npx tsc --noEmit
```
Expected: No errors

- [ ] **Step 2: Run full test suite**

```bash
cd web && npx vitest run
```
Expected: All PASS

- [ ] **Step 3: Run the dev server and visually verify**

```bash
cd /home/zach/code/grove && make dev
```

Manually check:
- ColumnView renders correctly with managers, ICs, pods, cross-team ICs
- ManagerView renders correctly with summary cards
- Collapse/expand works for managers, pods, and orphan groups
- Edge lines connect correctly
- Drag and drop still works

- [ ] **Step 4: Squash working commits for PR**

Review the commit history and prepare for PR:

```bash
jj log
```
