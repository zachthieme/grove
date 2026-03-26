import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import Toolbar from './Toolbar'
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

  it('renders the Upload button', () => {
    render(<Toolbar />)
    expect(screen.getByRole('button', { name: /upload file/i })).toBeDefined()
  })

  it('shows view mode pills (Detail, Manager, Table) when loaded', () => {
    render(<Toolbar />)
    expect(screen.getByRole('button', { name: 'Detail' })).toBeDefined()
    expect(screen.getByRole('button', { name: 'Manager' })).toBeDefined()
    expect(screen.getByRole('button', { name: 'Table' })).toBeDefined()
  })

  it('calls setViewMode when a view mode pill is clicked', async () => {
    const user = userEvent.setup()
    const setViewModeFn = vi.fn()
    mockOrg.setViewMode = setViewModeFn
    render(<Toolbar />)
    await user.click(screen.getByRole('button', { name: 'Manager' }))
    expect(setViewModeFn).toHaveBeenCalledWith('manager')
  })

  it('shows data view pills (Original, Working, Diff) when loaded', () => {
    render(<Toolbar />)
    expect(screen.getByRole('button', { name: 'Original' })).toBeDefined()
    expect(screen.getByRole('button', { name: 'Working' })).toBeDefined()
    expect(screen.getByRole('button', { name: 'Diff' })).toBeDefined()
  })

  it('calls setDataView when a data view pill is clicked', async () => {
    const user = userEvent.setup()
    const setDataViewFn = vi.fn()
    mockOrg.setDataView = setDataViewFn
    render(<Toolbar />)
    await user.click(screen.getByRole('button', { name: 'Diff' }))
    expect(setDataViewFn).toHaveBeenCalledWith('diff')
  })

  it('does not show view mode or data view pills when not loaded', () => {
    mockOrg.loaded = false
    render(<Toolbar />)
    expect(screen.queryByRole('button', { name: 'Detail' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Diff' })).toBeNull()
  })

  it('renders Export dropdown trigger with aria-label "Export options"', () => {
    render(<Toolbar />)
    expect(screen.getByRole('button', { name: 'Export options' })).toBeDefined()
  })

  it('shows export options (PNG, SVG, CSV, XLSX) when Export dropdown is opened', async () => {
    const user = userEvent.setup()
    render(<Toolbar />)
    await user.click(screen.getByRole('button', { name: 'Export options' }))
    expect(screen.getByRole('button', { name: 'PNG' })).toBeDefined()
    expect(screen.getByRole('button', { name: 'SVG' })).toBeDefined()
    expect(screen.getByRole('button', { name: 'CSV' })).toBeDefined()
    expect(screen.getByRole('button', { name: 'XLSX' })).toBeDefined()
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

  it('shows "All Snapshots" export items when hasSnapshots is true', async () => {
    const user = userEvent.setup()
    const onExportAllSnapshots = vi.fn()
    render(<Toolbar hasSnapshots onExportAllSnapshots={onExportAllSnapshots} />)
    await user.click(screen.getByRole('button', { name: 'Export options' }))
    expect(screen.getByRole('button', { name: 'All Snapshots (CSV)' })).toBeDefined()
    expect(screen.getByRole('button', { name: 'All Snapshots (XLSX)' })).toBeDefined()
    expect(screen.getByRole('button', { name: 'All Snapshots (PNG)' })).toBeDefined()
    expect(screen.getByRole('button', { name: 'All Snapshots (SVG)' })).toBeDefined()
  })

  it('does not show "All Snapshots" items when hasSnapshots is false', async () => {
    const user = userEvent.setup()
    render(<Toolbar />)
    await user.click(screen.getByRole('button', { name: 'Export options' }))
    expect(screen.queryByRole('button', { name: /all snapshots/i })).toBeNull()
  })

  it('renders hamburger menu button with aria-label "Menu"', () => {
    render(<Toolbar />)
    expect(screen.getByRole('button', { name: 'Menu' })).toBeDefined()
  })

  it('shows Settings in hamburger menu when opened', async () => {
    const user = userEvent.setup()
    render(<Toolbar />)
    await user.click(screen.getByRole('button', { name: 'Menu' }))
    expect(screen.getByRole('button', { name: 'Settings' })).toBeDefined()
  })

  it('shows Refresh Layout in hamburger menu when viewMode is not table', async () => {
    const user = userEvent.setup()
    mockOrg.viewMode = 'detail'
    render(<Toolbar />)
    await user.click(screen.getByRole('button', { name: 'Menu' }))
    expect(screen.getByRole('button', { name: 'Refresh Layout' })).toBeDefined()
  })

  it('does not show Refresh Layout in hamburger menu when viewMode is table', async () => {
    const user = userEvent.setup()
    mockOrg.viewMode = 'table'
    render(<Toolbar />)
    await user.click(screen.getByRole('button', { name: 'Menu' }))
    expect(screen.queryByRole('button', { name: 'Refresh Layout' })).toBeNull()
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

  it('shows Logs button when loggingEnabled is true', () => {
    render(<Toolbar loggingEnabled />)
    expect(screen.getByRole('button', { name: 'Toggle log viewer' })).toBeDefined()
  })

  it('does not show Logs button when loggingEnabled is false', () => {
    render(<Toolbar loggingEnabled={false} />)
    expect(screen.queryByRole('button', { name: 'Toggle log viewer' })).toBeNull()
  })

  it('calls onToggleLogs when Logs button is clicked', async () => {
    const user = userEvent.setup()
    const onToggleLogs = vi.fn()
    render(<Toolbar loggingEnabled onToggleLogs={onToggleLogs} />)
    await user.click(screen.getByRole('button', { name: 'Toggle log viewer' }))
    expect(onToggleLogs).toHaveBeenCalledTimes(1)
  })

  it('shows "Exporting..." text when exporting is true', () => {
    render(<Toolbar exporting />)
    const exportBtn = screen.getByRole('button', { name: 'Export options' })
    expect(exportBtn.textContent).toBe('Exporting...')
  })

  it('shows "Export" text when exporting is false', () => {
    render(<Toolbar exporting={false} />)
    const exportBtn = screen.getByRole('button', { name: 'Export options' })
    expect(exportBtn.textContent).toContain('Export')
    expect(exportBtn.textContent).not.toContain('Exporting...')
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
