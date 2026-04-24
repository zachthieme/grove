import { useMemo } from 'react'
import type { OrgNode } from '../api/types'

function employmentTier(empType: string | undefined): number {
  if (!empType || empType === 'FTE' || empType === 'Intern') return 0
  return 1
}

function disciplineRank(discipline: string, order: string[] | null): number {
  if (!order) return 0
  const idx = order.indexOf(discipline)
  if (idx >= 0) return idx
  return order.length // unknown disciplines sort after known
}

export function sortPeople(people: OrgNode[], disciplineOrder: string[]): OrgNode[] {
  // Group by (managerId, team)
  const groups = new Map<string, OrgNode[]>()
  const ungrouped: OrgNode[] = []

  for (const p of people) {
    if (!p.managerId) {
      ungrouped.push(p)
      continue
    }
    const key = `${p.managerId}:${p.team}`
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key)!.push(p)
  }

  // Sort each group independently
  for (const group of groups.values()) {
    group.sort((a, b) => {
      // 1. Employment tier
      const tierA = employmentTier(a.employmentType)
      const tierB = employmentTier(b.employmentType)
      if (tierA !== tierB) return tierA - tierB

      // 2. Discipline rank
      const discA = disciplineRank(a.discipline, disciplineOrder)
      const discB = disciplineRank(b.discipline, disciplineOrder)
      if (discA !== discB) return discA - discB
      // Both unknown disciplines: sort alphabetically
      if (discA >= disciplineOrder.length && a.discipline !== b.discipline) {
        return a.discipline.localeCompare(b.discipline)
      }

      // 3. Level descending (0 = unset, sorts last)
      const levelA = a.level ?? 0
      const levelB = b.level ?? 0
      if (levelA !== levelB) {
        if (levelA === 0) return 1
        if (levelB === 0) return -1
        return levelB - levelA
      }

      // 4. Tiebreaker: sortIndex
      return (a.sortIndex ?? 0) - (b.sortIndex ?? 0)
    })
  }

  // Reassemble preserving original group encounter order
  const result: OrgNode[] = []
  const seen = new Set<string>()

  for (const p of people) {
    if (!p.managerId) {
      result.push(p)
      continue
    }
    const key = `${p.managerId}:${p.team}`
    if (!seen.has(key)) {
      seen.add(key)
      result.push(...groups.get(key)!)
    }
  }

  return result
}

export function useSortedPeople(people: OrgNode[], disciplineOrder: string[]): OrgNode[] {
  return useMemo(
    () => sortPeople(people, disciplineOrder),
    [people, disciplineOrder]
  )
}
