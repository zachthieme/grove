import type { OrgNode, OrgNodeUpdatePayload } from '../api/types'

export function applyUpdate(
  nodes: OrgNode[],
  personId: string,
  fields: OrgNodeUpdatePayload,
): OrgNode[] {
  const idx = nodes.findIndex((n) => n.id === personId)
  if (idx === -1) return nodes
  const next = nodes.slice()
  // OrgNodeUpdatePayload is intentionally looser than OrgNode (status: string vs Status union;
  // additionalTeams: comma-string vs string[]). Server validates and parses; optimistic copy
  // assumes the payload is well-formed and gets overwritten by server truth on success.
  const { additionalTeams: rawTeams, ...rest } = fields
  const merged = { ...nodes[idx], ...rest } as OrgNode
  if (rawTeams !== undefined) {
    merged.additionalTeams = rawTeams.split(',').map((t) => t.trim()).filter(Boolean)
  }
  next[idx] = merged
  return next
}

export function applyMove(
  nodes: OrgNode[],
  personId: string,
  newManagerId: string,
  newTeam: string,
  newPod?: string,
): OrgNode[] {
  const idx = nodes.findIndex((n) => n.id === personId)
  if (idx === -1) return nodes
  const next = nodes.slice()
  const patched: OrgNode = { ...nodes[idx], managerId: newManagerId, team: newTeam }
  if (newPod !== undefined) patched.pod = newPod
  next[idx] = patched
  return next
}

export function applyReorder(nodes: OrgNode[], personIds: string[]): OrgNode[] {
  if (personIds.length === 0) return nodes
  const idIndex = new Map<string, number>()
  for (let i = 0; i < nodes.length; i++) idIndex.set(nodes[i].id, i)

  // Filter to ids that exist; their position-in-filtered-list becomes sortIndex.
  const validIds = personIds.filter((id) => idIndex.has(id))
  if (validIds.length === 0) return nodes

  const newSortIndex = new Map<string, number>()
  validIds.forEach((id, i) => newSortIndex.set(id, i))

  return nodes.map((n) => {
    const idx = newSortIndex.get(n.id)
    return idx === undefined ? n : { ...n, sortIndex: idx }
  })
}
