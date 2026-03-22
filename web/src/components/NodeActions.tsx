import styles from './NodeActions.module.css'

interface Props {
  showAdd: boolean
  showInfo: boolean
  onAdd: (e: React.MouseEvent) => void
  onDelete: (e: React.MouseEvent) => void
  onEdit: (e: React.MouseEvent) => void
  onInfo: (e: React.MouseEvent) => void
}

export default function NodeActions({ showAdd, showInfo, onAdd, onDelete, onEdit, onInfo }: Props) {
  return (
    <div className={styles.actions}>
      {showAdd && (
        <button className={styles.btn} onClick={onAdd} title="Add direct report">+</button>
      )}
      {showInfo && (
        <button className={styles.btn} onClick={onInfo} title="Org metrics">{'\u2139'}</button>
      )}
      <button className={styles.btn} onClick={onEdit} title="Edit">✎</button>
      <button className={`${styles.btn} ${styles.danger}`} onClick={onDelete} title="Delete">×</button>
    </div>
  )
}
