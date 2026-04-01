# Layout Tree Refactor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rewrite `buildManagerLayout` as a pipeline, remove `crossTeamICs` from the layout model, fix `PodGroupLayout` semantics, and bring ManagerView to rendering/edge parity with ColumnView.

**Architecture:** Extract `buildManagerLayout` into focused sub-functions (`classifyICs`, `groupUnaffiliated`, `assembleChildren`). Remove `crossTeamICs` field from `ManagerLayout` — views derive it from `children` by `affiliation`. Stop creating `PodGroupLayout` for non-pod groups — use `TeamGroupLayout` instead. Make ManagerView render `teamGroup` nodes and walk `LayoutNode` for edges.

**Tech Stack:** TypeScript, React, Vitest

---

### Task 1: Extract `classifyICs` from `buildManagerLayout`

**Files:**
- Modify: `web/src/views/layoutTree.ts:151-202`
- Test: `web/src/views/layoutTree.test.ts`

- [ ] **Step 1: Write the failing test**

Add to the end of the `computeLayoutTree` describe block in `web/src/views/layoutTree.test.ts`:

```typescript
  it('[LAYOUT-001] classifyICs buckets single-affiliation into withinManager', () => {
    const ic = makeNode({ id: 'ic1', name: 'Carol', team: 'Eng', additionalTeams: ['Design'] })
    const m1 = makeNode({ id: 'm1', name: 'Alice', team: 'Eng' }, [makeNode({ id: 'r1', name: 'R1' })])
    const m2 = makeNode({ id: 'm2', name: 'Bob', team: 'Design' }, [makeNode({ id: 'r2', name: 'R2' })])
    const root = makeNode({ id: 'root', name: 'Boss' }, [m1, m2, ic])

    const result = computeLayoutTree([root])
    const top = result[0] as ManagerLayout
    // After refactor, single-affiliation cross-team IC appears in children (not crossTeamICs)
    const crossTeamChildren = top.children.filter(
      (c): c is ICLayout => c.type === 'ic' && c.affiliation !== 'local'
    )
    // The IC should be in the children of the sub-manager it's affiliated with, or
    // placed after that manager in the parent's children
    const bobManager = top.children.find(
      (c): c is ManagerLayout => c.type === 'manager' && c.person.id === 'm2'
    )!
    // Bob's subtree should exist
    expect(bobManager).toBeDefined()
    // Carol (single cross-team to Design/Bob) should appear after Bob in parent children
    const bobIdx = top.children.findIndex((c) => c.type === 'manager' && (c as ManagerLayout).person.id === 'm2')
    const carolIdx = top.children.findIndex((c) => c.type === 'ic' && (c as ICLayout).person.id === 'ic1')
    expect(carolIdx).toBe(bobIdx + 1)
    expect((top.children[carolIdx] as ICLayout).affiliation).toBe('singleCrossTeam')
  })
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd web && npx vitest run src/views/layoutTree.test.ts --reporter=verbose 2>&1 | tail -20`

Expected: The new test FAILS because currently single-affiliation ICs go into `crossTeamICs` field, not into `children`.

- [ ] **Step 3: Extract classifyICs and update buildManagerLayout**

In `web/src/views/layoutTree.ts`, add the `classifyICs` function before `buildManagerLayout` and update `buildManagerLayout` to use it.

Add this new exported function:

```typescript
export interface ClassifiedICs {
  withinManager: Map<number, ICLayout[]>
  afterManager: Map<number, ICLayout[]>
  unaffiliated: ICLayout[]
}

export function classifyICs(
  ics: OrgNode[],
  reorderedManagers: OrgNode[],
): ClassifiedICs {
  const managerByTeam = new Map<string, OrgNode>()
  const managerIndex = new Map<string, number>()
  for (let i = 0; i < reorderedManagers.length; i++) {
    managerByTeam.set(reorderedManagers[i].person.team, reorderedManagers[i])
    managerIndex.set(reorderedManagers[i].person.id, i)
  }

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

  return { withinManager, afterManager, unaffiliated }
}
```

Then update `buildManagerLayout` to use it. Replace lines 151-273 with:

