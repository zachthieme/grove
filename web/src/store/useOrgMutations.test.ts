import { describe, it, expect, vi, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useRef } from 'react'
import { useOrgMutations } from './useOrgMutations'
import type { OrgDataState } from './OrgDataContext'
import type { OrgNode, Pod } from '../api/types'
import * as api from '../api/client'

const node = (id: string, fields: Partial<OrgNode> = {}): OrgNode => ({
  id, name: id, role: '', discipline: '', status: 'Active',
  managerId: '', team: '', additionalTeams: [], ...fields,
})

function setupHook(initialWorking: OrgNode[], initialPods: Pod[] = []) {
  let state: OrgDataState = {
    original: [], working: initialWorking, recycled: [], pods: initialPods,
    originalPods: [], settings: { disciplineOrder: [] }, loaded: true,
    pendingMapping: null, snapshots: [], currentSnapshotName: null,
    autosaveAvailable: null,
  }
  const setState = vi.fn((updater: any) => {
    state = typeof updater === 'function' ? updater(state) : { ...state, ...updater }
  })
  const handleError = vi.fn()
  const setError = vi.fn()
  const captureForUndo = vi.fn()
  const { result } = renderHook(() => {
    const workingRef = useRef(state.working)
    workingRef.current = state.working
    const podsRef = useRef(state.pods)
    podsRef.current = state.pods
    return useOrgMutations({ setState, workingRef, podsRef, handleError, setError, captureForUndo })
  })
  return { result, getState: () => state, setState, handleError }
}

describe('useOrgMutations optimistic update', () => {
  afterEach(() => vi.restoreAllMocks())

  it('applies optimistic patch immediately for update, then reconciles with server', async () => {
    const initial = [node('a', { name: 'Alice' }), node('b', { name: 'Bob' })]
    const serverWorking = [node('a', { name: 'Alicia' }), node('b', { name: 'Bob' })]
    const apiSpy = vi.spyOn(api, 'updateNode').mockResolvedValue({
      working: serverWorking, pods: [], recycled: [],
    } as any)

    const { result, getState } = setupHook(initial)

    let promise: Promise<void> | undefined
    act(() => { promise = result.current.update('a', { name: 'Alicia' }) })

    // Optimistic patch applied synchronously
    expect(getState().working[0].name).toBe('Alicia')

    await act(async () => { await promise })
    expect(apiSpy).toHaveBeenCalled()
    expect(getState().working).toEqual(serverWorking)
  })

  it('reverts working+pods to pre-mutation snapshot on server failure', async () => {
    const initial = [node('a', { name: 'Alice' })]
    const initialPods: Pod[] = [{ id: 'p1', name: 'Pod1', team: 'T', managerId: 'm', publicNote: '' } as any]
    vi.spyOn(api, 'updateNode').mockRejectedValue(new Error('bad request'))
    const { result, getState, handleError } = setupHook(initial, initialPods)

    await act(async () => { await result.current.update('a', { name: 'Alicia' }) })

    expect(getState().working[0].name).toBe('Alice')   // reverted
    expect(getState().pods).toEqual(initialPods)        // reverted
    expect(handleError).toHaveBeenCalled()
  })

  it('move applies optimistic managerId/team change immediately', async () => {
    const initial = [node('a', { managerId: 'm1', team: 'T1' })]
    vi.spyOn(api, 'moveNode').mockResolvedValue({
      working: [node('a', { managerId: 'm2', team: 'T2' })], pods: [], recycled: [],
    } as any)
    const { result, getState } = setupHook(initial)
    let p: Promise<void> | undefined
    act(() => { p = result.current.move('a', 'm2', 'T2') })
    expect(getState().working[0].managerId).toBe('m2')
    expect(getState().working[0].team).toBe('T2')
    await act(async () => { await p })
  })

  it('reorder applies optimistic sortIndex change immediately', async () => {
    const initial = [node('a', { sortIndex: 99 }), node('b', { sortIndex: 99 }), node('c', { sortIndex: 99 })]
    vi.spyOn(api, 'reorderPeople').mockResolvedValue({
      working: [node('a', { sortIndex: 1 }), node('b', { sortIndex: 99 }), node('c', { sortIndex: 0 })],
      pods: [], recycled: [],
    } as any)
    const { result, getState } = setupHook(initial)
    let p: Promise<void> | undefined
    act(() => { p = result.current.reorder(['c', 'a']) })
    // Optimistic: 'c' got 0, 'a' got 1, 'b' untouched (still 99)
    expect(getState().working.find((n) => n.id === 'c')!.sortIndex).toBe(0)
    expect(getState().working.find((n) => n.id === 'a')!.sortIndex).toBe(1)
    expect(getState().working.find((n) => n.id === 'b')!.sortIndex).toBe(99)
    await act(async () => { await p })
  })
})
