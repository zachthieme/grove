import { useRef } from 'react'
import { useOutsideClick } from '../hooks/useOutsideClick'
import styles from './DeleteConfirmPopover.module.css'

interface Props {
  personName: string
  reportCount: number
  onConfirm: () => void
  onCancel: () => void
}

export default function DeleteConfirmPopover({ personName, reportCount, onConfirm, onCancel }: Props) {
  const ref = useRef<HTMLDivElement>(null)
  useOutsideClick(ref, onCancel, true)

  return (
    <div className={styles.backdrop}>
      <div className={styles.popover} ref={ref} role="dialog" aria-label="Confirm delete">
        <p className={styles.message}>
          Delete <strong>{personName}</strong>?
          {reportCount > 0 && (
            <> Their {reportCount} direct report{reportCount > 1 ? 's' : ''} will become unparented.</>
          )}
        </p>
        <div className={styles.actions}>
          <button className={styles.cancelBtn} onClick={onCancel}>Cancel</button>
          <button className={styles.deleteBtn} onClick={onConfirm}>Delete</button>
        </div>
      </div>
    </div>
  )
}
