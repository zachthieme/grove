/**
 * Additional branch coverage for useDeepLink.
 * Covers: invalid view param, write-back with head, write-back with selected,
 * no URL params (settled immediately path), multiple params.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook } from '@testing-library/react'
import { useDeepLink } from './useDeepLink'

const mockSetViewMode = vi.fn()
const mockSetSelectedId = vi.fn()
const mockSetHead = vi.fn()

vi.mock('../store/OrgContext', () => ({
  useUI: vi.fn(() => ({
    viewMode: 'detail',
    headPersonId: null,
    setViewMode: mockSetViewMode,
    setHead: mockSetHead,
  })),
  useSelection: vi.fn(() => ({
    selectedId: null,
    setSelectedId: mockSetSelectedId,
  })),
}))

import { useUI, useSelection } from '../store/OrgContext'

const mockedUseUI = vi.mocked(useUI)
const mockedUseSelection = vi.mocked(useSelection)

describe('useDeepLink — additional branches', () => {
  beforeEach(() => {
    window.history.replaceState({}, '', '/')
    mockSetViewMode.mockClear()
    mockSetSelectedId.mockClear()
    mockSetHead.mockClear()
    mockedUseUI.mockReturnValue({
      viewMode: 'detail',
      headPersonId: null,
      setViewMode: mockSetViewMode,
      setHead: mockSetHead,
    } as unknown as ReturnType<typeof useUI>)
    mockedUseSelection.mockReturnValue({
      selectedId: null,
      setSelectedId: mockSetSelectedId,
    } as unknown as ReturnType<typeof useSelection>)
  })

  it('ignores invalid view param in URL', () => {
    window.history.replaceState({}, '', '/?view=invalid')
    renderHook(() => useDeepLink())
    expect(mockSetViewMode).not.toHaveBeenCalled()
  })

  it('reads table view from URL', () => {
    window.history.replaceState({}, '', '/?view=table')
    renderHook(() => useDeepLink())
    expect(mockSetViewMode).toHaveBeenCalledWith('table')
  })

  it('writes selectedId to URL when not null', () => {
    mockedUseSelection.mockReturnValue({
      selectedId: 'person-abc',
      setSelectedId: mockSetSelectedId,
    } as unknown as ReturnType<typeof useSelection>)

    renderHook(() => useDeepLink())
    const params = new URLSearchParams(window.location.search)
    expect(params.get('selected')).toBe('person-abc')
  })

  it('writes headPersonId to URL when not null', () => {
    mockedUseUI.mockReturnValue({
      viewMode: 'detail',
      headPersonId: 'head-xyz',
      setViewMode: mockSetViewMode,
      setHead: mockSetHead,
    } as unknown as ReturnType<typeof useUI>)

    renderHook(() => useDeepLink())
    const params = new URLSearchParams(window.location.search)
    expect(params.get('head')).toBe('head-xyz')
  })

  it('writes multiple params to URL', () => {
    mockedUseUI.mockReturnValue({
      viewMode: 'manager',
      headPersonId: 'head-1',
      setViewMode: mockSetViewMode,
      setHead: mockSetHead,
    } as unknown as ReturnType<typeof useUI>)
    mockedUseSelection.mockReturnValue({
      selectedId: 'sel-1',
      setSelectedId: mockSetSelectedId,
    } as unknown as ReturnType<typeof useSelection>)

    renderHook(() => useDeepLink())
    const params = new URLSearchParams(window.location.search)
    expect(params.get('view')).toBe('manager')
    expect(params.get('selected')).toBe('sel-1')
    expect(params.get('head')).toBe('head-1')
  })

  it('reads all three params from URL simultaneously', () => {
    window.history.replaceState({}, '', '/?view=table&selected=sel-1&head=head-1')
    renderHook(() => useDeepLink())
    expect(mockSetViewMode).toHaveBeenCalledWith('table')
    expect(mockSetSelectedId).toHaveBeenCalledWith('sel-1')
    expect(mockSetHead).toHaveBeenCalledWith('head-1')
  })
})
