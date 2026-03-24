import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, act, cleanup } from '@testing-library/react'
import DetailSidebar from './DetailSidebar'
import type { Person } from '../api/types'

// --- Test fixtures ---

function makePerson(overrides: Partial<Person> = {}): Person {
  return {
    id: 'a1',
    name: 'Alice Smith',
    role: 'Software Engineer',
    discipline: 'Engineering',
    managerId: '',
    team: 'Platform',
    additionalTeams: [],
    status: 'Active',
    employmentType: 'FTE',
    ...overrides,
  }
}

const alice = makePerson({ id: 'a1', name: 'Alice Smith', role: 'VP', managerId: '', team: 'Platform', discipline: 'Eng' })
const bob = makePerson({ id: 'b2', name: 'Bob Jones', role: 'Engineer', managerId: 'a1', team: 'Platform', discipline: 'Eng' })
const carol = makePerson({ id: 'c3', name: 'Carol White', role: 'Designer', managerId: 'a1', team: 'Design', discipline: 'Design' })

// --- Mock useOrg ---
//
// The mock factory is hoisted. We define the state here so each test can
// mutate individual fields in beforeEach without recreating the object.

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
}

vi.mock('../store/OrgContext', () => ({
  useOrg: () => mockOrg,
}))

// --- Helpers ---

