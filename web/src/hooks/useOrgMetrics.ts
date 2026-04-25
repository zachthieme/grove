import type { OrgNode } from '../api/types'
import { isRecruitingStatus, isPlannedStatus, isTransferStatus, isProduct } from '../constants'

export interface TeamPodGroup {
  name: string
  count: number
  byDiscipline: Map<string, number>
  productCount: number
}

export interface OrgMetrics {
  spanOfControl: number
  totalHeadcount: number
  productCount: number
  recruiting: number
  planned: number
  transfers: number
  byDiscipline: Map<string, number>
  byTeamPod: TeamPodGroup[]
}

export function computeOrgMetrics(personId: string, allPeople: OrgNode[]): OrgMetrics {
  const childrenMap = new Map<string, OrgNode[]>()
  for (const p of allPeople) {
    if (p.managerId) {
      const list = childrenMap.get(p.managerId) ?? []
      list.push(p)
      childrenMap.set(p.managerId, list)
    }
  }

  const directReports = childrenMap.get(personId) || []
  const metrics: OrgMetrics = {
    spanOfControl: directReports.filter((p) => !isProduct(p)).length,
    totalHeadcount: 0,
    productCount: 0,
    recruiting: 0,
    planned: 0,
    transfers: 0,
    byDiscipline: new Map(),
    byTeamPod: [],
  }

  // Collect all people in subtree, grouped by pod/team with discipline sub-counts
  const groupMap = new Map<string, Map<string, number>>()
  const groupCounts = new Map<string, number>()
  const groupProductCounts = new Map<string, number>()

  function walk(pid: string) {
    const reports = childrenMap.get(pid) || []
    for (const r of reports) {
      if (isProduct(r)) {
        // Products are tracked separately via productCount; the group's `count`
        // mirrors totalHeadcount semantics (people only) per PROD-009. Register
        // the group key with count=0 so a product-only pod still surfaces in
        // byTeamPod with its productCount.
        metrics.productCount++
        const groupKey = r.pod || r.team || 'Unassigned'
        if (!groupCounts.has(groupKey)) groupCounts.set(groupKey, 0)
        if (!groupMap.has(groupKey)) groupMap.set(groupKey, new Map())
        groupProductCounts.set(groupKey, (groupProductCounts.get(groupKey) || 0) + 1)
        walk(r.id)
        continue
      }

      metrics.totalHeadcount++

      // Group key: use pod if set, otherwise team
      const groupKey = r.pod || r.team || 'Unassigned'

      groupCounts.set(groupKey, (groupCounts.get(groupKey) || 0) + 1)
      if (!groupMap.has(groupKey)) groupMap.set(groupKey, new Map())

      if (r.status === 'Active') {
        const d = r.discipline || 'Unknown'
        metrics.byDiscipline.set(d, (metrics.byDiscipline.get(d) || 0) + 1)
        const discMap = groupMap.get(groupKey)!
        discMap.set(d, (discMap.get(d) || 0) + 1)
      } else if (isRecruitingStatus(r.status)) {
        metrics.recruiting++
      } else if (isPlannedStatus(r.status)) {
        metrics.planned++
      } else if (isTransferStatus(r.status)) {
        metrics.transfers++
      }

      walk(r.id)
    }
  }

  walk(personId)

  // Build sorted team/pod groups
  metrics.byTeamPod = [...groupCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([name, count]) => ({
      name,
      count,
      byDiscipline: groupMap.get(name) || new Map(),
      productCount: groupProductCounts.get(name) || 0,
    }))

  return metrics
}