```typescript
function buildManagerLayout(node: OrgNode): ManagerLayout {
  const managers = node.children.filter((c) => c.children.length > 0)
  const ics = node.children.filter((c) => c.children.length === 0)

  const reorderedManagers = reorderManagersByAffinity(managers, ics)
  const { withinManager, afterManager, unaffiliated } = classifyICs(ics, reorderedManagers)

  // Build children array: interleave managers with their cross-team ICs
  const children: LayoutNode[] = []
  for (let i = 0; i < reorderedManagers.length; i++) {
    const mgrLayout = buildManagerLayout(reorderedManagers[i])
    children.push(mgrLayout)

    // Single-affiliation cross-team ICs placed after their affiliated manager
    const withinIcs = withinManager.get(i)
    if (withinIcs) {
      children.push(...withinIcs)
    }

    // Multi-affiliation ICs placed after highest-indexed manager
    const multiIcs = afterManager.get(i)
    if (multiIcs) {
      children.push(...multiIcs)
    }
  }

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
        if (podName) {
          children.push({
            type: 'podGroup',
            podName,
            managerId: node.person.id,
            collapseKey: `pod:${node.person.id}:${podName}`,
            members,
          })
        } else if (hasPodGroups) {
          children.push(...members)
        } else {
          const groupName = members[0].person.team
          children.push({
            type: 'podGroup',
            podName: groupName,
            managerId: node.person.id,
            collapseKey: `pod:${node.person.id}:${groupName}`,
            members,
          })
        }
      }
    } else {
      children.push(...unaffiliated)
    }
  }

  return {
    type: 'manager',
    person: node.person,
    collapseKey: node.person.id,
    children,
    crossTeamICs: [],
  }
}
```

Key change: `withinManager` ICs now go into `children` after their affiliated manager, not into `crossTeamICs`. The `crossTeamICs` field is set to `[]` — it will be removed in Task 3.

- [ ] **Step 4: Update the existing crossTeamICs test**

The test at line 86 (`attaches single-affiliation cross-team IC to manager`) checks `bob.crossTeamICs`. Update it to check the parent's children array instead:

```typescript
  it('[LAYOUT-001] attaches single-affiliation cross-team IC after affiliated manager', () => {
    const ic = makeNode({ id: 'ic1', name: 'Carol', team: 'Eng', additionalTeams: ['Design'] })
    const m1 = makeNode({ id: 'm1', name: 'Alice', team: 'Eng' }, [makeNode({ id: 'r1', name: 'R1' })])
    const m2 = makeNode({ id: 'm2', name: 'Bob', team: 'Design' }, [makeNode({ id: 'r2', name: 'R2' })])
    const root = makeNode({ id: 'root', name: 'Boss' }, [m1, m2, ic])

    const result = computeLayoutTree([root])
    const top = result[0] as ManagerLayout
    // Carol should appear right after Bob in the children array
    const bobIdx = top.children.findIndex(
      (c): c is ManagerLayout => c.type === 'manager' && c.person.id === 'm2',
    )
    const carolIdx = top.children.findIndex(
      (c): c is ICLayout => c.type === 'ic' && c.person.id === 'ic1',
    )
    expect(carolIdx).toBe(bobIdx + 1)
    expect((top.children[carolIdx] as ICLayout).affiliation).toBe('singleCrossTeam')
  })
```

- [ ] **Step 5: Update abstraction leak guard tests**

In the `abstraction leak guards` describe block:

Update `collectPersons` (line 234) — remove the `crossTeamICs` walk:

```typescript
function collectPersons(nodes: LayoutNode[]): Person[] {
  const result: Person[] = []
  for (const node of nodes) {
    switch (node.type) {
      case 'manager':
        result.push(node.person)
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
```

Update `assertNoExtraFields` (line 277) — remove `crossTeamICs` walk:

