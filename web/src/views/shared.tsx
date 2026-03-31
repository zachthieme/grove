import type { Person } from '../api/types'

export interface OrgNode {
  person: Person
  children: OrgNode[]
}

export function buildOrgTree(people: Person[]): OrgNode[] {
  const byId = new Map(people.map((p) => [p.id, p]))
  const childrenMap = new Map<string, Person[]>()

  for (const p of people) {
    if (p.managerId && byId.has(p.managerId)) {
      if (!childrenMap.has(p.managerId)) childrenMap.set(p.managerId, [])
      childrenMap.get(p.managerId)!.push(p)
    }
  }

  const roots = people.filter((p) => !p.managerId || !byId.has(p.managerId))

  function build(person: Person): OrgNode {
    const children = (childrenMap.get(person.id) || [])
      .sort((a, b) => (a.sortIndex ?? 0) - (b.sortIndex ?? 0))
      .map(build)
    return { person, children }
  }

  return roots.map(build)
}
