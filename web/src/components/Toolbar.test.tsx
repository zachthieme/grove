import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import Toolbar from './Toolbar'
import { makePerson } from '../test-helpers'
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

describe('Toolbar', () => {
  beforeEach(() => resetMockOrg())
  afterEach(() => cleanup())

  it('calls setViewMode when a view mode pill is clicked', async () => {
    const user = userEvent.setup()
    const setViewModeFn = vi.fn()
    mockOrg.setViewMode = setViewModeFn
    render(<Toolbar />)
    await user.click(screen.getByRole('button', { name: 'Manager' }))
    expect(setViewModeFn).toHaveBeenCalledWith('manager')
  })

  it('calls setDataView when a data view pill is clicked', async () => {
    const user = userEvent.setup()
    const setDataViewFn = vi.fn()
    mockOrg.setDataView = setDataViewFn
    render(<Toolbar />)
    await user.click(screen.getByRole('button', { name: 'Diff' }))
    expect(setDataViewFn).toHaveBeenCalledWith('diff')
  })

  it('calls onExportPng when PNG is clicked', async () => {
    const user = userEvent.setup()
    const onExportPng = vi.fn()
    render(<Toolbar onExportPng={onExportPng} />)
    await user.click(screen.getByRole('button', { name: 'Export options' }))
    await user.click(screen.getByRole('button', { name: 'PNG' }))
    expect(onExportPng).toHaveBeenCalledTimes(1)
  })

  it('calls onExportSvg when SVG is clicked', async () => {
    const user = userEvent.setup()
    const onExportSvg = vi.fn()
    render(<Toolbar onExportSvg={onExportSvg} />)
    await user.click(screen.getByRole('button', { name: 'Export options' }))
    await user.click(screen.getByRole('button', { name: 'SVG' }))
    expect(onExportSvg).toHaveBeenCalledTimes(1)
  })

  it('calls reflow when Refresh Layout is clicked', async () => {
    const user = userEvent.setup()
    const reflowFn = vi.fn()
    mockOrg.reflow = reflowFn
    mockOrg.viewMode = 'detail'
    render(<Toolbar />)
    await user.click(screen.getByRole('button', { name: 'Menu' }))
    await user.click(screen.getByRole('button', { name: 'Refresh Layout' }))
    expect(reflowFn).toHaveBeenCalledTimes(1)
  })

  it('calls onToggleLogs when Logs button is clicked', async () => {
    const user = userEvent.setup()
    const onToggleLogs = vi.fn()
    render(<Toolbar loggingEnabled onToggleLogs={onToggleLogs} />)
    await user.click(screen.getByRole('button', { name: 'Toggle log viewer' }))
    expect(onToggleLogs).toHaveBeenCalledTimes(1)
  })

  it('sets aria-expanded on hamburger menu button', async () => {
    const user = userEvent.setup()
    render(<Toolbar />)
    const menuBtn = screen.getByRole('button', { name: 'Menu' })
    expect(menuBtn.getAttribute('aria-expanded')).toBe('false')
    await user.click(menuBtn)
    expect(menuBtn.getAttribute('aria-expanded')).toBe('true')
  })

  it('sets aria-expanded on export dropdown button', async () => {
    const user = userEvent.setup()
    render(<Toolbar />)
    const exportBtn = screen.getByRole('button', { name: 'Export options' })
    expect(exportBtn.getAttribute('aria-expanded')).toBe('false')
    await user.click(exportBtn)
    expect(exportBtn.getAttribute('aria-expanded')).toBe('true')
  })
})
