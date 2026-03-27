import { describe, it, expect } from 'vitest'
import type { Person } from '../api/types'

// Test the diff logic directly (extracted from the hook's useMemo callback)
function computeDiff(original: Person[], working: Person[]) {
  const changes = new Map<string, { types: Set<string> }>()
  const origById = new Map(original.map((p) => [p.id, p]))
  const workById = new Map(working.map((p) => [p.id, p]))

  for (const w of working) {
    const o = origById.get(w.id)
    const types = new Set<string>()
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
}

const base: Person = {
  id: '1', name: 'Alice', role: 'VP', discipline: 'Eng',
  managerId: '', team: 'Eng', additionalTeams: [], status: 'Active',
}

describe('computeDiff', () => {
  it('[VIEW-004] returns empty for identical data', () => {
    const changes = computeDiff([base], [base])
    expect(changes.size).toBe(0)
  })

  it('[VIEW-004] detects added person', () => {
    const added: Person = { ...base, id: '2', name: 'Bob' }
    const changes = computeDiff([base], [base, added])
    expect(changes.get('2')?.types.has('added')).toBe(true)
  })

  it('[VIEW-004] detects removed person', () => {
    const changes = computeDiff([base], [])
    expect(changes.get('1')?.types.has('removed')).toBe(true)
  })

  it('[VIEW-004] detects reporting change', () => {
    const moved = { ...base, managerId: '99' }
    const changes = computeDiff([base], [moved])
    expect(changes.get('1')?.types.has('reporting')).toBe(true)
  })

  it('[VIEW-004] detects title change', () => {
    const changed = { ...base, role: 'Director' }
    const changes = computeDiff([base], [changed])
    expect(changes.get('1')?.types.has('title')).toBe(true)
  })

  it('[VIEW-004] detects reorg', () => {
    const moved = { ...base, team: 'Platform' }
    const changes = computeDiff([base], [moved])
    expect(changes.get('1')?.types.has('reorg')).toBe(true)
  })

  it('[VIEW-004] detects multiple changes on same person', () => {
    const changed = { ...base, role: 'Director', team: 'Platform' }
    const changes = computeDiff([base], [changed])
    const types = changes.get('1')?.types
    expect(types?.has('title')).toBe(true)
    expect(types?.has('reorg')).toBe(true)
  })

  it('[VIEW-004] returns empty map for empty arrays', () => {
    const changes = computeDiff([], [])
    expect(changes.size).toBe(0)
  })

  it('[VIEW-004] detects reorg + title change together', () => {
    const changed = { ...base, role: 'Director', discipline: 'PM', team: 'Product', managerId: '99' }
    const changes = computeDiff([base], [changed])
    const types = changes.get('1')?.types
    expect(types).toBeDefined()
    expect(types?.has('reorg')).toBe(true)
    expect(types?.has('title')).toBe(true)
    expect(types?.has('reporting')).toBe(true)
    expect(types?.size).toBe(3)
  })

  it('[VIEW-004] does not flag unchanged person', () => {
    const other: Person = { ...base, id: '2', name: 'Bob' }
    const changes = computeDiff([base, other], [base, other])
    expect(changes.size).toBe(0)
  })
})
