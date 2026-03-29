/**
 * Additional branch coverage for ColumnView.
 * Covers: IC pod grouping, unpodded ICs, mixed children (managers + ICs),
 * cross-team ICs, diff view changes, ghost people.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import { screen, cleanup } from '@testing-library/react'
import ColumnView from './ColumnView'
import { makePerson, renderWithViewData } from '../test-helpers'

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

afterEach(() => cleanup())

describe('ColumnView — branch coverage', () => {
  it('renders ICs grouped by pod when all children are ICs', () => {
    const mgr = makePerson({ id: 'mgr', name: 'Manager', managerId: '' })
    const ic1 = makePerson({ id: 'ic1', name: 'IC1', managerId: 'mgr', pod: 'Alpha' })
    const ic2 = makePerson({ id: 'ic2', name: 'IC2', managerId: 'mgr', pod: 'Alpha' })
    const ic3 = makePerson({ id: 'ic3', name: 'IC3', managerId: 'mgr', pod: 'Beta' })

    renderWithViewData(<ColumnView />, {
      working: [mgr, ic1, ic2, ic3],
      original: [mgr, ic1, ic2, ic3],
    })

    expect(screen.getByText('Manager')).toBeTruthy()
    expect(screen.getByText('IC1')).toBeTruthy()
    expect(screen.getByText('IC2')).toBeTruthy()
    expect(screen.getByText('IC3')).toBeTruthy()
    // Pod headers should be rendered
    expect(screen.getByText('Alpha')).toBeTruthy()
    expect(screen.getByText('Beta')).toBeTruthy()
  })

  it('renders unpodded ICs separately from podded ICs', () => {
    const mgr = makePerson({ id: 'mgr', name: 'Manager', managerId: '' })
    const ic1 = makePerson({ id: 'ic1', name: 'IC Podded', managerId: 'mgr', pod: 'Alpha' })
    const ic2 = makePerson({ id: 'ic2', name: 'IC Unpodded', managerId: 'mgr' })

    renderWithViewData(<ColumnView />, {
      working: [mgr, ic1, ic2],
      original: [mgr, ic1, ic2],
    })

    expect(screen.getByText('IC Podded')).toBeTruthy()
    expect(screen.getByText('IC Unpodded')).toBeTruthy()
    expect(screen.getByText('Alpha')).toBeTruthy()
  })

  it('renders all ICs in a flat stack when no pods are used', () => {
    const mgr = makePerson({ id: 'mgr', name: 'Manager', managerId: '' })
    const ic1 = makePerson({ id: 'ic1', name: 'IC1', managerId: 'mgr' })
    const ic2 = makePerson({ id: 'ic2', name: 'IC2', managerId: 'mgr' })

    renderWithViewData(<ColumnView />, {
      working: [mgr, ic1, ic2],
      original: [mgr, ic1, ic2],
    })

    expect(screen.getByText('IC1')).toBeTruthy()
    expect(screen.getByText('IC2')).toBeTruthy()
  })

  it('renders mixed children: managers + ICs', () => {
    const vp = makePerson({ id: 'vp', name: 'VP', managerId: '' })
    const mgr = makePerson({ id: 'mgr', name: 'Sub Manager', managerId: 'vp' })
    const ic1 = makePerson({ id: 'ic1', name: 'VP IC', managerId: 'vp' })
    const ic2 = makePerson({ id: 'ic2', name: 'Mgr IC', managerId: 'mgr' })

    renderWithViewData(<ColumnView />, {
      working: [vp, mgr, ic1, ic2],
      original: [vp, mgr, ic1, ic2],
    })

    expect(screen.getByText('VP')).toBeTruthy()
    expect(screen.getByText('Sub Manager')).toBeTruthy()
    expect(screen.getByText('VP IC')).toBeTruthy()
    expect(screen.getByText('Mgr IC')).toBeTruthy()
  })

  it('renders cross-team ICs (with additionalTeams) separately', () => {
    const mgr = makePerson({ id: 'mgr', name: 'Manager', managerId: '' })
    const subMgr = makePerson({ id: 'sub', name: 'Sub', managerId: 'mgr' })
    const subIc = makePerson({ id: 'sub-ic', name: 'Sub IC', managerId: 'sub' })
    const crossTeamIc = makePerson({ id: 'cross', name: 'Cross Team IC', managerId: 'mgr', additionalTeams: ['Other'] })
    const normalIc = makePerson({ id: 'normal', name: 'Normal IC', managerId: 'mgr' })

    renderWithViewData(<ColumnView />, {
      working: [mgr, subMgr, subIc, crossTeamIc, normalIc],
      original: [mgr, subMgr, subIc, crossTeamIc, normalIc],
    })

    expect(screen.getByText('Cross Team IC')).toBeTruthy()
    expect(screen.getByText('Normal IC')).toBeTruthy()
  })

  it('renders in diff mode showing changes', () => {
    const mgr = makePerson({ id: 'mgr', name: 'Manager', managerId: '' })
    const originalIc = makePerson({ id: 'ic1', name: 'IC', managerId: 'mgr', role: 'Engineer' })
    const changedIc = makePerson({ id: 'ic1', name: 'IC', managerId: 'mgr', role: 'Senior Engineer' })

    renderWithViewData(<ColumnView />, {
      working: [mgr, changedIc],
      original: [mgr, originalIc],
      dataView: 'diff',
    })

    expect(screen.getByText('IC')).toBeTruthy()
  })

  it('renders mixed children with pod groups using icGroup items', () => {
    const mgr = makePerson({ id: 'mgr', name: 'Manager', managerId: '' })
    const subMgr = makePerson({ id: 'sub', name: 'Sub', managerId: 'mgr' })
    const subIc = makePerson({ id: 'sub-ic', name: 'Sub IC', managerId: 'sub' })
    const ic1 = makePerson({ id: 'ic1', name: 'Pod IC1', managerId: 'mgr', pod: 'Alpha' })
    const ic2 = makePerson({ id: 'ic2', name: 'Pod IC2', managerId: 'mgr', pod: 'Alpha' })

    renderWithViewData(<ColumnView />, {
      working: [mgr, subMgr, subIc, ic1, ic2],
      original: [mgr, subMgr, subIc, ic1, ic2],
    })

    expect(screen.getByText('Sub')).toBeTruthy()
    expect(screen.getByText('Pod IC1')).toBeTruthy()
    expect(screen.getByText('Pod IC2')).toBeTruthy()
  })

  it('renders orphan people when they have no manager in the data', () => {
    const solo1 = makePerson({ id: 'a', name: 'Orphan A', team: 'Eng', managerId: '' })
    const solo2 = makePerson({ id: 'b', name: 'Orphan B', team: 'Design', managerId: '' })

    renderWithViewData(<ColumnView />, {
      working: [solo1, solo2],
      original: [solo1, solo2],
    })

    expect(screen.getByText('Orphan A')).toBeTruthy()
    expect(screen.getByText('Orphan B')).toBeTruthy()
  })
})
