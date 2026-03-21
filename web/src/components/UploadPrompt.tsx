import { useCallback, useRef, type ChangeEvent } from 'react'
import { useOrg } from '../store/OrgContext'

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
    <div style={{ textAlign: 'center' }}>
      <p style={{ marginBottom: 16, color: '#666' }}>
        Upload a CSV or XLSX file to get started
      </p>
      <input
        ref={inputRef}
        type="file"
        accept=".csv,.xlsx"
        onChange={handleChange}
        style={{ display: 'none' }}
      />
      <button
        onClick={() => inputRef.current?.click()}
        style={{
          padding: '10px 24px',
          fontSize: 16,
          borderRadius: 6,
          border: '1px solid #ccc',
          background: '#fff',
          cursor: 'pointer',
        }}
      >
        Choose File
      </button>
    </div>
  )
}
