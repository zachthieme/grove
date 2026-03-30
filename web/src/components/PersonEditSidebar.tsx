import { useState, useEffect, useMemo, useRef } from 'react'
import { useOrgData, useOrgMutations, useUI, useSelection } from '../store/OrgContext'
import { useSaveStatus } from '../hooks/useSaveStatus'
import { generateCorrelationId } from '../api/client'
import {
  type PersonFormValues,
  personToForm,
  blankForm,
  computeDirtyFields,
  dirtyToApiPayload,
} from '../utils/personFormUtils'
import PersonForm from './PersonForm'
import SidebarShell from './SidebarShell'
import styles from './DetailSidebar.module.css'

interface PersonEditSidebarProps {
  personId: string
  onSetMode?: (mode: 'view' | 'edit') => void
}

export default function PersonEditSidebar({ personId, onSetMode: _onSetMode }: PersonEditSidebarProps) {
  const { working } = useOrgData()
  const { update, remove, reparent } = useOrgMutations()
  const { showPrivate } = useUI()
  const { setSelectedId } = useSelection()

  const person = useMemo(() => working.find(p => p.id === personId), [working, personId])

  const [sidebarForm, setSidebarForm] = useState<PersonFormValues>(() =>
    person ? personToForm(person) : blankForm()
  )
  const [showStatusInfo, setShowStatusInfo] = useState(false)
  const { saveStatus, saveError, markSaving, markSaved, markError } = useSaveStatus()
  const firstInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (person) {
      setSidebarForm(personToForm(person))
    }
  }, [person?.id])

  useEffect(() => {
    if (firstInputRef.current) {
      firstInputRef.current.focus()
    }
  }, [])

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
        setSidebarForm(f => ({ ...f, managerId: value as string, team: newManager.team }))
        return
      }
    }
    setSidebarForm(f => ({ ...f, [field]: value }))
  }

  const handleSave = async () => {
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

  const handleDelete = async () => {
    if (!person) return
    try {
      await remove(person.id)
      setSelectedId(null)
    } catch { /* Error surfaced via OrgContext.error */ }
  }

  if (!person) return null

  return (
    <SidebarShell heading="Edit Person">
      <PersonForm
        values={sidebarForm}
        onChange={handleChange}
        managers={managers}
        showStatusInfo={showStatusInfo}
        onToggleStatusInfo={() => setShowStatusInfo(v => !v)}
        firstInputRef={firstInputRef}
      />
      {saveError && <div className={styles.saveError} style={{ padding: '4px 16px' }}>{saveError}</div>}
      <div className={styles.actions}>
        <button
          className={`${styles.saveBtn} ${saveStatus === 'saved' ? styles.saveBtnSaved : ''}`}
          onClick={handleSave}
          disabled={saveStatus === 'saving'}
          title="Save changes"
        >
          {saveStatus === 'saving' ? 'Saving...' : saveStatus === 'saved' ? 'Saved!' : saveStatus === 'error' ? 'Retry' : 'Save'}
        </button>
        <button className={styles.deleteBtn} onClick={handleDelete} title="Delete this person">Delete</button>
      </div>
    </SidebarShell>
  )
}
