import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import ManagerView from './ManagerView'
import type { Person } from '../api/types'

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

vi.mock('../store/OrgContext', () => ({
  useOrg: () => ({ move: vi.fn(), reparent: vi.fn(), selectedIds: new Set() }),
}))

const alice: Person = {
  id: 'a1', name: 'Alice', role: 'VP', discipline: 'Eng',
  managerId: '', team: 'Platform', additionalTeams: [], status: 'Active',
}
const bob: Person = {
  id: 'b2', name: 'Bob', role: 'Engineer', discipline: 'Eng',
  managerId: 'a1', team: 'Platform', additionalTeams: [], status: 'Active',
}
const carol: Person = {
  id: 'c3', name: 'Carol', role: 'Engineer', discipline: 'Eng',
  managerId: 'a1', team: 'Platform', additionalTeams: [], status: 'Open',
}

describe('ManagerView', () => {
  afterEach(() => cleanup())

  it('renders manager nodes', () => {
    render(
      <ManagerView
        people={[alice, bob]}
        selectedIds={new Set()}
        onSelect={vi.fn()}
      />
    )

    expect(screen.getByText('Alice')).toBeDefined()
  })

  it('summarizes ICs in SummaryCard with discipline count and Recruiting label', () => {
    render(
      <ManagerView
        people={[alice, bob, carol]}
        selectedIds={new Set()}
        onSelect={vi.fn()}
      />
    )

    // Alice is the manager node
    expect(screen.getByText('Alice')).toBeDefined()

    // Bob (Active Eng) should be summarized under discipline "Eng"
    expect(screen.getByText('Eng')).toBeDefined()

    // Carol (Open Eng) should appear under Recruiting
    expect(screen.getByText('Recruiting')).toBeDefined()
  })

  it('shows empty message when no people', () => {
    render(
      <ManagerView
        people={[]}
        selectedIds={new Set()}
        onSelect={vi.fn()}
      />
    )

    expect(screen.getByText('No people to display.')).toBeDefined()
  })
})
