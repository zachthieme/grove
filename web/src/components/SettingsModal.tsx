import { useState, useCallback } from 'react'
import { useOrgData, useOrgMutations } from '../store/OrgContext'
import styles from './SettingsModal.module.css'

type ThemePref = 'system' | 'light' | 'dark'

interface SettingsModalProps {
  onClose: () => void
  vimMode?: boolean
  onToggleVimMode?: (on: boolean) => void
  themePref?: ThemePref
  onChangeTheme?: (pref: ThemePref) => void
}

export default function SettingsModal({ onClose, vimMode, onToggleVimMode, themePref, onChangeTheme }: SettingsModalProps) {
  const { working, settings } = useOrgData()
  const { updateSettings } = useOrgMutations()

  const allDisciplines = Array.from(new Set(
    working.filter(p => p.discipline).map(p => p.discipline)
  )).sort()

  const [order, setOrder] = useState<string[]>(() => {
    const existing = settings.disciplineOrder
    const extra = allDisciplines.filter(d => !existing.includes(d))
    return [...existing.filter(d => allDisciplines.includes(d)), ...extra]
  })

  const [dragIdx, setDragIdx] = useState<number | null>(null)

  const handleDragStart = (idx: number) => setDragIdx(idx)

  const handleDragOver = (e: React.DragEvent, idx: number) => {
    e.preventDefault()
    if (dragIdx === null || dragIdx === idx) return
    const newOrder = [...order]
    const [moved] = newOrder.splice(dragIdx, 1)
    newOrder.splice(idx, 0, moved)
    setOrder(newOrder)
    setDragIdx(idx)
  }

  const handleDragEnd = () => setDragIdx(null)

  const handleSave = useCallback(async () => {
    await updateSettings({ disciplineOrder: order })
    onClose()
  }, [order, updateSettings, onClose])

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={e => e.stopPropagation()}>
        <h3 className={styles.title}>Settings</h3>
        <h4 className={styles.sectionTitle}>Discipline Order</h4>
        <p className={styles.hint}>Drag to reorder. People are sorted by this order within each pod.</p>
        <ul className={styles.list}>
          {order.map((d, i) => (
            <li
              key={d}
              className={`${styles.item} ${dragIdx === i ? styles.dragging : ''}`}
              draggable
              onDragStart={() => handleDragStart(i)}
              onDragOver={(e) => handleDragOver(e, i)}
              onDragEnd={handleDragEnd}
            >
              <span className={styles.grip}>&#x2807;</span>
              {d}
            </li>
          ))}
        </ul>
        {order.length === 0 && (
          <p className={styles.hint}>No disciplines found in current data.</p>
        )}

        <h4 className={styles.sectionTitle}>Appearance</h4>
        <div className={styles.themeGroup}>
          {(['system', 'light', 'dark'] as const).map((opt) => (
            <label key={opt} className={styles.themeOption}>
              <input
                type="radio"
                name="theme"
                checked={themePref === opt}
                onChange={() => onChangeTheme?.(opt)}
              />
              <span>{opt === 'system' ? 'System' : opt === 'light' ? 'Light' : 'Dark'}</span>
            </label>
          ))}
        </div>

        <h4 className={styles.sectionTitle}>Keyboard</h4>
        <label className={styles.toggle}>
          <input
            type="checkbox"
            checked={vimMode ?? false}
            onChange={(e) => onToggleVimMode?.(e.target.checked)}
          />
          <span>Vim navigation keys</span>
          <span className={styles.hint} style={{ margin: 0 }}> — hjkl to navigate, ? for full cheat sheet</span>
        </label>

        <div className={styles.actions}>
          <button className={styles.cancelBtn} onClick={onClose}>Cancel</button>
          <button className={styles.saveBtn} onClick={handleSave}>Save</button>
        </div>
      </div>
    </div>
  )
}
