import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import RecycleBinButton from './RecycleBinButton'
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

describe('RecycleBinButton', () => {
  beforeEach(() => resetMockOrg())
  afterEach(() => cleanup())

  it('has aria-label "Recycle bin" when recycled is empty', () => {
    render(<RecycleBinButton />)
    const btn = screen.getByRole('button', { name: 'Recycle bin' })
    expect(btn).toBeDefined()
  })

  it('does not show a badge when recycled is empty', () => {
    render(<RecycleBinButton />)
    const btn = screen.getByRole('button', { name: 'Recycle bin' })
    expect(btn.querySelector('span')).toBeNull()
  })

  it('shows a badge with count when recycled has items', () => {
    mockOrg.recycled = [makePerson({ id: 'r1' }), makePerson({ id: 'r2' })]
    render(<RecycleBinButton />)
    expect(screen.getByText('2')).toBeDefined()
  })

  it('includes item count in aria-label when recycled has items', () => {
    mockOrg.recycled = [makePerson({ id: 'r1' }), makePerson({ id: 'r2' }), makePerson({ id: 'r3' })]
    render(<RecycleBinButton />)
    const btn = screen.getByRole('button', { name: 'Recycle bin (3 items)' })
    expect(btn).toBeDefined()
  })

  it('has aria-pressed="false" when binOpen is false', () => {
    mockOrg.binOpen = false
    render(<RecycleBinButton />)
    const btn = screen.getByRole('button', { name: /recycle bin/i })
    expect(btn.getAttribute('aria-pressed')).toBe('false')
  })

  it('has aria-pressed="true" when binOpen is true', () => {
    mockOrg.binOpen = true
    render(<RecycleBinButton />)
    const btn = screen.getByRole('button', { name: /recycle bin/i })
    expect(btn.getAttribute('aria-pressed')).toBe('true')
  })

  it('calls setBinOpen with toggled value on click', async () => {
    const user = userEvent.setup()
    const setBinOpenFn = vi.fn()
    mockOrg.setBinOpen = setBinOpenFn
    mockOrg.binOpen = false
    render(<RecycleBinButton />)
    await user.click(screen.getByRole('button', { name: /recycle bin/i }))
    expect(setBinOpenFn).toHaveBeenCalledWith(true)
  })

  it('calls setBinOpen(false) when binOpen is true and button is clicked', async () => {
    const user = userEvent.setup()
    const setBinOpenFn = vi.fn()
    mockOrg.setBinOpen = setBinOpenFn
    mockOrg.binOpen = true
    render(<RecycleBinButton />)
    await user.click(screen.getByRole('button', { name: /recycle bin/i }))
    expect(setBinOpenFn).toHaveBeenCalledWith(false)
  })
})
