import styles from './PersonNode.module.css'
import type { Person } from '../api/types'

interface Props {
  person: Person
  selected?: boolean
  onClick?: () => void
}

export default function PersonNode({ person, selected, onClick }: Props) {
  const isHiring = person.status === 'Hiring' || person.status === 'Open'
  const isTransfer = person.status === 'Transfer'

  const classNames = [
    styles.node,
    selected && styles.selected,
    isHiring && styles.hiring,
    isTransfer && styles.transfer,
  ].filter(Boolean).join(' ')

  const prefix = isHiring ? '\u{1F535} ' : isTransfer ? '\u{1F7E1} ' : ''

  return (
    <div className={classNames} onClick={onClick}>
      <div className={styles.name}>{prefix}{person.name}</div>
      <div className={styles.role}>{person.role || 'TBD'}</div>
    </div>
  )
}
