import { useRef, useCallback } from 'react'
import type { ColumnDef } from './tableColumns'
import type { Person } from '../api/types'
import TableFilterDropdown from './TableFilterDropdown'
import { getPersonValue } from './tableColumns'
import styles from './TableView.module.css'

type SortDir = 'asc' | 'desc' | null

interface TableHeaderProps {
  columns: ColumnDef[]
  sortKey: string | null
  sortDir: SortDir
  onSort: (key: string) => void
  filterActive: Set<string>
  onFilterClick: (key: string) => void
  openFilter: string | null
  people: Person[]
  columnFilters: Map<string, Set<string>>
  onFilterSelectionChange: (key: string, selected: Set<string>) => void
  onFilterClose: () => void
  allSelected: boolean
  someSelected: boolean
  onToggleAll: () => void
}

export default function TableHeader({ columns, sortKey, sortDir, onSort, filterActive, onFilterClick, openFilter, people, columnFilters, onFilterSelectionChange, onFilterClose, allSelected, someSelected, onToggleAll }: TableHeaderProps) {
  const filterBtnRefs = useRef<Map<string, HTMLButtonElement | null>>(new Map())
  const selectAllRef = useCallback((el: HTMLInputElement | null) => {
    if (el) el.indeterminate = someSelected && !allSelected
  }, [someSelected, allSelected])

  const setFilterBtnRef = useCallback((key: string, el: HTMLButtonElement | null) => {
    filterBtnRefs.current.set(key, el)
  }, [])

  const getAnchorRef = useCallback((key: string) => {
    return { current: filterBtnRefs.current.get(key) ?? null }
  }, [])

  return (
    <tr>
      <th className={styles.headerCell} style={{ width: '32px' }}>
        <input
          ref={selectAllRef}
          type="checkbox"
          className={styles.selectCheckbox}
          checked={allSelected}
          onChange={onToggleAll}
          title="Select all"
        />
      </th>
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
              ref={(el) => setFilterBtnRef(col.key, el)}
              className={`${styles.filterBtn} ${filterActive.has(col.key) ? styles.filterBtnActive : ''}`}
              onClick={(e) => { e.stopPropagation(); onFilterClick(col.key) }}
              title={`Filter ${col.label}`}
            >
              &#x25BC;
            </button>
          </div>
          {openFilter === col.key && (
            <TableFilterDropdown
              columnKey={col.key}
              values={people.map(p => getPersonValue(p, col.key))}
              selected={columnFilters.get(col.key) ?? new Set()}
              onSelectionChange={onFilterSelectionChange}
              onClose={onFilterClose}
              anchorRef={getAnchorRef(col.key)}
            />
          )}
        </th>
      ))}
      <th className={styles.headerCell} style={{ width: '40px' }} />
    </tr>
  )
}
