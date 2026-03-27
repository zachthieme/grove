import { describe, it, expect, beforeEach, vi } from 'vitest'
import { renderHook } from '@testing-library/react'
import { useDeepLink } from './useDeepLink'

describe('useDeepLink', () => {
  beforeEach(() => {
    window.history.replaceState({}, '', '/')
  })

  it('reads viewMode from URL on mount', () => {
    window.history.replaceState({}, '', '/?view=manager')
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

    expect(setViewMode).toHaveBeenCalledWith('manager')
  })

  it('writes viewMode to URL when it changes', () => {
    renderHook(() => useDeepLink({
      viewMode: 'manager',
      selectedId: null,
      headPersonId: null,
      setViewMode: vi.fn(),
      setSelectedId: vi.fn(),
      setHead: vi.fn(),
    }))

    const params = new URLSearchParams(window.location.search)
    expect(params.get('view')).toBe('manager')
  })

  it('omits default values from URL', () => {
    renderHook(() => useDeepLink({
      viewMode: 'detail',
      selectedId: null,
      headPersonId: null,
      setViewMode: vi.fn(),
      setSelectedId: vi.fn(),
      setHead: vi.fn(),
    }))

    expect(window.location.search).toBe('')
  })

  it('reads selectedId from URL', () => {
    window.history.replaceState({}, '', '/?selected=abc-123')
    const setSelectedId = vi.fn()

    renderHook(() => useDeepLink({
      viewMode: 'detail',
      selectedId: null,
      headPersonId: null,
      setViewMode: vi.fn(),
      setSelectedId,
      setHead: vi.fn(),
    }))

    expect(setSelectedId).toHaveBeenCalledWith('abc-123')
  })

  it('reads headPersonId from URL', () => {
    window.history.replaceState({}, '', '/?head=xyz-456')
    const setHead = vi.fn()

    renderHook(() => useDeepLink({
      viewMode: 'detail',
      selectedId: null,
      headPersonId: null,
      setViewMode: vi.fn(),
      setSelectedId: vi.fn(),
      setHead,
    }))

    expect(setHead).toHaveBeenCalledWith('xyz-456')
  })
})
