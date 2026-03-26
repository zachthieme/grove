import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import ColumnView from './ColumnView'
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

function makePerson(overrides: Partial<Person> = {}): Person {
  return {
    id: 'default-id',
    name: 'Default Person',
    role: 'Engineer',
    discipline: 'Engineering',
    managerId: '',
    team: 'Platform',
    additionalTeams: [],
    status: 'Active',
    ...overrides,
  }
}

describe('ColumnView', () => {
  afterEach(() => cleanup())

  it('renders people as tree nodes', () => {
    const alice = makePerson({ id: 'alice', name: 'Alice Smith', managerId: '' })
    const bob = makePerson({ id: 'bob', name: 'Bob Jones', managerId: 'alice' })

    render(
      <ColumnView
        people={[alice, bob]}
        selectedIds={new Set()}
        onSelect={vi.fn()}
      />
    )

    expect(screen.getByText('Alice Smith')).toBeDefined()
    expect(screen.getByText('Bob Jones')).toBeDefined()
  })

  it('shows empty message when no people', () => {
    render(
      <ColumnView
        people={[]}
        selectedIds={new Set()}
        onSelect={vi.fn()}
      />
    )

    expect(screen.getByText('No people to display.')).toBeDefined()
  })

  it('renders orphans grouped by team', () => {
    const carol = makePerson({ id: 'carol', name: 'Carol White', team: 'Design', managerId: '' })
    const dave = makePerson({ id: 'dave', name: 'Dave Brown', team: 'Engineering', managerId: '' })

    render(
      <ColumnView
        people={[carol, dave]}
        selectedIds={new Set()}
        onSelect={vi.fn()}
      />
    )

    expect(screen.getByText('Carol White')).toBeDefined()
    expect(screen.getByText('Dave Brown')).toBeDefined()
  })

  it('highlights selected nodes with data-selected', () => {
    const alice = makePerson({ id: 'alice', name: 'Alice Smith', managerId: '' })
    const bob = makePerson({ id: 'bob', name: 'Bob Jones', managerId: 'alice' })

    render(
      <ColumnView
        people={[alice, bob]}
        selectedIds={new Set(['alice'])}
        onSelect={vi.fn()}
      />
    )

    const selectedNodes = document.querySelectorAll('[data-selected="true"]')
    expect(selectedNodes.length).toBeGreaterThan(0)

    const notSelectedNodes = document.querySelectorAll('[data-selected="false"]')
    expect(notSelectedNodes.length).toBeGreaterThan(0)
  })
})
