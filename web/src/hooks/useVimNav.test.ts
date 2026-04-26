import { describe, it, expect, vi, afterEach } from 'vitest'
import { renderHook, cleanup } from '@testing-library/react'
import { fireEvent } from '@testing-library/dom'
import { useVimNav, findRootPerson, findDeepestLeaf, findParentForSelection } from './useVimNav'
import type { OrgNode } from '../api/types'

function makePerson(overrides: Partial<OrgNode> = {}): OrgNode {
  return {
    id: 'p1',
    name: 'Alice',
    role: 'Engineer',
    discipline: 'Engineering',
    managerId: '',
    team: 'Platform',
    additionalTeams: [],
    status: 'Active',
    ...overrides,
  }
}

function makeProduct(overrides: Partial<OrgNode> = {}): OrgNode {
  return {
    id: 'prod1',
    type: 'product',
    name: 'Widget',
    role: '',
    discipline: '',
    managerId: 'p1',
    team: 'Platform',
    additionalTeams: [],
    status: 'Active',
    ...overrides,
  }
}

// Each renderHook registers a document-level keydown listener; without
// cleanup, listeners from earlier tests fire on later tests' keydowns and
// inflate click counts. Global afterEach unmounts after every test.
afterEach(() => cleanup())

describe('useVimNav', () => {
  it('[VIM-002] o on a product creates a sibling product (same parent + team + pod)', () => {
    const onAddReport = vi.fn()
    const onAddProduct = vi.fn()
    const alice = makePerson()
    const widget = makeProduct({ id: 'prod1', managerId: alice.id, team: 'Platform', pod: 'Alpha' })

    renderHook(() =>
      useVimNav({
        working: [alice, widget],
        pods: [],
        selectedId: widget.id,
        onAddReport,
        onAddProduct,
        move: vi.fn(),
        reparent: vi.fn(),
        enabled: true,
      }),
    )

    fireEvent.keyDown(document, { key: 'o' })

    expect(onAddProduct).toHaveBeenCalledTimes(1)
    expect(onAddProduct).toHaveBeenCalledWith(alice.id, 'Platform', 'Alpha')
    expect(onAddReport).not.toHaveBeenCalled()
  })

  it('[VIM-002] d on a multi-selection deletes every selected id', () => {
    const onDelete = vi.fn()
    const a = makePerson({ id: 'p1' })
    const b = makePerson({ id: 'p2', name: 'Bob' })
    const c = makePerson({ id: 'p3', name: 'Carol' })

    renderHook(() =>
      useVimNav({
        working: [a, b, c],
        pods: [],
        selectedId: null,                       // App sets selectedId=null when size>1
        selectedIds: new Set(['p1', 'p3']),
        onDelete,
        move: vi.fn(),
        reparent: vi.fn(),
        enabled: true,
      }),
    )

    fireEvent.keyDown(document, { key: 'd' })

    expect(onDelete).toHaveBeenCalledTimes(2)
    expect(onDelete).toHaveBeenCalledWith('p1')
    expect(onDelete).toHaveBeenCalledWith('p3')
  })

  it('[VIM-002] o on a person creates a report (legacy behavior)', () => {
    const onAddReport = vi.fn()
    const onAddProduct = vi.fn()
    const alice = makePerson({ id: 'p1' })

    renderHook(() =>
      useVimNav({
        working: [alice],
        pods: [],
        selectedId: alice.id,
        onAddReport,
        onAddProduct,
        move: vi.fn(),
        reparent: vi.fn(),
        enabled: true,
      }),
    )

    fireEvent.keyDown(document, { key: 'o' })

    expect(onAddReport).toHaveBeenCalledTimes(1)
    expect(onAddReport).toHaveBeenCalledWith(alice.id)
    expect(onAddProduct).not.toHaveBeenCalled()
  })

  it('[VIM-003] + ona person creates a child product', () => {
    const onAddProduct = vi.fn()
    const alice = makePerson({ id: 'p1', team: 'Platform', pod: 'Alpha' })

    renderHook(() =>
      useVimNav({
        working: [alice],
        pods: [],
        selectedId: alice.id,
        onAddProduct,
        move: vi.fn(),
        reparent: vi.fn(),
        enabled: true,
      }),
    )

    fireEvent.keyDown(document, { key: '+' })

    expect(onAddProduct).toHaveBeenCalledTimes(1)
    expect(onAddProduct).toHaveBeenCalledWith(alice.id, 'Platform', 'Alpha')
  })

  it('[VIM-003] + ona product creates a sibling product (no nesting)', () => {
    const onAddProduct = vi.fn()
    const alice = makePerson({ id: 'p1' })
    const widget = makeProduct({ id: 'prod1', managerId: alice.id, team: 'Platform', pod: 'Alpha' })

    renderHook(() =>
      useVimNav({
        working: [alice, widget],
        pods: [],
        selectedId: widget.id,
        onAddProduct,
        move: vi.fn(),
        reparent: vi.fn(),
        enabled: true,
      }),
    )

    fireEvent.keyDown(document, { key: '+' })

    expect(onAddProduct).toHaveBeenCalledTimes(1)
    expect(onAddProduct).toHaveBeenCalledWith(alice.id, 'Platform', 'Alpha')
  })

  it('[VIM-002] o on a pod adds a person to that pod (regardless of pod size)', () => {
    const onAddReport = vi.fn()
    const onAddToTeam = vi.fn()
    const alice = makePerson({ id: 'p1' })
    // Two members already in the pod — earlier behavior no-op'd because resolvePersonIds returned 2.
    const ic1 = makePerson({ id: 'ic1', managerId: 'p1', team: 'Platform', pod: 'Alpha' })
    const ic2 = makePerson({ id: 'ic2', managerId: 'p1', team: 'Platform', pod: 'Alpha' })
    const pods = [{ id: 'pod-1', managerId: 'p1', name: 'Alpha', team: 'Platform', publicNote: '' } as never]

    renderHook(() =>
      useVimNav({
        working: [alice, ic1, ic2],
        pods,
        selectedId: 'pod:p1:Alpha',
        onAddReport,
        onAddToTeam,
        move: vi.fn(),
        reparent: vi.fn(),
        enabled: true,
      }),
    )

    fireEvent.keyDown(document, { key: 'o' })

    expect(onAddToTeam).toHaveBeenCalledTimes(1)
    expect(onAddToTeam).toHaveBeenCalledWith('p1', 'Platform', 'Alpha')
    expect(onAddReport).not.toHaveBeenCalled()
  })

  it('[VIM-003] + ona pod adds a product to that pod', () => {
    const onAddProduct = vi.fn()
    const alice = makePerson({ id: 'p1' })
    const pods = [{ id: 'pod-1', managerId: 'p1', name: 'Alpha', team: 'Platform', publicNote: '' } as never]

    renderHook(() =>
      useVimNav({
        working: [alice],
        pods,
        selectedId: 'pod:p1:Alpha',
        onAddProduct,
        move: vi.fn(),
        reparent: vi.fn(),
        enabled: true,
      }),
    )

    fireEvent.keyDown(document, { key: '+' })

    expect(onAddProduct).toHaveBeenCalledTimes(1)
    expect(onAddProduct).toHaveBeenCalledWith('p1', 'Platform', 'Alpha')
  })

  it('[VIM-007] a on a person adds a sibling under the same parent/team/pod', () => {
    const onAddToTeam = vi.fn()
    const onAddReport = vi.fn()
    const ceo = makePerson({ id: 'ceo', managerId: '' })
    const ic = makePerson({ id: 'ic1', managerId: 'ceo', team: 'Eng', pod: 'Alpha' })

    renderHook(() =>
      useVimNav({
        working: [ceo, ic],
        pods: [],
        selectedId: 'ic1',
        onAddToTeam,
        onAddReport,
        move: vi.fn(),
        reparent: vi.fn(),
        enabled: true,
      }),
    )

    fireEvent.keyDown(document, { key: 'a' })

    expect(onAddToTeam).toHaveBeenCalledTimes(1)
    expect(onAddToTeam).toHaveBeenCalledWith('ceo', 'Eng', 'Alpha')
    expect(onAddReport).not.toHaveBeenCalled()
  })

  it('[VIM-007] a on a product adds a sibling product under same parent/team/pod', () => {
    const onAddProduct = vi.fn()
    const onAddToTeam = vi.fn()
    const alice = makePerson({ id: 'p1' })
    const widget = makeProduct({ id: 'prod1', managerId: 'p1', team: 'Platform', pod: 'Alpha' })

    renderHook(() =>
      useVimNav({
        working: [alice, widget],
        pods: [],
        selectedId: 'prod1',
        onAddProduct,
        onAddToTeam,
        move: vi.fn(),
        reparent: vi.fn(),
        enabled: true,
      }),
    )

    fireEvent.keyDown(document, { key: 'a' })

    expect(onAddProduct).toHaveBeenCalledTimes(1)
    expect(onAddProduct).toHaveBeenCalledWith('p1', 'Platform', 'Alpha')
    expect(onAddToTeam).not.toHaveBeenCalled()
  })

  it('[VIM-007] a on a pod adds a person to the pod (mirrors o)', () => {
    const onAddToTeam = vi.fn()
    const alice = makePerson({ id: 'p1' })
    const pods = [{ id: 'pod-1', managerId: 'p1', name: 'Alpha', team: 'Platform', publicNote: '' } as never]

    renderHook(() =>
      useVimNav({
        working: [alice],
        pods,
        selectedId: 'pod:p1:Alpha',
        onAddToTeam,
        move: vi.fn(),
        reparent: vi.fn(),
        enabled: true,
      }),
    )

    fireEvent.keyDown(document, { key: 'a' })

    expect(onAddToTeam).toHaveBeenCalledTimes(1)
    expect(onAddToTeam).toHaveBeenCalledWith('p1', 'Platform', 'Alpha')
  })

  it('[VIM-007] a on a root person (no manager) adds a peer-of-root with empty managerId', () => {
    const onAddToTeam = vi.fn()
    const ceo = makePerson({ id: 'ceo', managerId: '', team: 'Exec' })

    renderHook(() =>
      useVimNav({
        working: [ceo],
        pods: [],
        selectedId: 'ceo',
        onAddToTeam,
        move: vi.fn(),
        reparent: vi.fn(),
        enabled: true,
      }),
    )

    fireEvent.keyDown(document, { key: 'a' })

    expect(onAddToTeam).toHaveBeenCalledTimes(1)
    expect(onAddToTeam).toHaveBeenCalledWith('', 'Exec', undefined)
  })
})

