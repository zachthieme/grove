import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import Toolbar from './Toolbar'

vi.mock('../store/OrgContext', () => ({
  useOrg: () => ({
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
  }),
}))

describe('Toolbar', () => {
  afterEach(() => cleanup())

  it('renders without crashing when loaded', () => {
    const { container } = render(<Toolbar />)
    expect(container.firstChild).not.toBeNull()
  })

  it('shows Upload button', () => {
    render(<Toolbar />)
    expect(screen.getByRole('button', { name: /upload file/i })).toBeDefined()
  })
})
