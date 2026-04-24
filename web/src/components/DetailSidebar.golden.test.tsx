import { describe, it, expect, vi, afterEach } from 'vitest'
import { cleanup } from '@testing-library/react'
import DetailSidebar from './DetailSidebar'
import { normalizeHTML, makeNode, makeEditBuffer, renderWithOrg } from '../test-helpers'

const alice = makeNode({ id: 'a1', name: 'Alice Smith', role: 'VP', managerId: '', team: 'Platform', discipline: 'Eng' })
const bob = makeNode({ id: 'b2', name: 'Bob Jones', role: 'Engineer', managerId: 'a1', team: 'Platform', discipline: 'Eng', employmentType: 'FTE' })
const carol = makeNode({ id: 'c3', name: 'Carol White', role: 'Designer', managerId: 'a1', team: 'Design', discipline: 'Design', employmentType: 'FTE' })

const baseCtx = {
  working: [alice, bob],
  original: [alice, bob],
  pods: [] as any[],
  originalPods: [] as any[],
  selectedId: null as string | null,
  selectedIds: new Set<string>(),
  update: vi.fn().mockResolvedValue(undefined),
  remove: vi.fn().mockResolvedValue(undefined),
  reparent: vi.fn().mockResolvedValue(undefined),
  clearSelection: vi.fn(),
  setSelectedId: vi.fn(),
}

describe('DetailSidebar golden', () => {
  afterEach(() => {
    vi.clearAllMocks()
    cleanup()
  })

  it('no selection renders null', () => {
    const { container } = renderWithOrg(<DetailSidebar />, {
      ...baseCtx,
      selectedId: null,
      selectedIds: new Set(),
    })
    expect(normalizeHTML(container.innerHTML)).toMatchFileSnapshot('./__golden__/detail-sidebar-null.golden')
  })

  it('single person selected (Bob)', () => {
    const { container } = renderWithOrg(<DetailSidebar />, {
      ...baseCtx,
      selectedId: 'b2',
      selectedIds: new Set(['b2']),
    })
    expect(normalizeHTML(container.innerHTML)).toMatchFileSnapshot('./__golden__/detail-sidebar-single.golden')
  })

  it('batch: 2 people with different fields (Mixed placeholder)', () => {
    const { container } = renderWithOrg(<DetailSidebar />, {
      ...baseCtx,
      working: [alice, bob, carol],
      selectedId: null,
      selectedIds: new Set(['b2', 'c3']),
    })
    expect(normalizeHTML(container.innerHTML)).toMatchFileSnapshot('./__golden__/detail-sidebar-batch.golden')
  })

  it('batch: 2 people with same role (uniform)', () => {
    const dan = makeNode({ id: 'd4', name: 'Dan', role: 'Engineer', team: 'Platform', managerId: 'a1', discipline: 'Eng', employmentType: 'FTE' })
    const { container } = renderWithOrg(<DetailSidebar />, {
      ...baseCtx,
      working: [alice, bob, dan],
      selectedId: null,
      selectedIds: new Set(['b2', 'd4']),
    })
    expect(normalizeHTML(container.innerHTML)).toMatchFileSnapshot('./__golden__/detail-sidebar-batch-uniform.golden')
  })

  it('person with all empty strings', () => {
    const emptyPerson = makeNode({ id: 'empty1', name: '', role: '', team: '', discipline: '', employmentType: '' })
    const { container } = renderWithOrg(<DetailSidebar />, {
      ...baseCtx,
      working: [emptyPerson],
      selectedId: 'empty1',
      selectedIds: new Set(['empty1']),
    })
    expect(normalizeHTML(container.innerHTML)).toMatchFileSnapshot('./__golden__/detail-sidebar-empty-fields.golden')
  })

  it('person with 500-char fields', () => {
    const longStr = 'A'.repeat(500)
    const longPerson = makeNode({ id: 'long1', name: longStr, role: longStr, team: longStr, discipline: longStr })
    const { container } = renderWithOrg(<DetailSidebar />, {
      ...baseCtx,
      working: [longPerson],
      selectedId: 'long1',
      selectedIds: new Set(['long1']),
    })
    expect(normalizeHTML(container.innerHTML)).toMatchFileSnapshot('./__golden__/detail-sidebar-long-strings.golden')
  })

  it('person with Unicode/emoji/CJK name', () => {
    const p = makeNode({ id: 'uni1', name: '\u{1F469}\u200D\u{1F4BB} \u7530\u4E2D Jos\u00E9', role: 'Eng', discipline: 'Design' })
    const { container } = renderWithOrg(<DetailSidebar />, {
      ...baseCtx,
      working: [p],
      selectedId: 'uni1',
      selectedIds: new Set(['uni1']),
    })
    expect(normalizeHTML(container.innerHTML)).toMatchFileSnapshot('./__golden__/detail-sidebar-special-chars.golden')
  })

  it('person with whitespace-only fields', () => {
    const wsPerson = makeNode({ id: 'ws1', name: '   ', role: '   ', team: '   ', discipline: '   ' })
    const { container } = renderWithOrg(<DetailSidebar />, {
      ...baseCtx,
      working: [wsPerson],
      selectedId: 'ws1',
      selectedIds: new Set(['ws1']),
    })
    expect(normalizeHTML(container.innerHTML)).toMatchFileSnapshot('./__golden__/detail-sidebar-whitespace.golden')
  })

  it('single person in edit mode', () => {
    const { container } = renderWithOrg(<DetailSidebar />, {
      ...baseCtx,
      selectedId: 'b2',
      selectedIds: new Set(['b2']),
      interactionMode: 'editing' as const,
      editBuffer: makeEditBuffer(bob),
      editingPersonId: 'b2',
    })
    expect(normalizeHTML(container.innerHTML)).toMatchFileSnapshot('./__golden__/detail-sidebar-edit.golden')
  })
})
