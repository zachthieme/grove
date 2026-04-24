// Scenarios: VIEW-002
import { describe, it, expect, vi, afterEach } from 'vitest'
import { screen, cleanup } from '@testing-library/react'
import ManagerView from './ManagerView'
import { makeNode, renderWithViewData } from '../test-helpers'

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

describe('ManagerView', () => {
  afterEach(() => cleanup())

  it('renders "No people to display." when working is empty', () => {
    renderWithViewData(<ManagerView />, { working: [], original: [] })

    expect(screen.getByText('No people to display.')).toBeTruthy()
  })

  it('renders manager names', () => {
    const mgr = makeNode({ id: 'mgr', name: 'Manager Alice', role: 'Manager', managerId: '' })
    const ic1 = makeNode({ id: 'ic1', name: 'IC Bob', role: 'Engineer', discipline: 'Engineering', status: 'Active', managerId: 'mgr' })

    renderWithViewData(<ManagerView />, { working: [mgr, ic1], original: [mgr, ic1] })

    expect(screen.getByText('Manager Alice')).toBeTruthy()
  })

  it('shows summary card with discipline breakdown for Active ICs', () => {
    const mgr = makeNode({ id: 'mgr', name: 'Manager Alice', role: 'Manager', managerId: '' })
    const ic1 = makeNode({ id: 'ic1', name: 'IC Bob', role: 'Engineer', discipline: 'Engineering', status: 'Active', managerId: 'mgr' })

    renderWithViewData(<ManagerView />, { working: [mgr, ic1], original: [mgr, ic1] })

    expect(screen.getByText('Engineering')).toBeTruthy()
    expect(screen.getByText('1')).toBeTruthy()
  })

  it('shows "Recruiting" label in summary when Open/Backfill ICs exist', () => {
    const mgr = makeNode({ id: 'mgr', name: 'Manager Alice', role: 'Manager', managerId: '' })
    const ic1 = makeNode({ id: 'ic1', name: 'IC Bob', role: 'Engineer', discipline: 'Engineering', status: 'Active', managerId: 'mgr' })
    const ic2 = makeNode({ id: 'ic2', name: 'Open Req', role: 'Engineer', discipline: 'Engineering', status: 'Open', managerId: 'mgr' })

    renderWithViewData(<ManagerView />, { working: [mgr, ic1, ic2], original: [mgr, ic1, ic2] })

    expect(screen.getByText('Recruiting')).toBeTruthy()
  })

  it('renders chart container with data-role attribute', () => {
    const mgr = makeNode({ id: 'mgr', name: 'Manager Alice', role: 'Manager', managerId: '' })
    const ic1 = makeNode({ id: 'ic1', name: 'IC Bob', role: 'Engineer', discipline: 'Engineering', status: 'Active', managerId: 'mgr' })

    const { container } = renderWithViewData(<ManagerView />, { working: [mgr, ic1], original: [mgr, ic1] })

    const chartContainer = container.querySelector('[data-role="chart-container"]')
    expect(chartContainer).toBeTruthy()
  })
})
