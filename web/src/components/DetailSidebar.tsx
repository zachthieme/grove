import { useState, useEffect, useMemo, useRef } from 'react'
import { useOrgData, useUI, useSelection } from '../store/OrgContext'
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

interface DetailSidebarProps {
  mode?: 'view' | 'edit'
  onSetMode?: (mode: 'view' | 'edit') => void
}

export default function DetailSidebar({ mode = 'view', onSetMode }: DetailSidebarProps) {
  const { working, update, remove, reparent } = useOrgData()
  const { selectedId, selectedIds, selectedPodId, setSelectedId, clearSelection } = useSelection()

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

  const firstInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (mode === 'edit' && firstInputRef.current) {
      firstInputRef.current.focus()
    }
  }, [mode])

  const managers = useMemo(() => {
    const managerIds = new Set(working.filter((p) => p.managerId).map((p) => p.managerId))
    let mgrs = working.filter((p) => managerIds.has(p.id))
    if (!showPrivate) {
      mgrs = mgrs.filter((p) => !p.private)
    }
    return mgrs.sort((a, b) => a.name.localeCompare(b.name))
  }, [working, showPrivate])

  // Sync form when selection or person data changes.
  // useMemo with explicit deps replaces the fragile personDataKey string concatenation.
  // If a new Person field is added, add it here to trigger re-sync.
  const personSnapshot = useMemo(() => {
    if (!person) return null
    return {
      id: person.id, name: person.name, role: person.role,
      discipline: person.discipline, team: person.team,
      managerId: person.managerId, status: person.status,
      employmentType: person.employmentType, level: person.level,
      pod: person.pod, publicNote: person.publicNote,
      privateNote: person.privateNote, private: person.private,
      additionalTeams: (person.additionalTeams ?? []).join(','),
    }
  }, [person?.id, person?.name, person?.role, person?.discipline,
      person?.team, person?.managerId, person?.status,
      person?.employmentType, person?.level, person?.pod,
      person?.publicNote, person?.privateNote, person?.private,
      // eslint-disable-next-line react-hooks/exhaustive-deps
      (person?.additionalTeams ?? []).join(',')])

  useEffect(() => {
    if (isBatch) {
      setForm(formFromBatch(selectedPeople))
      setBatchDirty(new Set())
    } else if (person) {
      setForm(formFromPerson(person))
    }
  }, [isBatch ? selectedIds.size : personSnapshot])

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
        if (key === 'private') continue
        const apiKey = key === 'otherTeams' ? 'additionalTeams' : key
        const val = form[key as keyof FormFields]
        if (val !== MIXED_VALUE) {
          if (apiKey === 'level') {
            ;(fields as Record<string, string | number>)[apiKey] = parseInt(String(val), 10) || 0
          } else {
            ;(fields as Record<string, string>)[apiKey] = String(val)
          }
        }
      }
      if (batchDirty.has('private')) { fields.private = form.private }
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
        if (form.level !== String(person.level ?? 0)) fields.level = parseInt(form.level, 10) || 0
        if (form.pod !== (person.pod ?? '')) fields.pod = form.pod
        if (form.publicNote !== (person.publicNote ?? '')) fields.publicNote = form.publicNote
        if (form.privateNote !== (person.privateNote ?? '')) fields.privateNote = form.privateNote
        if (form.private !== (person.private ?? false)) fields.private = form.private
        await update(person.id, fields, corrId)
        markSaved()
        onSetMode?.('view')
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

  // View mode: single person, read-only display
  if (!isBatch && person && mode === 'view') {
    const manager = working.find(p => p.id === person.managerId)
    return (
      <aside className={styles.sidebar}>
        <div className={styles.header}>
          <h3 data-testid="sidebar-heading">{person.name || '(unnamed)'}</h3>
          <button className={styles.closeBtn} onClick={clearSelection} aria-label="Close" title="Close">
            &times;
          </button>
        </div>
        <div className={styles.viewBody}>
          <div className={styles.viewField}>
            <span className={styles.viewLabel}>Role</span>
            <span className={styles.viewValue}>{person.role || 'TBD'}</span>
          </div>
          <div className={styles.viewField}>
            <span className={styles.viewLabel}>Discipline</span>
            <span className={styles.viewValue}>{person.discipline || '\u2014'}</span>
          </div>
          <div className={styles.viewField}>
            <span className={styles.viewLabel}>Team</span>
            <span className={styles.viewValue}>{person.team || '\u2014'}</span>
          </div>
          {person.additionalTeams && person.additionalTeams.length > 0 && (
            <div className={styles.viewField}>
              <span className={styles.viewLabel}>Other Teams</span>
              <span className={styles.viewValue}>{person.additionalTeams.join(', ')}</span>
            </div>
          )}
          <div className={styles.viewField}>
            <span className={styles.viewLabel}>Manager</span>
            <span className={styles.viewValue}>{manager?.name || '(none)'}</span>
          </div>
          <div className={styles.viewField}>
            <span className={styles.viewLabel}>Status</span>
            <span className={styles.viewValue}>{person.status}</span>
          </div>
          {person.pod && (
            <div className={styles.viewField}>
              <span className={styles.viewLabel}>Pod</span>
              <span className={styles.viewValue}>{person.pod}</span>
            </div>
          )}
          <div className={styles.viewField}>
            <span className={styles.viewLabel}>Employment</span>
            <span className={styles.viewValue}>{person.employmentType || 'FTE'}</span>
          </div>
          {(person.level ?? 0) > 0 && (
            <div className={styles.viewField}>
              <span className={styles.viewLabel}>Level</span>
              <span className={styles.viewValue}>{person.level}</span>
            </div>
          )}
          {person.publicNote && (
            <div className={styles.viewField}>
              <span className={styles.viewLabel}>Note</span>
              <span className={styles.viewValue}>{person.publicNote}</span>
            </div>
          )}
          {person.private && (
            <div className={styles.viewField}>
              <span className={styles.viewLabel}>Visibility</span>
              <span className={styles.viewValue}>Private</span>
            </div>
          )}
        </div>
        <div className={styles.actions}>
          <button className={styles.editBtn} onClick={() => onSetMode?.('edit')}>Edit</button>
        </div>
      </aside>
    )
  }

  type StringField = { [K in keyof FormFields]: FormFields[K] extends string ? K : never }[keyof FormFields]
  const mixed = (field: StringField) => form[field] === MIXED_VALUE
  const val = (field: StringField) => mixed(field) ? '' : form[field]
  const ph = (field: StringField, fallback = '') => mixed(field) ? 'Mixed' : fallback

  return (
    <aside className={styles.sidebar}>
      <div className={styles.header}>
        <h3 data-testid="sidebar-heading">{isBatch ? `Edit ${selectedIds.size} people` : 'Edit Person'}</h3>
        <button className={styles.closeBtn} onClick={clearSelection} aria-label="Close" title="Close">
          &times;
        </button>
      </div>
      <div className={styles.form}>
        {!isBatch && (
          <div className={styles.field}>
            <label>Name</label>
            <input data-testid="field-name" ref={firstInputRef} value={form.name} onChange={(e) => handleChange('name', e.target.value)} />
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
          <span className={styles.fieldHint}>Group people within a team — e.g. &quot;Backend&quot;, &quot;Frontend&quot;</span>
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
                  <button className={styles.infoClose} onClick={() => setShowStatusInfo(false)} title="Close" aria-label="Close">x</button>
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
      </div>
      {saveError && <div className={styles.saveError} style={{ padding: '4px 16px' }}>{saveError}</div>}
      <div className={styles.actions}>
        <button
          className={`${styles.saveBtn} ${saveStatus === 'saved' ? styles.saveBtnSaved : ''}`}
          onClick={handleSave}
          disabled={isBatch ? batchDirty.size === 0 || saveStatus === 'saving' : saveStatus === 'saving'}
          title="Save changes"
        >
          {saveStatus === 'saving' ? 'Saving...' : saveStatus === 'saved' ? 'Saved!' : saveStatus === 'error' ? 'Retry' : 'Save'}
        </button>
        {isBatch ? (
          <button className={styles.deleteBtn} onClick={clearSelection} title="Clear selection">Clear selection</button>
        ) : (
          <button className={styles.deleteBtn} onClick={handleDelete} title="Delete this person">Delete</button>
        )}
      </div>
    </aside>
  )
}
