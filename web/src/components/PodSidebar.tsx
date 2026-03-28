import { useState, useEffect, useMemo } from 'react'
import { useOrg } from '../store/OrgContext'
import { useSaveStatus } from '../hooks/useSaveStatus'
import type { PodUpdatePayload } from '../api/types'
import styles from './DetailSidebar.module.css'

export default function PodSidebar() {
  const { pods, working, selectedPodId, selectPod, updatePod } = useOrg()
  const pod = pods.find(p => p.id === selectedPodId)

  const [form, setForm] = useState({ name: '', publicNote: '', privateNote: '' })
  const { saveStatus, saveError, markSaving, markSaved, markError, reset } = useSaveStatus()

  useEffect(() => {
    if (pod) {
      setForm({
        name: pod.name,
        publicNote: pod.publicNote ?? '',
        privateNote: pod.privateNote ?? '',
      })
      reset()
    }
  }, [pod, reset])

  if (!pod) return null

  const memberCount = useMemo(
    () => working.filter(p => p.managerId === pod.managerId && p.pod === pod.name).length,
    [working, pod.managerId, pod.name],
  )

  const isDirty =
    form.name !== pod.name ||
    form.publicNote !== (pod.publicNote ?? '') ||
    form.privateNote !== (pod.privateNote ?? '')

  const handleSave = async () => {
    const fields: PodUpdatePayload = {}
    if (form.name !== pod.name) fields.name = form.name
    if (form.publicNote !== (pod.publicNote ?? '')) fields.publicNote = form.publicNote
    if (form.privateNote !== (pod.privateNote ?? '')) fields.privateNote = form.privateNote
    if (Object.keys(fields).length === 0) return
    markSaving()
    try {
      await updatePod(pod.id, fields)
      markSaved()
    } catch (err) {
      markError(err instanceof Error ? err.message : 'Save failed')
    }
  }

  return (
    <aside className={styles.sidebar}>
      <div className={styles.header}>
        <h3>Pod Details</h3>
        <button className={styles.closeBtn} onClick={() => selectPod(null)} aria-label="Close">
          &times;
        </button>
      </div>
      <div className={styles.form}>
        <div className={styles.field}>
          <label>Name</label>
          <input
            value={form.name}
            onChange={(e) => setForm(f => ({ ...f, name: e.target.value }))}
          />
        </div>
        <div className={styles.field}>
          <label>Team</label>
          <input value={pod.team} disabled />
        </div>
        <div className={styles.field}>
          <label>Members</label>
          <div>{memberCount}</div>
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
        {saveError && <div className={styles.saveError}>{saveError}</div>}
        <div className={styles.actions}>
          <button
            className={`${styles.saveBtn} ${saveStatus === 'saved' ? styles.saveBtnSaved : ''}`}
            onClick={handleSave}
            disabled={!isDirty || saveStatus === 'saving'}
          >
            {saveStatus === 'saving' ? 'Saving...' : saveStatus === 'saved' ? 'Saved!' : saveStatus === 'error' ? 'Retry' : 'Save'}
          </button>
        </div>
      </div>
    </aside>
  )
}
