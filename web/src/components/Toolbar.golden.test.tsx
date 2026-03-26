import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, cleanup } from '@testing-library/react'
import Toolbar from './Toolbar'
import { normalizeHTML, makePerson } from '../test-helpers'
import type { Person } from '../api/types'

const mockOrg: Record<string, unknown> = {}

function resetMockOrg() {
  Object.assign(mockOrg, {
    loaded: true, working: [makePerson()] as Person[], original: [] as Person[], recycled: [] as Person[],
    pods: [], originalPods: [], settings: { disciplineOrder: [] },
    viewMode: 'detail' as string, dataView: 'working' as string, selectedIds: new Set(),
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

vi.mock('../api/client', () => ({
  exportDataUrl: (fmt: string) => `/api/export?format=${fmt}`,
}))

describe('Toolbar golden', () => {
  beforeEach(() => resetMockOrg())
  afterEach(() => cleanup())

  it('loaded=true default', () => {
    const { container } = render(<Toolbar />)
    expect(normalizeHTML(container.innerHTML)).toMatchFileSnapshot('./__golden__/toolbar-loaded-default.golden')
  })

  it('loaded=false (no view/data pills)', () => {
    mockOrg.loaded = false
    const { container } = render(<Toolbar />)
    expect(normalizeHTML(container.innerHTML)).toMatchFileSnapshot('./__golden__/toolbar-not-loaded.golden')
  })

  it('exporting=true', () => {
    const { container } = render(<Toolbar exporting />)
    expect(normalizeHTML(container.innerHTML)).toMatchFileSnapshot('./__golden__/toolbar-exporting.golden')
  })

  it('loggingEnabled=true', () => {
    const { container } = render(<Toolbar loggingEnabled />)
    expect(normalizeHTML(container.innerHTML)).toMatchFileSnapshot('./__golden__/toolbar-logging-enabled.golden')
  })
})
