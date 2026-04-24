import { createContext, useContext, useState, useCallback, useEffect, useMemo, type ReactNode } from 'react'
import type { OrgNode, Pod } from '../api/types'
import type { NodeChange } from '../hooks/useOrgDiff'
import { useOrgData, useOrgMutations, useUI, useSelection } from './OrgContext'
import { useOrgDiff } from '../hooks/useOrgDiff'
import { useManagerSet } from '../hooks/useIsManager'
import { useHeadSubtree } from '../hooks/useHeadSubtree'
import { useFilteredPeople } from '../hooks/useFilteredPeople'
import { useSortedPeople } from '../hooks/useSortedPeople'
import { DEFAULT_STATUS } from '../constants'
import { dirtyToApiPayload } from '../utils/nodeFormUtils'

export interface PeopleContextValue {
  people: OrgNode[]
  ghostPeople: OrgNode[]
  managerSet: Set<string>
  readOnly: boolean
  pods: Pod[]
  showChanges: boolean
}

export interface ChangesContextValue {
  changes: Map<string, NodeChange> | undefined
}

export interface ActionsContextValue {
  handleSelect: (id: string, event?: React.MouseEvent) => void
  handleAddReport: (parentId: string) => Promise<void>
  handleAddToTeam: (parentId: string, team: string, podName?: string) => Promise<void>
  handleAddParent: (childId: string) => void
  handleDeletePerson: (personId: string) => void
  handleShowInfo: (personId: string) => void
  handleFocus: (personId: string) => void
  infoPopoverId: string | null
  clearInfoPopover: () => void
  addParentTargetId: string | null
  setAddParentTargetId: (id: string | null) => void
  submitAddParent: (name: string) => void
  deleteTargetId: string | null
  confirmDelete: () => void
  cancelDelete: () => void
  handleInlineEdit: (personId: string, field: string, value: string) => void
  handleCommitEdits: () => void
}

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

export function ViewDataProvider({ children }: { children: ReactNode }) {
  const { original, working, pods, settings } = useOrgData()
  const { add, addParent, remove, update } = useOrgMutations()
  const { dataView, hiddenEmploymentTypes, headPersonId, showPrivate, setHead } = useUI()
  const { toggleSelect, commitEdits, editingPersonId } = useSelection()

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

  // Add-parent popover state
  const [addParentTargetId, setAddParentTargetId] = useState<string | null>(null)

  const handleAddParent = useCallback((childId: string) => {
    setAddParentTargetId(childId)
  }, [])

  const submitAddParent = useCallback((name: string) => {
    if (addParentTargetId && name.trim()) {
      addParent(addParentTargetId, name.trim())
    }
    setAddParentTargetId(null)
  }, [addParentTargetId, addParent])

  // Delete confirmation state
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null)

  const handleDeletePerson = useCallback((personId: string) => {
    setDeleteTargetId(personId)
  }, [])

  const confirmDelete = useCallback(() => {
    if (deleteTargetId) {
      void remove(deleteTargetId)
    }
    setDeleteTargetId(null)
  }, [deleteTargetId, remove])

  const cancelDelete = useCallback(() => {
    setDeleteTargetId(null)
  }, [])

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

  const handleInlineEdit = useCallback((personId: string, field: string, value: string) => {
    void update(personId, { [field]: value })
  }, [update])

  const handleCommitEdits = useCallback(() => {
    const personId = editingPersonId
    if (!personId) return
    const dirty = commitEdits()
    if (!dirty) return
    if (!working.some(p => p.id === personId)) return

    const fields = dirtyToApiPayload(dirty)
    if (Object.keys(fields).length > 0) {
      void update(personId, fields)
    }
  }, [editingPersonId, commitEdits, working, update])

  const peopleValue: PeopleContextValue = useMemo(() => ({
    people, ghostPeople, managerSet, readOnly, pods, showChanges,
  }), [people, ghostPeople, managerSet, readOnly, pods, showChanges])

  const changesValue: ChangesContextValue = useMemo(() => ({
    changes: showChanges ? changes : undefined,
  }), [showChanges, changes])

  const actionsValue: ActionsContextValue = useMemo(() => ({
    handleSelect, handleAddReport, handleAddToTeam, handleAddParent, handleDeletePerson,
    handleShowInfo, handleFocus, infoPopoverId, clearInfoPopover,
    addParentTargetId, setAddParentTargetId, submitAddParent,
    deleteTargetId, confirmDelete, cancelDelete,
    handleInlineEdit,
    handleCommitEdits,
  }), [handleSelect, handleAddReport, handleAddToTeam, handleAddParent, handleDeletePerson,
       handleShowInfo, handleFocus, infoPopoverId, clearInfoPopover,
       addParentTargetId, setAddParentTargetId, submitAddParent,
       deleteTargetId, confirmDelete, cancelDelete, handleInlineEdit, handleCommitEdits])

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
