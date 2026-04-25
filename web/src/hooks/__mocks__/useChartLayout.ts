// Manual mock for vitest. Tests that don't need real chart-layout behavior
// (DOM bounding rects, dnd sensors) opt in via `vi.mock('../hooks/useChartLayout')`.
import { vi } from 'vitest'

export const useChartLayout = () => ({
  containerRef: { current: null },
  nodeRefs: { current: new Map() },
  setNodeRef: () => () => {},
  lines: [],
  activeDragId: null,
  sensors: [],
  handleDragStart: vi.fn(),
  handleDragEnd: vi.fn(),
})
