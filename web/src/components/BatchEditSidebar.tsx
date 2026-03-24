import { useState, useEffect, useMemo, useRef } from 'react'
import { useOrg } from '../store/OrgContext'
import styles from './DetailSidebar.module.css'
import { STATUSES, MIXED_VALUE } from '../constants'

interface BatchFormFields {
  role: string
  discipline: string
  team: string
  managerId: string
  status: string
  employmentType: string
}

function computeBatchDefaults(people: ReturnType<typeof useOrg>['working']): BatchFormFields {
  if (people.length === 0) {
    return { role: '', discipline: '', team: '', managerId: '', status: 'Active', employmentType: 'FTE' }
  }
  const first = people[0]
  return {
    role: people.every((p) => p.role === first.role) ? first.role : MIXED_VALUE,
    discipline: people.every((p) => p.discipline === first.discipline) ? first.discipline : MIXED_VALUE,
    team: people.every((p) => p.team === first.team) ? first.team : MIXED_VALUE,
    managerId: people.every((p) => p.managerId === first.managerId) ? first.managerId : MIXED_VALUE,
    status: people.every((p) => p.status === first.status) ? first.status : MIXED_VALUE,
    employmentType: people.every((p) => (p.employmentType || 'FTE') === (first.employmentType || 'FTE')) ? (first.employmentType || 'FTE') : MIXED_VALUE,
  }
}

export default function BatchEditSidebar() {
  const { working, selectedIds, clearSelection, update, reparent } = useOrg()

  const selectedPeople = useMemo(
    () => working.filter((p) => selectedIds.has(p.id)),
    [working, selectedIds],
  )

  const managers = useMemo(() => {
    const managerIds = new Set(working.filter((p) => p.managerId).map((p) => p.managerId))
    return working
      .filter((p) => managerIds.has(p.id))
      .sort((a, b) => a.name.localeCompare(b.name))
  }, [working])

  const [batchForm, setBatchForm] = useState<BatchFormFields>({
    role: '', discipline: '', team: '', managerId: '', status: 'Active', employmentType: 'FTE',
  })
  const [batchDirty, setBatchDirty] = useState<Set<string>>(new Set())
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const [saveError, setSaveError] = useState<string | null>(null)
  const saveTimerRef = useRef<number>(undefined)

  // Sync form when selection changes
  useEffect(() => {
    setBatchForm(computeBatchDefaults(selectedPeople))
    setBatchDirty(new Set())
  }, [selectedIds.size]) // eslint-disable-line react-hooks/exhaustive-deps

  // Cleanup save timer on unmount
  useEffect(() => {
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    }
  }, [])

  const markSaved = () => {
    setSaveStatus('saved')
    setSaveError(null)
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    saveTimerRef.current = window.setTimeout(() => setSaveStatus('idle'), 1500)
  }

  const handleBatchChange = (field: keyof BatchFormFields, value: string) => {
    if (field === 'managerId') {
      const newManager = working.find((p) => p.id === value)
      if (newManager) {
        setBatchForm((f) => ({ ...f, managerId: value, team: newManager.team }))
        setBatchDirty((d) => { const n = new Set(d); n.add('managerId'); n.add('team'); return n })
        return
      }
    }
    setBatchForm((f) => ({ ...f, [field]: value }))
    setBatchDirty((d) => new Set(d).add(field))
  }

  const handleBatchSave = async () => {
    if (batchDirty.size === 0) return
    const managerChanged = batchDirty.has('managerId') && batchForm.managerId !== MIXED_VALUE
    const fields: Record<string, string> = {}
    for (const key of batchDirty) {
      if (managerChanged && (key === 'managerId' || key === 'team')) continue
      const val = batchForm[key as keyof BatchFormFields]
      if (val !== MIXED_VALUE) {
        fields[key] = val
      }
    }
    setSaveStatus('saving')
    setSaveError(null)
    let failedCount = 0

    if (managerChanged) {
      for (const p of selectedPeople) {
        try {
          await reparent(p.id, batchForm.managerId)
        } catch {
          failedCount++
        }
      }
    }
    if (Object.keys(fields).length > 0) {
      for (const p of selectedPeople) {
        try {
          await update(p.id, fields)
        } catch {
          failedCount++
        }
      }
    }

    if (failedCount > 0) {
      setSaveStatus('error')
      setSaveError(`${failedCount} of ${selectedPeople.length} updates failed`)
    } else {
      markSaved()
    }
  }

  return (
    <div className={styles.sidebar}>
      <div className={styles.header}>
        <h3>Edit {selectedIds.size} people</h3>
        <button className={styles.closeBtn} onClick={clearSelection} aria-label="Close">
          &times;
        </button>
      </div>
      <div className={styles.form}>
        <div className={styles.field}>
          <label>Role</label>
          <input
            value={batchForm.role === MIXED_VALUE ? '' : batchForm.role}
            placeholder={batchForm.role === MIXED_VALUE ? 'Mixed' : ''}
            onChange={(e) => handleBatchChange('role', e.target.value)}
          />
        </div>
        <div className={styles.field}>
          <label>Discipline</label>
          <input
            value={batchForm.discipline === MIXED_VALUE ? '' : batchForm.discipline}
            placeholder={batchForm.discipline === MIXED_VALUE ? 'Mixed' : ''}
            onChange={(e) => handleBatchChange('discipline', e.target.value)}
          />
        </div>
        <div className={styles.field}>
          <label>Team</label>
          <input
            value={batchForm.team === MIXED_VALUE ? '' : batchForm.team}
            placeholder={batchForm.team === MIXED_VALUE ? 'Mixed' : ''}
            onChange={(e) => handleBatchChange('team', e.target.value)}
          />
        </div>
        <div className={styles.field}>
          <label>Manager</label>
          <select
            value={batchForm.managerId === MIXED_VALUE ? '' : batchForm.managerId}
            onChange={(e) => handleBatchChange('managerId', e.target.value)}
          >
            {batchForm.managerId === MIXED_VALUE && <option value="">Mixed</option>}
            <option value="">(No manager)</option>
            {managers.map((m) => (
              <option key={m.id} value={m.id}>{m.name} — {m.team}</option>
            ))}
          </select>
        </div>
        <div className={styles.field}>
          <label>Status</label>
          <select
            value={batchForm.status === MIXED_VALUE ? '' : batchForm.status}
            onChange={(e) => handleBatchChange('status', e.target.value)}
          >
            {batchForm.status === MIXED_VALUE && <option value="">Mixed</option>}
            {STATUSES.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </div>
        <div className={styles.field}>
          <label>Employment Type</label>
          <input
            value={batchForm.employmentType === MIXED_VALUE ? '' : batchForm.employmentType}
            placeholder={batchForm.employmentType === MIXED_VALUE ? 'Mixed' : 'FTE'}
            onChange={(e) => handleBatchChange('employmentType', e.target.value)}
          />
        </div>
        {saveError && (
          <div className={styles.saveError}>{saveError}</div>
        )}
        <div className={styles.actions}>
          <button
            className={styles.saveBtn}
            onClick={handleBatchSave}
            disabled={batchDirty.size === 0 || saveStatus === 'saving'}
          >
            {saveStatus === 'saving' ? 'Saving...' : saveStatus === 'saved' ? 'Saved!' : saveStatus === 'error' ? 'Retry' : 'Save'}
          </button>
          <button className={styles.deleteBtn} onClick={clearSelection}>
            Clear selection
          </button>
        </div>
      </div>
    </div>
  )
}
