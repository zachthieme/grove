// Settings get/update + sidecar export.

import type { Settings } from './types'
import { BASE, fetchWithTimeout, json } from './core'

export async function getSettings(): Promise<Settings> {
  return json<Settings>(await fetchWithTimeout(`${BASE}/settings`))
}

export async function updateSettings(settings: Settings): Promise<Settings> {
  const resp = await fetchWithTimeout(`${BASE}/settings`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(settings),
  })
  return json<Settings>(resp)
}

export async function exportSettingsSidecarBlob(): Promise<Blob | null> {
  const resp = await fetchWithTimeout(`${BASE}/export/settings-sidecar`)
  if (resp.status === 204) return null
  if (!resp.ok) throw new Error(`Export settings sidecar failed: ${resp.status}`)
  return resp.blob()
}