describe('useVimNav undo/redo', () => {
  afterEach(() => cleanup())

  it('[VIM-009] u calls onUndo when canUndo is true', () => {
    const onUndo = vi.fn()
    const onRedo = vi.fn()
    const ceo = makePerson({ id: 'p1' })

    renderHook(() =>
      useVimNav({
        working: [ceo],
        pods: [],
        selectedId: 'p1',
        onUndo,
        onRedo,
        canUndo: true,
        canRedo: false,
        move: vi.fn(),
        reparent: vi.fn(),
        enabled: true,
      }),
    )

    fireEvent.keyDown(document, { key: 'u' })

    expect(onUndo).toHaveBeenCalledTimes(1)
    expect(onRedo).not.toHaveBeenCalled()
  })

  it('[VIM-009] u is a no-op when canUndo is false', () => {
    const onUndo = vi.fn()
    renderHook(() =>
      useVimNav({
        working: [],
        pods: [],
        selectedId: null,
        onUndo,
        canUndo: false,
        canRedo: false,
        move: vi.fn(),
        reparent: vi.fn(),
        enabled: true,
      }),
    )

    fireEvent.keyDown(document, { key: 'u' })

    expect(onUndo).not.toHaveBeenCalled()
  })

  it('[VIM-009] Ctrl+R calls onRedo when canRedo is true', () => {
    const onRedo = vi.fn()
    renderHook(() =>
      useVimNav({
        working: [],
        pods: [],
        selectedId: null,
        onRedo,
        canUndo: false,
        canRedo: true,
        move: vi.fn(),
        reparent: vi.fn(),
        enabled: true,
      }),
    )

    fireEvent.keyDown(document, { key: 'r', ctrlKey: true })

    expect(onRedo).toHaveBeenCalledTimes(1)
  })

  it('[VIM-009] Ctrl+R is a no-op when canRedo is false', () => {
    const onRedo = vi.fn()
    renderHook(() =>
      useVimNav({
        working: [],
        pods: [],
        selectedId: null,
        onRedo,
        canUndo: false,
        canRedo: false,
        move: vi.fn(),
        reparent: vi.fn(),
        enabled: true,
      }),
    )

    fireEvent.keyDown(document, { key: 'r', ctrlKey: true })

    expect(onRedo).not.toHaveBeenCalled()
  })

  it('[VIM-009] u in an input is ignored (vim handler skips inputs)', () => {
    const onUndo = vi.fn()
    const input = document.createElement('input')
    document.body.appendChild(input)

    renderHook(() =>
      useVimNav({
        working: [],
        pods: [],
        selectedId: null,
        onUndo,
        canUndo: true,
        canRedo: false,
        move: vi.fn(),
        reparent: vi.fn(),
        enabled: true,
      }),
    )

    fireEvent.keyDown(input, { key: 'u' })

    expect(onUndo).not.toHaveBeenCalled()
    document.body.removeChild(input)
  })
})

