import { createContext, useContext, useState, useCallback, useEffect, useMemo, type ReactNode } from 'react'
import type { Person, Pod } from '../api/types'
import type { PersonChange } from '../hooks/useOrgDiff'
import type { ColumnDef } from '../views/tableColumns'
import { useOrg } from './OrgContext'
import { useOrgDiff } from '../hooks/useOrgDiff'
import { useManagerSet } from '../hooks/useIsManager'
import { useHeadSubtree } from '../hooks/useHeadSubtree'
import { useFilteredPeople } from '../hooks/useFilteredPeople'
import { useSortedPeople } from '../hooks/useSortedPeople'
import { buildExtraColumns } from '../views/tableColumns'
import { DEFAULT_STATUS } from '../constants'

export interface ViewDataContextValue {
  // Derived data
  people: Person[]
  ghostPeople: Person[]
  changes: Map<string, PersonChange> | undefined
  showChanges: boolean
  managerSet: Set<string>
  readOnly: boolean
  pods: Pod[]

  // Actions
  handleSelect: (id: string, event?: React.MouseEvent) => void
  handleAddReport: (parentId: string) => Promise<void>
  handleAddToTeam: (parentId: string, team: string, podName?: string) => Promise<void>
  handleDeletePerson: (personId: string) => Promise<void>
  handleShowInfo: (personId: string) => void
  handleFocus: (personId: string) => void

  // Info popover
  infoPopoverId: string | null
  clearInfoPopover: () => void

  // Column configuration
  extraColumns: ColumnDef[]
  visibleColumns: Set<string>
  toggleColumnVisibility: (key: string) => void
}

const ViewDataContext = createContext<ViewDataContextValue | null>(null)

export function useViewData(): ViewDataContextValue {
  const ctx = useContext(ViewDataContext)
  if (!ctx) throw new Error('useViewData must be used within a ViewDataProvider')
  return ctx
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

  // Column configuration
  const extraColumns = useMemo(() => buildExtraColumns(working), [working])

  const [visibleColumns, setVisibleColumns] = useState<Set<string>>(() => new Set())

  // Initialize visible columns when extra columns change
  useEffect(() => {
    if (extraColumns.length > 0) {
      setVisibleColumns((prev) => {
        const next = new Set(prev)
        for (const col of extraColumns) {
          if (!next.has(col.key)) next.add(col.key)
        }
        return next
      })
    }
  }, [extraColumns])

  const toggleColumnVisibility = useCallback((key: string) => {
    setVisibleColumns((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }, [])

  const value: ViewDataContextValue = useMemo(() => ({
    people,
    ghostPeople,
    changes: showChanges ? changes : undefined,
    showChanges,
    managerSet,
    readOnly,
    pods,
    handleSelect,
    handleAddReport,
    handleAddToTeam,
    handleDeletePerson,
    handleShowInfo,
    handleFocus,
    infoPopoverId,
    clearInfoPopover,
    extraColumns,
    visibleColumns,
    toggleColumnVisibility,
  }), [
    people, ghostPeople, changes, showChanges, managerSet, readOnly, pods,
    handleSelect, handleAddReport, handleAddToTeam, handleDeletePerson,
    handleShowInfo, handleFocus, infoPopoverId, clearInfoPopover,
    extraColumns, visibleColumns, toggleColumnVisibility,
  ])

  return <ViewDataContext.Provider value={value}>{children}</ViewDataContext.Provider>
}
