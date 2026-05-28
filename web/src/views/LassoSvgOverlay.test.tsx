import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import { LassoSvgOverlay } from './LassoSvgOverlay'
import type { ChartLine } from '../hooks/useChartLayout'

const lines: ChartLine[] = [
  { x1: 0, y1: 0, x2: 100, y2: 100 },
  { x1: 50, y1: 0, x2: 150, y2: 100, dashed: true },
]

describe('LassoSvgOverlay', () => {
  it('[VIEW-007] lines SVG stays at base z-index during lasso selection', () => {
    const { container } = render(
      <LassoSvgOverlay
        lassoRect={{ x: 10, y: 10, width: 80, height: 80 }}
        lines={lines}
        className="overlay"
        dashedEdges
      />
    )
    const svgs = container.querySelectorAll('svg')
    // Two SVGs: one for lines, one for lasso rect
    expect(svgs.length).toBe(2)

    const linesSvg = svgs[0]
    const lassoSvg = svgs[1]

    // Lines SVG must NOT have elevated z-index
    expect(linesSvg.style.zIndex).toBe('')

    // Lasso SVG gets elevated z-index
    expect(lassoSvg.style.zIndex).toBe('10')
  })

  it('[VIEW-007] SVG uses svgSize dimensions when provided', () => {
    const { container } = render(
      <LassoSvgOverlay
        lassoRect={null}
        lines={lines}
        className="overlay"
        dashedEdges
        svgSize={{ width: 2000, height: 3000 }}
      />
    )
    const svg = container.querySelector('svg')!
    expect(svg.style.width).toBe('2000px')
    expect(svg.style.height).toBe('3000px')
  })

  it('[VIEW-007] SVG falls back to 100% when svgSize is omitted', () => {
    const { container } = render(
      <LassoSvgOverlay
        lassoRect={null}
        lines={lines}
        className="overlay"
        dashedEdges
      />
    )
    const svg = container.querySelector('svg')!
    expect(svg.style.width).toBe('100%')
    expect(svg.style.height).toBe('100%')
  })

  it('[VIEW-007] only lines SVG renders when no lasso is active', () => {
    const { container } = render(
      <LassoSvgOverlay
        lassoRect={null}
        lines={lines}
        className="overlay"
        dashedEdges
      />
    )
    const svgs = container.querySelectorAll('svg')
    expect(svgs.length).toBe(1)
    expect(svgs[0].style.zIndex).toBe('')
    // Should contain the line paths
    expect(svgs[0].querySelectorAll('path').length).toBe(2)
  })
})
