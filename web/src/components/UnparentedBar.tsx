import { useOrg } from '../store/OrgContext'

export default function UnparentedBar() {
  const { working, setSelectedId } = useOrg()

  const orphans = working.filter((p) => !p.managerId)

  if (orphans.length <= 1) return null

  return (
    <div
      style={{
        background: '#fef3c7',
        borderBottom: '2px solid #fcd34d',
        padding: '6px 12px',
        fontSize: 13,
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        flexWrap: 'wrap',
      }}
    >
      <strong>{orphans.length} root/unparented people:</strong>
      {orphans.map((p) => (
        <button
          key={p.id}
          onClick={() => setSelectedId(p.id)}
          style={{
            background: '#fff',
            border: '1px solid #d97706',
            borderRadius: 4,
            padding: '2px 8px',
            fontSize: 12,
            cursor: 'pointer',
            color: '#92400e',
          }}
        >
          {p.name}
        </button>
      ))}
    </div>
  )
}
