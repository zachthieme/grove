import { useMemo } from 'react'
import type { Person } from '../api/types'

export function isManager(person: Person, allPeople: Person[]): boolean {
  for (const p of allPeople) {
    if (p.managerId === person.id) return true
  }
  return false
}

export function useManagerSet(people: Person[]): Set<string> {
  return useMemo(() => {
    const set = new Set<string>()
    for (const p of people) {
      if (p.managerId) set.add(p.managerId)
    }
    return set
  }, [people])
}
