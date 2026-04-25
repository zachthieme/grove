import { useCallback, useRef, useState, type ChangeEvent } from 'react'
import { useOrgData, useOrgMutations, useUI } from '../store/OrgContext'
import { useOutsideClick } from '../hooks/useOutsideClick'
import RecycleBinButton from './RecycleBinButton'
import SnapshotsDropdown from './SnapshotsDropdown'
import FiltersDropdown from './FiltersDropdown'
import SettingsModal from './SettingsModal'
import SearchBar from './SearchBar'
import ExportDropdown from './ExportDropdown'
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
  vimMode?: boolean
  onToggleVimMode?: (on: boolean) => void
  themePref?: 'system' | 'light' | 'dark'
  onChangeTheme?: (pref: 'system' | 'light' | 'dark') => void
}

export default function Toolbar({ onExportPng, onExportSvg, exporting, hasSnapshots, onExportAllSnapshots, loggingEnabled, onToggleLogs, logPanelOpen, vimMode, onToggleVimMode, themePref, onChangeTheme }: ToolbarProps) {
  const { loaded } = useOrgData()
  const { upload, createOrg, undo, redo, canUndo, canRedo } = useOrgMutations()
  const { viewMode, dataView, setViewMode, setDataView, reflow } = useUI()
  const inputRef = useRef<HTMLInputElement>(null)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [newOrgOpen, setNewOrgOpen] = useState(false)
  const [newOrgName, setNewOrgName] = useState('')
  const newOrgRef = useRef<HTMLDivElement>(null)
  const newOrgInputRef = useRef<HTMLInputElement>(null)
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

          <FiltersDropdown />

          <RecycleBinButton />

          <SnapshotsDropdown />

          <div className={styles.undoRedoGroup}>
            <button
              className={styles.undoRedoBtn}
              onClick={undo}
              disabled={!canUndo}
              title="Undo (⌘Z)"
              aria-label="Undo"
            >
              ↩
            </button>
            <button
              className={styles.undoRedoBtn}
              onClick={redo}
              disabled={!canRedo}
              title="Redo (⌘⇧Z)"
              aria-label="Redo"
            >
              ↪
            </button>
          </div>

          <div className={styles.spacer} />

          <ExportDropdown
            onExportPng={onExportPng}
            onExportSvg={onExportSvg}
            exporting={exporting}
            hasSnapshots={hasSnapshots}
            onExportAllSnapshots={onExportAllSnapshots}
          />
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
