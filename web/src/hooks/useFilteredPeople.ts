import { useMemo } from 'react'
import type { OrgNode } from '../api/types'

function placeholderId(realId: string): string {
  return `__placeholder_${realId}`
}

export function useFilteredPeople(
  rawPeople: OrgNode[],
  original: OrgNode[],
  working: OrgNode[],
  hiddenEmploymentTypes: Set<string>,
  headSubtree: Set<string> | null,
  showChanges: boolean,
  showPrivate: boolean,
) {
  const privateFiltered = useMemo(() => {
    if (showPrivate) return rawPeople

    const visible = rawPeople.filter((p) => !p.private)

    const hiddenIds = new Set(rawPeople.filter((p) => p.private).map((p) => p.id))
    const managersNeeded = new Set<string>()
    for (const p of visible) {
      if (p.managerId && hiddenIds.has(p.managerId)) {
        managersNeeded.add(p.managerId)
      }
    }

    if (managersNeeded.size === 0) return visible

    const placeholders: (OrgNode & { isPlaceholder: true })[] = []
    for (const realId of managersNeeded) {
      const phId = placeholderId(realId)
      placeholders.push({
        id: phId,
        name: 'TBD Manager',
        role: '',
        discipline: '',
        managerId: rawPeople.find((p) => p.id === realId)?.managerId ?? '',
        team: '',
        additionalTeams: [],
        status: '—' as OrgNode['status'],
        isPlaceholder: true,
      })
    }

    const reparented = visible.map((p) => {
      if (p.managerId && hiddenIds.has(p.managerId) && managersNeeded.has(p.managerId)) {
        return { ...p, managerId: placeholderId(p.managerId) }
      }
      return p
    })

    return [...reparented, ...placeholders]
  }, [rawPeople, showPrivate])

  const empFiltered = useMemo(() => {
    if (hiddenEmploymentTypes.size === 0) return privateFiltered
    return privateFiltered.filter((p) => !hiddenEmploymentTypes.has(p.employmentType || ''))
  }, [privateFiltered, hiddenEmploymentTypes])

  const people = useMemo(() => {
    if (!headSubtree) return empFiltered
    return empFiltered.filter((p) => headSubtree.has(p.id))
  }, [empFiltered, headSubtree])

  const ghostPeople = useMemo(() => {
    if (!showChanges) return []
    const workingIds = new Set(working.map((w) => w.id))
    let ghosts = original.filter((o) => !workingIds.has(o.id))
    if (!showPrivate) {
      ghosts = ghosts.filter((p) => !p.private)
    }
    if (hiddenEmploymentTypes.size > 0) {
      ghosts = ghosts.filter((p) => !hiddenEmploymentTypes.has(p.employmentType || ''))
    }
    if (headSubtree) {
      ghosts = ghosts.filter((p) => headSubtree.has(p.id))
    }
    return ghosts
  }, [showChanges, original, working, hiddenEmploymentTypes, headSubtree, showPrivate])

  return { people, ghostPeople }
}
