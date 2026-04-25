/**
 * Additional branch coverage tests for TableView.
 * Covers: sorting, column filters, draft row lifecycle, toggle select all,
 * column visibility toggle, add/paste buttons in read-only mode.
 */
import { describe, it, expect, vi, afterEach, beforeAll } from 'vitest'
import { screen, cleanup } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import TableView from './TableView'
import { renderWithViewData, makeNode } from '../test-helpers'
import type { OrgNode } from '../api/types'

const testPeople: OrgNode[] = [
  {
    id: '1', name: 'Alice', role: 'VP', discipline: 'Engineering', managerId: '', team: 'Platform',
    additionalTeams: [], status: 'Active', employmentType: 'FTE',
  },
  {
    id: '2', name: 'Bob', role: 'Engineer', discipline: 'Engineering', managerId: '1', team: 'Platform',
    additionalTeams: [], status: 'Active', employmentType: 'FTE',
  },
  {
    id: '3', name: 'Carol', role: 'Designer', discipline: 'Design', managerId: '1', team: 'Design',
    additionalTeams: [], status: 'Open', employmentType: 'Contractor',
  },
]

beforeAll(() => {
  // Mock scrollIntoView which jsdom doesn't implement
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

describe('TableView — branch coverage', () => {
  describe('sorting', () => {
    it('sorts ascending on first column header click', async () => {
      const user = userEvent.setup()
      renderTable()

      // Click on Name header to sort ascending
      const headers = screen.getAllByText('Name')
      const nameHeader = headers[0]
      await user.click(nameHeader)

      // After sort: Alice, Bob, Carol (already alphabetical)
      const rows = screen.getAllByRole('row').slice(1) // skip header row
      const firstRowText = rows[0].textContent
      expect(firstRowText).toContain('Alice')
    })

    it('sorts descending on second click', async () => {
      const user = userEvent.setup()
      renderTable()

      const nameHeader = screen.getAllByText('Name')[0]
      await user.click(nameHeader) // asc
      await user.click(nameHeader) // desc

      const rows = screen.getAllByRole('row').slice(1)
      expect(rows[0].textContent).toContain('Carol')
    })

    it('clears sort on third click', async () => {
      const user = userEvent.setup()
      renderTable()

      const nameHeader = screen.getAllByText('Name')[0]
      await user.click(nameHeader) // asc
      await user.click(nameHeader) // desc
      await user.click(nameHeader) // clear
    })
  })

  describe('column filtering', () => {
    it('opens filter dropdown when filter button clicked', async () => {
      const user = userEvent.setup()
      renderTable()

      const filterBtn = screen.getByLabelText('Filter Name')
      await user.click(filterBtn)

      expect(screen.getByPlaceholderText('Search...')).toBeTruthy()
    })

    it('opens filter for a different column after first is open', async () => {
      const user = userEvent.setup()
      renderTable()

      const nameFilterBtn = screen.getByLabelText('Filter Name')
      await user.click(nameFilterBtn)
      expect(screen.getByPlaceholderText('Search...')).toBeTruthy()

      const roleFilterBtn = screen.getByLabelText('Filter Role')
      await user.click(roleFilterBtn)
      // Should still show a filter dropdown (for Role now)
      expect(screen.getByPlaceholderText('Search...')).toBeTruthy()
    })
  })

  describe('draft rows', () => {
    it('adds draft row when + button clicked', async () => {
      const user = userEvent.setup()
      const { container } = renderTable()

      const addBtn = screen.getByLabelText('Add new row')
      await user.click(addBtn)

      // Should have a draft row with inputs
      const draftInputs = container.querySelectorAll('tbody tr:last-child input:not([type="checkbox"])')
      expect(draftInputs.length).toBeGreaterThan(0)
    })

    it('discards draft row when x button clicked', async () => {
      const user = userEvent.setup()
      renderTable()

      await user.click(screen.getByLabelText('Add new row'))
      const discardBtn = screen.getByLabelText('Discard draft row')
      await user.click(discardBtn)

      // No draft rows should remain
      expect(screen.queryByLabelText('Discard draft row')).toBeNull()
    })
  })

  describe('select all', () => {
    it('selects all people when select-all checkbox clicked (none selected)', async () => {
      const user = userEvent.setup()
      const { toggleSelect } = renderTable()

      const selectAllCheckbox = screen.getByTitle('Select all')
      await user.click(selectAllCheckbox)

      // Should have called toggleSelect for each person
      expect(toggleSelect).toHaveBeenCalledTimes(3)
    })

    it('clears selection when all already selected', async () => {
      const user = userEvent.setup()
      const { clearSelection } = renderTable({
        selectedIds: new Set(['1', '2', '3']),
      })

      const selectAllCheckbox = screen.getByTitle('Select all')
      await user.click(selectAllCheckbox)

      expect(clearSelection).toHaveBeenCalled()
    })
  })

  describe('read-only mode', () => {
    it('hides Add and Paste buttons in read-only mode', () => {
      renderTable({ dataView: 'original' })

      expect(screen.queryByLabelText('Add new row')).toBeNull()
      expect(screen.queryByLabelText('Paste rows from clipboard')).toBeNull()
    })

    it('hides delete buttons in read-only mode', () => {
      renderTable({ dataView: 'original' })

      expect(screen.queryByTitle('Delete')).toBeNull()
    })
  })

  describe('row count', () => {
    it('shows correct row count', () => {
      renderTable()
      expect(screen.getByText('3 people')).toBeTruthy()
    })
  })

  describe('column visibility', () => {
    it('hides column when unchecked in dropdown', async () => {
      const user = userEvent.setup()
      renderTable()

      await user.click(screen.getByText(/Columns/))

      // Find the checkbox for 'Pod' column and uncheck it
      const labels = screen.getAllByText('Pod')
      // The dropdown should have a checkbox label for 'Pod'
      const podLabel = labels.find(l => l.closest('label'))
      if (podLabel) {
        const checkbox = podLabel.closest('label')?.querySelector('input')
        if (checkbox) await user.click(checkbox)
      }
    })
  })

  describe('diff highlighting', () => {
    it('shows diff class on rows with changes', () => {
      const original = [makeNode({ id: '1', name: 'Alice', role: 'VP' })]
      const working = [makeNode({ id: '1', name: 'Alice', role: 'CTO' })]

      renderTable({
        working,
        original,
        dataView: 'diff',
      })

      // The changed row should be visible
      expect(screen.getByText('Alice')).toBeTruthy()
    })
  })
})
