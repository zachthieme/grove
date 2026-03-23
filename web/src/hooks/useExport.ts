import { useCallback, useState } from 'react'
import { toPng, toSvg } from 'html-to-image'

const EXPORT_PADDING = 32

/** Get tight content dimensions from the chart container, cropping dead space. */
function getContentBounds(el: HTMLElement): { width: number; height: number } | null {
  // The .container holds the SVG overlay + .forest. Measure .forest for content size.
  const forest = el.querySelector('[class*="forest"]') as HTMLElement | null
  if (!forest) return null
  const w = forest.scrollWidth + EXPORT_PADDING * 2
  const h = forest.scrollHeight + EXPORT_PADDING * 2
  return { width: w, height: h }
}

export function useExport(mainRef: React.RefObject<HTMLElement | null>) {
  const [exporting, setExporting] = useState(false)
  const [exportError, setExportError] = useState<string | null>(null)

  const exportPng = useCallback(async () => {
    if (!mainRef.current || exporting) return
    // Target the chart container (child of main), not main itself
    const container = mainRef.current.querySelector('[class*="container"]') as HTMLElement | null
    if (!container) return
    setExporting(true)
    setExportError(null)
    try {
      const bounds = getContentBounds(container)
      const dataUrl = await toPng(container, {
        backgroundColor: '#ffffff',
        ...(bounds && { width: bounds.width, height: bounds.height }),
      })
      const link = document.createElement('a')
      link.download = 'grove.png'
      link.href = dataUrl
      link.click()
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'PNG export failed'
      console.error('PNG export failed:', err)
      setExportError(msg)
    } finally {
      setExporting(false)
    }
  }, [mainRef, exporting])

  const exportSvg = useCallback(async () => {
    if (!mainRef.current || exporting) return
    const container = mainRef.current.querySelector('[class*="container"]') as HTMLElement | null
    if (!container) return
    setExporting(true)
    setExportError(null)
    try {
      const bounds = getContentBounds(container)
      const dataUrl = await toSvg(container, {
        backgroundColor: '#ffffff',
        ...(bounds && { width: bounds.width, height: bounds.height }),
      })
      const link = document.createElement('a')
      link.download = 'grove.svg'
      link.href = dataUrl
      link.click()
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'SVG export failed'
      console.error('SVG export failed:', err)
      setExportError(msg)
    } finally {
      setExporting(false)
    }
  }, [mainRef, exporting])

  return { exportPng, exportSvg, exporting, exportError }
}
