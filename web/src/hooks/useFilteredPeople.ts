import { useMemo } from 'react'
import type { Person } from '../api/types'

/**
 * Filters people by hidden employment types and head subtree.
 * Returns filtered people array and ghost people (for diff mode).
 */
export function useFilteredPeople(
  rawPeople: Person[],
  original: Person[],
  working: Person[],
  hiddenEmploymentTypes: Set<string>,
  headSubtree: Set<string> | null,
  showChanges: boolean,
) {
  const empFiltered = useMemo(() => {
    if (hiddenEmploymentTypes.size === 0) return rawPeople
    return rawPeople.filter((p) => !hiddenEmploymentTypes.has(p.employmentType || ''))
  }, [rawPeople, hiddenEmploymentTypes])

  const people = useMemo(() => {
    if (!headSubtree) return empFiltered
    return empFiltered.filter((p) => headSubtree.has(p.id))
  }, [empFiltered, headSubtree])

  const ghostPeople = useMemo(() => {
    if (!showChanges) return []
    const workingIds = new Set(working.map((w) => w.id))
    let ghosts = original.filter((o) => !workingIds.has(o.id))
    if (hiddenEmploymentTypes.size > 0) {
      ghosts = ghosts.filter((p) => !hiddenEmploymentTypes.has(p.employmentType || ''))
    }
    if (headSubtree) {
      ghosts = ghosts.filter((p) => headSubtree.has(p.id))
    }
    return ghosts
  }, [showChanges, original, working, hiddenEmploymentTypes, headSubtree])

  return { people, ghostPeople }
}