function resetMockOrg() {
  mockOrg.working = [alice, bob]
  mockOrg.selectedId = null
  mockOrg.selectedIds = new Set()
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
  describe('null / no selection', () => {
    it('returns null when no person is selected and not batch mode', () => {
      // selectedId = null, selectedIds = empty Set (defaults from resetMockOrg)
      const { container } = render(<DetailSidebar />)
      expect(container.firstChild).toBeNull()
    })
  })

  describe('single-person edit', () => {
    beforeEach(() => {
      mockOrg.selectedId = 'b2'
      mockOrg.selectedIds = new Set(['b2'])
    })

    it('renders "Edit Person" heading', () => {
      render(<DetailSidebar />)
      expect(screen.getByText('Edit Person')).toBeDefined()
    })

    it('renders name field pre-filled with person name', () => {
      render(<DetailSidebar />)
      expect(screen.getByDisplayValue('Bob Jones')).toBeDefined()
    })

    it('renders role field pre-filled with person role', () => {
      render(<DetailSidebar />)
      expect(screen.getByDisplayValue('Engineer')).toBeDefined()
    })

    it('renders team field pre-filled with person team', () => {
      render(<DetailSidebar />)
      // "Platform" appears in both team field and manager option; use label+input
      const teamLabel = screen.getByText('Team')
      const teamInput = teamLabel.parentElement!.querySelector('input') as HTMLInputElement
      expect(teamInput.value).toBe('Platform')
    })

    it('renders Save and Delete buttons', () => {
      render(<DetailSidebar />)
      expect(screen.getByText('Save')).toBeDefined()
      expect(screen.getByText('Delete')).toBeDefined()
    })

    it('calls clearSelection when close button is clicked', () => {
      render(<DetailSidebar />)
      const closeBtn = screen.getByLabelText('Close')
      fireEvent.click(closeBtn)
      expect(mockOrg.clearSelection).toHaveBeenCalledTimes(1)
    })

    it('calls update with correct fields when Save is clicked', async () => {
      render(<DetailSidebar />)
      await act(async () => {
        fireEvent.click(screen.getByText('Save'))
      })
      expect(mockOrg.update).toHaveBeenCalledTimes(1)
      const [personId, fields] = mockOrg.update.mock.calls[0]
      expect(personId).toBe('b2')
      expect(fields.name).toBe('Bob Jones')
      expect(fields.role).toBe('Engineer')
      expect(fields.status).toBe('Active')
      expect(fields.employmentType).toBe('FTE')
      // team and managerId included when manager hasn't changed
      expect(fields.team).toBe('Platform')
      expect(fields.managerId).toBe('a1')
    })

    it('does not call reparent when manager has not changed', async () => {
      render(<DetailSidebar />)
      await act(async () => {
        fireEvent.click(screen.getByText('Save'))
      })
      expect(mockOrg.reparent).not.toHaveBeenCalled()
    })

    it('clears manager via update (not reparent) when set to no manager', async () => {
      render(<DetailSidebar />)
      // bob's manager is alice (a1); clear the manager.
      const selects = screen.getAllByRole('combobox')
      fireEvent.change(selects[0], { target: { value: '' } })
      await act(async () => {
        fireEvent.click(screen.getByText('Save'))
      })
      // Clearing manager should NOT call reparent (reparent requires a target manager)
      expect(mockOrg.reparent).not.toHaveBeenCalled()
      expect(mockOrg.update).toHaveBeenCalledTimes(1)
      const [, fields] = mockOrg.update.mock.calls[0]
      // managerId="" sent via update when clearing manager
      expect(fields.managerId).toBe('')
    })

    it('calls remove with person id when Delete is clicked', async () => {
      render(<DetailSidebar />)
      await act(async () => {
        fireEvent.click(screen.getByText('Delete'))
      })
      expect(mockOrg.remove).toHaveBeenCalledWith('b2')
    })

    it('calls setSelectedId(null) after successful delete', async () => {
      render(<DetailSidebar />)
      await act(async () => {
        fireEvent.click(screen.getByText('Delete'))
      })
      expect(mockOrg.setSelectedId).toHaveBeenCalledWith(null)
    })

    it('shows "Saved!" after successful save', async () => {
      render(<DetailSidebar />)
      await act(async () => {
        fireEvent.click(screen.getByText('Save'))
      })
      expect(screen.getByText('Saved!')).toBeDefined()
    })

    it('shows "Retry" button label after save fails', async () => {
      mockOrg.update = vi.fn().mockRejectedValue(new Error('network error'))
      render(<DetailSidebar />)
      await act(async () => {
        fireEvent.click(screen.getByText('Save'))
      })
      expect(screen.getByText('Retry')).toBeDefined()
    })

    it('shows error message text when save fails', async () => {
      mockOrg.update = vi.fn().mockRejectedValue(new Error('network error'))
      render(<DetailSidebar />)
      await act(async () => {
        fireEvent.click(screen.getByText('Save'))
      })
      expect(screen.getByText('Save failed')).toBeDefined()
    })

    it('name field updates reactively when changed', () => {
      render(<DetailSidebar />)
      const nameInput = screen.getByDisplayValue('Bob Jones') as HTMLInputElement
      fireEvent.change(nameInput, { target: { value: 'Robert Jones' } })
      expect(nameInput.value).toBe('Robert Jones')
    })

    it('managers are listed in the manager select', () => {
      // alice (a1) has bob as a report, so alice is a manager
      render(<DetailSidebar />)
      // Option text: "Alice Smith — Platform"
      // getByRole('option') searches option elements
      const option = screen.getByRole('option', { name: /Alice Smith/ })
      expect(option).toBeDefined()
    })

    it('manager select shows current manager as selected', () => {
      render(<DetailSidebar />)
      const selects = screen.getAllByRole('combobox')
      const managerSelect = selects[0] as HTMLSelectElement
      expect(managerSelect.value).toBe('a1')
    })
  })

  describe('batch edit', () => {
    beforeEach(() => {
      mockOrg.working = [alice, bob, carol]
      mockOrg.selectedId = null
      mockOrg.selectedIds = new Set(['b2', 'c3'])
    })

    it('renders "Edit N people" heading for batch selection', () => {
      render(<DetailSidebar />)
      expect(screen.getByText('Edit 2 people')).toBeDefined()
    })

    it('renders Close button with aria-label in batch mode', () => {
      render(<DetailSidebar />)
      const closeBtn = screen.getByLabelText('Close')
      expect(closeBtn).toBeDefined()
    })

    it('calls clearSelection when close button is clicked in batch mode', () => {
      render(<DetailSidebar />)
      fireEvent.click(screen.getByLabelText('Close'))
      expect(mockOrg.clearSelection).toHaveBeenCalledTimes(1)
    })

    it('does not render Name field in batch mode', () => {
      render(<DetailSidebar />)
      const labels = screen.queryAllByText('Name')
      expect(labels.length).toBe(0)
    })

    it('renders Role field in batch mode', () => {
      render(<DetailSidebar />)
      expect(screen.getByText('Role')).toBeDefined()
    })

    it('renders Discipline field in batch mode', () => {
      render(<DetailSidebar />)
      expect(screen.getByText('Discipline')).toBeDefined()
    })

    it('renders Team field in batch mode', () => {
      render(<DetailSidebar />)
      expect(screen.getByText('Team')).toBeDefined()
    })

    it('renders Manager field in batch mode', () => {
      render(<DetailSidebar />)
      expect(screen.getByText('Manager')).toBeDefined()
    })

    it('renders Status field in batch mode', () => {
      render(<DetailSidebar />)
      expect(screen.getByText('Status')).toBeDefined()
    })

    it('renders Employment Type field in batch mode', () => {
      render(<DetailSidebar />)
      expect(screen.getByText('Employment Type')).toBeDefined()
    })

    it('Save button is disabled when no batch field has been edited', () => {
      render(<DetailSidebar />)
      const saveBtn = screen.getByText('Save') as HTMLButtonElement
      expect(saveBtn.disabled).toBe(true)
    })

    it('Save button is enabled after a batch field is edited', () => {
      render(<DetailSidebar />)
      // Role inputs have Mixed placeholder (bob=Engineer, carol=Designer differ)
      const mixedInputs = screen.getAllByPlaceholderText('Mixed')
      fireEvent.change(mixedInputs[0], { target: { value: 'Senior Engineer' } })
      const saveBtn = screen.getByText('Save') as HTMLButtonElement
      expect(saveBtn.disabled).toBe(false)
    })

    it('shows mixed placeholder when batch people have different roles', () => {
      // bob.role = Engineer, carol.role = Designer — they differ
      render(<DetailSidebar />)
      const inputs = screen.getAllByPlaceholderText('Mixed')
      expect(inputs.length).toBeGreaterThan(0)
    })

    it('calls update for each selected person on batch save', async () => {
      render(<DetailSidebar />)
      // Trigger dirty state by changing role
      const mixedInputs = screen.getAllByPlaceholderText('Mixed')
      fireEvent.change(mixedInputs[0], { target: { value: 'Senior Engineer' } })
      await act(async () => {
        fireEvent.click(screen.getByText('Save'))
      })
      // update called once for each selected person (bob and carol)
      expect(mockOrg.update).toHaveBeenCalledTimes(2)
    })

    it('"Clear selection" button calls clearSelection', () => {
      render(<DetailSidebar />)
      const clearBtn = screen.getByText('Clear selection')
      fireEvent.click(clearBtn)
      expect(mockOrg.clearSelection).toHaveBeenCalledTimes(1)
    })
  })

  describe('batch edit with uniform values', () => {
    beforeEach(() => {
      const dan = makePerson({ id: 'd4', name: 'Dan', role: 'Engineer', team: 'Platform', managerId: 'a1', discipline: 'Eng' })
      mockOrg.working = [alice, bob, dan]
      mockOrg.selectedId = null
      mockOrg.selectedIds = new Set(['b2', 'd4'])
    })

    it('shows pre-filled role when all selected have same role', () => {
      render(<DetailSidebar />)
      // Both bob and dan have role 'Engineer' — should appear as a filled value (not mixed)
      expect(screen.getByDisplayValue('Engineer')).toBeDefined()
    })

    it('Save button remains disabled when uniform-value batch fields are unchanged', () => {
      render(<DetailSidebar />)
      const saveBtn = screen.getByText('Save') as HTMLButtonElement
      expect(saveBtn.disabled).toBe(true)
    })
  })
})
