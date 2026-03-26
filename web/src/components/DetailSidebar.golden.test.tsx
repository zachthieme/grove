import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, cleanup } from '@testing-library/react'
import DetailSidebar from './DetailSidebar'
import { normalizeHTML, makePerson } from '../test-helpers'
import type { Person } from '../api/types'

const alice = makePerson({ id: 'a1', name: 'Alice Smith', role: 'VP', managerId: '', team: 'Platform', discipline: 'Eng' })
const bob = makePerson({ id: 'b2', name: 'Bob Jones', role: 'Engineer', managerId: 'a1', team: 'Platform', discipline: 'Eng', employmentType: 'FTE' })
const carol = makePerson({ id: 'c3', name: 'Carol White', role: 'Designer', managerId: 'a1', team: 'Design', discipline: 'Design', employmentType: 'FTE' })

const mockOrg = {
  working: [alice, bob] as Person[],
  original: [alice, bob] as Person[],
  recycled: [] as Person[],
  loaded: true,
  viewMode: 'detail' as const,
  dataView: 'working' as const,
  selectedId: null as string | null,
  selectedIds: new Set<string>(),
  binOpen: false,
  layoutKey: 0,
  headPersonId: null as string | null,
  hiddenEmploymentTypes: new Set<string>(),
  pendingMapping: null,
  snapshots: [] as [],
  currentSnapshotName: null as string | null,
  autosaveAvailable: null,
  error: null as string | null,
  setSelectedId: vi.fn(),
  toggleSelect: vi.fn(),
  clearSelection: vi.fn(),
  update: vi.fn().mockResolvedValue(undefined),
  remove: vi.fn().mockResolvedValue(undefined),
  reparent: vi.fn().mockResolvedValue(undefined),
  move: vi.fn().mockResolvedValue(undefined),
  reorder: vi.fn().mockResolvedValue(undefined),
  add: vi.fn().mockResolvedValue(undefined),
  restore: vi.fn().mockResolvedValue(undefined),
  emptyBin: vi.fn().mockResolvedValue(undefined),
  setBinOpen: vi.fn(),
  upload: vi.fn().mockResolvedValue(undefined),
  confirmMapping: vi.fn().mockResolvedValue(undefined),
  cancelMapping: vi.fn(),
  reflow: vi.fn(),
  saveSnapshot: vi.fn().mockResolvedValue(undefined),
  loadSnapshot: vi.fn().mockResolvedValue(undefined),
  deleteSnapshot: vi.fn().mockResolvedValue(undefined),
  restoreAutosave: vi.fn(),
  dismissAutosave: vi.fn().mockResolvedValue(undefined),
  toggleEmploymentTypeFilter: vi.fn(),
  showAllEmploymentTypes: vi.fn(),
  hideAllEmploymentTypes: vi.fn(),
  setHead: vi.fn(),
  clearError: vi.fn(),
  pods: [] as any[],
  originalPods: [] as any[],
  selectedPodId: null as string | null,
  selectPod: vi.fn(),
  updatePod: vi.fn().mockResolvedValue(undefined),
  createPod: vi.fn().mockResolvedValue(undefined),
  setViewMode: vi.fn(),
  setDataView: vi.fn(),
  settings: { disciplineOrder: [] },
  updateSettings: vi.fn(),
  batchSelect: vi.fn(),
  setError: vi.fn(),
}

vi.mock('../store/OrgContext', () => ({
  useOrg: () => mockOrg,
}))

function resetMockOrg() {
  mockOrg.working = [alice, bob]
  mockOrg.selectedId = null
  mockOrg.selectedIds = new Set()
  mockOrg.selectedPodId = null
  mockOrg.update = vi.fn().mockResolvedValue(undefined)
  mockOrg.remove = vi.fn().mockResolvedValue(undefined)
  mockOrg.reparent = vi.fn().mockResolvedValue(undefined)
  mockOrg.clearSelection = vi.fn()
  mockOrg.setSelectedId = vi.fn()
}

