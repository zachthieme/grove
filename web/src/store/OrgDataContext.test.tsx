import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act, cleanup } from '@testing-library/react'
import { OrgDataProvider, useOrgData, useOrgMutations } from './OrgDataContext'
import { UIProvider, useUI } from './UIContext'
import type { Person, OrgData, UploadResponse, SnapshotInfo, AutosaveData, Settings } from '../api/types'
import type { ReactNode } from 'react'

// Mock the API client
vi.mock('../api/client', () => ({
  readAutosave: vi.fn().mockResolvedValue(null),
  getOrg: vi.fn().mockResolvedValue(null),
  listSnapshots: vi.fn().mockResolvedValue([]),
  uploadFile: vi.fn(),
  uploadZipFile: vi.fn(),
  createOrg: vi.fn(),
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
  restoreState: vi.fn(),
  updatePod: vi.fn(),
  createPod: vi.fn(),
  updateSettings: vi.fn(),
  setOnApiError: vi.fn().mockReturnValue(() => {}),
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

// Wrapper that provides both UIProvider and OrgDataProvider
function wrapper({ children }: { children: ReactNode }) {
  return (
    <UIProvider>
      <OrgDataProvider>{children}</OrgDataProvider>
    </UIProvider>
  )
}

// Helper to capture the UI context error alongside OrgData
function useOrgDataWithError() {
  const orgData = useOrgData()
  const mutations = useOrgMutations()
  const ui = useUI()
  return { ...orgData, ...mutations, error: ui.error }
}

beforeEach(() => {
  vi.clearAllMocks()
  localStorage.clear()
  vi.mocked(api.readAutosave).mockResolvedValue(null)
  vi.mocked(api.getOrg).mockResolvedValue(null)
  vi.mocked(api.listSnapshots).mockResolvedValue([])
  vi.mocked(api.restoreState).mockResolvedValue(undefined)
  vi.mocked(api.deleteAutosave).mockResolvedValue(undefined)
})

afterEach(cleanup)

/** Render the hook and wait for the init useEffect to settle */
async function renderOrgData() {
  const result = renderHook(() => useOrgDataWithError(), { wrapper })
  // Wait for the init effect (readAutosave, getOrg, listSnapshots)
  await act(async () => {})
  return result
}

/** Set up the provider with data already loaded via upload */
async function renderLoaded() {
  const resp: UploadResponse = { status: 'ready', orgData }
  vi.mocked(api.uploadFile).mockResolvedValue(resp)
  const result = await renderOrgData()
  const file = new File(['csv'], 'test.csv', { type: 'text/csv' })
  await act(async () => { await result.result.current.upload(file) })
  return result
}

describe('OrgDataContext', () => {
  describe('useOrgData outside provider', () => {
    it('[CONTRACT-006] throws when used outside OrgDataProvider', () => {
      // Suppress console.error from React for the expected error
      const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
      expect(() => {
        renderHook(() => useOrgData())
      }).toThrow('useOrgData must be used within an OrgDataProvider')
      spy.mockRestore()
    })
  })

  describe('upload', () => {
    it('[UPLOAD-001] calls uploadFile API and sets working/original state', async () => {
      const resp: UploadResponse = { status: 'ready', orgData }
      vi.mocked(api.uploadFile).mockResolvedValue(resp)

      const { result } = await renderOrgData()
      expect(result.current.loaded).toBe(false)

      const file = new File(['csv data'], 'test.csv', { type: 'text/csv' })
      await act(async () => { await result.current.upload(file) })

      expect(api.uploadFile).toHaveBeenCalledWith(file)
      expect(result.current.loaded).toBe(true)
      expect(result.current.original).toEqual([alice, bob])
      expect(result.current.working).toEqual([alice, bob])
      expect(result.current.recycled).toEqual([])
    })

    it('[UPLOAD-006] calls uploadZipFile for .zip files', async () => {
      const resp: UploadResponse = { status: 'ready', orgData }
      vi.mocked(api.uploadZipFile).mockResolvedValue(resp)

      const { result } = await renderOrgData()
      const file = new File(['zip data'], 'data.zip', { type: 'application/zip' })
      await act(async () => { await result.current.upload(file) })

      expect(api.uploadZipFile).toHaveBeenCalledWith(file)
      expect(api.uploadFile).not.toHaveBeenCalled()
      expect(result.current.loaded).toBe(true)
    })

    it('[UPLOAD-006] sets snapshots from ZIP upload response', async () => {
      const snapshots: SnapshotInfo[] = [{ name: 'v1', timestamp: '2026-01-01T00:00:00Z' }]
      const resp: UploadResponse = { status: 'ready', orgData, snapshots }
      vi.mocked(api.uploadZipFile).mockResolvedValue(resp)

      const { result } = await renderOrgData()
      const file = new File(['zip'], 'test.zip')
      await act(async () => { await result.current.upload(file) })

      expect(result.current.snapshots).toEqual(snapshots)
    })

    it('[UPLOAD-001] sets error when upload API fails', async () => {
      vi.mocked(api.uploadFile).mockRejectedValue(new Error('network fail'))

      const { result } = await renderOrgData()
      const file = new File(['csv'], 'test.csv', { type: 'text/csv' })
      await act(async () => { await result.current.upload(file) })

      expect(result.current.loaded).toBe(false)
      expect(result.current.error).toContain('network fail')
    })

    it('[UPLOAD-002] handles needs_mapping response without loading data', async () => {
      const resp: UploadResponse = {
        status: 'needs_mapping',
        headers: ['Full Name', 'Title'],
        mapping: { name: { column: 'Full Name', confidence: 'high' } },
        preview: [['Full Name', 'Title'], ['Alice', 'VP']],
      }
      vi.mocked(api.uploadFile).mockResolvedValue(resp)

      const { result } = await renderOrgData()
      const file = new File(['csv'], 'test.csv', { type: 'text/csv' })
      await act(async () => { await result.current.upload(file) })

      expect(result.current.loaded).toBe(false)
      expect(result.current.pendingMapping).not.toBeNull()
      expect(result.current.pendingMapping!.headers).toEqual(['Full Name', 'Title'])
    })

    it('[SNAP-006] surfaces persistenceWarning as error', async () => {
      const resp: UploadResponse = {
        status: 'ready',
        orgData,
        persistenceWarning: 'Could not save',
      }
      vi.mocked(api.uploadFile).mockResolvedValue(resp)

      const { result } = await renderOrgData()
      const file = new File(['csv'], 'test.csv', { type: 'text/csv' })
      await act(async () => { await result.current.upload(file) })

      expect(result.current.loaded).toBe(true)
      expect(result.current.error).toContain('Could not save')
    })
  })

  describe('update', () => {
    it('[ORG-005] calls updatePerson API and updates working state', async () => {
      const updated = [alice, { ...bob, role: 'Senior Engineer' }]
      vi.mocked(api.updatePerson).mockResolvedValue({ working: updated, pods: [] })

      const { result } = await renderLoaded()
      await act(async () => {
        await result.current.update('b2', { role: 'Senior Engineer' })
      })

      expect(api.updatePerson).toHaveBeenCalledWith(
        { personId: 'b2', fields: { role: 'Senior Engineer' } },
        undefined,
      )
      expect(result.current.working[1].role).toBe('Senior Engineer')
    })

    it('[ORG-005] sets error when updatePerson API fails', async () => {
      vi.mocked(api.updatePerson).mockRejectedValue(new Error('update failed'))

      const { result } = await renderLoaded()
      await act(async () => {
        await result.current.update('b2', { role: 'X' })
      })

      expect(result.current.error).toContain('update failed')
      // Working state should remain unchanged
      expect(result.current.working[1].role).toBe('Engineer')
    })

    it('[CONTRACT-004] passes correlationId to API', async () => {
      vi.mocked(api.updatePerson).mockResolvedValue({ working: [alice, bob], pods: [] })

      const { result } = await renderLoaded()
      await act(async () => {
        await result.current.update('b2', { role: 'X' }, 'corr-123')
      })

      expect(api.updatePerson).toHaveBeenCalledWith(
        { personId: 'b2', fields: { role: 'X' } },
        'corr-123',
      )
    })
  })

  describe('remove', () => {
    it('[ORG-012] calls deletePerson API and updates working and recycled', async () => {
      vi.mocked(api.deletePerson).mockResolvedValue({
        working: [alice],
        recycled: [bob],
        pods: [],
      })

      const { result } = await renderLoaded()
      await act(async () => { await result.current.remove('b2') })

      expect(api.deletePerson).toHaveBeenCalledWith({ personId: 'b2' })
      expect(result.current.working).toHaveLength(1)
      expect(result.current.recycled).toHaveLength(1)
      expect(result.current.recycled[0].id).toBe('b2')
    })

    it('[ORG-012] sets error when deletePerson API fails', async () => {
      vi.mocked(api.deletePerson).mockRejectedValue(new Error('delete failed'))

      const { result } = await renderLoaded()
      await act(async () => { await result.current.remove('b2') })

      expect(result.current.error).toContain('delete failed')
      expect(result.current.working).toHaveLength(2) // unchanged
    })
  })

  describe('restore', () => {
    it('[ORG-012] calls restorePerson API and moves person from recycled back to working', async () => {
      // First delete, then restore
      vi.mocked(api.deletePerson).mockResolvedValue({
        working: [alice], recycled: [bob], pods: [],
      })
      vi.mocked(api.restorePerson).mockResolvedValue({
        working: [alice, bob], recycled: [], pods: [],
      })

      const { result } = await renderLoaded()
      await act(async () => { await result.current.remove('b2') })
      expect(result.current.recycled).toHaveLength(1)

      await act(async () => { await result.current.restore('b2') })

      expect(api.restorePerson).toHaveBeenCalledWith('b2')
      expect(result.current.working).toHaveLength(2)
      expect(result.current.recycled).toHaveLength(0)
    })

    it('[ORG-012] sets error when restorePerson API fails', async () => {
      vi.mocked(api.deletePerson).mockResolvedValue({
        working: [alice], recycled: [bob], pods: [],
      })
      vi.mocked(api.restorePerson).mockRejectedValue(new Error('restore failed'))

      const { result } = await renderLoaded()
      await act(async () => { await result.current.remove('b2') })
      await act(async () => { await result.current.restore('b2') })

      expect(result.current.error).toContain('restore failed')
    })
  })

  describe('add', () => {
    it('calls addPerson API and adds person to working', async () => {
      const carol: Person = {
        id: 'c3', name: 'Carol', role: 'Designer', discipline: 'Design',
        managerId: 'a1', team: 'Eng', additionalTeams: [], status: 'Active',
      }
      vi.mocked(api.addPerson).mockResolvedValue({
        created: carol,
        working: [alice, bob, carol],
        pods: [],
      })

      const { result } = await renderLoaded()
      const { id: _, ...personWithoutId } = carol
      await act(async () => { await result.current.add(personWithoutId) })

      expect(api.addPerson).toHaveBeenCalledWith(personWithoutId)
      expect(result.current.working).toHaveLength(3)
      expect(result.current.working[2].name).toBe('Carol')
    })

    it('sets error when addPerson API fails', async () => {
      vi.mocked(api.addPerson).mockRejectedValue(new Error('add failed'))

      const { result } = await renderLoaded()
      await act(async () => {
        await result.current.add({
          name: 'X', role: '', discipline: '', managerId: '',
          team: '', additionalTeams: [], status: 'Active',
        })
      })

      expect(result.current.error).toContain('add failed')
      expect(result.current.working).toHaveLength(2) // unchanged
    })
  })

  describe('move', () => {
    it('calls movePerson API with correct payload', async () => {
      const updated = [alice, { ...bob, managerId: '', team: 'NewTeam' }]
      vi.mocked(api.movePerson).mockResolvedValue({ working: updated, pods: [] })

      const { result } = await renderLoaded()
      await act(async () => {
        await result.current.move('b2', '', 'NewTeam')
      })

      expect(api.movePerson).toHaveBeenCalledWith(
        { personId: 'b2', newManagerId: '', newTeam: 'NewTeam' },
        undefined,
      )
      expect(result.current.working[1].team).toBe('NewTeam')
    })

    it('passes correlationId to movePerson API', async () => {
      vi.mocked(api.movePerson).mockResolvedValue({ working: [alice, bob], pods: [] })

      const { result } = await renderLoaded()
      await act(async () => {
        await result.current.move('b2', 'a1', 'Eng', 'corr-456')
      })

      expect(api.movePerson).toHaveBeenCalledWith(
        { personId: 'b2', newManagerId: 'a1', newTeam: 'Eng' },
        'corr-456',
      )
    })

    it('sets error when movePerson API fails', async () => {
      vi.mocked(api.movePerson).mockRejectedValue(new Error('move failed'))

      const { result } = await renderLoaded()
      await act(async () => {
        await result.current.move('b2', '', 'X')
      })

      expect(result.current.error).toContain('move failed')
    })
  })

  describe('reparent', () => {
    it('calls movePerson API using the new manager team', async () => {
      const updated = [alice, { ...bob, managerId: 'a1', team: 'Eng' }]
      vi.mocked(api.movePerson).mockResolvedValue({ working: updated, pods: [] })

      const { result } = await renderLoaded()
      await act(async () => {
        await result.current.reparent('b2', 'a1')
      })

      expect(api.movePerson).toHaveBeenCalledWith(
        { personId: 'b2', newManagerId: 'a1', newTeam: 'Eng' },
        undefined,
      )
    })

    it('sets error when manager not found', async () => {
      const { result } = await renderLoaded()
      await act(async () => {
        await result.current.reparent('b2', 'nonexistent-id')
      })

      expect(result.current.error).toContain('Manager not found')
      expect(api.movePerson).not.toHaveBeenCalled()
    })

    it('clears manager via updatePerson when newManagerId is empty', async () => {
      vi.mocked(api.updatePerson).mockResolvedValue({
        working: [alice, { ...bob, managerId: '' }],
        pods: [],
      })

      const { result } = await renderLoaded()
      await act(async () => {
        await result.current.reparent('b2', '')
      })

      expect(api.updatePerson).toHaveBeenCalledWith(
        { personId: 'b2', fields: { managerId: '' } },
        undefined,
      )
      expect(api.movePerson).not.toHaveBeenCalled()
    })

    it('sets error when reparent API fails', async () => {
      vi.mocked(api.movePerson).mockRejectedValue(new Error('reparent failed'))

      const { result } = await renderLoaded()
      await act(async () => {
        await result.current.reparent('b2', 'a1')
      })

      expect(result.current.error).toContain('reparent failed')
    })
  })

  describe('reorder', () => {
    it('calls reorderPeople API and updates working', async () => {
      const reordered = [bob, alice]
      vi.mocked(api.reorderPeople).mockResolvedValue({ working: reordered, pods: [] })

      const { result } = await renderLoaded()
      await act(async () => {
        await result.current.reorder(['b2', 'a1'])
      })

      expect(api.reorderPeople).toHaveBeenCalledWith(['b2', 'a1'])
      expect(result.current.working[0].id).toBe('b2')
      expect(result.current.working[1].id).toBe('a1')
    })

    it('sets error when reorder API fails', async () => {
      vi.mocked(api.reorderPeople).mockRejectedValue(new Error('reorder failed'))

      const { result } = await renderLoaded()
      await act(async () => {
        await result.current.reorder(['b2', 'a1'])
      })

      expect(result.current.error).toContain('reorder failed')
    })
  })

  describe('restoreAutosave', () => {
    it('sets state from autosave data and calls restoreState API', async () => {
      const autosaveData: AutosaveData = {
        original: [alice],
        working: [alice, bob],
        recycled: [],
        pods: [],
        originalPods: [],
        settings: { disciplineOrder: ['Eng'] },
        snapshotName: 'snap1',
        timestamp: '2026-01-01T00:00:00Z',
      }
      // Put autosave in localStorage so init picks it up
      localStorage.setItem('grove-autosave', JSON.stringify(autosaveData))

      const { result } = await renderOrgData()
      expect(result.current.autosaveAvailable).not.toBeNull()

      await act(async () => { result.current.restoreAutosave() })

      expect(result.current.loaded).toBe(true)
      expect(result.current.original).toEqual([alice])
      expect(result.current.working).toEqual([alice, bob])
      expect(result.current.currentSnapshotName).toBe('snap1')
      expect(result.current.autosaveAvailable).toBeNull()
      expect(api.restoreState).toHaveBeenCalledWith(autosaveData)
    })

    it('does nothing when no autosave is available', async () => {
      const { result } = await renderOrgData()
      await act(async () => { result.current.restoreAutosave() })

      expect(result.current.loaded).toBe(false)
      expect(api.restoreState).not.toHaveBeenCalled()
    })

    it('[AUTO-003] still restores UI state when restoreState API fails (backend sync failure)', async () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
      vi.mocked(api.restoreState).mockRejectedValue(new Error('network error'))

      const autosaveData: AutosaveData = {
        original: [alice],
        working: [alice, bob],
        recycled: [],
        snapshotName: '',
        timestamp: '2026-01-01T00:00:00Z',
      }
      localStorage.setItem('grove-autosave', JSON.stringify(autosaveData))

      const { result } = await renderOrgData()
      await act(async () => { result.current.restoreAutosave() })
      // Allow the async restoreState rejection to propagate
      await act(async () => {})

      // UI state should still be restored despite API failure
      expect(result.current.loaded).toBe(true)
      expect(result.current.working).toEqual([alice, bob])
      expect(result.current.autosaveAvailable).toBeNull()
      // No user-visible error — only a console.warn
      expect(result.current.error).toBeNull()
      expect(warnSpy).toHaveBeenCalledWith('Failed to sync restored state to backend')

      warnSpy.mockRestore()
    })
  })

  describe('dismissAutosave', () => {
    it('clears autosave from localStorage and server, resets state', async () => {
      const autosaveData: AutosaveData = {
        original: [alice],
        working: [alice, bob],
        recycled: [],
        snapshotName: '',
        timestamp: '2026-01-01T00:00:00Z',
      }
      localStorage.setItem('grove-autosave', JSON.stringify(autosaveData))

      const { result } = await renderOrgData()
      expect(result.current.autosaveAvailable).not.toBeNull()

      await act(async () => { await result.current.dismissAutosave() })

      expect(result.current.autosaveAvailable).toBeNull()
      expect(result.current.loaded).toBe(false)
      expect(result.current.working).toEqual([])
      expect(result.current.original).toEqual([])
      expect(localStorage.getItem('grove-autosave')).toBeNull()
      expect(api.deleteAutosave).toHaveBeenCalled()
    })
  })

  describe('emptyBin', () => {
    it('calls emptyBin API and clears recycled', async () => {
      vi.mocked(api.deletePerson).mockResolvedValue({
        working: [alice], recycled: [bob], pods: [],
      })
      vi.mocked(api.emptyBin).mockResolvedValue({ recycled: [] })

      const { result } = await renderLoaded()
      await act(async () => { await result.current.remove('b2') })
      expect(result.current.recycled).toHaveLength(1)

      await act(async () => { await result.current.emptyBin() })

      expect(api.emptyBin).toHaveBeenCalled()
      expect(result.current.recycled).toHaveLength(0)
    })

    it('sets error when emptyBin API fails', async () => {
      vi.mocked(api.emptyBin).mockRejectedValue(new Error('bin error'))

      const { result } = await renderLoaded()
      await act(async () => { await result.current.emptyBin() })

      expect(result.current.error).toContain('bin error')
    })
  })

  describe('snapshots', () => {
    it('saveSnapshot calls API and updates snapshot list', async () => {
      const snaps: SnapshotInfo[] = [{ name: 'v1', timestamp: '2026-01-01T00:00:00Z' }]
      vi.mocked(api.saveSnapshot).mockResolvedValue(snaps)

      const { result } = await renderLoaded()
      await act(async () => { await result.current.saveSnapshot('v1') })

      expect(api.saveSnapshot).toHaveBeenCalledWith('v1')
      expect(result.current.snapshots).toEqual(snaps)
      expect(result.current.currentSnapshotName).toBe('v1')
    })

    it('loadSnapshot calls API and updates working state', async () => {
      const carol: Person = { ...alice, id: 'c3', name: 'Carol' }
      const snapData: OrgData = { original: [alice], working: [carol] }
      vi.mocked(api.loadSnapshot).mockResolvedValue(snapData)

      const { result } = await renderLoaded()
      await act(async () => { await result.current.loadSnapshot('v1') })

      expect(api.loadSnapshot).toHaveBeenCalledWith('v1')
      expect(result.current.working).toEqual([carol])
      expect(result.current.currentSnapshotName).toBe('v1')
    })

    it('loadSnapshot with ORIGINAL_SNAPSHOT calls resetToOriginal', async () => {
      vi.mocked(api.resetToOriginal).mockResolvedValue(orgData)

      const { result } = await renderLoaded()
      await act(async () => { await result.current.loadSnapshot('__original__') })

      expect(api.resetToOriginal).toHaveBeenCalled()
      expect(api.loadSnapshot).not.toHaveBeenCalled()
      expect(result.current.currentSnapshotName).toBe('__original__')
    })

    it('deleteSnapshot calls API and updates list', async () => {
      vi.mocked(api.saveSnapshot).mockResolvedValue([{ name: 'v1', timestamp: '2026-01-01T00:00:00Z' }])
      vi.mocked(api.deleteSnapshot).mockResolvedValue([])

      const { result } = await renderLoaded()
      await act(async () => { await result.current.saveSnapshot('v1') })
      expect(result.current.snapshots).toHaveLength(1)

      await act(async () => { await result.current.deleteSnapshot('v1') })

      expect(api.deleteSnapshot).toHaveBeenCalledWith('v1')
      expect(result.current.snapshots).toHaveLength(0)
    })

    it('sets error when saveSnapshot fails', async () => {
      vi.mocked(api.saveSnapshot).mockRejectedValue(new Error('save snap error'))

      const { result } = await renderLoaded()
      await act(async () => { await result.current.saveSnapshot('v1') })

      expect(result.current.error).toContain('save snap error')
    })

    it('sets error when loadSnapshot fails', async () => {
      vi.mocked(api.loadSnapshot).mockRejectedValue(new Error('load snap error'))

      const { result } = await renderLoaded()
      await act(async () => { await result.current.loadSnapshot('v1') })

      expect(result.current.error).toContain('load snap error')
    })

    it('sets error when deleteSnapshot fails', async () => {
      vi.mocked(api.deleteSnapshot).mockRejectedValue(new Error('delete snap error'))

      const { result } = await renderLoaded()
      await act(async () => { await result.current.deleteSnapshot('v1') })

      expect(result.current.error).toContain('delete snap error')
    })
  })

  describe('confirmMapping', () => {
    it('calls confirmMapping API and sets loaded state', async () => {
      const uploadResp: UploadResponse = {
        status: 'needs_mapping',
        headers: ['Full Name'],
        mapping: { name: { column: 'Full Name', confidence: 'medium' } },
        preview: [['Full Name'], ['Alice']],
      }
      vi.mocked(api.uploadFile).mockResolvedValue(uploadResp)
      vi.mocked(api.confirmMapping).mockResolvedValue(orgData)
      vi.mocked(api.listSnapshots).mockResolvedValue([])

      const { result } = await renderOrgData()
      const file = new File(['csv'], 'test.csv', { type: 'text/csv' })
      await act(async () => { await result.current.upload(file) })
      expect(result.current.pendingMapping).not.toBeNull()

      await act(async () => {
        await result.current.confirmMapping({ name: 'Full Name' })
      })

      expect(api.confirmMapping).toHaveBeenCalledWith({ name: 'Full Name' })
      expect(result.current.loaded).toBe(true)
      expect(result.current.pendingMapping).toBeNull()
      expect(result.current.working).toEqual([alice, bob])
    })

    it('sets error when confirmMapping API fails', async () => {
      vi.mocked(api.confirmMapping).mockRejectedValue(new Error('mapping failed'))

      const uploadResp: UploadResponse = {
        status: 'needs_mapping',
        headers: ['Full Name'],
        mapping: { name: { column: 'Full Name', confidence: 'medium' } },
        preview: [['Full Name'], ['Alice']],
      }
      vi.mocked(api.uploadFile).mockResolvedValue(uploadResp)

      const { result } = await renderOrgData()
      const file = new File(['csv'], 'test.csv', { type: 'text/csv' })
      await act(async () => { await result.current.upload(file) })
      await act(async () => {
        await result.current.confirmMapping({ name: 'Full Name' })
      })

      expect(result.current.error).toContain('mapping failed')
      expect(result.current.loaded).toBe(false)
    })
  })

  describe('cancelMapping', () => {
    it('clears pending mapping', async () => {
      const uploadResp: UploadResponse = {
        status: 'needs_mapping',
        headers: ['Full Name'],
        mapping: { name: { column: 'Full Name', confidence: 'medium' } },
        preview: [['Full Name'], ['Alice']],
      }
      vi.mocked(api.uploadFile).mockResolvedValue(uploadResp)

      const { result } = await renderOrgData()
      const file = new File(['csv'], 'test.csv', { type: 'text/csv' })
      await act(async () => { await result.current.upload(file) })
      expect(result.current.pendingMapping).not.toBeNull()

      act(() => { result.current.cancelMapping() })

      expect(result.current.pendingMapping).toBeNull()
    })
  })

  describe('pods', () => {
    it('updatePod calls API and updates state', async () => {
      vi.mocked(api.updatePod).mockResolvedValue({
        working: [alice, bob],
        pods: [{ id: 'p1', name: 'Updated Pod', team: 'Eng', managerId: 'a1' }],
      })

      const { result } = await renderLoaded()
      await act(async () => {
        await result.current.updatePod('p1', { name: 'Updated Pod' })
      })

      expect(api.updatePod).toHaveBeenCalledWith('p1', { name: 'Updated Pod' })
      expect(result.current.pods).toHaveLength(1)
      expect(result.current.pods[0].name).toBe('Updated Pod')
    })

    it('createPod calls API and updates state', async () => {
      vi.mocked(api.createPod).mockResolvedValue({
        working: [alice, bob],
        pods: [{ id: 'p1', name: 'New Pod', team: 'Eng', managerId: 'a1' }],
      })

      const { result } = await renderLoaded()
      await act(async () => {
        await result.current.createPod('a1', 'New Pod', 'Eng')
      })

      expect(api.createPod).toHaveBeenCalledWith('a1', 'New Pod', 'Eng')
      expect(result.current.pods).toHaveLength(1)
    })

    it('sets error when updatePod API fails', async () => {
      vi.mocked(api.updatePod).mockRejectedValue(new Error('pod update error'))

      const { result } = await renderLoaded()
      await act(async () => {
        await result.current.updatePod('p1', { name: 'X' })
      })

      expect(result.current.error).toContain('pod update error')
    })

    it('sets error when createPod API fails', async () => {
      vi.mocked(api.createPod).mockRejectedValue(new Error('pod create error'))

      const { result } = await renderLoaded()
      await act(async () => {
        await result.current.createPod('a1', 'X', 'Eng')
      })

      expect(result.current.error).toContain('pod create error')
    })
  })

  describe('updateSettings', () => {
    it('calls updateSettings API and updates state', async () => {
      const newSettings: Settings = { disciplineOrder: ['Eng', 'Design'] }
      vi.mocked(api.updateSettings).mockResolvedValue(newSettings)

      const { result } = await renderLoaded()
      await act(async () => {
        await result.current.updateSettings(newSettings)
      })

      expect(api.updateSettings).toHaveBeenCalledWith(newSettings)
      expect(result.current.settings).toEqual(newSettings)
    })

    it('sets error when updateSettings API fails', async () => {
      vi.mocked(api.updateSettings).mockRejectedValue(new Error('settings error'))

      const { result } = await renderLoaded()
      await act(async () => {
        await result.current.updateSettings({ disciplineOrder: [] })
      })

      expect(result.current.error).toContain('settings error')
    })
  })

  describe('init effect', () => {
    it('loads org data when no autosave exists', async () => {
      vi.mocked(api.getOrg).mockResolvedValue(orgData)
      vi.mocked(api.listSnapshots).mockResolvedValue([
        { name: 'v1', timestamp: '2026-01-01T00:00:00Z' },
      ])

      const { result } = await renderOrgData()

      expect(api.getOrg).toHaveBeenCalled()
      expect(result.current.loaded).toBe(true)
      expect(result.current.working).toEqual([alice, bob])
      expect(result.current.snapshots).toHaveLength(1)
    })

    it('shows autosave banner when localStorage has autosave', async () => {
      const autosaveData: AutosaveData = {
        original: [alice],
        working: [alice, bob],
        recycled: [],
        snapshotName: '',
        timestamp: '2026-01-01T00:00:00Z',
      }
      localStorage.setItem('grove-autosave', JSON.stringify(autosaveData))

      const { result } = await renderOrgData()

      expect(result.current.autosaveAvailable).not.toBeNull()
      expect(result.current.loaded).toBe(false) // Not loaded yet, waiting for user decision
      // getOrg is called in the background so dismiss has data to fall back to
      expect(api.getOrg).toHaveBeenCalled()
    })

    it('shows autosave banner from server when no localStorage', async () => {
      const autosaveData: AutosaveData = {
        original: [alice],
        working: [alice, bob],
        recycled: [],
        snapshotName: '',
        timestamp: '2026-01-01T00:00:00Z',
      }
      vi.mocked(api.readAutosave).mockResolvedValue(autosaveData)

      const { result } = await renderOrgData()

      expect(result.current.autosaveAvailable).not.toBeNull()
      expect(api.readAutosave).toHaveBeenCalled()
      // getOrg is called in the background so dismiss has data to fall back to
      expect(api.getOrg).toHaveBeenCalled()
    })

    it('clears corrupt localStorage autosave and continues init', async () => {
      localStorage.setItem('grove-autosave', 'not valid json{{{')
      vi.mocked(api.readAutosave).mockResolvedValue(null)

      const { result } = await renderOrgData()

      expect(localStorage.getItem('grove-autosave')).toBeNull()
      expect(result.current.autosaveAvailable).toBeNull()
      // Should fall through to getOrg since autosave was corrupt
      expect(api.getOrg).toHaveBeenCalled()
    })

    it('handles getOrg failure gracefully', async () => {
      vi.mocked(api.getOrg).mockRejectedValue(new Error('server down'))

      const { result } = await renderOrgData()

      // Should stay in upload state without crashing
      expect(result.current.loaded).toBe(false)
    })

    it('handles listSnapshots failure gracefully', async () => {
      vi.mocked(api.getOrg).mockResolvedValue(orgData)
      vi.mocked(api.listSnapshots).mockRejectedValue(new Error('snap error'))

      const { result } = await renderOrgData()

      // Data should still load fine
      expect(result.current.loaded).toBe(true)
      expect(result.current.snapshots).toEqual([])
    })
  })

  describe('createOrg', () => {
    it('[CREATE-001] calls createOrg API, loads data, and returns first person id', async () => {
      const newData: OrgData = {
        original: [alice],
        working: [alice],
      }
      vi.mocked(api.createOrg).mockResolvedValue(newData)

      const { result } = await renderOrgData()
      let returnedId: string | undefined
      await act(async () => {
        returnedId = await result.current.createOrg('Alice')
      })

      expect(api.createOrg).toHaveBeenCalledWith('Alice')
      expect(result.current.loaded).toBe(true)
      expect(result.current.working).toEqual([alice])
      expect(returnedId).toBe('a1')
    })

    it('[CREATE-001] sets error and returns undefined when createOrg API fails', async () => {
      vi.mocked(api.createOrg).mockRejectedValue(new Error('create failed'))

      const { result } = await renderOrgData()
      let returnedId: string | undefined
      await act(async () => {
        returnedId = await result.current.createOrg('Alice')
      })

      expect(result.current.loaded).toBe(false)
      expect(result.current.error).toContain('create failed')
      expect(returnedId).toBeUndefined()
    })
  })

  describe('currentSnapshotName clears on mutations', () => {
    it('clears currentSnapshotName after move', async () => {
      vi.mocked(api.saveSnapshot).mockResolvedValue([{ name: 'v1', timestamp: '2026-01-01T00:00:00Z' }])
      vi.mocked(api.movePerson).mockResolvedValue({ working: [alice, bob], pods: [] })

      const { result } = await renderLoaded()
      await act(async () => { await result.current.saveSnapshot('v1') })
      expect(result.current.currentSnapshotName).toBe('v1')

      await act(async () => { await result.current.move('b2', '', 'X') })
      expect(result.current.currentSnapshotName).toBeNull()
    })

    it('clears currentSnapshotName after update', async () => {
      vi.mocked(api.saveSnapshot).mockResolvedValue([{ name: 'v1', timestamp: '2026-01-01T00:00:00Z' }])
      vi.mocked(api.updatePerson).mockResolvedValue({ working: [alice, bob], pods: [] })

      const { result } = await renderLoaded()
      await act(async () => { await result.current.saveSnapshot('v1') })
      expect(result.current.currentSnapshotName).toBe('v1')

      await act(async () => { await result.current.update('b2', { role: 'X' }) })
      expect(result.current.currentSnapshotName).toBeNull()
    })
  })
})
