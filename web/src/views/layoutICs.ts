// IC classification + grouping. Splits ICs across siblings into:
//   - withinManager[i]: ICs that match exactly one manager (rendered in
//                       that manager's column).
//   - afterManager[i]:  ICs matching multiple managers (rendered after
//                       the highest-index match to keep edges short).
//   - unaffiliated:     ICs with no cross-team match (grouped by team or
//                       pod via groupUnaffiliated).

import type { OrgNode } from '../api/types'
import type { TreeNode } from './shared'
import type { Affiliation, ICLayout, LayoutNode } from './layoutTypes'

export function classifyAffiliation(person: OrgNode, siblingManagers: TreeNode[]): Affiliation {
  const addl = person.additionalTeams || []
  if (addl.length === 0) return 'local'

  const managerTeams = new Set(siblingManagers.map((m) => m.person.team))
  const matchCount = addl.filter((t) => managerTeams.has(t)).length

  if (matchCount === 0) return 'local'
  if (matchCount === 1) return 'singleCrossTeam'
  return 'multiCrossTeam'
}

export function buildICLayout(node: TreeNode, siblingManagers: TreeNode[]): ICLayout {
  return {
    type: 'ic',
    person: node.person,
    affiliation: classifyAffiliation(node.person, siblingManagers),
  }
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
      result.push(...members)
    } else {
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
