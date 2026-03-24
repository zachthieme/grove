import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import RecycleBinDrawer from './RecycleBinDrawer'

const mockOrg = {
  loaded: true, working: [], original: [], recycled: [],
  viewMode: 'detail', dataView: 'working', selectedIds: new Set(),
  selectedId: null, binOpen: false, hiddenEmploymentTypes: new Set(),
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
}

vi.mock('../store/OrgContext', () => ({
  useOrg: () => mockOrg,
}))

describe('RecycleBinDrawer', () => {
  afterEach(() => cleanup())

  it('renders nothing when binOpen is false', () => {
    mockOrg.binOpen = false
    const { container } = render(<RecycleBinDrawer />)
    expect(container.firstChild).toBeNull()
  })

  it('renders drawer with "Bin is empty" when open with no items', () => {
    mockOrg.binOpen = true
    mockOrg.recycled = []
    render(<RecycleBinDrawer />)
    expect(screen.getByText('Bin is empty')).toBeDefined()
  })
})