```typescript
function assertNoExtraFields(nodes: LayoutNode[]) {
  for (const node of nodes) {
    const allowed = ALLOWED_FIELDS[node.type]
    for (const key of Object.keys(node)) {
      expect(allowed.has(key), `Unexpected field "${key}" on ${node.type} node`).toBe(true)
    }
    if (node.type === 'manager') {
      assertNoExtraFields(node.children)
    }
    if (node.type === 'podGroup' || node.type === 'teamGroup') {
      for (const m of node.members) {
        assertNoExtraFields([m])
      }
    }
  }
}
```

Update the affiliation check test (line 350) — remove the `crossTeamICs` check block:

```typescript
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
          checkAffiliation(node.children)
        }
      }
    }
    checkAffiliation(layoutResult)
  })
```

- [ ] **Step 6: Run all layoutTree tests**

Run: `cd web && npx vitest run src/views/layoutTree.test.ts --reporter=verbose 2>&1 | tail -30`

Expected: All tests PASS. The new test passes. Existing tests pass because `crossTeamICs` is still `[]` (compatible with old assertions that check length).

- [ ] **Step 7: Commit**

```bash
jj describe -m "refactor: extract classifyICs, move cross-team ICs into children array (#100, #104)"
jj new
```

---

### Task 2: Extract `groupUnaffiliated` and fix PodGroupLayout semantics (#101)

**Files:**
- Modify: `web/src/views/layoutTree.ts`
- Test: `web/src/views/layoutTree.test.ts`

- [ ] **Step 1: Write failing test for TeamGroupLayout instead of PodGroupLayout**

Update the existing test at line 138 (`groups unaffiliated ICs by team when multiple teams and no pods`) to expect `teamGroup` instead of `podGroup`:

```typescript
  it('[LAYOUT-001] groups unaffiliated ICs by team when multiple teams and no pods', () => {
    const ic1 = makeNode({ id: 'ic1', name: 'Bob', team: 'Design' })
    const ic2 = makeNode({ id: 'ic2', name: 'Carol', team: 'Product' })
    const m1 = makeNode({ id: 'm1', name: 'Lead', team: 'Eng' }, [makeNode({ id: 'r1', name: 'R1' })])
    const root = makeNode({ id: 'mgr', name: 'Alice' }, [m1, ic1, ic2])

    const result = computeLayoutTree([root])
    const top = result[0] as ManagerLayout
    const teamGroups = top.children.filter((c): c is TeamGroupLayout => c.type === 'teamGroup')
    expect(teamGroups).toHaveLength(2)
    expect(teamGroups[0].teamName).toBe('Design')
    expect(teamGroups[0].collapseKey).toBe('team:mgr:Design')
    expect(teamGroups[1].teamName).toBe('Product')
    expect(teamGroups[1].collapseKey).toBe('team:mgr:Product')
  })
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd web && npx vitest run src/views/layoutTree.test.ts --reporter=verbose -t "groups unaffiliated ICs by team" 2>&1 | tail -10`

Expected: FAIL — currently produces `podGroup` with `podName` set to team name.

- [ ] **Step 3: Extract `groupUnaffiliated` with fixed semantics**

Add this exported function to `web/src/views/layoutTree.ts` before `buildManagerLayout`:

```typescript
export function groupUnaffiliated(
  unaffiliated: ICLayout[],
  managerId: string,
): LayoutNode[] {
  if (unaffiliated.length === 0) return []

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

  if (groupOrder.length <= 1 && !hasPodGroups) {
    return unaffiliated
  }

  const result: LayoutNode[] = []
  for (const key of groupOrder) {
    const { members, podName } = groupMap.get(key)!
    if (podName) {
      result.push({
        type: 'podGroup',
        podName,
        managerId,
        collapseKey: `pod:${managerId}:${podName}`,
        members,
      })
    } else if (hasPodGroups) {
      // Unpodded ICs remain flat when pod groups are present
      result.push(...members)
    } else {
      // Multiple teams, no pods — use TeamGroupLayout
      const teamName = members[0].person.team
      result.push({
        type: 'teamGroup',
        teamName,
        collapseKey: `team:${managerId}:${teamName}`,
        members,
      })
    }
  }
  return result
}
```

- [ ] **Step 4: Update buildManagerLayout to use groupUnaffiliated**

