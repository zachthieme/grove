import { useMemo } from 'react'
import type { Person } from '../api/types'

export type ChangeType = 'added' | 'removed' | 'reporting' | 'title' | 'reorg'

export interface PersonChange {
  types: Set<ChangeType>
}

export function useOrgDiff(original: Person[], working: Person[]): Map<string, PersonChange> {
  return useMemo(() => {
    const changes = new Map<string, PersonChange>()
    const origById = new Map(original.map((p) => [p.id, p]))
    const workById = new Map(working.map((p) => [p.id, p]))

    for (const w of working) {
      const o = origById.get(w.id)
      const types = new Set<ChangeType>()
      if (!o) {
        types.add('added')
      } else {
        if (w.managerId !== o.managerId) types.add('reporting')
        if (w.role !== o.role || w.discipline !== o.discipline) types.add('title')
        if (w.team !== o.team) types.add('reorg')
      }
      if (types.size > 0) changes.set(w.id, { types })
    }

    for (const o of original) {
      if (!workById.has(o.id)) {
        changes.set(o.id, { types: new Set(['removed']) })
      }
    }

    return changes
  }, [original, working])
}
