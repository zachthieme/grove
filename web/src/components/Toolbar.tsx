import { useCallback, useRef, type ChangeEvent } from 'react'
import { useOrg } from '../store/OrgContext'
import styles from './Toolbar.module.css'

const viewModes = [
  { value: 'tree', label: 'Tree' },
  { value: 'columns', label: 'Columns' },
  { value: 'headcount', label: 'Headcount' },
] as const

const dataViews = [
  { value: 'original', label: 'Original' },
  { value: 'working', label: 'Working' },
  { value: 'diff', label: 'Diff' },
] as const

export default function Toolbar() {
  const { loaded, viewMode, dataView, setViewMode, setDataView, upload } = useOrg()
  const inputRef = useRef<HTMLInputElement>(null)

  const handleFileChange = useCallback(
    async (e: ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0]
      if (file) {
        await upload(file)
      }
    },
    [upload],
  )

  return (
    <header className={styles.toolbar}>
      <span className={styles.title}>Org Chart</span>

      <input
        ref={inputRef}
        type="file"
        accept=".csv,.xlsx"
        onChange={handleFileChange}
        style={{ display: 'none' }}
      />
      <button className={styles.uploadBtn} onClick={() => inputRef.current?.click()}>
        Upload
      </button>

      {loaded && (
        <>
          <div className={styles.pillGroup}>
            {viewModes.map((m) => (
              <button
                key={m.value}
                className={`${styles.pill} ${viewMode === m.value ? styles.pillActive : ''}`}
                onClick={() => setViewMode(m.value)}
              >
                {m.label}
              </button>
            ))}
          </div>

          <div className={styles.pillGroup}>
            {dataViews.map((d) => (
              <button
                key={d.value}
                className={`${styles.pill} ${dataView === d.value ? styles.pillActive : ''}`}
                onClick={() => setDataView(d.value)}
              >
                {d.label}
              </button>
            ))}
          </div>

          <div className={styles.spacer} />

          <a className={styles.exportLink} href="/api/export/csv">CSV</a>
          <a className={styles.exportLink} href="/api/export/xlsx">XLSX</a>
        </>
      )}
    </header>
  )
}
