import { useState, useRef, useCallback } from 'react'
import { exportDataUrl } from '../api/client'
import { useOutsideClick } from '../hooks/useOutsideClick'
import styles from './Toolbar.module.css'

interface ExportDropdownProps {
  onExportPng?: () => void
  onExportSvg?: () => void
  exporting?: boolean
  hasSnapshots?: boolean
  onExportAllSnapshots?: (format: 'csv' | 'xlsx' | 'png' | 'svg') => void
}

export default function ExportDropdown({ onExportPng, onExportSvg, exporting, hasSnapshots, onExportAllSnapshots }: ExportDropdownProps) {
  const [exportOpen, setExportOpen] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)

  useOutsideClick(dropdownRef, useCallback(() => setExportOpen(false), []), exportOpen)

  return (
    <div className={styles.exportDropdown} ref={dropdownRef}>
      <button
        className={styles.exportBtn}
        onClick={() => setExportOpen((o) => !o)}
        aria-expanded={exportOpen}
        aria-label="Export options"
        data-tour="export"
      >
        {exporting ? 'Exporting...' : 'Export \u25be'}
      </button>
      {exportOpen && (
        <div className={styles.exportMenu}>
          <button
            className={styles.exportMenuItem}
            onClick={() => { onExportPng?.(); setExportOpen(false) }}
            title="Export as PNG"
          >
            PNG
          </button>
          <button
            className={styles.exportMenuItem}
            onClick={() => { onExportSvg?.(); setExportOpen(false) }}
            title="Export as SVG"
          >
            SVG
          </button>
          <button
            className={styles.exportMenuItem}
            onClick={() => {
              setExportOpen(false)
              const a = document.createElement('a')
              a.href = exportDataUrl('csv')
              a.download = 'grove.csv'
              a.click()
            }}
            title="Export as CSV"
          >
            CSV
          </button>
          <button
            className={styles.exportMenuItem}
            onClick={() => {
              setExportOpen(false)
              const a = document.createElement('a')
              a.href = exportDataUrl('xlsx')
              a.download = 'grove.xlsx'
              a.click()
            }}
            title="Export as XLSX"
          >
            XLSX
          </button>
          {hasSnapshots && onExportAllSnapshots && (
            <>
              <div className={styles.exportSeparator} />
              <button className={styles.exportMenuItem} disabled={exporting}
                onClick={() => { onExportAllSnapshots('csv'); setExportOpen(false) }}
                title="Export all snapshots as CSV">
                All Snapshots (CSV)
              </button>
              <button className={styles.exportMenuItem} disabled={exporting}
                onClick={() => { onExportAllSnapshots('xlsx'); setExportOpen(false) }}
                title="Export all snapshots as XLSX">
                All Snapshots (XLSX)
              </button>
              <button className={styles.exportMenuItem} disabled={exporting}
                onClick={() => { onExportAllSnapshots('png'); setExportOpen(false) }}
                title="Export all snapshots as PNG">
                All Snapshots (PNG)
              </button>
              <button className={styles.exportMenuItem} disabled={exporting}
                onClick={() => { onExportAllSnapshots('svg'); setExportOpen(false) }}
                title="Export all snapshots as SVG">
                All Snapshots (SVG)
              </button>
            </>
          )}
        </div>
      )}
    </div>
  )
}
