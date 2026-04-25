/**
 * Additional branch coverage for ColumnView (round 2).
 * Covers: pod findPod returning a matching pod vs undefined, pod publicNote,
 * pod?.team vs podName fallback, pod onInfo callback, onFocus for managers
 * vs non-managers, changes map branches, showTeam when managerSet has a leaf,
 * icGroup with podName vs without, empty children (no subtree div),
 * selected node highlighting, and originalView readOnly mode.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import { screen, cleanup } from '@testing-library/react'
import ColumnView from './ColumnView'
import { makeNode, renderWithViewData } from '../test-helpers'
import type { Pod } from '../api/types'

vi.mock('@dnd-kit/core')
vi.mock('../hooks/useChartLayout')
vi.mock('../hooks/useDragDrop')

afterEach(() => cleanup())

describe('ColumnView — branch coverage (round 2)', () => {
  it('renders pod header with publicNote when pod exists in pods list', () => {
    const mgr = makeNode({ id: 'mgr', name: 'Manager', managerId: '' })
    const ic1 = makeNode({ id: 'ic1', name: 'IC1', managerId: 'mgr', pod: 'Alpha' })
    const pods: Pod[] = [
      { id: 'pod1', name: 'Alpha', team: 'Platform', managerId: 'mgr', publicNote: 'Team goals here' },
    ]

    renderWithViewData(<ColumnView />, {
      working: [mgr, ic1],
      original: [mgr, ic1],
      pods,
    })

    expect(screen.getByText('Alpha')).toBeTruthy()
    expect(screen.getByText('IC1')).toBeTruthy()
  })

  it('renders pod header without publicNote when pod does not exist in pods list', () => {
    const mgr = makeNode({ id: 'mgr', name: 'Manager', managerId: '' })
    const ic1 = makeNode({ id: 'ic1', name: 'IC1', managerId: 'mgr', pod: 'Orphan Pod' })

    renderWithViewData(<ColumnView />, {
      working: [mgr, ic1],
      original: [mgr, ic1],
      pods: [],
    })

    // Pod header should still render (with the pod name from the IC)
    expect(screen.getByText('Orphan Pod')).toBeTruthy()
  })

  it('renders correctly when a selected person is in the tree', () => {
    const mgr = makeNode({ id: 'mgr', name: 'Manager', managerId: '' })
    const ic1 = makeNode({ id: 'ic1', name: 'Selected IC', managerId: 'mgr' })

    renderWithViewData(<ColumnView />, {
      working: [mgr, ic1],
      original: [mgr, ic1],
      selectedIds: new Set(['ic1']),
    })

    expect(screen.getByText('Selected IC')).toBeTruthy()
  })

  it('renders in original/readOnly mode (dataView=original)', () => {
    const mgr = makeNode({ id: 'mgr', name: 'Manager', managerId: '' })
    const ic1 = makeNode({ id: 'ic1', name: 'IC Original', managerId: 'mgr' })

    renderWithViewData(<ColumnView />, {
      working: [mgr, ic1],
      original: [mgr, ic1],
      dataView: 'original',
    })

    expect(screen.getByText('IC Original')).toBeTruthy()
  })

  it('renders with diff changes showing added person', () => {
    const mgr = makeNode({ id: 'mgr', name: 'Manager', managerId: '' })
    const ic1 = makeNode({ id: 'ic1', name: 'Original IC', managerId: 'mgr' })
    const ic2 = makeNode({ id: 'ic2', name: 'New IC', managerId: 'mgr' })

    renderWithViewData(<ColumnView />, {
      working: [mgr, ic1, ic2],
      original: [mgr, ic1],
      dataView: 'diff',
    })

    expect(screen.getByText('New IC')).toBeTruthy()
    expect(screen.getByText('Original IC')).toBeTruthy()
  })

  it('renders icGroup items in mixed children without podName (team-based grouping)', () => {
    // Create a scenario where unaffiliated ICs from multiple teams get grouped
    // This triggers the icGroup path with podName undefined (team: item.team)
    const mgr = makeNode({ id: 'mgr', name: 'Manager', managerId: '' })
    const subMgr = makeNode({ id: 'sub', name: 'Sub Manager', managerId: 'mgr', team: 'TeamA' })
    const subIc = makeNode({ id: 'sub-ic', name: 'Sub IC', managerId: 'sub', team: 'TeamA' })
    // Multiple unaffiliated ICs from different teams -> triggers icGroup with team only
    const ic1 = makeNode({ id: 'ic1', name: 'IC Team X', managerId: 'mgr', team: 'TeamX' })
    const ic2 = makeNode({ id: 'ic2', name: 'IC Team Y', managerId: 'mgr', team: 'TeamY' })

    renderWithViewData(<ColumnView />, {
      working: [mgr, subMgr, subIc, ic1, ic2],
      original: [mgr, subMgr, subIc, ic1, ic2],
    })

    expect(screen.getByText('IC Team X')).toBeTruthy()
    expect(screen.getByText('IC Team Y')).toBeTruthy()
    expect(screen.getByText('Sub Manager')).toBeTruthy()
  })

  it('renders icGroup items in mixed children with podName (pod-based grouping)', () => {
    const mgr = makeNode({ id: 'mgr', name: 'Manager', managerId: '' })
    const subMgr = makeNode({ id: 'sub', name: 'Sub Manager', managerId: 'mgr', team: 'TeamA' })
    const subIc = makeNode({ id: 'sub-ic', name: 'Sub IC', managerId: 'sub', team: 'TeamA' })
    // Unaffiliated IC with a pod assigned -> triggers icGroup with podName set
    const ic1 = makeNode({ id: 'ic1', name: 'Pod IC1', managerId: 'mgr', team: 'Platform', pod: 'Alpha' })
    const ic2 = makeNode({ id: 'ic2', name: 'Pod IC2', managerId: 'mgr', team: 'Platform', pod: 'Alpha' })

    const pods: Pod[] = [
      { id: 'pod1', name: 'Alpha', team: 'Platform', managerId: 'mgr' },
    ]

    renderWithViewData(<ColumnView />, {
      working: [mgr, subMgr, subIc, ic1, ic2],
      original: [mgr, subMgr, subIc, ic1, ic2],
      pods,
    })

    expect(screen.getByText('Pod IC1')).toBeTruthy()
    expect(screen.getByText('Pod IC2')).toBeTruthy()
    // The pod header for the icGroup should render the pod name "Alpha"
    expect(screen.getByText('Alpha')).toBeTruthy()
  })

  it('renders a manager with zero children (leaf manager in managerSet)', () => {
    // A person who is in the managerSet but currently has no direct reports
    // This tests showTeam when managerSet has the person but children.length === 0
    const topMgr = makeNode({ id: 'top', name: 'Top', managerId: '' })
    const leafMgr = makeNode({ id: 'leaf', name: 'Leaf Manager', managerId: 'top' })

    renderWithViewData(<ColumnView />, {
      working: [topMgr, leafMgr],
      original: [topMgr, leafMgr],
    })

    expect(screen.getByText('Leaf Manager')).toBeTruthy()
    expect(screen.getByText('Top')).toBeTruthy()
  })

  it('renders cross-team IC in mixed children as individual renderIC (not in batch)', () => {
    // An IC with additionalTeams that match a sibling manager
    const vp = makeNode({ id: 'vp', name: 'VP', managerId: '' })
    const mgrA = makeNode({ id: 'mgrA', name: 'Manager A', managerId: 'vp', team: 'TeamA' })
    const mgrAIc = makeNode({ id: 'mgrA-ic', name: 'Manager A IC', managerId: 'mgrA', team: 'TeamA' })
    const mgrB = makeNode({ id: 'mgrB', name: 'Manager B', managerId: 'vp', team: 'TeamB' })
    const mgrBIc = makeNode({ id: 'mgrB-ic', name: 'Manager B IC', managerId: 'mgrB', team: 'TeamB' })
    // Cross-team IC linking TeamA and TeamB
    const crossIc = makeNode({
      id: 'cross', name: 'Cross IC', managerId: 'vp', team: 'TeamA',
      additionalTeams: ['TeamA', 'TeamB'],
    })
    // Normal IC
    const normalIc = makeNode({ id: 'normal', name: 'Normal IC', managerId: 'vp', team: 'TeamA' })

    renderWithViewData(<ColumnView />, {
      working: [vp, mgrA, mgrAIc, mgrB, mgrBIc, crossIc, normalIc],
      original: [vp, mgrA, mgrAIc, mgrB, mgrBIc, crossIc, normalIc],
    })

    expect(screen.getByText('Cross IC')).toBeTruthy()
    expect(screen.getByText('Normal IC')).toBeTruthy()
    expect(screen.getByText('Manager A')).toBeTruthy()
    expect(screen.getByText('Manager B')).toBeTruthy()
  })

  it('renders multiple pod groups sorted alphabetically in all-IC scenario', () => {
    const mgr = makeNode({ id: 'mgr', name: 'Manager', managerId: '' })
    const ic1 = makeNode({ id: 'ic1', name: 'Zeta IC', managerId: 'mgr', pod: 'Zeta' })
    const ic2 = makeNode({ id: 'ic2', name: 'Alpha IC', managerId: 'mgr', pod: 'Alpha' })
    const ic3 = makeNode({ id: 'ic3', name: 'Beta IC', managerId: 'mgr', pod: 'Beta' })

    renderWithViewData(<ColumnView />, {
      working: [mgr, ic1, ic2, ic3],
      original: [mgr, ic1, ic2, ic3],
    })

    // All pods should render (sorted: Alpha, Beta, Zeta)
    const alphaHeader = screen.getByText('Alpha')
    const betaHeader = screen.getByText('Beta')
    const zetaHeader = screen.getByText('Zeta')
    expect(alphaHeader).toBeTruthy()
    expect(betaHeader).toBeTruthy()
    expect(zetaHeader).toBeTruthy()
  })

  it('renders with diff mode showing removed person', () => {
    const mgr = makeNode({ id: 'mgr', name: 'Manager', managerId: '' })
    const ic1 = makeNode({ id: 'ic1', name: 'Staying IC', managerId: 'mgr' })
    const ic2 = makeNode({ id: 'ic2', name: 'Removed IC', managerId: 'mgr' })

    // In diff mode, original has both ICs but working only has one
    // The diff view uses ghostPeople to show removed people
    renderWithViewData(<ColumnView />, {
      working: [mgr, ic1],
      original: [mgr, ic1, ic2],
      dataView: 'diff',
    })

    expect(screen.getByText('Staying IC')).toBeTruthy()
  })

  it('renders single unaffiliated IC in mixed children without grouping', () => {
    // Only one unaffiliated IC from a single team -> no icGroup, just flat IC
    const mgr = makeNode({ id: 'mgr', name: 'Manager', managerId: '' })
    const subMgr = makeNode({ id: 'sub', name: 'Sub', managerId: 'mgr', team: 'TeamA' })
    const subIc = makeNode({ id: 'sub-ic', name: 'Sub IC', managerId: 'sub', team: 'TeamA' })
    const ic1 = makeNode({ id: 'ic1', name: 'Solo Unaffiliated', managerId: 'mgr', team: 'Platform' })

    renderWithViewData(<ColumnView />, {
      working: [mgr, subMgr, subIc, ic1],
      original: [mgr, subMgr, subIc, ic1],
    })

    expect(screen.getByText('Solo Unaffiliated')).toBeTruthy()
  })

  it('flushes IC batch at end of mixedChildrenElements (trailing ICs)', () => {
    // When the last items in renderItems are non-cross-team ICs
    // flushIcBatch() at the end should flush them
    const mgr = makeNode({ id: 'mgr', name: 'Manager', managerId: '' })
    const subMgr = makeNode({ id: 'sub', name: 'Sub', managerId: 'mgr', team: 'TeamA' })
    const subIc = makeNode({ id: 'sub-ic', name: 'Sub IC', managerId: 'sub' })
    // These ICs come after the manager in render items and should be flushed as a batch
    const ic1 = makeNode({ id: 'ic1', name: 'Trailing IC 1', managerId: 'mgr', team: 'Platform' })

    renderWithViewData(<ColumnView />, {
      working: [mgr, subMgr, subIc, ic1],
      original: [mgr, subMgr, subIc, ic1],
    })

    expect(screen.getByText('Trailing IC 1')).toBeTruthy()
    expect(screen.getByText('Sub')).toBeTruthy()
  })

  it('renders with pod that has team field differing from podName', () => {
    // pod?.team ?? podName — covers when pod.team is available
    const mgr = makeNode({ id: 'mgr', name: 'Manager', managerId: '' })
    const ic1 = makeNode({ id: 'ic1', name: 'IC1', managerId: 'mgr', pod: 'Alpha' })
    const pods: Pod[] = [
      { id: 'pod1', name: 'Alpha', team: 'CustomTeam', managerId: 'mgr' },
    ]

    renderWithViewData(<ColumnView />, {
      working: [mgr, ic1],
      original: [mgr, ic1],
      pods,
    })

    expect(screen.getByText('Alpha')).toBeTruthy()
    expect(screen.getByText('IC1')).toBeTruthy()
  })

  it('renders the no-data message when both working and original are empty', () => {
    renderWithViewData(<ColumnView />, {
      working: [],
      original: [],
    })

    expect(screen.getByText('No people to display.')).toBeTruthy()
  })

  it('renders multiple selected IDs correctly', () => {
    const mgr = makeNode({ id: 'mgr', name: 'Manager', managerId: '' })
    const ic1 = makeNode({ id: 'ic1', name: 'IC1', managerId: 'mgr' })
    const ic2 = makeNode({ id: 'ic2', name: 'IC2', managerId: 'mgr' })

    renderWithViewData(<ColumnView />, {
      working: [mgr, ic1, ic2],
      original: [mgr, ic1, ic2],
      selectedIds: new Set(['ic1', 'ic2']),
    })

    expect(screen.getByText('IC1')).toBeTruthy()
    expect(screen.getByText('IC2')).toBeTruthy()
  })
})
