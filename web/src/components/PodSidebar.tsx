import { useState, useEffect } from 'react'
import { useOrg } from '../store/OrgContext'
import styles from './DetailSidebar.module.css'

export default function PodSidebar() {
  const { pods, working, selectedPodId, updatePod } = useOrg()
  const pod = pods.find(p => p.id === selectedPodId)

  const [form, setForm] = useState({ name: '', publicNote: '', privateNote: '' })

  useEffect(() => {
    if (pod) {
      setForm({
        name: pod.name,
        publicNote: pod.publicNote ?? '',
        privateNote: pod.privateNote ?? '',
      })
    }
  }, [pod])

  if (!pod) return null

  const memberCount = working.filter(p => p.managerId === pod.managerId && p.pod === pod.name).length

  const handleSave = async () => {
    const fields: Record<string, string> = {}
    if (form.name !== pod.name) fields.name = form.name
    if (form.publicNote !== (pod.publicNote ?? '')) fields.publicNote = form.publicNote
    if (form.privateNote !== (pod.privateNote ?? '')) fields.privateNote = form.privateNote
    if (Object.keys(fields).length > 0) {
      await updatePod(pod.id, fields)
    }
  }

  return (
    <div className={styles.sidebar}>
      <div className={styles.header}>
        <h3>Pod Details</h3>
      </div>
      <div className={styles.form}>
        <div className={styles.field}>
          <label>Name</label>
          <input
            value={form.name}
            onChange={(e) => setForm(f => ({ ...f, name: e.target.value }))}
            onBlur={handleSave}
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
            onBlur={handleSave}
            rows={3}
            placeholder="Visible on the org chart"
          />
        </div>
        <div className={styles.field}>
          <label>Private Note</label>
          <textarea
            value={form.privateNote}
            onChange={(e) => setForm(f => ({ ...f, privateNote: e.target.value }))}
            onBlur={handleSave}
            rows={3}
            placeholder="Only visible in this panel"
          />
        </div>
      </div>
    </div>
  )
}
