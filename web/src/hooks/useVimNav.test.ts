import { describe, it, expect, vi, afterEach } from 'vitest'
import { renderHook, cleanup, act } from '@testing-library/react'
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

describe('useVimNav v visual mode', () => {
  afterEach(() => {
    cleanup()
    document.body.innerHTML = ''
  })

  it('[VIM-013] v on a selected person enters visual mode', () => {
    const ic = makePerson({ id: 'ic1' })
    const { result } = renderHook(() =>
      useVimNav({
        working: [ic],
        pods: [],
        selectedId: 'ic1',
        move: vi.fn(),
        reparent: vi.fn(),
        enabled: true,
      }),
    )

    fireEvent.keyDown(document, { key: 'v' })

    expect(result.current.visualMode).toBe(true)
  })

  it('[VIM-013] v with no selection is a no-op', () => {
    const { result } = renderHook(() =>
      useVimNav({
        working: [],
        pods: [],
        selectedId: null,
        move: vi.fn(),
        reparent: vi.fn(),
        enabled: true,
      }),
    )

    fireEvent.keyDown(document, { key: 'v' })

    expect(result.current.visualMode).toBe(false)
  })

  it('[VIM-013] v on a synthetic group key (pod:/team:) is a no-op', () => {
    const ic = makePerson({ id: 'ic1' })
    const { result } = renderHook(() =>
      useVimNav({
        working: [ic],
        pods: [],
        selectedId: 'pod:ic1:Alpha',
        move: vi.fn(),
        reparent: vi.fn(),
        enabled: true,
      }),
    )

    fireEvent.keyDown(document, { key: 'v' })

    expect(result.current.visualMode).toBe(false)
  })

  it('[VIM-013] v while in visual mode toggles back to normal', () => {
    const ic = makePerson({ id: 'ic1' })
    const { result } = renderHook(() =>
      useVimNav({
        working: [ic],
        pods: [],
        selectedId: 'ic1',
        move: vi.fn(),
        reparent: vi.fn(),
        enabled: true,
      }),
    )

    fireEvent.keyDown(document, { key: 'v' })
    expect(result.current.visualMode).toBe(true)
    fireEvent.keyDown(document, { key: 'v' })
    expect(result.current.visualMode).toBe(false)
  })

  it('[VIM-013] exitVisual clears visual mode', () => {
    const ic = makePerson({ id: 'ic1' })
    const { result } = renderHook(() =>
      useVimNav({
        working: [ic],
        pods: [],
        selectedId: 'ic1',
        move: vi.fn(),
        reparent: vi.fn(),
        enabled: true,
      }),
    )

    fireEvent.keyDown(document, { key: 'v' })
    expect(result.current.visualMode).toBe(true)

    act(() => result.current.exitVisual())

    expect(result.current.visualMode).toBe(false)
  })

  it('[VIM-013] motion in visual mode adds the neighbor to selectedIds via batchSelect', () => {
    // Set up a 2-node DOM with mocked rects so findSpatialNeighbor sees a
    // valid 'l' (right) neighbor: ic1 at (0,0), ic2 at (200,0).
    function makeRect(x: number, y: number, w = 100, h = 40): DOMRect {
      return { x, y, width: w, height: h, top: y, left: x, right: x + w, bottom: y + h, toJSON: () => ({}) } as DOMRect
    }
    const wrapper1 = document.createElement('div')
    wrapper1.setAttribute('data-person-id', 'ic1')
    wrapper1.getBoundingClientRect = () => makeRect(0, 0)
    const btn1 = document.createElement('button')
    btn1.setAttribute('role', 'button')
    wrapper1.appendChild(btn1)
    document.body.appendChild(wrapper1)

    const wrapper2 = document.createElement('div')
    wrapper2.setAttribute('data-person-id', 'ic2')
    wrapper2.getBoundingClientRect = () => makeRect(200, 0)
    const btn2 = document.createElement('button')
    btn2.setAttribute('role', 'button')
    const click2 = vi.fn()
    btn2.addEventListener('click', click2)
    wrapper2.appendChild(btn2)
    document.body.appendChild(wrapper2)

    const ic1 = makePerson({ id: 'ic1' })
    const ic2 = makePerson({ id: 'ic2' })
    const batchSelect = vi.fn()
    renderHook(() =>
      useVimNav({
        working: [ic1, ic2],
        pods: [],
        selectedId: 'ic1',
        selectedIds: new Set(['ic1']),
        batchSelect,
        move: vi.fn(),
        reparent: vi.fn(),
        enabled: true,
      }),
    )

    fireEvent.keyDown(document, { key: 'v' })       // enter visual
    fireEvent.keyDown(document, { key: 'l' })       // motion right → ic2

    expect(batchSelect).toHaveBeenCalled()
    const lastCallArg = batchSelect.mock.calls[batchSelect.mock.calls.length - 1][0]
    expect(lastCallArg).toBeInstanceOf(Set)
    expect(lastCallArg.has('ic1')).toBe(true)
    expect(lastCallArg.has('ic2')).toBe(true)
    // The neighbor's role=button click is NOT fired in visual mode (would
    // replace selection) — only batchSelect runs.
    expect(click2).not.toHaveBeenCalled()
  })
})

