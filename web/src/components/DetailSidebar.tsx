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

  // Local form state for sidebar editing (single and batch)
  const [sidebarForm, setSidebarForm] = useState<FormFields>(() =>
    person && mode === 'edit' ? formFromPerson(person) : blankForm
  )
  const [batchForm, setBatchForm] = useState<FormFields>(blankForm)
  const [batchDirty, setBatchDirty] = useState<Set<string>>(new Set())

  // Re-initialize sidebar form when entering edit mode or person changes
  useEffect(() => {
    if (mode === 'edit' && person && !isBatch) {
      setSidebarForm(formFromPerson(person))
    }
  }, [mode, person?.id])
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

  // Sync batch form when batch selection changes
  useEffect(() => {
    if (!isBatch) return
    setBatchForm(formFromBatch(selectedPeople))
    setBatchDirty(new Set())
  }, [isBatch, selectedIds.size])

  const handleSidebarChange = (field: keyof FormFields, value: string | boolean) => {
    if (field === 'managerId') {
      const newManager = working.find((p) => p.id === value as string)
      if (newManager) {
        setSidebarForm((f) => ({ ...f, managerId: value as string, team: newManager.team }))
        return
      }
    }
    setSidebarForm((f) => ({ ...f, [field]: value }))
  }

  const handleBatchChange = (field: keyof FormFields, value: string) => {
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

  const handleSingleSave = async () => {
    if (!person) return
    markSaving()
    const orig = formFromPerson(person)
    const dirty: Record<string, string | boolean | number> = {}
    for (const key of Object.keys(orig) as (keyof FormFields)[]) {
      if (sidebarForm[key] !== orig[key]) {
        dirty[key] = sidebarForm[key]
      }
    }
    if (Object.keys(dirty).length === 0) { markSaved(); return }

    const corrId = generateCorrelationId()
    try {
      const managerChanged = dirty.managerId !== undefined && dirty.managerId !== person.managerId
      if (managerChanged) {
        await reparent(person.id, dirty.managerId as string, corrId)
      }
      const fields: PersonUpdatePayload = {}
      for (const [key, val] of Object.entries(dirty)) {
        if (key === 'managerId') continue
        if (key === 'team' && managerChanged) continue
        if (key === 'otherTeams') {
          fields.additionalTeams = val as string
        } else if (key === 'level') {
          fields.level = parseInt(String(val), 10) || 0
        } else {
          (fields as Record<string, unknown>)[key] = val
        }
      }
      if (Object.keys(fields).length > 0) {
        await update(person.id, fields, corrId)
      }
      markSaved()
    } catch {
      markError('Save failed')
    }
  }

  const handleBatchSave = async () => {
    markSaving()
    const corrId = generateCorrelationId()

    if (batchDirty.size === 0) { markSaved(); return }
    const managerChanged = batchDirty.has('managerId') && batchForm.managerId !== MIXED_VALUE
    const fields: PersonUpdatePayload = {}
    for (const key of batchDirty) {
      if (managerChanged && (key === 'managerId' || key === 'team')) continue
      if (key === 'private') continue
      const apiKey = key === 'otherTeams' ? 'additionalTeams' : key
      const val = batchForm[key as keyof FormFields]
      if (val !== MIXED_VALUE) {
        if (apiKey === 'level') {
          ;(fields as Record<string, string | number>)[apiKey] = parseInt(String(val), 10) || 0
        } else {
          ;(fields as Record<string, string>)[apiKey] = String(val)
        }
      }
    }
    if (batchDirty.has('private')) { fields.private = batchForm.private }
    let failedCount = 0
    if (managerChanged) {
      for (const p of selectedPeople) {
        try { await reparent(p.id, batchForm.managerId, corrId) } catch { failedCount++ }
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
  }

  const handleSave = async () => {
    if (isBatch) {
      await handleBatchSave()
    } else {
      await handleSingleSave()
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

  // Batch view mode: read-only display of common fields
  if (isBatch && selectedPeople.length > 0 && mode === 'view') {
    const batchView = formFromBatch(selectedPeople)
    const show = (val: string, fallback = '\u2014') => val === MIXED_VALUE ? 'Mixed' : (val || fallback)
    const managerIds = new Set(selectedPeople.map(p => p.managerId).filter(Boolean))
    const managerLabel = managerIds.size === 1
      ? (working.find(p => p.id === [...managerIds][0])?.name || '(none)')
      : 'Mixed'
    return (
      <aside className={styles.sidebar}>
        <div className={styles.header}>
          <h3 data-testid="sidebar-heading">{selectedIds.size} people selected</h3>
          <button className={styles.closeBtn} onClick={clearSelection} aria-label="Close" title="Close">
            &times;
          </button>
        </div>
        <div className={styles.viewBody}>
          <div className={styles.viewField}>
            <span className={styles.viewLabel}>Role</span>
            <span className={styles.viewValue}>{show(batchView.role, 'TBD')}</span>
          </div>
          <div className={styles.viewField}>
            <span className={styles.viewLabel}>Discipline</span>
            <span className={styles.viewValue}>{show(batchView.discipline)}</span>
          </div>
          <div className={styles.viewField}>
            <span className={styles.viewLabel}>Team</span>
            <span className={styles.viewValue}>{show(batchView.team)}</span>
          </div>
          <div className={styles.viewField}>
            <span className={styles.viewLabel}>Manager</span>
            <span className={styles.viewValue}>{managerLabel}</span>
          </div>
          <div className={styles.viewField}>
            <span className={styles.viewLabel}>Status</span>
            <span className={styles.viewValue}>{show(batchView.status)}</span>
          </div>
          {batchView.pod && batchView.pod !== MIXED_VALUE && (
            <div className={styles.viewField}>
              <span className={styles.viewLabel}>Pod</span>
              <span className={styles.viewValue}>{batchView.pod}</span>
            </div>
          )}
          {batchView.pod === MIXED_VALUE && (
            <div className={styles.viewField}>
              <span className={styles.viewLabel}>Pod</span>
              <span className={styles.viewValue}>Mixed</span>
            </div>
          )}
          <div className={styles.viewField}>
            <span className={styles.viewLabel}>Employment</span>
            <span className={styles.viewValue}>{show(batchView.employmentType, 'FTE')}</span>
          </div>
        </div>
        <div className={styles.actions}>
          <button className={styles.editBtn} onClick={() => onSetMode?.('edit')}>Edit</button>
          <button className={styles.deleteBtn} onClick={clearSelection} title="Clear selection">Clear selection</button>
        </div>
      </aside>
    )
  }

  // Batch form helpers for Mixed value display
  type StringField = { [K in keyof FormFields]: FormFields[K] extends string ? K : never }[keyof FormFields]
  const mixed = (field: StringField) => batchForm[field] === MIXED_VALUE
  const batchVal = (field: StringField) => mixed(field) ? '' : batchForm[field]
  const ph = (field: StringField, fallback = '') => mixed(field) ? 'Mixed' : fallback

  // Status info popover (shared between single and batch)
  const statusInfoPopover = (
    <>
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
    </>
  )

  // Single-person edit form (uses local sidebarForm state)
  if (!isBatch && person && mode === 'edit') {
    return (
      <aside className={styles.sidebar}>
        <div className={styles.header}>
          <h3 data-testid="sidebar-heading">Edit Person</h3>
          <button className={styles.closeBtn} onClick={clearSelection} aria-label="Close" title="Close">
            &times;
          </button>
        </div>
        <div className={styles.form}>
          <div className={styles.field}>
            <label>Name</label>
            <input data-testid="field-name" ref={firstInputRef} value={sidebarForm.name} onChange={(e) => handleSidebarChange('name', e.target.value)} />
          </div>
          <div className={styles.field}>
            <label>Role</label>
            <input data-testid="field-role" value={sidebarForm.role} onChange={(e) => handleSidebarChange('role', e.target.value)} />
          </div>
          <div className={styles.field}>
            <label>Discipline</label>
            <input data-testid="field-discipline" value={sidebarForm.discipline} onChange={(e) => handleSidebarChange('discipline', e.target.value)} />
          </div>
          <div className={styles.field}>
            <label>Team</label>
            <input data-testid="field-team" value={sidebarForm.team} onChange={(e) => handleSidebarChange('team', e.target.value)} />
          </div>
          <div className={styles.field}>
            <label>Manager</label>
            <select data-testid="field-manager" value={sidebarForm.managerId} onChange={(e) => handleSidebarChange('managerId', e.target.value)}>
              <option value="">(No manager)</option>
              {managers.map((m) => (
                <option key={m.id} value={m.id}>{m.name} — {m.team}</option>
              ))}
            </select>
          </div>
          <div className={styles.field}>
            <label>Pod</label>
            <span className={styles.fieldHint}>Group people within a team — e.g. &quot;Backend&quot;, &quot;Frontend&quot;</span>
            <input data-testid="field-pod" value={sidebarForm.pod} onChange={(e) => handleSidebarChange('pod', e.target.value)} />
          </div>
          <div className={styles.field}>
            <label>
              Status
              <button className={styles.infoIcon} aria-label="Show status descriptions" onClick={() => setShowStatusInfo((v) => !v)}>
                &#8505;
              </button>
            </label>
            {statusInfoPopover}
            <select data-testid="field-status" value={sidebarForm.status} onChange={(e) => handleSidebarChange('status', e.target.value)}>
              {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div className={styles.field}>
            <label>Employment Type</label>
            <input data-testid="field-employmentType" value={sidebarForm.employmentType} onChange={(e) => handleSidebarChange('employmentType', e.target.value)} />
          </div>
          <div className={styles.field}>
            <label>Level</label>
            <input data-testid="field-level" type="number" min="0" value={sidebarForm.level} onChange={(e) => handleSidebarChange('level', e.target.value)} />
          </div>
          <div className={styles.field}>
            <label>Other Teams</label>
            <input data-testid="field-otherTeams" value={sidebarForm.otherTeams} onChange={(e) => handleSidebarChange('otherTeams', e.target.value)} />
          </div>
          <div className={styles.field}>
            <label>Public Note</label>
            <textarea data-testid="field-publicNote" value={sidebarForm.publicNote} placeholder="Visible on the org chart" onChange={(e) => handleSidebarChange('publicNote', e.target.value)} rows={3} />
          </div>
          <div className={styles.field}>
            <label>Private Note</label>
            <textarea data-testid="field-privateNote" value={sidebarForm.privateNote} placeholder="Only visible in this panel" onChange={(e) => handleSidebarChange('privateNote', e.target.value)} rows={3} />
          </div>
          <div className={styles.field}>
            <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span>Private</span>
              <input
                type="checkbox"
                data-testid="field-private"
                checked={sidebarForm.private}
                onChange={(e) => handleSidebarChange('private', e.target.checked)}
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
            disabled={saveStatus === 'saving'}
            title="Save changes"
            aria-label="Save changes"
          >
            {saveStatus === 'saving' ? 'Saving...' : saveStatus === 'saved' ? 'Saved!' : saveStatus === 'error' ? 'Retry' : 'Save'}
          </button>
          <button className={styles.deleteBtn} onClick={handleDelete} title="Delete this person" aria-label="Delete this person">Delete</button>
        </div>
      </aside>
    )
  }

  // Batch edit form (uses local batchForm state)
  return (
    <aside className={styles.sidebar}>
      <div className={styles.header}>
        <h3 data-testid="sidebar-heading">Edit {selectedIds.size} people</h3>
        <button className={styles.closeBtn} onClick={clearSelection} aria-label="Close" title="Close">
          &times;
        </button>
      </div>
      <div className={styles.form}>
        <div className={styles.field}>
          <label>Role</label>
          <input data-testid="field-role" value={batchVal('role')} placeholder={ph('role')} onChange={(e) => handleBatchChange('role', e.target.value)} />
        </div>
        <div className={styles.field}>
          <label>Discipline</label>
          <input data-testid="field-discipline" value={batchVal('discipline')} placeholder={ph('discipline')} onChange={(e) => handleBatchChange('discipline', e.target.value)} />
        </div>
        <div className={styles.field}>
          <label>Team</label>
          <input data-testid="field-team" value={batchVal('team')} placeholder={ph('team')} onChange={(e) => handleBatchChange('team', e.target.value)} />
        </div>
        <div className={styles.field}>
          <label>Manager</label>
          <select data-testid="field-manager" value={batchVal('managerId')} onChange={(e) => handleBatchChange('managerId', e.target.value)}>
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
          <input data-testid="field-pod" value={batchVal('pod')} placeholder={ph('pod')} onChange={(e) => handleBatchChange('pod', e.target.value)} />
        </div>
        <div className={styles.field}>
          <label>
            Status
            <button className={styles.infoIcon} aria-label="Show status descriptions" onClick={() => setShowStatusInfo((v) => !v)}>
              &#8505;
            </button>
          </label>
          {statusInfoPopover}
          <select data-testid="field-status" value={batchVal('status')} onChange={(e) => handleBatchChange('status', e.target.value)}>
            {mixed('status') && <option value="">Mixed</option>}
            {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        <div className={styles.field}>
          <label>Employment Type</label>
          <input data-testid="field-employmentType" value={batchVal('employmentType')} placeholder={ph('employmentType', 'FTE')} onChange={(e) => handleBatchChange('employmentType', e.target.value)} />
        </div>
        <div className={styles.field}>
          <label>Level</label>
          <input data-testid="field-level" type="number" min="0" value={batchVal('level')} placeholder={ph('level')} onChange={(e) => handleBatchChange('level', e.target.value)} />
        </div>
        <div className={styles.field}>
          <label>Other Teams</label>
          <input data-testid="field-otherTeams" value={batchVal('otherTeams')} placeholder={ph('otherTeams', 'Comma-separated')} onChange={(e) => handleBatchChange('otherTeams', e.target.value)} />
        </div>
        <div className={styles.field}>
          <label>Public Note</label>
          <textarea data-testid="field-publicNote" value={batchVal('publicNote')} placeholder={ph('publicNote', 'Visible on the org chart')} onChange={(e) => handleBatchChange('publicNote', e.target.value)} rows={3} />
        </div>
        <div className={styles.field}>
          <label>Private Note</label>
          <textarea data-testid="field-privateNote" value={batchVal('privateNote')} placeholder={ph('privateNote', 'Only visible in this panel')} onChange={(e) => handleBatchChange('privateNote', e.target.value)} rows={3} />
        </div>
        <div className={styles.field}>
          <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span>Private</span>
            <input
              type="checkbox"
              data-testid="field-private"
              checked={batchForm.private}
              onChange={(e) => {
                setBatchForm((f) => ({ ...f, private: e.target.checked }))
                setBatchDirty((d) => new Set(d).add('private'))
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
          disabled={batchDirty.size === 0 || saveStatus === 'saving'}
          title="Save changes"
          aria-label="Save changes"
        >
          {saveStatus === 'saving' ? 'Saving...' : saveStatus === 'saved' ? 'Saved!' : saveStatus === 'error' ? 'Retry' : 'Save'}
        </button>
        <button className={styles.deleteBtn} onClick={clearSelection} title="Clear selection">Clear selection</button>
      </div>
    </aside>
  )
}
