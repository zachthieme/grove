// People + org-state mutations: create, get, move, update, add, addParent,
// delete, restore, emptyBin, reorder, reset, restoreState, exportDataUrl.

import type {
  OrgData, OrgNode, MovePayload, UpdatePayload, DeletePayload, AddParentPayload,
  DeleteResponse, RestoreResponse, EmptyBinResponse, AddResponse, CopyResponse, MutationResponse,
  AutosaveData,
} from './types'
import { BASE, fetchWithTimeout, generateCorrelationId, jsonWithLog } from './core'

export async function createOrg(name: string, correlationId?: string): Promise<OrgData> {
  const cid = correlationId ?? generateCorrelationId()
  const startTime = Date.now()
  const resp = await fetchWithTimeout(`${BASE}/create`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name }),
    correlationId: cid,
  })
  return jsonWithLog<OrgData>(resp, {
    method: 'POST', path: '/api/create', correlationId: cid, requestBody: { name }, startTime,
  })
}

export async function getOrg(correlationId?: string): Promise<OrgData | null> {
  const cid = correlationId ?? generateCorrelationId()
  const startTime = Date.now()
  const resp = await fetchWithTimeout(`${BASE}/org`, { correlationId: cid })
  if (resp.status === 204) return null
  return jsonWithLog<OrgData>(resp, {
    method: 'GET', path: '/api/org', correlationId: cid, startTime,
  })
}

export async function moveNode(payload: MovePayload, correlationId?: string): Promise<MutationResponse> {
  const cid = correlationId ?? generateCorrelationId()
  const startTime = Date.now()
  const resp = await fetchWithTimeout(`${BASE}/move`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    correlationId: cid,
  })
  return jsonWithLog<MutationResponse>(resp, {
    method: 'POST', path: '/api/move', correlationId: cid, requestBody: payload, startTime,
  })
}

export async function updateNode(payload: UpdatePayload, correlationId?: string): Promise<MutationResponse> {
  const cid = correlationId ?? generateCorrelationId()
  const startTime = Date.now()
  const resp = await fetchWithTimeout(`${BASE}/update`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    correlationId: cid,
  })
  return jsonWithLog<MutationResponse>(resp, {
    method: 'POST', path: '/api/update', correlationId: cid, requestBody: payload, startTime,
  })
}

export async function addNode(person: Omit<OrgNode, 'id'>, correlationId?: string): Promise<AddResponse> {
  const cid = correlationId ?? generateCorrelationId()
  const startTime = Date.now()
  const resp = await fetchWithTimeout(`${BASE}/add`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(person),
    correlationId: cid,
  })
  return jsonWithLog<AddResponse>(resp, {
    method: 'POST', path: '/api/add', correlationId: cid, requestBody: person, startTime,
  })
}

export async function copySubtree(rootIds: string[], targetParentId: string, correlationId?: string): Promise<CopyResponse> {
  const cid = correlationId ?? generateCorrelationId()
  const startTime = Date.now()
  const body = { rootIds, targetParentId }
  const resp = await fetchWithTimeout(`${BASE}/people/copy-subtree`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    correlationId: cid,
  })
  return jsonWithLog<CopyResponse>(resp, {
    method: 'POST', path: '/api/people/copy-subtree', correlationId: cid, requestBody: body, startTime,
  })
}

export async function addParent(payload: AddParentPayload, correlationId?: string): Promise<AddResponse> {
  const cid = correlationId ?? generateCorrelationId()
  const startTime = Date.now()
  const resp = await fetchWithTimeout(`${BASE}/people/add-parent`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    correlationId: cid,
  })
  return jsonWithLog<AddResponse>(resp, {
    method: 'POST', path: '/api/people/add-parent', correlationId: cid, requestBody: payload, startTime,
  })
}

export async function deleteNode(payload: DeletePayload, correlationId?: string): Promise<DeleteResponse> {
  const cid = correlationId ?? generateCorrelationId()
  const startTime = Date.now()
  const resp = await fetchWithTimeout(`${BASE}/delete`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    correlationId: cid,
  })
  return jsonWithLog<DeleteResponse>(resp, {
    method: 'POST', path: '/api/delete', correlationId: cid, requestBody: payload, startTime,
  })
}

export async function restoreNode(personId: string, correlationId?: string): Promise<RestoreResponse> {
  const cid = correlationId ?? generateCorrelationId()
  const startTime = Date.now()
  const resp = await fetchWithTimeout(`${BASE}/restore`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ personId }),
    correlationId: cid,
  })
  return jsonWithLog<RestoreResponse>(resp, {
    method: 'POST', path: '/api/restore', correlationId: cid, requestBody: { personId }, startTime,
  })
}

export async function emptyBin(correlationId?: string): Promise<EmptyBinResponse> {
  const cid = correlationId ?? generateCorrelationId()
  const startTime = Date.now()
  const resp = await fetchWithTimeout(`${BASE}/empty-bin`, { method: 'POST', correlationId: cid })
  return jsonWithLog<EmptyBinResponse>(resp, {
    method: 'POST', path: '/api/empty-bin', correlationId: cid, startTime,
  })
}

export function exportDataUrl(format: 'csv' | 'xlsx'): string {
  return `${BASE}/export/${format}`
}

export async function reorderPeople(personIds: string[], correlationId?: string): Promise<MutationResponse> {
  const cid = correlationId ?? generateCorrelationId()
  const startTime = Date.now()
  const resp = await fetchWithTimeout(`${BASE}/reorder`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ personIds }),
    correlationId: cid,
  })
  return jsonWithLog<MutationResponse>(resp, {
    method: 'POST', path: '/api/reorder', correlationId: cid, requestBody: { personIds }, startTime,
  })
}

export async function resetToOriginal(correlationId?: string): Promise<OrgData> {
  const cid = correlationId ?? generateCorrelationId()
  const startTime = Date.now()
  const resp = await fetchWithTimeout(`${BASE}/reset`, { method: 'POST', correlationId: cid })
  return jsonWithLog<OrgData>(resp, {
    method: 'POST', path: '/api/reset', correlationId: cid, startTime,
  })
}

export async function restoreState(data: AutosaveData): Promise<void> {
  const resp = await fetchWithTimeout(`${BASE}/restore-state`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })
  if (!resp.ok) {
    throw new Error(`Restore state failed: ${resp.status}`)
  }
}
