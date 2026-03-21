import type { OrgData, Person, MovePayload, UpdatePayload, DeletePayload } from './types'

const BASE = '/api'

async function json<T>(resp: Response): Promise<T> {
  if (!resp.ok) {
    const text = await resp.text()
    throw new Error(`API ${resp.status}: ${text}`)
  }
  return resp.json() as Promise<T>
}

export async function uploadFile(file: File): Promise<OrgData> {
  const form = new FormData()
  form.append('file', file)
  const resp = await fetch(`${BASE}/upload`, { method: 'POST', body: form })
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

export async function deletePerson(payload: DeletePayload): Promise<Person[]> {
  const resp = await fetch(`${BASE}/delete`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  return json<Person[]>(resp)
}

export function exportDataUrl(format: 'csv' | 'xlsx'): string {
  return `${BASE}/export?format=${format}`
}
