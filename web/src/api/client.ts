import type { OrgData, Person, MovePayload, UpdatePayload, DeletePayload, DeleteResponse, RestoreResponse, EmptyBinResponse, AddResponse, UploadResponse, SnapshotInfo, AutosaveData, PodInfo, MutationResponse, Settings } from './types'

const DEFAULT_TIMEOUT_MS = 30_000

function generateCorrelationId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`
}

let loggingEnabled = false

export function setLoggingEnabled(enabled: boolean) {
  loggingEnabled = enabled
}

function postLogEntry(entry: Record<string, unknown>): void {
  if (!loggingEnabled) return
  fetch(`${BASE}/logs`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(entry),
  }).catch(() => {})
}

function fetchWithTimeout(
  input: RequestInfo | URL,
  init?: RequestInit & { timeoutMs?: number; correlationId?: string },
): Promise<Response> {
  const { timeoutMs = DEFAULT_TIMEOUT_MS, correlationId, ...fetchInit } = init ?? {}
  const cid = correlationId ?? generateCorrelationId()

  const headers: Record<string, string> = {}
  if (fetchInit.headers) {
    if (fetchInit.headers instanceof Headers) {
      fetchInit.headers.forEach((v, k) => { headers[k] = v })
    } else if (Array.isArray(fetchInit.headers)) {
      fetchInit.headers.forEach(([k, v]) => { headers[k] = v })
    } else {
      Object.assign(headers, fetchInit.headers)
    }
  }
  headers['X-Correlation-ID'] = cid

  const timeoutSignal = AbortSignal.timeout(timeoutMs)
  const finalInit: RequestInit = { ...fetchInit, headers, signal: timeoutSignal }

  if (fetchInit.signal) {
    finalInit.signal = AbortSignal.any([fetchInit.signal, timeoutSignal])
  }

  return fetch(input, finalInit)
}

const BASE = '/api'

async function json<T>(resp: Response): Promise<T> {
  if (!resp.ok) {
    const text = await resp.text()
    throw new Error(`API ${resp.status}: ${text}`)
  }
  return resp.json() as Promise<T>
}

async function jsonWithLog<T>(
  resp: Response,
  meta: { method: string; path: string; correlationId: string; requestBody?: unknown; startTime: number },
): Promise<T> {
  const durationMs = Date.now() - meta.startTime
  if (!resp.ok) {
    const text = await resp.text()
    postLogEntry({
      timestamp: new Date().toISOString(),
      correlationId: meta.correlationId,
      source: 'web',
      method: meta.method,
      path: meta.path,
      requestBody: meta.requestBody,
      responseStatus: resp.status,
      error: text,
      durationMs,
    })
    throw new Error(`API ${resp.status}: ${text}`)
  }
  const data = await resp.json() as T
  postLogEntry({
    timestamp: new Date().toISOString(),
    correlationId: meta.correlationId,
    source: 'web',
    method: meta.method,
    path: meta.path,
    requestBody: meta.requestBody,
    responseStatus: resp.status,
    durationMs,
  })
  return data
}

export async function uploadFile(file: File): Promise<UploadResponse> {
  const form = new FormData()
  form.append('file', file)
  const resp = await fetchWithTimeout(`${BASE}/upload`, { method: 'POST', body: form, timeoutMs: 120_000 })
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

export async function getOrg(correlationId?: string): Promise<OrgData | null> {
  const cid = correlationId ?? generateCorrelationId()
  const startTime = Date.now()
  const resp = await fetchWithTimeout(`${BASE}/org`, { correlationId: cid })
  if (resp.status === 204) return null
  return jsonWithLog<OrgData>(resp, {
    method: 'GET', path: '/api/org', correlationId: cid, startTime,
  })
}

export async function movePerson(payload: MovePayload, correlationId?: string): Promise<MutationResponse> {
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

export async function updatePerson(payload: UpdatePayload, correlationId?: string): Promise<MutationResponse> {
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

export async function addPerson(person: Omit<Person, 'id'>, correlationId?: string): Promise<AddResponse> {
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

export async function deletePerson(payload: DeletePayload, correlationId?: string): Promise<DeleteResponse> {
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

export async function restorePerson(personId: string, correlationId?: string): Promise<RestoreResponse> {
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

export async function listSnapshots(): Promise<SnapshotInfo[]> {
  return json<SnapshotInfo[]>(await fetchWithTimeout(`${BASE}/snapshots`))
}

export async function saveSnapshot(name: string, correlationId?: string): Promise<SnapshotInfo[]> {
  const cid = correlationId ?? generateCorrelationId()
  const startTime = Date.now()
  const resp = await fetchWithTimeout(`${BASE}/snapshots/save`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name }),
    correlationId: cid,
  })
  return jsonWithLog<SnapshotInfo[]>(resp, {
    method: 'POST', path: '/api/snapshots/save', correlationId: cid, requestBody: { name }, startTime,
  })
}

export async function loadSnapshot(name: string, correlationId?: string): Promise<OrgData> {
  const cid = correlationId ?? generateCorrelationId()
  const startTime = Date.now()
  const resp = await fetchWithTimeout(`${BASE}/snapshots/load`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name }),
    correlationId: cid,
  })
  return jsonWithLog<OrgData>(resp, {
    method: 'POST', path: '/api/snapshots/load', correlationId: cid, requestBody: { name }, startTime,
  })
}

export async function deleteSnapshot(name: string, correlationId?: string): Promise<SnapshotInfo[]> {
  const cid = correlationId ?? generateCorrelationId()
  const startTime = Date.now()
  const resp = await fetchWithTimeout(`${BASE}/snapshots/delete`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name }),
    correlationId: cid,
  })
  return jsonWithLog<SnapshotInfo[]>(resp, {
    method: 'POST', path: '/api/snapshots/delete', correlationId: cid, requestBody: { name }, startTime,
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

export async function exportPodsSidecarBlob(): Promise<Blob | null> {
  const resp = await fetchWithTimeout(`${BASE}/export/pods-sidecar`)
  if (resp.status === 204) return null
  if (!resp.ok) throw new Error(`Export pods sidecar failed: ${resp.status}`)
  return resp.blob()
}

export async function listPods(): Promise<PodInfo[]> {
  return json<PodInfo[]>(await fetchWithTimeout(`${BASE}/pods`))
}

export async function updatePod(podId: string, fields: Record<string, string>): Promise<MutationResponse> {
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

export async function uploadZipFile(file: File): Promise<UploadResponse> {
  const form = new FormData()
  form.append('file', file)
  const resp = await fetchWithTimeout(`${BASE}/upload/zip`, { method: 'POST', body: form, timeoutMs: 120_000 })
  return json<UploadResponse>(resp)
}

export interface AppConfig {
  logging: boolean
}

export async function getConfig(): Promise<AppConfig> {
  const resp = await fetchWithTimeout(`${BASE}/config`)
  return json<AppConfig>(resp)
}

export interface LogEntry {
  id: string
  timestamp: string
  correlationId?: string
  source: string
  method: string
  path: string
  requestBody?: unknown
  responseStatus?: number
  responseBody?: unknown
  durationMs?: number
  error?: string
}

export interface LogsResponse {
  entries: LogEntry[]
  count: number
  bufferSize: number
}

export async function getLogs(params?: { correlationId?: string; source?: string; limit?: number }): Promise<LogsResponse> {
  const q = new URLSearchParams()
  if (params?.correlationId) q.set('correlationId', params.correlationId)
  if (params?.source) q.set('source', params.source)
  if (params?.limit) q.set('limit', String(params.limit))
  const qs = q.toString()
  const resp = await fetchWithTimeout(`${BASE}/logs${qs ? '?' + qs : ''}`)
  return json<LogsResponse>(resp)
}

export async function clearLogs(): Promise<void> {
  await fetchWithTimeout(`${BASE}/logs`, { method: 'DELETE' })
}

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
