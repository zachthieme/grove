import { useMemo } from 'react'
import type { Person } from '../api/types'

export function useManagerSet(people: Person[]): Set<string> {
  return useMemo(() => {
    const set = new Set<string>()
    for (const p of people) {
      if (p.managerId) set.add(p.managerId)
    }
    return set
  }, [people])
}
