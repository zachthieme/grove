import type { ColumnDef } from './tableColumns'
import styles from './TableView.module.css'

type SortDir = 'asc' | 'desc' | null

interface TableHeaderProps {
  columns: ColumnDef[]
  sortKey: string | null
  sortDir: SortDir
  onSort: (key: string) => void
  filterActive: Set<string>
  onFilterClick: (key: string) => void
}

export default function TableHeader({ columns, sortKey, sortDir, onSort, filterActive, onFilterClick }: TableHeaderProps) {
  return (
    <tr>
      <th className={styles.headerCell} style={{ width: '32px' }} />
      {columns.map(col => (
        <th key={col.key} className={styles.headerCell} style={{ width: col.width, position: 'relative' }}>
          <div className={styles.headerContent}>
            <span className={styles.headerLabel} onClick={() => onSort(col.key)}>
              {col.label}
              {sortKey === col.key && (
                <span className={styles.sortArrow}>{sortDir === 'asc' ? ' \u25B2' : ' \u25BC'}</span>
              )}
            </span>
            <button
              className={`${styles.filterBtn} ${filterActive.has(col.key) ? styles.filterBtnActive : ''}`}
              onClick={(e) => { e.stopPropagation(); onFilterClick(col.key) }}
              title={`Filter ${col.label}`}
            >
              &#x25BC;
            </button>
          </div>
        </th>
      ))}
      <th className={styles.headerCell} style={{ width: '40px' }} />
    </tr>
  )
}
