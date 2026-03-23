import { useCallback, useState } from 'react'
import { toPng, toSvg } from 'html-to-image'

export function useExport(mainRef: React.RefObject<HTMLElement | null>) {
  const [exporting, setExporting] = useState(false)
  const [exportError, setExportError] = useState<string | null>(null)

  const exportPng = useCallback(async () => {
    if (!mainRef.current || exporting) return
    setExporting(true)
    setExportError(null)
    try {
      const dataUrl = await toPng(mainRef.current, { backgroundColor: '#ffffff' })
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
    setExporting(true)
    setExportError(null)
    try {
      const dataUrl = await toSvg(mainRef.current, { backgroundColor: '#ffffff' })
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
