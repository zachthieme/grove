import { describe, it, expect, beforeEach, vi } from 'vitest'
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

// Scenarios: UI-011
describe('useDeepLink', () => {
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

  it('[SELECT-005] reads viewMode from URL on mount', () => {
    window.history.replaceState({}, '', '/?view=manager')
    renderHook(() => useDeepLink())
    expect(mockSetViewMode).toHaveBeenCalledWith('manager')
  })

  it('[SELECT-005] writes viewMode to URL when it changes', () => {
    mockedUseUI.mockReturnValue({
      viewMode: 'manager',
      headPersonId: null,
      setViewMode: mockSetViewMode,
      setHead: mockSetHead,
    } as unknown as ReturnType<typeof useUI>)

    renderHook(() => useDeepLink())

    const params = new URLSearchParams(window.location.search)
    expect(params.get('view')).toBe('manager')
  })

  it('[SELECT-005] omits default values from URL', () => {
    renderHook(() => useDeepLink())
    expect(window.location.search).toBe('')
  })

  it('[SELECT-005] reads selectedId from URL', () => {
    window.history.replaceState({}, '', '/?selected=abc-123')
    renderHook(() => useDeepLink())
    expect(mockSetSelectedId).toHaveBeenCalledWith('abc-123')
  })

  it('[SELECT-005] reads headPersonId from URL', () => {
    window.history.replaceState({}, '', '/?head=xyz-456')
    renderHook(() => useDeepLink())
    expect(mockSetHead).toHaveBeenCalledWith('xyz-456')
  })
})
