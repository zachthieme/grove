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
    <div style={{
      textAlign: 'center',
      maxWidth: 440,
      margin: '0 auto',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: '60vh',
      padding: '0 20px',
    }}>
      <img
        src="/grove-icon.svg"
        alt="Grove"
        style={{ width: 80, height: 80, marginBottom: 20 }}
      />
      <p style={{
        fontFamily: 'var(--font-display)',
        fontSize: 28,
        fontWeight: 400,
        marginBottom: 2,
        color: 'var(--text-primary)',
        letterSpacing: '-0.02em',
      }}>
        grove
        <span style={{
          color: 'var(--text-muted)',
          fontSize: 16,
          fontFamily: 'var(--font-body)',
          fontWeight: 400,
          marginLeft: 10,
        }}>
          /&#x261;ro&#x28A;v/
        </span>
        <span style={{
          fontStyle: 'italic',
          color: 'var(--text-tertiary)',
          fontSize: 16,
          fontFamily: 'var(--font-body)',
          marginLeft: 6,
        }}>
          n.
        </span>
      </p>

      <p style={{
        color: 'var(--text-secondary)',
        marginBottom: 32,
        fontSize: 15,
        lineHeight: 1.6,
        fontStyle: 'italic',
      }}>
        a small group of trees, deliberately planted and carefully tended.
      </p>

      <div style={{
        width: 48,
        height: 1,
        background: 'var(--border-medium)',
        marginBottom: 32,
      }} />

      <p style={{
        color: 'var(--text-tertiary)',
        fontSize: 13,
        marginBottom: 32,
        letterSpacing: '0.02em',
      }}>
        Org planning for people who think in structures, not spreadsheets.
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
          padding: '10px 28px',
          fontSize: 13,
          fontWeight: 600,
          borderRadius: 6,
          border: '1px solid var(--grove-green)',
          background: 'var(--grove-green)',
          color: '#fff',
          cursor: 'pointer',
          letterSpacing: '0.02em',
          transition: 'background 0.15s ease',
        }}
        onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--grove-green-light)')}
        onMouseLeave={(e) => (e.currentTarget.style.background = 'var(--grove-green)')}
      >
        Choose File
      </button>
    </div>
  )
}
