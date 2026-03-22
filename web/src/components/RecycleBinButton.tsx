import { useOrg } from '../store/OrgContext'

export default function RecycleBinButton() {
  const { recycled, binOpen, setBinOpen } = useOrg()
  return (
    <button
      onClick={() => setBinOpen(!binOpen)}
      style={{
        position: 'relative',
        background: binOpen ? 'var(--surface-sunken)' : 'transparent',
        border: '1px solid var(--border-medium)',
        borderRadius: 4,
        padding: '4px 10px',
        cursor: 'pointer',
        fontSize: 14,
        transition: 'all 0.12s ease',
      }}
    >
      🗑
      {recycled.length > 0 && (
        <span style={{
          position: 'absolute', top: -6, right: -6,
          background: 'var(--grove-red)', color: 'white', borderRadius: '50%',
          width: 16, height: 16, fontSize: 10, fontWeight: 700,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          {recycled.length}
        </span>
      )}
    </button>
  )
}
