import { useState, useEffect, useCallback, useMemo } from 'react'
import type { Person } from '../api/types'

interface VimNavOptions {
  working: Person[]
  selectedId: string | null
  setSelectedId: (id: string | null) => void
  onDelete?: (id: string) => void
  onAddReport?: (id: string) => void
  onAddParent?: (childId: string) => void
  onReparent?: (personId: string, newManagerId: string) => void
  enabled: boolean
}

/**
 * Vim-style keyboard navigation for the org chart.
 *
 * j/k — next/previous sibling
 * h   — go to parent (manager)
 * l   — go to first child (direct report)
 * i   — inline edit selected node
 * o   — add report under selected
 * O   — add parent above selected (root nodes only)
 * d   — delete selected (sends to recycle bin)
 * x   — cut selected (mark for move)
 * p   — paste (move cut person under selected)
 * /   — focus search
 * Esc — cancel cut / deselect
 */
export function useVimNav({ working, selectedId, setSelectedId, onDelete, onAddReport, onAddParent, onReparent, enabled }: VimNavOptions) {
  const [cutId, setCutId] = useState<string | null>(null)

  // Clear cut if the person was deleted or no longer exists
  useEffect(() => {
    if (cutId && !working.some(p => p.id === cutId)) {
      setCutId(null)
    }
  }, [cutId, working])

  // Build lookup maps once when working changes
  const { childrenOf, parentOf, siblingIds } = useMemo(() => {
    const childrenOf = new Map<string, string[]>()
    const parentOf = new Map<string, string>()

    for (const p of working) {
      if (p.managerId) {
        parentOf.set(p.id, p.managerId)
        if (!childrenOf.has(p.managerId)) childrenOf.set(p.managerId, [])
        childrenOf.get(p.managerId)!.push(p.id)
      }
    }

    const siblingGroups = new Map<string, string[]>()
    for (const p of working) {
      const key = p.managerId || '__root__'
      if (!siblingGroups.has(key)) siblingGroups.set(key, [])
      siblingGroups.get(key)!.push(p.id)
    }

    const siblingIds = new Map<string, string[]>()
    for (const [, group] of siblingGroups) {
      for (const id of group) {
        siblingIds.set(id, group)
      }
    }

    return { childrenOf, parentOf, siblingIds }
  }, [working])

  const navigate = useCallback((key: string) => {
    if (!selectedId) {
      if (working.length > 0) {
        const roots = working.filter(p => !p.managerId)
        setSelectedId(roots.length > 0 ? roots[0].id : working[0].id)
      }
      return
    }

    switch (key) {
      case 'j': {
        const siblings = siblingIds.get(selectedId) ?? []
        const idx = siblings.indexOf(selectedId)
        if (idx >= 0 && idx < siblings.length - 1) {
          setSelectedId(siblings[idx + 1])
        }
        break
      }
      case 'k': {
        const siblings = siblingIds.get(selectedId) ?? []
        const idx = siblings.indexOf(selectedId)
        if (idx > 0) {
          setSelectedId(siblings[idx - 1])
        }
        break
      }
      case 'h': {
        const parent = parentOf.get(selectedId)
        if (parent) setSelectedId(parent)
        break
      }
      case 'l': {
        const children = childrenOf.get(selectedId)
        if (children && children.length > 0) {
          setSelectedId(children[0])
        }
        break
      }
      case 'o': {
        if (onAddReport) onAddReport(selectedId)
        break
      }
      case 'O': {
        const person = working.find(p => p.id === selectedId)
        if (person && !person.managerId && onAddParent) onAddParent(selectedId)
        break
      }
      case 'd': {
        if (onDelete) onDelete(selectedId)
        break
      }
      case 'x': {
        setCutId(selectedId)
        break
      }
      case 'p': {
        if (cutId && cutId !== selectedId && onReparent) {
          onReparent(cutId, selectedId)
          setCutId(null)
        }
        break
      }
    }
  }, [selectedId, working, siblingIds, parentOf, childrenOf, setSelectedId, onDelete, onAddReport, onReparent, cutId])

  useEffect(() => {
    if (!enabled) return
    const handler = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement
      const tag = el?.tagName
      if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return
      if (el?.isContentEditable) return
      if (e.metaKey || e.ctrlKey || e.altKey) return

      if (e.key === 'Escape' && cutId) {
        e.preventDefault()
        setCutId(null)
        return
      }

      if (e.key === '/') {
        e.preventDefault()
        const searchInput = document.querySelector<HTMLInputElement>('[data-tour="search"] input, [placeholder*="Search"]')
        searchInput?.focus()
        return
      }

      if (e.key === 'i' && selectedId) {
        e.preventDefault()
        const node = document.querySelector(`[data-testid="person-${working.find(p => p.id === selectedId)?.name}"]`)
        const nameEl = node?.querySelector('[class*="name"]') as HTMLElement
        nameEl?.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }))
        return
      }

      if (['j', 'k', 'h', 'l', 'o', 'O', 'd', 'x', 'p'].includes(e.key)) {
        e.preventDefault()
        navigate(e.key)
      }
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [enabled, navigate, cutId, selectedId, working])

  return { cutId }
}
