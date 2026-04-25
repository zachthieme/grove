import { useCallback, useRef } from 'react'
import type { OrgNode } from '../api/types'
import type { NodeChange } from '../hooks/useOrgDiff'
import type { ColumnDef } from './tableColumns'
import { getPersonValue } from './tableColumns'
import TableCell from './TableCell'
import { STATUSES, NODE_TYPE_PERSON, NODE_TYPE_PRODUCT } from '../constants'
import styles from './TableView.module.css'

interface TableRowProps {
  person: OrgNode
  columns: ColumnDef[]
  managers: { value: string; label: string }[]
  change?: NodeChange
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
    case 'type':
      return [
        { value: NODE_TYPE_PERSON, label: 'Person' },
        { value: NODE_TYPE_PRODUCT, label: 'Product' },
      ]
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
          aria-label={`Select ${person.name}`}
        />
      </td>
      {columns.map((col, i) => (
        <TableCell
          key={col.key}
          value={getPersonValue(person, col.key)}
          cellType={col.cellType}
          readOnly={readOnly || col.key.startsWith('extra:')}
          options={getDropdownOptions(col.key, managers)}
          onSave={async (v) => onUpdate(person.id, col.key, v)}
          onTab={(shift) => handleTab(i, shift)}
          cellRef={(el) => { cellRefs.current[i] = el }}
          ariaLabel={col.cellType === 'checkbox' ? `${col.label} for ${person.name}` : undefined}
        />
      ))}
      <td className={styles.actionCell}>
        {!readOnly && (
          <button className={styles.deleteBtn} onClick={() => onDelete(person.id)} title="Delete" aria-label="Delete">x</button>
        )}
      </td>
    </tr>
  )
}
