// Scenarios: VIEW-008
import { describe, it, expect, vi, afterEach } from 'vitest'
import { cleanup } from '@testing-library/react'
import ColumnView from './ColumnView'
import { normalizeHTML, makePerson, renderWithViewData } from '../test-helpers'

// Mock dnd-kit
vi.mock('@dnd-kit/core', () => ({
  DndContext: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DragOverlay: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  useDraggable: () => ({ attributes: {}, listeners: {}, setNodeRef: vi.fn(), isDragging: false }),
  useDroppable: () => ({ setNodeRef: vi.fn(), isOver: false }),
  MouseSensor: class {},
  KeyboardSensor: class {},
  useSensor: () => ({}),
  useSensors: () => [],
}))

vi.mock('../hooks/useChartLayout', () => ({
  useChartLayout: () => ({
    containerRef: { current: null },
    nodeRefs: { current: new Map() },
    setNodeRef: () => () => {},
    lines: [],
    activeDragId: null,
    sensors: [],
    handleDragStart: vi.fn(),
    handleDragEnd: vi.fn(),
  }),
}))

vi.mock('../hooks/useDragDrop', () => ({
  useDragDrop: () => ({ onDragEnd: vi.fn() }),
}))

describe('ColumnView golden', () => {
  afterEach(() => cleanup())

  it('renders org tree structure', () => {
    const ceo = makePerson({ id: 'ceo-001', name: 'CEO Alice', role: 'CEO', managerId: '' })
    const vp = makePerson({ id: 'vp-002', name: 'VP Bob', role: 'VP Engineering', managerId: 'ceo-001' })
    const eng1 = makePerson({ id: 'eng-003', name: 'Engineer Carol', role: 'Senior Engineer', managerId: 'vp-002' })
    const eng2 = makePerson({ id: 'eng-004', name: 'Engineer Dave', role: 'Engineer', managerId: 'vp-002' })
    const people = [ceo, vp, eng1, eng2]

    const { container } = renderWithViewData(
      <ColumnView />,
      { working: people, original: people, selectedIds: new Set() },
    )

    expect(normalizeHTML(container.innerHTML)).toMatchFileSnapshot('./__golden__/column-view-tree.golden')
  })

  it('renders empty state', () => {
    const { container } = renderWithViewData(
      <ColumnView />,
      { working: [], original: [], selectedIds: new Set() },
    )

    expect(normalizeHTML(container.innerHTML)).toMatchFileSnapshot('./__golden__/column-view-empty.golden')
  })

  it('renders selected state', () => {
    const ceo = makePerson({ id: 'ceo-001', name: 'CEO Alice', role: 'CEO', managerId: '' })
    const vp = makePerson({ id: 'vp-002', name: 'VP Bob', role: 'VP Engineering', managerId: 'ceo-001' })
    const people = [ceo, vp]

    const { container } = renderWithViewData(
      <ColumnView />,
      { working: people, original: people, selectedIds: new Set(['vp-002']) },
    )

    expect(normalizeHTML(container.innerHTML)).toMatchFileSnapshot('./__golden__/column-view-selected.golden')
  })

  it('renders mixed statuses', () => {
    const mgr = makePerson({ id: 'mgr-001', name: 'Manager Eve', role: 'Manager', managerId: '' })
    const active = makePerson({ id: 'act-002', name: 'Active Frank', role: 'Engineer', status: 'Active', managerId: 'mgr-001' })
    const open = makePerson({ id: 'opn-003', name: 'Open Req', role: 'Engineer', status: 'Open', managerId: 'mgr-001' })
    const transfer = makePerson({ id: 'xfr-004', name: 'Transfer Grace', role: 'Designer', status: 'Transfer In', managerId: 'mgr-001' })
    const people = [mgr, active, open, transfer]

    const { container } = renderWithViewData(
      <ColumnView />,
      { working: people, original: people, selectedIds: new Set() },
    )

    expect(normalizeHTML(container.innerHTML)).toMatchFileSnapshot('./__golden__/column-view-mixed-statuses.golden')
  })

  it('renders orphans grouped by team', () => {
    const carol = makePerson({ id: 'carol-001', name: 'Carol White', team: 'Design', managerId: '' })
    const dave = makePerson({ id: 'dave-002', name: 'Dave Brown', team: 'Engineering', managerId: '' })
    const people = [carol, dave]

    const { container } = renderWithViewData(
      <ColumnView />,
      { working: people, original: people, selectedIds: new Set() },
    )

    expect(normalizeHTML(container.innerHTML)).toMatchFileSnapshot('./__golden__/column-view-orphans.golden')
  })
})