describe('useVimNav y yank + p paste-as-copy', () => {
  afterEach(() => cleanup())

  it('[VIM-012] y on a person stores selection in yankedIds', () => {
    const ic = makePerson({ id: 'ic1' })
    const { result } = renderHook(() =>
      useVimNav({
        working: [ic],
        pods: [],
        selectedId: 'ic1',
        copy: vi.fn(),
        move: vi.fn(),
        reparent: vi.fn(),
        enabled: true,
      }),
    )

    fireEvent.keyDown(document, { key: 'y' })

    expect(result.current.yankedIds).toEqual(['ic1'])
  })

  it('[VIM-012] yanking clears any prior cut (mutex)', () => {
    const ic = makePerson({ id: 'ic1' })
    const { result } = renderHook(() =>
      useVimNav({
        working: [ic],
        pods: [],
        selectedId: 'ic1',
        copy: vi.fn(),
        move: vi.fn(),
        reparent: vi.fn(),
        enabled: true,
      }),
    )

    fireEvent.keyDown(document, { key: 'x' })
    expect(result.current.cutIds).toEqual(['ic1'])

    fireEvent.keyDown(document, { key: 'y' })
    expect(result.current.yankedIds).toEqual(['ic1'])
    expect(result.current.cutIds).toEqual([])
  })

  it('[VIM-012] cutting clears any prior yank (mutex)', () => {
    const ic = makePerson({ id: 'ic1' })
    const { result } = renderHook(() =>
      useVimNav({
        working: [ic],
        pods: [],
        selectedId: 'ic1',
        copy: vi.fn(),
        move: vi.fn(),
        reparent: vi.fn(),
        enabled: true,
      }),
    )

    fireEvent.keyDown(document, { key: 'y' })
    fireEvent.keyDown(document, { key: 'x' })

    expect(result.current.cutIds).toEqual(['ic1'])
    expect(result.current.yankedIds).toEqual([])
  })

  it('[VIM-012] p pastes as copy when yankedIds present, calling copy(rootIds, targetParentId)', async () => {
    const copy = vi.fn().mockResolvedValue({ ic1: 'new-id' })
    const move = vi.fn()
    const ic = makePerson({ id: 'ic1' })
    const target = makePerson({ id: 'mgr1' })
    const { result } = renderHook(() =>
      useVimNav({
        working: [ic, target],
        pods: [],
        selectedId: 'ic1',
        copy,
        move,
        reparent: vi.fn(),
        enabled: true,
      }),
    )

    // Yank ic1, then move selection to mgr1, then paste.
    fireEvent.keyDown(document, { key: 'y' })

    // Re-render the hook with new selectedId by remounting. Easier: mutate
    // selectedId via rerender-style pattern. Use renderHook's rerender API.
    // Instead, just dispatch p with a different selectedId via a fresh hook.
    // Yanked state is local — gone on remount. So we use the existing
    // result and the same selectedId. The target is the *paste target*,
    // not where you're standing — so for this test we paste while still
    // selected on ic1; targetParentId resolves to ic1 itself.
    fireEvent.keyDown(document, { key: 'p' })

    expect(copy).toHaveBeenCalledTimes(1)
    expect(copy).toHaveBeenCalledWith(['ic1'], 'ic1')
    expect(move).not.toHaveBeenCalled()
    // After paste, yankedIds is cleared.
    expect(result.current.yankedIds).toEqual([])
  })

  it('[VIM-012] p pastes as copy with target resolved from a pod collapseKey', () => {
    const copy = vi.fn()
    const ic = makePerson({ id: 'ic1' })
    const mgr = makePerson({ id: 'mgr1' })

    const { rerender } = renderHook(
      ({ selectedId }: { selectedId: string }) =>
        useVimNav({
          working: [ic, mgr],
          pods: [],
          selectedId,
          copy,
          move: vi.fn(),
          reparent: vi.fn(),
          enabled: true,
        }),
      { initialProps: { selectedId: 'ic1' } },
    )

    fireEvent.keyDown(document, { key: 'y' })
    rerender({ selectedId: 'pod:mgr1:Alpha' })
    fireEvent.keyDown(document, { key: 'p' })

    expect(copy).toHaveBeenCalledTimes(1)
    expect(copy).toHaveBeenCalledWith(['ic1'], 'mgr1')
  })

  it('[VIM-012] p prefers yank over cut when both somehow set', () => {
    // Cut/yank are mutex via setters, but a stale state could in theory
    // have both. Verify priority: yanked wins.
    // We can't directly populate both via the public API (mutex enforces),
    // so this test asserts the precedence by yanking last and ensuring
    // copy is called (move would indicate cut path).
    const copy = vi.fn()
    const move = vi.fn()
    const ic = makePerson({ id: 'ic1' })

    renderHook(() =>
      useVimNav({
        working: [ic],
        pods: [],
        selectedId: 'ic1',
        copy,
        move,
        reparent: vi.fn(),
        enabled: true,
      }),
    )

    fireEvent.keyDown(document, { key: 'x' })
    fireEvent.keyDown(document, { key: 'y' })
    fireEvent.keyDown(document, { key: 'p' })

    expect(copy).toHaveBeenCalled()
    expect(move).not.toHaveBeenCalled()
  })

  it('[VIM-012] p with no yank and no cut is a no-op', () => {
    const copy = vi.fn()
    const move = vi.fn()
    const ic = makePerson({ id: 'ic1' })

    renderHook(() =>
      useVimNav({
        working: [ic],
        pods: [],
        selectedId: 'ic1',
        copy,
        move,
        reparent: vi.fn(),
        enabled: true,
      }),
    )

    fireEvent.keyDown(document, { key: 'p' })

    expect(copy).not.toHaveBeenCalled()
    expect(move).not.toHaveBeenCalled()
  })

  it('[VIM-012] cancelYank clears yankedIds', () => {
    const ic = makePerson({ id: 'ic1' })
    const { result } = renderHook(() =>
      useVimNav({
        working: [ic],
        pods: [],
        selectedId: 'ic1',
        copy: vi.fn(),
        move: vi.fn(),
        reparent: vi.fn(),
        enabled: true,
      }),
    )

    fireEvent.keyDown(document, { key: 'y' })
    expect(result.current.yankedIds).toEqual(['ic1'])

    act(() => result.current.cancelYank())

    expect(result.current.yankedIds).toEqual([])
  })
})

