/**
 * Additional branch coverage for useDeepLink.
 * Covers: invalid view param, write-back with head, write-back with selected,
 * no URL params (settled immediately path), multiple params.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook } from '@testing-library/react'
import { useDeepLink } from './useDeepLink'

describe('useDeepLink — additional branches', () => {
  beforeEach(() => {
    window.history.replaceState({}, '', '/')
  })

  it('ignores invalid view param in URL', () => {
    window.history.replaceState({}, '', '/?view=invalid')
    const setViewMode = vi.fn()

    renderHook(() => useDeepLink({
      viewMode: 'detail',
      selectedId: null,
      headPersonId: null,
      setViewMode,
      setSelectedId: vi.fn(),
      setHead: vi.fn(),
    }))

    expect(setViewMode).not.toHaveBeenCalled()
  })

  it('reads table view from URL', () => {
    window.history.replaceState({}, '', '/?view=table')
    const setViewMode = vi.fn()

    renderHook(() => useDeepLink({
      viewMode: 'detail',
      selectedId: null,
      headPersonId: null,
      setViewMode,
      setSelectedId: vi.fn(),
      setHead: vi.fn(),
    }))

    expect(setViewMode).toHaveBeenCalledWith('table')
  })

  it('writes selectedId to URL when not null', () => {
    renderHook(() => useDeepLink({
      viewMode: 'detail',
      selectedId: 'person-abc',
      headPersonId: null,
      setViewMode: vi.fn(),
      setSelectedId: vi.fn(),
      setHead: vi.fn(),
    }))

    const params = new URLSearchParams(window.location.search)
    expect(params.get('selected')).toBe('person-abc')
  })

  it('writes headPersonId to URL when not null', () => {
    renderHook(() => useDeepLink({
      viewMode: 'detail',
      selectedId: null,
      headPersonId: 'head-xyz',
      setViewMode: vi.fn(),
      setSelectedId: vi.fn(),
      setHead: vi.fn(),
    }))

    const params = new URLSearchParams(window.location.search)
    expect(params.get('head')).toBe('head-xyz')
  })

  it('writes multiple params to URL', () => {
    renderHook(() => useDeepLink({
      viewMode: 'manager',
      selectedId: 'sel-1',
      headPersonId: 'head-1',
      setViewMode: vi.fn(),
      setSelectedId: vi.fn(),
      setHead: vi.fn(),
    }))

    const params = new URLSearchParams(window.location.search)
    expect(params.get('view')).toBe('manager')
    expect(params.get('selected')).toBe('sel-1')
    expect(params.get('head')).toBe('head-1')
  })

  it('reads all three params from URL simultaneously', () => {
    window.history.replaceState({}, '', '/?view=table&selected=sel-1&head=head-1')
    const setViewMode = vi.fn()
    const setSelectedId = vi.fn()
    const setHead = vi.fn()

    renderHook(() => useDeepLink({
      viewMode: 'detail',
      selectedId: null,
      headPersonId: null,
      setViewMode,
      setSelectedId,
      setHead,
    }))

    expect(setViewMode).toHaveBeenCalledWith('table')
    expect(setSelectedId).toHaveBeenCalledWith('sel-1')
    expect(setHead).toHaveBeenCalledWith('head-1')
  })
})