describe('DetailSidebar golden', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    resetMockOrg()
  })
  afterEach(() => cleanup())

  it('no selection renders null', () => {
    const { container } = render(<DetailSidebar />)
    expect(normalizeHTML(container.innerHTML)).toMatchFileSnapshot('./__golden__/detail-sidebar-null.golden')
  })

  it('single person selected (Bob)', () => {
    mockOrg.selectedId = 'b2'
    mockOrg.selectedIds = new Set(['b2'])
    const { container } = render(<DetailSidebar />)
    expect(normalizeHTML(container.innerHTML)).toMatchFileSnapshot('./__golden__/detail-sidebar-single.golden')
  })

  it('batch: 2 people with different fields (Mixed placeholder)', () => {
    mockOrg.working = [alice, bob, carol]
    mockOrg.selectedId = null
    mockOrg.selectedIds = new Set(['b2', 'c3'])
    const { container } = render(<DetailSidebar />)
    expect(normalizeHTML(container.innerHTML)).toMatchFileSnapshot('./__golden__/detail-sidebar-batch.golden')
  })

  it('batch: 2 people with same role (uniform)', () => {
    const dan = makePerson({ id: 'd4', name: 'Dan', role: 'Engineer', team: 'Platform', managerId: 'a1', discipline: 'Eng', employmentType: 'FTE' })
    mockOrg.working = [alice, bob, dan]
    mockOrg.selectedId = null
    mockOrg.selectedIds = new Set(['b2', 'd4'])
    const { container } = render(<DetailSidebar />)
    expect(normalizeHTML(container.innerHTML)).toMatchFileSnapshot('./__golden__/detail-sidebar-batch-uniform.golden')
  })

  it('person with all empty strings', () => {
    const emptyPerson = makePerson({ id: 'empty1', name: '', role: '', team: '', discipline: '', employmentType: '' })
    mockOrg.working = [emptyPerson]
    mockOrg.selectedId = 'empty1'
    mockOrg.selectedIds = new Set(['empty1'])
    const { container } = render(<DetailSidebar />)
    expect(normalizeHTML(container.innerHTML)).toMatchFileSnapshot('./__golden__/detail-sidebar-empty-fields.golden')
  })

  it('person with 500-char fields', () => {
    const longStr = 'A'.repeat(500)
    const longPerson = makePerson({ id: 'long1', name: longStr, role: longStr, team: longStr, discipline: longStr })
    mockOrg.working = [longPerson]
    mockOrg.selectedId = 'long1'
    mockOrg.selectedIds = new Set(['long1'])
    const { container } = render(<DetailSidebar />)
    expect(normalizeHTML(container.innerHTML)).toMatchFileSnapshot('./__golden__/detail-sidebar-long-strings.golden')
  })

  it('person with Unicode/emoji/CJK name', () => {
    const p = makePerson({ id: 'uni1', name: '\u{1F469}\u200D\u{1F4BB} \u7530\u4E2D Jos\u00E9', role: 'Eng', discipline: 'Design' })
    mockOrg.working = [p]
    mockOrg.selectedId = 'uni1'
    mockOrg.selectedIds = new Set(['uni1'])
    const { container } = render(<DetailSidebar />)
    expect(normalizeHTML(container.innerHTML)).toMatchFileSnapshot('./__golden__/detail-sidebar-special-chars.golden')
  })

  it('person with whitespace-only fields', () => {
    const wsPerson = makePerson({ id: 'ws1', name: '   ', role: '   ', team: '   ', discipline: '   ' })
    mockOrg.working = [wsPerson]
    mockOrg.selectedId = 'ws1'
    mockOrg.selectedIds = new Set(['ws1'])
    const { container } = render(<DetailSidebar />)
    expect(normalizeHTML(container.innerHTML)).toMatchFileSnapshot('./__golden__/detail-sidebar-whitespace.golden')
  })
})
