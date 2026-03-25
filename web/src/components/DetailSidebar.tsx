import { useState, useEffect, useMemo, useRef } from 'react'
import { useOrg } from '../store/OrgContext'
import type { Person } from '../api/types'
import styles from './DetailSidebar.module.css'
import { STATUSES, STATUS_DESCRIPTIONS } from '../constants'
import BatchEditSidebar from './BatchEditSidebar'
import PodSidebar from './PodSidebar'

interface FormFields {
  name: string
  role: string
  discipline: string
  team: string
  otherTeams: string
  managerId: string
  status: Person['status']
  employmentType: string
  level: string
  pod: string
  publicNote: string
  privateNote: string
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
  level: '0',
  pod: '',
  publicNote: '',
  privateNote: '',
}

function generateCorrelationId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`
}

export default function DetailSidebar() {
  const { working, selectedId, selectedIds, selectedPodId, setSelectedId, clearSelection, update, remove, reparent, pods } = useOrg()

  const [form, setForm] = useState<FormFields>(blankForm)
  const [showStatusInfo, setShowStatusInfo] = useState(false)
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const [saveError, setSaveError] = useState<string | null>(null)
  const saveTimerRef = useRef<number>(undefined)

  const person = selectedId ? working.find((p) => p.id === selectedId) : null

  const managers = useMemo(() => {
    const managerIds = new Set(working.filter((p) => p.managerId).map((p) => p.managerId))
    return working
      .filter((p) => managerIds.has(p.id))
      .sort((a, b) => a.name.localeCompare(b.name))
  }, [working])

  // Stable key that changes only when person data actually changes
  const personDataKey = person
    ? `${person.id}\0${person.name}\0${person.role}\0${person.discipline}\0${person.team}\0${person.managerId}\0${person.status}\0${person.employmentType ?? ''}\0${(person.additionalTeams ?? []).join(',')}\0${person.pod ?? ''}\0${person.publicNote ?? ''}\0${person.privateNote ?? ''}\0${person.level ?? 0}`
    : ''
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
        level: String(person.level ?? 0),
        pod: person.pod ?? '',
        publicNote: person.publicNote ?? '',
        privateNote: person.privateNote ?? '',
      })
    }
  }, [personDataKey]) // eslint-disable-line react-hooks/exhaustive-deps -- personDataKey encodes all person fields

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

  const handleClose = () => {
    clearSelection()
  }

  const handleSave = async () => {
    if (!person) return
    setSaveStatus('saving')
    setSaveError(null)
    const corrId = generateCorrelationId()
    try {
      const managerChanged = form.managerId !== person.managerId
      if (managerChanged) {
        await reparent(person.id, form.managerId, corrId)
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
      if (form.level !== String(person.level ?? 0)) fields.level = form.level
      if (form.pod !== (person.pod ?? '')) fields.pod = form.pod
      if (form.publicNote !== (person.publicNote ?? '')) fields.publicNote = form.publicNote
      if (form.privateNote !== (person.privateNote ?? '')) fields.privateNote = form.privateNote
      await update(person.id, fields, corrId)
      markSaved()
    } catch {
      setSaveStatus('error')
      setSaveError('Save failed')
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

  if (selectedIds.size > 1) {
    return <BatchEditSidebar />
  }

  // If a pod is selected (and no person), show PodSidebar
  if (selectedPodId && !selectedId) {
    return <PodSidebar />
  }

  if (!person) {
    return null
  }

  return (
    <div className={styles.sidebar}>
      <div className={styles.header}>
        <h3>Edit Person</h3>
        <button className={styles.closeBtn} onClick={handleClose} aria-label="Close">
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
          <label>Pod</label>
          <select
            value={form.pod}
            onChange={(e) => setForm(f => ({ ...f, pod: e.target.value }))}
          >
            <option value="">—</option>
            {pods
              .filter(p => p.managerId === person?.managerId)
              .map(p => (
                <option key={p.id} value={p.name}>{p.name}</option>
              ))
            }
          </select>
        </div>
        <div className={styles.field}>
          <label>
            Status
            <button
              className={styles.infoIcon}
              aria-label="Show status descriptions"
              onClick={() => setShowStatusInfo((v) => !v)}
            >
              &#8505;
            </button>
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
          <label>Level</label>
          <input
            type="number"
            min="0"
            value={form.level}
            onChange={(e) => setForm(f => ({ ...f, level: e.target.value }))}
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
        <div className={styles.field}>
          <label>Public Note</label>
          <textarea
            value={form.publicNote}
            onChange={(e) => setForm(f => ({ ...f, publicNote: e.target.value }))}
            rows={3}
            placeholder="Visible on the org chart"
          />
        </div>
        <div className={styles.field}>
          <label>Private Note</label>
          <textarea
            value={form.privateNote}
            onChange={(e) => setForm(f => ({ ...f, privateNote: e.target.value }))}
            rows={3}
            placeholder="Only visible in this panel"
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
