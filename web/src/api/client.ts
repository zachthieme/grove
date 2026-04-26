import type { OrgData, OrgNode, MovePayload, UpdatePayload, DeletePayload, AddParentPayload, DeleteResponse, RestoreResponse, EmptyBinResponse, AddResponse, UploadResponse, SnapshotInfo, AutosaveData, PodInfo, MutationResponse, Settings, PodUpdatePayload } from './types'

const DEFAULT_TIMEOUT_MS = 30_000

export function generateCorrelationId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`
}

let loggingEnabled = false

export function setLoggingEnabled(enabled: boolean) {
  loggingEnabled = enabled
}

let telemetryDropCount = 0
export function getTelemetryDropCount(): number { return telemetryDropCount }
export function resetTelemetryDropCount(): void { telemetryDropCount = 0 }

let onApiError: ((message: string) => void) | null = null

/** Register a global callback for API errors. Returns a cleanup function. */
export function setOnApiError(handler: (message: string) => void): () => void {
  onApiError = handler
  return () => { if (onApiError === handler) onApiError = null }
}

/** Reset all module-level mutable state. Use in tests to prevent cross-test leakage. */
export function resetClient(): void {
  loggingEnabled = false
  onApiError = null
  telemetryDropCount = 0
}

function postLogEntry(entry: Record<string, unknown>): void {
  if (!loggingEnabled) return
  fetch(`${BASE}/logs`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(entry),
  }).catch((e) => {
    telemetryDropCount++
    console.warn('telemetry POST dropped', e)
  })
}

/** Report an app-level event to the backend log buffer. No-op when logging is off. */
export function reportLog(
  level: 'DEBUG' | 'INFO' | 'WARN' | 'ERROR',
  message: string,
  opts?: { error?: unknown; attrs?: Record<string, unknown>; correlationId?: string },
): void {
  const errMsg = opts?.error == null
    ? undefined
    : opts.error instanceof Error
      ? `${opts.error.message}\n${opts.error.stack ?? ''}`.trim()
      : String(opts.error)
  postLogEntry({
    timestamp: new Date().toISOString(),
    level,
    message,
    source: 'web',
    correlationId: opts?.correlationId,
    error: errMsg,
    attrs: opts?.attrs,
  })
}

let globalErrorReporterInstalled = false

/** Hook window.error + unhandledrejection so render crashes and stray promise
 * rejects show up in the in-app log viewer. Idempotent. */
export function installGlobalErrorReporter(): void {
  if (globalErrorReporterInstalled || typeof window === 'undefined') return
  globalErrorReporterInstalled = true
  window.addEventListener('error', (ev) => {
    reportLog('ERROR', 'window.onerror', {
      error: ev.error ?? ev.message,
      attrs: { filename: ev.filename, lineno: ev.lineno, colno: ev.colno },
    })
  })
  window.addEventListener('unhandledrejection', (ev) => {
    reportLog('ERROR', 'unhandledrejection', { error: ev.reason })
  })
}

const MAX_RETRIES = 1

function isRetryable(err: unknown): boolean {
  if (err instanceof DOMException && err.name === 'AbortError') return true
  if (err instanceof DOMException && err.name === 'TimeoutError') return true
  if (err instanceof TypeError) return true // network error (connection refused, etc.)
  return false
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
  const path = typeof input === 'string' ? input : input instanceof URL ? input.pathname : input.url
  const method = fetchInit.method ?? 'GET'

  headers['X-Correlation-ID'] = cid
  if (method === 'POST' || method === 'DELETE') {
    headers['X-Requested-With'] = 'XMLHttpRequest'
  }

  async function attempt(retriesLeft: number): Promise<Response> {
    const startTime = Date.now()
    const timeoutSignal = AbortSignal.timeout(timeoutMs)
    const finalInit: RequestInit = { ...fetchInit, headers, signal: timeoutSignal }
    if (fetchInit.signal) {
      finalInit.signal = AbortSignal.any([fetchInit.signal, timeoutSignal])
    }

    try {
      return await fetch(input, finalInit)
    } catch (err: unknown) {
      const durationMs = Date.now() - startTime
      const errorMsg = err instanceof Error ? err.message : String(err)
      postLogEntry({
        timestamp: new Date().toISOString(),
        correlationId: cid,
        source: 'web',
        method,
        path,
        durationMs,
        error: `fetch failed (retries left: ${retriesLeft}): ${errorMsg}`,
      })
      if (retriesLeft > 0 && isRetryable(err)) {
        return attempt(retriesLeft - 1)
      }
      throw err
    }
  }

  return attempt(MAX_RETRIES)
}

const BASE = '/api'

async function json<T>(resp: Response): Promise<T> {
  if (!resp.ok) {
    const text = await resp.text()
    const msg = `API ${resp.status}: ${text}`
    onApiError?.(msg)
    throw new Error(msg)
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
    const msg = `API ${resp.status}: ${text}`
    onApiError?.(msg)
    throw new Error(msg)
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
  level?: string
  message?: string
  correlationId?: string
  source: string
  method?: string
  path?: string
  requestBody?: unknown
  responseStatus?: number
  responseBody?: unknown
  durationMs?: number
  error?: string
  attrs?: Record<string, unknown>
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
