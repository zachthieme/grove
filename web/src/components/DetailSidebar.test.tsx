import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
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
  pods: [] as any[],
  originalPods: [] as any[],
  selectedPodId: null as string | null,
  selectPod: vi.fn(),
  updatePod: vi.fn().mockResolvedValue(undefined),
  createPod: vi.fn().mockResolvedValue(undefined),
  setViewMode: vi.fn(),
  setDataView: vi.fn(),
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
      // team and managerId included when manager hasn't changed
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
      // bob's manager is alice (a1); clear the manager.
      const selects = screen.getAllByRole('combobox')
      await user.selectOptions(selects[0], '')
      await user.click(screen.getByText('Save'))
      // Clearing manager goes through reparent (which handles empty string internally)
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

    it('calls clearSelection when close button is clicked in batch mode', async () => {
      const user = userEvent.setup()
      render(<DetailSidebar />)
      await user.click(screen.getByLabelText('Close'))
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

    it('Save button is enabled after a batch field is edited', async () => {
      const user = userEvent.setup()
      render(<DetailSidebar />)
      // Role inputs have Mixed placeholder (bob=Engineer, carol=Designer differ)
      const mixedInputs = screen.getAllByPlaceholderText('Mixed')
      await user.clear(mixedInputs[0])
      await user.type(mixedInputs[0], 'Senior Engineer')
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
      const user = userEvent.setup()
      render(<DetailSidebar />)
      // Trigger dirty state by changing role
      const mixedInputs = screen.getAllByPlaceholderText('Mixed')
      await user.clear(mixedInputs[0])
      await user.type(mixedInputs[0], 'Senior Engineer')
      await user.click(screen.getByText('Save'))
      // update called once for each selected person (bob and carol)
      expect(mockOrg.update).toHaveBeenCalledTimes(2)
    })

    it('"Clear selection" button calls clearSelection', async () => {
      const user = userEvent.setup()
      render(<DetailSidebar />)
      const clearBtn = screen.getByText('Clear selection')
      await user.click(clearBtn)
      expect(mockOrg.clearSelection).toHaveBeenCalledTimes(1)
    })

    it('clears manager via reparent when batch-set to no manager', async () => {
      const user = userEvent.setup()
      // bob and carol both have managerId 'a1' (alice)
      render(<DetailSidebar />)
      // Change manager dropdown to "(No manager)" — value=""
      const selects = screen.getAllByRole('combobox')
      const managerSelect = selects.find(
        (s) => Array.from(s.querySelectorAll('option')).some((o) => o.textContent === '(No manager)'),
      )!
      await user.selectOptions(managerSelect, '')
      await user.click(screen.getByText('Save'))
      // reparent is called with empty string to clear manager
      expect(mockOrg.reparent).toHaveBeenCalledTimes(2)
      expect(mockOrg.reparent).toHaveBeenCalledWith('b2', '', expect.any(String))
      expect(mockOrg.reparent).toHaveBeenCalledWith('c3', '', expect.any(String))
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

  describe('boundary inputs', () => {
    describe('duplicate names', () => {
      const alice1 = makePerson({ id: 'dup1', name: 'Alice Smith', role: 'Engineer', managerId: '', team: 'Alpha' })
      const alice2 = makePerson({ id: 'dup2', name: 'Alice Smith', role: 'Designer', managerId: 'dup1', team: 'Beta' })

      beforeEach(() => {
        mockOrg.working = [alice1, alice2]
      })

      it('renders first duplicate in sidebar when selected', () => {
        mockOrg.selectedId = 'dup1'
        mockOrg.selectedIds = new Set(['dup1'])
        render(<DetailSidebar />)
        expect(screen.getByDisplayValue('Alice Smith')).toBeDefined()
        expect(screen.getByDisplayValue('Engineer')).toBeDefined()
      })

      it('renders second duplicate in sidebar when selected', () => {
        mockOrg.selectedId = 'dup2'
        mockOrg.selectedIds = new Set(['dup2'])
        render(<DetailSidebar />)
        expect(screen.getByDisplayValue('Alice Smith')).toBeDefined()
        expect(screen.getByDisplayValue('Designer')).toBeDefined()
      })

      it('calls update with correct id for second duplicate on save', async () => {
        const user = userEvent.setup()
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
        mockOrg.selectedId = 'dup1'
        mockOrg.selectedIds = new Set(['dup1'])
        const { unmount } = render(<DetailSidebar />)
        const nameInput = screen.getByDisplayValue('Alice Smith') as HTMLInputElement
        await user.clear(nameInput)
        await user.type(nameInput, 'Alice Smith-1')
        expect(nameInput.value).toBe('Alice Smith-1')
        unmount()

        // Switch to second duplicate
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
      const emptyPerson = makePerson({ id: 'empty1', name: '', role: '', team: '', discipline: '' })

      beforeEach(() => {
        mockOrg.working = [emptyPerson]
        mockOrg.selectedId = 'empty1'
        mockOrg.selectedIds = new Set(['empty1'])
      })

      it('renders sidebar without crashing for empty fields', () => {
        render(<DetailSidebar />)
        expect(screen.getByText('Edit Person')).toBeDefined()
      })

      it('shows empty name input field', () => {
        render(<DetailSidebar />)
        const nameInput = screen.getByTestId('field-name') as HTMLInputElement
        expect(nameInput.value).toBe('')
      })

      it('shows empty role input field', () => {
        render(<DetailSidebar />)
        const roleInput = screen.getByTestId('field-role') as HTMLInputElement
        expect(roleInput.value).toBe('')
      })

      it('shows empty team input field', () => {
        render(<DetailSidebar />)
        const teamInput = screen.getByTestId('field-team') as HTMLInputElement
        expect(teamInput.value).toBe('')
      })

      it('calls update with empty fields when saved', async () => {
        const user = userEvent.setup()
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
      const longStr = 'A'.repeat(500)
      const longPerson = makePerson({ id: 'long1', name: longStr, role: longStr, team: longStr, discipline: longStr })

      beforeEach(() => {
        mockOrg.working = [longPerson]
        mockOrg.selectedId = 'long1'
        mockOrg.selectedIds = new Set(['long1'])
      })

      it('renders sidebar without crashing for 500-character name', () => {
        render(<DetailSidebar />)
        expect(screen.getByText('Edit Person')).toBeDefined()
      })

      it('shows full 500-character name in input field without truncation', () => {
        render(<DetailSidebar />)
        const nameInput = screen.getByTestId('field-name') as HTMLInputElement
        expect(nameInput.value).toBe(longStr)
        expect(nameInput.value.length).toBe(500)
      })

      it('shows full 500-character role in input field without truncation', () => {
        render(<DetailSidebar />)
        const roleInput = screen.getByTestId('field-role') as HTMLInputElement
        expect(roleInput.value).toBe(longStr)
        expect(roleInput.value.length).toBe(500)
      })

      it('shows full 500-character team in input field without truncation', () => {
        render(<DetailSidebar />)
        const teamInput = screen.getByTestId('field-team') as HTMLInputElement
        expect(teamInput.value).toBe(longStr)
        expect(teamInput.value.length).toBe(500)
      })

      it('calls update with full-length strings on save', async () => {
        const user = userEvent.setup()
        render(<DetailSidebar />)
        await user.click(screen.getByText('Save'))
        expect(mockOrg.update).toHaveBeenCalledTimes(1)
        const [, fields] = mockOrg.update.mock.calls[0]
        expect(fields.name).toBe(longStr)
        expect(fields.role).toBe(longStr)
      })
    })

    describe('special characters in names', () => {
      it('renders Unicode accented name correctly', () => {
        const p = makePerson({ id: 'uni1', name: 'Jos\u00e9 Garc\u00eda-L\u00f3pez' })
        mockOrg.working = [p]
        mockOrg.selectedId = 'uni1'
        mockOrg.selectedIds = new Set(['uni1'])
        render(<DetailSidebar />)
        const nameInput = screen.getByTestId('field-name') as HTMLInputElement
        expect(nameInput.value).toBe('Jos\u00e9 Garc\u00eda-L\u00f3pez')
      })

      it('renders CJK characters correctly', () => {
        const p = makePerson({ id: 'cjk1', name: '\u7530\u4e2d\u592a\u90ce' })
        mockOrg.working = [p]
        mockOrg.selectedId = 'cjk1'
        mockOrg.selectedIds = new Set(['cjk1'])
        render(<DetailSidebar />)
        const nameInput = screen.getByTestId('field-name') as HTMLInputElement
        expect(nameInput.value).toBe('\u7530\u4e2d\u592a\u90ce')
      })

      it('renders emoji in name correctly', () => {
        const p = makePerson({ id: 'emoji1', name: '\ud83d\udc69\u200d\ud83d\udcbb Alice' })
        mockOrg.working = [p]
        mockOrg.selectedId = 'emoji1'
        mockOrg.selectedIds = new Set(['emoji1'])
        render(<DetailSidebar />)
        const nameInput = screen.getByTestId('field-name') as HTMLInputElement
        expect(nameInput.value).toBe('\ud83d\udc69\u200d\ud83d\udcbb Alice')
      })

      it('renders HTML special characters as text, not markup', () => {
        const xssName = "<script>alert('xss')</script>"
        const p = makePerson({ id: 'html1', name: xssName })
        mockOrg.working = [p]
        mockOrg.selectedId = 'html1'
        mockOrg.selectedIds = new Set(['html1'])
        render(<DetailSidebar />)
        const nameInput = screen.getByTestId('field-name') as HTMLInputElement
        expect(nameInput.value).toBe(xssName)
      })

      it('renders names with quotes correctly', () => {
        const quoteName = 'O\'Brien "Bob"'
        const p = makePerson({ id: 'quote1', name: quoteName })
        mockOrg.working = [p]
        mockOrg.selectedId = 'quote1'
        mockOrg.selectedIds = new Set(['quote1'])
        render(<DetailSidebar />)
        const nameInput = screen.getByTestId('field-name') as HTMLInputElement
        expect(nameInput.value).toBe(quoteName)
      })

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
      const whitespacePerson = makePerson({ id: 'ws1', name: '   ', role: '   ', team: '   ' })

      beforeEach(() => {
        mockOrg.working = [whitespacePerson]
        mockOrg.selectedId = 'ws1'
        mockOrg.selectedIds = new Set(['ws1'])
      })

      it('renders sidebar without crashing for whitespace-only name', () => {
        render(<DetailSidebar />)
        expect(screen.getByText('Edit Person')).toBeDefined()
      })

      it('shows whitespace-only name in input field', () => {
        render(<DetailSidebar />)
        const nameInput = screen.getByTestId('field-name') as HTMLInputElement
        expect(nameInput.value).toBe('   ')
      })

      it('shows whitespace-only role in input field', () => {
        render(<DetailSidebar />)
        const roleInput = screen.getByTestId('field-role') as HTMLInputElement
        expect(roleInput.value).toBe('   ')
      })

      it('calls update with whitespace-only values on save', async () => {
        const user = userEvent.setup()
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
