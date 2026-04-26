// File upload + column-mapping confirmation. Filename `imports.ts` (not
// `import.ts`) because TypeScript reserves `import` and bundlers can choke
// on the bare name.

import type { OrgData, UploadResponse } from './types'
import { BASE, fetchWithTimeout, generateCorrelationId, json, jsonWithLog } from './core'

export async function uploadFile(file: File): Promise<UploadResponse> {
  const form = new FormData()
  form.append('file', file)
  const resp = await fetchWithTimeout(`${BASE}/upload`, { method: 'POST', body: form, timeoutMs: 120_000 })
  return json<UploadResponse>(resp)
}

export async function uploadZipFile(file: File): Promise<UploadResponse> {
  const form = new FormData()
  form.append('file', file)
  const resp = await fetchWithTimeout(`${BASE}/upload/zip`, { method: 'POST', body: form, timeoutMs: 120_000 })
  return json<UploadResponse>(resp)
}

export async function confirmMapping(mapping: Record<string, string>, correlationId?: string): Promise<OrgData> {
  const cid = correlationId ?? generateCorrelationId()
  const startTime = Date.now()
  const resp = await fetchWithTimeout(`${BASE}/upload/confirm`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ mapping }),
    correlationId: cid,
  })
  return jsonWithLog<OrgData>(resp, {
    method: 'POST', path: '/api/upload/confirm', correlationId: cid, requestBody: { mapping }, startTime,
  })
}
