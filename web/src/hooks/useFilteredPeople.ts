import { useMemo } from 'react'
import type { OrgNode } from '../api/types'
import { isProduct } from '../constants'

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
  showProducts: boolean = true,
  showICs: boolean = true,
) {
  // Derive the manager set from the slice we're about to filter so that an
  // original-only manager (whose reports exist only in `original`) is
  // recognized as a manager in original/diff views too.
  const icFiltered = useMemo(() => {
    if (showICs) return rawPeople
    const managerIds = new Set<string>()
    for (const p of rawPeople) {
      if (p.managerId) managerIds.add(p.managerId)
    }
    return rawPeople.filter((p) => isProduct(p) || managerIds.has(p.id))
  }, [rawPeople, showICs])

  const productFiltered = useMemo(() => {
    if (showProducts) return icFiltered
    return icFiltered.filter((p) => !isProduct(p))
  }, [icFiltered, showProducts])

  const privateFiltered = useMemo(() => {
    if (showPrivate) return productFiltered

    const visible = productFiltered.filter((p) => !p.private)

    const hiddenIds = new Set(productFiltered.filter((p) => p.private).map((p) => p.id))
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
        managerId: productFiltered.find((p) => p.id === realId)?.managerId ?? '',
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
  }, [productFiltered, showPrivate])

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
    // Managers in the original-only ghost set: anyone whose id is referenced
    // as managerId by another ghost or working node.
    const ghostManagerIds = new Set<string>()
    for (const o of original) if (o.managerId) ghostManagerIds.add(o.managerId)
    let ghosts = original.filter((o) => !workingIds.has(o.id))
    if (!showPrivate) {
      ghosts = ghosts.filter((p) => !p.private)
    }
    if (!showProducts) {
      ghosts = ghosts.filter((p) => !isProduct(p))
    }
    if (!showICs) {
      ghosts = ghosts.filter((p) => isProduct(p) || ghostManagerIds.has(p.id))
    }
    if (hiddenEmploymentTypes.size > 0) {
      ghosts = ghosts.filter((p) => !hiddenEmploymentTypes.has(p.employmentType || ''))
    }
    if (headSubtree) {
      ghosts = ghosts.filter((p) => headSubtree.has(p.id))
    }
    return ghosts
  }, [showChanges, original, working, hiddenEmploymentTypes, headSubtree, showPrivate, showProducts, showICs])

  return { people, ghostPeople }
}
