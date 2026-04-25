import styles from './NodeActions.module.css'

interface Props {
  showAdd: boolean
  showAddProduct?: boolean
  showAddParent?: boolean
  showInfo: boolean
  showFocus?: boolean
  showEdit?: boolean
  showDelete?: boolean
  onAdd: (e: React.MouseEvent) => void
  onAddProduct?: (e: React.MouseEvent) => void
  onAddParent?: (e: React.MouseEvent) => void
  onDelete: (e: React.MouseEvent) => void
  onEdit?: (e: React.MouseEvent) => void
  onInfo: (e: React.MouseEvent) => void
  onFocus?: (e: React.MouseEvent) => void
}

export default function NodeActions({ showAdd, showAddProduct, showAddParent, showInfo, showFocus, showEdit = true, showDelete = true, onAdd, onAddProduct, onAddParent, onDelete, onEdit, onInfo, onFocus }: Props) {
  return (
    <div className={styles.actions}>
      {showAddParent && onAddParent && (
        <button className={styles.btn} onClick={onAddParent} title="Add manager above" aria-label="Add manager above">{'↑+'}</button>
      )}
      {showFocus && onFocus && (
        <button className={styles.btn} onClick={onFocus} title="Focus on subtree" aria-label="Focus on subtree">{'⊙'}</button>
      )}
      {showAdd && (
        <button className={styles.btn} onClick={onAdd} title="Add direct report" aria-label="Add direct report">+</button>
      )}
      {showAddProduct && onAddProduct && (
        <button className={styles.btn} onClick={onAddProduct} title="Add product" aria-label="Add product">{'+◆'}</button>
      )}
      {showInfo && (
        <button className={styles.btn} onClick={onInfo} title="Org metrics" aria-label="Org metrics">{'ℹ'}</button>
      )}
      {showEdit && onEdit && (
        <button className={styles.btn} onClick={onEdit} title="Edit" aria-label="Edit">{'✎'}</button>
      )}
      {showDelete && (
        <button className={`${styles.btn} ${styles.danger}`} onClick={onDelete} title="Delete" aria-label="Delete">{'×'}</button>
      )}
    </div>
  )
}