describe('findRootPerson', () => {
  it('[VIM-008] returns the first person with empty managerId', () => {
    const ceo = { id: 'ceo', managerId: '' } as OrgNode
    const ic = { id: 'ic1', managerId: 'ceo' } as OrgNode
    expect(findRootPerson([ic, ceo])).toBe(ceo)
  })

  it('[VIM-008] returns undefined for empty working', () => {
    expect(findRootPerson([])).toBeUndefined()
  })

  it('[VIM-008] returns first root when multiple roots exist', () => {
    const a = { id: 'a', managerId: '' } as OrgNode
    const b = { id: 'b', managerId: '' } as OrgNode
    expect(findRootPerson([a, b])).toBe(a)
  })
})

describe('findDeepestLeaf', () => {
  // ceo -> mid -> leaf1
  //               leaf2
  //     -> shallow
  const ceo = { id: 'ceo', managerId: '' } as OrgNode
  const mid = { id: 'mid', managerId: 'ceo' } as OrgNode
  const leaf1 = { id: 'leaf1', managerId: 'mid' } as OrgNode
  const leaf2 = { id: 'leaf2', managerId: 'mid' } as OrgNode
  const shallow = { id: 'shallow', managerId: 'ceo' } as OrgNode
  const working = [ceo, mid, leaf1, leaf2, shallow]

  it('[VIM-008] from root finds the deepest leaf', () => {
    const deepest = findDeepestLeaf(working)
    expect(deepest?.id).toBe('leaf1')
  })

  it('[VIM-008] from a subtree finds the deepest leaf within that subtree', () => {
    const deepest = findDeepestLeaf(working, 'mid')
    expect(deepest?.id).toBe('leaf1')
  })

  it('[VIM-008] from a leaf returns the leaf itself', () => {
    const deepest = findDeepestLeaf(working, 'shallow')
    expect(deepest?.id).toBe('shallow')
  })

  it('[VIM-008] tie-break is encounter order (DFS pre-order)', () => {
    const deepest = findDeepestLeaf(working, 'mid')
    // leaf1 comes before leaf2 in working[]
    expect(deepest?.id).toBe('leaf1')
  })

  it('[VIM-008] returns undefined for empty working', () => {
    expect(findDeepestLeaf([])).toBeUndefined()
  })
})

