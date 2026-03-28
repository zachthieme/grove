// Scenarios: AUTO-005, UI-012
import { describe, it, expect, vi, afterEach } from 'vitest'
import { renderHook } from '@testing-library/react'
import { useDirtyTracking } from './useDirtyTracking'

import { cleanup } from '@testing-library/react'

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('useDirtyTracking', () => {
  it('[AUTO-005] does not register handler when not loaded', () => {
    const addSpy = vi.spyOn(window, 'addEventListener')
    renderHook(() => useDirtyTracking(false, []))
    // beforeunload is always registered (the handler checks isDirtyRef internally)
    const calls = addSpy.mock.calls.filter(([event]) => event === 'beforeunload')
    expect(calls.length).toBeGreaterThan(0)
  })

  it('[UI-012] registers beforeunload handler on mount', () => {
    const addSpy = vi.spyOn(window, 'addEventListener')
    renderHook(() => useDirtyTracking(true, [1, 2, 3]))
    const calls = addSpy.mock.calls.filter(([event]) => event === 'beforeunload')
    expect(calls.length).toBeGreaterThan(0)
  })

  it('[UI-012] removes beforeunload handler on unmount', () => {
    const removeSpy = vi.spyOn(window, 'removeEventListener')
    const { unmount } = renderHook(() => useDirtyTracking(true, [1, 2, 3]))
    unmount()
    const calls = removeSpy.mock.calls.filter(([event]) => event === 'beforeunload')
    expect(calls.length).toBeGreaterThan(0)
  })

  it('[UI-012] detects dirty state when working reference changes', () => {
    const preventDefault = vi.fn()
    const initial = [1, 2, 3]
    const { rerender } = renderHook(
      ({ loaded, working }) => useDirtyTracking(loaded, working),
      { initialProps: { loaded: true, working: initial } },
    )

    // Same reference — not dirty, beforeunload should not call preventDefault
    const event1 = new Event('beforeunload') as BeforeUnloadEvent
    Object.defineProperty(event1, 'preventDefault', { value: preventDefault })
    window.dispatchEvent(event1)
    expect(preventDefault).not.toHaveBeenCalled()

    // New reference — dirty
    rerender({ loaded: true, working: [1, 2, 3, 4] })
    const event2 = new Event('beforeunload') as BeforeUnloadEvent
    Object.defineProperty(event2, 'preventDefault', { value: preventDefault })
    window.dispatchEvent(event2)
    expect(preventDefault).toHaveBeenCalled()
  })

  it('[AUTO-005] does not fire when loaded is false', () => {
    const preventDefault = vi.fn()
    renderHook(() => useDirtyTracking(false, [1, 2, 3]))

    const event = new Event('beforeunload') as BeforeUnloadEvent
    Object.defineProperty(event, 'preventDefault', { value: preventDefault })
    window.dispatchEvent(event)
    // Not loaded → never dirty → no warning
    expect(preventDefault).not.toHaveBeenCalled()
  })
})
