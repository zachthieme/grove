import type { Pod } from '../api/types'

/**
 * Shared logic for moving people to a target node. Used by both drag-and-drop
 * and vim cut/paste so all nodes behave the same.
 */
export async function moveToTarget(
  sourceIds: string[],
  targetNodeId: string,
  ops: {
    move: (personId: string, newManagerId: string, newTeam: string, correlationId?: string, newPod?: string) => Promise<void>
    reparent: (personId: string, newManagerId: string, correlationId?: string) => Promise<void>
  },
  pods: Pod[],
) {
  const resolvedTarget = targetNodeId.startsWith('__placeholder_')
    ? targetNodeId.slice('__placeholder_'.length)
    : targetNodeId

  const idsToMove = sourceIds.filter(id => id !== resolvedTarget)
  if (idsToMove.length === 0) return

  // Pod target: pod:managerId:podName
  if (resolvedTarget.startsWith('pod:')) {
    const rest = resolvedTarget.slice(4)
    const colonIdx = rest.indexOf(':')
    if (colonIdx !== -1) {
      const managerId = rest.slice(0, colonIdx)
      const podName = rest.slice(colonIdx + 1)
      const pod = pods.find(p => p.managerId === managerId && p.name === podName)
      const team = pod?.team ?? podName
      for (const id of idsToMove) {
        await ops.move(id, managerId, team, undefined, podName)
      }
      return
    }
  }

  // Team target: team:managerId:teamName or team::teamName (drop target format)
  if (resolvedTarget.startsWith('team:')) {
    const rest = resolvedTarget.slice(5)
    const colonIdx = rest.indexOf(':')
    if (colonIdx !== -1) {
      const managerId = rest.slice(0, colonIdx)
      const teamName = rest.slice(colonIdx + 1)
      for (const id of idsToMove) {
        await ops.move(id, managerId, teamName)
      }
      return
    }
  }

  // Orphan team target: orphan:teamName
  if (resolvedTarget.startsWith('orphan:')) {
    const teamName = resolvedTarget.slice(7)
    for (const id of idsToMove) {
      await ops.move(id, '', teamName)
    }
    return
  }

  // Person/manager target
  for (const id of idsToMove) {
    await ops.reparent(id, resolvedTarget)
  }
}
