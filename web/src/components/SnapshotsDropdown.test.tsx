import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import SnapshotsDropdown from './SnapshotsDropdown'
import type { Person, SnapshotInfo } from '../api/types'

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
    loaded: true, working: [makePerson()] as Person[], original: [] as Person[], recycled: [] as Person[],
    pods: [], originalPods: [], settings: { disciplineOrder: [] },
    viewMode: 'detail', dataView: 'working', selectedIds: new Set(),
    selectedId: null, selectedPodId: null, binOpen: false, hiddenEmploymentTypes: new Set(),
    headPersonId: null, layoutKey: 0, error: null, pendingMapping: null,
    snapshots: [] as SnapshotInfo[], currentSnapshotName: null as string | null, autosaveAvailable: null,
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

describe('SnapshotsDropdown', () => {
  beforeEach(() => resetMockOrg())
  afterEach(() => cleanup())

  it('shows "Working" label when currentSnapshotName is null', () => {
    mockOrg.currentSnapshotName = null
    render(<SnapshotsDropdown />)
    expect(screen.getByRole('button', { name: 'Snapshot: Working' })).toBeDefined()
  })

  it('shows "Original" label when currentSnapshotName is __original__', () => {
    mockOrg.currentSnapshotName = '__original__'
    render(<SnapshotsDropdown />)
    expect(screen.getByRole('button', { name: 'Snapshot: Original' })).toBeDefined()
  })

  it('shows the snapshot name as label when currentSnapshotName is a custom name', () => {
    mockOrg.currentSnapshotName = 'My Snapshot'
    render(<SnapshotsDropdown />)
    expect(screen.getByRole('button', { name: 'Snapshot: My Snapshot' })).toBeDefined()
  })

  it('has aria-expanded="false" initially', () => {
    render(<SnapshotsDropdown />)
    const trigger = screen.getByRole('button', { name: /Snapshot:/ })
    expect(trigger.getAttribute('aria-expanded')).toBe('false')
  })

  it('opens dropdown on click and sets aria-expanded="true"', async () => {
    const user = userEvent.setup()
    render(<SnapshotsDropdown />)
    const trigger = screen.getByRole('button', { name: /Snapshot:/ })
    await user.click(trigger)
    expect(trigger.getAttribute('aria-expanded')).toBe('true')
    expect(screen.getByText('Save As...')).toBeDefined()
    expect(screen.getByText('Original')).toBeDefined()
  })

  it('closes dropdown on second click', async () => {
    const user = userEvent.setup()
    render(<SnapshotsDropdown />)
    const trigger = screen.getByRole('button', { name: /Snapshot:/ })
    await user.click(trigger)
    expect(trigger.getAttribute('aria-expanded')).toBe('true')
    await user.click(trigger)
    expect(trigger.getAttribute('aria-expanded')).toBe('false')
  })

  it('lists all snapshots in the dropdown menu', async () => {
    const user = userEvent.setup()
    mockOrg.snapshots = [
      { name: 'Sprint 1', timestamp: '2025-01-15T10:30:00Z' },
      { name: 'Sprint 2', timestamp: '2025-02-15T10:30:00Z' },
    ]
    render(<SnapshotsDropdown />)
    await user.click(screen.getByRole('button', { name: /Snapshot:/ }))
    expect(screen.getByText('Sprint 1')).toBeDefined()
    expect(screen.getByText('Sprint 2')).toBeDefined()
  })

  it('calls loadSnapshot when a snapshot item is clicked', async () => {
    const user = userEvent.setup()
    const loadFn = vi.fn()
    mockOrg.loadSnapshot = loadFn
    mockOrg.snapshots = [{ name: 'Sprint 1', timestamp: '2025-01-15T10:30:00Z' }]
    render(<SnapshotsDropdown />)
    await user.click(screen.getByRole('button', { name: /Snapshot:/ }))
    await user.click(screen.getByText('Sprint 1'))
    expect(loadFn).toHaveBeenCalledWith('Sprint 1')
  })

  it('calls loadSnapshot with __original__ when Original is clicked', async () => {
    const user = userEvent.setup()
    const loadFn = vi.fn()
    mockOrg.loadSnapshot = loadFn
    render(<SnapshotsDropdown />)
    await user.click(screen.getByRole('button', { name: /Snapshot:/ }))
    // The Original item in the menu (not the trigger label)
    await user.click(screen.getByText('Original'))
    expect(loadFn).toHaveBeenCalledWith('__original__')
  })

  it('calls deleteSnapshot when delete button is clicked', async () => {
    const user = userEvent.setup()
    const deleteFn = vi.fn()
    mockOrg.deleteSnapshot = deleteFn
    mockOrg.snapshots = [{ name: 'Sprint 1', timestamp: '2025-01-15T10:30:00Z' }]
    render(<SnapshotsDropdown />)
    await user.click(screen.getByRole('button', { name: /Snapshot:/ }))
    await user.click(screen.getByRole('button', { name: 'Delete snapshot Sprint 1' }))
    expect(deleteFn).toHaveBeenCalledWith('Sprint 1')
  })

  it('calls saveSnapshot via prompt when Save As is clicked', async () => {
    const user = userEvent.setup()
    const saveFn = vi.fn()
    mockOrg.saveSnapshot = saveFn
    vi.spyOn(window, 'prompt').mockReturnValue('New Name')
    render(<SnapshotsDropdown />)
    await user.click(screen.getByRole('button', { name: /Snapshot:/ }))
    await user.click(screen.getByText('Save As...'))
    expect(saveFn).toHaveBeenCalledWith('New Name')
    vi.restoreAllMocks()
  })

  it('does not call saveSnapshot when prompt is cancelled', async () => {
    const user = userEvent.setup()
    const saveFn = vi.fn()
    mockOrg.saveSnapshot = saveFn
    vi.spyOn(window, 'prompt').mockReturnValue(null)
    render(<SnapshotsDropdown />)
    await user.click(screen.getByRole('button', { name: /Snapshot:/ }))
    await user.click(screen.getByText('Save As...'))
    expect(saveFn).not.toHaveBeenCalled()
    vi.restoreAllMocks()
  })
})
