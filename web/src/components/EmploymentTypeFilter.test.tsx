import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import EmploymentTypeFilter from './EmploymentTypeFilter'
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
    selectedId: null, selectedPodId: null, binOpen: false,
    hiddenEmploymentTypes: new Set<string>(),
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

describe('EmploymentTypeFilter', () => {
  beforeEach(() => resetMockOrg())
  afterEach(() => cleanup())

  it('renders a trigger button with aria-label "Employment type filter"', () => {
    render(<EmploymentTypeFilter />)
    expect(screen.getByRole('button', { name: 'Employment type filter' })).toBeDefined()
  })

  it('does not show a badge when no types are hidden', () => {
    mockOrg.hiddenEmploymentTypes = new Set()
    render(<EmploymentTypeFilter />)
    const btn = screen.getByRole('button', { name: 'Employment type filter' })
    expect(btn.querySelector('span')).toBeNull()
  })

  it('shows badge with hidden count when types are hidden', () => {
    mockOrg.hiddenEmploymentTypes = new Set(['CW', 'Intern'])
    render(<EmploymentTypeFilter />)
    expect(screen.getByText('2')).toBeDefined()
  })

  it('has aria-expanded="false" initially', () => {
    render(<EmploymentTypeFilter />)
    const btn = screen.getByRole('button', { name: 'Employment type filter' })
    expect(btn.getAttribute('aria-expanded')).toBe('false')
  })

  it('opens dropdown on click and sets aria-expanded="true"', async () => {
    const user = userEvent.setup()
    mockOrg.working = [makePerson({ employmentType: 'FTE' })]
    render(<EmploymentTypeFilter />)
    const btn = screen.getByRole('button', { name: 'Employment type filter' })
    await user.click(btn)
    expect(btn.getAttribute('aria-expanded')).toBe('true')
    expect(screen.getByText('Show All')).toBeDefined()
    expect(screen.getByText('Hide All')).toBeDefined()
  })

  it('renders checkbox items for each employment type', async () => {
    const user = userEvent.setup()
    mockOrg.working = [
      makePerson({ id: '1', employmentType: 'FTE' }),
      makePerson({ id: '2', employmentType: 'CW' }),
    ]
    render(<EmploymentTypeFilter />)
    await user.click(screen.getByRole('button', { name: 'Employment type filter' }))
    const checkboxes = screen.getAllByRole('menuitemcheckbox')
    expect(checkboxes.length).toBe(2)
  })

  it('sorts empty employment type ("No type") last', async () => {
    const user = userEvent.setup()
    mockOrg.working = [
      makePerson({ id: '1', employmentType: '' }),
      makePerson({ id: '2', employmentType: 'CW' }),
      makePerson({ id: '3', employmentType: 'FTE' }),
    ]
    render(<EmploymentTypeFilter />)
    await user.click(screen.getByRole('button', { name: 'Employment type filter' }))
    const checkboxes = screen.getAllByRole('menuitemcheckbox')
    expect(checkboxes[0].textContent).toContain('CW')
    expect(checkboxes[1].textContent).toContain('FTE')
    expect(checkboxes[2].textContent).toContain('No type')
  })

  it('shows checkboxes as checked when type is visible (not hidden)', async () => {
    const user = userEvent.setup()
    mockOrg.working = [makePerson({ id: '1', employmentType: 'FTE' })]
    mockOrg.hiddenEmploymentTypes = new Set()
    render(<EmploymentTypeFilter />)
    await user.click(screen.getByRole('button', { name: 'Employment type filter' }))
    const checkbox = screen.getByRole('menuitemcheckbox')
    expect(checkbox.getAttribute('aria-checked')).toBe('true')
  })

  it('shows checkboxes as unchecked when type is hidden', async () => {
    const user = userEvent.setup()
    mockOrg.working = [makePerson({ id: '1', employmentType: 'FTE' })]
    mockOrg.hiddenEmploymentTypes = new Set(['FTE'])
    render(<EmploymentTypeFilter />)
    await user.click(screen.getByRole('button', { name: 'Employment type filter' }))
    const checkbox = screen.getByRole('menuitemcheckbox')
    expect(checkbox.getAttribute('aria-checked')).toBe('false')
  })

  it('calls toggleEmploymentTypeFilter when a checkbox item is clicked', async () => {
    const user = userEvent.setup()
    const toggleFn = vi.fn()
    mockOrg.toggleEmploymentTypeFilter = toggleFn
    mockOrg.working = [makePerson({ id: '1', employmentType: 'FTE' })]
    render(<EmploymentTypeFilter />)
    await user.click(screen.getByRole('button', { name: 'Employment type filter' }))
    await user.click(screen.getByRole('menuitemcheckbox'))
    expect(toggleFn).toHaveBeenCalledWith('FTE')
  })

  it('calls showAllEmploymentTypes when Show All is clicked', async () => {
    const user = userEvent.setup()
    const showAllFn = vi.fn()
    mockOrg.showAllEmploymentTypes = showAllFn
    mockOrg.working = [makePerson({ id: '1', employmentType: 'FTE' })]
    render(<EmploymentTypeFilter />)
    await user.click(screen.getByRole('button', { name: 'Employment type filter' }))
    await user.click(screen.getByText('Show All'))
    expect(showAllFn).toHaveBeenCalledTimes(1)
  })

  it('calls hideAllEmploymentTypes with all types when Hide All is clicked', async () => {
    const user = userEvent.setup()
    const hideAllFn = vi.fn()
    mockOrg.hideAllEmploymentTypes = hideAllFn
    mockOrg.working = [
      makePerson({ id: '1', employmentType: 'FTE' }),
      makePerson({ id: '2', employmentType: 'CW' }),
    ]
    render(<EmploymentTypeFilter />)
    await user.click(screen.getByRole('button', { name: 'Employment type filter' }))
    await user.click(screen.getByText('Hide All'))
    expect(hideAllFn).toHaveBeenCalledWith(['CW', 'FTE'])
  })
})
