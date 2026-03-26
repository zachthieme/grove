import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import TableView from './TableView'
import type { Person } from '../api/types'
import type { PersonChange } from '../hooks/useOrgDiff'

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

  it('renders column headers', () => {
    render(<TableView people={testPeople} />)

    expect(screen.getByText('Name')).toBeDefined()
    expect(screen.getByText('Role')).toBeDefined()
    expect(screen.getByText('Discipline')).toBeDefined()
    expect(screen.getByText('Team')).toBeDefined()
    expect(screen.getByText('Status')).toBeDefined()
    expect(screen.getByText('Manager')).toBeDefined()
    expect(screen.getByText('Level')).toBeDefined()
  })

  it('renders people data in the table', () => {
    render(<TableView people={testPeople} />)

    // Alice appears in her name cell and also as a manager label for Bob's manager column
    expect(screen.getAllByText('Alice').length).toBeGreaterThanOrEqual(1)
    expect(screen.getByText('VP')).toBeDefined()
    expect(screen.getByText('Engineering')).toBeDefined()
    expect(screen.getByText('Bob')).toBeDefined()
    expect(screen.getByText('Engineer')).toBeDefined()
    expect(screen.getByText('Platform')).toBeDefined()
  })

  it('shows correct row count', () => {
    render(<TableView people={testPeople} />)

    expect(screen.getByText('2 people')).toBeDefined()
  })

  it('shows correct row count with single person', () => {
    render(<TableView people={[testPeople[0]]} />)

    expect(screen.getByText('1 people')).toBeDefined()
  })

  it('shows 0 people when empty', () => {
    render(<TableView people={[]} />)

    expect(screen.getByText('0 people')).toBeDefined()
  })

  it('hides add and paste buttons in read-only mode', () => {
    render(<TableView people={testPeople} readOnly={true} />)

    expect(screen.queryByTitle('Add row')).toBeNull()
    expect(screen.queryByTitle('Paste rows from clipboard')).toBeNull()
  })

  it('shows add and paste buttons in normal mode', () => {
    render(<TableView people={testPeople} />)

    expect(screen.getByTitle('Add row')).toBeDefined()
    expect(screen.getByTitle('Paste rows from clipboard')).toBeDefined()
  })

  it('hides delete buttons in read-only mode', () => {
    render(<TableView people={testPeople} readOnly={true} />)

    const deleteButtons = screen.queryAllByTitle('Delete')
    expect(deleteButtons).toHaveLength(0)
  })

  it('cells are not editable in read-only mode', () => {
    const { container } = render(<TableView people={testPeople} readOnly={true} />)

    // Click on a data cell in the tbody - in read-only mode, no input should appear
    const dataCells = container.querySelectorAll('tbody td')
    // Find a cell that contains text (not an action button cell)
    const textCell = Array.from(dataCells).find(td => td.querySelector('span'))
    expect(textCell).not.toBeNull()
    fireEvent.click(textCell!)

    // In read-only mode, clicking a cell should NOT produce any editing input inside the table body
    // (exclude checkboxes which are always present for selection)
    const editInputs = container.querySelectorAll('tbody td input:not([type="checkbox"]), tbody td select')
    expect(editInputs).toHaveLength(0)
  })

  it('cells become editable when clicked in normal mode', () => {
    const { container } = render(<TableView people={testPeople} />)

    // Find the first data row's first text cell (Name column for Alice)
    const firstRow = container.querySelector('tbody tr')!
    const textCells = firstRow.querySelectorAll('td')
    // Cell 0 is the action cell (expand button); cell 1 is the Name cell
    const nameCell = textCells[1]
    fireEvent.click(nameCell)

    // An input with current value should appear
    const input = nameCell.querySelector('input[type="text"]') as HTMLInputElement
    expect(input).not.toBeNull()
    expect(input.value).toBe('Alice')
  })

  it('renders the Columns toggle button', () => {
    render(<TableView people={testPeople} />)

    // The button text includes a down arrow character
    const colBtn = screen.getByText(/Columns/)
    expect(colBtn).toBeDefined()
  })

  it('shows column visibility dropdown when Columns button is clicked', () => {
    render(<TableView people={testPeople} />)

    const colBtn = screen.getByText(/Columns/)
    fireEvent.click(colBtn)

    // The dropdown should now show checkbox labels for each column
    const checkboxes = document.querySelectorAll('input[type="checkbox"]')
    expect(checkboxes.length).toBeGreaterThan(0)

    // All columns should be listed as labels
    expect(screen.getAllByText('Name').length).toBeGreaterThanOrEqual(2) // header + dropdown
  })

  it('clicking delete calls remove with person id', () => {
    render(<TableView people={testPeople} />)

    const deleteButtons = screen.getAllByTitle('Delete')
    expect(deleteButtons).toHaveLength(2)

    // Click the first delete button (Alice, id='1')
    fireEvent.click(deleteButtons[0])
    expect(mockRemove).toHaveBeenCalledWith('1')
  })

  it('clicking second delete calls remove with correct id', () => {
    render(<TableView people={testPeople} />)

    const deleteButtons = screen.getAllByTitle('Delete')

    // Click the second delete button (Bob, id='2')
    fireEvent.click(deleteButtons[1])
    expect(mockRemove).toHaveBeenCalledWith('2')
  })

  it('applies rowAdded class when change type is added', () => {
    const changes = new Map<string, PersonChange>([
      ['1', { types: new Set(['added']) }],
    ])

    const { container } = render(
      <TableView people={testPeople} changes={changes} />
    )

    const rows = container.querySelectorAll('tbody tr')
    const aliceRow = rows[0]
    expect(aliceRow.className).toContain('rowAdded')
  })

  it('applies rowRemoved class when change type is removed', () => {
    const changes = new Map<string, PersonChange>([
      ['2', { types: new Set(['removed']) }],
    ])

    const { container } = render(
      <TableView people={testPeople} changes={changes} />
    )

    const rows = container.querySelectorAll('tbody tr')
    const bobRow = rows[1]
    expect(bobRow.className).toContain('rowRemoved')
  })

  it('applies rowReporting class when change type is reporting', () => {
    const changes = new Map<string, PersonChange>([
      ['2', { types: new Set(['reporting']) }],
    ])

    const { container } = render(
      <TableView people={testPeople} changes={changes} />
    )

    const rows = container.querySelectorAll('tbody tr')
    const bobRow = rows[1]
    expect(bobRow.className).toContain('rowReporting')
  })

  it('applies rowTitle class when change type is title', () => {
    const changes = new Map<string, PersonChange>([
      ['1', { types: new Set(['title']) }],
    ])

    const { container } = render(
      <TableView people={testPeople} changes={changes} />
    )

    const rows = container.querySelectorAll('tbody tr')
    const aliceRow = rows[0]
    expect(aliceRow.className).toContain('rowTitle')
  })

  it('applies rowReorg class when change type is reorg', () => {
    const changes = new Map<string, PersonChange>([
      ['1', { types: new Set(['reorg']) }],
    ])

    const { container } = render(
      <TableView people={testPeople} changes={changes} />
    )

    const rows = container.querySelectorAll('tbody tr')
    const aliceRow = rows[0]
    expect(aliceRow.className).toContain('rowReorg')
  })

  it('does not apply diff class when no changes', () => {
    const { container } = render(
      <TableView people={testPeople} />
    )

    const rows = container.querySelectorAll('tbody tr')
    for (const row of rows) {
      expect(row.className).not.toContain('rowAdded')
      expect(row.className).not.toContain('rowRemoved')
      expect(row.className).not.toContain('rowReporting')
      expect(row.className).not.toContain('rowTitle')
      expect(row.className).not.toContain('rowReorg')
    }
  })

  it('renders correct number of rows matching people count', () => {
    const { container } = render(
      <TableView people={testPeople} />
    )

    const rows = container.querySelectorAll('tbody tr')
    expect(rows).toHaveLength(2)
  })

  it('renders checkboxes for each row', () => {
    const { container } = render(<TableView people={testPeople} />)

    const checkboxes = container.querySelectorAll('tbody input[type="checkbox"]')
    expect(checkboxes).toHaveLength(2)
  })

  it('clicking checkbox calls toggleSelect with person id', () => {
    const { container } = render(<TableView people={testPeople} />)

    const checkboxes = container.querySelectorAll('tbody input[type="checkbox"]')
    fireEvent.click(checkboxes[0])
    expect(mockToggleSelect).toHaveBeenCalledWith('1', true)
  })
})
