import { useState, useEffect, useRef, useMemo } from 'react'
import { useOrg } from '../store/OrgContext'
import styles from './EmploymentTypeFilter.module.css'

export default function EmploymentTypeFilter() {
  const { working, hiddenEmploymentTypes, toggleEmploymentTypeFilter, showAllEmploymentTypes, hideAllEmploymentTypes } = useOrg()
  const [open, setOpen] = useState(false)
  const wrapperRef = useRef<HTMLDivElement>(null)

  // Collect all unique employment types from working data
  const allTypes = useMemo(() => {
    const typeSet = new Set<string>()
    for (const p of working) {
      typeSet.add(p.employmentType || '')
    }
    // Sort: empty string ("No type") last, then alphabetical
    const sorted = [...typeSet].sort((a, b) => {
      if (a === '' && b === '') return 0
      if (a === '') return 1
      if (b === '') return -1
      return a.localeCompare(b)
    })
    return sorted
  }, [working])

  // Close dropdown on outside click
  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  const hiddenCount = hiddenEmploymentTypes.size

  return (
    <div className={styles.wrapper} ref={wrapperRef}>
      <button className={styles.trigger} onClick={() => setOpen((o) => !o)}>
        Filter
        {hiddenCount > 0 && <span className={styles.badge}>{hiddenCount}</span>}
      </button>
      {open && (
        <div className={styles.menu}>
          <div className={styles.menuActions}>
            <button className={styles.menuActionBtn} onClick={() => showAllEmploymentTypes()}>
              Show All
            </button>
            <button className={styles.menuActionBtn} onClick={() => hideAllEmploymentTypes(allTypes)}>
              Hide All
            </button>
          </div>
          {allTypes.map((type) => {
            const isVisible = !hiddenEmploymentTypes.has(type)
            const label = type === '' ? 'No type' : type
            return (
              <button
                key={type}
                className={styles.menuItem}
                onClick={() => toggleEmploymentTypeFilter(type)}
              >
                <span className={`${styles.checkbox} ${isVisible ? styles.checked : ''}`}>
                  {isVisible ? '\u2713' : ''}
                </span>
                {label}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
