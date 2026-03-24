import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import Breadcrumbs from './Breadcrumbs'

const mockOrg = {
  loaded: true, working: [], original: [], recycled: [],
  viewMode: 'detail', dataView: 'working', selectedIds: new Set(),
  selectedId: null, binOpen: false, hiddenEmploymentTypes: new Set(),
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
}

vi.mock('../store/OrgContext', () => ({
  useOrg: () => mockOrg,
}))

describe('Breadcrumbs', () => {
  afterEach(() => cleanup())

  it('renders nothing when headPersonId is null', () => {
    mockOrg.headPersonId = null
    const { container } = render(<Breadcrumbs />)
    expect(container.firstChild).toBeNull()
  })

  it('renders "All" button and person name when headPersonId is set', () => {
    mockOrg.headPersonId = 'p1'
    mockOrg.working = [{ id: 'p1', name: 'Alice', role: 'VP', managerId: '', team: '', discipline: '', additionalTeams: [], status: 'Active' }] as never
    render(<Breadcrumbs />)
    expect(screen.getByText('All')).toBeDefined()
    expect(screen.getByText('Alice')).toBeDefined()
  })
})
