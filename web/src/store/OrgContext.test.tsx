import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, act, cleanup } from '@testing-library/react'
import { OrgProvider, useOrgData, useOrgMutations, useUI, useSelection } from './OrgContext'
import type { OrgDataStateValue, OrgMutationsValue, UIContextValue, SelectionContextValue } from './orgTypes'
import type { OrgNode, OrgData, UploadResponse, SnapshotInfo } from '../api/types'

// Mock the API client
vi.mock('../api/client', () => ({
  readAutosave: vi.fn().mockResolvedValue(null),
  getOrg: vi.fn().mockResolvedValue(null),
  listSnapshots: vi.fn().mockResolvedValue([]),
  uploadFile: vi.fn(),
  uploadZipFile: vi.fn(),
  confirmMapping: vi.fn(),
  moveNode: vi.fn(),
  updateNode: vi.fn(),
  addNode: vi.fn(),
  deleteNode: vi.fn(),
  restoreNode: vi.fn(),
  emptyBin: vi.fn(),
  resetToOriginal: vi.fn(),
  saveSnapshot: vi.fn(),
  loadSnapshot: vi.fn(),
  deleteSnapshot: vi.fn(),
  deleteAutosave: vi.fn(),
  reorderPeople: vi.fn(),
  setOnApiError: vi.fn().mockReturnValue(() => {}),
}))

import * as api from '../api/client'

const alice: OrgNode = {
  id: 'a1', name: 'Alice', role: 'VP', discipline: 'Eng',
  managerId: '', team: 'Eng', additionalTeams: [], status: 'Active',
}
const bob: OrgNode = {
  id: 'b2', name: 'Bob', role: 'Engineer', discipline: 'Eng',
  managerId: 'a1', team: 'Platform', additionalTeams: [], status: 'Active',
}
const carol: OrgNode = {
  id: 'c3', name: 'Carol', role: 'Designer', discipline: 'Design',
  managerId: 'a1', team: 'Design', additionalTeams: [], status: 'Active',
}

const orgData: OrgData = {
  original: [alice, bob],
  working: [alice, bob],
}

const threePersonOrgData: OrgData = {
  original: [alice, bob, carol],
  working: [alice, bob, carol],
}