Replace the unaffiliated grouping block in `buildManagerLayout` (the `if (unaffiliated.length > 0)` section) with:

```typescript
  children.push(...groupUnaffiliated(unaffiliated, node.person.id))
```

- [ ] **Step 5: Update the collapse key format test**

Update the test at line 402 (`collapse key format — team groups match orphan:{teamName}`) to also check within-manager team groups:

```typescript
  it('[LAYOUT-002] collapse key format — team groups use correct prefix', () => {
    for (const node of layoutResult) {
      if (node.type === 'teamGroup') {
        // Root-level team groups (orphans) use orphan: prefix
        expect(node.collapseKey).toBe(`orphan:${node.teamName}`)
      }
    }
    // Within-manager team groups use team:{managerId}:{teamName} prefix
    function checkManagerTeamGroups(nodes: LayoutNode[]) {
      for (const node of nodes) {
        if (node.type === 'manager') {
          for (const child of node.children) {
            if (child.type === 'teamGroup') {
              expect(child.collapseKey).toMatch(/^team:.+:.+$/)
            }
          }
          checkManagerTeamGroups(node.children)
        }
      }
    }
    checkManagerTeamGroups(layoutResult)
  })
```

- [ ] **Step 6: Update ALLOWED_FIELDS and pod grouping correctness test**

The pod grouping correctness test at line 326 checks `node.podName` on podGroups. Since team groups no longer use `podGroup`, this test should still pass as-is (pod groups still have matching pod fields). But verify that the `grouping correctness` test for pod groups doesn't break.

- [ ] **Step 7: Run all layoutTree tests**

Run: `cd web && npx vitest run src/views/layoutTree.test.ts --reporter=verbose 2>&1 | tail -30`

Expected: All PASS.

- [ ] **Step 8: Commit**

```bash
jj describe -m "refactor: extract groupUnaffiliated, use TeamGroupLayout for non-pod groups (#100, #101)"
jj new
```

---

### Task 3: Remove `crossTeamICs` field from `ManagerLayout`

**Files:**
- Modify: `web/src/views/layoutTree.ts:6-12` — remove field from interface
- Modify: `web/src/views/layoutTree.test.ts` — remove from ALLOWED_FIELDS
- Modify: `web/src/views/ColumnView.tsx:12,103,220` — derive from children
- Modify: `web/src/views/columnEdges.ts` — no changes needed (doesn't use crossTeamICs)

- [ ] **Step 1: Remove `crossTeamICs` from the ManagerLayout interface**

In `web/src/views/layoutTree.ts`, update the `ManagerLayout` interface:

```typescript
export interface ManagerLayout {
  type: 'manager'
  person: Person
  collapseKey: string
  children: LayoutNode[]
}
```

- [ ] **Step 2: Remove `crossTeamICs: []` from buildManagerLayout return**

In the `return` statement of `buildManagerLayout`, remove the `crossTeamICs: []` line:

```typescript
  return {
    type: 'manager',
    person: node.person,
    collapseKey: node.person.id,
    children,
  }
```

- [ ] **Step 3: Update ColumnView to derive crossTeamICs from children**

In `web/src/views/ColumnView.tsx`, update the `LayoutSubtree` component.

Remove the `crossTeamICs` prop — change the component signature from:

```typescript
function LayoutSubtree({ node, crossTeamICs }: { node: ManagerLayout; crossTeamICs?: ICLayout[] }) {
```

To:

```typescript
function LayoutSubtree({ node }: { node: ManagerLayout }) {
```

Derive crossTeamICs inside the component. Replace line 17:

```typescript
  const hasCrossTeam = !!(crossTeamICs && crossTeamICs.length > 0 && !isCollapsed)
```

With:

```typescript
  const crossTeamICs = node.children.filter(
    (c): c is ICLayout => c.type === 'ic' && c.affiliation !== 'local'
  )
  const hasCrossTeam = crossTeamICs.length > 0 && !isCollapsed
```

In `childElements` (line 98-125), the `case 'manager':` block passes `crossTeamICs={child.crossTeamICs}`. Change to just:

```typescript
        case 'manager':
          flushIcBatch()
          elements.push(
            <LayoutSubtree key={child.person.id} node={child} />
          )
          break
```

In the `ColumnView` component (line 216-244), change the `renderLayoutNode` callback:

```typescript
  const renderLayoutNode = useCallback((node: LayoutNode): ReactNode => {
    switch (node.type) {
      case 'manager':
        return <LayoutSubtree key={node.person.id} node={node} />
      case 'teamGroup':
        return <LayoutTeamGroup key={node.collapseKey} group={node} />
      default:
        return null
    }
  }, [])
```

- [ ] **Step 4: Remove `crossTeamICs` import from ColumnView**

Update the import at line 5 — remove `ICLayout` if it's no longer used at the top level (it's still used inside `LayoutSubtree` for the filter, so keep it):

