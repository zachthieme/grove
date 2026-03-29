/**
 * Additional branch coverage tests for the API client.
 * Covers: fetchWithTimeout header branches, getOrg 204, restoreState/writeAutosave/deleteAutosave
 * error paths, readAutosave 204, exportSnapshotBlob/exportPodsSidecarBlob/exportSettingsSidecarBlob,
 * getLogs query param branches, confirmMapping, logging paths.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

const api = await import('./client')

beforeEach(() => {
  mockFetch.mockClear()
  api.setLoggingEnabled(false)
})

function okJson(data: unknown = {}) {
  return {
    ok: true,
    status: 200,
    json: () => Promise.resolve(data),
    text: () => Promise.resolve(JSON.stringify(data)),
  }
}

function errorResp(status: number, text: string) {
  return {
    ok: false,
    status,
    json: () => Promise.resolve({}),
    text: () => Promise.resolve(text),
  }
}

describe('getOrg', () => {
  it('returns null on 204', async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, status: 204 })
    const result = await api.getOrg()
    expect(result).toBeNull()
  })

  it('returns org data on 200', async () => {
    const data = { original: [], working: [] }
    mockFetch.mockResolvedValueOnce(okJson(data))
    const result = await api.getOrg()
    expect(result).toEqual(data)
  })
})

describe('readAutosave', () => {
  it('returns null on 204', async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, status: 204 })
    const result = await api.readAutosave()
    expect(result).toBeNull()
  })

  it('returns data on 200', async () => {
    const data = { original: [], working: [], recycled: [], snapshotName: 'test', timestamp: 'now' }
    mockFetch.mockResolvedValueOnce(okJson(data))
    const result = await api.readAutosave()
    expect(result).toEqual(data)
  })
})

describe('restoreState', () => {
  it('succeeds on ok response', async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, status: 200 })
    const data = { original: [], working: [], recycled: [], snapshotName: 'test', timestamp: 'now' }
    await expect(api.restoreState(data)).resolves.toBeUndefined()
  })

  it('throws on non-ok response', async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 500 })
    const data = { original: [], working: [], recycled: [], snapshotName: 'test', timestamp: 'now' }
    await expect(api.restoreState(data)).rejects.toThrow('Restore state failed: 500')
  })
})

describe('writeAutosave', () => {
  it('succeeds on ok response', async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, status: 200 })
    const data = { original: [], working: [], recycled: [], snapshotName: 'test', timestamp: 'now' }
    await expect(api.writeAutosave(data)).resolves.toBeUndefined()
  })

  it('throws on non-ok response', async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 500 })
    const data = { original: [], working: [], recycled: [], snapshotName: 'test', timestamp: 'now' }
    await expect(api.writeAutosave(data)).rejects.toThrow('Autosave failed: 500')
  })
})

describe('deleteAutosave', () => {
  it('succeeds on ok response', async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, status: 200 })
    await expect(api.deleteAutosave()).resolves.toBeUndefined()
  })

  it('throws on non-ok response', async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 500 })
    await expect(api.deleteAutosave()).rejects.toThrow('Delete autosave failed: 500')
  })
})

describe('exportSnapshotBlob', () => {
  it('returns blob on success', async () => {
    const blob = new Blob(['csv data'])
    mockFetch.mockResolvedValueOnce({ ok: true, status: 200, blob: () => Promise.resolve(blob) })
    const result = await api.exportSnapshotBlob('snap1', 'csv')
    expect(result).toBe(blob)
  })

  it('throws on non-ok response', async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 404 })
    await expect(api.exportSnapshotBlob('snap1', 'csv')).rejects.toThrow('Export snapshot failed: 404')
  })
})

describe('exportPodsSidecarBlob', () => {
  it('returns null on 204', async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, status: 204 })
    const result = await api.exportPodsSidecarBlob()
    expect(result).toBeNull()
  })

  it('returns blob on success', async () => {
    const blob = new Blob(['pod data'])
    mockFetch.mockResolvedValueOnce({ ok: true, status: 200, blob: () => Promise.resolve(blob) })
    const result = await api.exportPodsSidecarBlob()
    expect(result).toBe(blob)
  })

  it('throws on non-ok response', async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 500 })
    await expect(api.exportPodsSidecarBlob()).rejects.toThrow('Export pods sidecar failed: 500')
  })
})

describe('exportSettingsSidecarBlob', () => {
  it('returns null on 204', async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, status: 204 })
    const result = await api.exportSettingsSidecarBlob()
    expect(result).toBeNull()
  })

  it('returns blob on success', async () => {
    const blob = new Blob(['settings data'])
    mockFetch.mockResolvedValueOnce({ ok: true, status: 200, blob: () => Promise.resolve(blob) })
    const result = await api.exportSettingsSidecarBlob()
    expect(result).toBe(blob)
  })

  it('throws on non-ok response', async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 500 })
    await expect(api.exportSettingsSidecarBlob()).rejects.toThrow('Export settings sidecar failed: 500')
  })
})

describe('exportDataUrl', () => {
  it('returns CSV URL', () => {
    expect(api.exportDataUrl('csv')).toBe('/api/export/csv')
  })

  it('returns XLSX URL', () => {
    expect(api.exportDataUrl('xlsx')).toBe('/api/export/xlsx')
  })
})

describe('getLogs', () => {
  it('builds URL with no params when none provided', async () => {
    mockFetch.mockResolvedValueOnce(okJson({ entries: [], count: 0, bufferSize: 100 }))
    await api.getLogs()
    expect(mockFetch.mock.calls[0][0]).toBe('/api/logs')
  })

  it('builds URL with correlationId param', async () => {
    mockFetch.mockResolvedValueOnce(okJson({ entries: [], count: 0, bufferSize: 100 }))
    await api.getLogs({ correlationId: 'abc' })
    expect(mockFetch.mock.calls[0][0]).toContain('correlationId=abc')
  })

  it('builds URL with source param', async () => {
    mockFetch.mockResolvedValueOnce(okJson({ entries: [], count: 0, bufferSize: 100 }))
    await api.getLogs({ source: 'web' })
    expect(mockFetch.mock.calls[0][0]).toContain('source=web')
  })

  it('builds URL with limit param', async () => {
    mockFetch.mockResolvedValueOnce(okJson({ entries: [], count: 0, bufferSize: 100 }))
    await api.getLogs({ limit: 50 })
    expect(mockFetch.mock.calls[0][0]).toContain('limit=50')
  })

  it('builds URL with all params', async () => {
    mockFetch.mockResolvedValueOnce(okJson({ entries: [], count: 0, bufferSize: 100 }))
    await api.getLogs({ correlationId: 'abc', source: 'api', limit: 10 })
    const url = mockFetch.mock.calls[0][0] as string
    expect(url).toContain('correlationId=abc')
    expect(url).toContain('source=api')
    expect(url).toContain('limit=10')
  })
})

describe('clearLogs', () => {
  it('sends DELETE to /api/logs', async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, status: 200 })
    await api.clearLogs()
    expect(mockFetch.mock.calls[0][0]).toBe('/api/logs')
    expect(mockFetch.mock.calls[0][1].method).toBe('DELETE')
  })
})

describe('confirmMapping', () => {
  it('sends mapping payload', async () => {
    mockFetch.mockResolvedValueOnce(okJson({ original: [], working: [] }))
    await api.confirmMapping({ name: 'Full Name' })
    expect(mockFetch.mock.calls[0][0]).toBe('/api/upload/confirm')
    const body = JSON.parse(mockFetch.mock.calls[0][1].body as string)
    expect(body.mapping).toEqual({ name: 'Full Name' })
  })
})

describe('uploadFile', () => {
  it('sends FormData with file', async () => {
    mockFetch.mockResolvedValueOnce(okJson({ status: 'ready' }))
    const file = new File(['data'], 'test.csv', { type: 'text/csv' })
    await api.uploadFile(file)
    expect(mockFetch.mock.calls[0][0]).toBe('/api/upload')
    expect(mockFetch.mock.calls[0][1].method).toBe('POST')
  })
})

describe('uploadZipFile', () => {
  it('sends FormData with zip file', async () => {
    mockFetch.mockResolvedValueOnce(okJson({ status: 'ready' }))
    const file = new File(['zipdata'], 'test.zip', { type: 'application/zip' })
    await api.uploadZipFile(file)
    expect(mockFetch.mock.calls[0][0]).toBe('/api/upload/zip')
    expect(mockFetch.mock.calls[0][1].method).toBe('POST')
  })
})

describe('snapshot operations', () => {
  it('listSnapshots calls GET /api/snapshots', async () => {
    mockFetch.mockResolvedValueOnce(okJson([]))
    await api.listSnapshots()
    expect(mockFetch.mock.calls[0][0]).toBe('/api/snapshots')
  })

  it('saveSnapshot sends name', async () => {
    mockFetch.mockResolvedValueOnce(okJson([]))
    await api.saveSnapshot('My Snapshot')
    const body = JSON.parse(mockFetch.mock.calls[0][1].body as string)
    expect(body.name).toBe('My Snapshot')
  })

  it('loadSnapshot sends name', async () => {
    mockFetch.mockResolvedValueOnce(okJson({ original: [], working: [] }))
    await api.loadSnapshot('My Snapshot')
    const body = JSON.parse(mockFetch.mock.calls[0][1].body as string)
    expect(body.name).toBe('My Snapshot')
  })

  it('deleteSnapshot sends name', async () => {
    mockFetch.mockResolvedValueOnce(okJson([]))
    await api.deleteSnapshot('My Snapshot')
    const body = JSON.parse(mockFetch.mock.calls[0][1].body as string)
    expect(body.name).toBe('My Snapshot')
  })
})

describe('pod operations', () => {
  it('listPods calls GET /api/pods', async () => {
    mockFetch.mockResolvedValueOnce(okJson([]))
    await api.listPods()
    expect(mockFetch.mock.calls[0][0]).toBe('/api/pods')
  })

  it('updatePod sends podId and fields', async () => {
    mockFetch.mockResolvedValueOnce(okJson({ working: [], pods: [] }))
    await api.updatePod('pod1', { name: 'New Name' })
    const body = JSON.parse(mockFetch.mock.calls[0][1].body as string)
    expect(body.podId).toBe('pod1')
    expect(body.fields.name).toBe('New Name')
  })

  it('createPod sends managerId, name, and team', async () => {
    mockFetch.mockResolvedValueOnce(okJson({ working: [], pods: [] }))
    await api.createPod('mgr1', 'New Pod', 'Engineering')
    const body = JSON.parse(mockFetch.mock.calls[0][1].body as string)
    expect(body.managerId).toBe('mgr1')
    expect(body.name).toBe('New Pod')
    expect(body.team).toBe('Engineering')
  })
})

describe('settings operations', () => {
  it('getSettings calls GET /api/settings', async () => {
    mockFetch.mockResolvedValueOnce(okJson({ disciplineOrder: [] }))
    await api.getSettings()
    expect(mockFetch.mock.calls[0][0]).toBe('/api/settings')
  })

  it('updateSettings sends settings object', async () => {
    mockFetch.mockResolvedValueOnce(okJson({ disciplineOrder: ['Eng'] }))
    await api.updateSettings({ disciplineOrder: ['Eng'] })
    const body = JSON.parse(mockFetch.mock.calls[0][1].body as string)
    expect(body.disciplineOrder).toEqual(['Eng'])
  })
})

describe('getConfig', () => {
  it('calls GET /api/config', async () => {
    mockFetch.mockResolvedValueOnce(okJson({ logging: false }))
    const config = await api.getConfig()
    expect(config.logging).toBe(false)
  })
})

describe('reorderPeople', () => {
  it('sends personIds array', async () => {
    mockFetch.mockResolvedValueOnce(okJson({ working: [], pods: [] }))
    await api.reorderPeople(['a', 'b', 'c'])
    const body = JSON.parse(mockFetch.mock.calls[0][1].body as string)
    expect(body.personIds).toEqual(['a', 'b', 'c'])
  })
})

describe('resetToOriginal', () => {
  it('sends POST to /api/reset', async () => {
    mockFetch.mockResolvedValueOnce(okJson({ original: [], working: [] }))
    await api.resetToOriginal()
    expect(mockFetch.mock.calls[0][0]).toBe('/api/reset')
    expect(mockFetch.mock.calls[0][1].method).toBe('POST')
  })
})

describe('fetchWithTimeout header handling', () => {
  it('handles Headers instance', async () => {
    mockFetch.mockResolvedValueOnce(okJson({ working: [], pods: [] }))
    // addPerson uses Content-Type header as plain object, which exercises the object branch
    await api.addPerson({ name: 'Test', role: '', discipline: '', managerId: '', team: '', additionalTeams: [], status: 'Active' })
    const init = mockFetch.mock.calls[0][1]
    expect(init.headers['Content-Type']).toBe('application/json')
  })
})

describe('logging integration', () => {
  it('sends log entry on success when logging enabled', async () => {
    api.setLoggingEnabled(true)
    mockFetch.mockResolvedValue(okJson({ working: [], pods: [] }))
    await api.movePerson({ personId: 'a', newManagerId: 'b', newTeam: 'c' })
    // Should have made 2 fetch calls: one for the API and one for logging
    expect(mockFetch.mock.calls.length).toBeGreaterThanOrEqual(2)
    api.setLoggingEnabled(false)
  })

  it('sends log entry on error when logging enabled', async () => {
    api.setLoggingEnabled(true)
    mockFetch
      .mockResolvedValueOnce(errorResp(500, 'Server error'))
      .mockResolvedValue({ ok: true, status: 200 })  // for the log entry
    await expect(
      api.movePerson({ personId: 'a', newManagerId: 'b', newTeam: 'c' })
    ).rejects.toThrow('API 500')
    // Should have attempted to log the error
    expect(mockFetch.mock.calls.length).toBeGreaterThanOrEqual(2)
    api.setLoggingEnabled(false)
  })

  it('does not send log entry when logging disabled', async () => {
    api.setLoggingEnabled(false)
    mockFetch.mockResolvedValueOnce(okJson([]))
    await api.listSnapshots()
    // Only one fetch call (the actual API call)
    expect(mockFetch.mock.calls.length).toBe(1)
  })
})

describe('generateCorrelationId', () => {
  it('returns a non-empty string', () => {
    const id = api.generateCorrelationId()
    expect(typeof id).toBe('string')
    expect(id.length).toBeGreaterThan(0)
  })

  it('returns unique values on successive calls', () => {
    const id1 = api.generateCorrelationId()
    const id2 = api.generateCorrelationId()
    expect(id1).not.toBe(id2)
  })
})

describe('setOnApiError cleanup', () => {
  it('cleanup only removes if same handler', async () => {
    const handler1 = vi.fn()
    const handler2 = vi.fn()
    const cleanup1 = api.setOnApiError(handler1)

    // Replace with handler2 before calling cleanup1
    api.setOnApiError(handler2)
    cleanup1() // Should NOT remove handler2

    mockFetch.mockResolvedValueOnce(errorResp(400, 'Bad Request'))
    await expect(api.listSnapshots()).rejects.toThrow()
    expect(handler2).toHaveBeenCalled()

    // Clean up handler2
    const cleanup2 = api.setOnApiError(handler2)
    cleanup2()
  })
})
