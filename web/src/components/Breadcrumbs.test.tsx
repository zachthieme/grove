import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import Breadcrumbs from './Breadcrumbs'
import type { Person } from '../api/types'

function makePerson(overrides: Partial<Person> = {}): Person {
  return {
    id: '1',
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
    loaded: true, working: [] as Person[], original: [] as Person[], recycled: [] as Person[],
    pods: [], originalPods: [], settings: { disciplineOrder: [] },
    viewMode: 'detail', dataView: 'working', selectedIds: new Set(),
    selectedId: null, selectedPodId: null, binOpen: false, hiddenEmploymentTypes: new Set(),
    headPersonId: null as string | null, layoutKey: 0, error: null, pendingMapping: null,
    snapshots: [], currentSnapshotName: null, autosaveAvailable: null,
    setViewMode: vi.fn(), setDataView: vi.fn(), toggleSelect: vi.fn(),
    setSelectedId: vi.fn(), clearSelection: vi.fn(),
    upload: vi.fn(), move: vi.fn(), reparent: vi.fn(), reorder: vi.fn(),
    update: vi.fn(), add: vi.fn(), remove: vi.fn(), restore: vi.fn(),
    emptyBin: vi.fn(), setBinOpen: vi.fn(), confirmMapping: vi.fn(),
    cancelMapping: vi.fn(), reflow: vi.fn(), saveSnapshot: vi.fn(),
    loadSnapshot: vi.fn(), deleteSnapshot: vi.fn(), restoreAutosave: vi.fn(),
    dismissAutosave: vi.fn(), toggleEmploymentTypeFilter: vi.fn(),
    showAllEmploymentTypes: vi.fn(), hideAllEmploymentTypes: vi.fn(),
    setHead: vi.fn(), clearError: vi.fn(), setError: vi.fn(),
    selectPod: vi.fn(), batchSelect: vi.fn(), updatePod: vi.fn(),
    createPod: vi.fn(), updateSettings: vi.fn(),
  })
}

vi.mock('../store/OrgContext', () => ({
  useOrg: () => mockOrg,
}))

describe('Breadcrumbs', () => {
  beforeEach(() => resetMockOrg())
  afterEach(() => cleanup())

  it('renders nothing when headPersonId is null', () => {
    mockOrg.headPersonId = null
    const { container } = render(<Breadcrumbs />)
    expect(container.firstChild).toBeNull()
  })

  it('renders "All" button and person name when headPersonId is set', () => {
    mockOrg.headPersonId = 'p1'
    mockOrg.working = [makePerson({ id: 'p1', name: 'Alice' })]
    render(<Breadcrumbs />)
    expect(screen.getByText('All')).toBeDefined()
    expect(screen.getByText('Alice')).toBeDefined()
  })

  it('calls setHead(null) when "All" button is clicked', async () => {
    const user = userEvent.setup()
    const setHeadFn = vi.fn()
    mockOrg.setHead = setHeadFn
    mockOrg.headPersonId = 'p1'
    mockOrg.working = [makePerson({ id: 'p1', name: 'Alice' })]
    render(<Breadcrumbs />)
    await user.click(screen.getByText('All'))
    expect(setHeadFn).toHaveBeenCalledWith(null)
  })

  it('renders a deep chain of ancestors as buttons and the current as text', () => {
    mockOrg.headPersonId = 'p3'
    mockOrg.working = [
      makePerson({ id: 'p1', name: 'CEO', managerId: '' }),
      makePerson({ id: 'p2', name: 'VP', managerId: 'p1' }),
      makePerson({ id: 'p3', name: 'Director', managerId: 'p2' }),
    ]
    render(<Breadcrumbs />)

    // Ancestors should be buttons
    const ceoBtn = screen.getByRole('button', { name: 'CEO' })
    expect(ceoBtn).toBeDefined()
    const vpBtn = screen.getByRole('button', { name: 'VP' })
    expect(vpBtn).toBeDefined()

    // Current (last) should be text, not a button
    const directorText = screen.getByText('Director')
    expect(directorText.tagName).toBe('SPAN')
  })

  it('calls setHead with ancestor id when ancestor button is clicked', async () => {
    const user = userEvent.setup()
    const setHeadFn = vi.fn()
    mockOrg.setHead = setHeadFn
    mockOrg.headPersonId = 'p3'
    mockOrg.working = [
      makePerson({ id: 'p1', name: 'CEO', managerId: '' }),
      makePerson({ id: 'p2', name: 'VP', managerId: 'p1' }),
      makePerson({ id: 'p3', name: 'Director', managerId: 'p2' }),
    ]
    render(<Breadcrumbs />)
    await user.click(screen.getByRole('button', { name: 'CEO' }))
    expect(setHeadFn).toHaveBeenCalledWith('p1')
  })

  it('renders separator characters between breadcrumb items', () => {
    mockOrg.headPersonId = 'p2'
    mockOrg.working = [
      makePerson({ id: 'p1', name: 'CEO', managerId: '' }),
      makePerson({ id: 'p2', name: 'VP', managerId: 'p1' }),
    ]
    render(<Breadcrumbs />)
    // The separator is \u203A (single right-pointing angle quotation mark)
    const separators = screen.getAllByText('\u203A')
    expect(separators.length).toBe(2) // one for each crumb in the chain
  })

  it('renders a single-level breadcrumb with only one name', () => {
    mockOrg.headPersonId = 'p1'
    mockOrg.working = [makePerson({ id: 'p1', name: 'Solo', managerId: '' })]
    render(<Breadcrumbs />)
    expect(screen.getByText('All')).toBeDefined()
    expect(screen.getByText('Solo')).toBeDefined()
    // Solo is the current item, so it should be a span not a button
    const soloEl = screen.getByText('Solo')
    expect(soloEl.tagName).toBe('SPAN')
  })
})
