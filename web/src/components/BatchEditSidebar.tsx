import { useState, useEffect, useMemo } from 'react'
import { useOrgData, useOrgMutations, useUI, useSelection } from '../store/OrgContext'
import { useSaveStatus } from '../hooks/useSaveStatus'
import { generateCorrelationId } from '../api/client'
import {
  type PersonFormValues,
  batchToForm,
  blankForm,
  batchDirtyToApiPayload,
} from '../utils/personFormUtils'
import { MIXED_VALUE } from '../constants'
import PersonForm from './PersonForm'
import SidebarShell from './SidebarShell'
import styles from './DetailSidebar.module.css'

export default function BatchEditSidebar() {
  const { working } = useOrgData()
  const { update, reparent } = useOrgMutations()
  const { showPrivate } = useUI()
  const { selectedIds, clearSelection } = useSelection()

  const selectedPeople = useMemo(
    () => working.filter(p => selectedIds.has(p.id)),
    [working, selectedIds],
  )

  const [batchForm, setBatchForm] = useState<PersonFormValues>(blankForm())
  const [batchDirty, setBatchDirty] = useState<Set<string>>(new Set())
  const [showStatusInfo, setShowStatusInfo] = useState(false)
  const { saveStatus, saveError, markSaving, markSaved, markError } = useSaveStatus()

  useEffect(() => {
    setBatchForm(batchToForm(selectedPeople))
    setBatchDirty(new Set())
  }, [selectedIds.size])

  const managers = useMemo(() => {
    const managerIds = new Set(working.filter(p => p.managerId).map(p => p.managerId))
    let mgrs = working.filter(p => managerIds.has(p.id))
    if (!showPrivate) {
      mgrs = mgrs.filter(p => !p.private)
    }
    return mgrs.sort((a, b) => a.name.localeCompare(b.name))
  }, [working, showPrivate])

  const handleChange = (field: keyof PersonFormValues, value: string | boolean) => {
    if (field === 'managerId') {
      const newManager = working.find(p => p.id === value as string)
      if (newManager) {
        setBatchForm(f => ({ ...f, managerId: value as string, team: newManager.team }))
        setBatchDirty(d => { const n = new Set(d); n.add('managerId'); n.add('team'); return n })
        return
      }
    }
    setBatchForm(f => ({ ...f, [field]: value }))
    setBatchDirty(d => new Set(d).add(field))
  }

  const handleSave = async () => {
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

  const mixedFields = useMemo(() => {
    const s = new Set<string>()
    for (const key of Object.keys(batchForm) as (keyof PersonFormValues)[]) {
      if (typeof batchForm[key] === 'string' && batchForm[key] === MIXED_VALUE) {
        s.add(key)
      }
    }
    return s
  }, [batchForm])

  if (selectedPeople.length === 0) return null

  return (
    <SidebarShell heading={`Edit ${selectedIds.size} people`} onExit={() => { setBatchForm(batchToForm(selectedPeople)); setBatchDirty(new Set()) }} onSave={handleSave}>
      <PersonForm
        values={batchForm}
        onChange={handleChange}
        managers={managers}
        isBatch
        mixedFields={mixedFields}
        showStatusInfo={showStatusInfo}
        onToggleStatusInfo={() => setShowStatusInfo(v => !v)}
      />
      {saveError && <div className={styles.saveError} role="alert" style={{ padding: '4px 16px' }}>{saveError}</div>}
      <div className={styles.actions}>
        <button
          className={`${styles.saveBtn} ${saveStatus === 'saved' ? styles.saveBtnSaved : ''}`}
          onClick={handleSave}
          disabled={batchDirty.size === 0 || saveStatus === 'saving'}
          title="Save changes"
          aria-live="polite"
        >
          {saveStatus === 'saving' ? 'Saving...' : saveStatus === 'saved' ? 'Saved!' : saveStatus === 'error' ? 'Retry' : 'Save'}
        </button>
        <button className={styles.deleteBtn} onClick={clearSelection} title="Clear selection">Clear selection</button>
      </div>
    </SidebarShell>
  )
}
