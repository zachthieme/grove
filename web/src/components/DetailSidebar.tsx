import { useState, useEffect, useMemo } from 'react'
import { useOrg, useUI } from '../store/OrgContext'
import { useSaveStatus } from '../hooks/useSaveStatus'
import type { Person, PersonUpdatePayload } from '../api/types'
import { generateCorrelationId } from '../api/client'
import styles from './DetailSidebar.module.css'
import { STATUSES, STATUS_DESCRIPTIONS, MIXED_VALUE } from '../constants'
import PodSidebar from './PodSidebar'

interface FormFields {
  name: string
  role: string
  discipline: string
  team: string
  otherTeams: string
  managerId: string
  status: string
  employmentType: string
  level: string
  pod: string
  publicNote: string
  privateNote: string
  private: boolean
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
  private: false,
}

function formFromPerson(p: Person): FormFields {
  return {
    name: p.name,
    role: p.role,
    discipline: p.discipline,
    team: p.team,
    otherTeams: (p.additionalTeams || []).join(', '),
    managerId: p.managerId,
    status: p.status,
    employmentType: p.employmentType || 'FTE',
    level: String(p.level ?? 0),
    pod: p.pod ?? '',
    publicNote: p.publicNote ?? '',
    privateNote: p.privateNote ?? '',
    private: p.private ?? false,
  }
}

function formFromBatch(people: Person[]): FormFields {
  if (people.length === 0) return blankForm
  const first = people[0]
  const teamsStr = (p: Person) => (p.additionalTeams || []).join(', ')
  const m = (test: (p: Person) => boolean, val: string) => people.every(test) ? val : MIXED_VALUE
  return {
    name: '', // not editable in batch
    role: m(p => p.role === first.role, first.role),
    discipline: m(p => p.discipline === first.discipline, first.discipline),
    team: m(p => p.team === first.team, first.team),
    otherTeams: m(p => teamsStr(p) === teamsStr(first), teamsStr(first)),
    managerId: m(p => p.managerId === first.managerId, first.managerId),
    status: m(p => p.status === first.status, first.status),
    employmentType: m(p => (p.employmentType || 'FTE') === (first.employmentType || 'FTE'), first.employmentType || 'FTE'),
    level: m(p => (p.level ?? 0) === (first.level ?? 0), String(first.level ?? 0)),
    pod: m(p => (p.pod ?? '') === (first.pod ?? ''), first.pod ?? ''),
    publicNote: m(p => (p.publicNote ?? '') === (first.publicNote ?? ''), first.publicNote ?? ''),
    privateNote: m(p => (p.privateNote ?? '') === (first.privateNote ?? ''), first.privateNote ?? ''),
    private: people.every(p => (p.private ?? false) === (first.private ?? false)) ? (first.private ?? false) : false,
  }
}