describe('useVimNav za toggle fold', () => {
  afterEach(() => {
    cleanup()
    document.body.innerHTML = ''
  })

  function mountChartDomWithToggle(personId: string): ReturnType<typeof vi.fn> {
    const wrapper = document.createElement('div')
    wrapper.setAttribute('data-person-id', personId)
    const card = document.createElement('button')
    card.setAttribute('role', 'button')
    wrapper.appendChild(card)
    const toggle = document.createElement('button')
    toggle.setAttribute('data-collapse-toggle', '')
    const onClick = vi.fn()
    toggle.addEventListener('click', onClick)
    wrapper.appendChild(toggle)
    document.body.appendChild(wrapper)
    return onClick
  }

  it('[VIM-011] za on a manager clicks the collapse toggle on that manager', () => {
    const ceo = makePerson({ id: 'mgr1' })
    const click = mountChartDomWithToggle('mgr1')

    renderHook(() =>
      useVimNav({
        working: [ceo],
        pods: [],
        selectedId: 'mgr1',
        move: vi.fn(),
        reparent: vi.fn(),
        enabled: true,
      }),
    )

    fireEvent.keyDown(document, { key: 'z' })
    fireEvent.keyDown(document, { key: 'a' })

    expect(click).toHaveBeenCalledTimes(1)
  })

  it('[VIM-011] za on a pod collapseKey clicks the pod toggle', () => {
    const ceo = makePerson({ id: 'mgr1' })
    const click = mountChartDomWithToggle('pod:mgr1:Alpha')

    renderHook(() =>
      useVimNav({
        working: [ceo],
        pods: [],
        selectedId: 'pod:mgr1:Alpha',
        move: vi.fn(),
        reparent: vi.fn(),
        enabled: true,
      }),
    )

    fireEvent.keyDown(document, { key: 'z' })
    fireEvent.keyDown(document, { key: 'a' })

    expect(click).toHaveBeenCalledTimes(1)
  })

  it('[VIM-011] z followed by a non-a key cancels the prefix', () => {
    const ceo = makePerson({ id: 'mgr1' })
    const click = mountChartDomWithToggle('mgr1')

    renderHook(() =>
      useVimNav({
        working: [ceo],
        pods: [],
        selectedId: 'mgr1',
        move: vi.fn(),
        reparent: vi.fn(),
        enabled: true,
      }),
    )

    fireEvent.keyDown(document, { key: 'z' })
    fireEvent.keyDown(document, { key: 'q' })

    expect(click).not.toHaveBeenCalled()
  })

  it('[VIM-011] za with no selection is a no-op', () => {
    const click = mountChartDomWithToggle('mgr1')
    renderHook(() =>
      useVimNav({
        working: [],
        pods: [],
        selectedId: null,
        move: vi.fn(),
        reparent: vi.fn(),
        enabled: true,
      }),
    )

    fireEvent.keyDown(document, { key: 'z' })
    fireEvent.keyDown(document, { key: 'a' })

    expect(click).not.toHaveBeenCalled()
  })
})

