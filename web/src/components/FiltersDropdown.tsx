import { useState, useRef, useMemo, useCallback } from 'react'
import { useOrgData, useUI } from '../store/OrgContext'
import { useOutsideClick } from '../hooks/useOutsideClick'
import { isProduct } from '../constants'
import styles from './EmploymentTypeFilter.module.css'

export default function FiltersDropdown() {
  const { working } = useOrgData()
  const {
    hiddenEmploymentTypes,
    toggleEmploymentTypeFilter,
    showAllEmploymentTypes,
    hideAllEmploymentTypes,
    showPrivate,
    setShowPrivate,
    showProducts,
    setShowProducts,
    showICs,
    setShowICs,
  } = useUI()
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

  const privateCount = useMemo(
    () => working.filter((p) => p.private).length,
    [working],
  )
  const productCount = useMemo(
    () => working.filter(isProduct).length,
    [working],
  )
  const icCount = useMemo(() => {
    const managerIds = new Set<string>()
    for (const p of working) if (p.managerId) managerIds.add(p.managerId)
    return working.filter((p) => !isProduct(p) && !managerIds.has(p.id)).length
  }, [working])

  useOutsideClick(wrapperRef, useCallback(() => setOpen(false), []), open)

  const filtersActive =
    hiddenEmploymentTypes.size +
    (privateCount > 0 && !showPrivate ? 1 : 0) +
    (productCount > 0 && !showProducts ? 1 : 0) +
    (icCount > 0 && !showICs ? 1 : 0)

  return (
    <div className={styles.wrapper} ref={wrapperRef}>
      <button
        className={styles.trigger}
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-label="Filters"
      >
        Filter
        {filtersActive > 0 && <span className={styles.badge}>{filtersActive}</span>}
      </button>
      {open && (
        <div className={styles.menu}>
          {(privateCount > 0 || productCount > 0 || icCount > 0) && (
            <>
              <div className={styles.menuSectionHeader}>Visibility</div>
              {privateCount > 0 && (
                <button
                  className={styles.menuItem}
                  onClick={() => setShowPrivate(!showPrivate)}
                  role="menuitemcheckbox"
                  aria-checked={showPrivate}
                >
                  <span className={`${styles.checkbox} ${showPrivate ? styles.checked : ''}`}>
                    {showPrivate ? '✓' : ''}
                  </span>
                  Private ({privateCount})
                </button>
              )}
              {productCount > 0 && (
                <button
                  className={styles.menuItem}
                  onClick={() => setShowProducts(!showProducts)}
                  role="menuitemcheckbox"
                  aria-checked={showProducts}
                >
                  <span className={`${styles.checkbox} ${showProducts ? styles.checked : ''}`}>
                    {showProducts ? '✓' : ''}
                  </span>
                  Products ({productCount})
                </button>
              )}
              {icCount > 0 && (
                <button
                  className={styles.menuItem}
                  onClick={() => setShowICs(!showICs)}
                  role="menuitemcheckbox"
                  aria-checked={showICs}
                >
                  <span className={`${styles.checkbox} ${showICs ? styles.checked : ''}`}>
                    {showICs ? '✓' : ''}
                  </span>
                  ICs ({icCount})
                </button>
              )}
            </>
          )}

          {allTypes.length > 0 && (
            <>
              <div className={styles.menuSectionHeader}>Employment Type</div>
              <div className={styles.menuActions}>
                <button
                  className={styles.menuActionBtn}
                  onClick={() => showAllEmploymentTypes()}
                  title="Show all employment types"
                >
                  Show All
                </button>
                <button
                  className={styles.menuActionBtn}
                  onClick={() => hideAllEmploymentTypes(allTypes)}
                  title="Hide all employment types"
                >
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
                      {isVisible ? '✓' : ''}
                    </span>
                    {label}
                  </button>
                )
              })}
            </>
          )}
        </div>
      )}
    </div>
  )
}
