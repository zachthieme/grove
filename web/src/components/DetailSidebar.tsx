import { useState, useEffect, useMemo, useRef } from 'react'
import { useOrg } from '../store/OrgContext'
import { isManager } from '../hooks/useIsManager'
import type { Person } from '../api/types'
import styles from './DetailSidebar.module.css'

const STATUSES: Person['status'][] = [
  'Active', 'Open', 'Pending Open', 'Transfer In', 'Transfer Out', 'Backfill', 'Planned',
]

const STATUS_DESCRIPTIONS: Record<string, string> = {
  'Active': 'Currently filled and working',
  'Open': 'Approved headcount, actively recruiting',
  'Pending Open': 'Headcount requested, not yet approved',
  'Transfer In': 'Person coming from another team/org',
  'Transfer Out': 'Person leaving to another team/org',
  'Backfill': 'Replacing someone who left',
  'Planned': 'Future role in a reorg, not yet active',
}

interface FormFields {
  name: string
  role: string
  discipline: string
  team: string
  otherTeams: string
  managerId: string
  status: Person['status']
  employmentType: string
}

const blankForm: FormFields = {
  name: '',
  role: '',
  discipline: '',
  team: '',
  otherTeams: '',
  managerId: '',
  status: 'Active',
  employmentType: 'FTE',
}

// Batch form: fields that can be edited in batch mode (everything except name)
interface BatchFormFields {
  role: string
  discipline: string
  team: string
  managerId: string
  status: string
  employmentType: string
}

const MIXED = '__mixed__'

function computeBatchDefaults(people: Person[]): BatchFormFields {
  if (people.length === 0) {
    return { role: '', discipline: '', team: '', managerId: '', status: 'Active', employmentType: 'FTE' }
  }
  const first = people[0]
  return {
    role: people.every((p) => p.role === first.role) ? first.role : MIXED,
    discipline: people.every((p) => p.discipline === first.discipline) ? first.discipline : MIXED,
    team: people.every((p) => p.team === first.team) ? first.team : MIXED,
    managerId: people.every((p) => p.managerId === first.managerId) ? first.managerId : MIXED,
    status: people.every((p) => p.status === first.status) ? first.status : MIXED,
    employmentType: people.every((p) => (p.employmentType || 'FTE') === (first.employmentType || 'FTE')) ? (first.employmentType || 'FTE') : MIXED,
  }
}

