import { describe, it, expect, vi, beforeEach } from 'vitest'

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

describe('correlation ID', () => {
  it('attaches X-Correlation-ID header to API requests', async () => {
    await api.updatePerson({ personId: 'abc', fields: { name: 'Test' } })

    expect(mockFetch).toHaveBeenCalled()
    const [, init] = mockFetch.mock.calls[0]
    const headers = init.headers as Record<string, string>
    expect(headers['X-Correlation-ID']).toBeDefined()
    expect(headers['X-Correlation-ID'].length).toBeGreaterThan(0)
  })

  it('uses provided correlationId when given', async () => {
    await api.updatePerson({ personId: 'abc', fields: { name: 'Test' } }, 'my-corr-id')

    const [, init] = mockFetch.mock.calls[0]
    const headers = init.headers as Record<string, string>
    expect(headers['X-Correlation-ID']).toBe('my-corr-id')
  })

  it('generates unique correlation IDs for separate calls', async () => {
    await api.updatePerson({ personId: 'a', fields: {} })
    await api.updatePerson({ personId: 'b', fields: {} })

    const id1 = (mockFetch.mock.calls[0][1].headers as Record<string, string>)['X-Correlation-ID']
    const id2 = (mockFetch.mock.calls[1][1].headers as Record<string, string>)['X-Correlation-ID']
    expect(id1).not.toBe(id2)
  })
})
