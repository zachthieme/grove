import type { OrgData, Person, MovePayload, UpdatePayload, DeletePayload, DeleteResponse, RestoreResponse, EmptyBinResponse, UploadResponse, SnapshotInfo, AutosaveData } from './types'

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
  const resp = await fetch(`${BASE}/upload`, { method: 'POST', body: form })
  return json<UploadResponse>(resp)
}

export async function confirmMapping(mapping: Record<string, string>): Promise<OrgData> {
  const resp = await fetch(`${BASE}/upload/confirm`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ mapping }),
  })
  return json<OrgData>(resp)
}

export async function getOrg(): Promise<OrgData | null> {
  const resp = await fetch(`${BASE}/org`)
  if (resp.status === 204) return null
  return json<OrgData>(resp)
}

export async function movePerson(payload: MovePayload): Promise<Person[]> {
  const resp = await fetch(`${BASE}/move`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  return json<Person[]>(resp)
}

export async function updatePerson(payload: UpdatePayload): Promise<Person[]> {
  const resp = await fetch(`${BASE}/update`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  return json<Person[]>(resp)
}

export async function addPerson(person: Omit<Person, 'id'>): Promise<Person[]> {
  const resp = await fetch(`${BASE}/add`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(person),
  })
  return json<Person[]>(resp)
}

export async function deletePerson(payload: DeletePayload): Promise<DeleteResponse> {
  const resp = await fetch(`${BASE}/delete`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  return json<DeleteResponse>(resp)
}

export async function restorePerson(personId: string): Promise<RestoreResponse> {
  const resp = await fetch(`${BASE}/restore`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ personId }),
  })
  return json<RestoreResponse>(resp)
}

export async function emptyBin(): Promise<EmptyBinResponse> {
  const resp = await fetch(`${BASE}/empty-bin`, { method: 'POST' })
  return json<EmptyBinResponse>(resp)
}

export function exportDataUrl(format: 'csv' | 'xlsx'): string {
  return `${BASE}/export/${format}`
}

export async function reorderPeople(personIds: string[]): Promise<Person[]> {
  const resp = await fetch(`${BASE}/reorder`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ personIds }),
  })
  return json<Person[]>(resp)
}

export async function resetToOriginal(): Promise<OrgData> {
  const resp = await fetch(`${BASE}/reset`, { method: 'POST' })
  return json<OrgData>(resp)
}

export async function listSnapshots(): Promise<SnapshotInfo[]> {
  return json<SnapshotInfo[]>(await fetch(`${BASE}/snapshots`))
}

export async function saveSnapshot(name: string): Promise<SnapshotInfo[]> {
  return json<SnapshotInfo[]>(await fetch(`${BASE}/snapshots/save`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name }),
  }))
}

export async function loadSnapshot(name: string): Promise<OrgData> {
  return json<OrgData>(await fetch(`${BASE}/snapshots/load`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name }),
  }))
}

export async function deleteSnapshot(name: string): Promise<SnapshotInfo[]> {
  return json<SnapshotInfo[]>(await fetch(`${BASE}/snapshots/delete`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name }),
  }))
}

export async function writeAutosave(data: AutosaveData): Promise<void> {
  const resp = await fetch(`${BASE}/autosave`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })
  if (!resp.ok) {
    throw new Error(`Autosave failed: ${resp.status}`)
  }
}

export async function readAutosave(): Promise<AutosaveData | null> {
  const resp = await fetch(`${BASE}/autosave`)
  if (resp.status === 204) return null
  return json<AutosaveData>(resp)
}

export async function deleteAutosave(): Promise<void> {
  const resp = await fetch(`${BASE}/autosave`, { method: 'DELETE' })
  if (!resp.ok) {
    throw new Error(`Delete autosave failed: ${resp.status}`)
  }
}

export async function exportSnapshotBlob(name: string, format: 'csv' | 'xlsx'): Promise<Blob> {
  const resp = await fetch(`${BASE}/export/snapshot?name=${encodeURIComponent(name)}&format=${format}`)
  if (!resp.ok) {
    throw new Error(`Export snapshot failed: ${resp.status}`)
  }
  return resp.blob()
}

export async function uploadZipFile(file: File): Promise<UploadResponse> {
  const form = new FormData()
  form.append('file', file)
  const resp = await fetch(`${BASE}/upload/zip`, { method: 'POST', body: form })
  return json<UploadResponse>(resp)
}
