import { useEffect, useRef } from 'react'
import type { ViewMode } from '../store/orgTypes'

const VALID_VIEWS = new Set<ViewMode>(['detail', 'manager', 'table'])
const DEFAULT_VIEW: ViewMode = 'detail'

interface DeepLinkProps {
  viewMode: ViewMode
  selectedId: string | null
  headPersonId: string | null
  setViewMode: (mode: ViewMode) => void
  setSelectedId: (id: string | null) => void
  setHead: (id: string | null) => void
}

export function useDeepLink({
  viewMode, selectedId, headPersonId,
  setViewMode, setSelectedId, setHead,
}: DeepLinkProps) {
  const initialized = useRef(false)

  // Read URL params on mount
  useEffect(() => {
    if (initialized.current) return
    initialized.current = true

    const params = new URLSearchParams(window.location.search)

    const view = params.get('view')
    if (view && VALID_VIEWS.has(view as ViewMode)) {
      setViewMode(view as ViewMode)
    }

    const selected = params.get('selected')
    if (selected) {
      setSelectedId(selected)
    }

    const head = params.get('head')
    if (head) {
      setHead(head)
    }
  }, [setViewMode, setSelectedId, setHead])

  // Write state to URL when it changes
  useEffect(() => {
    if (!initialized.current) return

    const params = new URLSearchParams()
    if (viewMode !== DEFAULT_VIEW) params.set('view', viewMode)
    if (selectedId) params.set('selected', selectedId)
    if (headPersonId) params.set('head', headPersonId)

    const search = params.toString()
    const newUrl = search ? `?${search}` : window.location.pathname
    window.history.replaceState({}, '', newUrl)
  }, [viewMode, selectedId, headPersonId])
}
