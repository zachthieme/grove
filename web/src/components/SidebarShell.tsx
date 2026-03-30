import type { ReactNode } from 'react'
import { useSelection } from '../store/OrgContext'
import styles from './DetailSidebar.module.css'

interface SidebarShellProps {
  heading: string
  children: ReactNode
  onClose?: () => void
}

export default function SidebarShell({ heading, children, onClose }: SidebarShellProps) {
  const { clearSelection } = useSelection()
  return (
    <aside className={styles.sidebar}>
      <div className={styles.header}>
        <h3 data-testid="sidebar-heading">{heading}</h3>
        <button className={styles.closeBtn} onClick={onClose ?? clearSelection} aria-label="Close" title="Close">
          &times;
        </button>
      </div>
      {children}
    </aside>
  )
}
