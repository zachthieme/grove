import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import DetailSidebar from './DetailSidebar'
import { makePerson } from '../test-helpers'
import type { Person } from '../api/types'

// --- Test fixtures ---

const alice = makePerson({ id: 'a1', name: 'Alice Smith', role: 'VP', managerId: '', team: 'Platform', discipline: 'Eng', employmentType: 'FTE' })
const bob = makePerson({ id: 'b2', name: 'Bob Jones', role: 'Engineer', managerId: 'a1', team: 'Platform', discipline: 'Eng', employmentType: 'FTE' })
const carol = makePerson({ id: 'c3', name: 'Carol White', role: 'Designer', managerId: 'a1', team: 'Design', discipline: 'Design', employmentType: 'FTE' })

// --- Mock useOrg ---

const mockOrg = {
  working: [alice, bob] as Person[],
  original: [alice, bob] as Person[],
  recycled: [] as Person[],
  loaded: true,
  viewMode: 'detail' as const,
  dataView: 'working' as const,
  selectedId: null as string | null,
  selectedIds: new Set<string>(),
  binOpen: false,
  layoutKey: 0,
  headPersonId: null as string | null,
  hiddenEmploymentTypes: new Set<string>(),
  pendingMapping: null,
  snapshots: [] as [],
  currentSnapshotName: null as string | null,
  autosaveAvailable: null,
  error: null as string | null,
  setSelectedId: vi.fn(),
  toggleSelect: vi.fn(),
  clearSelection: vi.fn(),
  update: vi.fn().mockResolvedValue(undefined),
  remove: vi.fn().mockResolvedValue(undefined),
  reparent: vi.fn().mockResolvedValue(undefined),
  move: vi.fn().mockResolvedValue(undefined),
  reorder: vi.fn().mockResolvedValue(undefined),
  add: vi.fn().mockResolvedValue(undefined),
  restore: vi.fn().mockResolvedValue(undefined),
  emptyBin: vi.fn().mockResolvedValue(undefined),
  setBinOpen: vi.fn(),
  upload: vi.fn().mockResolvedValue(undefined),
  confirmMapping: vi.fn().mockResolvedValue(undefined),
  cancelMapping: vi.fn(),
  reflow: vi.fn(),
  saveSnapshot: vi.fn().mockResolvedValue(undefined),
  loadSnapshot: vi.fn().mockResolvedValue(undefined),
  deleteSnapshot: vi.fn().mockResolvedValue(undefined),
  restoreAutosave: vi.fn(),
  dismissAutosave: vi.fn().mockResolvedValue(undefined),
  toggleEmploymentTypeFilter: vi.fn(),
  showAllEmploymentTypes: vi.fn(),
  hideAllEmploymentTypes: vi.fn(),
  setHead: vi.fn(),
  clearError: vi.fn(),
  pods: [] as any[],
  originalPods: [] as any[],
  selectedPodId: null as string | null,
  selectPod: vi.fn(),
  updatePod: vi.fn().mockResolvedValue(undefined),
  createPod: vi.fn().mockResolvedValue(undefined),
  setViewMode: vi.fn(),
  setDataView: vi.fn(),
  settings: { disciplineOrder: [] },
  updateSettings: vi.fn(),
  batchSelect: vi.fn(),
  setError: vi.fn(),
}

vi.mock('../store/OrgContext', () => ({
  useOrg: () => mockOrg,
}))

// --- Helpers ---

function resetMockOrg() {
  mockOrg.working = [alice, bob]
  mockOrg.selectedId = null
  mockOrg.selectedIds = new Set()
  mockOrg.selectedPodId = null
  mockOrg.update = vi.fn().mockResolvedValue(undefined)
  mockOrg.remove = vi.fn().mockResolvedValue(undefined)
  mockOrg.reparent = vi.fn().mockResolvedValue(undefined)
  mockOrg.clearSelection = vi.fn()
  mockOrg.setSelectedId = vi.fn()
}

beforeEach(() => {
  vi.clearAllMocks()
  resetMockOrg()
})

afterEach(() => cleanup())

// --- Tests ---

