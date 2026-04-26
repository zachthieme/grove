// Orphan layout: top-level nodes with no children. Group orphan ICs by
// team (one teamGroup per team), and surface orphan products in a single
// productGroup. Single-orphan-only orgs are handled by the caller.

import { isProduct } from '../constants'
import type { TreeNode } from './shared'
import type { LayoutNode, ProductLayout } from './layoutTypes'

export function buildOrphanGroups(orphans: TreeNode[]): LayoutNode[] {
  const result: LayoutNode[] = []
  const orphanProducts = orphans.filter((o) => isProduct(o.person))
  const orphanICs = orphans.filter((o) => !isProduct(o.person))

  const teamOrder: string[] = []
  const teamMap = new Map<string, LayoutNode[]>()
  for (const o of orphanICs) {
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
      members: teamMap.get(team)!.filter((m): m is LayoutNode & { type: 'ic' } => m.type === 'ic'),
    })
  }

  if (orphanProducts.length > 0) {
    const members: ProductLayout[] = orphanProducts.map((o) => ({
      type: 'product',
      person: o.person,
    }))
    result.push({
      type: 'productGroup',
      collapseKey: 'orphan:products',
      members,
    })
  }

  return result
}
