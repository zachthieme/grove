import { useMemo } from 'react'
import type { Person } from '../api/types'

/**
 * Computes the set of person IDs in the subtree rooted at headPersonId.
 * Returns null when no head is set (meaning "show everything").
 */
export function useHeadSubtree(headPersonId: string | null, working: Person[]): Set<string> | null {
  return useMemo(() => {
    if (!headPersonId) return null
    const childrenMap = new Map<string, string[]>()
    for (const p of working) {
      if (p.managerId) {
        if (!childrenMap.has(p.managerId)) childrenMap.set(p.managerId, [])
        childrenMap.get(p.managerId)!.push(p.id)
      }
    }
    const set = new Set<string>()
    const stack = [headPersonId]
    while (stack.length > 0) {
      const id = stack.pop()!
      set.add(id)
      const kids = childrenMap.get(id)
      if (kids) stack.push(...kids)
    }
    return set
  }, [headPersonId, working])
}
