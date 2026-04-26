// Scenarios: UI-014
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useTour } from './useTour'

const mockDrive = vi.fn()
vi.mock('driver.js', () => ({
  driver: vi.fn(() => ({ drive: mockDrive })),
}))
vi.mock('driver.js/dist/driver.css', () => ({}))
vi.mock('../tour.css', () => ({}))

import { driver } from 'driver.js'

describe('useTour', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns startTour as a function', () => {
    const { result } = renderHook(() => useTour(false))
    expect(typeof result.current.startTour).toBe('function')
  })

  it('calls driver() and then drive() when startTour is invoked', () => {
    const { result } = renderHook(() => useTour(false))
    act(() => {
      result.current.startTour()
    })
    expect(driver).toHaveBeenCalledOnce()
    expect(mockDrive).toHaveBeenCalledOnce()
  })

  it('passes 3 steps when loaded is false', () => {
    const { result } = renderHook(() => useTour(false))
    act(() => {
      result.current.startTour()
    })
    const calls = vi.mocked(driver).mock.calls
    const config = calls[0]?.[0]
    expect(config!.steps).toHaveLength(3)
  })

  it('passes 10 steps when loaded is true', () => {
    const { result } = renderHook(() => useTour(true))
    act(() => {
      result.current.startTour()
    })
    const calls = vi.mocked(driver).mock.calls
    const config = calls[0]?.[0]
    expect(config!.steps).toHaveLength(10)
  })

  it('includes a Products step when loaded is true', () => {
    const { result } = renderHook(() => useTour(true))
    act(() => {
      result.current.startTour()
    })
    const calls = vi.mocked(driver).mock.calls
    const steps = calls[0]?.[0]?.steps ?? []
    const productStep = steps.find((s) => s.popover?.title === 'Products')
    expect(productStep).toBeDefined()
    expect(productStep?.element).toBe('[data-tour="product"]')
  })

  it('changes startTour reference when loaded changes', () => {
    const { result, rerender } = renderHook(
      ({ loaded }) => useTour(loaded),
      { initialProps: { loaded: false } },
    )
    const firstRef = result.current.startTour
    rerender({ loaded: true })
    const secondRef = result.current.startTour
    expect(firstRef).not.toBe(secondRef)
  })
})
