/**
 * Additional branch coverage for useExport.
 * Covers: SVG export error path, non-Error rejection, no-forest fallback.
 */
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

function createMockRefWithoutForest() {
  const container = document.createElement('div')
  container.setAttribute('data-role', 'chart-container')
  // No forest child
  const main = document.createElement('main')
  main.appendChild(container)
  return { current: main }
}

const originalCreateElement = document.createElement.bind(document)

describe('useExport — additional branches', () => {
  let clickSpy: ReturnType<typeof vi.fn>

  beforeEach(() => {
    vi.clearAllMocks()
    clickSpy = vi.fn()
    vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
      if (tag === 'a') {
        return { click: clickSpy, download: '', href: '' } as unknown as HTMLAnchorElement
      }
      return originalCreateElement(tag)
    })
  })

  beforeEach(() => {
    return () => { vi.restoreAllMocks() }
  })

  it('sets exportError with generic message when SVG export rejects with non-Error', async () => {
    mockedToSvg.mockRejectedValue('some string error')
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const ref = createMockRef()
    const { result } = renderHook(() => useExport(ref))

    await act(async () => {
      await result.current.exportSvg()
    })

    expect(result.current.exportError).toBe('SVG export failed')
  })

  it('sets exportError with generic message when PNG export rejects with non-Error', async () => {
    mockedToPng.mockRejectedValue('some string error')
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const ref = createMockRef()
    const { result } = renderHook(() => useExport(ref))

    await act(async () => {
      await result.current.exportPng()
    })

    expect(result.current.exportError).toBe('PNG export failed')
  })

  it('exportPng is a no-op when chart-container is not found', async () => {
    const main = document.createElement('main')
    // No chart-container child
    const ref = { current: main }
    const { result } = renderHook(() => useExport(ref))

    await act(async () => {
      await result.current.exportPng()
    })

    expect(mockedToPng).not.toHaveBeenCalled()
  })

  it('exportSvg is a no-op when chart-container is not found', async () => {
    const main = document.createElement('main')
    const ref = { current: main }
    const { result } = renderHook(() => useExport(ref))

    await act(async () => {
      await result.current.exportSvg()
    })

    expect(mockedToSvg).not.toHaveBeenCalled()
  })

  it('exportPng works without forest (getContentBounds returns null)', async () => {
    mockedToPng.mockResolvedValue('data:image/png;base64,abc')
    const ref = createMockRefWithoutForest()
    const { result } = renderHook(() => useExport(ref))

    await act(async () => {
      await result.current.exportPng()
    })

    expect(mockedToPng).toHaveBeenCalledTimes(1)
    const opts = mockedToPng.mock.calls[0][1] as Record<string, unknown>
    expect(opts.backgroundColor).toBe('#ffffff')
    // No width/height since getContentBounds returned null
    expect(opts.width).toBeUndefined()
    expect(opts.height).toBeUndefined()
  })

  it('exportSvg works without forest (getContentBounds returns null)', async () => {
    mockedToSvg.mockResolvedValue('data:image/svg+xml;base64,abc')
    const ref = createMockRefWithoutForest()
    const { result } = renderHook(() => useExport(ref))

    await act(async () => {
      await result.current.exportSvg()
    })

    expect(mockedToSvg).toHaveBeenCalledTimes(1)
    const opts = mockedToSvg.mock.calls[0][1] as Record<string, unknown>
    expect(opts.width).toBeUndefined()
  })

  it('exportSvg sets error with Error message', async () => {
    mockedToSvg.mockRejectedValue(new Error('SVG render crashed'))
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const ref = createMockRef()
    const { result } = renderHook(() => useExport(ref))

    await act(async () => {
      await result.current.exportSvg()
    })

    expect(result.current.exportError).toBe('SVG render crashed')
  })
})
