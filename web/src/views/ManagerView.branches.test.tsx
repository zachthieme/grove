/**
 * Additional branch coverage for ManagerView.
 * Covers: buildStatusGroups branches (planned, transfers),
 * SummaryCard with pod groups, clickable pod cards, publicNote truncation,
 * empty groups, no-children manager.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import { screen, cleanup } from '@testing-library/react'
import ManagerView from './ManagerView'
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

afterEach(() => cleanup())

describe('ManagerView — branch coverage', () => {
  it('shows "Planned" in summary card for Planned status ICs', () => {
    const mgr = makeNode({ id: 'mgr', name: 'Manager', managerId: '' })
    const ic1 = makeNode({ id: 'ic1', name: 'Active IC', discipline: 'Eng', status: 'Active', managerId: 'mgr' })
    const ic2 = makeNode({ id: 'ic2', name: 'Planned IC', discipline: 'Eng', status: 'Planned', managerId: 'mgr' })

    renderWithViewData(<ManagerView />, { working: [mgr, ic1, ic2], original: [mgr, ic1, ic2] })

    expect(screen.getByText('Planned')).toBeTruthy()
  })

  it('shows "Transfers" in summary card for Transfer In/Out status ICs', () => {
    const mgr = makeNode({ id: 'mgr', name: 'Manager', managerId: '' })
    const ic1 = makeNode({ id: 'ic1', name: 'Active IC', discipline: 'Eng', status: 'Active', managerId: 'mgr' })
    const ic2 = makeNode({ id: 'ic2', name: 'Transfer IC', discipline: 'Eng', status: 'Transfer In', managerId: 'mgr' })

    renderWithViewData(<ManagerView />, { working: [mgr, ic1, ic2], original: [mgr, ic1, ic2] })

    expect(screen.getByText('Transfers')).toBeTruthy()
  })

  it('shows multiple discipline groups for Active ICs', () => {
    const mgr = makeNode({ id: 'mgr', name: 'Manager', managerId: '' })
    const ic1 = makeNode({ id: 'ic1', name: 'Eng IC', discipline: 'Engineering', status: 'Active', managerId: 'mgr' })
    const ic2 = makeNode({ id: 'ic2', name: 'Design IC', discipline: 'Design', status: 'Active', managerId: 'mgr' })

    renderWithViewData(<ManagerView />, { working: [mgr, ic1, ic2], original: [mgr, ic1, ic2] })

    expect(screen.getByText('Engineering')).toBeTruthy()
    expect(screen.getByText('Design')).toBeTruthy()
  })

  it('uses "Other" discipline for Active ICs with empty discipline', () => {
    const mgr = makeNode({ id: 'mgr', name: 'Manager', managerId: '' })
    const ic1 = makeNode({ id: 'ic1', name: 'No Disc', discipline: '', status: 'Active', managerId: 'mgr' })

    renderWithViewData(<ManagerView />, { working: [mgr, ic1], original: [mgr, ic1] })

    expect(screen.getByText('Other')).toBeTruthy()
  })

  it('renders podded ICs in separate summary cards', () => {
    const mgr = makeNode({ id: 'mgr', name: 'Manager', managerId: '' })
    const ic1 = makeNode({ id: 'ic1', name: 'IC1', discipline: 'Eng', status: 'Active', managerId: 'mgr', pod: 'Alpha' })
    const ic2 = makeNode({ id: 'ic2', name: 'IC2', discipline: 'Eng', status: 'Active', managerId: 'mgr', pod: 'Alpha' })
    const ic3 = makeNode({ id: 'ic3', name: 'IC3', discipline: 'Design', status: 'Active', managerId: 'mgr' })

    const pods = [{ id: 'pod1', name: 'Alpha', team: 'Eng', managerId: 'mgr' }]
    renderWithViewData(<ManagerView />, { working: [mgr, ic1, ic2, ic3], original: [mgr, ic1, ic2, ic3], pods })

    expect(screen.getByText('Alpha')).toBeTruthy()
  })

  it('renders sub-managers as nested subtrees', () => {
    const vp = makeNode({ id: 'vp', name: 'VP Alice', managerId: '' })
    const mgr = makeNode({ id: 'mgr', name: 'Manager Bob', managerId: 'vp' })
    const ic = makeNode({ id: 'ic', name: 'IC Carol', discipline: 'Eng', status: 'Active', managerId: 'mgr' })

    renderWithViewData(<ManagerView />, { working: [vp, mgr, ic], original: [vp, mgr, ic] })

    expect(screen.getByText('VP Alice')).toBeTruthy()
    expect(screen.getByText('Manager Bob')).toBeTruthy()
  })

  it('renders Backfill status under Recruiting label', () => {
    const mgr = makeNode({ id: 'mgr', name: 'Manager', managerId: '' })
    const ic1 = makeNode({ id: 'ic1', name: 'Backfill Req', discipline: 'Eng', status: 'Backfill', managerId: 'mgr' })

    renderWithViewData(<ManagerView />, { working: [mgr, ic1], original: [mgr, ic1] })

    expect(screen.getByText('Recruiting')).toBeTruthy()
  })

  it('renders Transfer Out status under Transfers label', () => {
    const mgr = makeNode({ id: 'mgr', name: 'Manager', managerId: '' })
    const ic1 = makeNode({ id: 'ic1', name: 'Transfer Out IC', discipline: 'Eng', status: 'Transfer Out', managerId: 'mgr' })

    renderWithViewData(<ManagerView />, { working: [mgr, ic1], original: [mgr, ic1] })

    expect(screen.getByText('Transfers')).toBeTruthy()
  })

  it('renders pod summary with truncated public note (>50 chars)', () => {
    const mgr = makeNode({ id: 'mgr', name: 'Manager', managerId: '' })
    const ic1 = makeNode({ id: 'ic1', name: 'IC1', discipline: 'Eng', status: 'Active', managerId: 'mgr', pod: 'Alpha' })
    const longNote = 'A'.repeat(60)
    const pods = [{ id: 'pod1', name: 'Alpha', team: 'Eng', managerId: 'mgr', publicNote: longNote }]

    renderWithViewData(<ManagerView />, { working: [mgr, ic1], original: [mgr, ic1], pods })

    // Note should be truncated to 47 chars + '...'
    expect(screen.getByText('A'.repeat(47) + '...')).toBeTruthy()
  })

  it('renders pod summary with short public note untruncated', () => {
    const mgr = makeNode({ id: 'mgr', name: 'Manager', managerId: '' })
    const ic1 = makeNode({ id: 'ic1', name: 'IC1', discipline: 'Eng', status: 'Active', managerId: 'mgr', pod: 'Alpha' })
    const shortNote = 'Short note'
    const pods = [{ id: 'pod1', name: 'Alpha', team: 'Eng', managerId: 'mgr', publicNote: shortNote }]

    renderWithViewData(<ManagerView />, { working: [mgr, ic1], original: [mgr, ic1], pods })

    expect(screen.getByText('Short note')).toBeTruthy()
  })

  it('renders orphan (no reports) as individual node', () => {
    const solo = makeNode({ id: 'solo', name: 'Solo Person', managerId: '' })

    renderWithViewData(<ManagerView />, { working: [solo], original: [solo] })

    expect(screen.getByText('Solo Person')).toBeTruthy()
  })
})
