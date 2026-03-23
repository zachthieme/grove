import { useCallback, useRef, useState, useEffect, type ChangeEvent } from 'react'
import { useOrg } from '../store/OrgContext'
import RecycleBinButton from './RecycleBinButton'
import SnapshotsDropdown from './SnapshotsDropdown'
import EmploymentTypeFilter from './EmploymentTypeFilter'
import styles from './Toolbar.module.css'

const viewModes = [
  { value: 'detail', label: 'Detail' },
  { value: 'manager', label: 'Manager' },
] as const

const dataViews = [
  { value: 'original', label: 'Original' },
  { value: 'working', label: 'Working' },
  { value: 'diff', label: 'Diff' },
] as const

interface ToolbarProps {
  onExportPng?: () => void
  onExportSvg?: () => void
  exporting?: boolean
}

export default function Toolbar({ onExportPng, onExportSvg, exporting }: ToolbarProps) {
  const { loaded, viewMode, dataView, setViewMode, setDataView, upload, reflow } = useOrg()
  const inputRef = useRef<HTMLInputElement>(null)
  const [exportOpen, setExportOpen] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)

  const handleFileChange = useCallback(
    async (e: ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0]
      if (file) {
        await upload(file)
      }
    },
    [upload],
  )

  // Close dropdown on outside click
  useEffect(() => {
    if (!exportOpen) return
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setExportOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [exportOpen])

  return (
    <header className={styles.toolbar}>
      <img src="/grove-icon.svg" alt="" style={{ width: 20, height: 20 }} />
      <span className={styles.title}>Grove</span>

      <input
        ref={inputRef}
        type="file"
        accept=".csv,.xlsx"
        onChange={handleFileChange}
        style={{ display: 'none' }}
      />
      <button className={styles.uploadBtn} onClick={() => inputRef.current?.click()}>
        Upload
      </button>

      {loaded && (
        <>
          <div className={styles.pillGroup}>
            {viewModes.map((m) => (
              <button
                key={m.value}
                className={`${styles.pill} ${viewMode === m.value ? styles.pillActive : ''}`}
                onClick={() => setViewMode(m.value)}
              >
                {m.label}
              </button>
            ))}
          </div>

          <button className={styles.pill} onClick={() => reflow()} title="Re-layout">
            ↻
          </button>

          <div className={styles.pillGroup}>
            {dataViews.map((d) => (
              <button
                key={d.value}
                className={`${styles.pill} ${dataView === d.value ? styles.pillActive : ''}`}
                onClick={() => setDataView(d.value)}
              >
                {d.label}
              </button>
            ))}
          </div>

          <EmploymentTypeFilter />

          <RecycleBinButton />

          <SnapshotsDropdown />

          <div className={styles.spacer} />

          <div className={styles.exportDropdown} ref={dropdownRef}>
            <button
              className={styles.exportBtn}
              onClick={() => setExportOpen((o) => !o)}
            >
              {exporting ? 'Exporting...' : 'Export ▾'}
            </button>
            {exportOpen && (
              <div className={styles.exportMenu}>
                <button
                  className={styles.exportMenuItem}
                  onClick={() => { onExportPng?.(); setExportOpen(false) }}
                >
                  PNG
                </button>
                <button
                  className={styles.exportMenuItem}
                  onClick={() => { onExportSvg?.(); setExportOpen(false) }}
                >
                  SVG
                </button>
                <button
                  className={styles.exportMenuItem}
                  onClick={async () => {
                    setExportOpen(false)
                    const resp = await fetch('/api/export/csv')
                    const blob = await resp.blob()
                    const url = URL.createObjectURL(blob)
                    const a = document.createElement('a')
                    a.href = url; a.download = 'grove.csv'; a.click()
                    URL.revokeObjectURL(url)
                  }}
                >
                  CSV
                </button>
                <button
                  className={styles.exportMenuItem}
                  onClick={async () => {
                    setExportOpen(false)
                    const resp = await fetch('/api/export/xlsx')
                    const blob = await resp.blob()
                    const url = URL.createObjectURL(blob)
                    const a = document.createElement('a')
                    a.href = url; a.download = 'grove.xlsx'; a.click()
                    URL.revokeObjectURL(url)
                  }}
                >
                  XLSX
                </button>
              </div>
            )}
          </div>
        </>
      )}
    </header>
  )
}
