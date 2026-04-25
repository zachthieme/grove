import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockFetch = vi.fn().mockResolvedValue({
  ok: true,
  json: () => Promise.resolve({}),
  text: () => Promise.resolve(''),
  status: 200,
})

vi.stubGlobal('fetch', mockFetch)

const api = await import('./client')

beforeEach(() => {
  mockFetch.mockClear()
  api.resetClient()
})

function postedToLogs(): Record<string, unknown> | null {
  const call = mockFetch.mock.calls.find(([url]) => String(url).endsWith('/api/logs'))
  if (!call) return null
  const init = call[1] as RequestInit | undefined
  if (!init?.body) return null
  return JSON.parse(String(init.body)) as Record<string, unknown>
}

describe('reportLog', () => {
  it('no-op when logging disabled', () => {
    api.reportLog('ERROR', 'oops')
    expect(postedToLogs()).toBeNull()
  })

  it('posts structured entry when logging enabled', () => {
    api.setLoggingEnabled(true)
    api.reportLog('ERROR', 'render exploded', {
      error: new Error('boom'),
      attrs: { boundaryLabel: 'chart view' },
    })
    const body = postedToLogs()
    expect(body).not.toBeNull()
    expect(body?.level).toBe('ERROR')
    expect(body?.message).toBe('render exploded')
    expect(body?.source).toBe('web')
    expect(String(body?.error)).toContain('boom')
    expect((body?.attrs as Record<string, unknown>)?.boundaryLabel).toBe('chart view')
  })

  it('coerces non-Error rejection reasons via String()', () => {
    api.setLoggingEnabled(true)
    api.reportLog('WARN', 'unhandled', { error: 'string-only failure' })
    const body = postedToLogs()
    expect(body?.error).toBe('string-only failure')
  })
})

describe('installGlobalErrorReporter', () => {
  it('is idempotent and reports window error events', () => {
    api.setLoggingEnabled(true)
    api.installGlobalErrorReporter()
    api.installGlobalErrorReporter() // idempotent — must not double-register
    mockFetch.mockClear()

    const ev = new ErrorEvent('error', {
      error: new Error('async crash'),
      filename: 'foo.js',
      lineno: 42,
      colno: 7,
      message: 'async crash',
    })
    window.dispatchEvent(ev)

    const logCalls = mockFetch.mock.calls.filter(([url]) => String(url).endsWith('/api/logs'))
    expect(logCalls.length).toBe(1)
    const body = JSON.parse(String((logCalls[0][1] as RequestInit).body)) as Record<string, unknown>
    expect(body.message).toBe('window.onerror')
    expect(String(body.error)).toContain('async crash')
    const attrs = body.attrs as Record<string, unknown>
    expect(attrs.filename).toBe('foo.js')
    expect(attrs.lineno).toBe(42)
    expect(attrs.colno).toBe(7)
  })
})
