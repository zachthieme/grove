import { useState, useRef, useMemo, useCallback } from 'react'
import { useOrgData, useUI } from '../store/OrgContext'
import { useOutsideClick } from '../hooks/useOutsideClick'
import { isProduct } from '../constants'
import styles from './EmploymentTypeFilter.module.css'

export default function EmploymentTypeFilter() {
  const { working } = useOrgData()
  const { hiddenEmploymentTypes, toggleEmploymentTypeFilter, showAllEmploymentTypes, hideAllEmploymentTypes } = useUI()
  const [open, setOpen] = useState(false)
  const wrapperRef = useRef<HTMLDivElement>(null)

  const allTypes = useMemo(() => {
    const typeSet = new Set<string>()
    for (const p of working) {
      if (isProduct(p)) continue
      typeSet.add(p.employmentType || '')
    }
    return [...typeSet].sort((a, b) => {
      if (a === '' && b === '') return 0
      if (a === '') return 1
      if (b === '') return -1
      return a.localeCompare(b)
    })
  }, [working])

  useOutsideClick(wrapperRef, useCallback(() => setOpen(false), []), open)

  const hiddenCount = hiddenEmploymentTypes.size

  return (
    <div className={styles.wrapper} ref={wrapperRef}>
      <button className={styles.trigger} onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-label="Employment type filter">
        Filter
        {hiddenCount > 0 && <span className={styles.badge}>{hiddenCount}</span>}
      </button>
      {open && (
        <div className={styles.menu}>
          <div className={styles.menuActions}>
            <button className={styles.menuActionBtn} onClick={() => showAllEmploymentTypes()} title="Show all employment types">
              Show All
            </button>
            <button className={styles.menuActionBtn} onClick={() => hideAllEmploymentTypes(allTypes)} title="Hide all employment types">
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
                role="menuitemcheckbox"
                aria-checked={isVisible}
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
