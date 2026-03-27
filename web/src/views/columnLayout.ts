import type { OrgNode } from './shared'

export type RenderItem =
  | { type: 'manager'; node: OrgNode }
  | { type: 'ic'; node: OrgNode }
  | { type: 'icGroup'; team: string; members: OrgNode[]; podName?: string }

/**
 * Reorder managers so that teams connected by cross-team ICs are adjacent.
 * Builds an affinity graph (edges between manager teams that share a cross-team IC),
 * then walks managers in original order, pulling each connected component together.
 */
function reorderManagersByAffinity(managers: OrgNode[], ics: OrgNode[]): OrgNode[] {
  if (managers.length <= 2) return managers

  const teamToIdx = new Map<string, number>()
  for (let i = 0; i < managers.length; i++) {
    teamToIdx.set(managers[i].person.team, i)
  }

  // Affinity graph construction:
  // Two managers are "linked" if any IC lists both their teams in additionalTeams.
  // This means the IC works across both teams, so keeping those managers adjacent
  // in the layout reduces visual distance for cross-team relationships.
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

  // No cross-team links — keep original order
  if (adj.size === 0) return managers

  // BFS walk: visit managers in their original order. When we reach an unvisited
  // manager, BFS through its connected component (all managers linked by cross-team
  // ICs). Sort each component by original index to maintain relative order, then
  // emit the entire component before moving to the next unvisited manager.
  // This clusters connected teams together while preserving original ordering
  // within each cluster.
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

/**
 * Build an ordered list of render items.
 * Managers form the spine, reordered so cross-team-connected teams are adjacent.
 * Affiliated ICs are inserted after the last manager they connect to, keeping
 * them close to the teams they support without pushing unrelated managers apart.
 * Unaffiliated ICs go last, grouped by team if multiple teams.
 */
export function computeRenderItems(managers: OrgNode[], ics: OrgNode[]): RenderItem[] {
  managers = reorderManagersByAffinity(managers, ics)

  const managerByTeam = new Map<string, OrgNode>()
  const managerIndex = new Map<string, number>()
  for (let i = 0; i < managers.length; i++) {
    managerByTeam.set(managers[i].person.team, managers[i])
    managerIndex.set(managers[i].person.id, i)
  }

  // For each IC with additionalTeams, find the highest-indexed manager they connect to
  // Place them after that manager — keeps them between the teams they serve
  const afterManager = new Map<number, OrgNode[]>() // manager index → ICs to place after
  const unaffiliated: OrgNode[] = []

  for (const ic of ics) {
    const addlTeams = ic.person.additionalTeams || []
    let bestIdx = -1
    if (addlTeams.length > 0) {
      for (const at of addlTeams) {
        const mgr = managerByTeam.get(at)
        if (mgr) {
          const idx = managerIndex.get(mgr.person.id) ?? -1
          if (idx > bestIdx) bestIdx = idx
        }
      }
    }
    if (bestIdx >= 0) {
      const list = afterManager.get(bestIdx) || []
      list.push(ic)
      afterManager.set(bestIdx, list)
    } else {
      unaffiliated.push(ic)
    }
  }

  // Build: emit each manager, then any affiliated ICs that belong after it
  const items: RenderItem[] = []
  for (let i = 0; i < managers.length; i++) {
    items.push({ type: 'manager', node: managers[i] })
    const affIcs = afterManager.get(i)
    if (affIcs) {
      for (const ic of affIcs) {
        items.push({ type: 'ic', node: ic })
      }
    }
  }

  // Unaffiliated ICs: grouped by pod (if available) or team
  if (unaffiliated.length > 0) {
    const groupOrder: string[] = []
    const groupMap = new Map<string, { members: OrgNode[]; podName?: string }>()
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
    for (const g of groupMap.values()) { if (g.podName) { hasPodGroups = true; break } }
    if (groupOrder.length > 1 || hasPodGroups) {
      for (const key of groupOrder) {
        const { members, podName } = groupMap.get(key)!
        items.push({ type: 'icGroup', team: podName ?? members[0].person.team, members, podName })
      }
    } else {
      for (const ic of unaffiliated) {
        items.push({ type: 'ic', node: ic })
      }
    }
  }

  return items
}
