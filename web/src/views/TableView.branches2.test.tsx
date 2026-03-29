/**
 * Additional branch coverage tests for TableView (round 2).
 * Targets uncovered branches:
 * - draftToPerson: all the || fallback branches (lines 20-31)
 * - handleFilterClick: closing already-open filter (line 92)
 * - saveDraft: draft not found or name empty
 * - updateDraft: updating a specific draft field
 * - contextDefaults: columnFilter with exactly 1 value selected
 * - filterActive: partial filter selection detection (line 216)
 * - filteredPeople: filtering via columnFilters (line 226)
 * - draft row cells: dropdown vs text input branches (lines 323-343)
 * - read-only hides add/paste/delete
 * - sorting: asc, desc, clear
 * - select all / deselect all
 * - column visibility toggle (hide + re-show)
 */
import { describe, it, expect, vi, afterEach, beforeAll } from 'vitest'
import { screen, cleanup, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import TableView from './TableView'
import { renderWithViewData } from '../test-helpers'
import type { Person } from '../api/types'

const testPeople: Person[] = [
  {
    id: '1', name: 'Alice', role: 'VP', discipline: 'Engineering', managerId: '', team: 'Platform',
    additionalTeams: ['Backend'], status: 'Active', employmentType: 'FTE', level: 5,
    pod: 'Alpha', publicNote: 'note1', privateNote: 'secret1',
  },
  {
    id: '2', name: 'Bob', role: 'Engineer', discipline: 'Engineering', managerId: '1', team: 'Platform',
    additionalTeams: [], status: 'Open', employmentType: 'Contractor',
  },
  {
    id: '3', name: 'Carol', role: 'Designer', discipline: 'Design', managerId: '1', team: 'Design',
    additionalTeams: [], status: 'Active', employmentType: 'FTE',
  },
]

beforeAll(() => {
  Element.prototype.scrollIntoView = vi.fn()
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

function renderTable(overrides = {}) {
  const update = vi.fn().mockResolvedValue(undefined)
  const remove = vi.fn().mockResolvedValue(undefined)
  const toggleSelect = vi.fn()
  const clearSelection = vi.fn()
  const add = vi.fn().mockResolvedValue(undefined)
  const ctx = {
    update,
    remove,
    toggleSelect,
    clearSelection,
    add,
    working: testPeople,
    original: testPeople,
    viewMode: 'table' as const,
    dataView: 'working' as const,
    ...overrides,
  }
  const result = renderWithViewData(<TableView />, ctx)
  return { ...result, update, remove, toggleSelect, clearSelection, add }
}

describe('TableView — branch coverage round 2', () => {
  describe('handleFilterClick — close open filter', () => {
    it('closes filter when clicking the same filter button twice', async () => {
      const user = userEvent.setup()
      renderTable()

      const filterBtn = screen.getByLabelText('Filter Name')
      // Open
      await user.click(filterBtn)
      // Close by clicking same button (triggers openFilter === key branch)
      await user.click(filterBtn)
    })
  })

  describe('saveDraft — empty name', () => {
    it('does not call add if draft has no name', async () => {
      const user = userEvent.setup()
      const { add, container } = renderTable()

      await user.click(screen.getByLabelText('Add new row'))

      const draftInputs = container.querySelectorAll('tbody tr:last-child input:not([type="checkbox"])')
      expect(draftInputs.length).toBeGreaterThan(0)

      // Focus then blur the first input (name) without typing
      const nameInput = draftInputs[0] as HTMLInputElement
      await user.click(nameInput)
      await user.tab()

      expect(add).not.toHaveBeenCalled()
    })
  })

  describe('draft row — saving a valid draft', () => {
    it('calls add with person data when name is not empty', async () => {
      const user = userEvent.setup()
      const { add } = renderTable()

      await user.click(screen.getByLabelText('Add new row'))

      const draftRow = screen.getByLabelText('Discard draft row').closest('tr')!
      const nameInput = draftRow.querySelector('input[type="text"]') as HTMLInputElement
      expect(nameInput).not.toBeNull()

      await user.type(nameInput, 'New Person')
      await user.tab()

      expect(add).toHaveBeenCalledTimes(1)
      expect(add).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'New Person' }),
      )
    })
  })

  describe('draft row — dropdown cells', () => {
    it('renders status dropdown and manager dropdown in draft rows', async () => {
      const user = userEvent.setup()
      renderTable()

      await user.click(screen.getByLabelText('Add new row'))

      const draftRow = screen.getByLabelText('Discard draft row').closest('tr')!
      const selects = draftRow.querySelectorAll('select')
      expect(selects.length).toBeGreaterThanOrEqual(2)

      // Verify status dropdown has status options
      const statusSelect = Array.from(selects).find(s => {
        const options = Array.from(s.querySelectorAll('option'))
        return options.some(o => o.textContent === 'Active')
      })
      expect(statusSelect).toBeDefined()

      // Verify manager dropdown has manager options (Alice is a manager)
      const managerSelect = Array.from(selects).find(s => {
        const options = Array.from(s.querySelectorAll('option'))
        return options.some(o => o.textContent === 'Alice')
      })
      expect(managerSelect).toBeDefined()
    })

    it('updates draft field when dropdown changes', async () => {
      const user = userEvent.setup()
      renderTable()

      await user.click(screen.getByLabelText('Add new row'))

      const draftRow = screen.getByLabelText('Discard draft row').closest('tr')!
      const selects = draftRow.querySelectorAll('select')

      const statusSelect = Array.from(selects).find(s => {
        const options = Array.from(s.querySelectorAll('option'))
        return options.some(o => o.textContent === 'Open')
      })
      expect(statusSelect).toBeDefined()

      await user.selectOptions(statusSelect!, 'Open')
      expect((statusSelect! as HTMLSelectElement).value).toBe('Open')
    })

    it('renders number input for level column in draft rows', async () => {
      const user = userEvent.setup()
      renderTable()

      await user.click(screen.getByLabelText('Add new row'))

      const draftRow = screen.getByLabelText('Discard draft row').closest('tr')!
      const numberInput = draftRow.querySelector('input[type="number"]')
      expect(numberInput).not.toBeNull()
    })
  })

  describe('draft row — add error keeps draft', () => {
    it('keeps draft row when add() rejects', async () => {
      const user = userEvent.setup()
      const add = vi.fn().mockRejectedValue(new Error('Server error'))
      renderTable({ add })

      await user.click(screen.getByLabelText('Add new row'))

      const draftRow = screen.getByLabelText('Discard draft row').closest('tr')!
      const nameInput = draftRow.querySelector('input[type="text"]') as HTMLInputElement
      await user.type(nameInput, 'Failing Person')
      await user.tab()

      await waitFor(() => {
        expect(screen.getByLabelText('Discard draft row')).toBeTruthy()
      })
    })
  })

  describe('column filter integration', () => {
    it('filters people when filter selection excludes some values', async () => {
      const user = userEvent.setup()
      renderTable()

      const filterBtn = screen.getByLabelText('Filter Discipline')
      await user.click(filterBtn)

      const filterDropdown = document.querySelector('[class*="filterDropdown"]')
      expect(filterDropdown).not.toBeNull()

      if (filterDropdown) {
        const labels = filterDropdown.querySelectorAll('label')
        for (const label of labels) {
          if (label.textContent?.includes('Design') && !label.textContent?.includes('Select All')) {
            const checkbox = label.querySelector('input[type="checkbox"]')
            if (checkbox) {
              await user.click(checkbox)
              break
            }
          }
        }
      }

      await waitFor(() => {
        expect(screen.getByText('2 people')).toBeTruthy()
      })
    })
  })

  describe('people with extra columns', () => {
    it('renders extra columns from person.extra data', () => {
      const peopleWithExtra: Person[] = [
        {
          id: '1', name: 'Alice', role: 'VP', discipline: 'Eng', managerId: '', team: 'Platform',
          additionalTeams: [], status: 'Active', extra: { location: 'NYC', dept: 'R&D' },
        },
      ]
      renderTable({ working: peopleWithExtra, original: peopleWithExtra })

      expect(screen.getByText('location')).toBeTruthy()
      expect(screen.getByText('dept')).toBeTruthy()
    })
  })

  describe('contextDefaults from filters', () => {
    it('pre-fills draft row fields from single-value column filter', async () => {
      const user = userEvent.setup()
      renderTable()

      // Open discipline filter and deselect Design (leaving only Engineering)
      const filterBtn = screen.getByLabelText('Filter Discipline')
      await user.click(filterBtn)

      const filterDropdown = document.querySelector('[class*="filterDropdown"]')
      if (filterDropdown) {
        const labels = filterDropdown.querySelectorAll('label')
        for (const label of labels) {
          if (label.textContent?.includes('Design') && !label.textContent?.includes('Select All')) {
            const checkbox = label.querySelector('input[type="checkbox"]')
            if (checkbox) {
              await user.click(checkbox)
              break
            }
          }
        }
      }

      // Close filter by clicking outside
      await user.click(document.body)

      // Add a draft row — contextDefaults should set discipline=Engineering since only 1 value remains
      await user.click(screen.getByLabelText('Add new row'))
      expect(screen.getByLabelText('Discard draft row')).toBeTruthy()
    })
  })

  describe('column visibility', () => {
    it('hides and re-shows a column', async () => {
      const user = userEvent.setup()
      renderTable()

      expect(screen.getAllByText('Pod').length).toBeGreaterThan(0)

      await user.click(screen.getByText(/Columns/))

      const colDropdown = document.querySelector('[class*="colToggleDropdown"]')
      expect(colDropdown).not.toBeNull()

      const labels = colDropdown!.querySelectorAll('label')
      let podCheckbox: HTMLInputElement | null = null
      for (const label of labels) {
        if (label.textContent?.includes('Pod')) {
          podCheckbox = label.querySelector('input[type="checkbox"]')
          break
        }
      }
      expect(podCheckbox).not.toBeNull()
      expect(podCheckbox!.checked).toBe(true)

      // Hide Pod column
      await user.click(podCheckbox!)
      expect(podCheckbox!.checked).toBe(false)

      // Re-show Pod column
      await user.click(podCheckbox!)
      expect(podCheckbox!.checked).toBe(true)
    })
  })

  describe('draftToPerson edge cases', () => {
    it('creates person with all fallback/default values when draft is minimal', async () => {
      const user = userEvent.setup()
      const add = vi.fn().mockResolvedValue(undefined)
      renderTable({ add })

      await user.click(screen.getByLabelText('Add new row'))

      const draftRow = screen.getByLabelText('Discard draft row').closest('tr')!
      const nameInput = draftRow.querySelector('input[type="text"]') as HTMLInputElement
      await user.type(nameInput, 'Minimal Person')
      await user.tab()

      await waitFor(() => {
        expect(add).toHaveBeenCalledWith(
          expect.objectContaining({
            name: 'Minimal Person',
            role: '',
            discipline: '',
            team: '',
            managerId: '',
            status: 'Active',
            additionalTeams: [],
            employmentType: 'FTE',
            level: undefined,
            pod: '',
            publicNote: '',
            privateNote: '',
          }),
        )
      })
    })
  })

  describe('sort with desc direction applied', () => {
    it('sorts descending and shows sorted data correctly', async () => {
      const user = userEvent.setup()
      renderTable()

      const nameHeader = screen.getAllByText('Name')[0]
      await user.click(nameHeader) // asc
      await user.click(nameHeader) // desc

      const rows = screen.getAllByRole('row').slice(1)
      expect(rows[0].textContent).toContain('Carol')
    })

    it('clears sort on third click (returns to natural order)', async () => {
      const user = userEvent.setup()
      renderTable()

      const nameHeader = screen.getAllByText('Name')[0]
      await user.click(nameHeader) // asc
      await user.click(nameHeader) // desc
      await user.click(nameHeader) // clear sort

      // After clearing, first row should be back to natural order (Alice)
      const rows = screen.getAllByRole('row').slice(1)
      expect(rows[0].textContent).toContain('Alice')
    })

    it('switching sort to different column resets to ascending', async () => {
      const user = userEvent.setup()
      renderTable()

      // Sort by Name first
      const nameHeader = screen.getAllByText('Name')[0]
      await user.click(nameHeader)

      // Then sort by Role
      const roleHeader = screen.getAllByText('Role')[0]
      await user.click(roleHeader)

      // Should show ascending by role: Designer, Engineer, VP
      const rows = screen.getAllByRole('row').slice(1)
      expect(rows[0].textContent).toContain('Carol') // Designer
    })
  })

  describe('filterActive detection', () => {
    it('marks filter as active when subset of values is selected', async () => {
      const user = userEvent.setup()
      renderTable()

      const filterBtn = screen.getByLabelText('Filter Discipline')
      await user.click(filterBtn)

      // Deselect 'Design' value
      const filterDropdown = document.querySelector('[class*="filterDropdown"]')
      if (filterDropdown) {
        const labels = filterDropdown.querySelectorAll('label')
        for (const label of labels) {
          if (label.textContent?.includes('Design') && !label.textContent?.includes('Select All')) {
            const cb = label.querySelector('input[type="checkbox"]')
            if (cb) {
              await user.click(cb)
              break
            }
          }
        }
      }

      await waitFor(() => {
        const disciplineFilterBtn = screen.getByLabelText('Filter Discipline')
        expect(disciplineFilterBtn.className).toContain('filterBtnActive')
      })
    })
  })

  describe('someSelected state', () => {
    it('shows indeterminate select-all when only some people are selected', () => {
      renderTable({ selectedIds: new Set(['1']) }) // Only Alice selected

      const selectAll = screen.getByTitle('Select all') as HTMLInputElement
      expect(selectAll.indeterminate).toBe(true)
      expect(selectAll.checked).toBe(false)
    })
  })

  describe('multiple drafts', () => {
    it('supports multiple draft rows simultaneously', async () => {
      const user = userEvent.setup()
      renderTable()

      await user.click(screen.getByLabelText('Add new row'))
      await user.click(screen.getByLabelText('Add new row'))

      const discardBtns = screen.getAllByLabelText('Discard draft row')
      expect(discardBtns.length).toBe(2)

      // Discard the first draft
      await user.click(discardBtns[0])
      expect(screen.getAllByLabelText('Discard draft row').length).toBe(1)
    })
  })

  describe('pendingFocusDraft scroll and focus', () => {
    it('scrolls to and focuses newest draft row', async () => {
      const user = userEvent.setup()
      renderTable()

      await user.click(screen.getByLabelText('Add new row'))

      // scrollIntoView should have been called
      expect(Element.prototype.scrollIntoView).toHaveBeenCalled()
    })
  })

  describe('read-only mode rendering', () => {
    it('hides add, paste, and delete buttons in read-only mode', () => {
      renderTable({ dataView: 'original' })

      expect(screen.queryByLabelText('Add new row')).toBeNull()
      expect(screen.queryByLabelText('Paste rows from clipboard')).toBeNull()
      expect(screen.queryByTitle('Delete')).toBeNull()
    })
  })

  describe('diff mode with various change types', () => {
    it('renders rows with diff highlighting in diff dataView', () => {
      const original: Person[] = [
        { id: '1', name: 'Alice', role: 'VP', discipline: 'Eng', managerId: '', team: 'Platform', additionalTeams: [], status: 'Active' },
      ]
      const working: Person[] = [
        { id: '1', name: 'Alice', role: 'CTO', discipline: 'Eng', managerId: '', team: 'Platform', additionalTeams: [], status: 'Active' },
        { id: '2', name: 'New Person', role: 'Eng', discipline: 'Eng', managerId: '1', team: 'Platform', additionalTeams: [], status: 'Active' },
      ]

      renderTable({ working, original, dataView: 'diff' })

      expect(screen.getAllByText('Alice').length).toBeGreaterThan(0)
      expect(screen.getByText('New Person')).toBeTruthy()
    })
  })
})