```typescript
import { computeLayoutTree, type LayoutNode, type ManagerLayout, type ICLayout, type PodGroupLayout, type TeamGroupLayout } from './layoutTree'
```

Actually this import is unchanged — `ICLayout` is still needed.

- [ ] **Step 5: Update ALLOWED_FIELDS in test file**

In `web/src/views/layoutTree.test.ts`, update the `ALLOWED_FIELDS` map (line 269):

```typescript
const ALLOWED_FIELDS: Record<string, Set<string>> = {
  manager: new Set(['type', 'person', 'collapseKey', 'children']),
  ic: new Set(['type', 'person', 'affiliation']),
  podGroup: new Set(['type', 'podName', 'managerId', 'collapseKey', 'members']),
  teamGroup: new Set(['type', 'teamName', 'collapseKey', 'members']),
}
```

- [ ] **Step 6: Run all frontend tests**

Run: `cd web && npx vitest run --reporter=verbose 2>&1 | tail -30`

Expected: All PASS. ColumnView derives cross-team ICs. Layout tests pass with updated ALLOWED_FIELDS.

- [ ] **Step 7: Commit**

```bash
jj describe -m "refactor: remove crossTeamICs from ManagerLayout, derive in views (#104)"
jj new
```

---

### Task 4: Make ManagerView render teamGroup nodes (#105)

**Files:**
- Modify: `web/src/views/ManagerView.tsx:115-198`
- Modify: `docs/scenarios/views.md` — update VIEW-002 to mention orphan rendering

- [ ] **Step 1: Update VIEW-002 scenario**

In `docs/scenarios/views.md`, add to the VIEW-002 invariants list:

```markdown
- Orphan nodes (people with no manager and no reports) rendered as team group summaries
```

- [ ] **Step 2: Add teamGroup handling inside ManagerLayoutSubtree**

In `web/src/views/ManagerView.tsx`, update the child type collection inside `ManagerLayoutSubtree` (around line 122-138). Add a `teamGroups` array:

```typescript
  const managers: ManagerLayout[] = []
  const unpoddedPeople: Person[] = []
  const podGroups: PodGroupLayout[] = []
  const teamGroups: TeamGroupLayout[] = []
  for (const child of node.children) {
    switch (child.type) {
      case 'manager':
        managers.push(child)
        break
      case 'ic':
        unpoddedPeople.push(child.person)
        break
      case 'podGroup':
        podGroups.push(child)
        break
      case 'teamGroup':
        teamGroups.push(child)
        break
    }
  }
```

Add the `TeamGroupLayout` import at line 9:

```typescript
import { computeLayoutTree, type LayoutNode, type ManagerLayout, type PodGroupLayout, type TeamGroupLayout } from './layoutTree'
```

Then render team groups in the children section, after pod groups (around line 177-179):

```typescript
          {podGroups.map((group) => (
            <PodSummaryCard key={group.collapseKey} group={group} />
          ))}
          {teamGroups.map((group) => (
            <SummaryCard key={group.collapseKey} people={group.members.map(m => m.person)} podName={group.teamName} />
          ))}
```

- [ ] **Step 3: Add teamGroup handling to renderLayoutNode**

Update `renderLayoutNode` in the `ManagerView` component (line 190-198) to render root-level team groups:

