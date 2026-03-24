import { useCallback, useRef, type ChangeEvent } from 'react'
import { useOrg } from '../store/OrgContext'
import styles from './UploadPrompt.module.css'

export default function UploadPrompt() {
  const { upload } = useOrg()
  const inputRef = useRef<HTMLInputElement>(null)

  const handleChange = useCallback(
    async (e: ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0]
      if (file) {
        await upload(file)
      }
    },
    [upload],
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
      >
        Choose File
      </button>
    </div>
  )
}
