import type { OrgNode } from './shared'

export type RenderItem =
  | { type: 'manager'; node: OrgNode }
  | { type: 'ic'; node: OrgNode }
  | { type: 'icGroup'; team: string; members: OrgNode[] }

/**
 * Build an ordered list of render items.
 * Managers form the spine. Affiliated ICs are inserted after the last manager
 * they connect to, keeping them close to the teams they support without
 * pushing unrelated managers apart.
 * Unaffiliated ICs go last, grouped by team if multiple teams.
 */
export function computeRenderItems(managers: OrgNode[], ics: OrgNode[]): RenderItem[] {
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

  // Unaffiliated ICs: grouped by team if multiple teams
  if (unaffiliated.length > 0) {
    const teamOrder: string[] = []
    const teamMap = new Map<string, OrgNode[]>()
    for (const ic of unaffiliated) {
      if (!teamMap.has(ic.person.team)) {
        teamOrder.push(ic.person.team)
        teamMap.set(ic.person.team, [])
      }
      teamMap.get(ic.person.team)!.push(ic)
    }
    if (teamOrder.length > 1) {
      for (const team of teamOrder) {
        items.push({ type: 'icGroup', team, members: teamMap.get(team)! })
      }
    } else {
      for (const ic of unaffiliated) {
        items.push({ type: 'ic', node: ic })
      }
    }
  }

  return items
}
