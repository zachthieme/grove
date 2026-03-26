import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import SettingsModal from './SettingsModal'
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
    working: [
      makePerson({ id: 'a1', discipline: 'Engineering' }),
      makePerson({ id: 'b2', discipline: 'Design' }),
      makePerson({ id: 'c3', discipline: 'Product' }),
      makePerson({ id: 'd4', discipline: 'Engineering' }), // duplicate discipline
    ] as Person[],
    original: [] as Person[],
    recycled: [] as Person[],
    pods: [],
    originalPods: [],
    settings: { disciplineOrder: [] as string[] },
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
    updateSettings: vi.fn().mockResolvedValue(undefined),
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

describe('SettingsModal', () => {
  it('renders the Settings title', () => {
    render(<SettingsModal onClose={vi.fn()} />)
    expect(screen.getByText('Settings')).toBeDefined()
  })

  it('renders Discipline Order section title', () => {
    render(<SettingsModal onClose={vi.fn()} />)
    expect(screen.getByText('Discipline Order')).toBeDefined()
  })

  it('renders hint text about drag to reorder', () => {
    render(<SettingsModal onClose={vi.fn()} />)
    expect(screen.getByText('Drag to reorder. People are sorted by this order within each pod.')).toBeDefined()
  })

  it('lists unique disciplines from working data (sorted)', () => {
    render(<SettingsModal onClose={vi.fn()} />)
    // 3 unique disciplines: Design, Engineering, Product (sorted alphabetically)
    const items = screen.getAllByRole('listitem')
    expect(items.length).toBe(3)
    expect(items[0].textContent).toContain('Design')
    expect(items[1].textContent).toContain('Engineering')
    expect(items[2].textContent).toContain('Product')
  })

  it('renders Cancel button that calls onClose', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    render(<SettingsModal onClose={onClose} />)
    await user.click(screen.getByText('Cancel'))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('renders Save button that calls updateSettings and onClose', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    render(<SettingsModal onClose={onClose} />)
    await user.click(screen.getByText('Save'))
    expect(mockOrg.updateSettings).toHaveBeenCalledTimes(1)
    expect(mockOrg.updateSettings).toHaveBeenCalledWith({
      disciplineOrder: ['Design', 'Engineering', 'Product'],
    })
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('calls onClose when overlay is clicked', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    const { container } = render(<SettingsModal onClose={onClose} />)
    // The overlay is the outermost div
    const overlay = container.firstChild as HTMLElement
    await user.click(overlay)
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('does not call onClose when inner modal content is clicked', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    render(<SettingsModal onClose={onClose} />)
    // Click on the title, which is inside the modal (stopPropagation)
    await user.click(screen.getByText('Settings'))
    expect(onClose).not.toHaveBeenCalled()
  })

  it('shows empty state message when no disciplines exist', () => {
    mockOrg.working = [] as Person[]
    render(<SettingsModal onClose={vi.fn()} />)
    expect(screen.getByText('No disciplines found in current data.')).toBeDefined()
  })

  it('preserves existing discipline order from settings', async () => {
    // Set a custom order that differs from alphabetical
    ;(mockOrg.settings as { disciplineOrder: string[] }).disciplineOrder = ['Product', 'Engineering', 'Design']
    render(<SettingsModal onClose={vi.fn()} />)
    const items = screen.getAllByRole('listitem')
    expect(items[0].textContent).toContain('Product')
    expect(items[1].textContent).toContain('Engineering')
    expect(items[2].textContent).toContain('Design')
  })
})