describe('findParentForSelection', () => {
  const ceo = { id: 'ceo', managerId: '' } as OrgNode
  const mid = { id: 'mid', managerId: 'ceo' } as OrgNode
  const ic = { id: 'ic1', managerId: 'mid' } as OrgNode
  const working = [ceo, mid, ic]

  it('[VIM-008] returns the manager of a person', () => {
    expect(findParentForSelection(working, 'ic1')?.id).toBe('mid')
  })

  it('[VIM-008] returns undefined for the root (no parent)', () => {
    expect(findParentForSelection(working, 'ceo')).toBeUndefined()
  })

  it('[VIM-008] returns the pod manager for a pod collapseKey', () => {
    expect(findParentForSelection(working, 'pod:mid:Alpha')?.id).toBe('mid')
  })

  it('[VIM-008] returns the team manager for a team collapseKey', () => {
    expect(findParentForSelection(working, 'team:mid:Eng')?.id).toBe('mid')
  })

  it('[VIM-008] returns undefined for a stale selection (id not in working)', () => {
    expect(findParentForSelection(working, 'gone')).toBeUndefined()
  })
})

describe('useVimNav gg/G/gp keyboard sequence', () => {
  afterEach(() => {
    cleanup()
    document.body.innerHTML = ''
    vi.useRealTimers()
  })

  // DOM scaffold so the hook's `.click()` resolves to a target we can spy on.
  function mountChartDom(ids: string[]): Map<string, ReturnType<typeof vi.fn>> {
    const clicks = new Map<string, ReturnType<typeof vi.fn>>()
    document.body.innerHTML = ''
    for (const id of ids) {
      const wrapper = document.createElement('div')
      wrapper.setAttribute('data-person-id', id)
      const btn = document.createElement('button')
      btn.setAttribute('role', 'button')
      const onClick = vi.fn()
      btn.addEventListener('click', onClick)
      clicks.set(id, onClick)
      wrapper.appendChild(btn)
      document.body.appendChild(wrapper)
    }
    return clicks
  }

  it('[VIM-008] gg jumps to the root person', () => {
    const ceo = { id: 'ceo', managerId: '', name: 'CEO', role: '', discipline: '', team: '', additionalTeams: [], status: 'Active' } as OrgNode
    const ic = { id: 'ic1', managerId: 'ceo', name: 'IC', role: '', discipline: '', team: '', additionalTeams: [], status: 'Active' } as OrgNode
    const clicks = mountChartDom(['ceo', 'ic1'])

    renderHook(() =>
      useVimNav({
        working: [ceo, ic],
        pods: [],
        selectedId: 'ic1',
        move: vi.fn(),
        reparent: vi.fn(),
        enabled: true,
      }),
    )

    fireEvent.keyDown(document, { key: 'g' })
    fireEvent.keyDown(document, { key: 'g' })

    expect(clicks.get('ceo')).toHaveBeenCalledTimes(1)
    expect(clicks.get('ic1')).not.toHaveBeenCalled()
  })

  it('[VIM-008] G jumps to the deepest leaf in the current subtree', () => {
    const ceo = { id: 'ceo', managerId: '', name: 'CEO', role: '', discipline: '', team: '', additionalTeams: [], status: 'Active' } as OrgNode
    const mid = { id: 'mid', managerId: 'ceo', name: 'Mid', role: '', discipline: '', team: '', additionalTeams: [], status: 'Active' } as OrgNode
    const leaf = { id: 'leaf', managerId: 'mid', name: 'Leaf', role: '', discipline: '', team: '', additionalTeams: [], status: 'Active' } as OrgNode
    const clicks = mountChartDom(['ceo', 'mid', 'leaf'])

    renderHook(() =>
      useVimNav({
        working: [ceo, mid, leaf],
        pods: [],
        selectedId: 'mid',
        move: vi.fn(),
        reparent: vi.fn(),
        enabled: true,
      }),
    )

    fireEvent.keyDown(document, { key: 'G' })

    expect(clicks.get('leaf')).toHaveBeenCalledTimes(1)
  })

  it('[VIM-008] G with no selection jumps to deepest leaf from root', () => {
    const ceo = { id: 'ceo', managerId: '', name: 'CEO', role: '', discipline: '', team: '', additionalTeams: [], status: 'Active' } as OrgNode
    const ic = { id: 'ic1', managerId: 'ceo', name: 'IC', role: '', discipline: '', team: '', additionalTeams: [], status: 'Active' } as OrgNode
    const clicks = mountChartDom(['ceo', 'ic1'])

    renderHook(() =>
      useVimNav({
        working: [ceo, ic],
        pods: [],
        selectedId: null,
        move: vi.fn(),
        reparent: vi.fn(),
        enabled: true,
      }),
    )

    fireEvent.keyDown(document, { key: 'G' })

    expect(clicks.get('ic1')).toHaveBeenCalledTimes(1)
  })

  it('[VIM-008] gp jumps to the manager of the selected person', () => {
    const ceo = { id: 'ceo', managerId: '', name: 'CEO', role: '', discipline: '', team: '', additionalTeams: [], status: 'Active' } as OrgNode
    const ic = { id: 'ic1', managerId: 'ceo', name: 'IC', role: '', discipline: '', team: '', additionalTeams: [], status: 'Active' } as OrgNode
    const clicks = mountChartDom(['ceo', 'ic1'])

    renderHook(() =>
      useVimNav({
        working: [ceo, ic],
        pods: [],
        selectedId: 'ic1',
        move: vi.fn(),
        reparent: vi.fn(),
        enabled: true,
      }),
    )

    fireEvent.keyDown(document, { key: 'g' })
    fireEvent.keyDown(document, { key: 'p' })

    expect(clicks.get('ceo')).toHaveBeenCalledTimes(1)
  })

  it('[VIM-008] gp on a pod collapseKey jumps to the pod manager', () => {
    const ceo = { id: 'ceo', managerId: '', name: 'CEO', role: '', discipline: '', team: '', additionalTeams: [], status: 'Active' } as OrgNode
    const clicks = mountChartDom(['ceo', 'pod:ceo:Alpha'])

    renderHook(() =>
      useVimNav({
        working: [ceo],
        pods: [],
        selectedId: 'pod:ceo:Alpha',
        move: vi.fn(),
        reparent: vi.fn(),
        enabled: true,
      }),
    )

    fireEvent.keyDown(document, { key: 'g' })
    fireEvent.keyDown(document, { key: 'p' })

    expect(clicks.get('ceo')).toHaveBeenCalledTimes(1)
  })

  it('[VIM-008] g followed by an unrelated key cancels the prefix and key falls through', () => {
    // pressing g then j should NOT do anything for gg/gp; j should fire spatial nav.
    // We assert that no jump-to-root/leaf click happens.
    const ceo = { id: 'ceo', managerId: '', name: 'CEO', role: '', discipline: '', team: '', additionalTeams: [], status: 'Active' } as OrgNode
    const ic = { id: 'ic1', managerId: 'ceo', name: 'IC', role: '', discipline: '', team: '', additionalTeams: [], status: 'Active' } as OrgNode
    const clicks = mountChartDom(['ceo', 'ic1'])

    renderHook(() =>
      useVimNav({
        working: [ceo, ic],
        pods: [],
        selectedId: 'ic1',
        move: vi.fn(),
        reparent: vi.fn(),
        enabled: true,
      }),
    )

    fireEvent.keyDown(document, { key: 'g' })
    fireEvent.keyDown(document, { key: 'x' })  // 'x' is cut, not a g-pair

    // No jump-to-root happened.
    expect(clicks.get('ceo')).not.toHaveBeenCalled()
  })
})
