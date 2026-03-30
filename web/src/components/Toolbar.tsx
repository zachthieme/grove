import { useCallback, useRef, useState, type ChangeEvent } from 'react'
import { useOrgData, useUI } from '../store/OrgContext'
import { exportDataUrl } from '../api/client'
import { useOutsideClick } from '../hooks/useOutsideClick'
import RecycleBinButton from './RecycleBinButton'
import SnapshotsDropdown from './SnapshotsDropdown'
import EmploymentTypeFilter from './EmploymentTypeFilter'
import PrivateToggle from './PrivateToggle'
import SettingsModal from './SettingsModal'
import SearchBar from './SearchBar'
import styles from './Toolbar.module.css'
import { useTour } from '../hooks/useTour'

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
  onUndo?: () => void
  onRedo?: () => void
  canUndo?: boolean
  canRedo?: boolean
  vimMode?: boolean
  onToggleVimMode?: (on: boolean) => void
  themePref?: 'system' | 'light' | 'dark'
  onChangeTheme?: (pref: 'system' | 'light' | 'dark') => void
}

export default function Toolbar({ onExportPng, onExportSvg, exporting, hasSnapshots, onExportAllSnapshots, loggingEnabled, onToggleLogs, logPanelOpen, onUndo, onRedo, canUndo, canRedo, vimMode, onToggleVimMode, themePref, onChangeTheme }: ToolbarProps) {
  const { upload, loaded, createOrg } = useOrgData()
  const { viewMode, dataView, setViewMode, setDataView, reflow } = useUI()
  const inputRef = useRef<HTMLInputElement>(null)
  const [exportOpen, setExportOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [newOrgOpen, setNewOrgOpen] = useState(false)
  const [newOrgName, setNewOrgName] = useState('')
  const newOrgRef = useRef<HTMLDivElement>(null)
  const newOrgInputRef = useRef<HTMLInputElement>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const { startTour } = useTour(loaded)

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
  useOutsideClick(newOrgRef, useCallback(() => setNewOrgOpen(false), []), newOrgOpen)

  const handleNewOrg = useCallback(async () => {
    const trimmed = newOrgName.trim()
    if (!trimmed) return
    await createOrg(trimmed)
    setNewOrgOpen(false)
    setNewOrgName('')
  }, [newOrgName, createOrg])

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
      <div ref={newOrgRef} style={{ position: 'relative' }}>
        <button className={styles.uploadBtn} onClick={() => { setNewOrgOpen(o => !o); setTimeout(() => newOrgInputRef.current?.focus(), 0) }} aria-label="New org chart">
          New
        </button>
        {newOrgOpen && (
          <div className={styles.newOrgPopover}>
            <form onSubmit={(e) => { e.preventDefault(); handleNewOrg() }} style={{ display: 'flex', gap: 4 }}>
              <input
                ref={newOrgInputRef}
                type="text"
                value={newOrgName}
                onChange={(e) => setNewOrgName(e.target.value)}
                placeholder="First person's name"
                className={styles.newOrgInput}
                autoFocus
              />
              <button type="submit" className={styles.newOrgSubmit} disabled={!newOrgName.trim()}>
                Create
              </button>
            </form>
          </div>
        )}
      </div>

      {loaded && (
        <>
          <div className={styles.pillGroup} data-tour="view-modes">
            {viewModes.map((m) => (
              <button
                key={m.value}
                className={`${styles.pill} ${viewMode === m.value ? styles.pillActive : ''}`}
                onClick={() => setViewMode(m.value)}
                title={`Switch to ${m.label} view`}
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
                title={`Show ${d.label} data`}
              >
                {d.label}
              </button>
            ))}
          </div>

          <SearchBar />

          <EmploymentTypeFilter />

          <PrivateToggle />

          <RecycleBinButton />

          <SnapshotsDropdown />

          <div className={styles.undoRedoGroup}>
            <button
              className={styles.undoRedoBtn}
              onClick={onUndo}
              disabled={!canUndo}
              title="Undo (⌘Z)"
              aria-label="Undo"
            >
              ↩
            </button>
            <button
              className={styles.undoRedoBtn}
              onClick={onRedo}
              disabled={!canRedo}
              title="Redo (⌘⇧Z)"
              aria-label="Redo"
            >
              ↪
            </button>
          </div>

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

      <button
        className={styles.helpBtn}
        onClick={startTour}
        aria-label="Start product tour"
        data-tour="help"
      >
        ?
      </button>

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
              <button className={styles.hamburgerItem} onClick={() => { reflow(); setMenuOpen(false) }} title="Refresh Layout">
                Refresh Layout
              </button>
            )}
            <button className={styles.hamburgerItem} onClick={() => { setSettingsOpen(true); setMenuOpen(false) }} title="Settings">
              Settings
            </button>
          </div>
        )}
      </div>

      {settingsOpen && <SettingsModal onClose={() => setSettingsOpen(false)} vimMode={vimMode} onToggleVimMode={onToggleVimMode} themePref={themePref} onChangeTheme={onChangeTheme} />}
    </header>
  )
}
