import { useState, useRef, useEffect, useCallback } from 'react'
import type { CellType } from './tableColumns'
import styles from './TableView.module.css'

interface TableCellProps {
  value: string
  cellType: CellType
  readOnly?: boolean
  options?: { value: string; label: string }[]
  onSave: (value: string) => Promise<void>
  onTab?: (shift: boolean) => void
  onEnter?: () => void
  cellRef?: (el: HTMLTableCellElement | null) => void
}

export default function TableCell({ value, cellType, readOnly, options, onSave, onTab, onEnter, cellRef }: TableCellProps) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value)
  const [flash, setFlash] = useState<'success' | 'error' | null>(null)
  const inputRef = useRef<HTMLInputElement | HTMLSelectElement | null>(null)

  useEffect(() => { setDraft(value) }, [value])
  useEffect(() => {
    if (flash) {
      const t = setTimeout(() => setFlash(null), 600)
      return () => clearTimeout(t)
    }
  }, [flash])

  const handleSave = useCallback(async () => {
    setEditing(false)
    if (draft === value) return
    try {
      await onSave(draft)
      setFlash('success')
    } catch {
      setDraft(value)
      setFlash('error')
    }
  }, [draft, value, onSave])

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Tab') {
      e.preventDefault()
      handleSave()
      onTab?.(e.shiftKey)
    } else if (e.key === 'Enter') {
      e.preventDefault()
      handleSave()
      onEnter?.()
    } else if (e.key === 'Escape') {
      setDraft(value)
      setEditing(false)
    }
  }, [handleSave, onTab, onEnter, value])

  const flashClass = flash === 'success' ? styles.flashSuccess : flash === 'error' ? styles.flashError : ''
  const displayValue = cellType === 'dropdown' ? (options?.find(o => o.value === value)?.label ?? value) : value

  if (readOnly || !editing) {
    return (
      <td
        ref={cellRef}
        className={`${styles.cell} ${flashClass}`}
        onClick={readOnly ? undefined : () => setEditing(true)}
      >
        <span className={styles.cellText}>{displayValue}</span>
      </td>
    )
  }

  if (cellType === 'dropdown') {
    return (
      <td ref={cellRef} className={`${styles.cell} ${styles.cellEditing}`}>
        <select
          ref={el => { inputRef.current = el }}
          className={styles.cellInput}
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onBlur={handleSave}
          onKeyDown={handleKeyDown}
          autoFocus
        >
          <option value="">--</option>
          {options?.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      </td>
    )
  }

  return (
    <td ref={cellRef} className={`${styles.cell} ${styles.cellEditing}`}>
      <input
        ref={el => { inputRef.current = el }}
        className={styles.cellInput}
        type={cellType === 'number' ? 'number' : 'text'}
        value={draft}
        onChange={e => setDraft(e.target.value)}
        onBlur={handleSave}
        onKeyDown={handleKeyDown}
        autoFocus
      />
    </td>
  )
}
