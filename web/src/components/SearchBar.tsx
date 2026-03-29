import { useState, useRef, useEffect, useCallback, type KeyboardEvent } from 'react'
import { useOrgData } from '../store/OrgContext'
import { useSelection } from '../store/OrgContext'
import type { Person } from '../api/types'
import styles from './SearchBar.module.css'

const MAX_RESULTS = 8

export default function SearchBar() {
  const { working } = useOrgData()
  const { setSelectedId } = useSelection()
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const [highlighted, setHighlighted] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  const matches: Person[] = query.trim()
    ? working
        .filter((p) => p.name.toLowerCase().includes(query.trim().toLowerCase()))
        .slice(0, MAX_RESULTS)
    : []

  // Cmd+K / Ctrl+K global shortcut
  useEffect(() => {
    const handler = (e: globalThis.KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        inputRef.current?.focus()
        inputRef.current?.select()
      }
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [])

  // Close dropdown on outside click
  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  const selectPerson = useCallback(
    (person: Person) => {
      setSelectedId(person.id)
      setQuery('')
      setOpen(false)
      // Scroll to the person's node in the chart
      requestAnimationFrame(() => {
        const el = document.querySelector<HTMLElement>(`[data-testid="person-${person.name}"]`)
        el?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      })
    },
    [setSelectedId],
  )

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (!open || matches.length === 0) {
      if (e.key === 'Escape') {
        setQuery('')
        setOpen(false)
        inputRef.current?.blur()
      }
      return
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setHighlighted((h) => Math.min(h + 1, matches.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setHighlighted((h) => Math.max(h - 1, 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      if (matches[highlighted]) selectPerson(matches[highlighted])
    } else if (e.key === 'Escape') {
      setQuery('')
      setOpen(false)
      inputRef.current?.blur()
    }
  }

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setQuery(e.target.value)
    setHighlighted(0)
    setOpen(true)
  }

  const showDropdown = open && query.trim().length > 0

  return (
    <div className={styles.container} ref={containerRef}>
      <input
        ref={inputRef}
        className={styles.input}
        type="search"
        placeholder="Search people… (⌘K)"
        title="Search people (⌘K)"
        value={query}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        onFocus={() => { if (query.trim()) setOpen(true) }}
        aria-label="Search people"
        aria-autocomplete="list"
        aria-expanded={showDropdown}
        aria-haspopup="listbox"
        role="combobox"
        autoComplete="off"
        spellCheck={false}
      />
      {showDropdown && (
        <ul className={styles.dropdown} role="listbox" aria-label="Search results">
          {matches.length === 0 ? (
            <li className={styles.noMatches} role="option" aria-selected={false}>
              No matches
            </li>
          ) : (
            matches.map((person, i) => (
              <li
                key={person.id}
                className={`${styles.result} ${i === highlighted ? styles.resultHighlighted : ''}`}
                role="option"
                aria-selected={i === highlighted}
                onMouseEnter={() => setHighlighted(i)}
                onMouseDown={(e) => {
                  e.preventDefault() // prevent blur before click
                  selectPerson(person)
                }}
              >
                <span className={styles.name}>{person.name}</span>
                <span className={styles.meta}>
                  {[person.role, person.team].filter(Boolean).join(' · ')}
                </span>
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  )
}