// Helper component that exposes context for assertions
type CapturedContext = OrgDataStateValue & OrgMutationsValue & UIContextValue & SelectionContextValue
let captured: CapturedContext | null = null
function Harness() {
  const data = useOrgData()
  const mutations = useOrgMutations()
  const ui = useUI()
  const selection = useSelection()
  captured = { ...data, ...mutations, ...ui, ...selection }
  return <div data-testid="loaded">{data.loaded ? 'yes' : 'no'}</div>
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
    it('[UPLOAD-001] uploads a CSV file and sets loaded state', async () => {
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

    it('[UPLOAD-002] handles needs_mapping response', async () => {
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

    it('[UPLOAD-002] confirm mapping loads data', async () => {
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

    it('[UPLOAD-006] ZIP upload sets snapshots', async () => {
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

    it('[UPLOAD-001] upload error sets error state', async () => {
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

    it('[ORG-001] move updates working state', async () => {
      const updated = [alice, { ...bob, managerId: '' }]
      vi.mocked(api.moveNode).mockResolvedValue({ working: updated, pods: [] })

      await setupLoaded()
      await act(async () => {
        await captured!.move('b2', '', 'Platform')
      })

      expect(captured!.working[1].managerId).toBe('')
    })

    it('[ORG-005] update changes person fields', async () => {
      const updated = [alice, { ...bob, role: 'Senior Engineer' }]
      vi.mocked(api.updateNode).mockResolvedValue({ working: updated, pods: [] })

      await setupLoaded()
      await act(async () => {
        await captured!.update('b2', { role: 'Senior Engineer' })
      })

      expect(captured!.working[1].role).toBe('Senior Engineer')
    })

    it('[ORG-012] delete moves person to recycled', async () => {
      vi.mocked(api.deleteNode).mockResolvedValue({
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

    it('[ORG-012] restore moves person back to working', async () => {
      vi.mocked(api.deleteNode).mockResolvedValue({ working: [alice], recycled: [bob], pods: [] })
      vi.mocked(api.restoreNode).mockResolvedValue({ working: [alice, bob], recycled: [], pods: [] })

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

    it('[SNAP-001] save snapshot updates snapshot list', async () => {
      const snaps: SnapshotInfo[] = [{ name: 'v1', timestamp: '2026-01-01T00:00:00Z' }]
      vi.mocked(api.saveSnapshot).mockResolvedValue(snaps)

      await setupLoaded()
      await act(async () => {
        await captured!.saveSnapshot('v1')
      })

      expect(captured!.snapshots).toHaveLength(1)
      expect(captured!.currentSnapshotName).toBe('v1')
    })

    it('[SNAP-002] load snapshot updates working state', async () => {
      const carol: OrgNode = { ...alice, id: 'c3', name: 'Carol' }
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

    it('[SNAP-007] delete snapshot removes from list', async () => {
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
    it('[SELECT-001] toggleSelect single selects and replaces', async () => {
      const resp: UploadResponse = { status: 'ready', orgData }
      vi.mocked(api.uploadFile).mockResolvedValue(resp)
      renderWithProvider()
      await act(async () => {})
      await act(async () => { await captured!.upload(new File([''], 'test.csv')) })

      act(() => { captured!.toggleSelect('a1', false) })
      expect(captured!.selectedIds.has('a1')).toBe(true)
      expect(captured!.selectedId).toBe('a1')

      // [SELECT-002] clicking same node is a no-op (does not deselect)
      act(() => { captured!.toggleSelect('a1', false) })
      expect(captured!.selectedIds.has('a1')).toBe(true)
      expect(captured!.selectedId).toBe('a1')

      // Selecting a different node replaces the selection
      act(() => { captured!.toggleSelect('b2', false) })
      expect(captured!.selectedIds.has('b2')).toBe(true)
      expect(captured!.selectedIds.has('a1')).toBe(false)
      expect(captured!.selectedId).toBe('b2')
    })

    it('[SELECT-001] multi-select adds to selection', async () => {
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

    it('[SELECT-001] clearSelection clears all', async () => {
      const resp: UploadResponse = { status: 'ready', orgData }
      vi.mocked(api.uploadFile).mockResolvedValue(resp)
      renderWithProvider()
      await act(async () => {})
      await act(async () => { await captured!.upload(new File([''], 'test.csv')) })

      act(() => { captured!.toggleSelect('a1', false) })
      act(() => { captured!.clearSelection() })
      expect(captured!.selectedIds.size).toBe(0)
    })

    it('[SELECT-001] prunes stale IDs when a selected person is deleted', async () => {
      const resp: UploadResponse = { status: 'ready', orgData: threePersonOrgData }
      vi.mocked(api.uploadFile).mockResolvedValue(resp)
      renderWithProvider()
      await act(async () => {})
      await act(async () => { await captured!.upload(new File([''], 'test.csv')) })

      // Select all three
      act(() => { captured!.batchSelect(new Set(['a1', 'b2', 'c3'])) })
      expect(captured!.selectedIds.size).toBe(3)

      // Delete carol — selectedIds should drop to 2
      vi.mocked(api.deleteNode).mockResolvedValue({
        working: [alice, bob],
        recycled: [carol],
        pods: [],
      })
      await act(async () => { await captured!.remove('c3') })

      expect(captured!.selectedIds.size).toBe(2)
      expect(captured!.selectedIds.has('a1')).toBe(true)
      expect(captured!.selectedIds.has('b2')).toBe(true)
      expect(captured!.selectedIds.has('c3')).toBe(false)
    })

    it('[SELECT-001] clears selection when all selected people are deleted', async () => {
      const resp: UploadResponse = { status: 'ready', orgData }
      vi.mocked(api.uploadFile).mockResolvedValue(resp)
      renderWithProvider()
      await act(async () => {})
      await act(async () => { await captured!.upload(new File([''], 'test.csv')) })

      // Select both
      act(() => { captured!.batchSelect(new Set(['a1', 'b2'])) })
      expect(captured!.selectedIds.size).toBe(2)

      // Delete both
      vi.mocked(api.deleteNode).mockResolvedValue({
        working: [bob],
        recycled: [alice],
        pods: [],
      })
      await act(async () => { await captured!.remove('a1') })
      expect(captured!.selectedIds.size).toBe(1)
      expect(captured!.selectedIds.has('b2')).toBe(true)

      vi.mocked(api.deleteNode).mockResolvedValue({
        working: [],
        recycled: [alice, bob],
        pods: [],
      })
      await act(async () => { await captured!.remove('b2') })
      expect(captured!.selectedIds.size).toBe(0)
    })

    it('[SELECT-007] preserves a selected pod collapseKey across a working update', async () => {
      const resp: UploadResponse = { status: 'ready', orgData: threePersonOrgData }
      vi.mocked(api.uploadFile).mockResolvedValue(resp)
      renderWithProvider()
      await act(async () => {})
      await act(async () => { await captured!.upload(new File([''], 'test.csv')) })

      // Select a pod via its synthetic collapseKey (no person id matches "pod:...").
      act(() => { captured!.batchSelect(new Set(['pod:a1:Alpha'])) })
      expect(captured!.selectedIds.has('pod:a1:Alpha')).toBe(true)

      // A vim-style mutation triggers a working update (here: deleting an unrelated person).
      vi.mocked(api.deleteNode).mockResolvedValue({
        working: [alice, bob],
        recycled: [carol],
        pods: [],
      })
      await act(async () => { await captured!.remove('c3') })

      // The pod selection must survive: synthetic keys are not in working, but they're valid.
      expect(captured!.selectedIds.has('pod:a1:Alpha')).toBe(true)
      expect(captured!.selectedIds.size).toBe(1)
    })

    it('[SELECT-007] keeps synthetic keys and prunes stale person ids together', async () => {
      const resp: UploadResponse = { status: 'ready', orgData: threePersonOrgData }
      vi.mocked(api.uploadFile).mockResolvedValue(resp)
      renderWithProvider()
      await act(async () => {})
      await act(async () => { await captured!.upload(new File([''], 'test.csv')) })

      // Mixed: one real person + one synthetic group key.
      act(() => { captured!.batchSelect(new Set(['c3', 'team:a1:Eng'])) })
      expect(captured!.selectedIds.size).toBe(2)

      vi.mocked(api.deleteNode).mockResolvedValue({
        working: [alice, bob],
        recycled: [carol],
        pods: [],
      })
      await act(async () => { await captured!.remove('c3') })

      // Stale person UUID removed, synthetic team key retained.
      expect(captured!.selectedIds.has('c3')).toBe(false)
      expect(captured!.selectedIds.has('team:a1:Eng')).toBe(true)
    })
  })
})
