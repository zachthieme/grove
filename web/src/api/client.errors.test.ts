import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

const api = await import('./client')

beforeEach(() => {
  mockFetch.mockClear()
})

describe('network error', () => {
  it('updatePerson rejects with TypeError when network is down', async () => {
    mockFetch.mockRejectedValue(new TypeError('Failed to fetch'))

    await expect(
      api.updatePerson({ personId: 'abc', fields: { name: 'Test' } }),
    ).rejects.toThrow('Failed to fetch')
  })

  it('getOrg rejects with TypeError when network is down', async () => {
    mockFetch.mockRejectedValue(new TypeError('Failed to fetch'))

    await expect(api.getOrg()).rejects.toThrow(TypeError)
  })

  it('listSnapshots rejects with TypeError when network is down', async () => {
    mockFetch.mockRejectedValue(new TypeError('Failed to fetch'))

    await expect(api.listSnapshots()).rejects.toThrow('Failed to fetch')
  })
})

describe('HTTP 500 response', () => {
  beforeEach(() => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 500,
      json: () => Promise.resolve({}),
      text: () => Promise.resolve('Internal Server Error'),
    })
  })

  it('updatePerson throws with status and error body', async () => {
    await expect(
      api.updatePerson({ personId: 'abc', fields: { name: 'Test' } }),
    ).rejects.toThrow('API 500: Internal Server Error')
  })

  it('getOrg throws with status and error body', async () => {
    await expect(api.getOrg()).rejects.toThrow('API 500: Internal Server Error')
  })

  it('listSnapshots throws with status and error body', async () => {
    await expect(api.listSnapshots()).rejects.toThrow(
      'API 500: Internal Server Error',
    )
  })
})

describe('malformed JSON response', () => {
  beforeEach(() => {
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.reject(new SyntaxError('Unexpected token')),
      text: () => Promise.resolve('not json'),
    })
  })

  it('updatePerson rejects with SyntaxError on malformed JSON', async () => {
    await expect(
      api.updatePerson({ personId: 'abc', fields: { name: 'Test' } }),
    ).rejects.toThrow(SyntaxError)
  })

  it('getOrg rejects with SyntaxError on malformed JSON', async () => {
    await expect(api.getOrg()).rejects.toThrow('Unexpected token')
  })

  it('listSnapshots rejects with SyntaxError on malformed JSON', async () => {
    await expect(api.listSnapshots()).rejects.toThrow(SyntaxError)
  })
})

describe('request timeout', () => {
  it('updatePerson rejects with AbortError when request times out', async () => {
    const abortError = new DOMException('The operation was aborted', 'AbortError')
    mockFetch.mockRejectedValue(abortError)

    await expect(
      api.updatePerson({ personId: 'abc', fields: { name: 'Test' } }),
    ).rejects.toThrow('The operation was aborted')
  })

  it('getOrg rejects with AbortError when request times out', async () => {
    const abortError = new DOMException('The operation was aborted', 'AbortError')
    mockFetch.mockRejectedValue(abortError)

    await expect(api.getOrg()).rejects.toThrow(DOMException)
  })

  it('listSnapshots rejects with AbortError when request times out', async () => {
    const abortError = new DOMException('The operation was aborted', 'AbortError')
    mockFetch.mockRejectedValue(abortError)

    const result = api.listSnapshots()
    await expect(result).rejects.toThrow('The operation was aborted')
  })

  it('timeout error has AbortError name', async () => {
    const abortError = new DOMException('Signal timed out', 'AbortError')
    mockFetch.mockRejectedValue(abortError)

    try {
      await api.updatePerson({ personId: 'abc', fields: {} })
      expect.unreachable('should have thrown')
    } catch (err) {
      expect(err).toBeInstanceOf(DOMException)
      expect((err as DOMException).name).toBe('AbortError')
    }
  })
})
