import { useCallback, useRef, useState, type ChangeEvent } from 'react'
import { useOrg } from '../store/OrgContext'
import { exportDataUrl } from '../api/client'
import { useOutsideClick } from '../hooks/useOutsideClick'
import RecycleBinButton from './RecycleBinButton'
import SnapshotsDropdown from './SnapshotsDropdown'
import EmploymentTypeFilter from './EmploymentTypeFilter'
import PrivateToggle from './PrivateToggle'
import SettingsModal from './SettingsModal'
import styles from './Toolbar.module.css'

const viewModes = [
  { value: 'detail', label: 'Detail' },
  { value: 'manager', label: 'Manager' },
  { value: 'table', label: 'Table' },
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
  hasSnapshots?: boolean
  onExportAllSnapshots?: (format: 'csv' | 'xlsx' | 'png' | 'svg') => void
  loggingEnabled?: boolean
  onToggleLogs?: () => void
  logPanelOpen?: boolean
}

export default function Toolbar({ onExportPng, onExportSvg, exporting, hasSnapshots, onExportAllSnapshots, loggingEnabled, onToggleLogs, logPanelOpen }: ToolbarProps) {
  const { loaded, viewMode, dataView, setViewMode, setDataView, upload, reflow } = useOrg()
  const inputRef = useRef<HTMLInputElement>(null)
  const [exportOpen, setExportOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  const handleFileChange = useCallback(
    async (e: ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0]
      if (file) {
        await upload(file)
      }
    },
    [upload],
  )

  useOutsideClick(dropdownRef, useCallback(() => setExportOpen(false), []), exportOpen)
  useOutsideClick(menuRef, useCallback(() => setMenuOpen(false), []), menuOpen)

  return (
    <header className={styles.toolbar}>
      <img src="/grove-icon.svg" alt="" style={{ width: 20, height: 20 }} />
      <span className={styles.title}>Grove</span>

      <input
        ref={inputRef}
        type="file"
        accept=".csv,.xlsx,.zip"
        onChange={handleFileChange}
        style={{ display: 'none' }}
      />
      <button className={styles.uploadBtn} onClick={() => inputRef.current?.click()} aria-label="Upload file" data-tour="upload">
        Upload
      </button>

      {loaded && (
        <>
          <div className={styles.pillGroup} data-tour="view-modes">
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

          <div className={styles.pillGroup} data-tour="data-views">
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

          <PrivateToggle />

          <RecycleBinButton />

          <SnapshotsDropdown />

          <div className={styles.spacer} />

          <div className={styles.exportDropdown} ref={dropdownRef}>
            <button
              className={styles.exportBtn}
              onClick={() => setExportOpen((o) => !o)}
              aria-expanded={exportOpen}
              aria-label="Export options"
              data-tour="export"
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
                  onClick={() => {
                    setExportOpen(false)
                    const a = document.createElement('a')
                    a.href = exportDataUrl('csv')
                    a.download = 'grove.csv'
                    a.click()
                  }}
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
                >
                  XLSX
                </button>
                {hasSnapshots && onExportAllSnapshots && (
                  <>
                    <div className={styles.exportSeparator} />
                    <button className={styles.exportMenuItem} disabled={exporting}
                      onClick={() => { onExportAllSnapshots('csv'); setExportOpen(false) }}>
                      All Snapshots (CSV)
                    </button>
                    <button className={styles.exportMenuItem} disabled={exporting}
                      onClick={() => { onExportAllSnapshots('xlsx'); setExportOpen(false) }}>
                      All Snapshots (XLSX)
                    </button>
                    <button className={styles.exportMenuItem} disabled={exporting}
                      onClick={() => { onExportAllSnapshots('png'); setExportOpen(false) }}>
                      All Snapshots (PNG)
                    </button>
                    <button className={styles.exportMenuItem} disabled={exporting}
                      onClick={() => { onExportAllSnapshots('svg'); setExportOpen(false) }}>
                      All Snapshots (SVG)
                    </button>
                  </>
                )}
              </div>
            )}
          </div>
        </>
      )}
      {loggingEnabled && (
        <button
          className={`${styles.pill} ${logPanelOpen ? styles.pillActive : ''}`}
          onClick={onToggleLogs}
          aria-label="Toggle log viewer"
        >
          Logs
        </button>
      )}

      <div className={styles.hamburgerWrapper} ref={menuRef}>
        <button
          className={styles.hamburgerBtn}
          onClick={() => setMenuOpen(o => !o)}
          aria-label="Menu"
          aria-expanded={menuOpen}
        >
          &#x2630;
        </button>
        {menuOpen && (
          <div className={styles.hamburgerMenu}>
            {viewMode !== 'table' && (
              <button className={styles.hamburgerItem} onClick={() => { reflow(); setMenuOpen(false) }}>
                Refresh Layout
              </button>
            )}
            <button className={styles.hamburgerItem} onClick={() => { setSettingsOpen(true); setMenuOpen(false) }}>
              Settings
            </button>
          </div>
        )}
      </div>

      {settingsOpen && <SettingsModal onClose={() => setSettingsOpen(false)} />}
    </header>
  )
}
