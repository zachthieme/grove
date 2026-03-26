import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, cleanup } from '@testing-library/react'
import SnapshotsDropdown from './SnapshotsDropdown'
import { normalizeHTML, makePerson } from '../test-helpers'
import type { Person, SnapshotInfo } from '../api/types'

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

describe('SnapshotsDropdown golden', () => {
  beforeEach(() => resetMockOrg())
  afterEach(() => cleanup())

  it('Working label', async () => {
    mockOrg.currentSnapshotName = null
    const { container } = render(<SnapshotsDropdown />)
    await expect(normalizeHTML(container.innerHTML)).toMatchFileSnapshot(
      './__golden__/snapshots-dropdown-working.golden'
    )
  })

  it('Original label', async () => {
    mockOrg.currentSnapshotName = '__original__'
    const { container } = render(<SnapshotsDropdown />)
    await expect(normalizeHTML(container.innerHTML)).toMatchFileSnapshot(
      './__golden__/snapshots-dropdown-original.golden'
    )
  })

  it('named snapshot label', async () => {
    mockOrg.currentSnapshotName = 'My Snapshot'
    const { container } = render(<SnapshotsDropdown />)
    await expect(normalizeHTML(container.innerHTML)).toMatchFileSnapshot(
      './__golden__/snapshots-dropdown-named.golden'
    )
  })
})