describe('useVimNav f focus subtree', () => {
  afterEach(() => cleanup())

  it('[VIM-010] f on a selected person sets head to that person', () => {
    const onSetHead = vi.fn()
    const ceo = makePerson({ id: 'p1' })

    renderHook(() =>
      useVimNav({
        working: [ceo],
        pods: [],
        selectedId: 'p1',
        onSetHead,
        move: vi.fn(),
        reparent: vi.fn(),
        enabled: true,
      }),
    )

    fireEvent.keyDown(document, { key: 'f' })

    expect(onSetHead).toHaveBeenCalledTimes(1)
    expect(onSetHead).toHaveBeenCalledWith('p1')
  })

  it('[VIM-010] f with no selection is a no-op', () => {
    const onSetHead = vi.fn()
    renderHook(() =>
      useVimNav({
        working: [],
        pods: [],
        selectedId: null,
        onSetHead,
        move: vi.fn(),
        reparent: vi.fn(),
        enabled: true,
      }),
    )

    fireEvent.keyDown(document, { key: 'f' })

    expect(onSetHead).not.toHaveBeenCalled()
  })

  it('[VIM-010] f on a synthetic group key (pod:/team:) is a no-op', () => {
    const onSetHead = vi.fn()
    const ceo = makePerson({ id: 'p1' })
    renderHook(() =>
      useVimNav({
        working: [ceo],
        pods: [],
        selectedId: 'pod:p1:Alpha',
        onSetHead,
        move: vi.fn(),
        reparent: vi.fn(),
        enabled: true,
      }),
    )

    fireEvent.keyDown(document, { key: 'f' })

    expect(onSetHead).not.toHaveBeenCalled()
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
