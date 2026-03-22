import type { OrgNode } from './shared'

export type RenderItem =
  | { type: 'manager'; node: OrgNode }
  | { type: 'ic'; node: OrgNode }
  | { type: 'icGroup'; team: string; members: OrgNode[] }

/**
 * Build an ordered list of render items: manager subtrees interleaved with ICs.
 * ICs with additionalTeams are placed next to the manager subtree they connect to.
 * Remaining unaffiliated ICs are grouped by team if there are multiple teams.
 */
export function computeRenderItems(managers: OrgNode[], ics: OrgNode[]): RenderItem[] {
  // Build a map of manager team -> manager node (for positioning ICs near them)
  const managerByTeam = new Map<string, OrgNode>()
  for (const m of managers) {
    managerByTeam.set(m.person.team, m)
  }

  // Split ICs into "affiliated" (have additionalTeams matching a manager) and "unaffiliated"
  const affiliated = new Map<string, OrgNode[]>() // managerId -> ICs to place near them
  const unaffiliated: OrgNode[] = []

  for (const ic of ics) {
    const addlTeams = ic.person.additionalTeams || []
    let placed = false
    if (addlTeams.length > 0) {
      // Find the first manager subtree whose team matches an additional team
      for (const at of addlTeams) {
        const mgr = managerByTeam.get(at)
        if (mgr) {
          const list = affiliated.get(mgr.person.id) || []
          list.push(ic)
          affiliated.set(mgr.person.id, list)
          placed = true
          break
        }
      }
    }
    if (!placed) {
      unaffiliated.push(ic)
    }
  }

  // Build render list: for each manager, emit the subtree then any affiliated ICs
  const items: RenderItem[] = []
  for (const m of managers) {
    items.push({ type: 'manager', node: m })
    const affIcs = affiliated.get(m.person.id)
    if (affIcs) {
      for (const ic of affIcs) {
        items.push({ type: 'ic', node: ic })
      }
    }
  }

  // Remaining unaffiliated ICs: group by team if multiple teams
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
