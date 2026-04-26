// Shared HTTP plumbing: fetch with timeout/retry, JSON parsing, telemetry,
// correlation IDs, and the global error-reporter. Resource files (org.ts,
// pods.ts, snapshots.ts, etc.) call these helpers.

const DEFAULT_TIMEOUT_MS = 30_000

export const BASE = '/api'

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

export function postLogEntry(entry: Record<string, unknown>): void {
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

export function fetchWithTimeout(
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

export async function json<T>(resp: Response): Promise<T> {
  if (!resp.ok) {
    const text = await resp.text()
    const msg = `API ${resp.status}: ${text}`
    onApiError?.(msg)
    throw new Error(msg)
  }
  return resp.json() as Promise<T>
}

export async function jsonWithLog<T>(
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
