import { useMemo } from 'react'
import type { OrgNode } from '../api/types'

export type ChangeType = 'added' | 'removed' | 'reporting' | 'title' | 'reorg' | 'pod' | 'type'

export interface NodeChange {
  types: Set<ChangeType>
}

export function useOrgDiff(original: OrgNode[], working: OrgNode[]): Map<string, NodeChange> {
  return useMemo(() => {
    const changes = new Map<string, NodeChange>()
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
        if ((w.pod ?? '') !== (o.pod ?? '')) types.add('pod')
        if ((w.type ?? 'person') !== (o.type ?? 'person')) types.add('type')
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
