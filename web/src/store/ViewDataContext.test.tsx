import { describe, it, expect, vi, afterEach } from 'vitest'
import { renderHook, act, cleanup } from '@testing-library/react'
import type { ReactNode } from 'react'
import { OrgOverrideProvider } from './OrgContext'
import { ViewDataProvider, usePeople, useChanges, useActions } from './ViewDataContext'
import { makeOrgContext, makeNode } from '../test-helpers'

afterEach(() => cleanup())

function wrapper(overrides = {}) {
  const ctx = makeOrgContext(overrides)
  return ({ children }: { children: ReactNode }) => (
    <OrgOverrideProvider value={ctx}>
      <ViewDataProvider>{children}</ViewDataProvider>
    </OrgOverrideProvider>
  )
}

describe('ViewDataContext', () => {
  describe('usePeople', () => {
    it('throws when used outside ViewDataProvider', () => {
      const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
      expect(() => renderHook(() => usePeople())).toThrow('must be used within a ViewDataProvider')
      spy.mockRestore()
    })

    it('returns people from working by default', () => {
      const alice = makeNode({ id: 'a', name: 'Alice' })
      const { result } = renderHook(() => usePeople(), {
        wrapper: wrapper({ working: [alice], original: [] }),
      })
      expect(result.current.people).toHaveLength(1)
      expect(result.current.people[0].name).toBe('Alice')
    })

    it('returns original people when dataView is original', () => {
      const alice = makeNode({ id: 'a', name: 'Alice' })
      const bob = makeNode({ id: 'b', name: 'Bob' })
      const { result } = renderHook(() => usePeople(), {
        wrapper: wrapper({ working: [alice], original: [bob], dataView: 'original' }),
      })
      expect(result.current.people[0].name).toBe('Bob')
    })

    it('sets readOnly to true when dataView is original', () => {
      const { result } = renderHook(() => usePeople(), {
        wrapper: wrapper({ dataView: 'original' }),
      })
      expect(result.current.readOnly).toBe(true)
    })

    it('sets readOnly to false when dataView is working', () => {
      const { result } = renderHook(() => usePeople(), {
        wrapper: wrapper({ dataView: 'working' }),
      })
      expect(result.current.readOnly).toBe(false)
    })

    it('sets showChanges true when dataView is diff', () => {
      const { result } = renderHook(() => usePeople(), {
        wrapper: wrapper({ dataView: 'diff' }),
      })
      expect(result.current.showChanges).toBe(true)
    })

    it('sets showChanges false when dataView is working', () => {
      const { result } = renderHook(() => usePeople(), {
        wrapper: wrapper({ dataView: 'working' }),
      })
      expect(result.current.showChanges).toBe(false)
    })

    it('computes managerSet from working data', () => {
      const mgr = makeNode({ id: 'mgr', name: 'Manager' })
      const ic = makeNode({ id: 'ic', name: 'IC', managerId: 'mgr' })
      const { result } = renderHook(() => usePeople(), {
        wrapper: wrapper({ working: [mgr, ic], original: [mgr, ic] }),
      })
      expect(result.current.managerSet.has('mgr')).toBe(true)
      expect(result.current.managerSet.has('ic')).toBe(false)
    })
  })

  describe('useChanges', () => {
    it('throws when used outside ViewDataProvider', () => {
      const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
      expect(() => renderHook(() => useChanges())).toThrow('must be used within a ViewDataProvider')
      spy.mockRestore()
    })

    it('returns changes when showChanges is true (diff view)', () => {
      const alice = makeNode({ id: 'a', name: 'Alice' })
      const aliceChanged = makeNode({ id: 'a', name: 'Alice', role: 'Manager' })
      const { result } = renderHook(() => useChanges(), {
        wrapper: wrapper({ working: [aliceChanged], original: [alice], dataView: 'diff' }),
      })
      expect(result.current.changes).toBeDefined()
      expect(result.current.changes?.has('a')).toBe(true)
    })

    it('returns undefined changes when showChanges is false', () => {
      const alice = makeNode({ id: 'a', name: 'Alice' })
      const aliceChanged = makeNode({ id: 'a', name: 'Alice', role: 'Manager' })
      const { result } = renderHook(() => useChanges(), {
        wrapper: wrapper({ working: [aliceChanged], original: [alice], dataView: 'working' }),
      })
      expect(result.current.changes).toBeUndefined()
    })
  })

  describe('useActions', () => {
    it('throws when used outside ViewDataProvider', () => {
      const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
      expect(() => renderHook(() => useActions())).toThrow('must be used within a ViewDataProvider')
      spy.mockRestore()
    })

    it('handleSelect calls toggleSelect with multi flag for shift key', () => {
      const toggleSelect = vi.fn()
      const { result } = renderHook(() => useActions(), {
        wrapper: wrapper({ toggleSelect }),
      })
      const event = { shiftKey: true, metaKey: false, ctrlKey: false } as React.MouseEvent
      act(() => { result.current.handleSelect('a', event) })
      expect(toggleSelect).toHaveBeenCalledWith('a', true)
    })

    it('handleSelect calls toggleSelect without multi when no modifier', () => {
      const toggleSelect = vi.fn()
      const { result } = renderHook(() => useActions(), {
        wrapper: wrapper({ toggleSelect }),
      })
      act(() => { result.current.handleSelect('a') })
      expect(toggleSelect).toHaveBeenCalledWith('a', false)
    })

    it('handleSelect passes multi for metaKey', () => {
      const toggleSelect = vi.fn()
      const { result } = renderHook(() => useActions(), {
        wrapper: wrapper({ toggleSelect }),
      })
      const event = { shiftKey: false, metaKey: true, ctrlKey: false } as React.MouseEvent
      act(() => { result.current.handleSelect('b', event) })
      expect(toggleSelect).toHaveBeenCalledWith('b', true)
    })

    it('handleSelect passes multi for ctrlKey', () => {
      const toggleSelect = vi.fn()
      const { result } = renderHook(() => useActions(), {
        wrapper: wrapper({ toggleSelect }),
      })
      const event = { shiftKey: false, metaKey: false, ctrlKey: true } as React.MouseEvent
      act(() => { result.current.handleSelect('c', event) })
      expect(toggleSelect).toHaveBeenCalledWith('c', true)
    })

    it('handleAddReport adds a person under the given parent', async () => {
      const add = vi.fn().mockResolvedValue(undefined)
      const parent = makeNode({ id: 'mgr', name: 'Manager', team: 'Eng' })
      const { result } = renderHook(() => useActions(), {
        wrapper: wrapper({ working: [parent], add }),
      })
      await act(async () => { await result.current.handleAddReport('mgr') })
      expect(add).toHaveBeenCalledWith(expect.objectContaining({
        name: 'New Person',
        team: 'Eng',
        managerId: 'mgr',
      }))
    })

    // Scenarios: CREATE-005
    it('[CREATE-005] handleAddReport works on leaf/IC node (promotes IC to manager)', async () => {
      const add = vi.fn().mockResolvedValue(undefined)
      // ic has a managerId — it's a leaf node (IC), not a manager
      const ic = makeNode({ id: 'ic-1', name: 'IC Person', team: 'Design', managerId: 'some-parent' })
      const { result } = renderHook(() => useActions(), {
        wrapper: wrapper({ working: [ic], add }),
      })
      await act(async () => { await result.current.handleAddReport('ic-1') })
      expect(add).toHaveBeenCalledWith(expect.objectContaining({
        name: 'New Person',
        team: 'Design',
        managerId: 'ic-1',
        status: 'Active',
      }))
    })

    it('handleAddReport is a no-op when parent not found', async () => {
      const add = vi.fn().mockResolvedValue(undefined)
      const { result } = renderHook(() => useActions(), {
        wrapper: wrapper({ working: [], add }),
      })
      await act(async () => { await result.current.handleAddReport('missing') })
      expect(add).not.toHaveBeenCalled()
    })

    it('handleAddToTeam adds a person to a specific team', async () => {
      const add = vi.fn().mockResolvedValue(undefined)
      const { result } = renderHook(() => useActions(), {
        wrapper: wrapper({ add }),
      })
      await act(async () => { await result.current.handleAddToTeam('mgr', 'Platform', 'Pod1') })
      expect(add).toHaveBeenCalledWith(expect.objectContaining({
        name: 'New Person',
        team: 'Platform',
        managerId: 'mgr',
        pod: 'Pod1',
      }))
    })

    it('handleDeletePerson sets deleteTargetId without calling remove', async () => {
      const remove = vi.fn().mockResolvedValue(undefined)
      const { result } = renderHook(() => useActions(), {
        wrapper: wrapper({ remove }),
      })
      act(() => { result.current.handleDeletePerson('p1') })
      expect(result.current.deleteTargetId).toBe('p1')
      expect(remove).not.toHaveBeenCalled()
    })

    it('confirmDelete calls remove and clears deleteTargetId', async () => {
      const remove = vi.fn().mockResolvedValue(undefined)
      const { result } = renderHook(() => useActions(), {
        wrapper: wrapper({ remove }),
      })
      act(() => { result.current.handleDeletePerson('p1') })
      await act(async () => { result.current.confirmDelete() })
      expect(remove).toHaveBeenCalledWith('p1')
      expect(result.current.deleteTargetId).toBeNull()
    })

    it('cancelDelete clears deleteTargetId without calling remove', () => {
      const remove = vi.fn().mockResolvedValue(undefined)
      const { result } = renderHook(() => useActions(), {
        wrapper: wrapper({ remove }),
      })
      act(() => { result.current.handleDeletePerson('p1') })
      act(() => { result.current.cancelDelete() })
      expect(remove).not.toHaveBeenCalled()
      expect(result.current.deleteTargetId).toBeNull()
    })

    it('handleShowInfo sets the info popover id', () => {
      const { result } = renderHook(() => useActions(), {
        wrapper: wrapper(),
      })
      expect(result.current.infoPopoverId).toBeNull()
      act(() => { result.current.handleShowInfo('p1') })
      expect(result.current.infoPopoverId).toBe('p1')
    })

    it('clearInfoPopover clears the info popover id', () => {
      const { result } = renderHook(() => useActions(), {
        wrapper: wrapper(),
      })
      act(() => { result.current.handleShowInfo('p1') })
      expect(result.current.infoPopoverId).toBe('p1')
      act(() => { result.current.clearInfoPopover() })
      expect(result.current.infoPopoverId).toBeNull()
    })

    it('handleFocus calls setHead', () => {
      const setHead = vi.fn()
      const { result } = renderHook(() => useActions(), {
        wrapper: wrapper({ setHead }),
      })
      act(() => { result.current.handleFocus('p1') })
      expect(setHead).toHaveBeenCalledWith('p1')
    })
  })

  describe('head person clearing', () => {
    it('clears head when head person is private and showPrivate is false', () => {
      const setHead = vi.fn()
      const privatePerson = makeNode({ id: 'priv', name: 'Private', private: true })
      renderHook(() => usePeople(), {
        wrapper: wrapper({
          working: [privatePerson],
          original: [privatePerson],
          headPersonId: 'priv',
          showPrivate: false,
          setHead,
        }),
      })
      expect(setHead).toHaveBeenCalledWith(null)
    })

    it('does not clear head when showPrivate is true', () => {
      const setHead = vi.fn()
      const privatePerson = makeNode({ id: 'priv', name: 'Private', private: true })
      renderHook(() => usePeople(), {
        wrapper: wrapper({
          working: [privatePerson],
          original: [privatePerson],
          headPersonId: 'priv',
          showPrivate: true,
          setHead,
        }),
      })
      expect(setHead).not.toHaveBeenCalledWith(null)
    })

    it('does not clear head when head person is not private', () => {
      const setHead = vi.fn()
      const person = makeNode({ id: 'pub', name: 'Public' })
      renderHook(() => usePeople(), {
        wrapper: wrapper({
          working: [person],
          original: [person],
          headPersonId: 'pub',
          showPrivate: false,
          setHead,
        }),
      })
      expect(setHead).not.toHaveBeenCalledWith(null)
    })

    it('does not clear head when headPersonId is null', () => {
      const setHead = vi.fn()
      renderHook(() => usePeople(), {
        wrapper: wrapper({
          working: [],
          original: [],
          headPersonId: null,
          showPrivate: false,
          setHead,
        }),
      })
      expect(setHead).not.toHaveBeenCalledWith(null)
    })
  })
})
