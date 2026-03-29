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
      api.movePerson({ personId: 'a', newManagerId: 'b', newTeam: 'c' })
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
      api.movePerson({ personId: 'a', newManagerId: 'b', newTeam: 'c' })
    ).rejects.toThrow()

    expect(handler).not.toHaveBeenCalled()
  })
})

describe('correlation ID', () => {
  it('[CONTRACT-004] attaches X-Correlation-ID header to API requests', async () => {
    await api.updatePerson({ personId: 'abc', fields: { name: 'Test' } })

    expect(mockFetch).toHaveBeenCalled()
    const [, init] = mockFetch.mock.calls[0]
    const headers = init.headers as Record<string, string>
    expect(headers['X-Correlation-ID']).toBeDefined()
    expect(headers['X-Correlation-ID'].length).toBeGreaterThan(0)
  })

  it('[CONTRACT-004] uses provided correlationId when given', async () => {
    await api.updatePerson({ personId: 'abc', fields: { name: 'Test' } }, 'my-corr-id')

    const [, init] = mockFetch.mock.calls[0]
    const headers = init.headers as Record<string, string>
    expect(headers['X-Correlation-ID']).toBe('my-corr-id')
  })

  it('[CONTRACT-004] generates unique correlation IDs for separate calls', async () => {
    await api.updatePerson({ personId: 'a', fields: {} })
    await api.updatePerson({ personId: 'b', fields: {} })

    const id1 = (mockFetch.mock.calls[0][1].headers as Record<string, string>)['X-Correlation-ID']
    const id2 = (mockFetch.mock.calls[1][1].headers as Record<string, string>)['X-Correlation-ID']
    expect(id1).not.toBe(id2)
  })
})
