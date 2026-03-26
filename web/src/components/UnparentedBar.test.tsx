import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import UnparentedBar from './UnparentedBar'
import type { Person } from '../api/types'

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
    ...overrides,
  }
}

const mockOrg: Record<string, unknown> = {}

function resetMockOrg() {
  Object.assign(mockOrg, {
    loaded: true,
    working: [] as Person[],
    original: [] as Person[],
    recycled: [] as Person[],
    pods: [],
    originalPods: [],
    settings: { disciplineOrder: [] },
    viewMode: 'detail' as const,
    dataView: 'working' as const,
    selectedIds: new Set<string>(),
    selectedId: null,
    selectedPodId: null,
    binOpen: false,
    hiddenEmploymentTypes: new Set<string>(),
    headPersonId: null,
    layoutKey: 0,
    error: null,
    pendingMapping: null,
    snapshots: [],
    currentSnapshotName: null,
    autosaveAvailable: null,
    setViewMode: vi.fn(),
    setDataView: vi.fn(),
    toggleSelect: vi.fn(),
    setSelectedId: vi.fn(),
    clearSelection: vi.fn(),
    upload: vi.fn(),
    move: vi.fn(),
    reparent: vi.fn(),
    reorder: vi.fn(),
    update: vi.fn(),
    add: vi.fn(),
    remove: vi.fn(),
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
    setError: vi.fn(),
    selectPod: vi.fn(),
    batchSelect: vi.fn(),
    updatePod: vi.fn(),
    createPod: vi.fn(),
    updateSettings: vi.fn(),
  })
}

vi.mock('../store/OrgContext', () => ({
  useOrg: () => mockOrg,
}))

beforeEach(() => {
  vi.clearAllMocks()
  resetMockOrg()
})

afterEach(() => cleanup())

describe('UnparentedBar', () => {
  it('returns null when there are no orphans', () => {
    // Everyone has a manager or has reports
    const manager = makePerson({ id: 'm1', name: 'Manager', managerId: '' })
    const report = makePerson({ id: 'r1', name: 'Report', managerId: 'm1' })
    mockOrg.working = [manager, report]
    const { container } = render(<UnparentedBar />)
    expect(container.firstChild).toBeNull()
  })

  it('returns null when working is empty', () => {
    mockOrg.working = []
    const { container } = render(<UnparentedBar />)
    expect(container.firstChild).toBeNull()
  })

  it('renders with orphan count (singular)', () => {
    // One orphan: no manager AND no reports
    const orphan = makePerson({ id: 'o1', name: 'Orphan Alice', managerId: '' })
    mockOrg.working = [orphan]
    render(<UnparentedBar />)
    expect(screen.getByText(/1 unparented person/)).toBeDefined()
  })

  it('renders with orphan count (plural)', () => {
    const orphan1 = makePerson({ id: 'o1', name: 'Orphan Alice', managerId: '' })
    const orphan2 = makePerson({ id: 'o2', name: 'Orphan Bob', managerId: '' })
    mockOrg.working = [orphan1, orphan2]
    render(<UnparentedBar />)
    expect(screen.getByText(/2 unparented people/)).toBeDefined()
  })

  it('starts collapsed (orphan names not visible)', () => {
    const orphan = makePerson({ id: 'o1', name: 'Orphan Alice', managerId: '' })
    mockOrg.working = [orphan]
    render(<UnparentedBar />)
    expect(screen.queryByText('Orphan Alice')).toBeNull()
  })

  it('expands to show orphan names when toggle is clicked', async () => {
    const user = userEvent.setup()
    const orphan = makePerson({ id: 'o1', name: 'Orphan Alice', managerId: '' })
    mockOrg.working = [orphan]
    render(<UnparentedBar />)
    await user.click(screen.getByText(/1 unparented person/))
    expect(screen.getByText('Orphan Alice')).toBeDefined()
  })

  it('collapses again when toggle is clicked twice', async () => {
    const user = userEvent.setup()
    const orphan = makePerson({ id: 'o1', name: 'Orphan Alice', managerId: '' })
    mockOrg.working = [orphan]
    render(<UnparentedBar />)
    const toggle = screen.getByText(/1 unparented person/)
    await user.click(toggle)
    expect(screen.getByText('Orphan Alice')).toBeDefined()
    await user.click(toggle)
    expect(screen.queryByText('Orphan Alice')).toBeNull()
  })

  it('calls toggleSelect when an orphan name is clicked', async () => {
    const user = userEvent.setup()
    const orphan = makePerson({ id: 'o1', name: 'Orphan Alice', managerId: '' })
    mockOrg.working = [orphan]
    render(<UnparentedBar />)
    await user.click(screen.getByText(/1 unparented person/))
    await user.click(screen.getByText('Orphan Alice'))
    expect(mockOrg.toggleSelect).toHaveBeenCalledTimes(1)
    expect(mockOrg.toggleSelect).toHaveBeenCalledWith('o1', false)
  })

  it('does not count tree roots (people with no manager but having reports) as orphans', () => {
    // treeRoot has no manager but has a report -> NOT an orphan
    const treeRoot = makePerson({ id: 'tr1', name: 'Tree Root', managerId: '' })
    const report = makePerson({ id: 'r1', name: 'Report', managerId: 'tr1' })
    mockOrg.working = [treeRoot, report]
    const { container } = render(<UnparentedBar />)
    expect(container.firstChild).toBeNull()
  })

  it('correctly distinguishes orphans from tree roots', async () => {
    const user = userEvent.setup()
    // treeRoot: no manager, has reports -> not orphan
    // orphan: no manager, no reports -> orphan
    const treeRoot = makePerson({ id: 'tr1', name: 'Tree Root', managerId: '' })
    const report = makePerson({ id: 'r1', name: 'Report', managerId: 'tr1' })
    const orphan = makePerson({ id: 'o1', name: 'Real Orphan', managerId: '' })
    mockOrg.working = [treeRoot, report, orphan]
    render(<UnparentedBar />)
    expect(screen.getByText(/1 unparented person/)).toBeDefined()
    await user.click(screen.getByText(/1 unparented person/))
    expect(screen.getByText('Real Orphan')).toBeDefined()
    expect(screen.queryByText('Tree Root')).toBeNull()
  })
})
