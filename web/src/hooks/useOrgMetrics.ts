import type { Person } from '../api/types'

export interface OrgMetrics {
  spanOfControl: number
  totalHeadcount: number
  recruiting: number
  planned: number
  transfers: number
  byDiscipline: Map<string, number>
  byTeam: Map<string, number>
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

  const directReports = childrenMap.get(personId) || []
  const metrics: OrgMetrics = {
    spanOfControl: directReports.length,
    totalHeadcount: 0,
    recruiting: 0,
    planned: 0,
    transfers: 0,
    byDiscipline: new Map(),
    byTeam: new Map(),
  }

  function walk(pid: string) {
    const reports = childrenMap.get(pid) || []
    for (const r of reports) {
      metrics.totalHeadcount++
      metrics.byTeam.set(r.team, (metrics.byTeam.get(r.team) || 0) + 1)

      if (r.status === 'Active') {
        const d = r.discipline || 'Unknown'
        metrics.byDiscipline.set(d, (metrics.byDiscipline.get(d) || 0) + 1)
      } else if (r.status === 'Open' || r.status === 'Backfill') {
        metrics.recruiting++
      } else if (r.status === 'Pending Open' || r.status === 'Planned') {
        metrics.planned++
      } else if (r.status === 'Transfer In' || r.status === 'Transfer Out') {
        metrics.transfers++
      }

      walk(r.id)
    }
  }

  walk(personId)
  return metrics
}