describe('DetailSidebar', () => {
  describe('single-person edit', () => {
    beforeEach(() => {
      mockOrg.selectedId = 'b2'
      mockOrg.selectedIds = new Set(['b2'])
    })

    it('calls clearSelection when close button is clicked', async () => {
      const user = userEvent.setup()
      render(<DetailSidebar />)
      const closeBtn = screen.getByLabelText('Close')
      await user.click(closeBtn)
      expect(mockOrg.clearSelection).toHaveBeenCalledTimes(1)
    })

    it('calls update with correct fields when Save is clicked', async () => {
      const user = userEvent.setup()
      render(<DetailSidebar />)
      await user.click(screen.getByText('Save'))
      expect(mockOrg.update).toHaveBeenCalledTimes(1)
      const [personId, fields] = mockOrg.update.mock.calls[0]
      expect(personId).toBe('b2')
      expect(fields.name).toBe('Bob Jones')
      expect(fields.role).toBe('Engineer')
      expect(fields.status).toBe('Active')
      expect(fields.employmentType).toBe('FTE')
      expect(fields.team).toBe('Platform')
      expect(fields.managerId).toBe('a1')
    })

    it('does not call reparent when manager has not changed', async () => {
      const user = userEvent.setup()
      render(<DetailSidebar />)
      await user.click(screen.getByText('Save'))
      expect(mockOrg.reparent).not.toHaveBeenCalled()
    })

    it('clears manager via reparent when set to no manager', async () => {
      const user = userEvent.setup()
      render(<DetailSidebar />)
      const selects = screen.getAllByRole('combobox')
      await user.selectOptions(selects[0], '')
      await user.click(screen.getByText('Save'))
      expect(mockOrg.reparent).toHaveBeenCalledWith('b2', '', expect.any(String))
    })

    it('calls remove with person id when Delete is clicked', async () => {
      const user = userEvent.setup()
      render(<DetailSidebar />)
      await user.click(screen.getByText('Delete'))
      expect(mockOrg.remove).toHaveBeenCalledWith('b2')
    })

    it('calls setSelectedId(null) after successful delete', async () => {
      const user = userEvent.setup()
      render(<DetailSidebar />)
      await user.click(screen.getByText('Delete'))
      expect(mockOrg.setSelectedId).toHaveBeenCalledWith(null)
    })

    it('shows "Saved!" after successful save', async () => {
      const user = userEvent.setup()
      render(<DetailSidebar />)
      await user.click(screen.getByText('Save'))
      expect(screen.getByText('Saved!')).toBeDefined()
    })

    it('shows "Retry" button label after save fails', async () => {
      const user = userEvent.setup()
      mockOrg.update = vi.fn().mockRejectedValue(new Error('network error'))
      render(<DetailSidebar />)
      await user.click(screen.getByText('Save'))
      expect(screen.getByText('Retry')).toBeDefined()
    })

    it('shows error message text when save fails', async () => {
      const user = userEvent.setup()
      mockOrg.update = vi.fn().mockRejectedValue(new Error('network error'))
      render(<DetailSidebar />)
      await user.click(screen.getByText('Save'))
      expect(screen.getByText('Save failed')).toBeDefined()
    })

    it('name field updates reactively when changed', async () => {
      const user = userEvent.setup()
      render(<DetailSidebar />)
      const nameInput = screen.getByDisplayValue('Bob Jones') as HTMLInputElement
      await user.clear(nameInput)
      await user.type(nameInput, 'Robert Jones')
      expect(nameInput.value).toBe('Robert Jones')
    })
  })

  describe('batch edit', () => {
    beforeEach(() => {
      mockOrg.working = [alice, bob, carol]
      mockOrg.selectedId = null
      mockOrg.selectedIds = new Set(['b2', 'c3'])
    })

    it('calls clearSelection when close button is clicked in batch mode', async () => {
      const user = userEvent.setup()
      render(<DetailSidebar />)
      await user.click(screen.getByLabelText('Close'))
      expect(mockOrg.clearSelection).toHaveBeenCalledTimes(1)
    })

    it('calls update for each selected person on batch save', async () => {
      const user = userEvent.setup()
      render(<DetailSidebar />)
      const mixedInputs = screen.getAllByPlaceholderText('Mixed')
      await user.clear(mixedInputs[0])
      await user.type(mixedInputs[0], 'Senior Engineer')
      await user.click(screen.getByText('Save'))
      expect(mockOrg.update).toHaveBeenCalledTimes(2)
    })

    it('clears manager via reparent when batch-set to no manager', async () => {
      const user = userEvent.setup()
      render(<DetailSidebar />)
      const selects = screen.getAllByRole('combobox')
      const managerSelect = selects.find(
        (s) => Array.from(s.querySelectorAll('option')).some((o) => o.textContent === '(No manager)'),
      )!
      await user.selectOptions(managerSelect, '')
      await user.click(screen.getByText('Save'))
      expect(mockOrg.reparent).toHaveBeenCalledTimes(2)
      expect(mockOrg.reparent).toHaveBeenCalledWith('b2', '', expect.any(String))
      expect(mockOrg.reparent).toHaveBeenCalledWith('c3', '', expect.any(String))
    })

    it('"Clear selection" button calls clearSelection', async () => {
      const user = userEvent.setup()
      render(<DetailSidebar />)
      const clearBtn = screen.getByText('Clear selection')
      await user.click(clearBtn)
      expect(mockOrg.clearSelection).toHaveBeenCalledTimes(1)
    })
  })

  describe('boundary inputs', () => {
    describe('duplicate names', () => {
      const alice1 = makePerson({ id: 'dup1', name: 'Alice Smith', role: 'Engineer', managerId: '', team: 'Alpha', employmentType: 'FTE' })
      const alice2 = makePerson({ id: 'dup2', name: 'Alice Smith', role: 'Designer', managerId: 'dup1', team: 'Beta', employmentType: 'FTE' })

      it('calls update with correct id for second duplicate on save', async () => {
        const user = userEvent.setup()
        mockOrg.working = [alice1, alice2]
        mockOrg.selectedId = 'dup2'
        mockOrg.selectedIds = new Set(['dup2'])
        render(<DetailSidebar />)
        await user.click(screen.getByText('Save'))
        expect(mockOrg.update).toHaveBeenCalledTimes(1)
        const [personId] = mockOrg.update.mock.calls[0]
        expect(personId).toBe('dup2')
      })

      it('can edit each duplicate independently', async () => {
        const user = userEvent.setup()
        mockOrg.working = [alice1, alice2]
        mockOrg.selectedId = 'dup1'
        mockOrg.selectedIds = new Set(['dup1'])
        const { unmount } = render(<DetailSidebar />)
        const nameInput = screen.getByDisplayValue('Alice Smith') as HTMLInputElement
        await user.clear(nameInput)
        await user.type(nameInput, 'Alice Smith-1')
        expect(nameInput.value).toBe('Alice Smith-1')
        unmount()

        mockOrg.selectedId = 'dup2'
        mockOrg.selectedIds = new Set(['dup2'])
        render(<DetailSidebar />)
        const nameInput2 = screen.getByDisplayValue('Alice Smith') as HTMLInputElement
        await user.clear(nameInput2)
        await user.type(nameInput2, 'Alice Smith-2')
        expect(nameInput2.value).toBe('Alice Smith-2')
      })
    })

    describe('empty string fields', () => {
      it('calls update with empty fields when saved', async () => {
        const user = userEvent.setup()
        const emptyPerson = makePerson({ id: 'empty1', name: '', role: '', team: '', discipline: '', employmentType: '' })
        mockOrg.working = [emptyPerson]
        mockOrg.selectedId = 'empty1'
        mockOrg.selectedIds = new Set(['empty1'])
        render(<DetailSidebar />)
        await user.click(screen.getByText('Save'))
        expect(mockOrg.update).toHaveBeenCalledTimes(1)
        const [personId, fields] = mockOrg.update.mock.calls[0]
        expect(personId).toBe('empty1')
        expect(fields.name).toBe('')
        expect(fields.role).toBe('')
      })
    })

    describe('very long strings', () => {
      it('calls update with full-length strings on save', async () => {
        const user = userEvent.setup()
        const longStr = 'A'.repeat(500)
        const longPerson = makePerson({ id: 'long1', name: longStr, role: longStr, team: longStr, discipline: longStr })
        mockOrg.working = [longPerson]
        mockOrg.selectedId = 'long1'
        mockOrg.selectedIds = new Set(['long1'])
        render(<DetailSidebar />)
        await user.click(screen.getByText('Save'))
        expect(mockOrg.update).toHaveBeenCalledTimes(1)
        const [, fields] = mockOrg.update.mock.calls[0]
        expect(fields.name).toBe(longStr)
        expect(fields.role).toBe(longStr)
      })
    })

    describe('special characters in names', () => {
      it('preserves special characters through save', async () => {
        const user = userEvent.setup()
        const specialName = 'Jos\u00e9 Garc\u00eda-L\u00f3pez'
        const p = makePerson({ id: 'save-special', name: specialName })
        mockOrg.working = [p]
        mockOrg.selectedId = 'save-special'
        mockOrg.selectedIds = new Set(['save-special'])
        render(<DetailSidebar />)
        await user.click(screen.getByText('Save'))
        expect(mockOrg.update).toHaveBeenCalledTimes(1)
        const [, fields] = mockOrg.update.mock.calls[0]
        expect(fields.name).toBe(specialName)
      })
    })

    describe('whitespace-only fields', () => {
      it('calls update with whitespace-only values on save', async () => {
        const user = userEvent.setup()
        const wsPerson = makePerson({ id: 'ws1', name: '   ', role: '   ', team: '   ' })
        mockOrg.working = [wsPerson]
        mockOrg.selectedId = 'ws1'
        mockOrg.selectedIds = new Set(['ws1'])
        render(<DetailSidebar />)
        await user.click(screen.getByText('Save'))
        expect(mockOrg.update).toHaveBeenCalledTimes(1)
        const [, fields] = mockOrg.update.mock.calls[0]
        expect(fields.name).toBe('   ')
        expect(fields.role).toBe('   ')
      })
    })
  })
})
