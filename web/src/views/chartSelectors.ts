import { useChartData } from './ChartContext'

export function useIsSelected(id: string): boolean {
  return useChartData().selectedIds.has(id)
}

export function useIsCollapsed(id: string): boolean {
  return useChartData().collapsedIds?.has(id) ?? false
}
