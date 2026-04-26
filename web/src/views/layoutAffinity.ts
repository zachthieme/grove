// Manager-affinity reordering. When ICs reference multiple managers via
// `additionalTeams`, reorderManagersByAffinity groups managers that share
// cross-team ICs into adjacent positions so the cross-team edges stay
// short in the column view.

import type { TreeNode } from './shared'

export function reorderManagersByAffinity(managers: TreeNode[], ics: TreeNode[]): TreeNode[] {
  if (managers.length <= 2) return managers

  const teamToIdx = new Map<string, number>()
  for (let i = 0; i < managers.length; i++) {
    teamToIdx.set(managers[i].person.team, i)
  }

  const adj = new Map<number, Set<number>>()
  for (const ic of ics) {
    const teams = ic.person.additionalTeams || []
    const indices = teams
      .map((t) => teamToIdx.get(t))
      .filter((i): i is number => i !== undefined)
    for (const a of indices) {
      for (const b of indices) {
        if (a !== b) {
          if (!adj.has(a)) adj.set(a, new Set())
          adj.get(a)!.add(b)
        }
      }
    }
  }

  if (adj.size === 0) return managers

  const visited = new Set<number>()
  const result: TreeNode[] = []

  for (let i = 0; i < managers.length; i++) {
    if (visited.has(i)) continue
    visited.add(i)

    const component: number[] = [i]
    const queue = [i]
    while (queue.length > 0) {
      const cur = queue.shift()!
      for (const neighbor of adj.get(cur) || []) {
        if (!visited.has(neighbor)) {
          visited.add(neighbor)
          component.push(neighbor)
          queue.push(neighbor)
        }
      }
    }

    component.sort((a, b) => a - b)
    for (const idx of component) {
      result.push(managers[idx])
    }
  }

  return result
}
