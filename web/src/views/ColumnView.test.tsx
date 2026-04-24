// Scenarios: VIEW-001
import { describe, it, expect, vi, afterEach } from 'vitest'
import { screen, cleanup } from '@testing-library/react'
import ColumnView from './ColumnView'
import { makeNode, renderWithViewData } from '../test-helpers'

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

describe('ColumnView', () => {
  afterEach(() => cleanup())

  it('renders "No people to display." when working is empty', () => {
    renderWithViewData(<ColumnView />, { working: [], original: [] })
    expect(screen.getByText('No people to display.')).toBeTruthy()
  })

  it('renders person names when people provided', () => {
    const ceo = makeNode({ id: 'ceo', name: 'Alice CEO', role: 'CEO', managerId: '' })
    const eng = makeNode({ id: 'eng', name: 'Bob Engineer', role: 'Engineer', managerId: 'ceo' })

    renderWithViewData(<ColumnView />, { working: [ceo, eng], original: [ceo, eng] })

    expect(screen.getByText('Alice CEO')).toBeTruthy()
    expect(screen.getByText('Bob Engineer')).toBeTruthy()
  })

  it('renders all people in the tree', () => {
    const ceo = makeNode({ id: 'ceo', name: 'Alice CEO', role: 'CEO', managerId: '' })
    const eng = makeNode({ id: 'eng', name: 'Bob Engineer', role: 'Engineer', managerId: 'ceo' })
    const des = makeNode({ id: 'des', name: 'Carol Designer', role: 'Designer', managerId: 'ceo' })

    renderWithViewData(<ColumnView />, { working: [ceo, eng, des], original: [ceo, eng, des] })

    expect(screen.getByText('Alice CEO')).toBeTruthy()
    expect(screen.getByText('Bob Engineer')).toBeTruthy()
    expect(screen.getByText('Carol Designer')).toBeTruthy()
  })

  it('shows team on manager nodes', () => {
    const ceo = makeNode({ id: 'ceo', name: 'Alice CEO', role: 'CEO', team: 'Leadership', managerId: '' })
    const eng = makeNode({ id: 'eng', name: 'Bob Engineer', role: 'Engineer', team: 'Platform', managerId: 'ceo' })

    renderWithViewData(<ColumnView />, { working: [ceo, eng], original: [ceo, eng] })

    expect(screen.getByText('Leadership')).toBeTruthy()
  })

  it('renders chart container with data-role attribute', () => {
    const ceo = makeNode({ id: 'ceo', name: 'Alice CEO', role: 'CEO', managerId: '' })
    const eng = makeNode({ id: 'eng', name: 'Bob Engineer', role: 'Engineer', managerId: 'ceo' })

    const { container } = renderWithViewData(<ColumnView />, { working: [ceo, eng], original: [ceo, eng] })

    const chartContainer = container.querySelector('[data-role="chart-container"]')
    expect(chartContainer).toBeTruthy()

    const forest = container.querySelector('[data-role="forest"]')
    expect(forest).toBeTruthy()
  })
})
