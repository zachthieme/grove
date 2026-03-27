import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useAutosave } from './useAutosave'
import type { Person, Pod, Settings } from '../api/types'

vi.mock('../api/client', () => ({
  writeAutosave: vi.fn(),
}))

import * as api from '../api/client'

const mockedWriteAutosave = vi.mocked(api.writeAutosave)

function makePerson(overrides: Partial<Person> = {}): Person {
  return {
    id: '1',
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

const defaultSettings: Settings = { disciplineOrder: [] }

function makeState(overrides: Partial<Parameters<typeof useAutosave>[0]> = {}) {
  return {
    original: [makePerson()],
    working: [makePerson()],
    recycled: [] as Person[],
    pods: [] as Pod[],
    originalPods: [] as Pod[],
    settings: defaultSettings,
    currentSnapshotName: null,
    loaded: true,
    ...overrides,
  }
}

describe('useAutosave', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    localStorage.clear()
    mockedWriteAutosave.mockReset()
    mockedWriteAutosave.mockResolvedValue(undefined)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('[AUTO-001] saves to localStorage and calls writeAutosave after debounce', async () => {
    renderHook(() => useAutosave(makeState()))

    // Advance past the 2000ms debounce
    await act(async () => {
      vi.advanceTimersByTime(2000)
    })

    expect(localStorage.getItem('grove-autosave')).not.toBeNull()
    const saved = JSON.parse(localStorage.getItem('grove-autosave')!)
    expect(saved.original).toEqual([makePerson()])
    expect(saved.working).toEqual([makePerson()])
    expect(saved.recycled).toEqual([])
    expect(saved.snapshotName).toBe('')

    expect(mockedWriteAutosave).toHaveBeenCalledTimes(1)
    const callArg = mockedWriteAutosave.mock.calls[0][0]
    expect(callArg.original).toEqual([makePerson()])
    expect(callArg.working).toEqual([makePerson()])
    expect(callArg.timestamp).toBeDefined()
  })

  it('[AUTO-001] debounces multiple rapid changes into a single save', async () => {
    const state1 = makeState({ working: [makePerson({ name: 'Alice' })] })
    const state2 = makeState({ working: [makePerson({ name: 'Bob' })] })
    const state3 = makeState({ working: [makePerson({ name: 'Charlie' })] })

    const { rerender } = renderHook(
      (props: Parameters<typeof useAutosave>[0]) => useAutosave(props),
      { initialProps: state1 },
    )

    // Rapid re-renders before debounce fires
    await act(async () => {
      vi.advanceTimersByTime(500)
    })
    rerender(state2)

    await act(async () => {
      vi.advanceTimersByTime(500)
    })
    rerender(state3)

    // Now let the debounce fire from the last update
    await act(async () => {
      vi.advanceTimersByTime(2000)
    })

    // Should only have called writeAutosave once (the last state)
    expect(mockedWriteAutosave).toHaveBeenCalledTimes(1)
    const saved = JSON.parse(localStorage.getItem('grove-autosave')!)
    expect(saved.working[0].name).toBe('Charlie')
  })

  it('[AUTO-001] does not save when loaded is false', async () => {
    renderHook(() => useAutosave(makeState({ loaded: false })))

    await act(async () => {
      vi.advanceTimersByTime(3000)
    })

    expect(localStorage.getItem('grove-autosave')).toBeNull()
    expect(mockedWriteAutosave).not.toHaveBeenCalled()
  })

  it('[AUTO-001] does not save when working array is empty', async () => {
    renderHook(() => useAutosave(makeState({ working: [] })))

    await act(async () => {
      vi.advanceTimersByTime(3000)
    })

    expect(localStorage.getItem('grove-autosave')).toBeNull()
    expect(mockedWriteAutosave).not.toHaveBeenCalled()
  })

  it('[AUTO-001] does not save when suppressAutosaveRef is true', async () => {
    const suppressRef = { current: true }
    renderHook(() =>
      useAutosave(makeState({ suppressAutosaveRef: suppressRef })),
    )

    await act(async () => {
      vi.advanceTimersByTime(3000)
    })

    expect(localStorage.getItem('grove-autosave')).toBeNull()
    expect(mockedWriteAutosave).not.toHaveBeenCalled()
  })

  it('[AUTO-002] sets serverSaveError to true when writeAutosave rejects', async () => {
    mockedWriteAutosave.mockRejectedValueOnce(new Error('network error'))

    const { result } = renderHook(() => useAutosave(makeState()))

    // Advance past the debounce to trigger the save
    await act(async () => {
      vi.advanceTimersByTime(2000)
      // Flush microtasks so the rejected promise settles and setState runs
      await Promise.resolve()
    })

    expect(result.current.serverSaveError).toBe(true)
  })

  it('[AUTO-002] clears serverSaveError on a subsequent successful save', async () => {
    mockedWriteAutosave.mockRejectedValueOnce(new Error('network error'))

    const state1 = makeState({ working: [makePerson({ name: 'Alice' })] })
    const state2 = makeState({ working: [makePerson({ name: 'Bob' })] })

    const { result, rerender } = renderHook(
      (props: Parameters<typeof useAutosave>[0]) => useAutosave(props),
      { initialProps: state1 },
    )

    // First save fails
    await act(async () => {
      vi.advanceTimersByTime(2000)
      await Promise.resolve()
    })

    expect(result.current.serverSaveError).toBe(true)

    // Second save succeeds
    mockedWriteAutosave.mockResolvedValueOnce(undefined)
    rerender(state2)

    await act(async () => {
      vi.advanceTimersByTime(2000)
      await Promise.resolve()
    })

    expect(result.current.serverSaveError).toBe(false)
  })

  it('[AUTO-001] triggers a new save when working data changes', async () => {
    const state1 = makeState({ working: [makePerson({ name: 'Alice' })] })
    const { rerender } = renderHook(
      (props: Parameters<typeof useAutosave>[0]) => useAutosave(props),
      { initialProps: state1 },
    )

    // Let first save fire
    await act(async () => {
      vi.advanceTimersByTime(2000)
    })

    expect(mockedWriteAutosave).toHaveBeenCalledTimes(1)

    // Change the working data
    const state2 = makeState({ working: [makePerson({ name: 'Bob' })] })
    rerender(state2)

    // Let second save fire
    await act(async () => {
      vi.advanceTimersByTime(2000)
    })

    expect(mockedWriteAutosave).toHaveBeenCalledTimes(2)
    expect(mockedWriteAutosave.mock.calls[1][0].working[0].name).toBe('Bob')
  })

  it('[AUTO-001] stores the currentSnapshotName in autosave data', async () => {
    renderHook(() =>
      useAutosave(makeState({ currentSnapshotName: 'My Snapshot' })),
    )

    await act(async () => {
      vi.advanceTimersByTime(2000)
    })

    const saved = JSON.parse(localStorage.getItem('grove-autosave')!)
    expect(saved.snapshotName).toBe('My Snapshot')
  })

  it('[AUTO-001] uses empty string for snapshotName when currentSnapshotName is null', async () => {
    renderHook(() =>
      useAutosave(makeState({ currentSnapshotName: null })),
    )

    await act(async () => {
      vi.advanceTimersByTime(2000)
    })

    const saved = JSON.parse(localStorage.getItem('grove-autosave')!)
    expect(saved.snapshotName).toBe('')
  })

  it('[AUTO-001] includes pods and settings in the autosave data', async () => {
    const pods: Pod[] = [{ id: 'p1', name: 'Pod A', team: 'Platform', managerId: '1' }]
    const settings: Settings = { disciplineOrder: ['Engineering', 'Design'] }

    renderHook(() =>
      useAutosave(makeState({ pods, settings })),
    )

    await act(async () => {
      vi.advanceTimersByTime(2000)
    })

    const saved = JSON.parse(localStorage.getItem('grove-autosave')!)
    expect(saved.pods).toEqual(pods)
    expect(saved.settings).toEqual(settings)
  })

  it('[AUTO-001] cleans up the timer on unmount', async () => {
    const { unmount } = renderHook(() => useAutosave(makeState()))

    unmount()

    await act(async () => {
      vi.advanceTimersByTime(3000)
    })

    // The timer was cleared on unmount, so no save should have occurred
    expect(mockedWriteAutosave).not.toHaveBeenCalled()
  })
})
