import { useState, useRef, useEffect, useCallback, useMemo, type KeyboardEvent } from 'react'
import { useOrgData } from '../store/OrgContext'
import { useSelection } from '../store/OrgContext'
import type { Person, Pod } from '../api/types'
import styles from './SearchBar.module.css'

const MAX_RESULTS = 8

type SearchResult = { kind: 'person'; person: Person } | { kind: 'pod'; pod: Pod }

export default function SearchBar() {
  const { working, pods } = useOrgData()
  const { setSelectedId } = useSelection()
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const [highlighted, setHighlighted] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  const matches = useMemo((): SearchResult[] => {
    const q = query.trim().toLowerCase()
    if (!q) return []
    const people: SearchResult[] = working
      .filter((p) => p.name.toLowerCase().includes(q))
      .slice(0, MAX_RESULTS)
      .map((p) => ({ kind: 'person', person: p }))
    const podResults: SearchResult[] = (pods ?? [])
      .filter((p) => p.name.toLowerCase().includes(q))
      .slice(0, MAX_RESULTS)
      .map((p) => ({ kind: 'pod', pod: p }))
    return [...people, ...podResults].slice(0, MAX_RESULTS)
  }, [query, working, pods])

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

  const selectResult = useCallback(
    (result: SearchResult) => {
      setQuery('')
      setOpen(false)
      inputRef.current?.blur()
      if (result.kind === 'pod') {
        setSelectedId(`pod:${result.pod.managerId}:${result.pod.name}`)
      } else {
        setSelectedId(result.person.id)
      }
      requestAnimationFrame(() => {
        const selector = result.kind === 'pod'
          ? `[data-person-id="pod:${result.pod.managerId}:${result.pod.name}"]`
          : `[data-person-id="${result.person.id}"]`
        const el = document.querySelector(selector)
        el?.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' })
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
      if (matches[highlighted]) selectResult(matches[highlighted])
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
        placeholder="Search… (⌘K)"
        title="Search (⌘K)"
        value={query}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        onFocus={() => { if (query.trim()) setOpen(true) }}
        aria-label="Search"
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
            matches.map((result, i) => {
              const key = result.kind === 'pod' ? `pod-${result.pod.id}` : result.person.id
              const name = result.kind === 'pod' ? result.pod.name : result.person.name
              const meta = result.kind === 'pod'
                ? `Pod · ${result.pod.team}`
                : [result.person.role, result.person.team].filter(Boolean).join(' · ')
              return (
              <li
                key={key}
                className={`${styles.result} ${i === highlighted ? styles.resultHighlighted : ''}`}
                role="option"
                aria-selected={i === highlighted}
                onMouseEnter={() => setHighlighted(i)}
                onMouseDown={(e) => {
                  e.preventDefault() // prevent blur before click
                  selectResult(result)
                }}
              >
                <span className={styles.name}>{name}</span>
                <span className={styles.meta}>
                  {meta}
                </span>
              </li>
              )
            })
          )}
        </ul>
      )}
    </div>
  )
}
