import type { Person } from '../api/types'

export interface TeamPodGroup {
  name: string
  count: number
  byDiscipline: Map<string, number>
}

export interface OrgMetrics {
  spanOfControl: number
  totalHeadcount: number
  recruiting: number
  planned: number
  transfers: number
  byDiscipline: Map<string, number>
  byTeamPod: TeamPodGroup[]
}

export function computeOrgMetrics(personId: string, allPeople: Person[]): OrgMetrics {
  const childrenMap = new Map<string, Person[]>()
  for (const p of allPeople) {
    if (p.managerId) {
      const list = childrenMap.get(p.managerId) ?? []
      list.push(p)
      childrenMap.set(p.managerId, list)
    }
  }

  const metrics: OrgMetrics = {
    spanOfControl: (childrenMap.get(personId) || []).length,
    totalHeadcount: 0,
    recruiting: 0,
    planned: 0,
    transfers: 0,
    byDiscipline: new Map(),
    byTeamPod: [],
  }

  // Collect all people in subtree, grouped by pod/team with discipline sub-counts
  const groupMap = new Map<string, Map<string, number>>()
  const groupCounts = new Map<string, number>()

  function walk(pid: string) {
    const reports = childrenMap.get(pid) || []
    for (const r of reports) {
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
      } else if (r.status === 'Open' || r.status === 'Backfill') {
        metrics.recruiting++
      } else if (r.status === 'Planned') {
        metrics.planned++
      } else if (r.status === 'Transfer In' || r.status === 'Transfer Out') {
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
    }))

  return metrics
}
