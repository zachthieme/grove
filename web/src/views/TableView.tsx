import { useState, useMemo, useCallback, useRef, useEffect } from 'react'
import type { Person } from '../api/types'
import type { PersonChange } from '../hooks/useOrgDiff'
import { useOrg } from '../store/OrgContext'
import type { ColumnDef } from './tableColumns'
import { TABLE_COLUMNS, getPersonValue } from './tableColumns'
import { STATUSES } from '../constants'
import TableRow from './TableRow'
import TableHeader from './TableHeader'
import styles from './TableView.module.css'

interface DraftRow {
  id: string
  values: Record<string, string>
}

function draftToPerson(values: Record<string, string>): Omit<Person, 'id'> {
  return {
    name: values.name || '',
    role: values.role || '',
    discipline: values.discipline || '',
    team: values.team || '',
    managerId: values.managerId || '',
    status: (values.status || 'Active') as Person['status'],
    additionalTeams: values.additionalTeams ? values.additionalTeams.split(',').map(s => s.trim()).filter(Boolean) : [],
    employmentType: values.employmentType || 'FTE',
    level: values.level ? parseInt(values.level, 10) : undefined,
    pod: values.pod || '',
    publicNote: values.publicNote || '',
    privateNote: values.privateNote || '',
  }
}

interface TableViewProps {
  people: Person[]
  changes?: Map<string, PersonChange>
  readOnly?: boolean
}

