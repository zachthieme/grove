import { useCallback, useRef } from 'react'
import type { Person, Pod } from '../api/types'
import type { PersonChange } from '../hooks/useOrgDiff'
import type { ColumnDef } from './tableColumns'
import { getPersonValue } from './tableColumns'
import TableCell from './TableCell'
import { STATUSES } from '../constants'
import styles from './TableView.module.css'

interface TableRowProps {
  person: Person
  columns: ColumnDef[]
  pods: Pod[]
  managers: { value: string; label: string }[]
  change?: PersonChange
  readOnly?: boolean
  onUpdate: (personId: string, field: string, value: string) => Promise<void>
  onDelete: (personId: string) => void
  onExpand: (personId: string) => void
}

function getDropdownOptions(key: string, person: Person, pods: Pod[], managers: { value: string; label: string }[]): { value: string; label: string }[] | undefined {
  switch (key) {
    case 'status':
      return STATUSES.map(s => ({ value: s, label: s }))
    case 'managerId':
      return managers
    case 'pod':
      return pods
        .filter(p => p.managerId === person.managerId)
        .map(p => ({ value: p.name, label: p.name }))
    default:
      return undefined
  }
}

export default function TableRow({ person, columns, pods, managers, change, readOnly, onUpdate, onDelete, onExpand }: TableRowProps) {
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
    <tr className={`${styles.row} ${diffClass}`}>
      <td className={styles.actionCell}>
        <button className={styles.expandBtn} onClick={() => onExpand(person.id)} title="Open in sidebar">&#x2922;</button>
      </td>
      {columns.map((col, i) => (
        <TableCell
          key={col.key}
          value={getPersonValue(person, col.key)}
          cellType={col.cellType}
          readOnly={readOnly}
          options={getDropdownOptions(col.key, person, pods, managers)}
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
