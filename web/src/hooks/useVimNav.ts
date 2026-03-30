import { useState, useEffect, useCallback } from 'react'
import type { Person } from '../api/types'
import { findSpatialNeighbor } from './useSpatialNav'

interface VimNavOptions {
  working: Person[]
  selectedId: string | null
  setSelectedId: (id: string | null) => void
  onDelete?: (id: string) => void
  onAddReport?: (id: string) => void
  onAddParent?: (childId: string) => void
  onReparent?: (personId: string, newManagerId: string) => void
  onSidebarEdit?: () => void
  enabled: boolean
}

/**
 * Vim-style keyboard navigation for the org chart.
 *
 * j/k — move down/up spatially
 * h   — move left spatially
 * l   — move right spatially
 * i/I — enter edit mode (sidebar)
 * o   — add report under selected
 * O   — add parent above selected
 * d   — delete selected (sends to recycle bin)
 * x   — cut selected (mark for move)
 * p   — paste (move cut person under selected)
 * /   — focus search
 * Esc — cancel cut / deselect
 */
export function useVimNav({ working, selectedId, setSelectedId, onDelete, onAddReport, onAddParent, onReparent, onSidebarEdit, enabled }: VimNavOptions) {
  const [cutId, setCutId] = useState<string | null>(null)
  const cancelCut = useCallback(() => setCutId(null), [])

  // Clear cut if the person was deleted or no longer exists
  useEffect(() => {
    if (cutId && !working.some(p => p.id === cutId)) {
      setCutId(null)
    }
  }, [cutId, working])

  const navigateSpatial = useCallback((direction: 'h' | 'j' | 'k' | 'l') => {
    if (!selectedId) {
      const firstNode = document.querySelector<HTMLElement>('[data-person-id]')
      if (firstNode) {
        const id = firstNode.getAttribute('data-person-id')
        if (id) setSelectedId(id)
      }
      return
    }

    const nodeEls = document.querySelectorAll<HTMLElement>('[data-person-id]')
    const rects = new Map<string, DOMRect>()
    nodeEls.forEach(el => {
      const id = el.getAttribute('data-person-id')
      if (id) rects.set(id, el.getBoundingClientRect())
    })

    const targetId = findSpatialNeighbor(selectedId, rects, direction)
    if (targetId) {
      setSelectedId(targetId)
      const targetEl = document.querySelector(`[data-person-id="${targetId}"]`)
      targetEl?.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' })
    }
  }, [selectedId, setSelectedId])

  const navigate = useCallback((key: string) => {
    if (!selectedId) return

    switch (key) {
      case 'o': {
        if (onAddReport) onAddReport(selectedId)
        break
      }
      case 'O': {
        if (onAddParent) onAddParent(selectedId)
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
  }, [selectedId, onDelete, onAddReport, onAddParent, onReparent, cutId])

  useEffect(() => {
    if (!enabled) return
    const handler = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement
      const tag = el?.tagName
      if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return
      if (el?.isContentEditable) return
      if (e.metaKey || e.ctrlKey || e.altKey) return

      if (e.key === '/') {
        e.preventDefault()
        const searchInput = document.querySelector<HTMLInputElement>('[data-tour="search"] input, [placeholder*="Search"]')
        searchInput?.focus()
        return
      }

      if ((e.key === 'i' || e.key === 'I') && selectedId) {
        e.preventDefault()
        onSidebarEdit?.()
        return
      }

      if (['h', 'j', 'k', 'l'].includes(e.key)) {
        e.preventDefault()
        navigateSpatial(e.key as 'h' | 'j' | 'k' | 'l')
        if (document.activeElement instanceof HTMLElement) {
          document.activeElement.blur()
        }
        return
      }

      if (['o', 'O', 'd', 'x', 'p'].includes(e.key)) {
        e.preventDefault()
        navigate(e.key)
        if (document.activeElement instanceof HTMLElement) {
          document.activeElement.blur()
        }
      }
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [enabled, navigate, navigateSpatial, selectedId])

  return { cutId, cancelCut }
}
