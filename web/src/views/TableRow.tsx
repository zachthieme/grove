import { useCallback, useRef } from 'react'
import type { Person } from '../api/types'
import type { PersonChange } from '../hooks/useOrgDiff'
import type { ColumnDef } from './tableColumns'
import { getPersonValue } from './tableColumns'
import TableCell from './TableCell'
import { STATUSES } from '../constants'
import styles from './TableView.module.css'

interface TableRowProps {
  person: Person
  columns: ColumnDef[]
  managers: { value: string; label: string }[]
  change?: PersonChange
  readOnly?: boolean
  selected?: boolean
  onToggleSelect?: (personId: string) => void
  onUpdate: (personId: string, field: string, value: string) => Promise<void>
  onDelete: (personId: string) => void
}

function getDropdownOptions(key: string, managers: { value: string; label: string }[]): { value: string; label: string }[] | undefined {
  switch (key) {
    case 'status':
      return STATUSES.map(s => ({ value: s, label: s }))
    case 'managerId':
      return managers
    default:
      return undefined
  }
}

export default function TableRow({ person, columns, managers, change, readOnly, selected, onToggleSelect, onUpdate, onDelete }: TableRowProps) {
  const cellRefs = useRef<(HTMLTableCellElement | null)[]>([])

  const handleTab = useCallback((colIdx: number, shift: boolean) => {
    const next = shift ? colIdx - 1 : colIdx + 1
    if (next >= 0 && next < columns.length) {
      cellRefs.current[next]?.click()
    }
  }, [columns.length])

  const diffClass = change
    ? change.types.has('added') ? styles.rowAdded
    : change.types.has('removed') ? styles.rowRemoved
    : change.types.has('reporting') ? styles.rowReporting
    : change.types.has('title') ? styles.rowTitle
    : change.types.has('reorg') ? styles.rowReorg
    : change.types.has('pod') ? styles.rowPod
    : ''
    : ''

  return (
    <tr className={`${styles.row} ${diffClass} ${selected ? styles.rowSelected : ''}`}>
      <td className={styles.actionCell}>
        <input
          type="checkbox"
          className={styles.selectCheckbox}
          checked={!!selected}
          onChange={() => onToggleSelect?.(person.id)}
        />
      </td>
      {columns.map((col, i) => (
        <TableCell
          key={col.key}
          value={getPersonValue(person, col.key)}
          cellType={col.cellType}
          readOnly={readOnly}
          options={getDropdownOptions(col.key, managers)}
          onSave={async (v) => onUpdate(person.id, col.key, v)}
          onTab={(shift) => handleTab(i, shift)}
          cellRef={(el) => { cellRefs.current[i] = el }}
        />
      ))}
      <td className={styles.actionCell}>
        {!readOnly && (
          <button className={styles.deleteBtn} onClick={() => onDelete(person.id)} title="Delete">x</button>
        )}
      </td>
    </tr>
  )
}
