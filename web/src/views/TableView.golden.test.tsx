import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, cleanup } from '@testing-library/react'
import TableView from './TableView'
import type { Person } from '../api/types'
import type { PersonChange } from '../hooks/useOrgDiff'

const mockUpdate = vi.fn().mockResolvedValue(undefined)
const mockRemove = vi.fn().mockResolvedValue(undefined)
const mockToggleSelect = vi.fn()
const mockAdd = vi.fn().mockResolvedValue(undefined)

const basePeople: Person[] = [
  {
    id: 'p-001', name: 'Alice Smith', role: 'VP', discipline: 'Eng', managerId: '', team: 'Engineering',
    additionalTeams: [], status: 'Active', employmentType: 'FTE',
  },
  {
    id: 'p-002', name: 'Bob Jones', role: 'Engineer', discipline: 'Eng', managerId: 'p-001', team: 'Platform',
    additionalTeams: [], status: 'Active', employmentType: 'FTE',
  },
]

vi.mock('../store/OrgContext', () => ({
  useOrg: () => ({
    update: mockUpdate,
    remove: mockRemove,
    toggleSelect: mockToggleSelect,
    add: mockAdd,
    working: basePeople,
    pods: [],
    settings: { disciplineOrder: [] },
    original: [],
    recycled: [],
    originalPods: [],
    loaded: true,
    selectedIds: new Set(),
    selectedId: null,
    selectedPodId: null,
    viewMode: 'table' as const,
    dataView: 'working' as const,
    headPersonId: null,
    hiddenEmploymentTypes: new Set(),
    binOpen: false,
    layoutKey: 0,
    pendingMapping: null,
    snapshots: [],
    currentSnapshotName: null,
    autosaveAvailable: null,
    error: null,
    setViewMode: vi.fn(),
    setDataView: vi.fn(),
    setSelectedId: vi.fn(),
    clearSelection: vi.fn(),
    upload: vi.fn(),
    move: vi.fn(),
    reparent: vi.fn(),
    reorder: vi.fn(),
    restore: vi.fn(),
    emptyBin: vi.fn(),
    setBinOpen: vi.fn(),
    confirmMapping: vi.fn(),
    cancelMapping: vi.fn(),
    reflow: vi.fn(),
    saveSnapshot: vi.fn(),
    loadSnapshot: vi.fn(),
    deleteSnapshot: vi.fn(),
    restoreAutosave: vi.fn(),
    dismissAutosave: vi.fn(),
    toggleEmploymentTypeFilter: vi.fn(),
    showAllEmploymentTypes: vi.fn(),
    hideAllEmploymentTypes: vi.fn(),
    setHead: vi.fn(),
    clearError: vi.fn(),
    selectPod: vi.fn(),
    updatePod: vi.fn(),
    createPod: vi.fn(),
    updateSettings: vi.fn(),
  }),
  OrgProvider: ({ children }: { children: React.ReactNode }) => children,
}))

function normalizeHTML(html: string): string {
  return html
    .replace(/\s*style="[^"]*"/g, '')
    .replace(/\s+/g, ' ')
    .replace(/> </g, '>\n<')
    .trim()
}

describe('TableView golden', () => {
  afterEach(() => {
    cleanup()
    vi.clearAllMocks()
  })

  it('renders table with people', () => {
    const { container } = render(<TableView people={basePeople} />)

    expect(normalizeHTML(container.innerHTML)).toMatchFileSnapshot('./__golden__/table-view-people.golden')
  })

  it('renders read-only table', () => {
    const { container } = render(<TableView people={basePeople} readOnly={true} />)

    expect(normalizeHTML(container.innerHTML)).toMatchFileSnapshot('./__golden__/table-view-readonly.golden')
  })

  it('renders diff classes', () => {
    const changes = new Map<string, PersonChange>([
      ['p-001', { types: new Set(['added']) }],
      ['p-002', { types: new Set(['reporting']) }],
    ])

    const { container } = render(<TableView people={basePeople} changes={changes} />)

    expect(normalizeHTML(container.innerHTML)).toMatchFileSnapshot('./__golden__/table-view-diff.golden')
  })

  it('renders empty table', () => {
    const { container } = render(<TableView people={[]} />)

    expect(normalizeHTML(container.innerHTML)).toMatchFileSnapshot('./__golden__/table-view-empty.golden')
  })
})
