import { createContext, useContext, useEffect, useRef, type ReactNode } from 'react'
import { OrgDataProvider, OrgDataStateContext, OrgMutationsContext, useOrgData as useOrgDataDirect } from './OrgDataContext'
import { UIProvider, UIContext } from './UIContext'
import { SelectionProvider, SelectionContext, useSelection as useSelectionDirect } from './SelectionContext'
import type { OrgDataStateValue, OrgMutationsValue, UIContextValue, SelectionContextValue } from './orgTypes'

interface OrgOverrideValue extends OrgDataStateValue, OrgMutationsValue, UIContextValue, SelectionContextValue {}
const OrgOverrideContext = createContext<OrgOverrideValue | null>(null)

/** Test-only provider: bypasses real sub-contexts, supplies all context values directly. */
export function OrgOverrideProvider({ value, children }: { value: OrgOverrideValue; children: ReactNode }) {
  return <OrgOverrideContext.Provider value={value}>{children}</OrgOverrideContext.Provider>
}

/** Prunes selectedIds that no longer exist in working (e.g. after deletion). */
function SelectionPruner() {
  const { working } = useOrgDataDirect()
  const { selectedIds, batchSelect, clearSelection } = useSelectionDirect()
  const selectedIdsRef = useRef(selectedIds)
  selectedIdsRef.current = selectedIds

  useEffect(() => {
    const current = selectedIdsRef.current
    if (current.size === 0) return
    const workingIds = new Set(working.map(p => p.id))
    let needsPrune = false
    for (const id of current) {
      if (!workingIds.has(id)) { needsPrune = true; break }
    }
    if (!needsPrune) return
    const pruned = new Set([...current].filter(id => workingIds.has(id)))
    if (pruned.size === 0) {
      clearSelection()
    } else {
      batchSelect(pruned)
    }
  }, [working, batchSelect, clearSelection])

  return null
}

export function OrgProvider({ children }: { children: ReactNode }) {
  return (
    <UIProvider>
      <SelectionProvider>
        <OrgDataProvider>
          <SelectionPruner />
          {children}
        </OrgDataProvider>
      </SelectionProvider>
    </UIProvider>
  )
}

/**
 * Granular hook: OrgData state (read-only fields).
 * Falls back to OrgOverrideContext (test provider) when no OrgDataProvider is present.
 */
export function useOrgData(): OrgDataStateValue {
  const override = useContext(OrgOverrideContext)
  const real = useContext(OrgDataStateContext)
  if (real) return real
  if (override) return override
  throw new Error('useOrgData must be used within an OrgDataProvider or OrgOverrideProvider')
}

/**
 * Granular hook: OrgData mutation functions.
 * Falls back to OrgOverrideContext (test provider) when no OrgDataProvider is present.
 */
export function useOrgMutations(): OrgMutationsValue {
  const override = useContext(OrgOverrideContext)
  const real = useContext(OrgMutationsContext)
  if (real) return real
  if (override) return override
  throw new Error('useOrgMutations must be used within an OrgDataProvider or OrgOverrideProvider')
}

/** Granular hook: UI state and actions. */
export function useUI(): UIContextValue {
  const override = useContext(OrgOverrideContext)
  const real = useContext(UIContext)
  if (real) return real
  if (override) return override
  throw new Error('useUI must be used within a UIProvider or OrgOverrideProvider')
}

/** Granular hook: Selection state and actions. */
export function useSelection(): SelectionContextValue {
  const override = useContext(OrgOverrideContext)
  const real = useContext(SelectionContext)
  if (real) return real
  if (override) return override
  throw new Error('useSelection must be used within a SelectionProvider or OrgOverrideProvider')
}
