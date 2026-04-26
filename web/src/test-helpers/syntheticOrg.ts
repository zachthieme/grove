import type { OrgNode } from '../api/types'

/**
 * Build a deterministic synthetic org of approximately `n` nodes.
 * Tree shape: 1 root manager → ceil(sqrt(n-1)) middle managers → ICs spread evenly.
 * Stable across runs for reproducible perf assertions.
 */
export function buildSyntheticOrg(n: number): OrgNode[] {
  if (n < 1) return []
  const out: OrgNode[] = []
  const root: OrgNode = {
    id: 'root',
    name: 'Root',
    role: '',
    discipline: '',
    status: 'Active',
    managerId: '',
    team: 'Org',
    additionalTeams: [],
  }
  out.push(root)
  if (n === 1) return out

  const remaining = n - 1
  const managerCount = Math.max(1, Math.ceil(Math.sqrt(remaining)))
  const managers: OrgNode[] = []
  for (let i = 0; i < managerCount; i++) {
    managers.push({
      id: `mgr-${i}`,
      name: `Manager ${i}`,
      role: '',
      discipline: '',
      status: 'Active',
      managerId: 'root',
      team: `Team-${i}`,
      additionalTeams: [],
    })
  }
  out.push(...managers)

  const icCount = remaining - managerCount
  for (let i = 0; i < icCount; i++) {
    const mgr = managers[i % managerCount]
    out.push({
      id: `ic-${i}`,
      name: `IC ${i}`,
      role: '',
      discipline: '',
      status: 'Active',
      managerId: mgr.id,
      team: mgr.team,
      additionalTeams: [],
    })
  }
  return out
}
