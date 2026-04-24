import type { OrgNode } from '../api/types'
import type { TreeNode } from './shared'

export type Affiliation = 'local' | 'singleCrossTeam' | 'multiCrossTeam'

export interface ManagerLayout {
  type: 'manager'
  person: OrgNode
  collapseKey: string
  children: LayoutNode[]
}

export interface ICLayout {
  type: 'ic'
  person: OrgNode
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

export interface ProductLayout {
  type: 'product'
  person: OrgNode
}

export interface ProductGroupLayout {
  type: 'productGroup'
  collapseKey: string
  members: ProductLayout[]
}

export type LayoutNode = ManagerLayout | ICLayout | PodGroupLayout | TeamGroupLayout | ProductGroupLayout | ProductLayout

export function computeLayoutTree(roots: TreeNode[]): LayoutNode[] {
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

function classifyAffiliation(person: OrgNode, siblingManagers: TreeNode[]): Affiliation {
  const addl = person.additionalTeams || []
  if (addl.length === 0) return 'local'

  const managerTeams = new Set(siblingManagers.map((m) => m.person.team))
  const matchCount = addl.filter((t) => managerTeams.has(t)).length

  if (matchCount === 0) return 'local'
  if (matchCount === 1) return 'singleCrossTeam'
  return 'multiCrossTeam'
}

function buildICLayout(node: TreeNode, siblingManagers: TreeNode[]): ICLayout {
  return {
    type: 'ic',
    person: node.person,
    affiliation: classifyAffiliation(node.person, siblingManagers),
  }
}

function reorderManagersByAffinity(managers: TreeNode[], ics: TreeNode[]): TreeNode[] {
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
  const result: TreeNode[] = []

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

export interface ClassifiedICs {
  withinManager: Map<number, ICLayout[]>
  afterManager: Map<number, ICLayout[]>
  unaffiliated: ICLayout[]
}

export function classifyICs(
  ics: TreeNode[],
  reorderedManagers: TreeNode[],
): ClassifiedICs {
  const managerByTeam = new Map<string, TreeNode>()
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
      // Multiple teams, no pods — use TeamGroupLayout (NOT PodGroupLayout)
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

function buildManagerLayout(node: TreeNode): ManagerLayout {
  const managers = node.children.filter((c) => c.children.length > 0)
  const allLeaves = node.children.filter((c) => c.children.length === 0)

  // Separate products from ICs
  const products = allLeaves.filter((c) => c.person.type === 'product')
  const ics = allLeaves.filter((c) => c.person.type !== 'product')

  const reorderedManagers = reorderManagersByAffinity(managers, ics)
  const { withinManager, afterManager, unaffiliated } = classifyICs(ics, reorderedManagers)

  // Build children array
  const children: LayoutNode[] = []
  for (let i = 0; i < reorderedManagers.length; i++) {
    const mgrLayout = buildManagerLayout(reorderedManagers[i])
    children.push(mgrLayout)
    // Single-affiliation cross-team ICs placed after their affiliated manager
    const withinIcs = withinManager.get(i)
    if (withinIcs) children.push(...withinIcs)
    // Multi-affiliation ICs placed after highest-indexed manager
    const multiIcs = afterManager.get(i)
    if (multiIcs) children.push(...multiIcs)
  }

  // Group unaffiliated ICs by pod/team
  children.push(...groupUnaffiliated(unaffiliated, node.person.id))

  // Add product group if any products exist
  if (products.length > 0) {
    children.push({
      type: 'productGroup',
      collapseKey: `products:${node.person.id}`,
      members: products.map((p) => ({
        type: 'product' as const,
        person: p.person,
      })),
    })
  }

  return {
    type: 'manager',
    person: node.person,
    collapseKey: node.person.id,
    children,
  }
}
