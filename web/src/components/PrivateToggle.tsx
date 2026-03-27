import { useOrgData, useUI } from '../store/OrgContext'
import styles from './PrivateToggle.module.css'

export default function PrivateToggle() {
  const { working } = useOrgData()
  const { showPrivate, setShowPrivate } = useUI()

  const privateCount = working.filter((p) => p.private).length
  if (privateCount === 0) return null

  return (
    <button
      className={`${styles.btn} ${showPrivate ? styles.active : ''}`}
      onClick={() => setShowPrivate(!showPrivate)}
      aria-label={`${privateCount} private people ${showPrivate ? 'shown' : 'hidden'}`}
      aria-pressed={showPrivate}
    >
      {showPrivate ? '\u{1F441}' : '\u{1F441}\u200D\u{1F5E8}'}
      <span>{privateCount} {showPrivate ? 'shown' : 'hidden'}</span>
    </button>
  )
}
