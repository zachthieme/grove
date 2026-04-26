// In-app log viewer + AppConfig endpoints.

import { BASE, fetchWithTimeout, json } from './core'

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
