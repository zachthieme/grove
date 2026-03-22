import { useCallback } from 'react'
import { toPng, toSvg } from 'html-to-image'

export function useExport(mainRef: React.RefObject<HTMLElement | null>) {
  const exportPng = useCallback(async () => {
    if (!mainRef.current) return
    const dataUrl = await toPng(mainRef.current, { backgroundColor: '#ffffff' })
    const link = document.createElement('a')
    link.download = 'orgchart.png'
    link.href = dataUrl
    link.click()
  }, [mainRef])

  const exportSvg = useCallback(async () => {
    if (!mainRef.current) return
    const dataUrl = await toSvg(mainRef.current, { backgroundColor: '#ffffff' })
    const link = document.createElement('a')
    link.download = 'orgchart.svg'
    link.href = dataUrl
    link.click()
  }, [mainRef])

  return { exportPng, exportSvg }
}
