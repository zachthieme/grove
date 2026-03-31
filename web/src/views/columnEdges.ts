import type { Person } from '../api/types'
import type { LayoutNode, ManagerLayout, ICLayout } from './layoutTree'

export interface EdgeDef {
  fromId: string
  toId: string
  dashed?: boolean
}

/**
 * Compute all edges for the column view by walking the LayoutNode tree.
 * Reporting edges (solid) come from the layout structure; additional-team
 * edges (dashed) still require the flat people list for team lead lookup.
 *
 * For IC stacks (consecutive local ICs), only one edge is drawn to the
 * first IC in the batch.
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
            result.push({ fromId: node.person.id, toId: child.person.id })
          } else {
            icBatch.push(child)
          }
          break
        case 'podGroup':
          flushIcBatch()
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

  // Dashed cross-team edges (still from people list)
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
  // Prefer someone with reports (a manager) in that team
  const lead = members.find((m) => hasReports.has(m.id))
  return lead || members[0]
}
