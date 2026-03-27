import { describe, it, expect, vi, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useSaveStatus } from './useSaveStatus'

describe('useSaveStatus', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('[UI-002] initial state is idle with no error', () => {
    const { result } = renderHook(() => useSaveStatus())
    expect(result.current.saveStatus).toBe('idle')
    expect(result.current.saveError).toBeNull()
  })

  it('[UI-002] markSaving sets status to saving', () => {
    const { result } = renderHook(() => useSaveStatus())

    act(() => { result.current.markSaving() })

    expect(result.current.saveStatus).toBe('saving')
    expect(result.current.saveError).toBeNull()
  })

  it('[UI-002] markSaved sets status to saved, then auto-resets to idle after 1500ms', () => {
    vi.useFakeTimers()
    const { result } = renderHook(() => useSaveStatus())

    act(() => { result.current.markSaved() })
    expect(result.current.saveStatus).toBe('saved')

    act(() => { vi.advanceTimersByTime(1499) })
    expect(result.current.saveStatus).toBe('saved')

    act(() => { vi.advanceTimersByTime(1) })
    expect(result.current.saveStatus).toBe('idle')
  })

  it('[UI-002] markError sets status to error and stores error message', () => {
    const { result } = renderHook(() => useSaveStatus())

    act(() => { result.current.markError('Network failure') })

    expect(result.current.saveStatus).toBe('error')
    expect(result.current.saveError).toBe('Network failure')
  })

  it('[UI-002] markSaving clears a previous error', () => {
    const { result } = renderHook(() => useSaveStatus())

    act(() => { result.current.markError('Something broke') })
    expect(result.current.saveError).toBe('Something broke')

    act(() => { result.current.markSaving() })
    expect(result.current.saveStatus).toBe('saving')
    expect(result.current.saveError).toBeNull()
  })

  it('[UI-002] reset returns to idle with no error', () => {
    const { result } = renderHook(() => useSaveStatus())

    act(() => { result.current.markError('fail') })
    expect(result.current.saveStatus).toBe('error')

    act(() => { result.current.reset() })
    expect(result.current.saveStatus).toBe('idle')
    expect(result.current.saveError).toBeNull()
  })

  it('[UI-002] markSaved cancels previous timer when called again', () => {
    vi.useFakeTimers()
    const { result } = renderHook(() => useSaveStatus())

    act(() => { result.current.markSaved() })
    act(() => { vi.advanceTimersByTime(1000) })
    expect(result.current.saveStatus).toBe('saved')

    // Call markSaved again, resetting the timer
    act(() => { result.current.markSaved() })
    act(() => { vi.advanceTimersByTime(1000) })
    // Still saved — only 1000ms since second markSaved
    expect(result.current.saveStatus).toBe('saved')

    act(() => { vi.advanceTimersByTime(500) })
    expect(result.current.saveStatus).toBe('idle')
  })

  it('[UI-002] does not auto-reset to idle if status changed before timer fires', () => {
    vi.useFakeTimers()
    const { result } = renderHook(() => useSaveStatus())

    act(() => { result.current.markSaved() })
    expect(result.current.saveStatus).toBe('saved')

    // Change to error before timer fires
    act(() => { result.current.markError('oops') })
    expect(result.current.saveStatus).toBe('error')

    // Timer fires but should not overwrite error
    act(() => { vi.advanceTimersByTime(1500) })
    expect(result.current.saveStatus).toBe('error')
  })

  it('[UI-002] cleans up timer on unmount without warnings', () => {
    vi.useFakeTimers()
    const { result, unmount } = renderHook(() => useSaveStatus())

    act(() => { result.current.markSaved() })

    // Unmount before timer fires — should not cause warnings
    unmount()

    // Advancing timers should not throw
    act(() => { vi.advanceTimersByTime(2000) })
  })
})
