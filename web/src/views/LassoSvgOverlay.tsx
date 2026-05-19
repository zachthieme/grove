import type { ChartLine } from '../hooks/useChartLayout'

interface LassoRect {
  x: number
  y: number
  width: number
  height: number
}

interface LassoSvgOverlayProps {
  lassoRect: LassoRect | null
  lines: ChartLine[]
  className: string
  /** If true, render dashed cross-team edges (ColumnView style). Otherwise straight curves only. */
  dashedEdges?: boolean
  /** Full scrollable content dimensions so the SVG covers the entire chart, not just the viewport. */
  svgSize?: { width: number; height: number }
}

export function LassoSvgOverlay({ lassoRect, lines, className, dashedEdges, svgSize }: LassoSvgOverlayProps) {
  const sizeStyle = svgSize ? { width: svgSize.width, height: svgSize.height } : { width: '100%', height: '100%' }
  return (
    <>
      <svg className={className} style={sizeStyle}>
        {lines.map((l, i) => {
          if (dashedEdges && l.dashed) {
            const lowerY = Math.max(l.y1, l.y2)
            const midY = lowerY + 15
            return (
              <path
                key={i}
                d={`M ${l.x1} ${l.y1} L ${l.x1} ${midY} L ${l.x2} ${midY} L ${l.x2} ${l.y2}`}
                fill="none"
                stroke="var(--grove-sage, #9cad8f)"
                strokeWidth={1.2}
                strokeDasharray="5 4"
                opacity={0.6}
              />
            )
          }
          return (
            <path
              key={i}
              d={`M ${l.x1} ${l.y1} C ${l.x1} ${(l.y1 + l.y2) / 2}, ${l.x2} ${(l.y1 + l.y2) / 2}, ${l.x2} ${l.y2}`}
              fill="none"
              stroke="#b5a898"
              strokeWidth={1.5}
            />
          )
        })}
      </svg>
      {lassoRect && (
        <svg className={className} style={{ ...sizeStyle, pointerEvents: 'none', zIndex: 10 }}>
          <rect
            x={lassoRect.x}
            y={lassoRect.y}
            width={lassoRect.width}
            height={lassoRect.height}
            fill="rgba(74, 156, 63, 0.08)"
            stroke="var(--grove-green, #4a9c3f)"
            strokeWidth={1}
            strokeDasharray="4 2"
          />
        </svg>
      )}
    </>
  )
}