export default function DetailSidebar() {
  const { working, selectedId, selectedIds, selectedPodId, setSelectedId, clearSelection, update, remove, reparent } = useOrg()

  const isBatch = selectedIds.size > 1
  const person = selectedId ? working.find((p) => p.id === selectedId) : null
  const selectedPeople = useMemo(
    () => isBatch ? working.filter((p) => selectedIds.has(p.id)) : [],
    [working, selectedIds, isBatch],
  )

  const [form, setForm] = useState<FormFields>(blankForm)
  const [batchDirty, setBatchDirty] = useState<Set<string>>(new Set())
  const [showStatusInfo, setShowStatusInfo] = useState(false)
  const { saveStatus, saveError, markSaving, markSaved, markError } = useSaveStatus()

  const { showPrivate } = useUI()

  const managers = useMemo(() => {
    const managerIds = new Set(working.filter((p) => p.managerId).map((p) => p.managerId))
    let mgrs = working.filter((p) => managerIds.has(p.id))
    if (!showPrivate) {
      mgrs = mgrs.filter((p) => !p.private)
    }
    return mgrs.sort((a, b) => a.name.localeCompare(b.name))
  }, [working, showPrivate])

  // Sync form when selection changes
  const personDataKey = person
    ? `${person.id}\0${person.name}\0${person.role}\0${person.discipline}\0${person.team}\0${person.managerId}\0${person.status}\0${person.employmentType ?? ''}\0${(person.additionalTeams ?? []).join(',')}\0${person.pod ?? ''}\0${person.publicNote ?? ''}\0${person.privateNote ?? ''}\0${person.level ?? 0}\0${person.private ?? false}`
    : ''

  useEffect(() => {
    if (isBatch) {
      setForm(formFromBatch(selectedPeople))
      setBatchDirty(new Set())
    } else if (person) {
      setForm(formFromPerson(person))
    }
  }, [isBatch ? selectedIds.size : personDataKey])

  const handleChange = (field: keyof FormFields, value: string) => {
    if (field === 'managerId') {
      const newManager = working.find((p) => p.id === value)
      if (newManager) {
        setForm((f) => ({ ...f, managerId: value, team: newManager.team }))
        if (isBatch) setBatchDirty((d) => { const n = new Set(d); n.add('managerId'); n.add('team'); return n })
        return
      }
    }
    setForm((f) => ({ ...f, [field]: value }))
    if (isBatch) setBatchDirty((d) => new Set(d).add(field))
  }

  const handleSave = async () => {
    markSaving()
    const corrId = generateCorrelationId()

    if (isBatch) {
      if (batchDirty.size === 0) return
      const managerChanged = batchDirty.has('managerId') && form.managerId !== MIXED_VALUE
      const fields: PersonUpdatePayload = {}
      for (const key of batchDirty) {
        if (managerChanged && (key === 'managerId' || key === 'team')) continue
        const apiKey = key === 'otherTeams' ? 'additionalTeams' : key
        const val = form[key as keyof FormFields]
        if (val !== MIXED_VALUE) (fields as Record<string, string>)[apiKey] = val
      }
      if (batchDirty.has('private')) { (fields as Record<string, string>).private = form.private ? 'true' : 'false' }
      let failedCount = 0
      if (managerChanged) {
        for (const p of selectedPeople) {
          try { await reparent(p.id, form.managerId, corrId) } catch { failedCount++ }
        }
      }
      if (Object.keys(fields).length > 0) {
        for (const p of selectedPeople) {
          try { await update(p.id, fields, corrId) } catch { failedCount++ }
        }
      }
      if (failedCount > 0) {
        markError(`${failedCount} of ${selectedPeople.length} updates failed`)
      } else {
        markSaved()
      }
    } else {
      if (!person) return
      try {
        const managerChanged = form.managerId !== person.managerId
        if (managerChanged) await reparent(person.id, form.managerId, corrId)
        const fields: PersonUpdatePayload = {
          name: form.name, role: form.role, discipline: form.discipline,
          status: form.status, employmentType: form.employmentType, additionalTeams: form.otherTeams,
        }
        if (!managerChanged) { fields.team = form.team; fields.managerId = form.managerId }
        if (form.level !== String(person.level ?? 0)) fields.level = form.level
        if (form.pod !== (person.pod ?? '')) fields.pod = form.pod
        if (form.publicNote !== (person.publicNote ?? '')) fields.publicNote = form.publicNote
        if (form.privateNote !== (person.privateNote ?? '')) fields.privateNote = form.privateNote
        if (form.private !== (person.private ?? false)) fields.private = form.private ? 'true' : 'false'
        await update(person.id, fields, corrId)
        markSaved()
      } catch {
        markError('Save failed')
      }
    }
  }

  const handleDelete = async () => {
    if (!person) return
    try {
      await remove(person.id)
      setSelectedId(null)
    } catch { /* Error surfaced via OrgContext.error */ }
  }

  // Pod sidebar
  if (selectedPodId && !selectedId && !isBatch) {
    return <PodSidebar />
  }

  if (isBatch && selectedPeople.length === 0) return null
  if (!isBatch && !person) return null

  const mixed = (field: keyof FormFields) => form[field] === MIXED_VALUE
  const val = (field: keyof FormFields) => mixed(field) ? '' : form[field]
  const ph = (field: keyof FormFields, fallback = '') => mixed(field) ? 'Mixed' : fallback

  return (
    <div className={styles.sidebar}>
      <div className={styles.header}>
        <h3 data-testid="sidebar-heading">{isBatch ? `Edit ${selectedIds.size} people` : 'Edit Person'}</h3>
        <button className={styles.closeBtn} onClick={clearSelection} aria-label="Close">
          &times;
        </button>
      </div>
      <div className={styles.form}>
        {!isBatch && (
          <div className={styles.field}>
            <label>Name</label>
            <input data-testid="field-name" value={form.name} onChange={(e) => handleChange('name', e.target.value)} />
          </div>
        )}
        <div className={styles.field}>
          <label>Role</label>
          <input data-testid="field-role" value={val('role')} placeholder={ph('role')} onChange={(e) => handleChange('role', e.target.value)} />
        </div>
        <div className={styles.field}>
          <label>Discipline</label>
          <input data-testid="field-discipline" value={val('discipline')} placeholder={ph('discipline')} onChange={(e) => handleChange('discipline', e.target.value)} />
        </div>
        <div className={styles.field}>
          <label>Team</label>
          <input data-testid="field-team" value={val('team')} placeholder={ph('team')} onChange={(e) => handleChange('team', e.target.value)} />
        </div>
        <div className={styles.field}>
          <label>Manager</label>
          <select data-testid="field-manager" value={val('managerId')} onChange={(e) => handleChange('managerId', e.target.value)}>
            {mixed('managerId') && <option value="">Mixed</option>}
            <option value="">(No manager)</option>
            {managers.map((m) => (
              <option key={m.id} value={m.id}>{m.name} — {m.team}</option>
            ))}
          </select>
        </div>
        <div className={styles.field}>
          <label>Pod</label>
          <input data-testid="field-pod" value={val('pod')} placeholder={ph('pod')} onChange={(e) => handleChange('pod', e.target.value)} />
        </div>
        <div className={styles.field}>
          <label>
            Status
            <button className={styles.infoIcon} aria-label="Show status descriptions" onClick={() => setShowStatusInfo((v) => !v)}>
              &#8505;
            </button>
          </label>
          {showStatusInfo && (
            <div className={styles.infoOverlay} onMouseDown={() => setShowStatusInfo(false)}>
              <div className={styles.infoPop} onMouseDown={(e) => e.stopPropagation()}>
                <div className={styles.infoHeader}>
                  <span>Status Types</span>
                  <button className={styles.infoClose} onClick={() => setShowStatusInfo(false)}>x</button>
                </div>
                {STATUSES.map((s) => (
                  <div key={s} className={styles.infoRow}>
                    <strong>{s}</strong> — {STATUS_DESCRIPTIONS[s]}
                  </div>
                ))}
              </div>
            </div>
          )}
          <select data-testid="field-status" value={val('status')} onChange={(e) => handleChange('status', e.target.value)}>
            {mixed('status') && <option value="">Mixed</option>}
            {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        <div className={styles.field}>
          <label>Employment Type</label>
          <input data-testid="field-employmentType" value={val('employmentType')} placeholder={ph('employmentType', 'FTE')} onChange={(e) => handleChange('employmentType', e.target.value)} />
        </div>
        <div className={styles.field}>
          <label>Level</label>
          <input data-testid="field-level" type="number" min="0" value={val('level')} placeholder={ph('level')} onChange={(e) => handleChange('level', e.target.value)} />
        </div>
        <div className={styles.field}>
          <label>Other Teams</label>
          <input data-testid="field-otherTeams" value={val('otherTeams')} placeholder={ph('otherTeams', 'Comma-separated')} onChange={(e) => handleChange('otherTeams', e.target.value)} />
        </div>
        <div className={styles.field}>
          <label>Public Note</label>
          <textarea data-testid="field-publicNote" value={val('publicNote')} placeholder={ph('publicNote', 'Visible on the org chart')} onChange={(e) => handleChange('publicNote', e.target.value)} rows={3} />
        </div>
        <div className={styles.field}>
          <label>Private Note</label>
          <textarea data-testid="field-privateNote" value={val('privateNote')} placeholder={ph('privateNote', 'Only visible in this panel')} onChange={(e) => handleChange('privateNote', e.target.value)} rows={3} />
        </div>
        <div className={styles.field}>
          <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span>Private</span>
            <input
              type="checkbox"
              data-testid="field-private"
              checked={form.private}
              onChange={(e) => {
                setForm((f) => ({ ...f, private: e.target.checked }))
                if (isBatch) setBatchDirty((d) => new Set(d).add('private'))
              }}
            />
          </label>
          <span style={{ fontSize: '11px', color: 'var(--text-tertiary)' }}>Hidden when private toggle is off</span>
        </div>
        {saveError && <div className={styles.saveError}>{saveError}</div>}
        <div className={styles.actions}>
          <button
            className={styles.saveBtn}
            onClick={handleSave}
            disabled={isBatch ? batchDirty.size === 0 || saveStatus === 'saving' : saveStatus === 'saving'}
          >
            {saveStatus === 'saving' ? 'Saving...' : saveStatus === 'saved' ? 'Saved!' : saveStatus === 'error' ? 'Retry' : 'Save'}
          </button>
          {isBatch ? (
            <button className={styles.deleteBtn} onClick={clearSelection}>Clear selection</button>
          ) : (
            <button className={styles.deleteBtn} onClick={handleDelete}>Delete</button>
          )}
        </div>
      </div>
    </div>
  )
}
