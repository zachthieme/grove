import { useState, useEffect, useMemo, useRef } from 'react'
import { useOrgData, useOrgMutations, useUI, useSelection } from '../store/OrgContext'
import { useSaveStatus } from '../hooks/useSaveStatus'
import { generateCorrelationId } from '../api/client'
import {
  type PersonFormValues,
  personToForm,
  batchToForm,
  blankForm,
  computeDirtyFields,
  dirtyToApiPayload,
  batchDirtyToApiPayload,
} from '../utils/personFormUtils'
import { MIXED_VALUE } from '../constants'
import PersonForm from './PersonForm'
import PodSidebar from './PodSidebar'
import styles from './DetailSidebar.module.css'

interface DetailSidebarProps {
  mode?: 'view' | 'edit'
  onSetMode?: (mode: 'view' | 'edit') => void
}

export default function DetailSidebar({ mode = 'view', onSetMode }: DetailSidebarProps) {
  const { working } = useOrgData()
  const { update, remove, reparent } = useOrgMutations()
  const { selectedId, selectedIds, selectedPodId, setSelectedId, clearSelection } = useSelection()

  const isBatch = selectedIds.size > 1
  const person = selectedId ? working.find((p) => p.id === selectedId) : null
  const selectedPeople = useMemo(
    () => isBatch ? working.filter((p) => selectedIds.has(p.id)) : [],
    [working, selectedIds, isBatch],
  )

  // Local form state for sidebar editing (single and batch)
  const [sidebarForm, setSidebarForm] = useState<PersonFormValues>(() =>
    person && mode === 'edit' ? personToForm(person) : blankForm()
  )
  const [batchForm, setBatchForm] = useState<PersonFormValues>(blankForm())
  const [batchDirty, setBatchDirty] = useState<Set<string>>(new Set())

  // Re-initialize sidebar form when entering edit mode or person changes
  useEffect(() => {
    if (mode === 'edit' && person && !isBatch) {
      setSidebarForm(personToForm(person))
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
    setBatchForm(batchToForm(selectedPeople))
    setBatchDirty(new Set())
  }, [isBatch, selectedIds.size])

  const handleSidebarChange = (field: keyof PersonFormValues, value: string | boolean) => {
    if (field === 'managerId') {
      const newManager = working.find((p) => p.id === value as string)
      if (newManager) {
        setSidebarForm((f) => ({ ...f, managerId: value as string, team: newManager.team }))
        return
      }
    }
    setSidebarForm((f) => ({ ...f, [field]: value }))
  }

  const handleBatchChange = (field: keyof PersonFormValues, value: string | boolean) => {
    if (field === 'managerId') {
      const newManager = working.find((p) => p.id === value as string)
      if (newManager) {
        setBatchForm((f) => ({ ...f, managerId: value as string, team: newManager.team }))
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
    const dirty = computeDirtyFields(personToForm(person), sidebarForm)
    if (!dirty) { markSaved(); return }

    const corrId = generateCorrelationId()
    try {
      const managerChanged = dirty.managerId !== undefined && dirty.managerId !== person.managerId
      if (managerChanged) {
        await reparent(person.id, dirty.managerId as string, corrId)
      }
      const fields = dirtyToApiPayload(dirty)
      if (managerChanged) {
        delete (fields as Record<string, unknown>).team
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
    const fields = batchDirtyToApiPayload(batchDirty, batchForm, managerChanged)
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
    const batchView = batchToForm(selectedPeople)
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

  // Compute mixed fields for batch form
  const mixedFields = useMemo(() => {
    const s = new Set<string>()
    for (const key of Object.keys(batchForm) as (keyof PersonFormValues)[]) {
      if (typeof batchForm[key] === 'string' && batchForm[key] === MIXED_VALUE) {
        s.add(key)
      }
    }
    return s
  }, [batchForm])

  const saveButton = (
    <button
      className={`${styles.saveBtn} ${saveStatus === 'saved' ? styles.saveBtnSaved : ''}`}
      onClick={handleSave}
      disabled={isBatch ? (batchDirty.size === 0 || saveStatus === 'saving') : saveStatus === 'saving'}
      title="Save changes"
      aria-label="Save changes"
    >
      {saveStatus === 'saving' ? 'Saving...' : saveStatus === 'saved' ? 'Saved!' : saveStatus === 'error' ? 'Retry' : 'Save'}
    </button>
  )

  // Single-person edit form
  if (!isBatch && person && mode === 'edit') {
    return (
      <aside className={styles.sidebar}>
        <div className={styles.header}>
          <h3 data-testid="sidebar-heading">Edit Person</h3>
          <button className={styles.closeBtn} onClick={clearSelection} aria-label="Close" title="Close">
            &times;
          </button>
        </div>
        <PersonForm
          values={sidebarForm}
          onChange={handleSidebarChange}
          managers={managers}
          showStatusInfo={showStatusInfo}
          onToggleStatusInfo={() => setShowStatusInfo((v) => !v)}
          firstInputRef={firstInputRef}
        />
        {saveError && <div className={styles.saveError} style={{ padding: '4px 16px' }}>{saveError}</div>}
        <div className={styles.actions}>
          {saveButton}
          <button className={styles.deleteBtn} onClick={handleDelete} title="Delete this person" aria-label="Delete this person">Delete</button>
        </div>
      </aside>
    )
  }

  // Batch edit form
  return (
    <aside className={styles.sidebar}>
      <div className={styles.header}>
        <h3 data-testid="sidebar-heading">Edit {selectedIds.size} people</h3>
        <button className={styles.closeBtn} onClick={clearSelection} aria-label="Close" title="Close">
          &times;
        </button>
      </div>
      <PersonForm
        values={batchForm}
        onChange={handleBatchChange}
        managers={managers}
        isBatch
        mixedFields={mixedFields}
        showStatusInfo={showStatusInfo}
        onToggleStatusInfo={() => setShowStatusInfo((v) => !v)}
      />
      {saveError && <div className={styles.saveError} style={{ padding: '4px 16px' }}>{saveError}</div>}
      <div className={styles.actions}>
        {saveButton}
        <button className={styles.deleteBtn} onClick={clearSelection} title="Clear selection">Clear selection</button>
      </div>
    </aside>
  )
}
