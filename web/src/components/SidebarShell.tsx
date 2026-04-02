import { useEffect, useRef, useCallback, type ReactNode } from 'react'
import { useSelection } from '../store/OrgContext'
import styles from './DetailSidebar.module.css'

interface SidebarShellProps {
  heading: string
  children: ReactNode
  onClose?: () => void
  onExit?: () => void
  onSave?: () => void
}

/**
 * Shared sidebar wrapper. Handles keyboard navigation:
 * - Tab (from chart) focuses the first input
 * - Esc (from any field) reverts via onExit and blurs back to chart
 * - Shift+Tab (from first field) same as Esc
 */
export default function SidebarShell({ heading, children, onClose, onExit, onSave }: SidebarShellProps) {
  const { clearSelection } = useSelection()
  const asideRef = useRef<HTMLElement>(null)

  const exitSidebar = useCallback(() => {
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur()
    onExit?.()
  }, [onExit])

  // Global Tab handler: focus sidebar's first input when Tab is pressed outside it
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key !== 'Tab' || e.shiftKey || e.metaKey || e.ctrlKey) return
      const el = e.target as HTMLElement
      // Only intercept if focus is NOT already inside the sidebar
      if (asideRef.current?.contains(el)) return
      // Don't intercept if focus is in another input (e.g., search bar)
      if (el?.tagName === 'INPUT' || el?.tagName === 'SELECT' || el?.tagName === 'TEXTAREA') return
      const firstInput = asideRef.current?.querySelector<HTMLElement>('input, select, textarea')
      if (firstInput) {
        e.preventDefault()
        firstInput.focus()
      }
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [])

  // Esc, Shift+Tab, and Cmd+S from inside the sidebar
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault()
      e.stopPropagation()
      exitSidebar()
      return
    }
    if (e.key === 'Tab' && e.shiftKey) {
      const firstInput = asideRef.current?.querySelector<HTMLElement>('input, select, textarea')
      if (e.target === firstInput) {
        e.preventDefault()
        exitSidebar()
      }
    }
    if (e.key === 's' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault()
      onSave?.()
    }
  }, [exitSidebar, onSave])

  return (
    <aside className={styles.sidebar} ref={asideRef} onKeyDown={handleKeyDown}>
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
