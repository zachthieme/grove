import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import AutosaveBanner from './AutosaveBanner'
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

describe('AutosaveBanner', () => {
  beforeEach(() => resetMockOrg())
  afterEach(() => cleanup())

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
