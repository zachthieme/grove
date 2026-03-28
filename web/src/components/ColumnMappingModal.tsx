import { useState, useMemo } from 'react'
import type { MappedColumn } from '../api/types'
import styles from './ColumnMappingModal.module.css'

const APP_FIELDS = [
  { key: 'name', label: 'Name', required: true },
  { key: 'role', label: 'Role', required: false },
  { key: 'discipline', label: 'Discipline', required: false },
  { key: 'manager', label: 'Manager', required: false },
  { key: 'team', label: 'Team', required: false },
  { key: 'status', label: 'Status', required: false },
  { key: 'additionalTeams', label: 'Additional Teams', required: false },
  { key: 'newRole', label: 'New Role', required: false },
  { key: 'newTeam', label: 'New Team', required: false },
]

interface Props {
  headers: string[]
  mapping: Record<string, MappedColumn>
  preview: string[][]
  onConfirm: (mapping: Record<string, string>) => void
  onCancel: () => void
}

export default function ColumnMappingModal({ headers, mapping, preview, onConfirm, onCancel }: Props) {
  const [localMapping, setLocalMapping] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {}
    for (const [key, val] of Object.entries(mapping)) {
      init[key] = val.column
    }
    return init
  })

  const canConfirm = useMemo(() => {
    return APP_FIELDS.filter((f) => f.required).every((f) => localMapping[f.key])
  }, [localMapping])

  const handleChange = (fieldKey: string, value: string) => {
    setLocalMapping((prev) => ({ ...prev, [fieldKey]: value }))
  }

  const dotClass = (fieldKey: string): string => {
    const mapped = mapping[fieldKey]
    if (!mapped || !localMapping[fieldKey]) {
      const field = APP_FIELDS.find((f) => f.key === fieldKey)
      return field?.required ? styles.dotNoneRequired : styles.dotNoneOptional
    }
    // If the user changed from the original suggestion, show as high confidence
    if (localMapping[fieldKey] !== mapped.column) {
      return styles.dotHigh
    }
    if (mapped.confidence === 'high') return styles.dotHigh
    if (mapped.confidence === 'medium') return styles.dotMedium
    const field = APP_FIELDS.find((f) => f.key === fieldKey)
    return field?.required ? styles.dotNoneRequired : styles.dotNoneOptional
  }

  // Build header index for preview
  const headerIndex: Record<string, number> = {}
  for (let i = 0; i < headers.length; i++) {
    headerIndex[headers[i]] = i
  }

  const mappedFields = APP_FIELDS.filter((f) => localMapping[f.key])

  return (
    <div className={styles.overlay} role="dialog" aria-modal="true" aria-label="Column mapping">
      <div className={styles.modal}>
        <h2 className={styles.title}>Map Spreadsheet Columns</h2>

        {APP_FIELDS.map((field) => (
          <div key={field.key} className={styles.fieldRow}>
            <span className={`${styles.fieldLabel} ${field.required ? styles.required : ''}`}>
              {field.label}
            </span>
            <select
              className={styles.select}
              value={localMapping[field.key] || ''}
              onChange={(e) => handleChange(field.key, e.target.value)}
            >
              <option value="">— unmapped —</option>
              {headers.map((h) => (
                <option key={h} value={h}>
                  {h}
                </option>
              ))}
            </select>
            <span className={`${styles.dot} ${dotClass(field.key)}`} />
          </div>
        ))}

        {mappedFields.length > 0 && preview.length > 0 && (
          <div className={styles.previewSection}>
            <div className={styles.previewLabel}>Preview</div>
            <table className={styles.preview}>
              <thead>
                <tr>
                  {mappedFields.map((f) => (
                    <th key={f.key}>{f.label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {preview.slice(1).map((row, ri) => (
                  <tr key={ri}>
                    {mappedFields.map((f) => {
                      const col = localMapping[f.key]
                      const idx = col ? headerIndex[col] : -1
                      return <td key={f.key}>{idx >= 0 && idx < row.length ? row[idx] : ''}</td>
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className={styles.actions}>
          <button disabled={!canConfirm} onClick={() => onConfirm(localMapping)}>
            Load
          </button>
          <button onClick={onCancel}>Cancel</button>
        </div>
      </div>
    </div>
  )
}
