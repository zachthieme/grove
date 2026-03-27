import { TEAM_DROP_PREFIX, POD_DROP_PREFIX } from '../constants'

/** Build a team drop-target ID from a team name. */
export function buildTeamDropId(teamName: string): string {
  return `${TEAM_DROP_PREFIX}${teamName}`
}

/** Parse a team name from a team drop-target ID. Returns null if not a team drop ID. */
export function parseTeamDropId(targetId: string): string | null {
  if (!targetId.startsWith(TEAM_DROP_PREFIX)) return null
  return targetId.slice(TEAM_DROP_PREFIX.length)
}

/** Build a pod drop-target ID from a managerId and pod name. */
export function buildPodDropId(managerId: string, podName: string): string {
  return `${POD_DROP_PREFIX}${managerId}:${podName}`
}

/** Parse a pod drop-target ID. Returns null if not a pod drop ID. */
export function parsePodDropId(targetId: string): { managerId: string; podName: string } | null {
  if (!targetId.startsWith(POD_DROP_PREFIX)) return null
  const rest = targetId.slice(POD_DROP_PREFIX.length)
  const colonIdx = rest.indexOf(':')
  if (colonIdx === -1) return null
  return {
    managerId: rest.slice(0, colonIdx),
    podName: rest.slice(colonIdx + 1),
  }
}