export default function TableView({ people, changes, readOnly }: TableViewProps) {
  const { update, remove, toggleSelect, selectedIds, clearSelection, working, add } = useOrg()

  const [sortKey, setSortKey] = useState<string | null>(null)
  const [sortDir, setSortDir] = useState<'asc' | 'desc' | null>(null)
  const [hiddenCols, setHiddenCols] = useState<Set<string>>(new Set())
  const [showColToggle, setShowColToggle] = useState(false)
  const [columnFilters, setColumnFilters] = useState<Map<string, Set<string>>>(new Map())
  const [openFilter, setOpenFilter] = useState<string | null>(null)
  const [drafts, setDrafts] = useState<DraftRow[]>([])
  const newestDraftRef = useRef<HTMLTableRowElement>(null)

  const contextDefaults = useMemo(() => {
    const defaults: Record<string, string> = {}
    for (const [key, selected] of columnFilters) {
      if (selected.size === 1) {
        defaults[key] = Array.from(selected)[0]
      }
    }
    return defaults
  }, [columnFilters])

  const managers = useMemo(() => {
    const managerIds = new Set(working.filter(p => p.managerId).map(p => p.managerId))
    return working
      .filter(p => managerIds.has(p.id))
      .sort((a, b) => a.name.localeCompare(b.name))
      .map(p => ({ value: p.id, label: p.name }))
  }, [working])

  const handleUpdate = useCallback(async (personId: string, field: string, value: string) => {
    await update(personId, { [field]: value })
  }, [update])

  const handleDelete = useCallback(async (personId: string) => {
    await remove(personId)
  }, [remove])

  const handleSort = useCallback((key: string) => {
    if (sortKey === key) {
      if (sortDir === 'asc') setSortDir('desc')
      else if (sortDir === 'desc') { setSortKey(null); setSortDir(null) }
    } else {
      setSortKey(key)
      setSortDir('asc')
    }
  }, [sortKey, sortDir])

  const handleFilterClick = useCallback((key: string) => {
    if (openFilter === key) { setOpenFilter(null); return }
    if (!columnFilters.has(key)) {
      const allVals = new Set(people.map(p => getPersonValue(p, key)))
      setColumnFilters(prev => new Map(prev).set(key, allVals))
    }
    setOpenFilter(key)
  }, [openFilter, columnFilters, people])

  const [pendingFocusDraft, setPendingFocusDraft] = useState(false)

  const addDraftRow = useCallback(() => {
    const id = `draft-${Date.now()}`
    const values: Record<string, string> = {
      name: '', role: '', discipline: '', team: '', pod: '',
      managerId: '', status: 'Active', employmentType: 'FTE',
      level: '', publicNote: '', privateNote: '', additionalTeams: '',
      ...contextDefaults,
    }
    setDrafts(prev => [...prev, { id, values }])
    setPendingFocusDraft(true)
  }, [contextDefaults])

  useEffect(() => {
    if (pendingFocusDraft && newestDraftRef.current) {
      newestDraftRef.current.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
      const firstInput = newestDraftRef.current.querySelector('input:not([type="checkbox"])') as HTMLInputElement | null
      firstInput?.focus()
      setPendingFocusDraft(false)
    }
  }, [pendingFocusDraft, drafts])

  const saveDraft = useCallback(async (draftId: string) => {
    const draft = drafts.find(d => d.id === draftId)
    if (!draft || !draft.values.name) return
    try {
      await add(draftToPerson(draft.values))
      setDrafts(prev => prev.filter(d => d.id !== draftId))
    } catch {
      // Keep draft on error — user can retry
    }
  }, [drafts, add])

  const updateDraft = useCallback((draftId: string, field: string, value: string) => {
    setDrafts(prev => prev.map(d =>
      d.id === draftId ? { ...d, values: { ...d.values, [field]: value } } : d
    ))
  }, [])

  const discardDraft = useCallback((draftId: string) => {
    setDrafts(prev => prev.filter(d => d.id !== draftId))
  }, [])

  const visibleColumns = useMemo(() => TABLE_COLUMNS.filter(c => !hiddenCols.has(c.key)), [hiddenCols])

  const handlePaste = useCallback(async () => {
    try {
      const text = await navigator.clipboard.readText()
      const lines = text.split('\n').filter(l => l.trim())
      if (lines.length === 0) return

      // Auto-detect delimiter: tab (from spreadsheets) or comma
      const delimiter = lines[0].includes('\t') ? '\t' : ','

      // Detect header row: if first row's cells match known column labels/keys, skip it
      const headerLabels = new Set(TABLE_COLUMNS.flatMap(c => [c.key.toLowerCase(), c.label.toLowerCase()]))
      const firstCells = lines[0].split(delimiter).map(c => c.trim().toLowerCase())
      const isHeader = firstCells.length > 1 && firstCells.every(c => headerLabels.has(c))
      const dataLines = isHeader ? lines.slice(1) : lines

      // If header present, map columns by header names; otherwise use visible column order
      let colMapping: ColumnDef[]
      if (isHeader) {
        colMapping = firstCells.map(cell => {
          return TABLE_COLUMNS.find(c => c.key.toLowerCase() === cell || c.label.toLowerCase() === cell)!
        }).filter(Boolean)
      } else {
        colMapping = visibleColumns
      }

      let savedCount = 0
      for (const line of dataLines) {
        const cells = line.split(delimiter)
        const values: Record<string, string> = {
          name: '', role: '', discipline: '', team: '', pod: '',
          managerId: '', status: 'Active', employmentType: 'FTE',
          level: '', publicNote: '', privateNote: '', additionalTeams: '',
          ...contextDefaults,
        }
        cells.forEach((cell, j) => {
          if (j < colMapping.length) {
            values[colMapping[j].key] = cell.trim()
          }
        })
        if (values.name) {
          try {
            await add(draftToPerson(values))
            savedCount++
          } catch { /* skip failed rows */ }
        }
      }
      if (savedCount > 0) {
        console.log(`Pasted ${savedCount} rows`)
      }
    } catch {
      // Clipboard API may fail
    }
  }, [visibleColumns, contextDefaults, add])

  const sortedPeople = useMemo(() => {
    if (!sortKey || !sortDir) return people
    const sorted = [...people]
    sorted.sort((a, b) => {
      const aVal = getPersonValue(a, sortKey)
      const bVal = getPersonValue(b, sortKey)
      const cmp = aVal.localeCompare(bVal, undefined, { numeric: true })
      return sortDir === 'asc' ? cmp : -cmp
    })
    return sorted
  }, [people, sortKey, sortDir])

  const filterActive = useMemo(() => {
    const active = new Set<string>()
    for (const [key, selected] of columnFilters) {
      const allValues = new Set(people.map(p => getPersonValue(p, key)))
      if (selected.size < allValues.size) active.add(key)
    }
    return active
  }, [columnFilters, people])

  const filteredPeople = useMemo(() => {
    if (columnFilters.size === 0) return sortedPeople
    return sortedPeople.filter(person => {
      for (const [key, selected] of columnFilters) {
        const val = getPersonValue(person, key)
        if (!selected.has(val)) return false
      }
      return true
    })
  }, [sortedPeople, columnFilters])

  const allSelected = filteredPeople.length > 0 && filteredPeople.every(p => selectedIds.has(p.id))
  const someSelected = !allSelected && filteredPeople.some(p => selectedIds.has(p.id))

  const handleToggleAll = useCallback(() => {
    if (allSelected) {
      clearSelection()
    } else {
      filteredPeople.forEach(p => {
        if (!selectedIds.has(p.id)) toggleSelect(p.id, true)
      })
    }
  }, [allSelected, filteredPeople, selectedIds, toggleSelect, clearSelection])

  const handleRowSelect = useCallback((personId: string) => {
    toggleSelect(personId, true)
  }, [toggleSelect])

  return (
    <div className={styles.container}>
      <div className={styles.tableToolbar}>
        <span className={styles.rowCount}>{filteredPeople.length} people</span>
        {!readOnly && (
          <>
            <button className={styles.addBtn} onClick={addDraftRow} title="Add row">+</button>
            <button className={styles.addBtn} onClick={handlePaste} title="Paste rows from clipboard">Paste</button>
          </>
        )}
        <div className={styles.colToggleWrapper}>
          <button className={styles.colToggleBtn} onClick={() => setShowColToggle(v => !v)}>
            Columns &#x25BE;
          </button>
          {showColToggle && (
            <div className={styles.colToggleDropdown}>
              {TABLE_COLUMNS.map(col => (
                <label key={col.key} className={styles.colToggleItem}>
                  <input
                    type="checkbox"
                    checked={!hiddenCols.has(col.key)}
                    onChange={() => setHiddenCols(prev => {
                      const next = new Set(prev)
                      next.has(col.key) ? next.delete(col.key) : next.add(col.key)
                      return next
                    })}
                  />
                  {col.label}
                </label>
              ))}
            </div>
          )}
        </div>
      </div>
      <div className={styles.tableWrapper}>
        <table className={styles.table}>
          <thead>
            <TableHeader
              columns={visibleColumns}
              sortKey={sortKey}
              sortDir={sortDir}
              onSort={handleSort}
              filterActive={filterActive}
              onFilterClick={handleFilterClick}
              openFilter={openFilter}
              people={people}
              columnFilters={columnFilters}
              onFilterSelectionChange={(key, sel) => setColumnFilters(prev => new Map(prev).set(key, sel))}
              onFilterClose={() => setOpenFilter(null)}
              allSelected={allSelected}
              someSelected={someSelected}
              onToggleAll={handleToggleAll}
            />
          </thead>
          <tbody>
            {filteredPeople.map(person => (
              <TableRow
                key={person.id}
                person={person}
                columns={visibleColumns}
                managers={managers}
                change={changes?.get(person.id)}
                readOnly={readOnly}
                selected={selectedIds.has(person.id)}
                onToggleSelect={handleRowSelect}
                onUpdate={handleUpdate}
                onDelete={handleDelete}
              />
            ))}
            {drafts.map((draft, draftIdx) => (
              <tr key={draft.id} className={styles.rowDraft} ref={draftIdx === drafts.length - 1 ? newestDraftRef : undefined}>
                <td className={styles.actionCell} />
                {visibleColumns.map(col => (
                  <td key={col.key} className={`${styles.cell} ${styles.cellEditing}`}>
                    {col.cellType === 'dropdown' ? (
                      <select
                        className={styles.cellInput}
                        value={draft.values[col.key]}
                        onChange={e => updateDraft(draft.id, col.key, e.target.value)}
                        onBlur={() => saveDraft(draft.id)}
                      >
                        <option value="">--</option>
                        {col.key === 'status'
                          ? STATUSES.map(s => <option key={s} value={s}>{s}</option>)
                          : col.key === 'managerId'
                          ? managers.map(m => <option key={m.value} value={m.value}>{m.label}</option>)
                          : null
                        }
                      </select>
                    ) : (
                      <input
                        className={styles.cellInput}
                        type={col.cellType === 'number' ? 'number' : 'text'}
                        value={draft.values[col.key]}
                        onChange={e => updateDraft(draft.id, col.key, e.target.value)}
                        onBlur={() => saveDraft(draft.id)}
                        placeholder={col.label}
                      />
                    )}
                  </td>
                ))}
                <td className={styles.actionCell}>
                  <button className={styles.deleteBtn} onClick={() => discardDraft(draft.id)} title="Discard">x</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
