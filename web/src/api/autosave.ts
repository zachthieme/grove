// Autosave read/write/delete.

import type { AutosaveData } from './types'
import { BASE, fetchWithTimeout, json } from './core'

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
