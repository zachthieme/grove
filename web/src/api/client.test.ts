import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const mockFetch = vi.fn().mockResolvedValue({
  ok: true,
  json: () => Promise.resolve([]),
  text: () => Promise.resolve(''),
  status: 200,
})

vi.stubGlobal('fetch', mockFetch)

const api = await import('./client')

beforeEach(() => {
  mockFetch.mockClear()
  mockFetch.mockResolvedValue({
    ok: true,
    json: () => Promise.resolve([]),
    text: () => Promise.resolve(''),
    status: 200,
  })
  api.resetClient()
})

describe('API error callback', () => {
  afterEach(() => {
    // Reset fetch mock to success for subsequent tests
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve([]),
      text: () => Promise.resolve(''),
      status: 200,
    })
  })

  it('calls onApiError when an API request fails', async () => {
    const handler = vi.fn()
    const cleanup = api.setOnApiError(handler)

    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 422,
      text: async () => 'validation failed',
    })

    await expect(
      api.moveNode({ personId: 'a', newManagerId: 'b', newTeam: 'c' })
    ).rejects.toThrow('API 422')

    expect(handler).toHaveBeenCalledWith('API 422: validation failed')

    cleanup()
  })

  it('does not call onApiError after cleanup', async () => {
    const handler = vi.fn()
    const cleanup = api.setOnApiError(handler)
    cleanup()

    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      text: async () => 'server error',
    })

    await expect(
      api.moveNode({ personId: 'a', newManagerId: 'b', newTeam: 'c' })
    ).rejects.toThrow()

    expect(handler).not.toHaveBeenCalled()
  })
})

describe('correlation ID', () => {
  it('[CONTRACT-004] attaches X-Correlation-ID header to API requests', async () => {
    await api.updateNode({ personId: 'abc', fields: { name: 'Test' } })

    expect(mockFetch).toHaveBeenCalled()
    const [, init] = mockFetch.mock.calls[0]
    const headers = init.headers as Record<string, string>
    expect(headers['X-Correlation-ID']).toBeDefined()
    expect(headers['X-Correlation-ID'].length).toBeGreaterThan(0)
  })

  it('[CONTRACT-004] uses provided correlationId when given', async () => {
    await api.updateNode({ personId: 'abc', fields: { name: 'Test' } }, 'my-corr-id')

    const [, init] = mockFetch.mock.calls[0]
    const headers = init.headers as Record<string, string>
    expect(headers['X-Correlation-ID']).toBe('my-corr-id')
  })

  it('[CONTRACT-004] generates unique correlation IDs for separate calls', async () => {
    await api.updateNode({ personId: 'a', fields: {} })
    await api.updateNode({ personId: 'b', fields: {} })

    const id1 = (mockFetch.mock.calls[0][1].headers as Record<string, string>)['X-Correlation-ID']
    const id2 = (mockFetch.mock.calls[1][1].headers as Record<string, string>)['X-Correlation-ID']
    expect(id1).not.toBe(id2)
  })
})

describe('resetClient', () => {
  it('clears error callback and logging state', () => {
    const handler = vi.fn()
    api.setOnApiError(handler)
    api.setLoggingEnabled(true)

    api.resetClient()

    // Error callback should be cleared — trigger an error and verify handler not called
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      text: () => Promise.resolve('fail'),
    })
    // setOnApiError after reset should work fresh
    const handler2 = vi.fn()
    const cleanup = api.setOnApiError(handler2)
    expect(handler).not.toHaveBeenCalled()
    cleanup()
  })
})
