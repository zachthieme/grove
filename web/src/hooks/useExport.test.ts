// Scenarios: EXPORT-001
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useExport } from './useExport'

vi.mock('html-to-image', () => ({
  toPng: vi.fn(),
  toSvg: vi.fn(),
}))

import { toPng, toSvg } from 'html-to-image'

const mockedToPng = vi.mocked(toPng)
const mockedToSvg = vi.mocked(toSvg)

function createMockRef() {
  const container = document.createElement('div')
  container.setAttribute('data-role', 'chart-container')
  const forest = document.createElement('div')
  forest.setAttribute('data-role', 'forest')
  container.appendChild(forest)
  const main = document.createElement('main')
  main.appendChild(container)
  return { current: main }
}

const originalCreateElement = document.createElement.bind(document)

describe('useExport', () => {
  let clickSpy: ReturnType<typeof vi.fn>
  const fakeDataUrl = 'data:image/png;base64,abc123'

  beforeEach(() => {
    vi.clearAllMocks()
    clickSpy = vi.fn()
    vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
      if (tag === 'a') {
        const anchor = { click: clickSpy, download: '', href: '' } as unknown as HTMLAnchorElement
        return anchor
      }
      return originalCreateElement(tag)
    })
  })

  // Restore the original createElement after mocking
  beforeEach(() => {
    return () => {
      vi.restoreAllMocks()
    }
  })

  it('returns correct initial state', () => {
    const ref = createMockRef()
    const { result } = renderHook(() => useExport(ref))

    expect(result.current.exporting).toBe(false)
    expect(result.current.exportError).toBe(null)
    expect(typeof result.current.exportPng).toBe('function')
    expect(typeof result.current.exportSvg).toBe('function')
    expect(typeof result.current.clearExportError).toBe('function')
  })

  it('exportPng calls toPng and triggers download', async () => {
    mockedToPng.mockResolvedValue(fakeDataUrl)
    const ref = createMockRef()
    const { result } = renderHook(() => useExport(ref))

    await act(async () => {
      await result.current.exportPng()
    })

    expect(mockedToPng).toHaveBeenCalledTimes(1)
    const callArgs = mockedToPng.mock.calls[0]
    expect((callArgs[0] as HTMLElement).getAttribute('data-role')).toBe('chart-container')
    expect(callArgs[1]).toMatchObject({ backgroundColor: '#ffffff' })
    expect(clickSpy).toHaveBeenCalledTimes(1)
    expect(result.current.exporting).toBe(false)
  })

  it('exportSvg calls toSvg and triggers download', async () => {
    mockedToSvg.mockResolvedValue(fakeDataUrl)
    const ref = createMockRef()
    const { result } = renderHook(() => useExport(ref))

    await act(async () => {
      await result.current.exportSvg()
    })

    expect(mockedToSvg).toHaveBeenCalledTimes(1)
    const callArgs = mockedToSvg.mock.calls[0]
    expect((callArgs[0] as HTMLElement).getAttribute('data-role')).toBe('chart-container')
    expect(callArgs[1]).toMatchObject({ backgroundColor: '#ffffff' })
    expect(clickSpy).toHaveBeenCalledTimes(1)
    expect(result.current.exporting).toBe(false)
  })

  it('sets exportError when toPng rejects', async () => {
    mockedToPng.mockRejectedValue(new Error('render failed'))
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const ref = createMockRef()
    const { result } = renderHook(() => useExport(ref))

    await act(async () => {
      await result.current.exportPng()
    })

    expect(result.current.exportError).toBe('render failed')
    expect(result.current.exporting).toBe(false)
  })

  it('clearExportError clears the error', async () => {
    mockedToPng.mockRejectedValue(new Error('render failed'))
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const ref = createMockRef()
    const { result } = renderHook(() => useExport(ref))

    await act(async () => {
      await result.current.exportPng()
    })
    expect(result.current.exportError).toBe('render failed')

    act(() => {
      result.current.clearExportError()
    })
    expect(result.current.exportError).toBe(null)
  })

  it('is a no-op when mainRef.current is null', async () => {
    const ref = { current: null }
    const { result } = renderHook(() => useExport(ref))

    await act(async () => {
      await result.current.exportPng()
    })

    expect(mockedToPng).not.toHaveBeenCalled()
    expect(result.current.exporting).toBe(false)
  })

  it('is a no-op when already exporting', async () => {
    let resolvePng: (value: string) => void
    mockedToPng.mockImplementation(
      () => new Promise((resolve) => { resolvePng = resolve })
    )
    const ref = createMockRef()
    const { result } = renderHook(() => useExport(ref))

    // Start first export (will hang until we resolve)
    let firstExport: Promise<void>
    act(() => {
      firstExport = result.current.exportPng()
    })

    // Re-render so the hook sees exporting=true
    expect(result.current.exporting).toBe(true)

    // Second call while first is in flight should be a no-op
    await act(async () => {
      await result.current.exportPng()
    })

    // toPng should only have been called once (from the first call)
    expect(mockedToPng).toHaveBeenCalledTimes(1)

    // Resolve the first export to clean up
    await act(async () => {
      resolvePng!(fakeDataUrl)
      await firstExport!
    })

    expect(result.current.exporting).toBe(false)
  })
})
