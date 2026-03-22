import { useMemo } from 'react'
import type { Person } from '../api/types'

const MANAGER_PATTERN = /\b(vp|director|manager|lead|head|chief)\b/i

export function isManager(person: Person, allPeople: Person[]): boolean {
  for (const p of allPeople) {
    if (p.managerId === person.id) return true
  }
  return MANAGER_PATTERN.test(person.role)
}

export function useManagerSet(people: Person[]): Set<string> {
  return useMemo(() => {
    const set = new Set<string>()
    // Single pass: collect all managerIds (people who have reports)
    for (const p of people) {
      if (p.managerId) set.add(p.managerId)
    }
    // Also add people whose role matches manager pattern
    for (const p of people) {
      if (!set.has(p.id) && MANAGER_PATTERN.test(p.role)) {
        set.add(p.id)
      }
    }
    return set
  }, [people])
}
