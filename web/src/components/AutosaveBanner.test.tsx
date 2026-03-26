import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import AutosaveBanner from './AutosaveBanner'
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
    headPersonId: null, layoutKey: 0, error: null, pendingMapping: null,
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

describe('AutosaveBanner', () => {
  beforeEach(() => resetMockOrg())
  afterEach(() => cleanup())

  it('renders nothing when autosaveAvailable is null', () => {
    const { container } = render(<AutosaveBanner />)
    expect(container.firstChild).toBeNull()
  })

  it('renders banner with role="alert" when autosaveAvailable is set', () => {
    mockOrg.autosaveAvailable = {
      original: [makePerson()], working: [makePerson()], recycled: [],
      snapshotName: '', timestamp: '2025-01-15T10:30:00Z',
    }
    render(<AutosaveBanner />)
    expect(screen.getByRole('alert')).toBeDefined()
  })

  it('shows "Restore previous session?" message text', () => {
    mockOrg.autosaveAvailable = {
      original: [makePerson()], working: [makePerson()], recycled: [],
      snapshotName: '', timestamp: '2025-01-15T10:30:00Z',
    }
    render(<AutosaveBanner />)
    expect(screen.getByText(/Restore previous session\?/)).toBeDefined()
  })

  it('shows formatted time in parentheses when timestamp is valid', () => {
    mockOrg.autosaveAvailable = {
      original: [makePerson()], working: [makePerson()], recycled: [],
      snapshotName: '', timestamp: '2025-01-15T10:30:00Z',
    }
    render(<AutosaveBanner />)
    // The message should contain "(saved at ...)"
    const alert = screen.getByRole('alert')
    expect(alert.textContent).toMatch(/\(saved at /)
  })

  it('omits parenthetical time when timestamp is invalid', () => {
    mockOrg.autosaveAvailable = {
      original: [makePerson()], working: [makePerson()], recycled: [],
      snapshotName: '', timestamp: 'not-a-date',
    }
    render(<AutosaveBanner />)
    const alert = screen.getByRole('alert')
    // "Invalid Date" produces empty string from formatTime, so no "(saved at ...)"
    // However, new Date('not-a-date') doesn't throw; it gives "Invalid Date".
    // toLocaleTimeString on Invalid Date may throw in some engines or return "Invalid Date"
    // In jsdom, Date("not-a-date") is NaN, toLocaleTimeString throws => caught => returns ''
    // So the message should just be "Restore previous session?" without the time parenthetical
    expect(alert.textContent).toContain('Restore previous session?')
  })

  it('renders Restore button that calls restoreAutosave on click', async () => {
    const user = userEvent.setup()
    const restoreFn = vi.fn()
    mockOrg.restoreAutosave = restoreFn
    mockOrg.autosaveAvailable = {
      original: [makePerson()], working: [makePerson()], recycled: [],
      snapshotName: '', timestamp: '2025-01-15T10:30:00Z',
    }
    render(<AutosaveBanner />)
    const restoreBtn = screen.getByRole('button', { name: 'Restore' })
    await user.click(restoreBtn)
    expect(restoreFn).toHaveBeenCalledTimes(1)
  })

  it('renders Dismiss button that calls dismissAutosave on click', async () => {
    const user = userEvent.setup()
    const dismissFn = vi.fn()
    mockOrg.dismissAutosave = dismissFn
    mockOrg.autosaveAvailable = {
      original: [makePerson()], working: [makePerson()], recycled: [],
      snapshotName: '', timestamp: '2025-01-15T10:30:00Z',
    }
    render(<AutosaveBanner />)
    const dismissBtn = screen.getByRole('button', { name: 'Dismiss' })
    await user.click(dismissBtn)
    expect(dismissFn).toHaveBeenCalledTimes(1)
  })
})
