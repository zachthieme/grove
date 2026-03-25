import { useCallback, useRef, useState } from 'react'
import { toPng, toSvg } from 'html-to-image'
import JSZip from 'jszip'
import type { SnapshotInfo } from '../api/types'
import { exportSnapshotBlob, exportPodsSidecarBlob, exportSettingsSidecarBlob } from '../api/client'
import { sanitizeFilename, deduplicateFilenames } from '../utils/snapshotExportUtils'

type ExportFormat = 'csv' | 'xlsx' | 'png' | 'svg'

interface UseSnapshotExportOptions {
  snapshots: SnapshotInfo[]
  mainRef: React.RefObject<HTMLElement | null>
  loadSnapshot: (name: string) => Promise<void>
  saveSnapshot: (name: string) => Promise<void>
  deleteSnapshot: (name: string) => Promise<void>
  showAllEmploymentTypes: () => void
  setHead: (id: string | null) => void
}

export function useSnapshotExport({
  snapshots,
  mainRef,
  loadSnapshot,
  saveSnapshot,
  deleteSnapshot,
  showAllEmploymentTypes,
  setHead,
}: UseSnapshotExportOptions) {
  const [exporting, setExporting] = useState(false)
  const [progress, setProgress] = useState({ current: 0, total: 0 })
  const suppressAutosaveRef = useRef(false)

  const exportAllSnapshots = useCallback(async (format: ExportFormat) => {
    if (exporting) return
    setExporting(true)
    suppressAutosaveRef.current = true

    const sortedSnapshots = [...snapshots].sort((a, b) =>
      a.timestamp.localeCompare(b.timestamp)
    )
    const entries = [
      { name: '__original__', label: 'original' },
      { name: '__working__', label: 'working' },
      ...sortedSnapshots.map((s) => ({ name: s.name, label: s.name })),
    ]

    setProgress({ current: 0, total: entries.length })
    const ext = format === 'xlsx' ? 'xlsx' : format === 'csv' ? 'csv' : format === 'png' ? 'png' : 'svg'
    const isImage = format === 'png' || format === 'svg'
    const zip = new JSZip()

    // For image export: save current state, clear filters
    if (isImage) {
      try { await saveSnapshot('__export_temp__') } catch { /* best effort */ }
      showAllEmploymentTypes()
      setHead(null)
    }

    const rawNames = entries.map((e) => sanitizeFilename(e.label))
    const filenames = deduplicateFilenames(rawNames)
    let successCount = 0

    try {
      for (let i = 0; i < entries.length; i++) {
        setProgress({ current: i + 1, total: entries.length })
        const entry = entries[i]
        const filename = `${i}-${filenames[i]}.${ext}`

        try {
          let blob: Blob
          if (isImage) {
            // Load snapshot into DOM for image capture.
            // __working__: load our temp snapshot (saved before the loop).
            // __original__: calls resetToOriginal() on server — this is a
            // server-side mutation but we restore from __export_temp__ after the loop.
            // Named snapshots: load directly.
            if (entry.name === '__working__') {
              await loadSnapshot('__export_temp__')
            } else {
              await loadSnapshot(entry.name)
            }
            // Wait for DOM to settle
            await new Promise((r) => requestAnimationFrame(() => setTimeout(r, 300)))

            const chartContainer = mainRef.current?.querySelector('[data-role="chart-container"]') as HTMLElement | null
            if (!chartContainer) throw new Error('Chart container not found')
            const dataUrl = format === 'png'
              ? await toPng(chartContainer, { backgroundColor: '#ffffff' })
              : await toSvg(chartContainer, { backgroundColor: '#ffffff' })

            const resp = await fetch(dataUrl)
            blob = await resp.blob()
          } else {
            blob = await exportSnapshotBlob(entry.name, format as 'csv' | 'xlsx')
          }
          zip.file(filename, blob)
          successCount++
        } catch (err) {
          console.warn(`Snapshot export failed for "${entry.label}":`, err)
        }
      }

      // Add pods.csv sidecar for working pod set
      try {
        const podsSidecar = await exportPodsSidecarBlob()
        if (podsSidecar) {
          zip.file('pods.csv', podsSidecar)
        }
      } catch {
        console.warn('Failed to export pods sidecar')
      }

      // Add settings.csv sidecar
      try {
        const settingsSidecar = await exportSettingsSidecarBlob()
        if (settingsSidecar) {
          zip.file('settings.csv', settingsSidecar)
        }
      } catch {
        console.warn('Failed to export settings sidecar')
      }

      if (successCount === 0) {
        throw new Error('All snapshot exports failed')
      }

      const zipBlob = await zip.generateAsync({ type: 'blob' })
      const url = URL.createObjectURL(zipBlob)
      const a = document.createElement('a')
      a.href = url
      a.download = 'grove-snapshots.zip'
      a.click()
      URL.revokeObjectURL(url)
    } finally {
      // Restore state for image export
      if (isImage) {
        try {
          await loadSnapshot('__export_temp__')
          await deleteSnapshot('__export_temp__')
        } catch { /* best effort */ }
      }
      suppressAutosaveRef.current = false
      setExporting(false)
      setProgress({ current: 0, total: 0 })
    }
  }, [exporting, snapshots, mainRef, loadSnapshot, saveSnapshot, deleteSnapshot, showAllEmploymentTypes, setHead])

  return { exportAllSnapshots, exporting, progress, suppressAutosaveRef }
}
