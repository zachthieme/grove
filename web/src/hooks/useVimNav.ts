import { useEffect, useCallback, useMemo } from 'react'
import type { Person } from '../api/types'

interface VimNavOptions {
  working: Person[]
  selectedId: string | null
  setSelectedId: (id: string | null) => void
  onDelete?: (id: string) => void
  onAddReport?: (id: string) => void
  enabled: boolean
}

/**
 * Vim-style keyboard navigation for the org chart.
 *
 * j/k — next/previous sibling
 * h   — go to parent (manager)
 * l   — go to first child (direct report)
 * o   — add report under selected
 * x   — delete selected
 * /   — focus search
 */
export function useVimNav({ working, selectedId, setSelectedId, onDelete, onAddReport, enabled }: VimNavOptions) {
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

    // Sibling groups: people sharing the same managerId (or root siblings with no manager)
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
      // Nothing selected — select first root
      if (working.length > 0) {
        const roots = working.filter(p => !p.managerId)
        setSelectedId(roots.length > 0 ? roots[0].id : working[0].id)
      }
      return
    }

    switch (key) {
      case 'j': { // next sibling
        const siblings = siblingIds.get(selectedId) ?? []
        const idx = siblings.indexOf(selectedId)
        if (idx >= 0 && idx < siblings.length - 1) {
          setSelectedId(siblings[idx + 1])
        }
        break
      }
      case 'k': { // previous sibling
        const siblings = siblingIds.get(selectedId) ?? []
        const idx = siblings.indexOf(selectedId)
        if (idx > 0) {
          setSelectedId(siblings[idx - 1])
        }
        break
      }
      case 'h': { // go to parent
        const parent = parentOf.get(selectedId)
        if (parent) setSelectedId(parent)
        break
      }
      case 'l': { // go to first child
        const children = childrenOf.get(selectedId)
        if (children && children.length > 0) {
          setSelectedId(children[0])
        }
        break
      }
      case 'o': { // add report
        if (onAddReport) onAddReport(selectedId)
        break
      }
      case 'x': { // delete
        if (onDelete) onDelete(selectedId)
        break
      }
    }
  }, [selectedId, working, siblingIds, parentOf, childrenOf, setSelectedId, onDelete, onAddReport])

  useEffect(() => {
    if (!enabled) return
    const handler = (e: KeyboardEvent) => {
      // Skip when focus is in form elements
      const el = e.target as HTMLElement
      const tag = el?.tagName
      if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return
      if (el?.isContentEditable) return
      // Skip when modifier keys are held (let Cmd+Z etc. through)
      if (e.metaKey || e.ctrlKey || e.altKey) return

      if (e.key === '/') {
        e.preventDefault()
        // Focus search bar
        const searchInput = document.querySelector<HTMLInputElement>('[data-tour="search"] input, [placeholder*="Search"]')
        searchInput?.focus()
        return
      }

      if (e.key === 'i' && selectedId) {
        e.preventDefault()
        // Trigger inline edit on the selected person's name
        const node = document.querySelector(`[data-testid="person-${working.find(p => p.id === selectedId)?.name}"]`)
        const nameEl = node?.querySelector('[class*="name"]') as HTMLElement
        nameEl?.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }))
        return
      }

      if (['j', 'k', 'h', 'l', 'o', 'x'].includes(e.key)) {
        e.preventDefault()
        navigate(e.key)
      }
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [enabled, navigate])
}
