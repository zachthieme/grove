// Pod CRUD + sidecar export.

import type { PodInfo, MutationResponse, PodUpdatePayload } from './types'
import { BASE, fetchWithTimeout, json } from './core'

export async function listPods(): Promise<PodInfo[]> {
  return json<PodInfo[]>(await fetchWithTimeout(`${BASE}/pods`))
}

export async function updatePod(podId: string, fields: PodUpdatePayload): Promise<MutationResponse> {
  const resp = await fetchWithTimeout(`${BASE}/pods/update`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ podId, fields }),
  })
  return json<MutationResponse>(resp)
}

export async function createPod(managerId: string, name: string, team: string): Promise<MutationResponse> {
  const resp = await fetchWithTimeout(`${BASE}/pods/create`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ managerId, name, team }),
  })
  return json<MutationResponse>(resp)
}

export async function exportPodsSidecarBlob(): Promise<Blob | null> {
  const resp = await fetchWithTimeout(`${BASE}/export/pods-sidecar`)
  if (resp.status === 204) return null
  if (!resp.ok) throw new Error(`Export pods sidecar failed: ${resp.status}`)
  return resp.blob()
}
