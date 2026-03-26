import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import UploadPrompt from './UploadPrompt'

const mockOrg: Record<string, unknown> = {}

function resetMockOrg() {
  Object.assign(mockOrg, {
    loaded: false, working: [], original: [], recycled: [],
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

describe('UploadPrompt', () => {
  beforeEach(() => resetMockOrg())
  afterEach(() => cleanup())

  it('renders the "Choose File" button', () => {
    render(<UploadPrompt />)
    expect(screen.getByRole('button', { name: /choose file/i })).toBeDefined()
  })

  it('shows title text "grove"', () => {
    render(<UploadPrompt />)
    expect(screen.getByText('grove')).toBeDefined()
  })

  it('shows definition text', () => {
    render(<UploadPrompt />)
    expect(screen.getByText(/a small group of trees/)).toBeDefined()
  })

  it('shows tagline text', () => {
    render(<UploadPrompt />)
    expect(screen.getByText(/Org planning for people/)).toBeDefined()
  })

  it('renders hidden file input with correct accept types', () => {
    const { container } = render(<UploadPrompt />)
    const input = container.querySelector('input[type="file"]') as HTMLInputElement
    expect(input).not.toBeNull()
    expect(input.accept).toBe('.csv,.xlsx,.zip')
    expect(input.style.display).toBe('none')
  })

  it('calls upload when a file is selected', () => {
    const uploadFn = vi.fn()
    mockOrg.upload = uploadFn
    const { container } = render(<UploadPrompt />)
    const input = container.querySelector('input[type="file"]') as HTMLInputElement
    const file = new File(['data'], 'test.csv', { type: 'text/csv' })
    fireEvent.change(input, { target: { files: [file] } })
    expect(uploadFn).toHaveBeenCalledWith(file)
  })

  it('does not call upload when no file is selected', () => {
    const uploadFn = vi.fn()
    mockOrg.upload = uploadFn
    const { container } = render(<UploadPrompt />)
    const input = container.querySelector('input[type="file"]') as HTMLInputElement
    fireEvent.change(input, { target: { files: [] } })
    expect(uploadFn).not.toHaveBeenCalled()
  })

  it('renders the grove icon image', () => {
    render(<UploadPrompt />)
    const img = screen.getByRole('img', { name: 'Grove' })
    expect(img).toBeDefined()
    expect(img.getAttribute('src')).toBe('/grove-icon.svg')
  })
})
