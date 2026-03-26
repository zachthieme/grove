import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, cleanup } from '@testing-library/react'
import TableView from './TableView'
import { normalizeHTML, makePerson } from '../test-helpers'
import type { PersonChange } from '../hooks/useOrgDiff'

const basePeople = [
  makePerson({ id: 'p-001', name: 'Alice Smith', role: 'VP', discipline: 'Eng', managerId: '', team: 'Engineering', employmentType: 'FTE' }),
  makePerson({ id: 'p-002', name: 'Bob Jones', role: 'Engineer', discipline: 'Eng', managerId: 'p-001', team: 'Platform', employmentType: 'FTE' }),
]

vi.mock('../store/OrgContext', () => ({
  useOrg: () => ({
    update: vi.fn().mockResolvedValue(undefined),
    remove: vi.fn().mockResolvedValue(undefined),
    toggleSelect: vi.fn(),
    add: vi.fn().mockResolvedValue(undefined),
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

  it('renders single person table', () => {
    const singlePerson = [
      makePerson({ id: 'p-001', name: 'Alice Smith', role: 'VP', discipline: 'Eng', managerId: '', team: 'Engineering', employmentType: 'FTE' }),
    ]
    const { container } = render(<TableView people={singlePerson} />)

    expect(normalizeHTML(container.innerHTML)).toMatchFileSnapshot('./__golden__/table-view-single.golden')
  })
})
