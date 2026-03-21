import { useState, useEffect } from 'react'
import { useOrg } from '../store/OrgContext'
import type { Person } from '../api/types'
import styles from './DetailSidebar.module.css'

const STATUSES: Person['status'][] = ['Active', 'Hiring', 'Open', 'Transfer']

interface FormFields {
  name: string
  role: string
  discipline: string
  team: string
  managerId: string
  status: Person['status']
}

const blankForm: FormFields = {
  name: '',
  role: '',
  discipline: '',
  team: '',
  managerId: '',
  status: 'Active',
}

export default function DetailSidebar() {
  const { working, selectedId, setSelectedId, update, remove, add } = useOrg()
  const [isAdding, setIsAdding] = useState(false)
  const [form, setForm] = useState<FormFields>(blankForm)

  const person = selectedId ? working.find((p) => p.id === selectedId) : null

  useEffect(() => {
    if (person) {
      setForm({
        name: person.name,
        role: person.role,
        discipline: person.discipline,
        team: person.team,
        managerId: person.managerId,
        status: person.status,
      })
      setIsAdding(false)
    }
  }, [person?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleChange = (field: keyof FormFields, value: string) => {
    setForm((f) => ({ ...f, [field]: value }))
  }

  const handleClose = () => {
    setSelectedId(null)
    setIsAdding(false)
  }

  const handleStartAdd = () => {
    setSelectedId(null)
    setForm(blankForm)
    setIsAdding(true)
  }

  const handleSave = async () => {
    if (isAdding) {
      await add({
        name: form.name,
        role: form.role,
        discipline: form.discipline,
        team: form.team,
        managerId: form.managerId,
        status: form.status,
        additionalTeams: [],
      })
      setIsAdding(false)
    } else if (person) {
      await update(person.id, {
        name: form.name,
        role: form.role,
        discipline: form.discipline,
        team: form.team,
        managerId: form.managerId,
        status: form.status,
      })
    }
  }

  const handleDelete = async () => {
    if (!person) return
    const reports = working.filter((p) => p.managerId === person.id)
    const msg =
      reports.length > 0
        ? `Delete ${person.name}? ${reports.length} direct report(s) will be unparented.`
        : `Delete ${person.name}?`
    if (!confirm(msg)) return
    await remove(person.id)
    setSelectedId(null)
  }

  // Empty state: no selection and not adding
  if (!person && !isAdding) {
    return (
      <div className={styles.sidebar}>
        <div className={styles.empty}>
          <p>Click a person to edit</p>
          <button className={styles.addBtn} onClick={handleStartAdd}>
            Add Person
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className={styles.sidebar}>
      <div className={styles.header}>
        <h3>{isAdding ? 'Add Person' : 'Edit Person'}</h3>
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
          <label>Manager ID</label>
          <input
            value={form.managerId}
            onChange={(e) => handleChange('managerId', e.target.value)}
          />
        </div>
        <div className={styles.field}>
          <label>Status</label>
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
        <div className={styles.actions}>
          {isAdding ? (
            <button className={styles.addBtn} onClick={handleSave}>
              Add
            </button>
          ) : (
            <>
              <button className={styles.saveBtn} onClick={handleSave}>
                Save
              </button>
              <button className={styles.deleteBtn} onClick={handleDelete}>
                Delete
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
