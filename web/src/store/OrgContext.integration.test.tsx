import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, act, cleanup } from '@testing-library/react'
import { OrgProvider, useOrg } from './OrgContext'
import type { Person, OrgData, UploadResponse, SnapshotInfo } from '../api/types'

// Mock the API client
vi.mock('../api/client', () => ({
  readAutosave: vi.fn().mockResolvedValue(null),
  getOrg: vi.fn().mockResolvedValue(null),
  listSnapshots: vi.fn().mockResolvedValue([]),
  uploadFile: vi.fn(),
  uploadZipFile: vi.fn(),
  confirmMapping: vi.fn(),
  movePerson: vi.fn(),
  updatePerson: vi.fn(),
  addPerson: vi.fn(),
  deletePerson: vi.fn(),
  restorePerson: vi.fn(),
  emptyBin: vi.fn(),
  resetToOriginal: vi.fn(),
  saveSnapshot: vi.fn(),
  loadSnapshot: vi.fn(),
  deleteSnapshot: vi.fn(),
  deleteAutosave: vi.fn(),
  reorderPeople: vi.fn(),
}))

import * as api from '../api/client'

const alice: Person = {
  id: 'a1', name: 'Alice', role: 'VP', discipline: 'Eng',
  managerId: '', team: 'Eng', additionalTeams: [], status: 'Active',
}
const bob: Person = {
  id: 'b2', name: 'Bob', role: 'Engineer', discipline: 'Eng',
  managerId: 'a1', team: 'Platform', additionalTeams: [], status: 'Active',
}

const orgData: OrgData = {
  original: [alice, bob],
  working: [alice, bob],
}

// Helper component that exposes context for assertions
let captured: ReturnType<typeof useOrg> | null = null
function Harness() {
  captured = useOrg()
  return <div data-testid="loaded">{captured.loaded ? 'yes' : 'no'}</div>
}

function renderWithProvider() {
  return render(
    <OrgProvider>
      <Harness />
    </OrgProvider>
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  captured = null
  localStorage.clear()
  vi.mocked(api.readAutosave).mockResolvedValue(null)
  vi.mocked(api.getOrg).mockResolvedValue(null)
  vi.mocked(api.listSnapshots).mockResolvedValue([])
})

afterEach(cleanup)

