import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import PodSidebar from './PodSidebar'
import type { Person, Pod } from '../api/types'

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

const manager = makePerson({ id: 'm1', name: 'Manager Alice', managerId: '' })
const member1 = makePerson({ id: 'p1', name: 'Bob Jones', managerId: 'm1', team: 'Platform', pod: 'Alpha' })
const member2 = makePerson({ id: 'p2', name: 'Carol White', managerId: 'm1', team: 'Platform', pod: 'Alpha' })
const otherPerson = makePerson({ id: 'p3', name: 'Dan Green', managerId: 'm1', team: 'Platform', pod: 'Beta' })

const alphaPod: Pod = {
  id: 'pod-1',
  name: 'Alpha',
  team: 'Platform',
  managerId: 'm1',
  publicNote: 'Public info',
  privateNote: 'Private info',
}

const mockOrg: Record<string, unknown> = {}

function resetMockOrg() {
  Object.assign(mockOrg, {
    loaded: true,
    working: [manager, member1, member2, otherPerson] as Person[],
    original: [] as Person[],
    recycled: [] as Person[],
    pods: [alphaPod] as Pod[],
    originalPods: [] as Pod[],
    settings: { disciplineOrder: [] },
    viewMode: 'detail' as const,
    dataView: 'working' as const,
    selectedIds: new Set<string>(),
    selectedId: null as string | null,
    selectedPodId: 'pod-1' as string | null,
    binOpen: false,
    hiddenEmploymentTypes: new Set<string>(),
    headPersonId: null as string | null,
    layoutKey: 0,
    error: null as string | null,
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
    updatePod: vi.fn().mockResolvedValue(undefined),
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

describe('PodSidebar', () => {
  it('returns null when no pod is selected', () => {
    mockOrg.selectedPodId = null
    const { container } = render(<PodSidebar />)
    expect(container.firstChild).toBeNull()
  })

  it('returns null when selectedPodId does not match any pod', () => {
    mockOrg.selectedPodId = 'nonexistent'
    const { container } = render(<PodSidebar />)
    expect(container.firstChild).toBeNull()
  })

  it('renders Pod Details heading', () => {
    render(<PodSidebar />)
    expect(screen.getByText('Pod Details')).toBeDefined()
  })

  it('renders name field with pod name', () => {
    render(<PodSidebar />)
    expect(screen.getByDisplayValue('Alpha')).toBeDefined()
  })

  it('renders team field with pod team (disabled)', () => {
    render(<PodSidebar />)
    const teamLabel = screen.getByText('Team')
    const teamInput = teamLabel.parentElement!.querySelector('input') as HTMLInputElement
    expect(teamInput.value).toBe('Platform')
    expect(teamInput.disabled).toBe(true)
  })

  it('renders member count', () => {
    render(<PodSidebar />)
    expect(screen.getByText('Members')).toBeDefined()
    // member1 and member2 have managerId='m1' and pod='Alpha'
    expect(screen.getByText('2')).toBeDefined()
  })

  it('renders public note field with value', () => {
    render(<PodSidebar />)
    expect(screen.getByDisplayValue('Public info')).toBeDefined()
  })

  it('renders private note field with value', () => {
    render(<PodSidebar />)
    expect(screen.getByDisplayValue('Private info')).toBeDefined()
  })

  it('renders public note placeholder', () => {
    render(<PodSidebar />)
    expect(screen.getByPlaceholderText('Visible on the org chart')).toBeDefined()
  })

  it('renders private note placeholder', () => {
    render(<PodSidebar />)
    expect(screen.getByPlaceholderText('Only visible in this panel')).toBeDefined()
  })

  it('calls updatePod on blur when name has changed', async () => {
    const user = userEvent.setup()
    render(<PodSidebar />)
    const nameInput = screen.getByDisplayValue('Alpha') as HTMLInputElement
    await user.clear(nameInput)
    await user.type(nameInput, 'Alpha Renamed')
    // Tab away to trigger blur
    await user.tab()
    expect(mockOrg.updatePod).toHaveBeenCalledTimes(1)
    expect(mockOrg.updatePod).toHaveBeenCalledWith('pod-1', { name: 'Alpha Renamed' })
  })

  it('does not call updatePod on blur when nothing changed', () => {
    render(<PodSidebar />)
    const nameInput = screen.getByDisplayValue('Alpha') as HTMLInputElement
    fireEvent.blur(nameInput)
    expect(mockOrg.updatePod).not.toHaveBeenCalled()
  })

  it('calls updatePod on blur when public note changed', async () => {
    const user = userEvent.setup()
    render(<PodSidebar />)
    const textarea = screen.getByDisplayValue('Public info') as HTMLTextAreaElement
    await user.clear(textarea)
    await user.type(textarea, 'Updated public')
    await user.tab()
    expect(mockOrg.updatePod).toHaveBeenCalledTimes(1)
    expect(mockOrg.updatePod).toHaveBeenCalledWith('pod-1', { publicNote: 'Updated public' })
  })

  it('calls updatePod on blur when private note changed', async () => {
    const user = userEvent.setup()
    render(<PodSidebar />)
    const textarea = screen.getByDisplayValue('Private info') as HTMLTextAreaElement
    await user.clear(textarea)
    await user.type(textarea, 'Updated private')
    await user.tab()
    expect(mockOrg.updatePod).toHaveBeenCalledTimes(1)
    expect(mockOrg.updatePod).toHaveBeenCalledWith('pod-1', { privateNote: 'Updated private' })
  })
})