```typescript
  const renderLayoutNode = useCallback((node: LayoutNode): ReactNode => {
    switch (node.type) {
      case 'manager':
        return <ManagerLayoutSubtree key={node.person.id} node={node} />
      case 'teamGroup':
        return (
          <div key={node.collapseKey} className={styles.subtree}>
            <SummaryCard people={node.members.map(m => m.person)} podName={node.teamName} />
          </div>
        )
      default:
        return null
    }
  }, [])
```

- [ ] **Step 4: Run ManagerView tests**

Run: `cd web && npx vitest run src/views/ManagerView --reporter=verbose 2>&1 | tail -20`

Expected: Golden tests may need snapshot updates since the rendering changed. If golden snapshots fail, update them:

Run: `cd web && npx vitest run src/views/ManagerView --reporter=verbose --update 2>&1 | tail -20`

- [ ] **Step 5: Run all frontend tests**

Run: `cd web && npx vitest run --reporter=verbose 2>&1 | tail -30`

Expected: All PASS.

- [ ] **Step 6: Commit**

```bash
jj describe -m "fix: render teamGroup nodes in ManagerView instead of silently dropping them (#105)"
jj new
```

---

### Task 5: Replace computeManagerEdges with LayoutNode walker (#103)

**Files:**
- Modify: `web/src/views/ManagerView.tsx:15-29`

- [ ] **Step 1: Replace computeManagerEdges**

In `web/src/views/ManagerView.tsx`, replace the `computeManagerEdges` function (lines 15-29) with a LayoutNode-walking version:

```typescript
function computeManagerEdges(_people: Person[], _roots: OrgNode[], layoutRoots?: LayoutNode[]): ChartEdge[] {
  if (!layoutRoots) return []
  const result: ChartEdge[] = []
  function walk(node: LayoutNode) {
    if (node.type !== 'manager') return
    for (const child of node.children) {
      if (child.type === 'manager') {
        result.push({ fromId: node.person.id, toId: child.person.id })
        walk(child)
      }
    }
  }
  for (const root of layoutRoots) walk(root)
  return result
}
```

The `OrgNode` import can now be removed from line 8 since it's no longer used in this file. Check if `Person` import is still needed (yes — used in `SummaryCard` and `buildStatusGroups`). Check if `OrgNode` import is still needed (it's in the `computeManagerEdges` signature as `_roots: OrgNode[]` for type compatibility with `ChartShellProps`). Keep the import.

- [ ] **Step 2: Run all frontend tests**

Run: `cd web && npx vitest run --reporter=verbose 2>&1 | tail -30`

Expected: All PASS.

- [ ] **Step 3: Run e2e smoke test**

Run: `cd web && npx playwright test smoke --reporter=list 2>&1 | tail -10`

Expected: PASS — views still render correctly.

- [ ] **Step 4: Commit**

```bash
jj describe -m "refactor: computeManagerEdges walks LayoutNodes instead of OrgNodes (#103)"
jj new
```

---

### Task 6: Final cleanup and scenario check

**Files:**
- Modify: `web/src/views/layoutTree.ts` — remove any unused imports
- Test: run full suite

- [ ] **Step 1: Verify no unused exports or imports**

Check that `layoutTree.ts` doesn't export `classifyICs` or `groupUnaffiliated` if they're only used internally. If they're only called within the file, make them non-exported (remove the `export` keyword). They're exported for testability — keep them exported if tests import them, otherwise remove.

- [ ] **Step 2: Run full test suite**

Run: `cd web && npx vitest run --reporter=verbose 2>&1 | tail -30`

Expected: All PASS.

- [ ] **Step 3: Run scenario check**

Run: `make check-scenarios 2>&1 | tail -10`

Expected: PASS.

- [ ] **Step 4: Run e2e tests**

Run: `cd web && npx playwright test --reporter=list 2>&1 | tail -20`

Expected: All PASS.

- [ ] **Step 5: Commit any cleanup**

```bash
jj describe -m "chore: layout refactor cleanup"
jj new
```

Only commit if there are changes. If no cleanup needed, skip this commit.
