import { describe, it, expect, vi, afterEach, beforeAll } from 'vitest'
import { screen, cleanup } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import TableView from './TableView'
import { renderWithViewData } from '../test-helpers'
import type { OrgNode } from '../api/types'

beforeAll(() => {
  Element.prototype.scrollIntoView = vi.fn()
})

const testPeople: OrgNode[] = [
  {
    id: '1', name: 'Alice', role: 'VP', discipline: 'Eng', managerId: '', team: 'Engineering',
    additionalTeams: [], status: 'Active', employmentType: 'FTE',
  },
  {
    id: '2', name: 'Bob', role: 'Engineer', discipline: 'Eng', managerId: '1', team: 'Platform',
    additionalTeams: [], status: 'Active', employmentType: 'FTE',
  },
]

describe('TableView', () => {
  afterEach(() => {
    cleanup()
    vi.clearAllMocks()
  })

  function renderTable(overrides = {}) {
    const update = vi.fn().mockResolvedValue(undefined)
    const remove = vi.fn().mockResolvedValue(undefined)
    const toggleSelect = vi.fn()
    const add = vi.fn().mockResolvedValue(undefined)
    const ctx = {
      update,
      remove,
      toggleSelect,
      add,
      working: testPeople,
      original: testPeople,
      viewMode: 'table' as const,
      dataView: 'working' as const,
      ...overrides,
    }
    const result = renderWithViewData(<TableView />, ctx)
    return { ...result, update, remove, toggleSelect, add }
  }

  function renderTableReadOnly(overrides = {}) {
    const ctx = {
      working: testPeople,
      original: testPeople,
      viewMode: 'table' as const,
      dataView: 'original' as const,
      ...overrides,
    }
    return renderWithViewData(<TableView />, ctx)
  }

  it('[VIEW-003] cells become editable when clicked in normal mode', async () => {
    const user = userEvent.setup()
    const { container } = renderTable()

    const firstRow = container.querySelector('tbody tr')!
    const textCells = firstRow.querySelectorAll('td')
    const nameCell = textCells[1]
    await user.click(nameCell)

    const input = nameCell.querySelector('input[type="text"]') as HTMLInputElement
    expect(input).not.toBeNull()
    expect(input.value).toBe('Alice')
  })

  it('[VIEW-003] cells are not editable in read-only mode', async () => {
    const user = userEvent.setup()
    const { container } = renderTableReadOnly()

    const dataCells = container.querySelectorAll('tbody td')
    const textCell = Array.from(dataCells).find(td => td.querySelector('span'))
    expect(textCell).not.toBeNull()
    await user.click(textCell!)

    const editInputs = container.querySelectorAll('tbody td input:not([type="checkbox"]), tbody td select')
    expect(editInputs).toHaveLength(0)
  })

  it('[VIEW-003] clicking delete calls remove with person id', async () => {
    const user = userEvent.setup()
    const { remove } = renderTable()

    const deleteButtons = screen.getAllByTitle('Delete')
    await user.click(deleteButtons[0])
    expect(remove).toHaveBeenCalledWith('1')
  })

  it('[VIEW-003] clicking second delete calls remove with correct id', async () => {
    const user = userEvent.setup()
    const { remove } = renderTable()

    const deleteButtons = screen.getAllByTitle('Delete')
    await user.click(deleteButtons[1])
    expect(remove).toHaveBeenCalledWith('2')
  })

  it('[VIEW-003] clicking checkbox calls toggleSelect with person id', async () => {
    const user = userEvent.setup()
    const { container, toggleSelect } = renderTable()

    const checkboxes = container.querySelectorAll('tbody input[type="checkbox"]')
    await user.click(checkboxes[0])
    expect(toggleSelect).toHaveBeenCalledWith('1', true)
  })

  it('[VIEW-003] shows column visibility dropdown when Columns button is clicked', async () => {
    const user = userEvent.setup()
    renderTable()

    const colBtn = screen.getByText(/Columns/)
    await user.click(colBtn)

    const checkboxes = document.querySelectorAll('input[type="checkbox"]')
    expect(checkboxes.length).toBeGreaterThan(0)
  })

  // Scenarios: VIEW-003
  describe('edge states', () => {
    it('[VIEW-003] renders table headers when working is empty', () => {
      renderWithViewData(<TableView />, {
        working: [],
        original: [],
        viewMode: 'table' as const,
        dataView: 'working' as const,
      })
      // Table headers must always render — user can still add rows
      expect(screen.getByRole('table')).toBeTruthy()
      expect(screen.getAllByRole('columnheader').length).toBeGreaterThan(0)
    })

    it('[VIEW-003] add button works when working is empty', async () => {
      const user = userEvent.setup()
      const add = vi.fn().mockResolvedValue(undefined)
      renderWithViewData(<TableView />, {
        working: [],
        original: [],
        viewMode: 'table' as const,
        dataView: 'working' as const,
        add,
      })
      const addBtn = screen.getByTitle('Add row')
      await user.click(addBtn)
      // A draft row should appear (input for name)
      const nameInput = screen.queryByPlaceholderText('Name')
      expect(nameInput).not.toBeNull()
    })
  })
})
