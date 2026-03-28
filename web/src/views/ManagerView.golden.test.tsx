// Scenarios: VIEW-008
import { describe, it, expect, vi, afterEach } from 'vitest'
import { cleanup } from '@testing-library/react'
import ManagerView from './ManagerView'
import { normalizeHTML, makePerson, renderWithOrg } from '../test-helpers'

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

describe('ManagerView golden', () => {
  afterEach(() => cleanup())

  it('renders manager with summary cards', () => {
    const manager = makePerson({ id: 'mgr-001', name: 'Manager Alice', role: 'Engineering Manager', managerId: '' })
    const ic1 = makePerson({ id: 'ic-002', name: 'IC Bob', role: 'Engineer', discipline: 'Engineering', status: 'Active', managerId: 'mgr-001' })
    const ic2 = makePerson({ id: 'ic-003', name: 'IC Carol', role: 'Designer', discipline: 'Design', status: 'Active', managerId: 'mgr-001' })
    const openReq = makePerson({ id: 'ic-004', name: 'Open Req', role: 'Engineer', discipline: 'Engineering', status: 'Open', managerId: 'mgr-001' })

    const { container } = renderWithOrg(
      <ManagerView
        people={[manager, ic1, ic2, openReq]}
        selectedIds={new Set()}
        onSelect={vi.fn()}
      />,
      { selectedIds: new Set() },
    )

    expect(normalizeHTML(container.innerHTML)).toMatchFileSnapshot('./__golden__/manager-view-summary-cards.golden')
  })

  it('renders empty state', () => {
    const { container } = renderWithOrg(
      <ManagerView
        people={[]}
        selectedIds={new Set()}
        onSelect={vi.fn()}
      />,
      { selectedIds: new Set() },
    )

    expect(normalizeHTML(container.innerHTML)).toMatchFileSnapshot('./__golden__/manager-view-empty.golden')
  })

  it('renders multi-level hierarchy', () => {
    const ceo = makePerson({ id: 'ceo-001', name: 'CEO Alice', role: 'CEO', managerId: '' })
    const vp = makePerson({ id: 'vp-002', name: 'VP Bob', role: 'VP Engineering', managerId: 'ceo-001' })
    const director = makePerson({ id: 'dir-003', name: 'Director Carol', role: 'Director', managerId: 'vp-002' })
    const ic = makePerson({ id: 'ic-004', name: 'IC Dave', role: 'Engineer', discipline: 'Engineering', status: 'Active', managerId: 'dir-003' })

    const { container } = renderWithOrg(
      <ManagerView
        people={[ceo, vp, director, ic]}
        selectedIds={new Set()}
        onSelect={vi.fn()}
      />,
      { selectedIds: new Set() },
    )

    expect(normalizeHTML(container.innerHTML)).toMatchFileSnapshot('./__golden__/manager-view-multi-level.golden')
  })
})
