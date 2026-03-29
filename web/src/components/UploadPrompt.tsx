import { useState, useCallback, useRef, type ChangeEvent, type FormEvent } from 'react'
import { useOrgData, useSelection } from '../store/OrgContext'
import styles from './UploadPrompt.module.css'

export default function UploadPrompt() {
  const { upload, createOrg } = useOrgData()
  const { setSelectedId } = useSelection()
  const inputRef = useRef<HTMLInputElement>(null)
  const [showCreate, setShowCreate] = useState(false)
  const [name, setName] = useState('')

  const handleChange = useCallback(
    async (e: ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0]
      if (file) {
        await upload(file)
      }
    },
    [upload],
  )

  const handleCreate = useCallback(
    async (e: FormEvent) => {
      e.preventDefault()
      const trimmed = name.trim()
      if (trimmed) {
        const id = await createOrg(trimmed)
        if (id) setSelectedId(id)
      }
    },
    [name, createOrg, setSelectedId],
  )

  return (
    <div className={styles.container}>
      <img
        src="/grove-icon.svg"
        alt="Grove"
        className={styles.icon}
      />
      <p className={styles.titleLine}>
        grove
        <span className={styles.pronunciation}>
          /&#x261;ro&#x28A;v/
        </span>
        <span className={styles.partOfSpeech}>
          n.
        </span>
      </p>

      <p className={styles.definition}>
        a small group of trees, deliberately planted and carefully tended.
      </p>

      <div className={styles.divider} />

      <p className={styles.tagline}>
        Org planning for people who think in structures, not spreadsheets.
      </p>

      <input
        ref={inputRef}
        type="file"
        accept=".csv,.xlsx,.zip"
        onChange={handleChange}
        style={{ display: 'none' }}
      />
      <button
        onClick={() => inputRef.current?.click()}
        className={styles.uploadBtn}
        data-tour="upload-prompt"
      >
        Choose File
      </button>

      {!showCreate ? (
        <button
          onClick={() => setShowCreate(true)}
          className={styles.scratchBtn}
        >
          or start from scratch
        </button>
      ) : (
        <form onSubmit={handleCreate} className={styles.createForm}>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Name of the first person"
            className={styles.createInput}
            autoFocus
          />
          <button type="submit" className={styles.createBtn} disabled={!name.trim()}>
            Create
          </button>
        </form>
      )}
    </div>
  )
}
