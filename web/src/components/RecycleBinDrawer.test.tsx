import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import RecycleBinDrawer from './RecycleBinDrawer'
import { makePerson } from '../test-helpers'
import type { Person } from '../api/types'

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

describe('RecycleBinDrawer', () => {
  beforeEach(() => resetMockOrg())
  afterEach(() => cleanup())

  it('calls restore with person id when Restore button is clicked', async () => {
    const user = userEvent.setup()
    const restoreFn = vi.fn()
    mockOrg.restore = restoreFn
    mockOrg.binOpen = true
    mockOrg.recycled = [makePerson({ id: 'r1', name: 'Bob Jones' })]
    render(<RecycleBinDrawer />)
    await user.click(screen.getByRole('button', { name: 'Restore' }))
    expect(restoreFn).toHaveBeenCalledWith('r1')
  })

  it('calls setBinOpen(false) when close button is clicked', async () => {
    const user = userEvent.setup()
    const setBinOpenFn = vi.fn()
    mockOrg.setBinOpen = setBinOpenFn
    mockOrg.binOpen = true
    render(<RecycleBinDrawer />)
    await user.click(screen.getByRole('button', { name: 'Close recycle bin' }))
    expect(setBinOpenFn).toHaveBeenCalledWith(false)
  })

  it('calls emptyBin when Empty Bin button is clicked', async () => {
    const user = userEvent.setup()
    const emptyBinFn = vi.fn()
    mockOrg.emptyBin = emptyBinFn
    mockOrg.binOpen = true
    mockOrg.recycled = [makePerson({ id: 'r1' })]
    render(<RecycleBinDrawer />)
    await user.click(screen.getByRole('button', { name: /empty bin/i }))
    expect(emptyBinFn).toHaveBeenCalledTimes(1)
  })
})
