import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import TableView from './TableView'
import type { Person } from '../api/types'

const mockUpdate = vi.fn().mockResolvedValue(undefined)
const mockRemove = vi.fn().mockResolvedValue(undefined)
const mockToggleSelect = vi.fn()
const mockAdd = vi.fn().mockResolvedValue(undefined)

const testPeople: Person[] = [
  {
    id: '1', name: 'Alice', role: 'VP', discipline: 'Eng', managerId: '', team: 'Engineering',
    additionalTeams: [], status: 'Active', employmentType: 'FTE',
  },
  {
    id: '2', name: 'Bob', role: 'Engineer', discipline: 'Eng', managerId: '1', team: 'Platform',
    additionalTeams: [], status: 'Active', employmentType: 'FTE',
  },
]

vi.mock('../store/OrgContext', () => ({
  useOrg: () => ({
    update: mockUpdate,
    remove: mockRemove,
    toggleSelect: mockToggleSelect,
    add: mockAdd,
    working: testPeople,
    pods: [],
    settings: { disciplineOrder: [] },
    original: [],
    recycled: [],
    originalPods: [],
    loaded: true,
    selectedIds: new Set(),
    selectedId: null,
    selectedPodId: null,
    viewMode: 'table' as const,
    dataView: 'working' as const,
    headPersonId: null,
    hiddenEmploymentTypes: new Set(),
    binOpen: false,
    layoutKey: 0,
    pendingMapping: null,
    snapshots: [],
    currentSnapshotName: null,
    autosaveAvailable: null,
    error: null,
    setViewMode: vi.fn(),
    setDataView: vi.fn(),
    setSelectedId: vi.fn(),
    clearSelection: vi.fn(),
    upload: vi.fn(),
    move: vi.fn(),
    reparent: vi.fn(),
    reorder: vi.fn(),
    restore: vi.fn(),
    emptyBin: vi.fn(),
    setBinOpen: vi.fn(),
    confirmMapping: vi.fn(),
    cancelMapping: vi.fn(),
    reflow: vi.fn(),
    saveSnapshot: vi.fn(),
    loadSnapshot: vi.fn(),
    deleteSnapshot: vi.fn(),
    restoreAutosave: vi.fn(),
    dismissAutosave: vi.fn(),
    toggleEmploymentTypeFilter: vi.fn(),
    showAllEmploymentTypes: vi.fn(),
    hideAllEmploymentTypes: vi.fn(),
    setHead: vi.fn(),
    clearError: vi.fn(),
    selectPod: vi.fn(),
    updatePod: vi.fn(),
    createPod: vi.fn(),
    updateSettings: vi.fn(),
  }),
  OrgProvider: ({ children }: { children: React.ReactNode }) => children,
}))

describe('TableView', () => {
  afterEach(() => {
    cleanup()
    vi.clearAllMocks()
  })

  it('cells become editable when clicked in normal mode', async () => {
    const user = userEvent.setup()
    const { container } = render(<TableView people={testPeople} />)

    const firstRow = container.querySelector('tbody tr')!
    const textCells = firstRow.querySelectorAll('td')
    const nameCell = textCells[1]
    await user.click(nameCell)

    const input = nameCell.querySelector('input[type="text"]') as HTMLInputElement
    expect(input).not.toBeNull()
    expect(input.value).toBe('Alice')
  })

  it('cells are not editable in read-only mode', async () => {
    const user = userEvent.setup()
    const { container } = render(<TableView people={testPeople} readOnly={true} />)

    const dataCells = container.querySelectorAll('tbody td')
    const textCell = Array.from(dataCells).find(td => td.querySelector('span'))
    expect(textCell).not.toBeNull()
    await user.click(textCell!)

    const editInputs = container.querySelectorAll('tbody td input:not([type="checkbox"]), tbody td select')
    expect(editInputs).toHaveLength(0)
  })

  it('clicking delete calls remove with person id', async () => {
    const user = userEvent.setup()
    render(<TableView people={testPeople} />)

    const deleteButtons = screen.getAllByTitle('Delete')
    await user.click(deleteButtons[0])
    expect(mockRemove).toHaveBeenCalledWith('1')
  })

  it('clicking second delete calls remove with correct id', async () => {
    const user = userEvent.setup()
    render(<TableView people={testPeople} />)

    const deleteButtons = screen.getAllByTitle('Delete')
    await user.click(deleteButtons[1])
    expect(mockRemove).toHaveBeenCalledWith('2')
  })

  it('clicking checkbox calls toggleSelect with person id', async () => {
    const user = userEvent.setup()
    const { container } = render(<TableView people={testPeople} />)

    const checkboxes = container.querySelectorAll('tbody input[type="checkbox"]')
    await user.click(checkboxes[0])
    expect(mockToggleSelect).toHaveBeenCalledWith('1', true)
  })

  it('shows column visibility dropdown when Columns button is clicked', async () => {
    const user = userEvent.setup()
    render(<TableView people={testPeople} />)

    const colBtn = screen.getByText(/Columns/)
    await user.click(colBtn)

    const checkboxes = document.querySelectorAll('input[type="checkbox"]')
    expect(checkboxes.length).toBeGreaterThan(0)
  })
})
