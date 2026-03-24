import type { OrgData, Person, MovePayload, UpdatePayload, DeletePayload, DeleteResponse, RestoreResponse, EmptyBinResponse, AddResponse, UploadResponse, SnapshotInfo, AutosaveData } from './types'

const DEFAULT_TIMEOUT_MS = 30_000

function fetchWithTimeout(
  input: RequestInfo | URL,
  init?: RequestInit & { timeoutMs?: number },
): Promise<Response> {
  const { timeoutMs = DEFAULT_TIMEOUT_MS, ...fetchInit } = init ?? {}
  const timeoutSignal = AbortSignal.timeout(timeoutMs)

  if (fetchInit.signal) {
    const combined = AbortSignal.any([fetchInit.signal, timeoutSignal])
    return fetch(input, { ...fetchInit, signal: combined })
  }

  return fetch(input, { ...fetchInit, signal: timeoutSignal })
}

const BASE = '/api'

async function json<T>(resp: Response): Promise<T> {
  if (!resp.ok) {
    const text = await resp.text()
    throw new Error(`API ${resp.status}: ${text}`)
  }
  return resp.json() as Promise<T>
}

export async function uploadFile(file: File): Promise<UploadResponse> {
  const form = new FormData()
  form.append('file', file)
  const resp = await fetchWithTimeout(`${BASE}/upload`, { method: 'POST', body: form, timeoutMs: 120_000 })
  return json<UploadResponse>(resp)
}

export async function confirmMapping(mapping: Record<string, string>): Promise<OrgData> {
  const resp = await fetchWithTimeout(`${BASE}/upload/confirm`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ mapping }),
  })
  return json<OrgData>(resp)
}

export async function getOrg(): Promise<OrgData | null> {
  const resp = await fetchWithTimeout(`${BASE}/org`)
  if (resp.status === 204) return null
  return json<OrgData>(resp)
}

export async function movePerson(payload: MovePayload): Promise<Person[]> {
  const resp = await fetchWithTimeout(`${BASE}/move`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  return json<Person[]>(resp)
}

export async function updatePerson(payload: UpdatePayload): Promise<Person[]> {
  const resp = await fetchWithTimeout(`${BASE}/update`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  return json<Person[]>(resp)
}

export async function addPerson(person: Omit<Person, 'id'>): Promise<AddResponse> {
  const resp = await fetchWithTimeout(`${BASE}/add`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(person),
  })
  return json<AddResponse>(resp)
}

export async function deletePerson(payload: DeletePayload): Promise<DeleteResponse> {
  const resp = await fetchWithTimeout(`${BASE}/delete`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  return json<DeleteResponse>(resp)
}

export async function restorePerson(personId: string): Promise<RestoreResponse> {
  const resp = await fetchWithTimeout(`${BASE}/restore`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ personId }),
  })
  return json<RestoreResponse>(resp)
}

export async function emptyBin(): Promise<EmptyBinResponse> {
  const resp = await fetchWithTimeout(`${BASE}/empty-bin`, { method: 'POST' })
  return json<EmptyBinResponse>(resp)
}

export function exportDataUrl(format: 'csv' | 'xlsx'): string {
  return `${BASE}/export/${format}`
}

export async function reorderPeople(personIds: string[]): Promise<Person[]> {
  const resp = await fetchWithTimeout(`${BASE}/reorder`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ personIds }),
  })
  return json<Person[]>(resp)
}

export async function resetToOriginal(): Promise<OrgData> {
  const resp = await fetchWithTimeout(`${BASE}/reset`, { method: 'POST' })
  return json<OrgData>(resp)
}

export async function listSnapshots(): Promise<SnapshotInfo[]> {
  return json<SnapshotInfo[]>(await fetchWithTimeout(`${BASE}/snapshots`))
}

export async function saveSnapshot(name: string): Promise<SnapshotInfo[]> {
  return json<SnapshotInfo[]>(await fetchWithTimeout(`${BASE}/snapshots/save`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name }),
  }))
}

export async function loadSnapshot(name: string): Promise<OrgData> {
  return json<OrgData>(await fetchWithTimeout(`${BASE}/snapshots/load`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name }),
  }))
}

export async function deleteSnapshot(name: string): Promise<SnapshotInfo[]> {
  return json<SnapshotInfo[]>(await fetchWithTimeout(`${BASE}/snapshots/delete`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name }),
  }))
}

export async function writeAutosave(data: AutosaveData): Promise<void> {
  const resp = await fetchWithTimeout(`${BASE}/autosave`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })
  if (!resp.ok) {
    throw new Error(`Autosave failed: ${resp.status}`)
  }
}

export async function readAutosave(): Promise<AutosaveData | null> {
  const resp = await fetchWithTimeout(`${BASE}/autosave`)
  if (resp.status === 204) return null
  return json<AutosaveData>(resp)
}

export async function deleteAutosave(): Promise<void> {
  const resp = await fetchWithTimeout(`${BASE}/autosave`, { method: 'DELETE' })
  if (!resp.ok) {
    throw new Error(`Delete autosave failed: ${resp.status}`)
  }
}

export async function exportSnapshotBlob(name: string, format: 'csv' | 'xlsx'): Promise<Blob> {
  const resp = await fetchWithTimeout(`${BASE}/export/snapshot?name=${encodeURIComponent(name)}&format=${format}`)
  if (!resp.ok) {
    throw new Error(`Export snapshot failed: ${resp.status}`)
  }
  return resp.blob()
}

export async function uploadZipFile(file: File): Promise<UploadResponse> {
  const form = new FormData()
  form.append('file', file)
  const resp = await fetchWithTimeout(`${BASE}/upload/zip`, { method: 'POST', body: form, timeoutMs: 120_000 })
  return json<UploadResponse>(resp)
}
