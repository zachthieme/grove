import { useState, useMemo, useRef, useEffect } from 'react'
import styles from './TableView.module.css'

interface TableFilterDropdownProps {
  columnKey: string
  values: string[]
  selected: Set<string>
  onSelectionChange: (columnKey: string, selected: Set<string>) => void
  onClose: () => void
}

export default function TableFilterDropdown({ columnKey, values, selected, onSelectionChange, onClose }: TableFilterDropdownProps) {
  const [search, setSearch] = useState('')
  const ref = useRef<HTMLDivElement>(null)

  const uniqueValues = useMemo(() =>
    Array.from(new Set(values)).sort((a, b) => a.localeCompare(b)),
    [values]
  )

  const filtered = useMemo(() =>
    search ? uniqueValues.filter(v => v.toLowerCase().includes(search.toLowerCase())) : uniqueValues,
    [uniqueValues, search]
  )

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [onClose])

  const allSelected = filtered.length > 0 && filtered.every(v => selected.has(v))

  const toggleAll = () => {
    const next = new Set(selected)
    if (allSelected) {
      filtered.forEach(v => next.delete(v))
    } else {
      filtered.forEach(v => next.add(v))
    }
    onSelectionChange(columnKey, next)
  }

  const toggleOne = (value: string) => {
    const next = new Set(selected)
    next.has(value) ? next.delete(value) : next.add(value)
    onSelectionChange(columnKey, next)
  }

  return (
    <div ref={ref} className={styles.filterDropdown}>
      <input
        className={styles.filterSearch}
        type="text"
        placeholder="Search..."
        value={search}
        onChange={e => setSearch(e.target.value)}
        autoFocus
      />
      <label className={styles.filterItem}>
        <input type="checkbox" checked={allSelected} onChange={toggleAll} />
        <strong>(Select All)</strong>
      </label>
      <div className={styles.filterList}>
        {filtered.map(v => (
          <label key={v || '__empty__'} className={styles.filterItem}>
            <input type="checkbox" checked={selected.has(v)} onChange={() => toggleOne(v)} />
            {v || <em>(empty)</em>}
          </label>
        ))}
      </div>
    </div>
  )
}
