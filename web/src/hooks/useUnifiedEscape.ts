import { useEffect, useRef } from 'react'

interface UnifiedEscapeActions {
  infoPopoverOpen: boolean
  onCloseInfoPopover: () => void
  cutActive: boolean
  onCancelCut: () => void
  hasSelection: boolean
  onClearSelection: () => void
  hasHead: boolean
  onClearHead: () => void
  enabled: boolean
}

/**
 * Single coordinated escape handler. Evaluates state in priority order
 * and fires only the first matching action per keypress.
 *
 * Priority (highest to lowest):
 * 1. Close info popover
 * 2. Cancel cut
 * 3. Clear selection (close sidebar)
 * 4. Clear head person (show full chart)
 *
 * Component-scoped escapes (inline edit, search bar, AddParentPopover)
 * fire first because they're on focused input elements — this handler
 * skips INPUT/SELECT/TEXTAREA targets.
 */
export function useUnifiedEscape(actions: UnifiedEscapeActions) {
  // Use a ref to avoid re-registering the event listener on every render.
  // The actions object is recreated each render in App.tsx, but the ref
  // always points to the latest version.
  const actionsRef = useRef(actions)
  actionsRef.current = actions

  useEffect(() => {
    if (!actionsRef.current.enabled) return
    const handler = (e: KeyboardEvent) => {
      const a = actionsRef.current
      if (!a.enabled) return
      if (e.key !== 'Escape') return
      const el = e.target as HTMLElement
      const tag = el?.tagName
      if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return
      if (el?.isContentEditable) return

      e.preventDefault()
      if (a.infoPopoverOpen) { a.onCloseInfoPopover(); return }
      if (a.cutActive) { a.onCancelCut(); return }
      if (a.hasSelection) { a.onClearSelection(); return }
      if (a.hasHead) { a.onClearHead(); return }
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [actions.enabled])
}
