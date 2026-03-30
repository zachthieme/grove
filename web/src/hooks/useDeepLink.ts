import { useEffect, useRef } from 'react'
import type { ViewMode } from '../store/orgTypes'
import { useUI, useSelection } from '../store/OrgContext'

const VALID_VIEWS = new Set<ViewMode>(['detail', 'manager', 'table'])
const DEFAULT_VIEW: ViewMode = 'detail'

export function useDeepLink() {
  const { viewMode, headPersonId, setViewMode, setHead } = useUI()
  const { selectedId, setSelectedId } = useSelection()

  const initialized = useRef(false)
  // Track whether state has settled after reading URL params.
  // Prevents the write effect from overwriting the URL with stale
  // pre-URL state before the setters from the read effect propagate.
  const settled = useRef(false)

  // Read URL params on mount
  useEffect(() => {
    if (initialized.current) return
    initialized.current = true

    const params = new URLSearchParams(window.location.search)
    let didApply = false

    const view = params.get('view')
    if (view && VALID_VIEWS.has(view as ViewMode)) {
      setViewMode(view as ViewMode)
      didApply = true
    }

    const selected = params.get('selected')
    if (selected) {
      setSelectedId(selected)
      didApply = true
    }

    const head = params.get('head')
    if (head) {
      setHead(head)
      didApply = true
    }

    // If we didn't apply any URL params, we can write immediately.
    // Otherwise wait for the state to settle on the next render.
    if (!didApply) {
      settled.current = true
    }
  }, [setViewMode, setSelectedId, setHead])

  // Write state to URL when it changes
  useEffect(() => {
    if (!initialized.current) return
    // Skip the first write after reading URL params — state hasn't settled yet
    if (!settled.current) {
      settled.current = true
      return
    }

    const params = new URLSearchParams()
    if (viewMode !== DEFAULT_VIEW) params.set('view', viewMode)
    if (selectedId) params.set('selected', selectedId)
    if (headPersonId) params.set('head', headPersonId)

    const search = params.toString()
    const newUrl = search ? `?${search}` : window.location.pathname
    window.history.replaceState({}, '', newUrl)
  }, [viewMode, selectedId, headPersonId])
}