describe('OrgContext integration', () => {
  describe('upload flow', () => {
    it('uploads a CSV file and sets loaded state', async () => {
      const resp: UploadResponse = { status: 'ready', orgData }
      vi.mocked(api.uploadFile).mockResolvedValue(resp)

      renderWithProvider()
      // Wait for init
      await act(async () => {})

      expect(captured!.loaded).toBe(false)

      const file = new File(['csv data'], 'test.csv', { type: 'text/csv' })
      await act(async () => {
        await captured!.upload(file)
      })

      expect(captured!.loaded).toBe(true)
      expect(captured!.original).toHaveLength(2)
      expect(captured!.working).toHaveLength(2)
      expect(captured!.original[0].name).toBe('Alice')
    })

    it('handles needs_mapping response', async () => {
      const resp: UploadResponse = {
        status: 'needs_mapping',
        headers: ['Full Name', 'Title'],
        mapping: { name: { column: 'Full Name', confidence: 'high' } },
        preview: [['Full Name', 'Title'], ['Alice', 'VP']],
      }
      vi.mocked(api.uploadFile).mockResolvedValue(resp)

      renderWithProvider()
      await act(async () => {})

      const file = new File(['csv data'], 'test.csv', { type: 'text/csv' })
      await act(async () => {
        await captured!.upload(file)
      })

      expect(captured!.loaded).toBe(false)
      expect(captured!.pendingMapping).not.toBeNull()
      expect(captured!.pendingMapping!.headers).toEqual(['Full Name', 'Title'])
    })

    it('confirm mapping loads data', async () => {
      // First trigger needs_mapping
      const uploadResp: UploadResponse = {
        status: 'needs_mapping',
        headers: ['Full Name'],
        mapping: { name: { column: 'Full Name', confidence: 'medium' } },
        preview: [['Full Name'], ['Alice']],
      }
      vi.mocked(api.uploadFile).mockResolvedValue(uploadResp)
      vi.mocked(api.confirmMapping).mockResolvedValue(orgData)
      vi.mocked(api.listSnapshots).mockResolvedValue([])

      renderWithProvider()
      await act(async () => {})

      const file = new File(['csv'], 'test.csv', { type: 'text/csv' })
      await act(async () => {
        await captured!.upload(file)
      })

      await act(async () => {
        await captured!.confirmMapping({ name: 'Full Name' })
      })

      expect(captured!.loaded).toBe(true)
      expect(captured!.pendingMapping).toBeNull()
      expect(captured!.working).toHaveLength(2)
    })

    it('ZIP upload sets snapshots', async () => {
      const snapshots: SnapshotInfo[] = [{ name: 'v1', timestamp: '2026-01-01T00:00:00Z' }]
      const resp: UploadResponse = { status: 'ready', orgData, snapshots }
      vi.mocked(api.uploadZipFile).mockResolvedValue(resp)

      renderWithProvider()
      await act(async () => {})

      const file = new File(['zip data'], 'test.zip', { type: 'application/zip' })
      await act(async () => {
        await captured!.upload(file)
      })

      expect(captured!.loaded).toBe(true)
      expect(captured!.snapshots).toHaveLength(1)
      expect(captured!.snapshots[0].name).toBe('v1')
    })

    it('upload error sets error state', async () => {
      vi.mocked(api.uploadFile).mockRejectedValue(new Error('network fail'))

      renderWithProvider()
      await act(async () => {})

      const file = new File(['csv'], 'test.csv', { type: 'text/csv' })
      await act(async () => {
        await captured!.upload(file)
      })

      expect(captured!.loaded).toBe(false)
      expect(captured!.error).toContain('network fail')
    })
  })

  describe('mutations', () => {
    async function setupLoaded() {
      const resp: UploadResponse = { status: 'ready', orgData }
      vi.mocked(api.uploadFile).mockResolvedValue(resp)
      renderWithProvider()
      await act(async () => {})
      const file = new File(['csv'], 'test.csv', { type: 'text/csv' })
      await act(async () => { await captured!.upload(file) })
    }

    it('move updates working state', async () => {
      const updated = [alice, { ...bob, managerId: '' }]
      vi.mocked(api.movePerson).mockResolvedValue({ working: updated, pods: [] })

      await setupLoaded()
      await act(async () => {
        await captured!.move('b2', '', 'Platform')
      })

      expect(captured!.working[1].managerId).toBe('')
    })

    it('update changes person fields', async () => {
      const updated = [alice, { ...bob, role: 'Senior Engineer' }]
      vi.mocked(api.updatePerson).mockResolvedValue({ working: updated, pods: [] })

      await setupLoaded()
      await act(async () => {
        await captured!.update('b2', { role: 'Senior Engineer' })
      })

      expect(captured!.working[1].role).toBe('Senior Engineer')
    })

    it('delete moves person to recycled', async () => {
      vi.mocked(api.deletePerson).mockResolvedValue({
        working: [alice],
        recycled: [bob],
        pods: [],
      })

      await setupLoaded()
      await act(async () => {
        await captured!.remove('b2')
      })

      expect(captured!.working).toHaveLength(1)
      expect(captured!.recycled).toHaveLength(1)
    })

    it('restore moves person back to working', async () => {
      vi.mocked(api.deletePerson).mockResolvedValue({ working: [alice], recycled: [bob], pods: [] })
      vi.mocked(api.restorePerson).mockResolvedValue({ working: [alice, bob], recycled: [], pods: [] })

      await setupLoaded()
      await act(async () => { await captured!.remove('b2') })
      await act(async () => { await captured!.restore('b2') })

      expect(captured!.working).toHaveLength(2)
      expect(captured!.recycled).toHaveLength(0)
    })
  })

  describe('snapshots', () => {
    async function setupLoaded() {
      const resp: UploadResponse = { status: 'ready', orgData }
      vi.mocked(api.uploadFile).mockResolvedValue(resp)
      renderWithProvider()
      await act(async () => {})
      const file = new File(['csv'], 'test.csv', { type: 'text/csv' })
      await act(async () => { await captured!.upload(file) })
    }

    it('save snapshot updates snapshot list', async () => {
      const snaps: SnapshotInfo[] = [{ name: 'v1', timestamp: '2026-01-01T00:00:00Z' }]
      vi.mocked(api.saveSnapshot).mockResolvedValue(snaps)

      await setupLoaded()
      await act(async () => {
        await captured!.saveSnapshot('v1')
      })

      expect(captured!.snapshots).toHaveLength(1)
      expect(captured!.currentSnapshotName).toBe('v1')
    })

    it('load snapshot updates working state', async () => {
      const carol: Person = { ...alice, id: 'c3', name: 'Carol' }
      const newData: OrgData = { original: orgData.original, working: [carol] }
      vi.mocked(api.loadSnapshot).mockResolvedValue(newData)

      await setupLoaded()
      await act(async () => {
        await captured!.loadSnapshot('v1')
      })

      expect(captured!.working).toHaveLength(1)
      expect(captured!.working[0].name).toBe('Carol')
      expect(captured!.currentSnapshotName).toBe('v1')
    })

    it('delete snapshot removes from list', async () => {
      vi.mocked(api.saveSnapshot).mockResolvedValue([{ name: 'v1', timestamp: '2026-01-01T00:00:00Z' }])
      vi.mocked(api.deleteSnapshot).mockResolvedValue([])

      await setupLoaded()
      await act(async () => { await captured!.saveSnapshot('v1') })
      expect(captured!.snapshots).toHaveLength(1)

      await act(async () => { await captured!.deleteSnapshot('v1') })
      expect(captured!.snapshots).toHaveLength(0)
    })
  })

  describe('selection', () => {
    it('toggleSelect single selects and deselects', async () => {
      const resp: UploadResponse = { status: 'ready', orgData }
      vi.mocked(api.uploadFile).mockResolvedValue(resp)
      renderWithProvider()
      await act(async () => {})
      await act(async () => { await captured!.upload(new File([''], 'test.csv')) })

      act(() => { captured!.toggleSelect('a1', false) })
      expect(captured!.selectedIds.has('a1')).toBe(true)
      expect(captured!.selectedId).toBe('a1')

      act(() => { captured!.toggleSelect('a1', false) })
      expect(captured!.selectedIds.size).toBe(0)
      expect(captured!.selectedId).toBeNull()
    })

    it('multi-select adds to selection', async () => {
      const resp: UploadResponse = { status: 'ready', orgData }
      vi.mocked(api.uploadFile).mockResolvedValue(resp)
      renderWithProvider()
      await act(async () => {})
      await act(async () => { await captured!.upload(new File([''], 'test.csv')) })

      act(() => { captured!.toggleSelect('a1', false) })
      act(() => { captured!.toggleSelect('b2', true) })
      expect(captured!.selectedIds.size).toBe(2)
      expect(captured!.selectedId).toBeNull() // null when multiple selected
    })

    it('clearSelection clears all', async () => {
      const resp: UploadResponse = { status: 'ready', orgData }
      vi.mocked(api.uploadFile).mockResolvedValue(resp)
      renderWithProvider()
      await act(async () => {})
      await act(async () => { await captured!.upload(new File([''], 'test.csv')) })

      act(() => { captured!.toggleSelect('a1', false) })
      act(() => { captured!.clearSelection() })
      expect(captured!.selectedIds.size).toBe(0)
    })
  })
})
