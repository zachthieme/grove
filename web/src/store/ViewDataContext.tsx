import { createContext, useContext, useState, useCallback, useEffect, useMemo, type ReactNode } from 'react'
import type { Person, Pod } from '../api/types'
import type { PersonChange } from '../hooks/useOrgDiff'
import { useOrg } from './OrgContext'
import { useOrgDiff } from '../hooks/useOrgDiff'
import { useManagerSet } from '../hooks/useIsManager'
import { useHeadSubtree } from '../hooks/useHeadSubtree'
import { useFilteredPeople } from '../hooks/useFilteredPeople'
import { useSortedPeople } from '../hooks/useSortedPeople'
import { DEFAULT_STATUS } from '../constants'

export interface PeopleContextValue {
  people: Person[]
  ghostPeople: Person[]
  managerSet: Set<string>
  readOnly: boolean
  pods: Pod[]
  showChanges: boolean
}

export interface ChangesContextValue {
  changes: Map<string, PersonChange> | undefined
}

export interface ActionsContextValue {
  handleSelect: (id: string, event?: React.MouseEvent) => void
  handleAddReport: (parentId: string) => Promise<void>
  handleAddToTeam: (parentId: string, team: string, podName?: string) => Promise<void>
  handleDeletePerson: (personId: string) => Promise<void>
  handleShowInfo: (personId: string) => void
  handleFocus: (personId: string) => void
  infoPopoverId: string | null
  clearInfoPopover: () => void
}

// Backward compat — union of all 3
export type ViewDataContextValue = PeopleContextValue & ChangesContextValue & ActionsContextValue

const PeopleCtx = createContext<PeopleContextValue | null>(null)
const ChangesCtx = createContext<ChangesContextValue | null>(null)
const ActionsCtx = createContext<ActionsContextValue | null>(null)

export function usePeople(): PeopleContextValue {
  const ctx = useContext(PeopleCtx)
  if (!ctx) throw new Error('usePeople must be used within a ViewDataProvider')
  return ctx
}

export function useChanges(): ChangesContextValue {
  const ctx = useContext(ChangesCtx)
  if (!ctx) throw new Error('useChanges must be used within a ViewDataProvider')
  return ctx
}

export function useActions(): ActionsContextValue {
  const ctx = useContext(ActionsCtx)
  if (!ctx) throw new Error('useActions must be used within a ViewDataProvider')
  return ctx
}

export function useViewData(): ViewDataContextValue {
  return { ...usePeople(), ...useChanges(), ...useActions() }
}

export function ViewDataProvider({ children }: { children: ReactNode }) {
  const {
    original, working, pods, settings, dataView,
    hiddenEmploymentTypes, headPersonId, showPrivate,
    toggleSelect, add, remove, setHead,
  } = useOrg()

  // Derived data
  const rawPeople = dataView === 'original' ? original : working
  const changes = useOrgDiff(original, working)
  const showChanges = dataView === 'diff'
  const readOnly = dataView === 'original'
  const managerSet = useManagerSet(working)

  const headSubtree = useHeadSubtree(headPersonId, working)
  const { people: filteredPeople, ghostPeople } = useFilteredPeople(
    rawPeople, original, working, hiddenEmploymentTypes, headSubtree, showChanges, showPrivate,
  )
  const people = useSortedPeople(filteredPeople, settings.disciplineOrder)

  // Clear head when head person becomes private and hidden
  useEffect(() => {
    if (!showPrivate && headPersonId) {
      const headPerson = working.find((p) => p.id === headPersonId)
      if (headPerson?.private) {
        setHead(null)
      }
    }
  }, [showPrivate, headPersonId, working, setHead])

  // Actions
  const handleSelect = useCallback((id: string, event?: React.MouseEvent) => {
    const multi = !!(event && (event.shiftKey || event.metaKey || event.ctrlKey))
    toggleSelect(id, multi)
  }, [toggleSelect])

  const handleAddReport = useCallback(async (parentId: string) => {
    const parent = working.find((p) => p.id === parentId)
    if (!parent) return
    await add({
      name: 'New Person',
      role: '',
      discipline: '',
      team: parent.team,
      managerId: parent.id,
      status: DEFAULT_STATUS,
      additionalTeams: [],
    })
  }, [working, add])

  const handleAddToTeam = useCallback(async (parentId: string, team: string, podName?: string) => {
    await add({
      name: 'New Person',
      role: '',
      discipline: '',
      team,
      managerId: parentId,
      status: DEFAULT_STATUS,
      additionalTeams: [],
      pod: podName,
    })
  }, [add])

  const handleDeletePerson = useCallback(async (personId: string) => {
    await remove(personId)
  }, [remove])

  // Info popover
  const [infoPopoverId, setInfoPopoverId] = useState<string | null>(null)

  const handleShowInfo = useCallback((personId: string) => {
    setInfoPopoverId(personId)
  }, [])

  const clearInfoPopover = useCallback(() => {
    setInfoPopoverId(null)
  }, [])

  const handleFocus = useCallback((personId: string) => {
    setHead(personId)
  }, [setHead])

  const peopleValue: PeopleContextValue = useMemo(() => ({
    people, ghostPeople, managerSet, readOnly, pods, showChanges,
  }), [people, ghostPeople, managerSet, readOnly, pods, showChanges])

  const changesValue: ChangesContextValue = useMemo(() => ({
    changes: showChanges ? changes : undefined,
  }), [showChanges, changes])

  const actionsValue: ActionsContextValue = useMemo(() => ({
    handleSelect, handleAddReport, handleAddToTeam, handleDeletePerson,
    handleShowInfo, handleFocus, infoPopoverId, clearInfoPopover,
  }), [handleSelect, handleAddReport, handleAddToTeam, handleDeletePerson,
       handleShowInfo, handleFocus, infoPopoverId, clearInfoPopover])

  return (
    <PeopleCtx.Provider value={peopleValue}>
      <ChangesCtx.Provider value={changesValue}>
        <ActionsCtx.Provider value={actionsValue}>
          {children}
        </ActionsCtx.Provider>
      </ChangesCtx.Provider>
    </PeopleCtx.Provider>
  )
}