export default function DetailSidebar() {
  const { working, selectedId, selectedIds, setSelectedId, clearSelection, update, remove, reparent } = useOrg()
  const [form, setForm] = useState<FormFields>(blankForm)
  const [batchForm, setBatchForm] = useState<BatchFormFields>({ role: '', discipline: '', team: '', managerId: '', status: 'Active', employmentType: 'FTE' })
  const [batchDirty, setBatchDirty] = useState<Set<string>>(new Set())
  const [showStatusInfo, setShowStatusInfo] = useState(false)

  const isBatch = selectedIds.size > 1
  const person = selectedId ? working.find((p) => p.id === selectedId) : null

  const selectedPeople = useMemo(() => {
    if (!isBatch) return []
    return working.filter((p) => selectedIds.has(p.id))
  }, [working, selectedIds, isBatch])

  const managers = useMemo(() => {
    return working
      .filter((p) => isManager(p, working))
      .sort((a, b) => a.name.localeCompare(b.name))
  }, [working])

  // Single-person form sync — re-run when person data changes (not just ID)
  const personJson = person ? JSON.stringify([person.name, person.role, person.discipline, person.team, person.managerId, person.status, person.employmentType, person.additionalTeams]) : ''
  useEffect(() => {
    if (person) {
      setForm({
        name: person.name,
        role: person.role,
        discipline: person.discipline,
        team: person.team,
        otherTeams: (person.additionalTeams || []).join(', '),
        managerId: person.managerId,
        status: person.status,
        employmentType: person.employmentType || 'FTE',
      })
    }
  }, [personJson]) // eslint-disable-line react-hooks/exhaustive-deps

  // Batch form sync
  useEffect(() => {
    if (isBatch) {
      setBatchForm(computeBatchDefaults(selectedPeople))
      setBatchDirty(new Set())
    }
  }, [isBatch, selectedIds.size]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleChange = (field: keyof FormFields, value: string) => {
    if (field === 'managerId') {
      // Auto-update team to match new manager's team
      const newManager = working.find((p) => p.id === value)
      if (newManager) {
        setForm((f) => ({ ...f, managerId: value, team: newManager.team }))
        return
      }
    }
    setForm((f) => ({ ...f, [field]: value }))
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

  const handleClose = () => {
    clearSelection()
  }

  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const [saveError, setSaveError] = useState<string | null>(null)
  const saveTimerRef = useRef<number>(undefined)

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

  const handleSave = async () => {
    if (!person) return
    setSaveStatus('saving')
    setSaveError(null)
    try {
      const managerChanged = form.managerId !== person.managerId
      if (managerChanged) {
        await reparent(person.id, form.managerId)
      }
      const fields: Record<string, string> = {
        name: form.name,
        role: form.role,
        discipline: form.discipline,
        status: form.status,
        employmentType: form.employmentType,
        additionalTeams: form.otherTeams,
      }
      if (!managerChanged) {
        fields.team = form.team
        fields.managerId = form.managerId
      }
      await update(person.id, fields)
      markSaved()
    } catch {
      setSaveStatus('error')
      setSaveError('Save failed')
    }
  }

  const handleBatchSave = async () => {
    if (batchDirty.size === 0) return
    const managerChanged = batchDirty.has('managerId') && batchForm.managerId !== MIXED
    const fields: Record<string, string> = {}
    for (const key of batchDirty) {
      if (managerChanged && (key === 'managerId' || key === 'team')) continue
      const val = batchForm[key as keyof BatchFormFields]
      if (val !== MIXED) {
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
      const results = await Promise.allSettled(
        selectedPeople.map((p) => update(p.id, fields))
      )
      failedCount += results.filter((r) => r.status === 'rejected').length
    }

    if (failedCount > 0) {
      setSaveStatus('error')
      setSaveError(`${failedCount} of ${selectedPeople.length} updates failed`)
    } else {
      markSaved()
    }
  }

  const handleDelete = async () => {
    if (!person) return
    try {
      await remove(person.id)
      setSelectedId(null)
    } catch {
      // Error surfaced via OrgContext.error
    }
  }

  // Batch edit UI
  if (isBatch) {
    return (
      <div className={styles.sidebar}>
        <div className={styles.header}>
          <h3>Edit {selectedIds.size} people</h3>
          <button className={styles.closeBtn} onClick={handleClose}>
            &times;
          </button>
        </div>
        <div className={styles.form}>
          <div className={styles.field}>
            <label>Role</label>
            <input
              value={batchForm.role === MIXED ? '' : batchForm.role}
              placeholder={batchForm.role === MIXED ? 'Mixed' : ''}
              onChange={(e) => handleBatchChange('role', e.target.value)}
            />
          </div>
          <div className={styles.field}>
            <label>Discipline</label>
            <input
              value={batchForm.discipline === MIXED ? '' : batchForm.discipline}
              placeholder={batchForm.discipline === MIXED ? 'Mixed' : ''}
              onChange={(e) => handleBatchChange('discipline', e.target.value)}
            />
          </div>
          <div className={styles.field}>
            <label>Team</label>
            <input
              value={batchForm.team === MIXED ? '' : batchForm.team}
              placeholder={batchForm.team === MIXED ? 'Mixed' : ''}
              onChange={(e) => handleBatchChange('team', e.target.value)}
            />
          </div>
          <div className={styles.field}>
            <label>Manager</label>
            <select
              value={batchForm.managerId === MIXED ? '' : batchForm.managerId}
              onChange={(e) => handleBatchChange('managerId', e.target.value)}
            >
              {batchForm.managerId === MIXED && <option value="">Mixed</option>}
              <option value="">(No manager)</option>
              {managers.map((m) => (
                <option key={m.id} value={m.id}>{m.name} — {m.team}</option>
              ))}
            </select>
          </div>
          <div className={styles.field}>
            <label>Status</label>
            <select
              value={batchForm.status === MIXED ? '' : batchForm.status}
              onChange={(e) => handleBatchChange('status', e.target.value)}
            >
              {batchForm.status === MIXED && <option value="">Mixed</option>}
              {STATUSES.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>
          <div className={styles.field}>
            <label>Employment Type</label>
            <input
              value={batchForm.employmentType === MIXED ? '' : batchForm.employmentType}
              placeholder={batchForm.employmentType === MIXED ? 'Mixed' : 'FTE'}
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
            <button className={styles.deleteBtn} onClick={handleClose}>
              Clear selection
            </button>
          </div>
        </div>
      </div>
    )
  }

  // Single-person edit
  if (!person) {
    return null
  }

  return (
    <div className={styles.sidebar}>
      <div className={styles.header}>
        <h3>Edit Person</h3>
        <button className={styles.closeBtn} onClick={handleClose}>
          &times;
        </button>
      </div>
      <div className={styles.form}>
        <div className={styles.field}>
          <label>Name</label>
          <input
            value={form.name}
            onChange={(e) => handleChange('name', e.target.value)}
          />
        </div>
        <div className={styles.field}>
          <label>Role</label>
          <input
            value={form.role}
            onChange={(e) => handleChange('role', e.target.value)}
          />
        </div>
        <div className={styles.field}>
          <label>Discipline</label>
          <input
            value={form.discipline}
            onChange={(e) => handleChange('discipline', e.target.value)}
          />
        </div>
        <div className={styles.field}>
          <label>Team</label>
          <input
            value={form.team}
            onChange={(e) => handleChange('team', e.target.value)}
          />
        </div>
        <div className={styles.field}>
          <label>Manager</label>
          <select
            value={form.managerId}
            onChange={(e) => handleChange('managerId', e.target.value)}
          >
            <option value="">(No manager)</option>
            {managers.map((m) => (
              <option key={m.id} value={m.id}>{m.name} — {m.team}</option>
            ))}
          </select>
        </div>
        <div className={styles.field}>
          <label>
            Status
            <span
              className={styles.infoIcon}
              onClick={() => setShowStatusInfo((v) => !v)}
            >
              &#8505;
            </span>
          </label>
          {showStatusInfo && (
            <div className={styles.infoOverlay} onMouseDown={() => setShowStatusInfo(false)}>
              <div className={styles.infoPop} onMouseDown={(e) => e.stopPropagation()}>
                <div className={styles.infoHeader}>
                  <span>Status Types</span>
                  <button className={styles.infoClose} onClick={() => setShowStatusInfo(false)}>×</button>
                </div>
                {STATUSES.map((s) => (
                  <div key={s} className={styles.infoRow}>
                    <strong>{s}</strong> — {STATUS_DESCRIPTIONS[s]}
                  </div>
                ))}
              </div>
            </div>
          )}
          <select
            value={form.status}
            onChange={(e) => handleChange('status', e.target.value)}
          >
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>
        <div className={styles.field}>
          <label>Employment Type</label>
          <input
            value={form.employmentType}
            onChange={(e) => handleChange('employmentType', e.target.value)}
            placeholder="FTE"
          />
        </div>
        <div className={styles.field}>
          <label>Other Teams</label>
          <input
            value={form.otherTeams}
            onChange={(e) => handleChange('otherTeams', e.target.value)}
            placeholder="Comma-separated (creates dotted lines)"
          />
        </div>
        {saveError && (
          <div className={styles.saveError}>{saveError}</div>
        )}
        <div className={styles.actions}>
          <button className={styles.saveBtn} onClick={handleSave} disabled={saveStatus === 'saving'}>
            {saveStatus === 'saving' ? 'Saving...' : saveStatus === 'saved' ? 'Saved!' : saveStatus === 'error' ? 'Retry' : 'Save'}
          </button>
          <button className={styles.deleteBtn} onClick={handleDelete}>
            Delete
          </button>
        </div>
      </div>
    </div>
  )
}
