import { useRef, useEffect, type KeyboardEvent } from 'react'
import { useOutsideClick } from '../hooks/useOutsideClick'
import styles from './AddParentPopover.module.css'

interface Props {
  onSubmit: (name: string) => void
  onCancel: () => void
}

export default function AddParentPopover({ onSubmit, onCancel }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  useOutsideClick(containerRef, onCancel, true)

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      const value = inputRef.current?.value ?? ''
      onSubmit(value)
    } else if (e.key === 'Escape') {
      onCancel()
    }
  }

  const handleAdd = () => {
    const value = inputRef.current?.value ?? ''
    onSubmit(value)
  }

  return (
    <div className={styles.backdrop}>
      <div className={styles.popover} ref={containerRef} role="dialog" aria-label="Add parent manager">
        <p className={styles.label}>New manager name</p>
        <div className={styles.row}>
          <input
            ref={inputRef}
            type="text"
            className={styles.input}
            placeholder="Manager name"
            onKeyDown={handleKeyDown}
            aria-label="Manager name"
          />
          <button className={styles.addBtn} onClick={handleAdd}>Add</button>
        </div>
      </div>
    </div>
  )
}
