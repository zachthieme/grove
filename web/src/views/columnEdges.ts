import type { Person } from '../api/types'

export interface EdgeDef {
  fromId: string
  toId: string
  dashed?: boolean
}

/**
 * Compute all edges for the column view: reporting edges (solid) and
 * additional-team edges (dashed). For IC stacks, only one edge is drawn
 * to the first IC in each team group.
 */
export function computeEdges(people: Person[]): EdgeDef[] {
  const byId = new Map(people.map((p) => [p.id, p]))
  const childrenMap = new Map<string, Person[]>()
  for (const p of people) {
    if (p.managerId && byId.has(p.managerId)) {
      if (!childrenMap.has(p.managerId)) childrenMap.set(p.managerId, [])
      childrenMap.get(p.managerId)!.push(p)
    }
  }

  // For each parent, split children into managers and ICs.
  // Draw a line to each manager child individually.
  // Draw ONE line to the first IC (the stack implies the rest).
  const result: EdgeDef[] = []
  for (const [managerId, children] of childrenMap) {
    const managerChildren = children.filter((c) =>
      people.some((p) => p.managerId === c.id)
    )
    const icChildren = children.filter((c) =>
      !people.some((p) => p.managerId === c.id)
    )

    for (const c of managerChildren) {
      result.push({ fromId: managerId, toId: c.id })
    }
    // For ICs, group by pod (or team if no pod).
    // If a group has a pod, draw: parent → pod header, pod header → first IC.
    // If no pod, draw: parent → first IC.
    const icGroups = new Map<string, { firstIc: Person; hasPod: boolean }>()
    for (const c of icChildren) {
      const key = c.pod || c.team
      if (!icGroups.has(key)) {
        icGroups.set(key, { firstIc: c, hasPod: !!c.pod })
      }
    }
    for (const [groupKey, { firstIc, hasPod }] of icGroups) {
      if (hasPod) {
        const podNodeId = `pod:${managerId}:${groupKey}`
        result.push({ fromId: managerId, toId: podNodeId })
        result.push({ fromId: podNodeId, toId: firstIc.id })
      } else {
        result.push({ fromId: managerId, toId: firstIc.id })
      }
    }
  }

  // Additional teams: dashed edges
  // Find the "lead" of each team — person with reports in that team, or first person
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
  teamName: string
): Person | undefined {
  const members = byTeam.get(teamName)
  if (!members || members.length === 0) return undefined
  // Prefer someone with reports (a manager) in that team
  const lead = members.find((m) => hasReports.has(m.id))
  return lead || members[0]
}
