// Scenarios: VIEW-008
import { describe, it, expect, vi, afterEach } from 'vitest'
import { cleanup } from '@testing-library/react'
import ManagerView from './ManagerView'
import { normalizeHTML, makeNode, renderWithViewData } from '../test-helpers'

vi.mock('@dnd-kit/core')
vi.mock('../hooks/useChartLayout')
vi.mock('../hooks/useDragDrop')

describe('ManagerView golden', () => {
  afterEach(() => cleanup())

  it('renders manager with summary cards', () => {
    const manager = makeNode({ id: 'mgr-001', name: 'Manager Alice', role: 'Engineering Manager', managerId: '' })
    const ic1 = makeNode({ id: 'ic-002', name: 'IC Bob', role: 'Engineer', discipline: 'Engineering', status: 'Active', managerId: 'mgr-001' })
    const ic2 = makeNode({ id: 'ic-003', name: 'IC Carol', role: 'Designer', discipline: 'Design', status: 'Active', managerId: 'mgr-001' })
    const openReq = makeNode({ id: 'ic-004', name: 'Open Req', role: 'Engineer', discipline: 'Engineering', status: 'Open', managerId: 'mgr-001' })
    const people = [manager, ic1, ic2, openReq]

    const { container } = renderWithViewData(
      <ManagerView />,
      { working: people, original: people, selectedIds: new Set() },
    )

    expect(normalizeHTML(container.innerHTML)).toMatchFileSnapshot('./__golden__/manager-view-summary-cards.golden')
  })

  it('renders empty state', () => {
    const { container } = renderWithViewData(
      <ManagerView />,
      { working: [], original: [], selectedIds: new Set() },
    )

    expect(normalizeHTML(container.innerHTML)).toMatchFileSnapshot('./__golden__/manager-view-empty.golden')
  })

  it('renders multi-level hierarchy', () => {
    const ceo = makeNode({ id: 'ceo-001', name: 'CEO Alice', role: 'CEO', managerId: '' })
    const vp = makeNode({ id: 'vp-002', name: 'VP Bob', role: 'VP Engineering', managerId: 'ceo-001' })
    const director = makeNode({ id: 'dir-003', name: 'Director Carol', role: 'Director', managerId: 'vp-002' })
    const ic = makeNode({ id: 'ic-004', name: 'IC Dave', role: 'Engineer', discipline: 'Engineering', status: 'Active', managerId: 'dir-003' })
    const people = [ceo, vp, director, ic]

    const { container } = renderWithViewData(
      <ManagerView />,
      { working: people, original: people, selectedIds: new Set() },
    )

    expect(normalizeHTML(container.innerHTML)).toMatchFileSnapshot('./__golden__/manager-view-multi-level.golden')
  })
})
